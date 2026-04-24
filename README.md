# prodtrack-lite

TypeScript app with one React UI, shipped in two main ways:

1. **Static web** (`out/`) — Next.js static export. Pick a **database backend at build time**:
   - **IndexedDB** (default `npm run build`) — data stays in the browser profile.
   - **SQLite file** (`npm run build:web-sqlite`) — **sql.js** (WASM) + **File System Access API**; user picks or creates a `.db` file (portable / USB-friendly). Same table layout as desktop.
2. **Tauri 2 desktop** (optional) — native shell with **SQLite** via Rust (`rusqlite`). Use `npm run tauri:dev` / `npm run tauri:build` when you need a desktop bundle instead of the browser.

`lib/db/adapter.ts` chooses **Tauri** → **sqlite-file** (env) → **IndexedDB** at runtime.

---

## Architecture notes

- **Runtime-aware data access** — One adapter API over **IndexedDB**, **sqlite-file** (`NEXT_PUBLIC_DB_BACKEND=sqlite-file`), and **Tauri/SQLite**, so app code does not depend on a specific store.
- **Static export** — `next.config.js` sets `output: "export"` in production so the UI is static assets (`out/`). The **GitHub Release** workflow builds the **sqlite-file** variant and packs `portable/` for Windows/Linux launcher scripts (local HTTP server + browser).
- **Tauri without tying the web bundle to Rust** — `lib/tauriBridge.ts` uses `window.__TAURI__?.core?.invoke` so the exported JS is not forced through `@tauri-apps/*` graphs. DB, dialogs, opener, and printing use that path when `__TAURI__` is present.
- **Rust / SQLite (desktop only)** — `src-tauri` uses **rusqlite**, **serde** / **serde_json**, Tauri v2 plugins (dialog, log, opener, printer). Backup/import file UI uses the **dialog** plugin from Rust when running in Tauri.
- **Browser SQLite (web, sqlite-file build)** — `lib/db/sqliteFileAdapter.ts` + **sql.js** WASM; persistence is a user-selected `.db` file. `lib/db/sqliteBrowser.ts` still handles import/export buffers in the same **table-per-store** shape as Rust/Tauri.
- **Versioned JSON export/import** — `lib/db/exportImport.ts` defines export format version, schema version, and validation before applying imported data.
- **Client-side gate** — `lib/auth.ts`: password hashing via **Web Crypto** (`SubtleCrypto`), session timestamp in `localStorage`. Local-first only; not server authentication.
- **Legacy browsers** — Theme uses sRGB fallbacks plus generated `app/generated/legacy-opacity-fallbacks.css` from `scripts/generate-legacy-opacity-fallbacks.mjs` (run via `npm run generate:legacy-css` or before `npm run build`).
- **UI** — React 18, App Router, Radix primitives, Tailwind CSS 4, CVA / `tailwind-merge`, `next-themes`.

---

## Stack

| Area              | Technology                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Language          | TypeScript (**strict**), JavaScript on legacy/excluded paths                                       |
| UI                | React 18, Next.js 14 (App Router)                                                                |
| Styling           | Tailwind CSS 4, PostCSS, `tw-animate-css`                                                          |
| Components        | Radix UI primitives, shadcn-style patterns (`class-variance-authority`, `tailwind-merge`, `clsx`) |
| Icons             | Lucide React                                                                                       |
| Theming           | `next-themes`                                                                                      |
| Dates             | `date-fns`, `react-day-picker`                                                                     |
| Data (web default)| IndexedDB                                                                                          |
| Data (web sqlite) | **sql.js** WASM + File System Access API (`NEXT_PUBLIC_DB_BACKEND=sqlite-file`)                    |
| Data (desktop)    | SQLite (**Rust `rusqlite`**, bundled) via Tauri                                                    |
| Desktop shell     | Tauri **2** (optional), custom `__TAURI__` bridge                                                  |
| WASM              | `sql.js` — bundled under `public/wasm/` for sqlite-file builds (`npm run copy-sql-wasm`)           |
| Parsing           | PapaParse (CSV)                                                                                    |
| Tooling           | ESLint (`eslint-config-next`), Vitest, esbuild (toolchain)                                         |

