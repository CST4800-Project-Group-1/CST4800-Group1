"""SCRUM-22: exact-product socket evidence; never infer from names or features."""
import copy
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit

SUPPORTED_SOCKETS = frozenset({"AM5", "LGA1700"})
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


def fresh_socket(part, now):
    specs = part.get("specs")
    if not isinstance(specs, dict):
        return False
    socket, evidence = specs.get("socket"), specs.get("socketProvenance")
    if not isinstance(socket, str) or socket not in SUPPORTED_SOCKETS or not isinstance(evidence, dict):
        return False
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
