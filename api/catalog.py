"""Retailer catalog and exact-model offer endpoints backed by ZenRows.

Add listing URLs to CATEGORY_URLS and an adapter entry to RETAILERS for new stores.
Retailer-specific HTML parsing stays in its adapter; routing and fetching are shared.
"""
import json
import os
import re
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from html import unescape
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from api.socket_metadata import SOCKET_CATEGORIES, canonical_url, extract_socket, public_catalog

ZENROWS_ENDPOINT = "https://api.zenrows.com/v1/"
CACHE_SECONDS = 3600
MAX_PRODUCTS_PER_CATEGORY = 25
REQUEST_TIMEOUT_SECONDS = 25

# Retailer listing pages for the seven categories used by the UI.
# The catalog parser currently supports B&H; offers.py uses the retailer search URLs.
CATEGORY_URLS = {
    "B&H Photo": {
        "cpu": "https://www.bhphotovideo.com/c/buy/CPUs/ci/19865",
        "motherboard": "https://www.bhphotovideo.com/c/buy/motherboards/ci/50471",
        "graphics_card": "https://www.bhphotovideo.com/c/buy/Graphic-Cards/ci/6567",
        "ram": "https://www.bhphotovideo.com/c/buy/Computer-Memory/ci/13341",
        "storage": "https://www.bhphotovideo.com/c/buy/internal-ssds/ci/30903",
        "power_supply": "https://www.bhphotovideo.com/c/buy/power-supplies/ci/22357",
        "case": "https://www.bhphotovideo.com/c/buy/computer-cases/ci/22356",
    },
    "Best Buy": {
        "cpu": "https://www.bestbuy.com/site/searchpage.jsp?st=cpu",
        "motherboard": "https://www.bestbuy.com/site/searchpage.jsp?st=motherboard",
        "graphics_card": "https://www.bestbuy.com/site/searchpage.jsp?st=graphics+card",
        "ram": "https://www.bestbuy.com/site/searchpage.jsp?st=ram",
        "storage": "https://www.bestbuy.com/site/searchpage.jsp?st=ssd",
        "power_supply": "https://www.bestbuy.com/site/searchpage.jsp?st=power+supply",
        "case": "https://www.bestbuy.com/site/searchpage.jsp?st=computer+case",
    },
    "Newegg": {
        "cpu": "https://www.newegg.com/p/pl?d=cpu",
        "motherboard": "https://www.newegg.com/p/pl?d=motherboard",
        "graphics_card": "https://www.newegg.com/p/pl?d=graphics+card",
        "ram": "https://www.newegg.com/p/pl?d=ram",
        "storage": "https://www.newegg.com/p/pl?d=ssd",
        "power_supply": "https://www.newegg.com/p/pl?d=power+supply",
        "case": "https://www.newegg.com/p/pl?d=computer+case",
    },
    "Amazon": {
        "cpu": "https://www.amazon.com/s?k=CPU&ref=nb_sb_noss",
        "motherboard": "https://www.amazon.com/s?k=motherboard",
        "graphics_card": "https://www.amazon.com/s?k=graphics+card",
        "ram": "https://www.amazon.com/s?k=ram",
        "storage": "https://www.amazon.com/s?k=ssd",
        "power_supply": "https://www.amazon.com/s?k=power+supply",
        "case": "https://www.amazon.com/s?k=computer+case",
    },
}


