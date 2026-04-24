/**
 * Verify asset paths were fixed for Tauri (no absolute /_next/ in HTML).
 * Exit 1 if fix failed.
 */
const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "../../out/index.html");
if (!fs.existsSync(htmlPath)) {
  console.error("verify-asset-paths: out/index.html not found");
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
if (html.includes('href="/_next/') || html.includes("href='/_next/")) {
  console.error("ERROR: Asset paths not fixed - still absolute");
  process.exit(1);
}
console.log("Asset paths OK");
