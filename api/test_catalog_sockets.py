"""Synthetic exact-product pages exercise the API without keys or network calls."""
import copy
import io
import json
import unittest
from unittest.mock import patch

from api import catalog
from api.socket_metadata import extract_socket, fresh_socket, public_catalog

NOW = 1794398400
URL = "https://www.bhphotovideo.com/c/product/123-REG/fixture.html"


def part(category="cpu"):
    return {"id": "fixture", "name": "Fixture AM5 Product", "model": "EXACT-123",
            "category": category, "sourceUrl": URL, "priceCents": 19999, "specs": {"feature1": "AM5"}}


def page(socket="AM5", **updates):
    data = {"@type": "Product", "url": URL, "mpn": "EXACT-123",
            "additionalProperty": {"name": "Specs", "value": [
                {"@type": "PropertyValue", "name": "CPU Socket", "value": socket}]}}
    data.update(updates)
    return '<script type="application/ld+json">' + json.dumps(data) + '</script>'


def response(path):
    handler = object.__new__(catalog.handler)
    handler.path, handler.wfile = path, io.BytesIO()
    headers = {}
    handler.send_response = lambda status: headers.update(status=status)
    handler.send_header = lambda key, value: headers.update({key: value})
    handler.end_headers = lambda: None
    handler.do_GET()
    return headers, json.loads(handler.wfile.getvalue())


