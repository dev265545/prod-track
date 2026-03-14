# ProdTrack Lite – Next.js + shadcn migration

This document describes the changes made from the original vanilla JS app, how the app works now, and how to run development, web build, and (when added) desktop build.

---

## What changed

### Before

- **Frontend:** Vanilla JavaScript, hash-based routing (`#/`, `#/reports`, etc.), UI in `js/ui/`, services in `js/services/`.
- **Data:** IndexedDB via `js/db/indexeddb.js` and `js/db/schema.js`.
- **Build:** `build.js` (esbuild + Tailwind CLI) produced `dist/index.html`, `dist/app.js`, `dist/app.css`.

### After

- **Frontend:** Next.js 14 (App Router) + React. UI uses shadcn-style components in `components/ui/` and feature components in `components/`. Pages: `/`, `/login`, `/reports`, `/settings`, `/employee/[id]`.
- **Data:** Same logical schema (items, employees, productions, advances, advance_deductions). A **DB adapter** in `lib/db/adapter.ts` chooses the backend at runtime:
  - **Web (browser):** IndexedDB via `lib/db/indexeddb.ts`.
  - **Desktop (Tauri):** When `window.__TAURI__` is set, the adapter uses `lib/db/tauriDb.ts`, which calls Rust via `invoke()` to read/write SQLite. (Tauri + Rust are not yet scaffolded; see “Desktop build (Tauri)” below.)
- **Build:** Next.js with **static export** (`output: 'export'` in `next.config.js`). No Node server at runtime; the app runs fully offline in the browser.

---

## Project structure (new)


| Path                 | Purpose                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`               | Next.js App Router: `layout.tsx`, `page.tsx` (dashboard), `globals.css`, `login/page.tsx`, `reports/page.tsx`, `settings/page.tsx`, `employee/[id]/page.tsx`. |
| `components/`        | React components: `app-nav.tsx`, `dashboard.tsx`, `theme-provider.tsx`.                                                                                       |
| `components/ui/`     | shadcn-style primitives: `button`, `card`, `input`, `label`, `table`.                                                                                         |
| `lib/db/`            | DB layer: `schema.ts`, `indexeddb.ts` (web), `tauriDb.ts` (Tauri), `adapter.ts` (picks backend), `exportImport.ts`.                                           |
| `lib/services/`      | Business logic: `itemService`, `employeeService`, `productionService`, `advanceService`, `advanceDeductionService`, `salaryService`.                          |
| `lib/auth.ts`        | Client-side auth (session, app password, master password).                                                                                                    |
| `lib/utils/`         | `date.ts`, `formatter.ts`; plus `lib/utils.ts` (cn for Tailwind).                                                                                             |
| `next.config.js`     | `output: 'export'` for static HTML/JS/CSS.                                                                                                                    |
| `tailwind.config.ts` | Tailwind + theme variables (primary, muted, etc.).                                                                                                            |
| `components.json`    | shadcn config (New York, CSS variables).                                                                                                                      |


The old `js/`, `build.js`, and root `index.html` are unchanged and can be removed once you no longer need the legacy build.

---

## How things work now

1. **Entry:** User opens the app (dev server or static `out/`). Root layout wraps the app in `ThemeProvider` (next-themes) for dark/light mode.
2. **Auth:** If the user is not logged in or session is expired, they are redirected to `/login`. After a valid app password, `lib/auth` sets a session (localStorage); then they can use the app.
3. **DB:** On first use, the adapter calls `openDB()`. In the browser this opens IndexedDB and creates the schema. In Tauri (when added) it will call `invoke('init_db')` so the Rust side can create/open SQLite.
4. **Pages:** All data-heavy pages are client components (`"use client"`). They call `lib/services/`*, which use `lib/db/adapter`. So the same UI and services work on web (IndexedDB) and, later, on desktop (SQLite via Tauri).
5. **Export/Import:** Settings still export to JSON and import from file or from auto-import path. Export/import use the adapter, so they work with whichever backend is active.

---

## Development (web)

1. **Install dependencies**
  ```bash
   npm install
  ```
2. **Run the dev server**
  ```bash
   npm run dev
  ```
   Next.js runs (e.g. [http://localhost:3000](http://localhost:3000)). Open it in a browser. The app uses IndexedDB; no Tauri or Rust needed.
3. **Default login password:** `1968` (see `lib/auth.ts`). Master password for “delete all data” / “change app password”: `9319123410`.

---

## Web build (static, offline)

1. **Build**
  ```bash
   npm run build
  ```
   Next.js compiles and exports static files into the `**out/**` directory (not `dist/`).
2. **Use the built app**
  - **Option A:** Serve `out/` with any static server, e.g. `npx serve out`, and open the given URL.
  - **Option B:** Open `out/index.html` in a browser (e.g. from disk). The app runs fully offline; data is stored in IndexedDB for that origin.
3. **Deploy:** Upload the contents of `out/` to any static host (e.g. GitHub Pages, Netlify, or an internal server). No Node server is required at runtime.

---

## Desktop build (Tauri)

Tauri is **not** set up yet. The repo is prepared for it:

- `package.json` has scripts: `tauri`, `tauri:dev`, `tauri:build`, and dependency `@tauri-apps/api`.
- `lib/db/tauriDb.ts` and `lib/db/adapter.ts` are written to use Tauri’s `invoke()` when `window.__TAURI__` is defined.

To add the desktop app:

1. **Install Tauri CLI and scaffold**
  ```bash
   npm install -D @tauri-apps/cli
   npx tauri init
  ```
   When prompted:
  - **Existing frontend:** Yes.
  - **Build command:** `npm run build`
  - **Dev command:** `npm run dev`
  - **Frontend dist directory:** `../out` (Next.js static export writes to `out/`).
2. **Rust + SQLite:** In `src-tauri/`, add a dependency (e.g. `rusqlite` or `tauri-plugin-sql`). Implement Tauri commands: `init_db`, `db_get_all`, `db_get`, `db_put`, `db_remove`, `db_clear`, and run them from `lib/db/tauriDb.ts` via `invoke()`. Store the SQLite file in Tauri’s app data dir.
3. **Dev (desktop)**
  ```bash
   npm run tauri dev
  ```
   This builds the frontend (or runs the dev server, depending on config) and opens the Tauri window. The adapter will see `__TAURI__` and use SQLite.
4. **Production desktop build**
  ```bash
   npm run tauri build
  ```
   This produces the installer and app binary; SQLite is created at first run in the app data directory.

Until `src-tauri/` exists and these commands are implemented, only the **web** flow (dev + static build) is available.

---

## Summary


| Task              | Command               | Result                                                   |
| ----------------- | --------------------- | -------------------------------------------------------- |
| Development (web) | `npm run dev`         | Next.js dev server; open in browser; IndexedDB.          |
| Web build         | `npm run build`       | Static export in `out/`; serve or open `out/index.html`. |
| Desktop dev       | `npm run tauri dev`   | Requires Tauri + Rust + SQLite to be set up first.       |
| Desktop build     | `npm run tauri build` | Same requirement.                                        |


The type error in `lib/db/exportImport.ts` was fixed by typing the validated `stores` object as `Record<string, unknown>` when indexing with a string key so that `storesObj[name]` is valid.