#include "parts_catalog.h"

#include <array>
#include <cmath>
#include <locale>
#include <ostream>
#include <set>
#include <sstream>
#include <type_traits>

namespace catalog {
const char* categoryName(Category value) {
    switch (value) {
        case Category::Cpu: return "cpu";
        case Category::Motherboard: return "motherboard";
        case Category::GraphicsCard: return "graphics_card";
        case Category::Ram: return "ram";
        case Category::Storage: return "storage";
        case Category::PowerSupply: return "power_supply";
        case Category::Case: return "case";
    }
    return "invalid";
}
const char* availabilityName(Availability value) {
    switch (value) {
        case Availability::InStock: return "in_stock";
        case Availability::OutOfStock: return "out_of_stock";
        case Availability::Preorder: return "preorder";
    }
    return "invalid";
}

std::vector<std::string> validateCatalog(const std::vector<Part>& parts) {
    std::vector<std::string> errors;
    std::set<std::string> ids;
    for (const auto& part : parts) {
        auto require = [&](bool valid, const std::string& message) {
            if (!valid) errors.push_back(part.id + ": " + message);
        };
        require(!part.id.empty() && ids.insert(part.id).second, "ID must be nonempty and unique");
        require(!part.name.empty() && !part.manufacturer.empty() && !part.model.empty(), "name, manufacturer and model are required");
        const int category = static_cast<int>(part.category);
        require(category >= 0 && category < 7, "invalid category");
        require(part.priceCents >= 0, "priceCents must be nonnegative");
        require(part.currency == "USD", "this catalog uses USD");
        require(std::string(availabilityName(part.availability)) != "invalid", "invalid availability");
        require(!part.imageUrl.empty(), "imageUrl is required");
        require(part.imageIsPlaceholder ? part.imageUrl.rfind("placeholder:", 0) == 0
            : part.imageUrl.rfind("https://", 0) == 0, "use placeholder: or an HTTPS image URL");
        require(!part.specs.valueless_by_exception(), "specifications are required");
        if (part.specs.valueless_by_exception()) continue;
        require(category >= 0 && static_cast<std::size_t>(category) == part.specs.index(), "category does not match specifications");
        std::visit([&](const auto& s) {
            using T = std::decay_t<decltype(s)>;
            if constexpr (std::is_same_v<T, CpuSpecs>) {
                require(!s.socket.empty(), "socket is required");
                require(s.coreCount > 0 && s.threadCount >= s.coreCount && s.wattageW > 0, "invalid CPU counts or wattage");
                require(std::isfinite(s.baseClockGhz) && std::isfinite(s.boostClockGhz)
                    && s.baseClockGhz > 0 && s.boostClockGhz >= s.baseClockGhz, "invalid CPU clocks");
            } else if constexpr (std::is_same_v<T, MotherboardSpecs>) {
                require(!s.socket.empty() && !s.chipset.empty() && !s.formFactor.empty(), "motherboard socket, chipset and form factor required");
                require((s.memoryType == "DDR4" || s.memoryType == "DDR5") && s.maxMemoryGb > 0, "invalid motherboard memory");
            } else if constexpr (std::is_same_v<T, GraphicsCardSpecs>) {
                require(!s.gpuChipset.empty() && s.vramGb > 0 && s.lengthMm > 0
                    && s.powerConsumptionW > 0 && s.recommendedPsuW >= s.powerConsumptionW, "invalid graphics card specifications");
            } else if constexpr (std::is_same_v<T, RamSpecs>) {
                require((s.memoryType == "DDR4" || s.memoryType == "DDR5") && s.capacityGb > 0
                    && s.speedMtS > 0 && s.moduleCount > 0 && s.capacityGb % s.moduleCount == 0, "invalid RAM specifications");
            } else if constexpr (std::is_same_v<T, StorageSpecs>) {
                require((s.storageType == "SSD" || s.storageType == "HDD") && s.capacityGb > 0
                    && !s.interface.empty() && s.readSpeedMbS > 0 && s.writeSpeedMbS > 0, "invalid storage specifications");
            } else if constexpr (std::is_same_v<T, PowerSupplySpecs>) {
                const std::set<std::string> ratings = {"80 PLUS Bronze", "80 PLUS Silver", "80 PLUS Gold", "80 PLUS Platinum", "80 PLUS Titanium"};
                require(s.wattageW > 0 && ratings.count(s.efficiencyRating) > 0
                    && (s.modularType == "full" || s.modularType == "semi" || s.modularType == "non_modular"), "invalid power supply specifications");
            } else if constexpr (std::is_same_v<T, CaseSpecs>) {
                require(!s.supportedMotherboardSizes.empty() && s.maxGpuLengthMm > 0 && !s.color.empty(), "invalid case specifications");
                for (const auto& size : s.supportedMotherboardSizes)
                    require(size == "ATX" || size == "Micro-ATX" || size == "Mini-ITX" || size == "E-ATX", "invalid supported motherboard size");
            }
        }, part.specs);
    }
    return errors;
}
std::vector<std::string> validateSampleCatalog(const std::vector<Part>& parts) {
    auto errors = validateCatalog(parts);
    std::array<int, 7> counts{};
    for (const auto& part : parts) {
        int category = static_cast<int>(part.category);
        if (category >= 0 && category < 7) ++counts[category];
    }
    for (int i = 0; i < 7; ++i)
        if (counts[i] < 3) errors.push_back(std::string(categoryName(static_cast<Category>(i))) + ": sample catalog requires at least three parts");
    return errors;
}

namespace {
std::string quote(const std::string& value) {
    std::ostringstream out;
    out << '"';
    const char* hex = "0123456789abcdef";
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') out << '\\' << c;
        else if (c < 0x20) out << "\\u00" << hex[c >> 4] << hex[c & 15];
        else out << c;
    }
    out << '"';
    return out.str();
}
class Fields {
    std::ostream& out;
    bool first = true;
public:
    explicit Fields(std::ostream& output) : out(output) {}
    template<class T> void number(const char* key, T value) {
        prefix(key); out << value;
    }
    void string(const char* key, const std::string& value) { prefix(key); out << quote(value); }
    void prefix(const char* key) { if (!first) out << ", "; first = false; out << quote(key) << ": "; }
};
}
void writeCatalogJson(std::ostream& output, const std::vector<Part>& parts) {
    // Use a private stream so caller formatting flags cannot alter the JSON.
    std::ostringstream out;
    out.imbue(std::locale::classic());
    out << "{\n  \"schemaVersion\": 1,\n  \"isSampleData\": true,\n  \"parts\": [\n";
    for (std::size_t i = 0; i < parts.size(); ++i) {
        const auto& p = parts[i];
        out << "    {";
        Fields f(out);
        f.string("id", p.id); f.string("name", p.name); f.string("category", categoryName(p.category));
        f.string("manufacturer", p.manufacturer); f.string("model", p.model);
        f.number("priceCents", p.priceCents); f.string("currency", p.currency);
        f.string("imageUrl", p.imageUrl); f.prefix("imageIsPlaceholder"); out << (p.imageIsPlaceholder ? "true" : "false");
        f.string("availability", availabilityName(p.availability)); f.prefix("specs"); out << '{';
        Fields s(out);
        std::visit([&](const auto& v) {
            using T = std::decay_t<decltype(v)>;
            if constexpr (std::is_same_v<T, CpuSpecs>) {
                s.string("socket", v.socket); s.number("coreCount", v.coreCount); s.number("threadCount", v.threadCount);
                s.number("baseClockGhz", v.baseClockGhz); s.number("boostClockGhz", v.boostClockGhz); s.number("wattageW", v.wattageW);
            } else if constexpr (std::is_same_v<T, MotherboardSpecs>) {
                s.string("socket", v.socket); s.string("chipset", v.chipset); s.string("formFactor", v.formFactor);
                s.string("memoryType", v.memoryType); s.number("maxMemoryGb", v.maxMemoryGb);
            } else if constexpr (std::is_same_v<T, GraphicsCardSpecs>) {
                s.string("gpuChipset", v.gpuChipset); s.number("vramGb", v.vramGb); s.number("recommendedPsuW", v.recommendedPsuW);
                s.number("powerConsumptionW", v.powerConsumptionW); s.number("lengthMm", v.lengthMm);
            } else if constexpr (std::is_same_v<T, RamSpecs>) {
                s.string("memoryType", v.memoryType); s.number("capacityGb", v.capacityGb); s.number("speedMtS", v.speedMtS); s.number("moduleCount", v.moduleCount);
            } else if constexpr (std::is_same_v<T, StorageSpecs>) {
                s.string("storageType", v.storageType); s.number("capacityGb", v.capacityGb); s.string("interface", v.interface);
                s.number("readSpeedMbS", v.readSpeedMbS); s.number("writeSpeedMbS", v.writeSpeedMbS);
            } else if constexpr (std::is_same_v<T, PowerSupplySpecs>) {
                s.number("wattageW", v.wattageW); s.string("efficiencyRating", v.efficiencyRating); s.string("modularType", v.modularType);
            } else {
                s.prefix("supportedMotherboardSizes"); out << '[';
                for (std::size_t j = 0; j < v.supportedMotherboardSizes.size(); ++j) {
                    if (j) out << ", ";
                    out << quote(v.supportedMotherboardSizes[j]);
                }
                out << ']'; s.number("maxGpuLengthMm", v.maxGpuLengthMm); s.string("color", v.color);
            }
        }, p.specs);
        out << "}}" << (i + 1 < parts.size() ? "," : "") << '\n';
    }
    out << "  ]\n}\n";
    output << out.str();
}
} // namespace catalog
