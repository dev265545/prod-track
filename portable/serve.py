#!/usr/bin/env python3
"""
ProdTrack portable static server (no Node.js required).
Serves ./web with Next.js export path resolution (/employees -> employees.html).
"""

from __future__ import annotations

import http.server
import mimetypes
import os
import socketserver
import sys
import webbrowser
from pathlib import Path
from urllib.parse import unquote, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = (SCRIPT_DIR / "web").resolve()
PORT = int(os.environ.get("PRODTRACK_PORT", "3847"))
HOST = os.environ.get("PRODTRACK_HOST", "127.0.0.1")
OPEN_BROWSER = os.environ.get("PRODTRACK_OPEN_BROWSER", "1") == "1"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}

NO_SPA_FALLBACK = {
    ".wasm",
    ".js",
    ".mjs",
    ".css",
    ".map",
    ".json",
    ".png",
    ".ico",
    ".svg",
    ".webp",
    ".woff2",
    ".txt",
    ".woff",
    ".ttf",
    ".eot",
}


def resolve_file(url_path: str) -> Path | None:
    parsed = urlparse(url_path or "/")
    p = unquote(parsed.path or "/")
    if "\0" in p:
        return None
    p = os.path.normpath(p).replace("\\", "/")
    if not p.startswith("/"):
        p = "/" + p
    if p.endswith("/"):
        p = p.rstrip("/") or "/"

    if p in ("", "/"):
        return ROOT / "index.html"

    rel = p.lstrip("/")
    direct = (ROOT / rel).resolve()
    if direct.is_file() and str(direct).startswith(str(ROOT)):
        return direct

    as_html = (ROOT / f"{rel}.html").resolve()
    if as_html.is_file() and str(as_html).startswith(str(ROOT)):
        return as_html

    as_index = (ROOT / rel / "index.html").resolve()
    if as_index.is_file() and str(as_index).startswith(str(ROOT)):
        return as_index

    leaf = Path(rel).name
    dot = leaf.rfind(".")
    if dot > 0:
        ext = leaf[dot:].lower()
        if ext in NO_SPA_FALLBACK:
            return None

    index = ROOT / "index.html"
    return index if index.is_file() else None


class ProdTrackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        file_path = resolve_file(self.path)
        if file_path is None:
            self.send_error(404, "Not found")
            return
        try:
            data = file_path.read_bytes()
        except OSError:
            self.send_error(404, "Not found")
            return

        ext = file_path.suffix.lower()
        content_type = MIME.get(ext) or mimetypes.guess_type(str(file_path))[0]
        if not content_type:
            content_type = "application/octet-stream"

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args) -> None:
        if os.environ.get("PRODTRACK_QUIET") == "1":
            return
        super().log_message(format, *args)


def main() -> int:
    if not (ROOT / "index.html").is_file():
        print(
            "Missing web/index.html. Run from project root:\n"
            "  npm run build:web-sqlite\n"
            "  npm run pack-portable",
            file=sys.stderr,
        )
        return 1

    wasm = ROOT / "wasm" / "sql-wasm.wasm"
    if not wasm.is_file():
        print(
            "WARNING: Missing web/wasm/sql-wasm.wasm — database setup will fail.",
            file=sys.stderr,
        )

    os.chdir(ROOT)
    url = f"http://{HOST}:{PORT}/"

    class ThreadingServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    with ThreadingServer((HOST, PORT), ProdTrackHandler) as httpd:
        print(f"ProdTrack: {url}")
        print("Press Ctrl+C to stop.")
        if OPEN_BROWSER:
            try:
                webbrowser.open(url)
            except OSError:
                print(f"Open this URL in your browser: {url}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
