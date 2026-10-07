"""Presentation API adapter; the C++ backend remains in backend/main.cpp."""
import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            catalog = json.loads((Path(__file__).resolve().parents[1] / "backend/data/sample_parts.json").read_text())
            body = {"status": "success", "data": catalog}
            status = 200
        except (OSError, ValueError):
            body = {"error": "Catalog data is currently unavailable."}
            status = 503
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