class SocketApiTests(unittest.TestCase):
    def setUp(self):
        self.categories, self.cache = copy.deepcopy(catalog._CATEGORY_CACHE), copy.deepcopy(catalog._CACHE)
        catalog._CATEGORY_CACHE.clear()
        catalog._CACHE.update(catalog=None, expires=0)

    def tearDown(self):
        catalog._CATEGORY_CACHE.clear()
        catalog._CATEGORY_CACHE.update(self.categories)
        catalog._CACHE.clear()
        catalog._CACHE.update(self.cache)

    def test_verified_values_and_provenance_for_both_categories(self):
        for category in ("cpu", "motherboard"):
            for value in (" am5 ", " lga1700 "):
                with self.subTest(category=category, value=value):
                    record = part(category)
                    record["specs"].update(extract_socket(page(value), record, NOW))
                    self.assertEqual(record["specs"]["socket"], value.strip().upper())
                    evidence = record["specs"]["socketProvenance"]
                    self.assertEqual(evidence["sourceUrl"], URL)
                    self.assertEqual(evidence["sourceField"], "CPU Socket")
                    self.assertEqual(evidence["rawValue"], value)
                    self.assertEqual(evidence["method"], "explicit_product_spec")
                    self.assertTrue(fresh_socket(record, NOW))
                    self.assertFalse(fresh_socket(record, NOW + 3600))

    def test_missing_unsupported_and_malformed_socket_stay_unknown(self):
        for value in (None, "", "AM4", "AM999", "Socket AM5", {}, ["AM5"], 42):
            self.assertEqual(extract_socket(page(value), part(), NOW), {"socket": None, "socketProvenance": None})

    def test_names_features_and_unrelated_fields_are_not_evidence(self):
        for html in ("<h1>AM5 CPU</h1><li>CPU Socket AM5</li>", page(additionalProperty=[]),
                     page(additionalProperty={"name": "CPU Support", "value": "AM5"}),
                     '<script type="application/ld+json">bad</script>'):
            self.assertIsNone(extract_socket(html, part(), NOW)["socket"])

    def test_product_url_and_exact_identifier_are_required(self):
        for html in (page(url="https://other.invalid/product"), page(url=None),
                     page(mpn="EXACT-123-PLUS"), page(mpn=None), page(**{"@type": 42})):
            self.assertIsNone(extract_socket(html, part(), NOW)["socket"])

    def test_recommendations_cannot_supply_socket_evidence(self):
        related = {"@type": "Product", "url": URL, "mpn": "EXACT-123",
                   "additionalProperty": {"name": "Socket", "value": "AM5"}}
        self.assertIsNone(extract_socket(page(additionalProperty=[], isRelatedTo=related), part(), NOW)["socket"])

    def test_duplicate_agreeing_specs_are_valid_but_conflicts_are_unknown(self):
        for value in ("AM5", "LGA1700", "AM4", None):
            specs = [{"name": "Socket", "value": "AM5"}, {"name": "CPU Socket", "value": value}]
            result = extract_socket(page(additionalProperty=specs), part(), NOW)
            self.assertEqual(result["socket"], "AM5" if value == "AM5" else None)

    def test_graph_and_direct_property_shapes(self):
        product = {"@type": "Product", "url": URL, "model": "EXACT-123",
                   "additionalProperty": {"name": "Socket", "value": "LGA1700"}}
        html = '<script type="application/ld+json">' + json.dumps({"@graph": [product]}) + '</script>'
        self.assertEqual(extract_socket(html, part(), NOW)["socket"], "LGA1700")

    def test_full_manufacturer_model_with_spaces_is_preserved(self):
        html = '''<div class="product_card"><a href="/c/product/123-REG/board.html"><h3>Board</h3></a>
            <div class="sku_value">BH # BOARD • MFR # X870 EAGLE WIFI7</div><span class="price_value">$199.99</span></div>'''
        self.assertEqual(catalog._parse_category(html, "motherboard")[0]["model"], "X870 EAGLE WIFI7")

    def test_non_socket_category_does_not_fetch_specs(self):
        with patch("api.catalog._fetch_page") as fetch:
            catalog._enrich_sockets([part("ram")], "test")
        fetch.assert_not_called()

    def test_missing_untrusted_and_malformed_urls_do_not_fetch(self):
        for url in ("", "https://other.invalid/c/product/123", "https://[bad", "https://user@www.bhphotovideo.com/c/product/123"):
            record = part()
            record["sourceUrl"] = url
            with patch("api.catalog._fetch_page") as fetch:
                catalog._enrich_sockets([record], "test")
            fetch.assert_not_called()
            self.assertIsNone(record["specs"]["socket"])

    def test_detail_failure_clears_previous_evidence_and_preserves_price(self):
        record = part()
        record["specs"].update(extract_socket(page(), record, NOW))
        with patch("api.catalog._fetch_page", side_effect=RuntimeError("failure")):
            catalog._enrich_sockets([record], "test")
        self.assertIsNone(record["specs"]["socket"])
        self.assertIsNone(record["specs"]["socketProvenance"])
        self.assertEqual(record["priceCents"], 19999)

    def test_empty_detail_retries_rendered_page_within_budget(self):
        record = part()
        with patch("api.catalog._fetch_page", side_effect=[None, page()]) as fetch:
            catalog._enrich_sockets([record], "test")
        self.assertEqual(record["specs"]["socket"], "AM5")
        self.assertEqual(fetch.call_args.kwargs["options"]["js_render"], "true")
        self.assertLessEqual(fetch.call_args.kwargs["timeout"], 8)

    def test_exceeded_budget_cannot_establish_compatibility(self):
        record = part()
        with patch("api.catalog.time.monotonic", side_effect=[0, 0, 19, 19]), \
             patch("api.catalog._fetch_page", return_value=page()):
            catalog._enrich_sockets([record], "test")
        self.assertIsNone(record["specs"]["socket"])

    def test_category_api_exposes_verified_socket_and_no_store(self):
        for category in ("cpu", "motherboard"):
            for socket in ("AM5", "LGA1700"):
                catalog._CATEGORY_CACHE.clear()
                with patch.dict("os.environ", {"ZENROWS_API_KEY": "test"}), \
                     patch("api.catalog.time.time", return_value=NOW), \
                     patch("api.catalog._parse_category", return_value=[part(category)]), \
                     patch("api.catalog._fetch_page", side_effect=["listing", page(socket)]):
                    headers, body = response("/api/catalog?category=" + category)
                self.assertEqual(headers["status"], 200)
                self.assertEqual(headers["Cache-Control"], "no-store")
                record = body["data"]["parts"][0]
                self.assertEqual(record["specs"]["socket"], socket)
                self.assertTrue(fresh_socket(record, NOW))

    def test_api_missing_unsupported_or_failed_detail_is_unknown(self):
        for detail in (page("AM4"), page(additionalProperty=[]), RuntimeError("failure")):
            catalog._CATEGORY_CACHE.clear()
            with patch.dict("os.environ", {"ZENROWS_API_KEY": "test"}), \
                 patch("api.catalog._parse_category", return_value=[part()]), \
                 patch("api.catalog._fetch_page", side_effect=["listing", detail]):
                headers, body = response("/api/catalog?category=cpu")
            self.assertEqual(headers["status"], 200)
            self.assertIsNone(body["data"]["parts"][0]["specs"]["socket"])
            self.assertEqual(body["data"]["parts"][0]["priceCents"], 19999)

    def test_expired_evidence_is_removed_from_category_and_full_api(self):
        record = part()
        record["specs"].update(extract_socket(page(), record, NOW))
        cached = {"parts": [record]}
        for path in ("/api/catalog?category=cpu", "/api/catalog"):
            catalog._CATEGORY_CACHE["cpu"] = {"expires": NOW + 7200, "catalog": cached}
            catalog._CACHE.update(expires=NOW + 7200, catalog=cached)
            with patch("api.catalog.time.time", return_value=NOW + 3600):
                headers, body = response(path)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIsNone(body["data"]["parts"][0]["specs"]["socket"])
        self.assertEqual(cached["parts"][0]["specs"]["socket"], "AM5")

    def test_failed_category_or_full_refresh_never_returns_stale_success(self):
        record = part()
        record["specs"].update(extract_socket(page(), record, NOW))
        cached = {"parts": [record]}
        for path in ("/api/catalog?category=cpu", "/api/catalog"):
            catalog._CATEGORY_CACHE["cpu"] = {"expires": NOW + 3600, "catalog": cached}
            catalog._CACHE.update(expires=NOW + 3600, catalog=cached)
            with patch.dict("os.environ", {"ZENROWS_API_KEY": "test"}), \
                 patch("api.catalog.time.time", return_value=NOW + 3601), \
                 patch("api.catalog._fetch_page", side_effect=RuntimeError("failure")):
                headers, body = response(path)
            self.assertEqual(headers["status"], 503)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertNotIn("data", body)

    def test_invalid_provenance_cannot_survive_serialization(self):
        original = part()
        original["specs"].update(extract_socket(page(), original, NOW))
        for field, value in (("sourceUrl", "https://other.invalid/product"), ("sourceField", "Name"),
                             ("rawValue", "LGA1700"), ("method", "inferred"),
                             ("verifiedAt", "bad"), ("verifiedAt", "2026-11-11Z"),
                             ("expiresAt", "2099-01-01T00:00:00Z")):
            record = copy.deepcopy(original)
            record["specs"]["socketProvenance"][field] = value
            public = public_catalog({"parts": [record]}, NOW)
            self.assertIsNone(public["parts"][0]["specs"]["socket"])
        self.assertFalse(fresh_socket(original, NOW - 1))
        for value in ({}, [], None, 42):
            record = copy.deepcopy(original)
            record["specs"]["socket"] = value
            self.assertFalse(fresh_socket(record, NOW))


if __name__ == "__main__":
    unittest.main()
