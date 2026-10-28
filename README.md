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

The backend uses C++17 with the standard library only. 
At the time SCRUM-3 was completed, no HTTP server, database, 
API framework, or JSON library was configured. 
The frontend is TypeScript;
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

### SCRUM-6: Parts Catalog API integration

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

### Presentation

My task was to design a consistent data structure for PC components and create
an offline sample catalog. I added 21 sample parts across seven categories, with
shared fields and category-specific specifications. The C++ backend validates
and loads the sample data, and a matching JSON file gives the API and frontend
reliable data while the external source is being evaluated. The technical fields
can later support searching, filtering and compatibility checks.

CST4800 Group 1 is building a PC component browsing and build-selection application. The frontend is TypeScript; the local catalog API is C++17. The PR #9 Vercel Preview was confirmed to fetch live B&H catalog data through ZenRows after its key was configured. Production deployment has not been verified. Full compatibility checks and 3D visualization are future work.

## SCRUM-6: C++ Parts Catalog API (Qi)

`backend/main.cpp` combines the C++ HTTP server and catalog CLI. Run it without arguments for the API; use `--catalog` for the validated summary or `--catalog-json` for JSON export. Start the HTTP server from `backend/`; it reads the canonical `backend/data/sample_parts.json` file.

Linux/macOS:
```sh
g++ -std=c++17 -pthread -Ibackend/include backend/main.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o /tmp/pc-parts-api
(cd backend && /tmp/pc-parts-api)
```

Windows (MinGW-w64):
```powershell
g++ -std=c++17 -pthread -Ibackend/include backend/main.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o backend/backend.exe -lws2_32 -lcrypt32
cd backend
.\backend.exe
```

The API listens on port 8080. Keep the server running during the demo. If the catalog file is missing or invalid, restore it and restart the process. A port binding failure exits with status 1.

- GET /: JSON health response, status online.
- - GET /v1/parts: status success; data contains the catalog envelope with schemaVersion, isSampleData and parts.
- - GET /v1/parts/{category}: status success, category, count and a data array containing matching parts. Category matching ignores case.
- - Supported categories: cpu, motherboard, graphics_card, ram, storage, power_supply, case.
- - Unsupported/empty categories return HTTP 404 with error and supported_categories. Unavailable catalog data returns HTTP 503 with error.

The catalog is loaded before the request threads start and is read-only during requests; restarting reloads it. This prevents concurrent handler reloads from modifying shared data.

## Shared data contract

The envelope is {schemaVersion: 1, isSampleData: true, parts: [...]}. Each part has id, name, category, manufacturer, model, priceCents, currency, imageUrl, imageIsPlaceholder, availability and specs. IDs are stable identifiers. Prices are integer USD cents (15999 = $159.99). Availability is in_stock, out_of_stock or preorder. placeholder:<category> is an image marker, not a download URL; render a local placeholder. Real image URLs must use HTTPS.
  
  CPU specs include socket, core/thread counts, clocks in GHz and wattageW. Motherboard specs include socket, chipset, formFactor, memoryType and maxMemoryGb. GPU specs include chipset, VRAM in GB, recommended PSU watts, power consumption watts and length in mm. RAM capacity is for the whole kit in GB; speed is MT/s. Storage capacity uses decimal GB, interfaces and sequential speeds in MB/s. PSU specs include wattage, efficiency and modular type (full, semi, non_modular). Cases list supported board sizes, maximum GPU length in mm and color.
  
  These fields can support future compatibility rules, but do not verify complete compatibility: BIOS, connectors, cooler clearance and power headroom need separate work.
  
## Live Parts API (ZenRows)

The Python endpoint `api/catalog.py` fetches current product listings from B&H Photo through ZenRows. It returns up to 25 parsed products in each of seven categories and caches a successful catalog for one hour. ZenRows is the fetch service; the product listings come from B&H. This is separate from the C++ sample-data API described above.

### Run locally

1. Get a ZenRows API key and keep it private. For a local run, either set `ZENROWS_API_KEY` in your shell or create `.zenrows/secrets.json` (this local file is ignored by Git) with this shape:

   ```json
   {"apiKey": "YOUR_ZENROWS_API_KEY"}
   ```

2. From the repository root, start the local website and API adapter:

   ```powershell
   python demo_server.py
   ```

3. Open `http://localhost:8081` or request the API directly:

   ```powershell
   Invoke-RestMethod http://localhost:8081/v1/parts
   ```

The endpoint is `GET /v1/parts`. Success returns `{status: "success", data: {schemaVersion: 1, isSampleData: false, source, generatedAt, parts: [...]}}`. The site also requests `GET /v1/parts?category=cpu` (and the other supported category names) sequentially so it can show the first live category before the rest finish. Each part follows the shared data contract above. A missing key or fetch/parse failure returns HTTP 503 with an `error` field; the website reports the catalog unavailable and does not silently switch to sample prices. The C++ sample catalog remains available separately. Live product count and availability can change.

### Deployment status

The frontend calls `/v1/parts`; Vercel rewrites it to the Python function at `/api/catalog`. The PR #9 Preview was confirmed to fetch live catalog results after its server-side `ZENROWS_API_KEY` was corrected. Production has not been verified. Do not commit or share the key. Coordinate deployment changes with the team. See [the integration and health-check notes](docs/data-integration-and-health-check.md).

## SCRUM-15 updated from SCRUM-16

Source: Qi's PR #9, commit 94337478fee0896f21eddda29be4159438a0925f.
The root website now uses SCRUM-16's live category loader and Python catalog
adapter while retaining SCRUM-15's socket status, selection updates and exports.
Socket results require fresh CPU and motherboard categories. Cached or failed
requests cannot establish compatibility; missing live socket specifications
remain unknown. Exported isSampleData comes from the API.

Set ZENROWS_API_KEY in the server environment and run `python demo_server.py`.
Open http://localhost:8081. No key is committed. The source's external requests
were not executed during this update. Local fixtures verified category loading,
refresh failure and socket status. Run `node --test tests/*.test.mjs`.
The C++ source and catalog check script also follow SCRUM-16; its server reads
backend/data/sample_parts.json. Existing frontend TypeScript work is preserved.
No merge or deployment approval is implied.