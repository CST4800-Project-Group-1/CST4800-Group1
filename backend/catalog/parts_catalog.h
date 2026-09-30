#ifndef PARTS_CATALOG_H
#define PARTS_CATALOG_H

#include <iosfwd>
#include <string>
#include <variant>
#include <vector>

namespace catalog {

enum class Category { Cpu, Motherboard, GraphicsCard, Ram, Storage, PowerSupply, Case };
enum class Availability { InStock, OutOfStock, Preorder };

struct CpuSpecs {
    std::string socket;
    int coreCount, threadCount;
    double baseClockGhz, boostClockGhz;
    int wattageW;
};
struct MotherboardSpecs {
    std::string socket, chipset, formFactor, memoryType;
    int maxMemoryGb;
};
struct GraphicsCardSpecs {
    std::string gpuChipset;
    int vramGb, recommendedPsuW, powerConsumptionW, lengthMm;
};
struct RamSpecs {
    std::string memoryType;
    int capacityGb, speedMtS, moduleCount;
};
struct StorageSpecs {
    std::string storageType;
    int capacityGb;
    std::string interface;
    int readSpeedMbS, writeSpeedMbS;
};
struct PowerSupplySpecs {
    int wattageW;
    std::string efficiencyRating, modularType;
};
struct CaseSpecs {
    std::vector<std::string> supportedMotherboardSizes;
    int maxGpuLengthMm;
    std::string color;
};

using Specs = std::variant<CpuSpecs, MotherboardSpecs, GraphicsCardSpecs,
    RamSpecs, StorageSpecs, PowerSupplySpecs, CaseSpecs>;

struct Part {
    std::string id, name;
    Category category;
    std::string manufacturer, model;
    int priceCents; // Integer USD cents; avoids floating-point money rounding.
    std::string currency, imageUrl;
    bool imageIsPlaceholder;
    Availability availability;
    Specs specs;
};

const char* categoryName(Category category);
const char* availabilityName(Availability availability);
std::vector<Part> loadSampleCatalog();
std::vector<std::string> validateCatalog(const std::vector<Part>& parts);
std::vector<std::string> validateSampleCatalog(const std::vector<Part>& parts);
void writeCatalogJson(std::ostream& output, const std::vector<Part>& parts);

} // namespace catalog
#endif
