/**
 * Get current release version (latest v* tag or package.json), bump patch, write to package.json
 * and tauri.conf.json, and output the new version for the workflow.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getLatestTag() {
  try {
    const out = execSync('git tag -l "v*" --sort=-v:refname', {
      encoding: "utf-8",
    }).trim();
    const first = out.split("\n").filter(Boolean)[0];
    return first ? first.replace(/^v/, "") : null;
  } catch {
    return null;
  }
}

function parseVersion(v) {
  // Strip prerelease/build suffix (e.g. "0.1.0-12" -> "0.1.0")
  const base = String(v).split("-")[0];
  const parts = base.split(".").map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

function bumpPatch(v) {
  const { major, minor, patch } = parseVersion(v);
  return `${major}.${minor}.${patch + 1}`;
}

const root = path.resolve(__dirname, "../..");
const pkgPath = path.join(root, "package.json");
const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");

let current = getLatestTag();
if (!current) {
  current = require(pkgPath).version;
}

const newVersion = bumpPatch(current);

const pkg = require(pkgPath);
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const tauri = require(tauriPath);
tauri.version = newVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");

const outFile = process.env.GITHUB_OUTPUT;
if (outFile) {
  fs.appendFileSync(outFile, `version<<EOF\n${newVersion}\nEOF\n`);
}

console.log(`Bumped ${current} -> ${newVersion}`);