# Parser names are resolved by _load_category. Unsupported catalog adapters are
# explicit: adding URLs alone must not claim that a retailer's prices are parsed.
RETAILERS = {
    "B&H Photo": {"catalog_parser": "bh", "product_path": r"^/c/product/\d+", "fetch_options": {}},
    "Amazon": {"catalog_parser": None, "product_path": r"/(?:dp|gp/product)/[A-Z0-9]{10}(?:/|$)", "fetch_options": {"js_render": "true", "premium_proxy": "true", "proxy_country": "us", "wait_for": ".priceToPay, [data-component-type=s-search-result] a[href*=\"/dp/\"]"}},
    "Newegg": {"catalog_parser": None, "product_path": r"/(?:[^/]+/)?p/[A-Z0-9]{8,}(?:/|$)", "fetch_options": {"js_render": "true", "premium_proxy": "true", "proxy_country": "us", "wait_for": ".product-price--x, .product-price, .item-cell .price-current"}},
    "Best Buy": {"catalog_parser": None, "product_path": r"(?:/site/.+/\d+\.p$|/product/[^/]+/[^/]+)", "fetch_options": {"js_render": "true", "premium_proxy": "true", "proxy_country": "us", "wait_for": ".price-block-customer-price, .priceView-customer-price"}},
}
# Confirmed cross-retailer product mappings, keyed by manufacturer part number.
# Keep explicit mappings when a retailer's rendered search page cannot be resolved.
RETAILERS["Best Buy"]["product_urls"] = {
    "100-300000262": "https://www.bestbuy.com/product/amd-radeon-pro-w6400-graphic-card-4-gb-gddr6-displayport-3-x-displayport-mini-displayport/JXKX9WSL3C/sku/12377761",
}
RETAILERS["Amazon"]["product_urls"] = {
    "100-300000262": "https://www.amazon.com/dp/B0GCMFR35P",
}
# W7500: manufacturer part 100-300000078, 8 GB GDDR6.
RETAILERS["Amazon"]["product_urls"]["100-300000078"] = "https://www.amazon.com/dp/B0CK2DB8NY"
RETAILERS["Newegg"]["product_urls"] = {
    "100-300000078": "https://www.newegg.com/amd-100-300000078-radeon-pro-w7500-8gb-graphics-card/p/N82E16814105117",
}
RETAILERS["Best Buy"]["product_urls"]["100-300000078"] = "https://www.bestbuy.com/product/amd-radeon-pro-w7500-100-300000078-8gb-128-bit-gddr6-pci-express-4-0-x8-graphics-card/JXKX9WS2K9/sku/12253096"
# Verified manufacturer identity for listings that omit MFR metadata.
PRODUCT_MODELS_BY_SOURCE_PATH = {
    ("www.bhphotovideo.com", "/c/product/1781099-REG/amd_100_300000078_radeon_pro_w7500_graphic.html"): "100-300000078",
    ("www.bhphotovideo.com", "/c/product/1685636-REG/amd_radeon_pro_w6400_graphics.html"): "100-300000262",
}


def _confirmed_product_urls(model, source_url=""):
    source = urlsplit(source_url)
    model = PRODUCT_MODELS_BY_SOURCE_PATH.get((source.hostname, source.path), model).strip().upper()
    return {store: config["product_urls"][model]
            for store, config in RETAILERS.items() if model in config.get("product_urls", {})}

CATALOG_SOURCE = os.environ.get("CATALOG_SOURCE", "B&H Photo")


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
    # Without an explicit decimal or structurally separate cents, the number
    # is a whole-dollar price (for example, $199 or $1,299).
    return int(amount) * 100


def _is_separate_cents_element(element):
    classes = " ".join(element.classes()).casefold()
    return element.tag in {"sup", "sub"} or any(
        marker in classes for marker in ("cent", "fraction", "superscript")
    )


def _text_without_separate_cents(element):
    chunks = []
    for child in element.children:
        if isinstance(child, _Element):
            if not _is_separate_cents_element(child):
                chunks.append(_text_without_separate_cents(child))
        else:
            chunks.append(child)
    return "".join(chunks)


def _price_cents_from_element(element):
    cents_elements = [
        child for child in element.descendants()
        if _is_separate_cents_element(child)
        and not any(_is_separate_cents_element(nested) for nested in child.descendants())
    ]
    if cents_elements:
        cents_text = "".join(child.text() for child in cents_elements)
        cents_digits = re.sub(r"\D", "", cents_text)
        whole_cents = _price_cents(_text_without_separate_cents(element))
        if whole_cents is not None and cents_digits:
            return whole_cents + int((cents_digits + "00")[:2])
    return _price_cents(element.text())

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

