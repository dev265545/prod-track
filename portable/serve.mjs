/**
 * Minimal static server for ProdTrack portable (USB) web build.
 * Serves ./web (copy of Next static export). Optional if Node is installed; users normally run serve.ps1 (no Node).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "web");
const PORT = Number(process.env.PRODTRACK_PORT || 3847);
const HOST = process.env.PRODTRACK_HOST || "127.0.0.1";
const OPEN_BROWSER = process.env.PRODTRACK_OPEN_BROWSER === "1";

const MIME = {
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
};

function resolveFile(urlPath) {
  let p = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (p.includes("\0")) return null;
  p = path.posix.normalize(p.replace(/\\/g, "/"));
  if (!p.startsWith("/")) p = "/" + p;
  if (p.endsWith("/")) p = p.slice(0, -1) || "/";

  if (p === "/" || p === "") {
    return path.join(ROOT, "index.html");
  }

  const rel = p.slice(1); // strip leading /
  const direct = path.join(ROOT, rel);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }
  const asHtml = path.join(ROOT, `${rel}.html`);
  if (fs.existsSync(asHtml)) return asHtml;
  const asIndex = path.join(ROOT, rel, "index.html");
  if (fs.existsSync(asIndex)) return asIndex;

  const base = path.posix.basename(rel);
  const dot = base.lastIndexOf(".");
  if (dot > 0) {
    const assetExt = base.slice(dot).toLowerCase();
    const noSpaFallback = new Set([
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
    ]);
    if (noSpaFallback.has(assetExt)) return null;
  }
  return path.join(ROOT, "index.html");
}

function isUnderRoot(file) {
  const resolved = path.resolve(file);
  const rootResolved = path.resolve(ROOT);
  return resolved === rootResolved || resolved.startsWith(rootResolved + path.sep);
}

function tryOpenBrowser(url) {
  if (process.platform !== "win32") return;
  const chrome = path.join(
    process.env.ProgramFiles || "C:\\Program Files",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe"
  );
  const edge = path.join(
    process.env["ProgramFiles(x86)"] ||
      process.env.ProgramFiles ||
      "C:\\Program Files",
    "Microsoft",
    "Edge",
    "Application",
    "msedge.exe"
  );
  if (fs.existsSync(chrome)) {
    spawn(chrome, [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (fs.existsSync(edge)) {
    spawn(edge, [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("cmd", ["/c", "start", "", url], { shell: true, detached: true, stdio: "ignore" }).unref();
}

if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error(
    "Missing web/index.html. Run from project root:\n  npm run build:web-sqlite\n  npm run pack-portable"
  );
  process.exit(1);
}
const wasmFile = path.join(ROOT, "wasm", "sql-wasm.wasm");
if (!fs.existsSync(wasmFile)) {
  console.warn(
    "WARNING: Missing web/wasm/sql-wasm.wasm — database setup will fail. Run build:web-sqlite then pack-portable."
  );
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url || "/");
  if (!file) {
    res.writeHead(404).end("Not found");
    return;
  }
  if (!isUnderRoot(file)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`ProdTrack: ${url}`);
  console.log("Use Google Chrome or Microsoft Edge. Press Ctrl+C to stop.");
  if (OPEN_BROWSER) tryOpenBrowser(url);
});
