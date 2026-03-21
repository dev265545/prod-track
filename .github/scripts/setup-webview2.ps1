# Download and extract fixed WebView2 runtime for Tauri bundle (Windows 7).
# Usage: .\setup-webview2.ps1 -CabName "Microsoft.WebView2.FixedVersionRuntime.109.0.1518.78.x64.cab"
param(
  [Parameter(Mandatory = $true)]
  [string] $CabName
)

$ErrorActionPreference = "Stop"
$release = "109.0.1518.78"
$url = "https://github.com/westinyang/WebView2RuntimeArchive/releases/download/$release/$CabName"

$root = Join-Path $PSScriptRoot "../.."
$tauri = Join-Path $root "src-tauri"
$out = Join-Path $tauri "webview2-fixed-runtime"
$tmp = Join-Path $tauri "webview2-cab-tmp"

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$cabPath = Join-Path $tmp "webview.cab"
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $cabPath

$extracted = Join-Path $tmp "extracted"
New-Item -ItemType Directory -Force -Path $extracted | Out-Null

& expand.exe $cabPath -F:* $extracted
if ($LASTEXITCODE -ne 0) { throw "expand.exe failed with exit $LASTEXITCODE" }

$inner = Get-ChildItem $extracted -Directory | Select-Object -First 1
if (-not $inner) { throw "No directory inside CAB extract" }

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force -Path $out | Out-Null

Get-ChildItem $inner.FullName | Move-Item -Destination $out

$exe = Join-Path $out "msedgewebview2.exe"
if (-not (Test-Path $exe)) { throw "msedgewebview2.exe missing after extract" }

Remove-Item -Recurse -Force $tmp
Write-Host "WebView2 runtime ready at $out"