def _image_url(value, base):
    if not isinstance(value, str) or not value.strip():
        return ""
    try:
        url = urljoin(base, value.strip())
        # Use the image origin supplied by B&H, avoiding its protected resize proxy.
        original = re.search(r"/cdn-cgi/image/[^/]+/(https://static\.bhphoto\.com/[^\s]+)$", url)
        url = original.group(1) if original else url
        parsed = urlsplit(url)
        return url if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password else ""
    except ValueError:
        return ""


def _bh_listing_images(root):
    """B&H supplies lazy card images in listing state, keyed by exact product URL."""
    images = {}
    base = "https://www.bhphotovideo.com/"
    for element in root.descendants():
        try:
            data = json.loads(element.attrs.get("data-data", "null"))
            for key in ("ListingStore", "state", "response", "data", "items"):
                data = data.get(key) if isinstance(data, dict) else None
            if not isinstance(data, list):
                continue
            for item in data:
                if not isinstance(item, dict):
                    continue
                core, image = item.get("core"), item.get("mainImage")
                if not isinstance(core, dict) or not isinstance(image, dict):
                    continue
                details, default = core.get("detailsUrl"), image.get("default")
                if not isinstance(details, str) or not isinstance(default, dict):
                    continue
                product = urlsplit(urljoin(base, details))._replace(query="", fragment="").geturl()
                url = _image_url(default.get("url"), base)
                if url:
                    images[product] = url
        except (ValueError, TypeError):
            continue
    return images


def _part_from_element(element, category, source=None):
    source = source or CATALOG_SOURCE
    listing_url = urlsplit(CATEGORY_URLS[source][category])
    website = listing_url._replace(path="", query="", fragment="").geturl()
    product_path = RETAILERS[source]["product_path"]
    children = list(element.descendants())
    title = next(
        (child.text() for child in children if child.tag in ("h2", "h3") and child.text()),
        "",
    )
    if not title:
        return None

    price_element = next(
        (child for child in children if any(value.startswith("price_") for value in child.classes())),
        None,
    )
    cents = _price_cents_from_element(price_element) if price_element else None
    if cents is None or cents <= 0:
        return None

    product_url = ""
    # Prefer the link attached to this product's title, before accessory/image links.
    title_links = [child for child in children if child.tag == "a" and (
        child.text() == title or any(nested.tag in {"h2", "h3"} and nested.text() == title
                                     for nested in child.descendants())
    )]
    for child in title_links + children:
        href = child.attrs.get("href", "")
        if href:
            candidate = urljoin(website, href)
            parsed_url = urlsplit(candidate)
            if (parsed_url.scheme == "https" and parsed_url.hostname == listing_url.hostname
                    and re.search(product_path, parsed_url.path, re.I)):
                product_url = parsed_url._replace(query="", fragment="").geturl()
                break

    sku_text = next(
        (child.text() for child in children if any(value.startswith("sku_") for value in child.classes())),
        "",
    )
    model_match = re.search(r"MFR\s*#\s*(.+?)\s*$", sku_text, re.IGNORECASE)
    model = model_match.group(1) if model_match else title
    parsed_source = urlsplit(product_url)
    model = PRODUCT_MODELS_BY_SOURCE_PATH.get((parsed_source.hostname, parsed_source.path), model)
    id_source = product_url or sku_text or title
    prefix = "bh" if source == "B&H Photo" else re.sub(r"[^a-z0-9]+", "-", source.lower()).strip("-")
    part_id = prefix + "-" + re.sub(r"[^a-zA-Z0-9]+", "-", id_source).strip("-").lower()[-72:]

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
    images = [_image_url(child.attrs.get("data-src") or child.attrs.get("src"), website)
              for child in children if child.tag == "img"]
    image_url = next((item for item in images if item), "")
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
        "source": source,
        "sourceUrl": product_url,
        "retailerProductUrls": {
            retailer: config["product_urls"][model.upper()]
            for retailer, config in RETAILERS.items()
            if model.upper() in config.get("product_urls", {}) and retailer != source
        },
        "retailerSearchUrls": {
            retailer: urlsplit(urls[category])._replace(query=urlencode({
                key: [model] if key in {"k", "d", "st"} else values
                for key, values in parse_qs(urlsplit(urls[category]).query).items()
            }, doseq=True)).geturl()
            for retailer, urls in CATEGORY_URLS.items()
            if retailer != source and category in urls
        },
    }

