import unittest
from unittest.mock import patch

from api.catalog import _ProductPageParser, _class_element, _price_cents, _price_cents_from_element, _parse_category


class PriceParsingTests(unittest.TestCase):
    def test_direct_lookup_waits_for_price_not_a_fixed_delay(self):
        from api.catalog import _lookup
        html = '<div class="product-price--x">$429.00</div>'
        with patch('api.catalog._fetch_page', return_value=html) as fetch:
            result = _lookup('Newegg', '100-300000078', 'key')
        self.assertEqual(result[0]['priceCents'], 42900)
        self.assertLessEqual(fetch.call_args.kwargs['timeout'], 18)
        self.assertNotIn('wait', fetch.call_args.kwargs['options'])
        self.assertIn('wait_for', fetch.call_args.kwargs['options'])

    def test_repeated_retailer_lookups_reuse_price_result(self):
        from api.catalog import _cached_lookup, _OFFER_CACHE
        _OFFER_CACHE.clear()
        offer = [{'source': 'Amazon', 'priceCents': 42900}]
        with patch('api.catalog._lookup', return_value=offer) as lookup:
            self.assertEqual(_cached_lookup('Amazon', 'cache-test', 'key', 'part'), offer)
            self.assertEqual(_cached_lookup('Amazon', 'cache-test', 'key', 'part'), offer)
            lookup.assert_called_once()
        _OFFER_CACHE.clear()

    def test_direct_price_excludes_financing_and_recommendations(self):
        from api.catalog import _direct_product_offer
        html = '''<div class="price-block-customer-price">$464.77<span>$46477</span></div>
            <div class="price-block-finance-options">$38.74/mo.</div>
            <div class="price-block-customer-price">$229.99</div>'''
        result = _direct_product_offer(html, 'Best Buy', 'model', 'https://www.bestbuy.com/product/card/ABC123')
        self.assertEqual(result['priceCents'], 46477)

    def test_direct_multiple_seller_prices_require_manual_entry(self):
        from api.catalog import _direct_product_offer
        html = '''<div class="product-price--x">$454.93</div>
            <ul class="seller-price"><li>$474.59</li></ul>'''
        result = _direct_product_offer(html, 'Newegg', 'model', 'https://www.newegg.com/p/N82E16814105117')
        self.assertTrue(result['priceIsAmbiguous'])
        self.assertNotIn('priceCents', result)

    def test_duplicate_seller_amounts_are_one_price(self):
        from api.catalog import _direct_product_offer
        html = '<div class="product-price--x">$454.93</div><ul class="seller-price">$454.93</ul>'
        self.assertEqual(_direct_product_offer(html, 'Newegg', 'model', 'url')['priceCents'], 45493)

    def test_amazon_current_price_excludes_list_price(self):
        from api.catalog import _direct_product_offer
        html = '''<div id="corePriceDisplay_desktop_feature_div">
            <span class="a-price priceToPay"><span class="a-offscreen">$429.00</span></span>
            <span class="basisPrice"><span class="a-offscreen">$499.00</span></span></div>'''
        self.assertEqual(_direct_product_offer(html, 'Amazon', 'model', 'url')['priceCents'], 42900)

    def test_w7500_confirmed_links_work_without_model_metadata(self):
        from api.catalog import _confirmed_product_urls
        urls = _confirmed_product_urls('AMD Radeon Pro W7500 Professional Graphics Card',
            'https://www.bhphotovideo.com/c/product/1781099-REG/amd_100_300000078_radeon_pro_w7500_graphic.html')
        self.assertEqual(set(urls), {'Amazon', 'Newegg', 'Best Buy'})
        self.assertEqual(urls['Amazon'], 'https://www.amazon.com/dp/B0CK2DB8NY')
        self.assertIn('/p/N82E16814105117', urls['Newegg'])
        self.assertIn('/product/', urls['Best Buy'])

    def test_amazon_brand_outside_title_and_duplicate_tracking_links(self):
        from api.catalog import _product_link_from_html
        html = '''<div data-component-type="s-search-result"><span>AMD</span>
            <a href="/dp/B000000001?ref=first">Radeon Pro W6400 8GB GDDR6</a></div>
            <div data-component-type="s-search-result"><span>AMD</span>
            <a href="/dp/B000000002?ref=second">Radeon Pro W6400 Graphic Card - 4 GB GDDR6</a>
            <a href="/dp/B000000002?ref=image"><img alt="W6400"></a></div>'''
        result = _product_link_from_html(html, 'Amazon', 'model', 'AMD Radeon Pro W6400 4GB GDDR6')
        self.assertEqual(result['sourceUrl'], 'https://www.amazon.com/dp/B000000002')

    def test_confirmed_links_resolve_when_cached_listing_model_is_missing(self):
        from api.catalog import _confirmed_product_urls
        urls = _confirmed_product_urls('AMD Radeon PRO W6400 Graphics Card', 'https://www.bhphotovideo.com/c/product/1685636-REG/amd_radeon_pro_w6400_graphics.html')
        self.assertEqual(urls['Amazon'], 'https://www.amazon.com/dp/B0GCMFR35P')
        self.assertIn('/product/', urls['Best Buy'])
        self.assertEqual(_confirmed_product_urls('unknown', 'https://other.example/c/product/1685636-REG/amd_radeon_pro_w6400_graphics.html'), {})

    def test_product_link_requires_matching_memory_size_and_generation(self):
        from api.catalog import _product_link_from_html
        html = '''<a href="/dp/B000000001">AMD Radeon Pro W6400 8GB GDDR6</a>
                  <a href="/dp/B000000002">AMD Radeon Pro W6400 4GB GDDR5</a>
                  <a href="/dp/B000000003">AMD Radeon Pro W6400 4GB GDDR6</a>'''
        result = _product_link_from_html(html, 'Amazon', 'model', 'AMD Radeon Pro W6400 4 GB GDDR6')
        self.assertEqual(result['sourceUrl'], 'https://www.amazon.com/dp/B000000003')

    def test_product_link_resolution_rejects_other_models_and_ambiguity(self):
        from api.catalog import _product_link_from_html
        title = 'AMD Radeon Pro W6400 Graphics Card'
        html = '<a href="/product/amd-radeon-pro-w7500/ABC123">AMD Radeon Pro W7500 Graphic Card</a><a href="/product/amd-radeon-pro-w6400/DEF456">AMD - Radeon Pro W6400 Graphic Card - 4 GB GDDR6</a>'
        result = _product_link_from_html(html, 'Best Buy', 'model', title)
        self.assertEqual(result['sourceUrl'], 'https://www.bestbuy.com/product/amd-radeon-pro-w6400/DEF456')
        self.assertIsNone(_product_link_from_html(html + '<a href="/product/another-w6400/GHI789">AMD Radeon Pro W6400</a>', 'Best Buy', 'model', title))

    def test_links_use_selected_retailer_website_and_path_rule(self):
        parts = _parse_category('''<div class="product_card">
            <a href="https://wrong.example/dp/B012345678"><h3>Example CPU</h3></a>
            <a href="/dp/B012345678"><h3>Example CPU</h3></a>
            <span class="price_value">$199.99</span>
            </div>''', 'cpu', source='Amazon')
        self.assertEqual(parts[0]['sourceUrl'], 'https://www.amazon.com/dp/B012345678')
        self.assertEqual(parts[0]['source'], 'Amazon')

    def test_search_url_preserves_options_and_encodes_model(self):
        from api.catalog import _search_url
        from urllib.parse import parse_qs, urlsplit
        url = _search_url('https://www.amazon.com/s?k=CPU&ref=nb_sb_noss', 'Example & CPU')
        self.assertEqual(parse_qs(urlsplit(url).query), {'k': ['Example & CPU'], 'ref': ['nb_sb_noss']})

    def test_merged_offer_lookup_handles_missing_credentials(self):
        from api.catalog import _get_offers
        with patch.dict('os.environ', {'ZENROWS_API_KEY': ''}):
            self.assertEqual(_get_offers('CPU')[0], 503)
        self.assertEqual(_get_offers('')[0], 400)

    def test_merged_offer_lookup_uses_configured_retailers(self):
        from api.catalog import _get_offers
        with patch.dict('os.environ', {'ZENROWS_API_KEY': 'test'}), patch('api.catalog._lookup', return_value=[]) as lookup:
            status, body = _get_offers('Example CPU')
        self.assertEqual((status, body), (200, {'offers': []}))
        self.assertEqual({call.args[0] for call in lookup.call_args_list}, {'Amazon', 'Newegg', 'Best Buy'})

    def test_product_title_link_wins_over_accessory_link(self):
        parts = _parse_category('''<div class="product_card">
            <a href="/c/product/111/accessory.html">Accessory</a>
            <a href="/c/product/222/cpu.html?tracking=1#reviews"><h3>Example CPU</h3></a>
            <span class="price_value">$199.99</span>
            </div>''', 'cpu')
        self.assertEqual(parts[0]['sourceUrl'], 'https://www.bhphotovideo.com/c/product/222/cpu.html')

    def test_whole_dollar_price(self):
        self.assertEqual(_price_cents("$199"), 19900)

    def test_whole_dollar_price_with_thousands_separator(self):
        self.assertEqual(_price_cents("$1,299"), 129900)

    def test_decimal_price(self):
        self.assertEqual(_price_cents("$199.99"), 19999)

    def test_retailer_separates_cents_in_superscript_html(self):
        parser = _ProductPageParser()
        parser.feed(
            '<span class="price__value"><span>$199</span><sup>99</sup></span>'
        )
        price_element = next(_class_element(parser.root, "price_"))
        self.assertEqual(_price_cents_from_element(price_element), 19999)

    def test_retailer_separates_cents_in_fraction_class(self):
        parser = _ProductPageParser()
        parser.feed(
            '<span class="price__value"><span>$1,299</span>'
            '<span class="price__fraction">.99</span></span>'
        )
        price_element = next(_class_element(parser.root, "price_"))
        self.assertEqual(_price_cents_from_element(price_element), 129999)


if __name__ == "__main__":
    unittest.main()
