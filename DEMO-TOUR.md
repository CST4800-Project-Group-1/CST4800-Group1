# BuildLab presentation demo

## Two-minute tour

1. Open the website. Explain: “This sprint demonstrates our PC component catalog and a first interactive build flow. We currently use clearly labeled sample data.”
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
- Hosted presentation API adapter using the same catalog. This Python function allows the website and API to share a Vercel deployment; it does not claim to deploy the C++ process.

## Local backup

From the repository root, run `python3 demo_server.py`, then open http://localhost:8081. Keep the process running during the tour. This uses the same hosted API adapter and needs no installed packages.

## Deployment

Deploy the repository root to Vercel with framework **Other**, no build command, and output directory **public**. The committed `vercel.json` configures these values and the `/v1/parts` API rewrite. Do not set the root directory to `frontend`.

## C++ backend

The C++ API remains in `backend/main.cpp`. Its sample catalog is in `backend/sample_parts.json`; the canonical data/model is in `backend/data` and `backend/catalog`.
Run `clang++ -std=c++17 -pthread -Iinclude main.cpp -o /tmp/buildlab-api` from `backend`, then `/tmp/buildlab-api`. The API listens on port 8080. The hosted demo uses the Python adapter, while the C++ API can be shown separately.
