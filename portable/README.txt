ProdTrack — portable web (Chrome)
==================================

Who this is for
---------------
Use Google Chrome (this app picks a database file on disk or USB). Old Windows 7 PCs need the last Chrome that still supports Windows 7 — about version 109 — from a trusted archive if you still rely on that OS.


Setup on each PC
----------------
1. Copy this whole "portable" folder (must include the "web" folder).
2. Start launcher:
   - Windows: double-click "Start-ProdTrack.cmd" (no Node.js required).
   - Linux/Ubuntu: run "./Start-ProdTrack.sh" in a terminal.
   - Both launchers serve this folder on http://127.0.0.1:3847/
3. The browser should open to http://127.0.0.1:3847/ — complete onboarding and choose your .db file.


If the window says “Access is denied” when starting
-----------------------------------------------------
Run Command Prompt *once as Administrator* and execute:

  netsh http add urlacl url=http://127.0.0.1:3847/ user=Everyone

Then try "Start-ProdTrack.cmd" again. (Some PCs on Windows 7 need this.)


Optional: Node server (developers only)
---------------------------------------
If you prefer, you can still run "node serve.mjs" after installing Node — same behavior.


For developers
--------------
From the project repository:
  npm run build:web-sqlite
  npm run pack-portable

Zip the "portable" folder (with web/) for distribution.

Verify after pack-portable: you must have this file or SQLite will break in the browser:
  portable\web\wasm\sql-wasm.wasm
