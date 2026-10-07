#include "httplib.h"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using json = nlohmann::json;

// Global catalog storage loaded from the teammate's JSON file
json global_catalog;

// Helper function to convert strings for case-insensitive category matching
std::string to_lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c){ return std::tolower(c); });
    return s;
}

// Function to read the sample catalog file provided by your team
bool loadCatalog() {
    std::ifstream file("sample_parts.json");
    if (!file.is_open()) {
        std::cerr << "[Warning] 'sample_parts.json' not found. API will return 503 until the file is placed." << std::endl;
        return false;
    }
    try {
        file >> global_catalog;
        std::cout << "[Success] Parts catalog loaded successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "[Error] Failed to parse JSON catalog: " << e.what() << std::endl;
        return false;
    }
    return true;
}

// Helper to set CORS headers so the 3D frontend can connect to your API
void set_cors_headers(httplib::Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set_header("Access-Control-Allow-Headers", "Content-Type");
}

int main() {
    // Load catalog on startup
    loadCatalog();

    httplib::Server svr;

    // Handle preflight OPTIONS requests for CORS
    svr.Options(R"(/.*)", [](const httplib::Request&, httplib::Response& res) {
        set_cors_headers(res);
        res.status = 200;
    });

    // 1. Root / Health Check Endpoint
    svr.Get("/", [](const httplib::Request&, httplib::Response& res) {
        set_cors_headers(res);
        json response;
        response["status"] = "online";
        response["message"] = "3D PC Parts Catalog API is running with cpp-httplib";
        res.set_content(response.dump(), "application/json");
    });

    // 2. GET /v1/parts - Retrieve the full catalog
    svr.Get("/v1/parts", [](const httplib::Request&, httplib::Response& res) {
        set_cors_headers(res);
        
        if (global_catalog.empty()) {
            loadCatalog(); // Try reloading if file was just added
            if (global_catalog.empty()) {
                json err;
                err["error"] = "Catalog data is currently unavailable.";
                res.status = 503;
                res.set_content(err.dump(), "application/json");
                return;
            }
        }

        json response;
        response["status"] = "success";
        response["data"] = global_catalog;
        
        res.status = 200;
        res.set_content(response.dump(), "application/json");
    });

    // 3. GET /v1/parts/{category} - Retrieve parts filtered by category
    svr.Get(R"(/v1/parts/([^/]+))", [](const httplib::Request& req, httplib::Response& res) {
        set_cors_headers(res);

        if (global_catalog.empty()) {
            loadCatalog();
            if (global_catalog.empty()) {
                json err;
                err["error"] = "Catalog data is currently unavailable.";
                res.status = 503;
                res.set_content(err.dump(), "application/json");
                return;
            }
        }

        std::string category = req.matches[1];
        std::string search_category = to_lower(category);
        json matching_parts = json::array();

        // The sample catalog is an object with a "parts" array. Also accept a
        // root array for catalogs exported in that simpler shape.
        const json* parts = nullptr;
        if (global_catalog.is_array()) {
            parts = &global_catalog;
        } else if (global_catalog.is_object() && global_catalog.contains("parts")
                   && global_catalog["parts"].is_array()) {
            parts = &global_catalog["parts"];
        }

        if (parts != nullptr) {
            for (const auto& part : *parts) {
                if (part.is_object() && part.contains("category") && part["category"].is_string()
                    && to_lower(part["category"].get<std::string>()) == search_category) {
                    matching_parts.push_back(part);
                }
            }
        }

        // Clean error handling if category is invalid or empty
        if (matching_parts.empty()) {
            json err;
            err["error"] = "Invalid category or no parts found for category: " + category;
            err["supported_categories"] = {"cpu", "motherboard", "graphics_card", "ram", "storage", "power_supply", "case"};
            
            res.status = 404;
            res.set_content(err.dump(), "application/json");
            return;
        }

        json response;
        response["status"] = "success";
        response["category"] = category;
        response["count"] = matching_parts.size();
        response["data"] = matching_parts;

        res.status = 200;
        res.set_content(response.dump(), "application/json");
    });

    // Start server on port 8080
    std::cout << "Starting 3D Parts Catalog API on http://localhost:8080 ..." << std::endl;
    svr.listen("0.0.0.0", 8080);

    return 0;
}