def _parse_category(html, category, source=None):
    parser = _ProductPageParser()
    parser.feed(html)
    images = _bh_listing_images(parser.root) if (source or CATALOG_SOURCE) == "B&H Photo" else {}
    parts = []
    seen = set()
    for element in _class_element(parser.root, "product_"):
        part = _part_from_element(element, category, source)
        if not part or part["id"] in seen:
            continue
        if part["sourceUrl"] in images:
            part["imageUrl"] = images[part["sourceUrl"]]
            part["imageIsPlaceholder"] = False
        seen.add(part["id"])
        parts.append(part)
        if len(parts) >= MAX_PRODUCTS_PER_CATEGORY:
            break
    return parts

def _fetch_page(url, api_key, js_render=False, options=None, timeout=None):
    params = {"apikey": api_key, "url": url}
    if js_render:
        params["js_render"] = "true"
        # B&H returns a browser-update shell immediately unless we wait for
        # its client-rendered product cards to appear.
        params["wait_for"] = '[class*="product_"]'
    params.update(options or {})
    request = Request(ZENROWS_ENDPOINT + "?" + urlencode(params))
    try:
        with urlopen(request, timeout=timeout or (20 if options else REQUEST_TIMEOUT_SECONDS)) as response:
            return response.read().decode("utf-8", "replace")
    except HTTPError as error:
        detail = error.read(512).decode("utf-8", "replace")
        if not (js_render or params.get("js_render") == "true") and (
            error.code == 429
            or (error.code in (400, 422) and any(
                marker in detail for marker in ("RESP001", "REQS002")
            ))
        ):
            return None
        raise RuntimeError("ZenRows could not fetch a retailer page (HTTP {}).".format(error.code)) from None
    except (TimeoutError, URLError):
        raise RuntimeError("ZenRows request failed or timed out.") from None

def _enrich_sockets(parts, api_key):
    """Bound socket refresh work; unavailable evidence never removes price records."""
    deadline = time.monotonic() + 18

    def enrich(part):
        if part.get("category") not in SOCKET_CATEGORIES:
            return
        part["specs"].update(socket=None, socketProvenance=None)
        url = canonical_url(part.get("sourceUrl"))
        host = urlsplit(CATEGORY_URLS[CATALOG_SOURCE][part["category"]]).hostname
        if not url or urlsplit(url).hostname != host or not re.search(RETAILERS[CATALOG_SOURCE]["product_path"], urlsplit(url).path, re.I):
            return
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            html = _fetch_page(url, api_key, timeout=min(8, remaining))
            remaining = deadline - time.monotonic()
            if not html and remaining > 0:
                html = _fetch_page(url, api_key, timeout=min(8, remaining), options={
                    "js_render": "true", "wait_for": '[data-selenium="specsItemGroupTableRow"]',
                })
            # If the budget was exceeded, do not establish fresh compatibility.
            if html and time.monotonic() <= deadline:
                part["specs"].update(extract_socket(html, part, time.time()))
        except (RuntimeError, ValueError, TypeError):
            return

    if any(part.get("category") in SOCKET_CATEGORIES for part in parts):
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(enrich, parts))
    return parts


