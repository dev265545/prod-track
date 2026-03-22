# prodtrack-lite

TypeScript application with one React UI shipped two ways: **Next.js static export** (`out/`) and a **Tauri 2** desktop bundle. Persistence is **IndexedDB** in the browser and **SQLite** under Tauri; a small adapter selects the backend at runtime.

---

## Architecture notes

- **Runtime-aware data access** — `lib/db/adapter.ts` exposes one API over **IndexedDB** (web) and **SQLite** via Tauri `invoke` (desktop), so callers do not depend on a specific store implementation.
- **Static export for embedding** — `next.config.js` sets `output: "export"` in production so the UI is static assets consumed by Tauri as `frontendDist`. Development uses the normal Next.js dev server.
- **Tauri without breaking static export** — `lib/tauriBridge.ts` calls `window.__TAURI__?.core?.invoke` so the production JS bundle is not tied to `@tauri-apps/*` module graphs that complicate `next build` export. DB, dialogs, opener, and printing go through this path when `__TAURI__` is present.
- **Rust / SQLite** — `src-tauri` uses **rusqlite** (bundled libsqlite3), **serde** / **serde_json** for IPC payloads, and Tauri v2 plugins: dialog, log, opener, printer. File save/open for DB backup uses the **dialog** plugin from Rust.
- **Versioned JSON export/import** — `lib/db/exportImport.ts` defines export format version, schema version, and validation before applying imported data.
- **Browser SQLite files** — `lib/db/sqliteBrowser.ts` uses **sql.js** (WASM) to build or read `.db` files in the same **table-per-store** shape as the Rust side when not running inside Tauri.
- **Client-side gate** — `lib/auth.ts`: password hashing via **Web Crypto** (`SubtleCrypto`), session timestamp in `localStorage`. Local-first only; not server authentication.
- **UI** — React 18, App Router, Radix primitives, Tailwind CSS 4, CVA / `tailwind-merge`, `next-themes`.

---

## Stack

| Area | Technology |
|------|------------|
| Language | TypeScript (**strict**), JavaScript on legacy/excluded paths |
| UI | React 18, Next.js 14 (App Router) |
| Styling | Tailwind CSS 4, PostCSS, `tw-animate-css` |
| Components | Radix UI primitives, shadcn-style patterns (`class-variance-authority`, `tailwind-merge`, `clsx`) |
| Icons | Lucide React |
| Theming | `next-themes` |
| Dates | `date-fns`, `react-day-picker` |
| Data (web) | IndexedDB |
| Data (desktop) | SQLite (Rust `rusqlite`, bundled) |
| Desktop shell | Tauri **2** (Rust **2021**), custom `__TAURI__` bridge |
| WASM | `sql.js` for in-browser SQLite `.db` build and ingest |
| Parsing | PapaParse (CSV) |
| Tooling | ESLint (`eslint-config-next`), esbuild (toolchain) |

---

## CI / releases

Workflow: `.github/workflows/release.yml`

- Matrix: Windows **x64** and **x86** Tauri builds (`fail-fast: false`).
- **pnpm** + lockfile, Node **LTS**; Rust **stable**; **swatinem/rust-cache** for `src-tauri`.
- **Fixed WebView2** runtime (v109 CAB) plus `.github/scripts/use-fixed-webview.js` so bundles target **Windows 7 SP1+** with a known runtime, not only machines with a current Edge install.
- Version bump: `.github/scripts/bump-version.js`; artifacts published with **tauri-apps/tauri-action** to GitHub Releases.

---

## Prerequisites

- **Node.js** (LTS; CI uses `lts/*`)
- **pnpm** (lockfile + Actions)
- **Rust stable** + Tauri prerequisites — for `tauri dev` / `tauri build` only

---

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm run dev` | Next.js dev server (Tauri dev uses port **1420** in `src-tauri/tauri.conf.json`) |
| `pnpm run build` | Production Next build → static **`out/`** when `NODE_ENV=production` |
| `pnpm run start` | Next production server |
| `pnpm run lint` | ESLint |
| `pnpm run tauri:dev` | Desktop shell + dev server |
| `pnpm run tauri:build` | Static frontend + native bundle |

---

## Build outputs

- **Web (static):** `out/` — Next static export; Tauri `frontendDist` points here.
- **Desktop:** Artifacts under `src-tauri/target/` per target triple.

---

## Repository layout (high level)

```
app/           Next.js App Router routes and layouts
components/    Shared React UI (`components/ui`, app shell)
lib/           Services, DB adapter, export/import, Tauri bridge, auth utilities
src-tauri/     Rust crate, Tauri config, icons, capabilities
public/        Static assets
```

Legacy or reference code may live under `js/`; `tsconfig.json` excludes some of it. Current application code lives under **`app/`**, **`components/`**, and **`lib/`**.

---

## Configuration files

- `next.config.js` — conditional static export for Tauri, React Strict Mode
- `tsconfig.json` — `strict`, path alias `@/*` → project root
- `tailwind.config.ts` / PostCSS — styling pipeline
- `src-tauri/tauri.conf.json` — windowing, dev URL, bundle identifiers
- `src-tauri/Cargo.toml` — Rust edition, `rusqlite`, Tauri plugins
