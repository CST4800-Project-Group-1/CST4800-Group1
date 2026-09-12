#pragma once
#include <string>

struct GPU {
    std::string name;
    int tdpWatts;
};

struct PSU {
    std::string name;
    int wattage;
};

struct PowerReport {
    int totalEstimatedWattage;
    int recommendedPSUWattage;
    std::string psuStatusMessage;
};

inline PowerReport calculatePowerEstimate(int cpuTdp, int ramTdp, const GPU& gpu, const PSU& psu) {
    PowerReport report;

    // Base system draw for motherboard, storage, and fans (50W baseline)
    int baseWatts = 50;
    report.totalEstimatedWattage = cpuTdp + ramTdp + gpu.tdpWatts + baseWatts;

    // 25% safety overhead buffer
    report.recommendedPSUWattage = static_cast<int>(report.totalEstimatedWattage * 1.25);

    if (psu.wattage >= report.recommendedPSUWattage) {
        report.psuStatusMessage = "Sufficient: Selected PSU (" + std::to_string(psu.wattage) + "W) meets system requirements.";
    } else if (psu.wattage >= report.totalEstimatedWattage) {
        report.psuStatusMessage = "Warning: Selected PSU meets system load but lacks recommended 25% safety buffer.";
    } else {
        report.psuStatusMessage = "Insufficient: Selected PSU (" + std::to_string(psu.wattage) + "W) is below estimated load (" + std::to_string(report.totalEstimatedWattage) + "W).";
    }

    return report;
}