#include <iostream>
#include <string>
#include <sstream>
#include "httplib.h"

int main() {
    httplib::Server svr;
    // Enable CORS headers so local frontend clients can connect without blocks
    svr.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");
        if (req.method == "OPTIONS") {
            res.status = 200;
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });
    // Root endpoint for status and instructions
    svr.Get("/", [](const httplib::Request& req, httplib::Response& res) {
        res.set_content("System Analyzer API Server is running.\nEndpoint: /api/parts/{category}\nCategories: cpu, motherboard, memory, gpu, storage, power-supply\n", "text/plain");
    });
    // Parts Catalog Endpoint with path parameters
    svr.Get("/api/parts/:category", [](const httplib::Request& req, httplib::Response& res) {
        std::string category = req.path_params.at("category");
        std::string categoryData;
        if (category == "cpu") {
            categoryData = R"([
                {"id": "cpu-1", "name": "AMD Ryzen 7 7800X3D", "socket": "AM5", "tdpWatts": 120, "price": 389.00},
                {"id": "cpu-2", "name": "Intel Core i7-14700K", "socket": "LGA1700", "tdpWatts": 125, "price": 399.00}
            ])";
        } else if (category == "motherboard") {
            categoryData = R"([
                {"id": "mobo-1", "name": "MSI MAG B650 TOMAHAWK WIFI", "socket": "AM5", "ramType": "DDR5", "price": 199.00},
                {"id": "mobo-2", "name": "ASUS TUF GAMING Z790-PLUS WIFI", "socket": "LGA1700", "ramType": "DDR5", "price": 239.00}
            ])";
        } else if (category == "memory") {
            categoryData = R"([
                {"id": "ram-1", "name": "G.Skill Trident Z5 Neo 32GB DDR5-6000", "ramType": "DDR5", "count": 2, "tdpWatts": 10, "price": 109.00}
            ])";
        } else if (category == "gpu") {
            categoryData = R"([
                {"id": "gpu-1", "name": "NVIDIA GeForce RTX 4070 Super", "tdpWatts": 220, "price": 599.00}
            ])";
        } else if (category == "storage") {
            categoryData = R"([
                {"id": "storage-1", "name": "Samsung 990 PRO 2TB NVMe SSD", "tdpWatts": 6, "price": 169.00}
            ])";
        } else if (category == "power-supply") {
            categoryData = R"([
                {"id": "psu-1", "name": "Corsair RM750e 750W 80+ Gold", "wattage": 750, "price": 99.00}
            ])";
        }
        if (!categoryData.empty()) {
            std::ostringstream ss;
            ss << "{\"status\": \"success\", \"category\": \"" << category << "\", \"data\": " << categoryData << "}\n";
            res.set_content(ss.str(), "application/json");
        } else {
            std::ostringstream ss;
            ss << "{\"status\": \"error\", \"message\": \"Invalid category requested: '" << category << "'\"}\n";
            res.status = 400; // Bad Request
            res.set_content(ss.str(), "application/json");
        }
    });
    std::cout << "Starting HTTP server on http://localhost:8080...\n";
    // svr.listen returns false if it fails to bind to the port
    if (!svr.listen("0.0.0.0", 8080)) {
        std::cerr << "Error: Failed to bind to port 8080! Is another instance running?\n";
        return 1;
    }
    return 0;
}