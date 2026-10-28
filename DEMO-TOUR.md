# BuildLab presentation demo

## Two-minute tour

1. Open the website. Explain: “This sprint demonstrates our PC component catalog and a first interactive build flow. As of the October 14 sprint check, the deployed site uses a Python adapter and sample catalog data.”
2. Click **CPU**. Show the three choices and their specifications.
3. Search **C8**. Explain that the page filters by name, manufacturer, and model.
4. Clear the search, add **DemoCore C6**, then choose **Motherboard** and add **DemoBoard B650 ATX**. Show the build list and **$309.98** total.
5. Add another motherboard to show that one selection replaces the previous selection in that category.
6. Click **Download build** to export the selected components. Refresh the page to show that the build is saved in this browser.
7. Close: “Next we will add compatibility checks, real data sourcing, and 3D visualization. These features are not part of this demo yet.”

## What was completed

- Justin’s typed catalog model, validation, and 21 sample parts across seven categories.
- Qi’s C++ catalog API, independently compiled and checked locally.
- Presentation frontend: search, categories, price sorting, build selection, estimated total, browser persistence, and JSON export.
- Python presentation API adapter. The working-tree ZenRows/B&H integration returned 175 live products in a local API check; deployment is not confirmed. It does not claim to deploy the C++ process.

## Local backup

From the repository root, run `python demo_server.py`, then open http://localhost:8081. Keep the process running during the tour. The local server reads the key from `ZENROWS_API_KEY` or the ignored `.zenrows/secrets.json`; its catalog route still requires ZenRows network access.

## Deployment

The committed `vercel.json` configures the repository root, static output, and `/v1/parts` API rewrite. Coordinate deployment changes with the team. Local ZenRows success does not confirm that the deployed site is using live data.

## C++ backend

The C++ API remains in `backend/main.cpp`. It reads the canonical sample catalog at `backend/data/sample_parts.json`; the model and seed are in `backend/catalog`.
Run `clang++ -std=c++17 -pthread -Iinclude main.cpp catalog/parts_catalog.cpp catalog/sample_catalog.cpp -o /tmp/buildlab-api` from `backend`, then `/tmp/buildlab-api`. The API listens on port 8080 and uses `data/sample_parts.json`. It is separate from the hosted Python adapter.
