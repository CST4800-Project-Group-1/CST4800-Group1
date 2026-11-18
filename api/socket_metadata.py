"""SCRUM-22: exact-product socket evidence; never infer from names or features."""
import copy
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit

SUPPORTED_SOCKETS = frozenset({"AM4", "AM5", "LGA1700"})
SOCKET_CATEGORIES = frozenset({"cpu", "motherboard"})
SOCKET_FIELDS = frozenset({"socket", "cpu socket", "processor socket", "socket type"})
SOCKET_TTL_SECONDS = 3600


def normalize_socket(value):
    value = value.strip().upper() if isinstance(value, str) else None
    return value if value in SUPPORTED_SOCKETS else None


def canonical_url(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username
                or parsed.password or parsed.port not in (None, 443)):
            return None
        return urlunsplit(("https", parsed.hostname.lower(), parsed.path.rstrip("/"), "", ""))
    except ValueError:
        return None


def utc_time(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class _ProductData(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.chunks = []
        self.documents = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.active = dict(attrs).get("type", "").lower() == "application/ld+json"
            self.chunks = []

    def handle_data(self, data):
        if self.active:
            self.chunks.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.active:
            try:
                self.documents.append(json.loads("".join(self.chunks)))
            except (ValueError, TypeError):
                pass
            self.active = False


def _nodes(data):
    # Traverse graph nodes only, excluding related-product/offer subtrees.
    if isinstance(data, list):
        for item in data:
            yield from _nodes(item)
    elif isinstance(data, dict):
        yield data
        yield from _nodes(data.get("@graph", []))


def _properties(data):
    if isinstance(data, dict):
        data = [data]
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            if item.get("name") == "Specs" and isinstance(item.get("value"), list):
                yield from (entry for entry in item["value"] if isinstance(entry, dict))
            else:
                yield item


class _VisibleProductText(HTMLParser):
    """Collect visible specification labels without evaluating embedded scripts."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.tokens = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            value = re.sub(r"\s+", " ", data).strip()
            if value:
                self.tokens.append(value)


def _labeled_spec_socket(html, part):
    """B&H specification-table fallback; no names or feature-bullet inference."""
    parser = _VisibleProductText()
    parser.feed(html or "")
    text = " ".join(parser.tokens)
    model = part.get("model")
    if not isinstance(model, str) or not model.strip():
        return None
    compact = lambda value: re.sub(r"\s+", " ", value).strip().casefold()
    # Accept only a page identifying the exact manufacturer part number.
    id_pattern = r"\bmfr\s*#\s*" + re.escape(compact(model)) + r"(?=\s|$)"
    if not re.search(id_pattern, compact(text)):
        return None
    # The socket must appear as an explicitly labeled specification field,
    # not as a marketing bullet, title, chipset name, or descriptive sentence.
    matches = []
    for match in re.finditer(
        r"\b(CPU Socket|Processor Socket|Socket Type)\s*:?\s*(AM4|AM5|LGA1700)\b",
        text, flags=re.I):
        matches.append((normalize_socket(match.group(2)), match.group(1), match.group(2)))
    values = {item[0] for item in matches}
    return matches[0] if len(values) == 1 and None not in values and matches else None


def extract_socket(html, part, verified_at):
    """Require URL and exact MPN/model identity plus a labeled specification."""
    unknown = {"socket": None, "socketProvenance": None}
    url = canonical_url(part.get("sourceUrl"))
    model = part.get("model")
    if (part.get("category") not in SOCKET_CATEGORIES or not url
            or not isinstance(model, str) or not model.strip()):
        return unknown
    parser = _ProductData()
    parser.feed(html or "")
    evidence = []
    for document in parser.documents:
        for product in _nodes(document):
            types = product.get("@type")
            types = [types] if isinstance(types, str) else types
            if not isinstance(types, list) or "Product" not in types:
                continue
            if url not in (canonical_url(product.get("url")), canonical_url(product.get("@id"))):
                continue
            if not any(isinstance(value, str) and value.strip().casefold() == model.strip().casefold()
                       for value in (product.get("mpn"), product.get("model"))):
                continue
            for prop in _properties(product.get("additionalProperty")):
                field = prop.get("name")
                if isinstance(field, str) and field.strip().casefold() in SOCKET_FIELDS:
                    raw = prop.get("value")
                    evidence.append((normalize_socket(raw), field.strip(), raw))
    if not evidence:
        labeled = _labeled_spec_socket(html, part)
        if labeled:
            evidence.append(labeled)
    values = {entry[0] for entry in evidence}
    if len(values) != 1 or None in values:
        return unknown
    socket, field, raw = evidence[0]
    return {"socket": socket, "socketProvenance": {
        "sourceUrl": url, "sourceField": field, "rawValue": raw,
        "verifiedAt": utc_time(verified_at),
        "expiresAt": utc_time(verified_at + SOCKET_TTL_SECONDS),
        "method": "explicit_product_spec",
    }}


# Manually reviewed, exact manufacturer model + B&H product-page pairs.
# These are stable hardware specifications, not live retailer availability.
# Add models only after checking the manufacturer's published specification.
MANUFACTURER_SOCKET_REFERENCES = {
    ("cpu", "100-100001905BOX"): {
        "socket": "AM4",
        "retailerUrl": "https://www.bhphotovideo.com/c/product/2007607-REG/amd_100_100001905box_ryzen_5_5500f_6_core.html",
        "sourceUrl": "https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5500f.html",
        "sourceField": "CPU Socket",
        "reviewedOn": "2026-11-18",
    },
    ("motherboard", "X870 EAGLE WIFI7"): {
        "socket": "AM5",
        "retailerUrl": "https://www.bhphotovideo.com/c/product/1852679-REG/gigabyte_x870_eagle_wifi7_motherboard.html",
        "sourceUrl": "https://www.gigabyte.com/Motherboard/X870-EAGLE-WIFI7-rev-1x/sp",
        "sourceField": "CPU",
        "reviewedOn": "2026-11-18",
    },
}


def manufacturer_reference(category, model, retailer_url):
    """Return only reviewed exact-model facts, with the original manufacturer source."""
    if not isinstance(model, str) or not isinstance(category, str):
        return {"socket": None, "socketProvenance": None}
    item = MANUFACTURER_SOCKET_REFERENCES.get((category, model.strip().upper()))
    if not item or canonical_url(retailer_url) != canonical_url(item["retailerUrl"]):
        return {"socket": None, "socketProvenance": None}
    return {
        "socket": item["socket"],
        "socketProvenance": {
            "method": "manufacturer_spec_reference",
            "sourceUrl": item["sourceUrl"],
            "sourceField": item["sourceField"],
            "rawValue": item["socket"],
            "reviewedOn": item["reviewedOn"],
        },
    }


def fresh_socket(part, now):
    specs = part.get("specs")
    if not isinstance(specs, dict):
        return False
    socket, evidence = specs.get("socket"), specs.get("socketProvenance")
    if not isinstance(socket, str) or socket not in SUPPORTED_SOCKETS or not isinstance(evidence, dict):
        return False
    if evidence.get("method") == "manufacturer_spec_reference":
        reviewed = manufacturer_reference(part.get("category"), part.get("model"), part.get("sourceUrl"))
        return reviewed["socket"] == socket and reviewed["socketProvenance"] == evidence
    if (evidence.get("method") != "explicit_product_spec"
            or not isinstance(evidence.get("sourceField"), str)
            or evidence["sourceField"].strip().casefold() not in SOCKET_FIELDS
            or normalize_socket(evidence.get("rawValue")) != socket
            or not canonical_url(part.get("sourceUrl"))
            or canonical_url(evidence.get("sourceUrl")) != canonical_url(part.get("sourceUrl"))):
        return False
    try:
        times = [evidence.get(key) for key in ("verifiedAt", "expiresAt")]
        if not all(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z", value) for value in times):
            return False
        verified, expires = [datetime.fromisoformat(value[:-1] + "+00:00").timestamp() for value in times]
        return verified <= now < expires and 0 < expires - verified <= SOCKET_TTL_SECONDS
    except (ValueError, TypeError, OverflowError):
        return False


def public_catalog(catalog, now):
    """Remove stale socket evidence at serialization, preserving cached prices."""
    result = copy.deepcopy(catalog)
    for part in result.get("parts", []):
        if part.get("category") in SOCKET_CATEGORIES and not fresh_socket(part, now):
            if not isinstance(part.get("specs"), dict):
                part["specs"] = {}
            part["specs"].update(socket=None, socketProvenance=None)
    return result
