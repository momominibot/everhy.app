#!/usr/bin/env python3
"""Local dev server for Ebb: like python3 -m http.server, but every response says no-store, so a reload always shows the
latest files (the plain server sends no cache headers and Chrome then reuses old scripts).
Run: python3 tools/devserver.py [port] [host]   (host defaults to 127.0.0.1; use 0.0.0.0 to open it on the phone)"""
import functools, http.server, sys
from pathlib import Path


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8096
host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
root = str(Path(__file__).resolve().parents[1])
http.server.ThreadingHTTPServer((host, port), functools.partial(NoStore, directory=root)).serve_forever()
