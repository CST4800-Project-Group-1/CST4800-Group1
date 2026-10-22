# Live catalog data path and combined backend check

## How the live site receives catalog data

The deployed website is served from the repository root by Vercel. The frontend
requests `GET /v1/parts`; `vercel.json` rewrites that path to the Python function
`api/catalog.py`. An October 22 Vercel Preview deployment succeeded, but the
catalog did not load because the Preview environment still needs
`ZENROWS_API_KEY`. The local ZenRows/B&H fetcher has returned live API results;
do not describe the Preview or production site as using live data until its
`/v1/parts` endpoint is verified.

The combined `backend/main.cpp` executable runs the C++ HTTP server on port
8080 by default and retains the catalog CLI as `--catalog` and `--catalog-json`
modes. Start it from `backend/`; HTTP mode reads `data/sample_parts.json` and
serves the catalog contract locally. It is not currently part of
Vercel's request path; checking this server does not verify a Vercel deployment.

## Candidate data integration

ZenRows is the server-side fetch service; B&H Photo is the live catalog source.
The integration uses B&H's public category listing pages for CPU, motherboard,
graphics card, memory, internal SSD, power supply and case products. The importer
uses deterministic HTML parsing and does not use AI extraction. Each category is
limited to the first 25 products with a parseable current USD price. Product
cards link back to their B&H listing.

The candidate reads `ZENROWS_API_KEY` from its process environment. Never put
the key in frontend code or source control. For local use, run
`python demo_server.py`; it reads that environment variable or the ignored
`.zenrows/secrets.json` CLI secret file and serves the site on loopback port
8081. The key in that local file is not available to Vercel. Vercel would need the
key in the project's server-side Environment Variables after the team approves
the deployment change. A local `GET /v1/parts` returned HTTP 200 with
`isSampleData: false`, 175 products and 25 products in each of the seven
categories. Basic mode returned ZenRows `RESP001`; JavaScript rendering without
a product wait returned a browser-update page. Adding ZenRows' `wait_for`
selector for B&H product cards returned the listings at a reported `$0.005`
request cost. The fetcher uses this rendered retry when basic mode is blocked
or returns no parseable products. Two concurrent category fetches avoided the
earlier 429 response from a seven-request burst. Successful results are cached
for one hour. The first local request in this sandbox failed because outbound
HTTPS was blocked; the successful catalog request ran with external network
access. The Preview deployment still needs the server-side key and a successful
endpoint check.

For faster first paint, the frontend now requests categories sequentially,
starting with CPUs, and renders each response as it arrives. It uses
`GET /v1/parts?category=<category>`; the full-catalog `GET /v1/parts` endpoint
remains supported. The browser also shows its last saved catalog immediately
while it refreshes category prices. Each category response has one-hour cache
headers.

The Vercel config still bundles the sample JSON. Coordinate with Vlad before
changing deployment configuration. The separate local C++ service in
`backend/main.cpp` remains a sample-data demo and is not the live website API.

## Combined checkout health check

The current C++ entry point is `backend/main.cpp`. Build it with the catalog
model and seed sources; run with no arguments to start the HTTP API, or pass
`--catalog` / `--catalog-json` for the former catalog CLI modes. For example,
from the repository root:

```powershell
g++ -std=c++17 -pthread -Ibackend/include backend/main.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o api.exe -lws2_32 -lcrypt32
Push-Location backend
..\api.exe --catalog
Pop-Location
```

The checks below are the recorded pre-combination checkout results and
commands.

These checks ran on Windows against combined checkout commit
`752e6107ab4b4c5d7a6f5d65fe378b19878eeefa` (`feature/qixin-chen`, containing the
merge from `main`). The local `main` ref points to an older initial setup, so
these results describe the combined checkout, not that stale local ref.

### Catalog build, test, and export

```powershell
$tmp = Join-Path $env:TEMP 'cst4800-catalog-check'
New-Item -ItemType Directory -Force $tmp | Out-Null
g++ -std=c++17 -Wall -Wextra -Werror -pedantic backend/catalog_main.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o (Join-Path $tmp 'catalog.exe')
g++ -std=c++17 -Wall -Wextra -Werror -pedantic backend/tests/catalog_test.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o (Join-Path $tmp 'catalog-test.exe')
& (Join-Path $tmp 'catalog-test.exe')
& (Join-Path $tmp 'catalog.exe') --catalog-json
```

Result: both builds succeeded; `catalog_test` reported “Catalog validation and
JSON escaping checks passed”; JSON export parsed and contained 21 parts, as did
`backend/data/sample_parts.json`.

### C++ HTTP service

The server compiled with the Windows Winsock libraries and served a temporary
working copy of the then-current sample JSON. This recorded check predates the
move to the canonical `backend/data/sample_parts.json` path:

```powershell
g++ -std=c++17 -pthread -Ibackend/include backend/main.cpp -o "$env:TEMP\cst4800-api-check\api.exe" -lws2_32 -lcrypt32
```

With the server running from that temporary directory, the following requests
were checked:

| Request | Result |
| --- | --- |
| `GET /` | HTTP 200, `status: online` |
| `GET /v1/parts` | HTTP 200, 21 parts |
| `GET /v1/parts/cpu` | HTTP 200, 3 parts |
| `GET /v1/parts/motherboard` | HTTP 200, 3 parts |
| `GET /v1/parts/graphics_card` | HTTP 200, 3 parts |
| `GET /v1/parts/ram` | HTTP 200, 3 parts |
| `GET /v1/parts/storage` | HTTP 200, 3 parts |
| `GET /v1/parts/power_supply` | HTTP 200, 3 parts |
| `GET /v1/parts/case` | HTTP 200, 3 parts |
| `GET /v1/parts/nope` | HTTP 404 |

For missing-file handling, the same executable was started with an empty
temporary directory as its working directory; `GET /v1/parts` returned HTTP
503. The temporary server processes were stopped after each check.

The repository's Bash wrapper `backend/tests/check_catalog.sh` was not directly
invokable in this Windows PowerShell environment because `bash` is not on PATH;
its C++ build/test/export and JSON parsing checks were run directly as described
above.
