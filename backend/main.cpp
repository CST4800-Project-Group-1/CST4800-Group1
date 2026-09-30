#include <iostream>
#include <string>

#include "catalog/parts_catalog.h"

int main(int argc, char* argv[]) {
    const bool json = argc == 2 && std::string(argv[1]) == "--catalog-json";
    if (argc > 1 && !json) {
        std::cerr << "Usage: " << argv[0] << " [--catalog-json]" << std::endl;
        return 2;
    }
    const auto parts = catalog::loadSampleCatalog();
    const auto errors = catalog::validateSampleCatalog(parts);
    if (!errors.empty()) {
        for (const auto& error : errors) std::cerr << error << std::endl;
        return 1;
    }
    if (json) {
        catalog::writeCatalogJson(std::cout, parts);
    } else {
        std::cout << "PC Part Picker backend is running!" << std::endl;
        std::cout << "Validated " << parts.size() << " sample parts." << std::endl;
        for (int i = 0; i < 7; ++i) {
            const auto category = static_cast<catalog::Category>(i);
            int count = 0;
            for (const auto& part : parts) if (part.category == category) ++count;
            std::cout << catalog::categoryName(category) << ": " << count << std::endl;
        }
    }
    return 0;
}
