# Build and release

## Build the Tauri app locally

### Prerequisites

- **Node.js** (LTS) and **pnpm**
- **Rust** (stable): https://rustup.rs
- **Platform deps (Linux):**  
  `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Commands

```bash
# Install dependencies
pnpm install

# Development (Next.js dev server + Tauri window)
pnpm tauri:dev

# Production build (output in src-tauri/target/release/bundle/)
pnpm tauri:build
```

Build artifacts:

- **Windows:** `src-tauri/target/release/bundle/msi/` and `nsis/`
- **macOS:** `src-tauri/target/release/bundle/dmg/` and `macos/`
- **Linux:** `src-tauri/target/release/bundle/appimage/`, `deb/`, `rpm/`

---

## Release on push to main (GitHub Actions)

Every **push to `main`** runs the workflow in `.github/workflows/release.yml`. It:

1. Builds the Tauri app on **Windows**, **Ubuntu**, and **macOS** (Intel + Apple Silicon).
2. Creates a **GitHub Release** with a unique tag per run: `v0.1.0-<run_number>` (e.g. `v0.1.0-5`).
3. Uploads the installers (MSI, DMG, AppImage, etc.) to that release.

So: **each push to main = one new release**, and the **latest release** is the latest run.

### One-time setup

1. **Repo on GitHub**  
   Push this repo to GitHub and use `main` as the default branch (or change the workflow branch in `release.yml`).

2. **Workflow permissions**  
   In the repo: **Settings → Actions → General → Workflow permissions**  
   Choose **“Read and write permissions”** so the action can create releases and upload assets. Save.

3. **Optional: bump version**  
   Release tag uses the app version from `src-tauri/tauri.conf.json` (`version`) plus the run number. To change the visible version (e.g. `v1.0.0-3`), update `version` in `tauri.conf.json` (and optionally `package.json`) before pushing.

### Push to create a release

```bash
git add .
git commit -m "Your changes"
git push origin main
```

Then open **Actions** on GitHub: the “Release” workflow runs and, when it finishes, a new release appears under **Releases** with installers for each platform.

### Manual run

You can also trigger the same workflow from the **Actions** tab: open “Release” and click **Run workflow** (branch: `main`).
