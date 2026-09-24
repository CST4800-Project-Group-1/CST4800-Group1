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
│   ├── main.cpp
│   ├── httplib.h
│   └── parts_catalog.json
│
└── README.md

## SCUM-6
- cd backend
- g++ -std=c++11 main.cpp -o backend -lpthread -lws2_32 -lcrypt32
- ./backend 
- http://localhost:8080/