def _load_category(category, url, api_key):
    adapter = RETAILERS.get(CATALOG_SOURCE, {})
    parsers = {"bh": _parse_category}
    parser = parsers.get(adapter.get("catalog_parser"))
    if parser is None:
        raise RuntimeError("Catalog parsing is not configured for " + CATALOG_SOURCE)

    try:
        try:
            html = _fetch_page(url, api_key)
        except RuntimeError:
            # A failed plain response may still have a usable rendered listing.
            html = None
        parts = parser(html, category) if html else []
        if not parts:
            html = _fetch_page(url, api_key, js_render=True)
            parts = parser(html, category) if html else []
    except RuntimeError as error:
        raise RuntimeError(category + ": " + str(error)) from None
    if not parts:
        raise RuntimeError("No catalog products were parsed for category: " + category)
    return _enrich_sockets(parts, api_key)


def _category_catalog(category):
    now = time.time()
    cached = _CATEGORY_CACHE.get(category)
    if cached and now < cached["expires"]:
        return public_catalog(cached["catalog"], now)

    with _CATEGORY_CACHE_LOCK:
        now = time.time()
        cached = _CATEGORY_CACHE.get(category)
        if cached and now < cached["expires"]:
            return public_catalog(cached["catalog"], now)
        api_key = os.environ.get("ZENROWS_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ZENROWS_API_KEY is not configured.")
        parts = _load_category(category, CATEGORY_URLS[CATALOG_SOURCE][category], api_key)
        catalog = {
            "schemaVersion": 1,
            "isSampleData": False,
            "source": CATALOG_SOURCE + " via ZenRows",
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "parts": parts,
        }
        _CATEGORY_CACHE[category] = {"expires": time.time() + CACHE_SECONDS, "catalog": catalog}
        return public_catalog(catalog, time.time())


def _build_catalog(api_key):
    if CATALOG_SOURCE not in CATEGORY_URLS or not RETAILERS.get(CATALOG_SOURCE, {}).get("catalog_parser"):
        raise RuntimeError("Catalog parsing is not configured for " + CATALOG_SOURCE)
    def load_category(item):
        category, url = item
        return _load_category(category, url, api_key)

    # Keep requests below typical provider/source burst limits.
    with ThreadPoolExecutor(max_workers=2) as pool:
        result_lists = list(pool.map(load_category, CATEGORY_URLS[CATALOG_SOURCE].items()))
    parts = [part for group in result_lists for part in group]
    return {
        "schemaVersion": 1,
        "isSampleData": False,
        "source": CATALOG_SOURCE + " via ZenRows",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parts": parts,
    }

def _get_catalog():
    now = time.time()
    if _CACHE["catalog"] is not None and now < _CACHE["expires"]:
        return public_catalog(_CACHE["catalog"], now)
    with _CACHE_LOCK:
        now = time.time()
        if _CACHE["catalog"] is not None and now < _CACHE["expires"]:
            return public_catalog(_CACHE["catalog"], now)
        api_key = os.environ.get("ZENROWS_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ZENROWS_API_KEY is not configured.")
        catalog = _build_catalog(api_key)
        _CACHE["catalog"] = catalog
        _CACHE["expires"] = time.time() + CACHE_SECONDS
        return public_catalog(catalog, time.time())

def _search_url(listing_url, model):
    """Replace the category query with an exact model, preserving other options."""
    parts = urlsplit(listing_url)
    query = [(key, model if key in {"k", "d", "st"} else value)
             for key, value in parse_qsl(parts.query, keep_blank_values=True)]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from _objects(child)

