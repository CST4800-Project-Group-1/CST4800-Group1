"""Provider failures and warm/cold request budgets; never contact ZenRows."""
import copy
import io
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError
from unittest.mock import patch

from api import catalog
from api.socket_metadata import extract_socket, utc_time
from api.test_catalog_sockets import NOW, URL, page, part, response


class ProviderBudgetTests(unittest.TestCase):
    def setUp(self):
        self.state = (catalog._PROVIDER_RETRY_AT, catalog._NEXT_FETCH_AT, copy.deepcopy(catalog._CATEGORY_CACHE))
        catalog._PROVIDER_RETRY_AT = catalog._NEXT_FETCH_AT = 0
        catalog._CATEGORY_CACHE.clear()

    def tearDown(self):
        catalog._PROVIDER_RETRY_AT, catalog._NEXT_FETCH_AT, cached = self.state
        catalog._CATEGORY_CACHE.clear()
        catalog._CATEGORY_CACHE.update(cached)

    def test_http_429_does_not_turn_into_a_rendered_listing_retry(self):
        error = HTTPError('https://api.zenrows.com/v1/', 429, 'Too Many Requests', {'Retry-After': '90'}, io.BytesIO(b'limited'))
        with patch('api.catalog.urlopen', side_effect=error) as fetch:
            with self.assertRaises(catalog.ProviderRateLimited) as raised:
                catalog._load_category('cpu', URL, 'test')
        self.assertEqual(raised.exception.retry_after, 90)
        fetch.assert_called_once()

    def test_following_requests_obey_provider_cooldown_without_calling_upstream(self):
        with patch('api.catalog.time.monotonic', return_value=100), \
             patch('api.catalog._fetch_page_uncached', side_effect=catalog.ProviderRateLimited(90)) as fetch:
            for url in ('https://retailer.invalid/one', 'https://retailer.invalid/two'):
                with self.assertRaises(catalog.ProviderRateLimited):
                    catalog._fetch_page(url, 'test')
        fetch.assert_called_once()
        self.assertEqual(catalog._PROVIDER_RETRY_AT, 190)

    def test_provider_calls_are_serialized_even_for_parallel_callers(self):
        active = maximum = 0
        guard = threading.Lock()

        def fetch(*args):
            nonlocal active, maximum
            with guard:
                active += 1
                maximum = max(maximum, active)
            time.sleep(.01)
            with guard:
                active -= 1
            return 'page'

        with patch('api.catalog._fetch_page_uncached', side_effect=fetch):
            with ThreadPoolExecutor(max_workers=3) as pool:
                self.assertEqual(list(pool.map(lambda i: catalog._fetch_page(str(i), 'test'), range(3))), ['page'] * 3)
        self.assertEqual(maximum, 1)

    def test_25_records_never_create_more_than_three_optional_detail_calls(self):
        records = [part() for _ in range(25)]
        with patch('api.catalog._fetch_page', return_value=page()) as fetch:
            catalog._enrich_sockets(records, 'test')
        self.assertEqual(fetch.call_count, catalog.SOCKET_DETAIL_LIMIT)
        self.assertEqual(sum(record['specs']['socket'] is not None for record in records), 3)

    def test_listing_only_api_skips_specs_and_metadata_reuses_the_listing(self):
        with patch.dict('os.environ', {'ZENROWS_API_KEY': 'test'}), \
             patch('api.catalog._parse_category', return_value=[part()]), \
             patch('api.catalog._fetch_page', side_effect=['listing', page()]) as fetch:
            _, listing = response('/api/catalog?category=cpu&metadata=0')
            self.assertEqual(fetch.call_count, 1)
            self.assertIsNone(listing['data']['parts'][0]['specs']['socket'])
            _, enriched = response('/api/catalog?category=cpu')
            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(enriched['data']['parts'][0]['specs']['socket'], 'AM5')
            response('/api/catalog?category=cpu')
            self.assertEqual(fetch.call_count, 2)

    def test_cold_seven_category_listing_load_uses_seven_calls_without_specs(self):
        with patch.dict('os.environ', {'ZENROWS_API_KEY': 'test'}), \
             patch('api.catalog._parse_category', side_effect=lambda html, category: [part(category)]), \
             patch('api.catalog._fetch_page', return_value='listing') as fetch, \
             patch('api.catalog._enrich_sockets') as enrich:
            for category in catalog.CATEGORY_URLS[catalog.CATALOG_SOURCE]:
                headers, _ = response('/api/catalog?category=' + category + '&metadata=0')
                self.assertEqual(headers['status'], 200)
            self.assertEqual(fetch.call_count, 7)
            enrich.assert_not_called()

    def test_shared_cache_lifetime_cannot_exceed_socket_or_catalog_expiry(self):
        record = part()
        record['specs'].update(extract_socket(page(), record, NOW))
        body = {'generatedAt': utc_time(NOW), 'parts': [record]}
        with patch('api.catalog.time.time', return_value=NOW + 100):
            self.assertEqual(catalog._cdn_cache_seconds(body), 3498)
        record['specs']['socketProvenance']['expiresAt'] = utc_time(NOW + 200)
        with patch('api.catalog.time.time', return_value=NOW + 100):
            self.assertEqual(catalog._cdn_cache_seconds(body), 98)
        with patch('api.catalog.time.time', return_value=NOW + 200):
            self.assertEqual(catalog._cdn_cache_seconds(body), 0)
        with patch('api.catalog.time.time', return_value=NOW + 3600):
            self.assertEqual(catalog._cdn_cache_seconds(body), 0)

    def test_success_uses_shared_cache_but_errors_have_no_shared_cache(self):
        body = {'generatedAt': utc_time(NOW), 'parts': [part()]}
        with patch('api.catalog._category_catalog', return_value=body), patch('api.catalog.time.time', return_value=NOW):
            headers, _ = response('/api/catalog?category=cpu')
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['Vercel-CDN-Cache-Control'], 'public, s-maxage=3598')
        with patch('api.catalog._category_catalog', side_effect=catalog.ProviderRateLimited(90)):
            headers, body = response('/api/catalog?category=cpu')
        self.assertEqual(headers['status'], 503)
        self.assertEqual(headers['Vercel-CDN-Cache-Control'], 'no-store')
        self.assertEqual(headers['Retry-After'], '90')
        self.assertEqual(body['retryAfterSeconds'], 90)


if __name__ == '__main__':
    unittest.main()
