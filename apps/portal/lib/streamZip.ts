import { UTApi } from "uploadthing/server";

import type { ReleaseAssetInfo } from "@/lib/github";

/**
 * Stream the portable ZIP bytes. UploadThing files are private: we mint a
 * short-lived signed URL on the server (never exposed to the browser as HTML).
 */
export async function fetchZipUpstream(info: ReleaseAssetInfo): Promise<Response> {
  if (info.uploadthingFileKey) {
    const token = process.env.UPLOADTHING_TOKEN?.trim();
    if (!token) {
      throw new Error(
        "UPLOADTHING_TOKEN must be set on the portal server when releases use UploadThing (private files).",
      );
    }
    const utapi = new UTApi({ token });
    const { ufsUrl } = await utapi.generateSignedURL(info.uploadthingFileKey, {
      expiresIn: "5 minutes",
    });
    const upstream = await fetch(ufsUrl, { redirect: "follow" });
    return upstream;
  }

  const gh = process.env.GITHUB_TOKEN?.trim();
  const url = info.browserDownloadUrl;
  if (!url) {
    throw new Error("No download URL resolved for this release.");
  }

  if (info.apiAssetUrl && gh) {
    return fetch(info.apiAssetUrl, {
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${gh}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  }

  return fetch(url, {
    redirect: "follow",
    headers: gh ? { Authorization: `Bearer ${gh}` } : {},
  });
}