def _product_link_from_html(html, store, model, name):
    """Resolve a unique product link using its title, never the first search hit."""
    parser = _ProductPageParser()
    parser.feed(html)
    ignored = {"graphics", "graphic", "card", "processor", "desktop", "the", "and", "professional"}
    # Normalize 4GB and 4 GB so memory size and generation stay part of matching.
    def normalized_tokens(value):
        value = re.sub(r"(\d)\s*(gb|tb|mb)\b", r"\1 \2", value.casefold())
        return set(re.findall(r"[a-z0-9]+", value))
    tokens = normalized_tokens(name) - ignored
    if not tokens or not any(any(c.isdigit() for c in token) for token in tokens):
        return None
    base = next(iter(CATEGORY_URLS[store].values()))
    domain = urlsplit(base).hostname.removeprefix("www.")
    matches = {}
    parents = {id(child): parent for parent in [parser.root, *parser.root.descendants()]
               for child in parent.children if isinstance(child, _Element)}
    for anchor in parser.root.descendants():
        if anchor.tag != "a" or not anchor.attrs.get("href"):
            continue
        title = anchor.text() or anchor.attrs.get("aria-label") or anchor.attrs.get("title", "")
        title_tokens = normalized_tokens(title)
        # Retailers often put the brand outside the title link. Include only
        # this result card's text, never the whole page or neighboring products.
        container = parents.get(id(anchor))
        while container is not None:
            if (container.attrs.get("data-component-type") == "s-search-result"
                    or any(c in {"item-cell", "sku-item", "product-list-item"}
                           for c in container.classes())):
                title_tokens |= normalized_tokens(" ".join(
                    child.text() for child in container.descendants()
                    if child.tag not in {"script", "style"}
                ))
                break
            container = parents.get(id(container))
        if not tokens.issubset(title_tokens):
            continue
        url = urlsplit(urljoin(base, anchor.attrs["href"]))
        host = url.hostname or ""
        if url.scheme != "https" or not (host == domain or host.endswith("." + domain)):
            continue
        if not re.search(RETAILERS[store]["product_path"], url.path, re.I):
            continue
        canonical = url._replace(query="", fragment="").geturl()
        matches[canonical] = {"source": store, "sourceUrl": canonical,
                              "availability": "Product title matched; confirm model and price at retailer"}
    return next(iter(matches.values())) if len(matches) == 1 else None


