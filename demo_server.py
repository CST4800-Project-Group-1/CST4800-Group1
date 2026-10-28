"""Run the presentation website and hosted API adapter locally."""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from api.catalog import handler as CatalogHandler

ROOT = Path(__file__).resolve().parent


def load_local_zenrows_key():
    """Load the key from the environment or ignored ZenRows CLI config."""
    key = os.environ.get("ZENROWS_API_KEY", "").strip()
    if key:
        return key
    try:
        secrets = json.loads((ROOT / ".zenrows" / "secrets.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    return str(secrets.get("apiKey", "")).strip()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def do_GET(self):
        if self.path.split('?')[0] in ('/v1/parts', '/api/catalog'):
            CatalogHandler.do_GET(self)
        else:
            super().do_GET()

if __name__ == '__main__':
    api_key = load_local_zenrows_key()
    if not api_key:
        raise SystemExit(
            "Set ZENROWS_API_KEY or add apiKey to the ignored "
            ".zenrows/secrets.json file."
        )
    os.environ['ZENROWS_API_KEY'] = api_key
    port = int(os.environ.get('PORT', '8081'))
    print(f'Demo website: http://localhost:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()

