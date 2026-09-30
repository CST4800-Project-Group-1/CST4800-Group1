#include "httplib.h"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <cctype>
#include <utility>
using json = nlohmann::json;
json global_catalog;
std::string to_lower(std::string s) {
      std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c){ return std::tolower(c); });
      return s;
}
bool loadCatalog() {
      std::ifstream file("sample_parts.json");
      if (!file.is_open()) {
                std::cerr << "[Error] 'sample_parts.json' not found in the current directory. Start the server from backend/." << std::endl;
                return false;
      }
      try {
                json parsed_catalog;
                file >> parsed_catalog;
                const bool valid_shape = parsed_catalog.is_array()
                   || (parsed_catalog.is_object() && parsed_catalog.contains("parts") && parsed_catalog["parts"].is_array());
                if (!valid_shape) {
                              global_catalog = json();
                              std::cerr << "[Error] Catalog must be an array or an object containing a parts array." << std::endl;
                              return false;
                }
                global_catalog = std::move(parsed_catalog);
                std::cout << "[Success] Parts catalog loaded successfully!" << std::endl;
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
   svr.set_socket_options([](socket_t socket) {
     #ifdef _WIN32
        if (!httplib::set_socket_opt(socket, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, 1)) {
                      std::cerr << "[Error] Could not reserve port exclusively." << std::endl;
        }
     #else
             if (!httplib::set_socket_opt(socket, SOL_SOCKET, SO_REUSEADDR, 1)) {
                           std::cerr << "[Warning] Could not enable socket address reuse." << std::endl;
             }
     #endif
   });
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
                              json err;
                              err["error"] = "Catalog data is currently unavailable. Restart the server after restoring the catalog.";
                              res.status = 503;
                              res.set_content(err.dump(), "application/json");
                              return;
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
                              json err;
                              err["error"] = "Catalog data is currently unavailable. Restart the server after restoring the catalog.";
                              res.status = 503;
                              res.set_content(err.dump(), "application/json");
                              return;
                }
                std::string category = req.matches[1];
                std::string search_category = to_lower(category);
                json matching_parts = json::array();
                const json* parts = nullptr;
                if (global_catalog.is_array()) parts = &global_catalog;
             else if (global_catalog.is_object() && global_catalog.contains("parts") && global_catalog["parts"].is_array()) parts = &global_catalog["parts"];
         if (parts != nullptr) {
            for (const auto& part : *parts) {
               if (part.is_object() && part.contains("category") && part["category"].is_string()
                    && to_lower(part["category"].get<std::string>()) == search_category) matching_parts.push_back(part);
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
                std::cerr << "[Error] Could not listen on port 8080. Check whether another process is using it." << std::endl;
                return 1;
      }
      return 0;
}
