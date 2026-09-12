#pragma once
#include <string>
#include <vector>

struct CPU {
    std::string name;
    std::string socket;
    int tdpWatts;
};

struct Motherboard {
    std::string name;
    std::string socket;
    std::string ramType;
};

struct RAM {
    std::string name;
    std::string ramType;
    int count;
    int tdpWatts;
};

struct CompatibilityReport {
    bool isCompatible = true;
    std::vector<std::string> errorMessages;
};

inline CompatibilityReport validateCompatibility(const CPU& cpu, const Motherboard& mobo, const RAM& ram) {
    CompatibilityReport report;

    if (cpu.socket != mobo.socket) {
        report.isCompatible = false;
        report.errorMessages.push_back("CPU socket (" + cpu.socket + ") does not match Motherboard socket (" + mobo.socket + ").");
    }

    if (ram.ramType != mobo.ramType) {
        report.isCompatible = false;
        report.errorMessages.push_back("RAM type (" + ram.ramType + ") does not match Motherboard RAM support (" + mobo.ramType + ").");
    }

    return report;
}