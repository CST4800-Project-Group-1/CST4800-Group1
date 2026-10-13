# Live catalog data path and combined backend check

## How the live site receives catalog data

The deployed website is served from the repository root by Vercel. The frontend
requests `GET /v1/parts`; `vercel.json` rewrites that path to the Python function
`api/catalog.py`. The function reads `backend/data/sample_parts.json` (included
in the function bundle by `vercel.json`) and returns it inside the
`{"status":"success","data":...}` response envelope. The browser therefore
receives the checked-in sample catalog through the Python adapter.

`backend/main.cpp` is a separate C++ HTTP server listening on port 8080. It
reads `backend/sample_parts.json` from its working directory and serves the same
catalog contract locally. It is not currently part of Vercel's request path and
has only been checked as a separate service. A successful C++ test does not
verify a Vercel deployment.

## Selected data integration

ZenRows is the selected provider for the upcoming sourced-catalog integration.
The intended flow is to fetch permitted upstream product pages/data with
ZenRows in a server-side ingestion step, normalize and validate results into
the existing catalog schema, then publish a generated catalog artifact for the
site API to serve. Credentials stay server-side and out of source control. The
frontend continues to consume the existing `/v1/parts` contract.

Coordinate this approach and its ingestion/deployment ownership with Vlad
before changing Vercel configuration or replacing the Python adapter. This
document records the selected approach; it does not claim ZenRows ingestion is
implemented or deployed. Until that coordination and wiring happen, the live
site continues to use the checked-in sample JSON through Python.

## Combined checkout health check

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
working copy of `backend/sample_parts.json`:

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
