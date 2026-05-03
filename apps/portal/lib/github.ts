export type PortalManifest = {
  schemaVersion: number;
  tag: string;
  version?: string;
  publishedAt: string;
  filename: string;
  /**
   * Private UploadThing file key — portal streams using UPLOADTHING_TOKEN (preferred).
   */
  uploadthingFileKey?: string;
  /** @deprecated Prefer uploadthingFileKey + private ACL; was used with public-read. */
  zipUrl?: string;
  changelogEn?: string;
  changelogHi?: string;
  userGuideEn?: string;
  userGuideHi?: string;
};

export type ReleaseAssetInfo = {
  filename: string;
  /** GitHub REST asset URL for the ZIP when streaming from GitHub. */
  apiAssetUrl: string | null;
  /**
   * HTTPS URL to stream (GitHub browser URL, LATEST_ZIP_URL, or legacy public zipUrl).
   * Null when using {@link uploadthingFileKey} instead.
   */
  browserDownloadUrl: string | null;
  /** When set, download uses UploadThing signed URLs (server-side token). */
  uploadthingFileKey: string | null;
  tag: string;
  publishedAt: string;
  changelogEn: string | null;
  changelogHi: string | null;
  userGuideEn: string | null;
  userGuideHi: string | null;
};

async function fetchLatestReleaseJson(
  repo: string,
  token: string,
): Promise<{
  tag_name: string;
  published_at: string;
  assets?: Array<{
    name: string;
    url: string;
    browser_download_url: string;
  }>;
}> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 60 },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }

  return (await res.json()) as {
    tag_name: string;
    published_at: string;
    assets?: Array<{
      name: string;
      url: string;
      browser_download_url: string;
    }>;
  };
}

function isManifest(x: unknown): x is PortalManifest {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const hasUtKey =
    typeof o.uploadthingFileKey === "string" && o.uploadthingFileKey.length > 0;
  const hasZipUrl = typeof o.zipUrl === "string" && o.zipUrl.length > 0;
  return (
    (hasUtKey || hasZipUrl) &&
    typeof o.filename === "string" &&
    typeof o.tag === "string"
  );
}

async function loadPortalManifest(
  browserUrl: string,
  token: string,
): Promise<PortalManifest | null> {
  const res = await fetch(browserUrl, {
    redirect: "follow",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  try {
    const j: unknown = await res.json();
    return isManifest(j) ? j : null;
  } catch {
    return null;
  }
}

export async function resolveLatestPortableZip(): Promise<ReleaseAssetInfo> {
  const direct = process.env.LATEST_ZIP_URL?.trim();
  if (direct) {
    let filename = "ProdTrack-portable.zip";
    try {
      const tail = new URL(direct).pathname.split("/").filter(Boolean).pop();
      if (tail?.endsWith(".zip")) filename = tail;
    } catch {
      /* keep default */
    }
    return {
      filename,
      apiAssetUrl: null,
      browserDownloadUrl: direct,
      uploadthingFileKey: null,
      tag: "latest",
      publishedAt: new Date().toISOString(),
      changelogEn: null,
      changelogHi: null,
      userGuideEn: null,
      userGuideHi: null,
    };
  }

  const repo = process.env.GITHUB_REPOSITORY?.trim();
  if (!repo || !repo.includes("/")) {
    throw new Error(
      "Set GITHUB_REPOSITORY=owner/repo (for GitHub Releases) or LATEST_ZIP_URL",
    );
  }

  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  const data = await fetchLatestReleaseJson(repo, token);
  const assets = data.assets ?? [];

  const manifestAsset = assets.find((a) => a.name === "portal-manifest.json");
  if (manifestAsset) {
    const manifest = await loadPortalManifest(
      manifestAsset.browser_download_url,
      token,
    );
    if (manifest) {
      const utKey =
        typeof manifest.uploadthingFileKey === "string" &&
        manifest.uploadthingFileKey.length > 0
          ? manifest.uploadthingFileKey
          : null;
      const legacyZip =
        typeof manifest.zipUrl === "string" && manifest.zipUrl.length > 0
          ? manifest.zipUrl
          : null;
      return {
        filename: manifest.filename,
        apiAssetUrl: null,
        browserDownloadUrl: utKey ? null : legacyZip,
        uploadthingFileKey: utKey,
        tag: manifest.tag,
        publishedAt: manifest.publishedAt,
        changelogEn: manifest.changelogEn ?? null,
        changelogHi: manifest.changelogHi ?? null,
        userGuideEn: manifest.userGuideEn ?? null,
        userGuideHi: manifest.userGuideHi ?? null,
      };
    }
  }

  const zip = assets.find((a) => a.name.endsWith(".zip"));
  if (!zip) {
    throw new Error("Latest release has no .zip asset");
  }

  return {
    filename: zip.name,
    apiAssetUrl: zip.url,
    browserDownloadUrl: zip.browser_download_url,
    uploadthingFileKey: null,
    tag: data.tag_name,
    publishedAt: data.published_at,
    changelogEn: null,
    changelogHi: null,
    userGuideEn: null,
    userGuideHi: null,
  };
}
