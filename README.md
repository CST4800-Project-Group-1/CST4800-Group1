# PC Part Picker

## Project Description

PC Part Picker is a 3D PC building website that helps users choose compatible components, compare prices, and visualize a completed computer build. The frontend uses TypeScript, and the backend uses C++ to provide PC part catalog data.

## Project Structure

```text
PC-Part-Picker/
├── backend/
│   ├── include/
│   │   ├── httplib.h
│   │   └── nlohmann/
│   │       └── json.hpp
│   ├── main.cpp
│   └── sample_parts.json
├── frontend/
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## Backend setup

The backend source, headers, and sample catalog are under `backend/`. Build and run from that directory so the server can find `sample_parts.json`:

### Windows (MinGW-w64, PowerShell)

```powershell
cd backend
g++ -std=c++17 -Iinclude main.cpp -o backend.exe -lws2_32 -lcrypt32
.\backend.exe
```

### Linux

```sh
cd backend
g++ -std=c++17 -pthread -Iinclude main.cpp -o backend
./backend
```

The server listens on port 8080. Keep its terminal open while using the API. If the catalog cannot be loaded, catalog requests return HTTP 503. If port 8080 is occupied, the server reports the bind failure and exits with a nonzero status.

## API

### `GET /`

Returns a JSON health response with `status: "online"`.

### `GET /v1/parts`

Returns the catalog document under `data`. The sample file has `schemaVersion`, `isSampleData`, and a `parts` array.

### `GET /v1/parts/{category}`

Returns the matching part records. Category matching ignores letter case. Supported values are `cpu`, `motherboard`, `graphics_card`, `ram`, `storage`, `power_supply`, and `case`.

Example: `http://localhost:8080/v1/parts/cpu`

```json
{
  "status": "success",
  "category": "cpu",
  "count": 3,
  "data": [
    {
      "id": "cpu-001",
      "name": "DemoCore C6",
      "category": "cpu",
      "manufacturer": "DemoCore",
      "model": "C6",
      "priceCents": 15999,
      "currency": "USD",
      "imageUrl": "placeholder:cpu",
      "imageIsPlaceholder": true,
      "availability": "in_stock",
      "specs": {
        "socket": "AM5",
        "coreCount": 6,
        "threadCount": 12,
        "baseClockGhz": 3.8,
        "boostClockGhz": 5.1,
        "wattageW": 65
      }
    }
  ]
}
```

Each record includes `id`, `name`, `category`, `manufacturer`, `model`, `priceCents`, `currency`, `imageUrl`, `imageIsPlaceholder`, `availability`, and category-specific `specs`.

### Errors

If `sample_parts.json` is missing or invalid, catalog endpoints return HTTP 503 with a JSON `error` field. An unsupported category returns HTTP 404:

```json
{
  "error": "Invalid category or no parts found for category: unknown",
  "supported_categories": [
    "cpu", "motherboard", "graphics_card", "ram",
    "storage", "power_supply", "case"
  ]
}
```
