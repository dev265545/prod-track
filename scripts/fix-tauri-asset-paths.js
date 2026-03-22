/**
 * Fix asset paths for Tauri production build.
 * Next.js static export uses absolute paths (/_next/...) that fail to resolve
 * in Tauri's asset protocol. This script rewrites them to relative paths.
 *
 * Run after `next build` when building for Tauri.
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "out");

if (!fs.existsSync(OUT)) {
  console.error("fix-tauri-asset-paths: out/ not found. Run `next build` first.");
  process.exit(1);
}

function walkDir(dir, fn) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(full, fn);
    else fn(full);
  }
}

let htmlCount = 0;
let cssCount = 0;
let jsCount = 0;

walkDir(OUT, (file) => {
  const ext = path.extname(file);
  const rel = path.relative(OUT, file);
  let content = fs.readFileSync(file, "utf8");
  let changed = false;

  if (ext === ".html") {
    const next = content.replace(/\/_next\//g, "./_next/");
    if (next !== content) {
      content = next;
      changed = true;
      htmlCount++;
    }
  } else if (ext === ".css" && rel.replace(/\\/g, "/").startsWith("_next/static/css/")) {
    // In CSS files under _next/static/css/, url(/_next/static/media/x) must become url(../media/x)
    const next = content.replace(/url\(\/_next\/static\/media\//g, "url(../media/");
    if (next !== content) {
      content = next;
      changed = true;
      cssCount++;
    }
  } else if (ext === ".js") {
    // JS chunks may contain path strings (e.g. RSC payload, flight data)
    const next = content.replace(/\/_next\//g, "./_next/");
    if (next !== content) {
      content = next;
      changed = true;
      jsCount++;
    }
  }

  if (changed) fs.writeFileSync(file, content, "utf8");
});

console.log("fix-tauri-asset-paths: rewritten paths in", htmlCount, "HTML,", cssCount, "CSS,", jsCount, "JS files.");
