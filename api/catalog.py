"""Vercel catalog endpoint backed by live B&H listings fetched with ZenRows."""
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit
from urllib.request import Request, urlopen

ZENROWS_ENDPOINT = "https://api.zenrows.com/v1/"
CACHE_SECONDS = 3600
MAX_PRODUCTS_PER_CATEGORY = 25
REQUEST_TIMEOUT_SECONDS = 25

# These public B&H category pages cover the seven categories used by the UI.
# They are listing pages; the importer does not crawl product detail pages.
CATEGORY_URLS = {
    "cpu": "https://www.bhphotovideo.com/c/buy/CPUs/ci/19865",
    "motherboard": "https://www.bhphotovideo.com/c/buy/motherboards/ci/50471",
    "graphics_card": "https://www.bhphotovideo.com/c/buy/Graphic-Cards/ci/6567",
    "ram": "https://www.bhphotovideo.com/c/buy/Computer-Memory/ci/13341",
    "storage": "https://www.bhphotovideo.com/c/buy/internal-ssds/ci/30903",
    "power_supply": "https://www.bhphotovideo.com/c/buy/power-supplies/ci/22357",
    "case": "https://www.bhphotovideo.com/c/buy/computer-cases/ci/22356",
}

_CACHE = {"expires": 0.0, "catalog": None}
_CACHE_LOCK = threading.Lock()
_CATEGORY_CACHE = {}
_CATEGORY_CACHE_LOCK = threading.Lock()

class _Element:
    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def classes(self):
        return self.attrs.get("class", "").split()

    def descendants(self):
        pending = list(reversed(self.children))
        while pending:
            child = pending.pop()
            if isinstance(child, _Element):
                yield child
                pending.extend(reversed(child.children))

    def text(self):
        chunks = []
        for child in self.children:
            if isinstance(child, _Element):
                if child.tag in {"div", "p", "li", "h1", "h2", "h3", "br", "section"}:
                    chunks.append(" ")
                chunks.append(child.text())
                if child.tag in {"div", "p", "li", "h1", "h2", "h3", "br", "section"}:
                    chunks.append(" ")
            else:
                chunks.append(child)
        return re.sub(r"\s+", " ", "".join(chunks)).strip()

