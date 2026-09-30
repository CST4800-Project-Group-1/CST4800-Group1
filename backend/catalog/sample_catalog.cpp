#include "parts_catalog.h"

namespace catalog {
std::vector<Part> loadSampleCatalog() {
    // Fictional demo products, prices, inventory and specifications.
    // This native seed is canonical; data/sample_parts.json is its export.
    return {
        {"cpu-001", "DemoCore C6", Category::Cpu, "DemoCore", "C6", 15999, "USD", "placeholder:cpu", true, Availability::InStock, CpuSpecs{"AM5", 6, 12, 3.8, 5.1, 65}},
        {"cpu-002", "DemoCore C8", Category::Cpu, "DemoCore", "C8", 25999, "USD", "placeholder:cpu", true, Availability::InStock, CpuSpecs{"AM5", 8, 16, 4.0, 5.3, 105}},
        {"cpu-003", "ExampleSilicon S6", Category::Cpu, "ExampleSilicon", "S6", 13999, "USD", "placeholder:cpu", true, Availability::OutOfStock, CpuSpecs{"LGA1700", 6, 12, 2.5, 4.4, 65}},
        {"mb-001", "DemoBoard B650 ATX", Category::Motherboard, "DemoBoard", "B650-A", 14999, "USD", "placeholder:motherboard", true, Availability::InStock, MotherboardSpecs{"AM5", "B650", "ATX", "DDR5", 128}},
        {"mb-002", "DemoBoard B650 Micro", Category::Motherboard, "DemoBoard", "B650-M", 11999, "USD", "placeholder:motherboard", true, Availability::InStock, MotherboardSpecs{"AM5", "B650", "Micro-ATX", "DDR5", 128}},
        {"mb-003", "ExampleBoard B760 DDR4", Category::Motherboard, "ExampleBoard", "B760-D4", 10999, "USD", "placeholder:motherboard", true, Availability::Preorder, MotherboardSpecs{"LGA1700", "B760", "ATX", "DDR4", 128}},
        {"gpu-001", "DemoGraphics G8", Category::GraphicsCard, "DemoGraphics", "G8", 24999, "USD", "placeholder:graphics_card", true, Availability::InStock, GraphicsCardSpecs{"DemoGPU G8", 8, 500, 130, 240}},
        {"gpu-002", "DemoGraphics G12", Category::GraphicsCard, "DemoGraphics", "G12", 39999, "USD", "placeholder:graphics_card", true, Availability::InStock, GraphicsCardSpecs{"DemoGPU G12", 12, 650, 220, 285}},
        {"gpu-003", "ExampleGraphics G16", Category::GraphicsCard, "ExampleGraphics", "G16", 59999, "USD", "placeholder:graphics_card", true, Availability::OutOfStock, GraphicsCardSpecs{"ExampleGPU G16", 16, 750, 300, 330}},
        {"ram-001", "DemoMemory 16GB DDR4 Kit", Category::Ram, "DemoMemory", "D4-16-3200", 3999, "USD", "placeholder:ram", true, Availability::InStock, RamSpecs{"DDR4", 16, 3200, 2}},
        {"ram-002", "DemoMemory 32GB DDR5 Kit", Category::Ram, "DemoMemory", "D5-32-6000", 8999, "USD", "placeholder:ram", true, Availability::InStock, RamSpecs{"DDR5", 32, 6000, 2}},
        {"ram-003", "ExampleMemory 64GB DDR5 Kit", Category::Ram, "ExampleMemory", "D5-64-5600", 16999, "USD", "placeholder:ram", true, Availability::Preorder, RamSpecs{"DDR5", 64, 5600, 2}},
        {"storage-001", "DemoDrive 1TB NVMe", Category::Storage, "DemoDrive", "N4-1000", 6999, "USD", "placeholder:storage", true, Availability::InStock, StorageSpecs{"SSD", 1000, "PCIe 4.0 x4 NVMe", 5000, 4200}},
        {"storage-002", "DemoDrive 2TB SATA SSD", Category::Storage, "DemoDrive", "S-2000", 10999, "USD", "placeholder:storage", true, Availability::InStock, StorageSpecs{"SSD", 2000, "SATA 6 Gb/s", 550, 500}},
        {"storage-003", "ExampleDrive 4TB HDD", Category::Storage, "ExampleDrive", "H-4000", 8999, "USD", "placeholder:storage", true, Availability::InStock, StorageSpecs{"HDD", 4000, "SATA 6 Gb/s", 180, 170}},
        {"psu-001", "DemoPower 550 Bronze", Category::PowerSupply, "DemoPower", "B550", 4999, "USD", "placeholder:power_supply", true, Availability::InStock, PowerSupplySpecs{550, "80 PLUS Bronze", "non_modular"}},
        {"psu-002", "DemoPower 650 Gold", Category::PowerSupply, "DemoPower", "G650", 7999, "USD", "placeholder:power_supply", true, Availability::InStock, PowerSupplySpecs{650, "80 PLUS Gold", "semi"}},
        {"psu-003", "ExamplePower 850 Gold", Category::PowerSupply, "ExamplePower", "G850", 11999, "USD", "placeholder:power_supply", true, Availability::OutOfStock, PowerSupplySpecs{850, "80 PLUS Gold", "full"}},
        {"case-001", "DemoCase Air ATX", Category::Case, "DemoCase", "Air-A", 7999, "USD", "placeholder:case", true, Availability::InStock, CaseSpecs{{"ATX", "Micro-ATX", "Mini-ITX"}, 360, "Black"}},
        {"case-002", "DemoCase Compact Micro", Category::Case, "DemoCase", "Compact-M", 5999, "USD", "placeholder:case", true, Availability::InStock, CaseSpecs{{"Micro-ATX", "Mini-ITX"}, 300, "White"}},
        {"case-003", "ExampleCase Tower", Category::Case, "ExampleCase", "Tower-E", 12999, "USD", "placeholder:case", true, Availability::Preorder, CaseSpecs{{"E-ATX", "ATX", "Micro-ATX", "Mini-ITX"}, 400, "Gray"}}
    };
}
} // namespace catalog
