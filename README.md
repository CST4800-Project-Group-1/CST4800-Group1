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
├── main.cpp
├── sample_parts.json
└── include/
│  ├── httplib.h
│  └── nlohmann/
│     └── json.hpp
│
└── README.md

```

## SCUM-6
- cd backend
- g++ -std=c++17 -Iinclude main.cpp -o backend.exe -lws2_32 -lcrypt32
- ./backend 
- http://localhost:8080/v1/parts

## SCRUM-8: catalog interface and API integration

This work is based on Qi's `feature/qixin-chen` branch at
`b822967d71c85c67cd4be3ba8ef8b5db0f644d39`. Main still has only startup
messages. The inspected branches have no existing catalog interface, so this
ticket adds a minimal browser interface in the existing TypeScript frontend.
It uses standard DOM APIs with no frontend framework. The backend remains C++17
with the existing cpp-httplib and nlohmann JSON headers in `backend/include/`.

### Run both applications

Requirements: Node.js 22 or newer with npm, and a C++17 compiler. Run each app in
a separate terminal. No external parts service, credentials or database is needed.

Windows with MinGW-w64, starting at the repository root:

```powershell
cd backend
g++ -std=c++17 -Iinclude main.cpp -o backend.exe -lws2_32 -lcrypt32
.\backend.exe
```

Linux/macOS, starting at the repository root:

```bash
cd backend
g++ -std=c++17 -Iinclude main.cpp -o catalog-api -pthread
./catalog-api
```

Keep the API running. In a second terminal, starting at the repository root:

```bash
cd frontend
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. Run the backend from `backend/` because Qi's
current loader resolves `sample_parts.json` against the working directory.
Check `http://localhost:8080/v1/parts` if the interface reports an error.
An unavailable or invalid catalog is shown as an error with a retry button;
the interface does not silently switch to frontend mock data. If the API uses
another address, edit the `parts-api-url` meta tag in `frontend/index.html`.
For an HTTPS deployment, that address must also use HTTPS and allow the frontend
origin through CORS. The static server is for local development only.

### Data and behavior

The API loads the offline SCRUM-3 sample catalog from `backend/sample_parts.json`:
21 fictional products, three in each of seven categories. It is already wired
into Qi's backend. SCRUM-8 does not change the backend or duplicate the seed in
the frontend. Qi's full response is:

```json
{"status":"success","data":{"schemaVersion":1,"isSampleData":true,"parts":[]}}
```

Each part retains `id`, `name`, `category`, `manufacturer`, `model`,
`priceCents`, `currency`, `imageUrl`, `imageIsPlaceholder`, `availability`,
and category-specific `specs`. Prices are integer USD cents: 15999 displays as
$159.99. Category keys are `cpu`, `motherboard`, `graphics_card`, `ram`,
`storage`, `power_supply`, and `case`. `placeholder:<category>` is a marker,
not an image URL; the interface displays a labeled placeholder. Specification
units are shown on the cards. Preserve these field names when adding records.

`frontend/src/catalog.ts` defines the frontend model, validates the API envelope
and required category specifications, and removes repeated IDs (last record
wins). A response replaces the catalog rather than appending to it. Requests
have a 10-second timeout; cancelled or older requests cannot overwrite newer
results. Refresh always makes a fresh API request. No catalog is persisted in
browser storage. Empty catalogs and no search matches are shown clearly.

Search covers returned names, models, manufacturers, category labels and specs.
Category, manufacturer, availability and maximum-price filters combine. Clear
filters restores all records. Loading, failure, retry and sample-data provenance
are displayed explicitly. Images failing to load also show a placeholder.

### Checks

```bash
cd frontend
npm run check
npm test
```

Tests cover all 21 seed records, seven categories, schema errors, duplicate IDs,
combined filters, API failures, invalid JSON, timeout, retry and stale responses.
For a manual acceptance check: load the page, confirm 21 records; choose CPUs
(three records); search for `AM5`; filter stock and price; clear filters; reload
and refresh (still 21); stop the API and reload (visible error); restart the API
and retry (21). Use browser network throttling to inspect the loading state.

### SCRUM-8 branch

The completed integration is on `feature/micquaya-gibson`. This branch includes
Qi's API version used to test SCRUM-8. To check it out:

```bash
git fetch origin
git switch feature/micquaya-gibson
```

For later edits, review and then commit/push when ready:

```bash
git diff
git status --short
git add .gitignore README.md frontend/package.json frontend/tsconfig.json frontend/index.html frontend/styles.css frontend/scripts/serve.mjs frontend/src/index.ts frontend/src/catalog.ts frontend/tests/catalog.test.mjs
git commit -m "SCRUM-8 connect parts catalog interface to backend API"
git push -u origin feature/micquaya-gibson
```

Coordinate with Qi before merging because this branch includes his unmerged API
work. The existing generated files in `frontend/src/` remain untouched; browser
builds now go to ignored `frontend/dist/` and HTML loads that output.

### Team presentation

I connected our TypeScript parts catalog to Qi's backend API using the SCRUM-3
data model. The page loads 21 sample parts, supports search and combined filters,
and shows loading or useful errors with a retry option. Refreshing requests the
catalog again, and repeated IDs cannot create duplicate cards. Both applications
have documented setup commands and the integration has automated tests.
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
