import unittest

from api.catalog import _ProductPageParser, _class_element, _price_cents, _price_cents_from_element


class PriceParsingTests(unittest.TestCase):
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

