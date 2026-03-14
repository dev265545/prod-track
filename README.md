# ProdTrack Lite

Lightweight production & payroll tracking. **Dev** uses Tailwind CDN + ES modules; **build** outputs a single JS bundle and a single CSS with only the Tailwind classes you use (no CDN, fully offline).

## Development

```bash
npm install
npm run dev
```

Then open the URL (e.g. http://localhost:3000). Uses Tailwind CDN + modular JS. Requires a server (e.g. `npx serve`) because of ES modules.

## Build (offline dist)

```bash
npm run build
```

Produces **dist/**:

- **dist/app.js** – All JS in one file (no `import`/`export`), works with `file://` or any server.
- **dist/app.css** – Tailwind scans `index.html` and `js/**/*.js`, keeps only the classes you use, plus your custom (shadcn-style) styles. No CDN.
- **dist/index.html** – References `app.js` and `app.css`; open it in a browser and it works fully offline.

So in dev you get the CDN and full Tailwind; in build the CDN is “replaced” by a single CSS that has exactly the classes you use.

## Using the built app

Open **dist/index.html** in a browser (double‑click or drag into the window). No server, no internet. Data is stored in IndexedDB.

## Features

- **Dashboard** – Daily production by item, quick add, salary summary for current period
- **Employee page** – Production entries, advances, period-based salary, **printable salary sheet**
- **Aggregated production** – Table by date × item (total qty & value)
- **Settings** – Items & employees CRUD, **delete historical data** (productions/advances before a date)
- **16th–15th pay period** – Periods auto-computed by month/year

## Data (IndexedDB)

- **prodtrack-db** v2  
  Stores: `items`, `employees`, `productions`, `advances`, `advance_deductions`  
  All data stays in the browser; works fully offline.

### Export / Import

- **Settings → Export / Import**
  - **Export database** – Downloads a JSON file with all data. Use it as a backup or to move to another device/browser.
  - **Import from file** – Choose a previously exported JSON file to replace current data.
  - **Auto import** – If the app is served over HTTP (e.g. `npm run dev`), it can load data from **dist/data/prodtrack-export.json**. Place your export file there (rename the downloaded export to `prodtrack-export.json`), then click **Auto import** to load it. Useful when opening the app in a new browser or after a fresh deploy.

## Structure

```
/prodtrack
  index.html
  js/
    db/         indexeddb.js, schema.js
    services/   productionService, employeeService, itemService, advanceService, salaryService
    ui/         dashboard, employeePage, reports, settings
    utils/      date.js (period logic), formatter.js
    app.js      entry & hash router
```

## Period logic

Pay period = **16th of month N → 15th of month N+1**.  
`getPeriodForDate(date)` returns `{ from, to, label }`. Period selector uses this for salary and reports.

## Delete historical data

Settings → **Delete historical data** → choose “before date” → confirm.  
Removes all productions and advances before that date (irreversible).
