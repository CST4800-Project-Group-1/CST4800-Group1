# PC Part Picker

CST4800 Group 1 is building a PC component browsing and build-selection application. The frontend is TypeScript; the local catalog API is C++17. Vlad confirmed the PR #9 Vercel Preview fetched live B&H catalog data through ZenRows after its key was configured. Production deployment has not been verified. Compatibility checks and 3D visualization are future work.

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

## SCRUM-3: offline sample catalog (Justin)

- backend/catalog/parts_catalog.h: typed shared model and category specifications.
- - backend/catalog/parts_catalog.cpp: validation and JSON export.
- - backend/catalog/sample_catalog.cpp: canonical native seed with 21 fictional parts, three per category.
- - backend/data/sample_parts.json: canonical JSON export.
- - backend/main.cpp: HTTP server and `--catalog` / `--catalog-json` command-line modes.
- - backend/tests/catalog_test.cpp and backend/tests/check_catalog.sh: validation, JSON escaping, field/category checks and seed/export parity.

The catalog CLI modes use the same executable as the HTTP server. From the repository root:
```sh
g++ -std=c++17 -Wall -Wextra -Werror -pedantic -pthread -Ibackend/include backend/main.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o /tmp/pc-parts-api
/tmp/pc-parts-api --catalog
/tmp/pc-parts-api --catalog-json
bash backend/tests/check_catalog.sh
```

Regenerate the canonical JSON export after editing the seed:
```sh
/tmp/pc-parts-api --catalog-json > backend/data/sample_parts.json
bash backend/tests/check_catalog.sh
```

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

The frontend calls `/v1/parts`; Vercel rewrites it to the Python function at `/api/catalog`. Vlad confirmed the PR #9 Preview fetched live catalog results after its server-side `ZENROWS_API_KEY` was corrected. Production has not been verified. Do not commit or share the key. Coordinate deployment changes with Vlad. See [the integration and health-check notes](docs/data-integration-and-health-check.md).

