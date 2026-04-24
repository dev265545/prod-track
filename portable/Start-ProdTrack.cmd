@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "web\index.html" (
  echo The "web" folder is missing or empty.
  echo On your development machine run:
  echo   npm run build:web-sqlite
  echo   npm run pack-portable
  echo Then copy this whole "portable" folder ^(including web^) to the factory PC or USB drive.
  pause
  exit /b 1
)

set PRODTRACK_OPEN_BROWSER=1

REM No Node.js needed: Windows includes PowerShell (works on Windows 7+).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
