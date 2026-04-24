import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = path.join(root, "out");
const destDir = path.join(root, "portable", "web");

if (!fs.existsSync(path.join(outDir, "index.html"))) {
  console.error("Missing out/index.html. Run: npm run build:web-sqlite");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.cpSync(outDir, destDir, { recursive: true });
console.log("Copied out/ -> portable/web/");
