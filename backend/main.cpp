#include <iostream>
#include "compatibilityCheck.hpp"
#include "powerEstimate.hpp"

int main() {
    std::cout << "PC Part Picker backend is running!\n\n";

    // Sample System Components
    CPU cpu{"Intel Core i7-13700K", "LGA1700", 125};
    Motherboard mobo{"ASUS ROG Strix Z790", "LGA1700", "DDR5"};
    RAM ram{"Corsair Vengeance", "DDR5", 2, 10};
    GPU gpu{"NVIDIA RTX 4080", 320};
    PSU psu{"Corsair RM750", 750};

    // 1. Run Compatibility Check
    CompatibilityReport compat = validateCompatibility(cpu, mobo, ram);
    std::cout << "=== COMPATIBILITY REPORT ===\n";
    std::cout << "Compatible: " << (compat.isCompatible ? "YES" : "NO") << "\n";
    for (const auto& err : compat.errorMessages) {
        std::cout << "  [ERROR] " << err << "\n";
    }

    // 2. Run Power Estimation
    PowerReport power = calculatePowerEstimate(cpu.tdpWatts, ram.tdpWatts, gpu, psu);
    std::cout << "\n=== POWER ESTIMATION REPORT ===\n";
    std::cout << "Estimated Load: " << power.totalEstimatedWattage << " W\n";
    std::cout << "Recommended PSU: " << power.recommendedPSUWattage << " W\n";
    std::cout << "Status: " << power.psuStatusMessage << "\n";

    return 0;
}