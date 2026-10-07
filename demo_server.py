"""Run the presentation website and hosted API adapter locally."""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from api.catalog import handler as CatalogHandler

ROOT = Path(__file__).resolve().parent

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def do_GET(self):
        if self.path.split('?')[0] in ('/v1/parts', '/api/catalog'):
            CatalogHandler.do_GET(self)
        else:
            super().do_GET()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8081'))
    print(f'Demo website: http://localhost:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
