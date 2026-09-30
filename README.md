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
├── parts_catalog.json   (Placed here once your teammate shares it)
└── include/
│  ├── httplib.h
│  └── nlohmann/
│     └── json.hpp
│
└── README.md

## SCUM-6
- cd backend
- g++ -std=c++17 -Iinclude main.cpp -o backend.exe -lws2_32 -lcrypt32
- ./backend 
- http://localhost:8080/v1/parts
