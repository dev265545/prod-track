/**
 * Patch tauri.conf.json to use fixed WebView2 runtime (Windows 7 bundle).
 * Run only in CI after setup-webview2.ps1 has populated webview2-fixed-runtime.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");

const conf = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
conf.bundle.windows.webviewInstallMode = {
  type: "fixedRuntime",
  path: "./webview2-fixed-runtime/",
};

fs.writeFileSync(tauriPath, JSON.stringify(conf, null, 2) + "\n");
console.log("Patched tauri.conf.json to use fixed WebView2 runtime");
