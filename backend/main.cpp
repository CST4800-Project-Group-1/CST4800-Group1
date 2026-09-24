#include <iostream>
#include <fstream>
#include <string>
#include <sstream>

std::string loadCatalog() {
    std::ifstream file("parts_catalog.json");
    if (file.is_open()) {
        std::stringstream buffer;
        buffer << file.rdbuf();
        return buffer.str();
    }
    
    // Fallback if file isn't in working directory
    return R"({
      "cpu": [{"id": "cpu-1", "name": "AMD Ryzen 7 7800X3D", "socket": "AM5", "tdpWatts": 120}],
      "motherboard": [{"id": "mobo-1", "name": "MSI MAG B650 TOMAHAWK WIFI", "socket": "AM5", "ramType": "DDR5"}],
      "memory": [{"id": "ram-1", "name": "G.Skill Trident Z5 Neo 32 GB", "ramType": "DDR5", "count": 2, "tdpWatts": 10}],
      "power-supply": [{"id": "psu-1", "name": "Corsair RM750e 750 W", "wattage": 750}]
    })";
}

int main(int argc, char* argv[]) {
    std::string category = "";

    if (argc > 1) {
        category = argv[1];
    } else {
        std::cout << "Enter part category (cpu, motherboard, memory, power-supply): ";
        std::cin >> category;
    }

    std::string catalogJson = loadCatalog();

    if (category == "cpu" || category == "motherboard" || category == "memory" || category == "power-supply") {
        std::cout << "{\"status\": \"success\", \"category\": \"" << category << "\", \"data\": " << catalogJson << "}\n";
    } else {
        std::cout << "{\"status\": \"error\", \"message\": \"Invalid category requested: '" << category << "'\"}\n";
    }

    return 0;
}