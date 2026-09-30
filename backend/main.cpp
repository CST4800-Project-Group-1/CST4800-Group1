#include "httplib.h"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <array>
#include <cctype>

using json = nlohmann::json;

json global_catalog;

std::string to_lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c){ return std::tolower(c); });
    return s;
}

bool loadCatalog() {
    // Support launching from either the repository root or backend/.
    const std::array<const char*, 2> paths = {
        "backend/sample_parts.json", "sample_parts.json"
    };
    std::ifstream file;
    std::string loaded_path;
    for (const char* path : paths) {
        file.open(path);
        if (file.is_open()) {
            loaded_path = path;
            break;
        }
        file.clear();
    }
    if (!file.is_open()) {
        std::cerr << "[Error] Sample catalog not found (expected backend/sample_parts.json or sample_parts.json)." << std::endl;
        return false;
    }
    try {
        json parsed;
        file >> parsed;
        const json* parts = parsed.is_array() ? &parsed
            : (parsed.is_object() && parsed.contains("parts") && parsed["parts"].is_array()
                ? &parsed["parts"] : nullptr);
        if (parts == nullptr) {
            std::cerr << "[Error] Catalog must be an array or an object containing a parts array." << std::endl;
            return false;
        }
        const std::size_t part_count = parts->size();
        global_catalog = std::move(parsed);
        std::cout << "[Success] Loaded " << part_count << " parts from " << loaded_path << std::endl;
    } catch (const std::exception& e) {
        global_catalog = json();
        std::cerr << "[Error] Failed to parse JSON catalog: " << e.what() << std::endl;
        return false;
    }
    return true;
}

void set_cors_headers(httplib::Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set_header("Access-Control-Allow-Headers", "Content-Type");
}

int main() {
    loadCatalog();

    httplib::Server svr;

    svr.Options(R"(/.*)", [](const httplib::Request&, httplib::Response& res) {
        set_cors_headers(res);
        res.status = 200;
    });

    svr.Get("/", [](const httplib::Request&, httplib::Response& res) {
        set_cors_headers(res);
        json response;
        response["status"] = "online";
        response["message"] = "3D PC Parts Catalog API is running with cpp-httplib";
        res.set_content(response.dump(), "application/json");
    });

    svr.Get("/v1/parts", [](const httplib::Request&, httplib::Response& res) {
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

        json response;
        response["status"] = "success";
        response["data"] = global_catalog;
        
        res.status = 200;
        res.set_content(response.dump(), "application/json");
    });

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

    std::cout << "Starting 3D Parts Catalog API on http://localhost:8080 ..." << std::endl;
    if (!svr.listen("0.0.0.0", 8080)) {
        std::cerr << "[Error] Failed to start server on port 8080." << std::endl;
        return 1;
    }

    return 0;
}
