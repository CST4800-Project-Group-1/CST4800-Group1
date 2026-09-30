# PC Part Picker

## Project Description

PC Part Picker is a website that helps users choose PC parts, check compatibility, compare prices, and view a completed computer build.

The project uses:
- TypeScript for the frontend
- C++ for the backend

## Project Structure

```text
PC-Part-Picker/
├── frontend/
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── backend/
│   └── main.cpp
│
└── README.md
```

## SCRUM-3: offline sample parts catalog

The backend uses C++17 with the standard library only. No HTTP server, database,
API framework or JSON library is currently configured. The frontend is TypeScript;
this ticket does not change it.

- `backend/catalog/parts_catalog.h`: common Part model, typed specifications and loader/validation/export declarations.
- `backend/catalog/sample_catalog.cpp`: canonical offline seed, with 21 fictional demo products (three per category).
- `backend/catalog/parts_catalog.cpp`: validation and JSON serialization.
- `backend/data/sample_parts.json`: ready-to-load JSON export for the API or frontend.
- `backend/main.cpp`: startup demonstration and JSON export command.
- `backend/tests/catalog_test.cpp` and `backend/tests/check_catalog.sh`: validation tests and export checks.

All products, prices, inventory and specifications are illustrative sample data,
not verified products, current retail offers or inventory. The JSON envelope is
`{ "schemaVersion": 1, "isSampleData": true, "parts": [...] }`.

### Build and run

Run from the repository root. Requires a C++17 compiler; checks also require Bash
and Python 3. The existing committed `backend/backend` binary is not replaced.

```bash
g++ -std=c++17 -Wall -Wextra -Werror -pedantic backend/main.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o /tmp/pc-parts-catalog
/tmp/pc-parts-catalog
/tmp/pc-parts-catalog --catalog-json
bash backend/tests/check_catalog.sh
```

Edit the native seed and regenerate the JSON using the newly compiled executable:

```bash
/tmp/pc-parts-catalog --catalog-json > /tmp/sample_parts.json
cp /tmp/sample_parts.json backend/data/sample_parts.json
bash backend/tests/check_catalog.sh
```

The checks compare the exported JSON byte-for-byte against the committed file to
prevent drift. The backend always validates the seed before demonstrating or
exporting it. Validation reports errors and exits nonzero. Unsupported CLI options
exit with status 2. Generic `validateCatalog` does not enforce minimum sample
counts; `validateSampleCatalog` adds the requirement of three per category.

### Data contract and units

Every part has `id`, `name`, `category`, `manufacturer`, `model`, `priceCents`,
`currency`, `imageUrl`, `imageIsPlaceholder`, `availability`, and `specs`.
IDs are stable identifiers, not array indexes. `priceCents` is an integer in USD
cents (15999 means $159.99); display price as `priceCents / 100`.
`availability` is `in_stock`, `out_of_stock`, or `preorder`.
`placeholder:<category>` is a marker, not a downloadable image URL. If
`imageIsPlaceholder` is true, the frontend should display its own fallback image;
real image URLs must use HTTPS.

| Category | Fields inside `specs` |
| --- | --- |
| `cpu` | `socket`, `coreCount`, `threadCount`, `baseClockGhz`, `boostClockGhz`, `wattageW` |
| `motherboard` | `socket`, `chipset`, `formFactor`, `memoryType`, `maxMemoryGb` |
| `graphics_card` | `gpuChipset`, `vramGb`, `recommendedPsuW`, `powerConsumptionW`, `lengthMm` |
| `ram` | `memoryType`, `capacityGb`, `speedMtS`, `moduleCount` |
| `storage` | `storageType`, `capacityGb`, `interface`, `readSpeedMbS`, `writeSpeedMbS` |
| `power_supply` | `wattageW`, `efficiencyRating`, `modularType` |
| `case` | `supportedMotherboardSizes`, `maxGpuLengthMm`, `color` |

Clocks are GHz, power is watts, lengths are millimeters, memory and storage capacity
are GB, RAM transfer rate is MT/s, and sequential drive speeds are MB/s.
`capacityGb` for RAM is the whole kit, not each module. Storage uses decimal GB
(1000 GB = 1 TB). GPU `powerConsumptionW` describes the card alone;
`recommendedPsuW` describes a recommended whole-system PSU rating. CPU `wattageW`
is an illustrative thermal design rating, not a measured maximum system draw.
PSU `modularType` is `full`, `semi`, or `non_modular`; memory types are DDR4/DDR5;
form factors use ATX, Micro-ATX, Mini-ITX and E-ATX spellings.

These fields support future compatibility checks but do not implement a complete
compatibility engine. BIOS support, connectors, cooler clearance, drive physical
sizes and additional power/headroom rules will need separate work.

### Qi: Parts Catalog API integration

For a C++ endpoint, include `catalog/parts_catalog.h`, link both catalog `.cpp`
files, and call:

```cpp
const auto parts = catalog::loadSampleCatalog();
const auto errors = catalog::validateSampleCatalog(parts);
// Handle errors before returning data.
std::ostringstream body;
catalog::writeCatalogJson(body, parts);
// Return body.str() with Content-Type: application/json.
```

Include `<sstream>` for this example. The returned envelope contains `parts`.
Qi may select/filter Part records before serializing them, using generic validation
for filtered lists. The serializer labels output as sample data and is intended
for this seed, not live data.

For an API written in another language, parse `backend/data/sample_parts.json`
with that language's JSON parser and return its envelope, preserving the field
names and category values above. Resolve the file path relative to the project
or configured application directory, not an assumed process working directory.
Package the JSON with the API deployment. It needs no network, credentials,
proxy, database or paid service. When a future live provider is unavailable,
Qi can explicitly select this local fallback and retain `isSampleData: true`.
The existing backend loads the native seed; it does not parse arbitrary JSON.
The committed JSON is an export of the same validated seed.

### Message to Qi (draft; not sent)

Qi, my SCRUM-3 sample catalog is at `backend/data/sample_parts.json`. It has 21
fictional sample parts, three in each category, and uses a JSON envelope with
`schemaVersion`, `isSampleData`, and `parts`. Each part uses `id`, `name`,
`category`, `manufacturer`, `model`, `priceCents`, `currency`, `imageUrl`,
`imageIsPlaceholder`, `availability`, and `specs`. Please keep these field names
in the API. Prices are USD cents and units are documented above. For C++, use
`loadSampleCatalog()` and `writeCatalogJson()` from `backend/catalog/`; another
API language can read the JSON file directly. It works offline.

### Presentation

My task was to design a consistent data structure for PC components and create
an offline sample catalog. I added 21 sample parts across seven categories, with
shared fields and category-specific specifications. The C++ backend validates
and loads the sample data, and a matching JSON file gives the API and frontend
reliable data while the external source is being evaluated. The technical fields
can later support searching, filtering and compatibility checks.