class _ProductPageParser(HTMLParser):
    _VOID_TAGS = {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr",
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Element("document", ())
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        element = _Element(tag, attrs)
        self.stack[-1].children.append(element)
        if tag not in self._VOID_TAGS:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(_Element(tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        if data.strip():
            self.stack[-1].children.append(data)

def _class_element(root, prefix):
    for element in root.descendants():
        if any(value.startswith(prefix) for value in element.classes()):
            yield element

def _price_cents(value):
    match = re.search(r"\$\s*([\d,]+(?:\.\d{1,2})?)", value)
    if not match:
        return None
    amount = match.group(1).replace(",", "").replace(" ", "")
    if "." in amount:
        whole, fraction = amount.split(".", 1)
        return int(whole) * 100 + int((fraction + "00")[:2])
    # B&H renders cents in a separate superscript; HTML text becomes e.g. 17999.
    digits = re.sub(r"\D", "", amount)
    if len(digits) > 2:
        return int(digits[:-2]) * 100 + int(digits[-2:])
    return int(digits) * 100

def _manufacturer(name):
    brands = (
        "Cooler Master", "Fractal Design", "PowerColor", "SeaSonic", "be quiet!",
        "Thermaltake", "Gigabyte", "Corsair", "Crucial", "Kingston", "Sapphire",
        "ASUS", "ASRock", "MSI", "NVIDIA", "Intel", "AMD", "PNY", "NZXT",
        "Lian Li", "Western Digital", "Seagate", "Samsung", "SanDisk", "G.SKILL",
    )
    folded_name = name.casefold()
    for brand in brands:
        if folded_name.startswith(brand.casefold()):
            return brand
    return name.split(" ", 1)[0] if name else "Unknown"

def _normalize_availability(text):
    folded = text.casefold()
    if "preorder" in folded or "coming soon" in folded:
        return "preorder"
    if "out of stock" in folded or "unavailable" in folded or "notify when" in folded:
        return "out_of_stock"
    if "in stock" in folded:
        return "in_stock"
    # A listing without stock text is not safe to represent as available.
    return "out_of_stock"

def _part_from_element(element, category):
    children = list(element.descendants())
    title = next(
        (child.text() for child in children if child.tag in ("h2", "h3") and child.text()),
        "",
    )
    if not title:
        return None

    current_price = next(
        (
            child.text()
            for child in children
            if any(value.startswith("price_") for value in child.classes())
        ),
        "",
    )
    cents = _price_cents(current_price)
    if cents is None or cents <= 0:
        return None

    product_url = ""
    for child in children:
        href = child.attrs.get("href", "")
        if href and ("/c/product/" in href or "/c/product/" in urljoin("https://www.bhphotovideo.com", href)):
            candidate = urljoin("https://www.bhphotovideo.com", href)
            if candidate.startswith("https://www.bhphotovideo.com/"):
                product_url = candidate
                break

    sku_text = next(
        (child.text() for child in children if any(value.startswith("sku_") for value in child.classes())),
        "",
    )
    model_match = re.search(r"MFR\s*#\s*([^\s]+)", sku_text, re.IGNORECASE)
    model = model_match.group(1) if model_match else title
    id_source = product_url or sku_text or title
    part_id = "bh-" + re.sub(r"[^a-zA-Z0-9]+", "-", id_source).strip("-").lower()[-72:]

    features = []
    for child in children:
        if child.tag != "li":
            continue
        feature = child.text()
        if 8 <= len(feature) <= 100 and feature not in features:
            features.append(feature)
        if len(features) == 3:
            break

    card_text = element.text()
    images = [child.attrs.get("src") or child.attrs.get("data-src") for child in children if child.tag == "img"]
    image_url = next((item for item in images if item and item.startswith("https://")), "")
    return {
        "id": part_id,
        "name": title,
        "category": category,
        "manufacturer": _manufacturer(title),
        "model": model,
        "priceCents": cents,
        "currency": "USD",
        "imageUrl": image_url or "placeholder:" + category,
        "imageIsPlaceholder": not bool(image_url),
        "availability": _normalize_availability(card_text),
        "specs": {"feature" + str(index + 1): value for index, value in enumerate(features)},
        "source": "B&H Photo",
        "sourceUrl": product_url,
    }

def _parse_category(html, category):
    parser = _ProductPageParser()
    parser.feed(html)
    parts = []
    seen = set()
    for element in _class_element(parser.root, "product_"):
        part = _part_from_element(element, category)
        if not part or part["id"] in seen:
            continue
        seen.add(part["id"])
        parts.append(part)
        if len(parts) >= MAX_PRODUCTS_PER_CATEGORY:
            break
    return parts

def _fetch_page(url, api_key, js_render=False):
    params = {"apikey": api_key, "url": url}
    if js_render:
        params["js_render"] = "true"
        # B&H returns a browser-update shell immediately unless we wait for
        # its client-rendered product cards to appear.
        params["wait_for"] = '[class*="product_"]'
    request = Request(ZENROWS_ENDPOINT + "?" + urlencode(params))
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return response.read().decode("utf-8", "replace")
    except HTTPError as error:
        detail = error.read(512).decode("utf-8", "replace")
        if not js_render and (
            error.code == 429
            or (error.code in (400, 422) and any(
                marker in detail for marker in ("RESP001", "REQS002")
            ))
        ):
            return None
        raise RuntimeError("ZenRows could not fetch a B&H catalog page (HTTP {}).".format(error.code)) from None
    except (TimeoutError, URLError):
        raise RuntimeError("ZenRows request failed or timed out.") from None

def _load_category(category, url, api_key):
    try:
        html = _fetch_page(url, api_key)
        parts = _parse_category(html, category) if html else []
        if not parts:
            html = _fetch_page(url, api_key, js_render=True)
            parts = _parse_category(html, category)
    except RuntimeError as error:
        raise RuntimeError(category + ": " + str(error)) from None
    if not parts:
        raise RuntimeError("No catalog products were parsed for category: " + category)
    return parts


def _category_catalog(category):
    now = time.time()
    cached = _CATEGORY_CACHE.get(category)
    if cached and now < cached["expires"]:
        return cached["catalog"]

    with _CATEGORY_CACHE_LOCK:
        now = time.time()
        cached = _CATEGORY_CACHE.get(category)
        if cached and now < cached["expires"]:
            return cached["catalog"]
        api_key = os.environ.get("ZENROWS_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ZENROWS_API_KEY is not configured.")
        parts = _load_category(category, CATEGORY_URLS[category], api_key)
        catalog = {
            "schemaVersion": 1,
            "isSampleData": False,
            "source": "B&H Photo via ZenRows",
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "parts": parts,
        }
        _CATEGORY_CACHE[category] = {"expires": time.time() + CACHE_SECONDS, "catalog": catalog}
        return catalog


def _build_catalog(api_key):
    def load_category(item):
        category, url = item
        return _load_category(category, url, api_key)

    # Keep requests below typical provider/source burst limits.
    with ThreadPoolExecutor(max_workers=2) as pool:
        result_lists = list(pool.map(load_category, CATEGORY_URLS.items()))
    parts = [part for group in result_lists for part in group]
    return {
        "schemaVersion": 1,
        "isSampleData": False,
        "source": "B&H Photo via ZenRows",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parts": parts,
    }

def _get_catalog():
    now = time.time()
    if _CACHE["catalog"] is not None and now < _CACHE["expires"]:
        return _CACHE["catalog"]
    with _CACHE_LOCK:
        now = time.time()
        if _CACHE["catalog"] is not None and now < _CACHE["expires"]:
            return _CACHE["catalog"]
        api_key = os.environ.get("ZENROWS_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ZENROWS_API_KEY is not configured.")
        catalog = _build_catalog(api_key)
        _CACHE["catalog"] = catalog
        _CACHE["expires"] = time.time() + CACHE_SECONDS
        return catalog

class handler:
    def do_GET(self):
        try:
            category = parse_qs(urlsplit(self.path).query).get("category", [None])[0]
            if category is not None:
                if category not in CATEGORY_URLS:
                    body = {"error": "Unsupported category.", "supported_categories": list(CATEGORY_URLS)}
                    status = 404
                    cache_control = "no-store"
                else:
                    catalog = _category_catalog(category)
                    body = {"status": "success", "data": catalog}
                    status = 200
                    cache_control = "public, s-maxage=3600, stale-while-revalidate=86400"
            else:
                catalog = _get_catalog()
                body = {"status": "success", "data": catalog}
                status = 200
                cache_control = "public, s-maxage=3600, stale-while-revalidate=86400"
        except RuntimeError as error:
            body = {"error": str(error)}
            status = 503
            cache_control = "no-store"
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", cache_control)
        self.end_headers()
        self.wfile.write(payload)
