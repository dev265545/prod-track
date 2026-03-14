/**
 * ProdTrack Lite – build script
 * Bundles JS (esbuild), copies CSS, writes dist/index.html.
 * Output: dist/ is 100% offline (no CDN, no modules).
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// Ensure dist and dist/data exist (data folder for auto-import)
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
const dataDir = path.join(DIST, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

async function build() {
  // 1. Bundle JS (IIFE, no external deps) – works without type=module
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'js', 'app.js')],
    bundle: true,
    format: 'iife',
    outfile: path.join(DIST, 'app.js'),
    target: ['es2018'],
  });

  // 2. Tailwind: scan index + js for class names, output only used classes + custom → dist/app.css
  const { execSync } = require('child_process');
  const inputCss = path.join(ROOT, 'css', 'input.css');
  const outputCss = path.join(DIST, 'app.css');
  execSync(
    `npx tailwindcss -i "${inputCss.replace(/\\/g, '/')}" -o "${outputCss.replace(/\\/g, '/')}" --minify`,
    { stdio: 'inherit', cwd: ROOT, shell: true }
  );

  // 3. Bundle data file into HTML if present (so opening index.html from disk can auto-import).
  // Prefer prodtrack-export.json; else use newest prodtrack-export-*.json by name (e.g. ...-2026-03-15.json).
  let bundledDataScript = '';
  const dataExportPath = path.join(dataDir, 'prodtrack-export.json');
  let dataJson = null;
  if (fs.existsSync(dataExportPath)) {
    dataJson = fs.readFileSync(dataExportPath, 'utf8');
  } else {
    const dataFiles = fs.readdirSync(dataDir)
      .filter((f) => f.startsWith('prodtrack-export') && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a)); // newest first (prodtrack-export-2026-03-15 before 2026-02-28)
    if (dataFiles.length > 0) {
      dataJson = fs.readFileSync(path.join(dataDir, dataFiles[0]), 'utf8');
    }
  }
  if (dataJson) {
    try {
      JSON.parse(dataJson); // validate
      const escaped = dataJson.replace(/<\/script/gi, '<\\/script');
      bundledDataScript = `<script>window.__PRODTRACK_BUNDLED_DATA__=${escaped};</script>`;
    } catch (_) {
      console.warn('dist/data/prodtrack-export.json invalid JSON, skipping bundle.');
    }
  }

  // 4. Write dist/index.html – no CDN, no type=module, theme toggle, optional bundled data
  const distHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ProdTrack Lite</title>
  <link rel="stylesheet" href="app.css">
</head>
<body class="bg-[var(--background)] text-[var(--foreground)]">
  <div class="app-wrap no-print">
    <nav id="appNav" class="nav flex-wrap items-center justify-between">
      <div class="flex flex-wrap items-center gap-2">
        <a href="#/" class="nav-brand">ProdTrack Lite</a>
        <a href="#/" class="nav-link">Dashboard</a>
        <a href="#/reports" class="nav-link">Production report</a>
        <a href="#/settings" class="nav-link">Settings &amp; data</a>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" id="logoutBtn" class="rounded-lg border border-gray-300 dark:border-white/20 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">Logout</button>
        <button type="button" id="themeToggle" class="rounded-lg border border-gray-300 dark:border-white/20 dark:bg-white/5 dark:shadow-lg dark:shadow-black/50 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" title="Toggle dark mode" aria-label="Toggle dark mode">
          <span id="themeIcon">🌙</span>
        </button>
      </div>
    </nav>
    <main id="app"></main>
  </div>
  <script>
    (function() {
      var key = 'prodtrack-theme';
      var dark = localStorage.getItem(key) === 'dark' || (!localStorage.getItem(key) && window.matchMedia('(prefers-color-scheme: dark)').matches);
      function apply() {
        document.documentElement.classList.toggle('dark', dark);
        var icon = document.getElementById('themeIcon');
        if (icon) icon.textContent = dark ? '☀️' : '🌙';
      }
      apply();
      var btn = document.getElementById('themeToggle');
      if (btn) btn.addEventListener('click', function() {
        dark = !dark;
        localStorage.setItem(key, dark ? 'dark' : 'light');
        apply();
      });
    })();
  </script>
  ${bundledDataScript}
  <script src="app.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(DIST, 'index.html'), distHtml);

  console.log('Build done: dist/app.js, dist/app.css, dist/index.html');
  if (dataJson) console.log('Bundled dist/data export into index.html – Auto import works when opening from disk.');
  console.log('Open dist/index.html in a browser (or serve dist/) – works fully offline.');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
