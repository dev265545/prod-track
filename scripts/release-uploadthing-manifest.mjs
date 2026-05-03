/**
 * CI: upload portable ZIP to UploadThing (stable customId = replace previous),
 * then write portal-manifest.json for the GitHub Release (portal reads this).
 *
 * Env:
 *   UPLOADTHING_TOKEN — UploadThing API token (same app as the portal uses to
 *   stream private files). Files are uploaded with acl **private**; only the
 *   portal server (with this token + your ACCESS_KEY gate) can mint short-lived
 *   download URLs.
 *   ZIP_PATH — path to ProdTrack-portable-x.y.z.zip
 *   VERSION — e.g. 0.1.26
 *   TAG — e.g. v0.1.26
 *   PUBLISHED_AT — ISO8601 UTC (optional; default now)
 *
 * Reads markdown bodies from portable/docs/*.md (must exist — run generate-portable-user-docs first).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UTApi, UTFile } from "uploadthing/server";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CUSTOM_ID = "prodtrack-portable-latest";

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function unwrapUploadResult(res) {
  if (!res || typeof res !== "object") {
    throw new Error("Unexpected UploadThing response shape");
  }
  if ("error" in res && res.error) {
    throw new Error(
      `UploadThing upload failed: ${JSON.stringify(res.error).slice(0, 500)}`,
    );
  }
  if ("data" in res && res.data) {
    return res.data;
  }
  if ("ufsUrl" in res) {
    return res;
  }
  throw new Error(
    `Unexpected UploadThing response: ${JSON.stringify(res).slice(0, 300)}`,
  );
}

const token = process.env.UPLOADTHING_TOKEN?.trim();
const zipPath = process.env.ZIP_PATH?.trim();
const version = process.env.VERSION?.trim();
const tag = process.env.TAG?.trim();
const publishedAt =
  process.env.PUBLISHED_AT?.trim() || new Date().toISOString();

if (!token) {
  console.log(
    "UPLOADTHING_TOKEN unset — skipping UploadThing; no portal-manifest.json (portal will use GitHub .zip on latest release).",
  );
  process.exit(0);
}
if (!zipPath || !fs.existsSync(zipPath)) {
  console.error("ZIP_PATH missing or file not found:", zipPath);
  process.exit(1);
}
if (!version || !tag) {
  console.error("VERSION and TAG are required.");
  process.exit(1);
}

const docsDir = path.join(root, "portable", "docs");
const changelogEn = readUtf8(path.join(docsDir, "CHANGELOG_USER_EN.md"));
const changelogHi = readUtf8(path.join(docsDir, "CHANGELOG_USER_HI.md"));
const userGuideEn = readUtf8(path.join(docsDir, "USER_GUIDE_EN.md"));
const userGuideHi = readUtf8(path.join(docsDir, "USER_GUIDE_HI.md"));

const buf = fs.readFileSync(zipPath);
const baseName = path.basename(zipPath);

const utapi = new UTApi({ token });

await utapi.deleteFiles(CUSTOM_ID, { keyType: "customId" }).catch(() => {
  /* first run: nothing to delete */
});

const file = new UTFile([buf], baseName, {
  customId: CUSTOM_ID,
  type: "application/zip",
});

const raw = await utapi.uploadFiles(file, {
  acl: "private",
  contentDisposition: "inline",
});

const uploaded = unwrapUploadResult(raw);
const fileKey = uploaded.key;
if (!fileKey) {
  throw new Error("Upload succeeded but no file key returned");
}

const manifest = {
  schemaVersion: 2,
  tag,
  version,
  publishedAt,
  filename: baseName,
  uploadthingFileKey: fileKey,
  changelogEn,
  changelogHi,
  userGuideEn,
  userGuideHi,
};

const outPath = path.join(root, "portal-manifest.json");
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
console.log("Wrote", outPath);
console.log("uploadthingFileKey:", fileKey, "(private — portal streams with UPLOADTHING_TOKEN)");
