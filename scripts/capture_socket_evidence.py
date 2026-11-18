"""Capture the actual local API handler's live CPU/motherboard responses.

Run from the repository root: python -m scripts.capture_socket_evidence
Uses the existing local/environment ZenRows key without printing it.
"""
import argparse
import io
import json
import os
from pathlib import Path

from api import catalog
from api.socket_metadata import utc_time
from demo_server import load_local_zenrows_key


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=6, choices=range(1, 26), metavar="1..25")
    parser.add_argument("--output", default="docs/scrum-22-live-response.json")
    args = parser.parse_args()
    key = load_local_zenrows_key()
    if not key:
        raise SystemExit("Configure the existing local ZenRows key before capturing live evidence.")
    os.environ["ZENROWS_API_KEY"] = key
    catalog.MAX_PRODUCTS_PER_CATEGORY = args.limit
    captured = {"capturedAt": utc_time(catalog.time.time()), "recordLimitPerCategory": args.limit,
                "captureMethod": "local API handler with live retailer fetches; not deployed HTTP", "responses": {}}
    for category in ("cpu", "motherboard"):
        instance = object.__new__(catalog.handler)
        instance.path = "/api/catalog?category=" + category
        instance.wfile = io.BytesIO()
        headers = {}
        instance.send_response = lambda status: headers.update(status=status)
        instance.send_header = lambda name, value: headers.update({name: value})
        instance.end_headers = lambda: None
        instance.do_GET()
        body = json.loads(instance.wfile.getvalue())
        captured["responses"][category] = {"headers": headers, "body": body}
        records = body.get("data", {}).get("parts", [])
        count = sum(record.get("specs", {}).get("socket") is not None for record in records)
        print(f"{category}: HTTP {headers['status']}, {len(records)} records, {count} verified sockets", flush=True)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(captured, indent=2) + "\n", encoding="utf-8")
    print(f"Saved historical evidence to {output}", flush=True)


if __name__ == "__main__":
    main()
