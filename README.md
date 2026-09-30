# PC Part Picker

CST4800 Group 1 is building a PC component browsing and build-selection application. The frontend is TypeScript; the local catalog API is C++17. All current parts, prices and availability are illustrative sample data. Compatibility checks and 3D visualization are future work.

## SCRUM-6: C++ Parts Catalog API (Qi)

backend/main.cpp is the HTTP server. It uses backend/include/httplib.h and backend/include/nlohmann/json.hpp. Start it from backend so it can find sample_parts.json.

Linux/macOS:
```sh
cd backend
g++ -std=c++17 -pthread -Iinclude main.cpp -o /tmp/pc-parts-api
/tmp/pc-parts-api
```

Windows (MinGW-w64):
```powershell
cd backend
g++ -std=c++17 -Iinclude main.cpp -o backend.exe -lws2_32 -lcrypt32
.\backend.exe
```

The API listens on port 8080. Keep the server running during the demo. If the catalog file is missing or invalid, restore it and restart the process. A port binding failure exits with status 1.

- GET /: JSON health response, status online.
- - GET /v1/parts: status success; data contains the catalog envelope with schemaVersion, isSampleData and parts.
- - GET /v1/parts/{category}: status success, category, count and a data array containing matching parts. Category matching ignores case.
- - Supported categories: cpu, motherboard, graphics_card, ram, storage, power_supply, case.
- - Unsupported/empty categories return HTTP 404 with error and supported_categories. Unavailable catalog data returns HTTP 503 with error.

The catalog is loaded before the request threads start and is read-only during requests; restarting reloads it. This prevents concurrent handler reloads from modifying shared data.

## SCRUM-3: offline sample catalog (Justin)

- backend/catalog/parts_catalog.h: typed shared model and category specifications.
- - backend/catalog/parts_catalog.cpp: validation and JSON export.
- - backend/catalog/sample_catalog.cpp: canonical native seed with 21 fictional parts, three per category.
- - backend/data/sample_parts.json: canonical JSON export.
- - backend/catalog_main.cpp: separate command-line catalog demo/export.
- - backend/tests/catalog_test.cpp and backend/tests/check_catalog.sh: validation, JSON escaping, field/category checks and seed/export parity.

The catalog CLI is separate from the HTTP server so both teammates’ deliverables remain usable. From the repository root:
```sh
g++ -std=c++17 -Wall -Wextra -Werror -pedantic backend/catalog_main.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o /tmp/pc-parts-catalog
/tmp/pc-parts-catalog 
/tmp/pc-parts-catalog --catalog-json
bash backend/tests/check_catalog.sh
```

Regenerate both JSON copies after editing the seed:
```sh
/tmp/pc-parts-catalog --catalog-json > backend/data/sample_parts.json
cp backend/data/sample_parts.json backend/sample_parts.json
bash backend/tests/check_catalog.sh
```

## Shared data contract

The envelope is {schemaVersion: 1, isSampleData: true, parts: [...]}. Each part has id, name, category, manufacturer, model, priceCents, currency, imageUrl, imageIsPlaceholder, availability and specs. IDs are stable identifiers. Prices are integer USD cents (15999 = $159.99). Availability is in_stock, out_of_stock or preorder. placeholder:<category> is an image marker, not a download URL; render a local placeholder. Real image URLs must use HTTPS.
  
  CPU specs include socket, core/thread counts, clocks in GHz and wattageW. Motherboard specs include socket, chipset, formFactor, memoryType and maxMemoryGb. GPU specs include chipset, VRAM in GB, recommended PSU watts, power consumption watts and length in mm. RAM capacity is for the whole kit in GB; speed is MT/s. Storage capacity uses decimal GB, interfaces and sequential speeds in MB/s. PSU specs include wattage, efficiency and modular type (full, semi, non_modular). Cases list supported board sizes, maximum GPU length in mm and color.
  
  These fields can support future compatibility rules, but do not verify complete compatibility: BIOS, connectors, cooler clearance and power headroom need separate work.
  
  ## Presentation website
  
  The presentation frontend and Vercel Python API adapter are in PR #8 on demo/presentation-website. They use Justin’s canonical catalog; the hosted adapter is distinct from Qi’s local C++ process. See DEMO-TOUR.md on that branch for the website tour and deployment settings.
