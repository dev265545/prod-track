import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const wasmSrc = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const wasmDir = path.join(root, "public", "wasm");
const wasmDest = path.join(wasmDir, "sql-wasm.wasm");

if (!fs.existsSync(wasmSrc)) {
  console.error("Missing:", wasmSrc, "- run npm install");
  process.exit(1);
}
fs.mkdirSync(wasmDir, { recursive: true });
fs.copyFileSync(wasmSrc, wasmDest);
console.log("Copied sql-wasm.wasm -> public/wasm/");
