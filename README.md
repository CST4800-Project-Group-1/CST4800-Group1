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
