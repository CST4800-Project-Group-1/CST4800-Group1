#include "../catalog/parts_catalog.h"
#include <cstdlib>
#include <iostream>
#include <limits>
#include <sstream>

void check(bool success, const char* message) {
    if (!success) { std::cerr << message << '\n'; std::exit(1); }
}
int main() {
    const auto seed = catalog::loadSampleCatalog();
    check(seed.size() == 21 && catalog::validateSampleCatalog(seed).empty(), "sample seed failed");
    auto invalid = seed;
    invalid[1].id = invalid[0].id;
    check(!catalog::validateCatalog(invalid).empty(), "duplicate ID accepted");
    invalid = seed; invalid[0].priceCents = -1;
    check(!catalog::validateCatalog(invalid).empty(), "negative price accepted");
    invalid = seed; invalid[0].name.clear();
    check(!catalog::validateCatalog(invalid).empty(), "missing required name accepted");
    invalid = seed; invalid[0].category = static_cast<catalog::Category>(99);
    check(!catalog::validateCatalog(invalid).empty(), "invalid category accepted");
    invalid = seed; invalid[0].category = catalog::Category::Ram;
    check(!catalog::validateCatalog(invalid).empty(), "category/spec mismatch accepted");
    invalid = seed; invalid[0].availability = static_cast<catalog::Availability>(99);
    check(!catalog::validateCatalog(invalid).empty(), "invalid stock status accepted");
    invalid = seed; invalid[0].currency = "";
    check(!catalog::validateCatalog(invalid).empty(), "invalid currency accepted");
    invalid = seed; invalid[0].imageUrl = "";
    check(!catalog::validateCatalog(invalid).empty(), "missing image accepted");
    invalid = seed; std::get<catalog::CpuSpecs>(invalid[0].specs).baseClockGhz = std::numeric_limits<double>::quiet_NaN();
    check(!catalog::validateCatalog(invalid).empty(), "nonfinite clock accepted");
    for (int i = 0; i < 7; ++i) {
        invalid = seed;
        auto& specs = invalid[static_cast<std::size_t>(i * 3)].specs;
        switch (i) {
            case 0: std::get<catalog::CpuSpecs>(specs).coreCount = 0; break;
            case 1: std::get<catalog::MotherboardSpecs>(specs).memoryType = "invalid"; break;
            case 2: std::get<catalog::GraphicsCardSpecs>(specs).lengthMm = 0; break;
            case 3: std::get<catalog::RamSpecs>(specs).moduleCount = 0; break;
            case 4: std::get<catalog::StorageSpecs>(specs).readSpeedMbS = -1; break;
            case 5: std::get<catalog::PowerSupplySpecs>(specs).modularType = "invalid"; break;
            case 6: std::get<catalog::CaseSpecs>(specs).supportedMotherboardSizes.clear(); break;
        }
        check(!catalog::validateCatalog(invalid).empty(), "invalid category-specific spec accepted");
    }
    invalid = seed; invalid.erase(invalid.begin());
    check(catalog::validateCatalog(invalid).empty(), "generic validation incorrectly requires sample counts");
    check(!catalog::validateSampleCatalog(invalid).empty(), "missing sample category record accepted");
    check(!catalog::validateSampleCatalog({}).empty(), "empty sample accepted");
    std::ostringstream json;
    auto escaped = seed; escaped[0].name = "Quote\" slash\\ newline\n";
    catalog::writeCatalogJson(json, escaped);
    check(json.str().find("Quote\\\" slash\\\\ newline\\u000a") != std::string::npos, "JSON escaping failed");
    std::cout << "Catalog validation and JSON escaping checks passed.\n";
}