---

## CI / releases

Workflow: `.github/workflows/release.yml`

- **Portable web** — `npm ci`, `npm test`, `npm run build:web-sqlite`, `npm run pack-portable`, verify `portable/web/wasm/sql-wasm.wasm`, zip `portable/` as `ProdTrack-portable-<version>.zip`, publish with **softprops/action-gh-release**.
- Intended use: unzip, then run **`Start-ProdTrack.cmd`** (Windows) or **`Start-ProdTrack.sh`** (Linux/Ubuntu), and pick a `.db` file for SQLite-in-the-browser mode.

Tauri desktop builds are **not** part of that workflow; build them locally with `npm run tauri:build` when needed.

---

## Prerequisites

- **Node.js** (LTS; CI uses `lts/*`)
- **npm** (lockfile + Actions)
- **Rust stable** + Tauri prerequisites — **only** for `npm run tauri:dev` / `npm run tauri:build`

---

## Scripts

| Command                    | Purpose                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm install`              | Install dependencies                                                                                         |
| `npm run dev`              | Next.js dev server (**IndexedDB** backend; default env)                                                      |
| `npm run dev:web-sqlite`   | Dev server with **`NEXT_PUBLIC_DB_BACKEND=sqlite-file`** (SQLite file + WASM path)                           |
| `npm run copy-sql-wasm`    | Copy **sql.js** WASM into `public/wasm/` for sqlite-file builds                                              |
| `npm run generate:legacy-css` | Regenerate **legacy Chrome** rgba fallbacks (`app/generated/legacy-opacity-fallbacks.css`)                  |
| `npm run build`            | Runs `generate:legacy-css`, then production Next build → static **`out/`** (**IndexedDB** in client bundle) |
| `npm run build:web-sqlite` | `copy-sql-wasm` + `generate:legacy-css` + production build with **sqlite-file** backend baked in           |
| `npm run pack-portable`    | Assemble **`portable/`** folder for the Windows/Linux portable bundle (after `build:web-sqlite`)           |
| `npm run start`            | Next production server (if you use non-export mode in dev)                                                   |
| `npm run lint`             | ESLint                                                                                                       |
| `npm run test`             | Vitest                                                                                                       |
| `npm run tauri:dev`        | Tauri desktop + dev server (see `src-tauri/tauri.conf.json` for port)                                        |
| `npm run tauri:build`      | Static frontend + native Tauri bundle                                                                        |

---

## Build outputs

- **Web (static):** `out/` — Next static export. Point any static host at this folder, or use it as Tauri `frontendDist` when building desktop.
- **Portable bundle:** `portable/` — produced by `npm run pack-portable` after `npm run build:web-sqlite` (includes `portable/web/` + WASM + launcher scripts).
- **Desktop:** Tauri artifacts under `src-tauri/target/` per target triple.

---

## Repository layout (high level)

```
app/           Next.js App Router routes and layouts
components/    Shared React UI (`components/ui`, app shell)
lib/           Services, DB adapter, sqlite file + IndexedDB + Tauri DB, export/import, bridge, auth
public/wasm/   sql.js WASM (populated by `npm run copy-sql-wasm` for sqlite-file builds)
scripts/       e.g. `copy-sql-wasm.mjs`, `generate-legacy-opacity-fallbacks.mjs`, `pack-portable.mjs`
app/generated/ Generated CSS (legacy browser fallbacks; do not edit by hand)
src-tauri/     Rust crate, Tauri config, icons, capabilities (desktop only)
portable/      Packed portable web output (gitignored or release artifact)
```

Legacy or reference code may live under `js/`; `tsconfig.json` excludes some of it. Current application code lives under **`app/`**, **`components/`**, and **`lib/`**.

---

## Configuration files

- `next.config.js` — static export in production, React Strict Mode
- `tsconfig.json` — `strict`, path alias `@/*` → project root
- `tailwind.config.ts` / PostCSS — styling pipeline
- `src-tauri/tauri.conf.json` — windowing, dev URL, bundle identifiers (Tauri)
- `src-tauri/Cargo.toml` — Rust edition, `rusqlite`, Tauri plugins (Tauri)