def _direct_product_offer(html, store, model, url):
    """Read current-product prices, keeping distinct seller prices ambiguous."""
    from decimal import Decimal, InvalidOperation
    result = {"source": store, "sourceUrl": url,
              "availability": "Confirm current price and availability at retailer"}
    prices = set()
    def add_amount(value):
        try:
            amount = Decimal(str(value).replace("$", "").replace(",", "").strip())
            if amount.is_finite() and amount > 0:
                cents = amount * 100
                if cents == cents.to_integral_value():
                    prices.add(int(cents))
        except (InvalidOperation, ValueError):
            pass
    def add_text(value):
        for amount in re.findall(r"\$\s*([\d,]+\.\d{2})(?!\d)", value):
            add_amount(amount)
    parser = _ProductPageParser()
    parser.feed(html)
    for script in parser.root.descendants():
        if script.tag != "script" or script.attrs.get("type", "").lower() != "application/ld+json":
            continue
        try:
            data = json.loads(script.text())
        except (ValueError, TypeError):
            continue
        for product in _objects(data):
            types = product.get("@type", [])
            if isinstance(types, str):
                types = [types]
            if "Product" not in types:
                continue
            identifiers = [product.get("mpn"), product.get("model")]
            if any(identifiers) and not any(isinstance(v, str) and v.casefold() == model.casefold() for v in identifiers):
                continue
            product_url = product.get("url", "")
            if product_url and urlsplit(product_url).path.rstrip("/") != urlsplit(url).path.rstrip("/") and not any(isinstance(v, str) and v.casefold() == model.casefold() for v in identifiers):
                continue
            if not any(identifiers) and not product_url:
                continue
            offers = product.get("offers", [])
            if isinstance(offers, dict):
                offers = [offers]
            for offer in _objects(offers):
                if offer.get("priceCurrency", "USD") != "USD":
                    continue
                for field in ("price", "lowPrice", "highPrice"):
                    if field in offer:
                        add_amount(offer[field])
                if offer.get("availability"):
                    result["availability"] = str(offer["availability"]).split("/")[-1]
    # Read buy-box fields only; never scan the whole page for dollar amounts.
    primary_seen = False
    for element in parser.root.descendants():
        identity = element.attrs.get("id", "")
        classes = element.classes()
        if store == "Amazon":
            if identity in {"corePriceDisplay_desktop_feature_div", "corePrice_feature_div"} and not primary_seen:
                pay = [child for child in element.descendants() if "priceToPay" in child.classes()]
                for price in pay[:1]:
                    amounts = [child.text() for child in price.descendants() if "a-offscreen" in child.classes()]
                    add_text(" ".join(amounts))
                primary_seen = bool(pay)
            elif identity in {"olp_feature_div", "aod-offer-list"}:
                amounts = [child.text() for child in element.descendants() if "a-offscreen" in child.classes()]
                add_text(" ".join(amounts))
        elif store == "Newegg":
            if any(c in {"product-price", "product-price--x"} for c in classes) and not primary_seen:
                add_text(element.text())
                primary_seen = True
            elif "seller-price" in classes:
                add_text(element.text())
        elif store == "Best Buy":
            if any(c in {"price-block-customer-price", "priceView-customer-price"} for c in classes) and not primary_seen:
                # The first customer-price belongs to the PDP; subsequent blocks
                # are recommendation cards. Its text duplicates split visual digits.
                add_text(element.text())
                primary_seen = True
    # Best Buy explicitly labels the current product's marketplace offer range.
    if store == "Best Buy":
        for element in parser.root.descendants():
            if element.tag not in {"section", "div"}:
                continue
            headings = [child.text() for child in element.descendants() if child.tag in {"h2", "h3"}]
            if any("more options from marketplace sellers" in heading.casefold() for heading in headings):
                text = element.text()
                if len(text) < 1500:
                    add_text(text)
    if len(prices) == 1:
        result["priceCents"] = next(iter(prices))
        result["priceUpdatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    elif len(prices) > 1:
        result["priceIsAmbiguous"] = True
        result["availability"] = "Multiple seller prices; enter the price of your chosen offer"
    else:
        result["availability"] = "Price could not be read; enter the retailer price"
    return result


def _lookup(store, model, key, name=""):
    # A search plus product-page fetch shares one budget instead of two 60s waits.
    deadline = time.monotonic() + 18
    def fetch_retailer(url):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("Retailer lookup exceeded its time budget.")
        return _fetch_page(url, key, options=RETAILERS[store].get("fetch_options"), timeout=remaining)
    confirmed_url = RETAILERS[store].get("product_urls", {}).get(model.upper())
    if confirmed_url:
        try:
            html = fetch_retailer(confirmed_url)
            if html:
                return [_direct_product_offer(html, store, model, confirmed_url)]
        except RuntimeError:
            pass
        return [{"source": store, "sourceUrl": confirmed_url,
                 "availability": "Price lookup unavailable; enter the retailer price"}]
    search = next(iter(CATEGORY_URLS[store].values()))
    domain = urlsplit(search).hostname.removeprefix("www.")
    try:
        html = fetch_retailer(_search_url(search, name or model))
        if not html:
            return []
        results = []
        for block in re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.I | re.S):
            try:
                data = json.loads(unescape(block))
            except (ValueError, TypeError):
                continue
            for product in _objects(data):
                # Match manufacturer part numbers exactly, never approximate names.
                identifiers = [product.get('mpn'), product.get('model')]
                if not any(isinstance(v, str) and v.strip().casefold() == model.casefold() for v in identifiers):
                    continue
                offers = product.get('offers', [])
                if isinstance(offers, dict):
                    offers = [offers]
                for offer in offers:
                    if not isinstance(offer, dict) or offer.get('priceCurrency') != 'USD':
                        continue
                    url = offer.get('url') or product.get('url') or ''
                    host = (urlsplit(url).hostname or '').lower()
                    if urlsplit(url).scheme != 'https' or not (host == domain or host.endswith('.' + domain)):
                        continue
                    if not re.search(RETAILERS[store]['product_path'], urlsplit(url).path, re.I):
                        continue
                    try:
                        cents = round(float(offer['price']) * 100)
                    except (KeyError, ValueError, TypeError):
                        continue
                    if cents <= 0:
                        continue
                    results.append({'source': store, 'sourceUrl': url, 'priceCents': cents,
                                    'priceUpdatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                                    'availability': str(offer.get('availability', 'Unknown')).split('/')[-1]})
        if results:
            if len({offer['priceCents'] for offer in results}) > 1:
                return [{'source': store, 'sourceUrl': results[0]['sourceUrl'],
                         'priceIsAmbiguous': True,
                         'availability': 'Multiple seller prices; enter the price of your chosen offer'}]
            detail = fetch_retailer(results[0]['sourceUrl'])
            return [_direct_product_offer(detail, store, model, results[0]['sourceUrl'])] if detail else []
        link = _product_link_from_html(html, store, model, name or model)
        if link:
            detail = fetch_retailer(link['sourceUrl'])
            return [_direct_product_offer(detail, store, model, link['sourceUrl'])] if detail else [link]
        return []
    except Exception:
        return []


_OFFER_CACHE = {}
_OFFER_CACHE_LOCK = threading.Lock()


def _cached_lookup(store, model, key, name):
    cache_key = (store, model, name)
    with _OFFER_CACHE_LOCK:
        cached = _OFFER_CACHE.get(cache_key)
        if cached and cached["expires"] > time.time():
            future, owner = cached["future"], False
        else:
            future, owner = Future(), True
            _OFFER_CACHE[cache_key] = {"future": future, "expires": time.time() + 120}
        if len(_OFFER_CACHE) > 256:
            for expired in [k for k, v in _OFFER_CACHE.items() if v["expires"] <= time.time()]:
                _OFFER_CACHE.pop(expired, None)
    if owner:
        try:
            result = _lookup(store, model, key, name)
            with _OFFER_CACHE_LOCK:
                _OFFER_CACHE[cache_key]["expires"] = time.time() + (300 if any(
                    offer.get("priceCents") or offer.get("priceIsAmbiguous") for offer in result) else 30)
            future.set_result(result)
        except Exception:
            with _OFFER_CACHE_LOCK:
                _OFFER_CACHE.pop(cache_key, None)
            future.set_result([])
    return future.result()


def _get_offers(model, name="", store=None):
    if not model.strip() or len(model) > 200 or len(name) > 300:
        return 400, {"error": "A manufacturer model is required."}
    key = os.environ.get("ZENROWS_API_KEY", "").strip()
    if not key:
        return 503, {"error": "Retailer price lookups are unavailable."}
    stores = [store for store in CATEGORY_URLS if store in RETAILERS and store != CATALOG_SOURCE]
    if store is not None:
        if store not in stores:
            return 400, {"error": "Unsupported retailer."}
        stores = [store]
    with ThreadPoolExecutor(max_workers=min(3, len(stores))) as pool:
        groups = list(pool.map(lambda retailer: _cached_lookup(retailer, model, key, name), stores))
    return 200, {"offers": [offer for group in groups for offer in group]}

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            query = parse_qs(urlsplit(self.path).query, keep_blank_values=True)
            category = query.get("category", [None])[0]
            if query.get("links", [""])[0] == "1":
                urls = _confirmed_product_urls(query.get("model", [""])[0], query.get("sourceUrl", [""])[0])
                status, body = 200, {"offers": [{"source": store, "sourceUrl": url,
                    "availability": "Matched manufacturer model; confirm current price at retailer"}
                    for store, url in urls.items()]}
                cache_control = "no-store"
            elif "model" in query:
                status, body = _get_offers(query["model"][0], query.get("name", [""])[0], query.get("store", [None])[0])
                cache_control = "public, s-maxage=3600" if status == 200 else "no-store"
            elif category is not None:
                if category not in CATEGORY_URLS.get(CATALOG_SOURCE, {}):
                    body = {"error": "Unsupported category.", "supported_categories": list(CATEGORY_URLS.get(CATALOG_SOURCE, {}))}
                    status = 404
                    cache_control = "no-store"
                else:
                    catalog = _category_catalog(category)
                    body = {"status": "success", "data": catalog}
                    status = 200
                    cache_control = "no-store"
            else:
                catalog = _get_catalog()
                body = {"status": "success", "data": catalog}
                status = 200
                cache_control = "no-store"
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


