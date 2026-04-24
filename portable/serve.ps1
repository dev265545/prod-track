# ProdTrack portable static server - no Node.js required.
# Serves the ./web folder on http://127.0.0.1:3847/ (same as serve.mjs).
# Works on Windows 7+ if .NET is installed (installed by default).
# Save this file as UTF-8 with BOM if you edit it on Windows 7.
#
# If Start fails with "Access is denied", run *once* as Administrator:
#   netsh http add urlacl url=http://127.0.0.1:3847/ user=Everyone

$ErrorActionPreference = "Stop"

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Root = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir "web"))
$Port = 3847
if ($env:PRODTRACK_PORT -match '^\d+$') { $Port = [int]$env:PRODTRACK_PORT }
$BindHost = "127.0.0.1"
if ($env:PRODTRACK_HOST) { $BindHost = $env:PRODTRACK_HOST }
$OpenBrowser = ($env:PRODTRACK_OPEN_BROWSER -eq "1")

$IndexPath = Join-Path $Root "index.html"
if (-not (Test-Path -LiteralPath $IndexPath)) {
  Write-Host "Missing web\index.html. Run pack-portable after build:web-sqlite (on a dev PC)."
  if ($Host.Name -eq "ConsoleHost") { [void][System.Console]::ReadKey($true) }
  exit 1
}

$WasmPath = Join-Path $Root "wasm\sql-wasm.wasm"
if (-not (Test-Path -LiteralPath $WasmPath)) {
  Write-Host "WARNING: Missing web\wasm\sql-wasm.wasm - the database step will NOT work." -ForegroundColor Yellow
  Write-Host "On your dev PC run: npm run build:web-sqlite   then   npm run pack-portable" -ForegroundColor Yellow
  Write-Host ""
}

# Name must not collide with $mime (PowerShell variables are case-insensitive).
$MimeByExtension = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json"
  ".wasm" = "application/wasm"
  ".ico"  = "image/x-icon"
  ".png"  = "image/png"
  ".webp" = "image/webp"
  ".svg"  = "image/svg+xml"
  ".woff2"= "font/woff2"
  ".txt"  = "text/plain; charset=utf-8"
}

$global:ProdTrack_Root = $Root
$global:ProdTrack_IndexPath = $IndexPath
$global:ProdTrack_MimeByExtension = $MimeByExtension

# Global scope so older PowerShell / odd hosts always see these during the request loop.
function Global:ProdTrackResolvePath {
  param([string]$RawUrl)
  if ([string]::IsNullOrEmpty($RawUrl)) { $RawUrl = "/" }
  $p = ($RawUrl -split '\?')[0]
  if ($p -match [char]0) { return $null }
  $p = $p -replace '\\', '/'
  if (-not $p.StartsWith("/")) { $p = "/" + $p }
  $p = $p.TrimEnd('/')
  if ($p -eq "" -or $p -eq "/") {
    return $global:ProdTrack_IndexPath
  }
  $rel = $p.Substring(1)
  $sep = [System.IO.Path]::DirectorySeparatorChar
  $relOs = $rel.Replace([char]0x2F, $sep)
  $direct = [System.IO.Path]::GetFullPath((Join-Path $global:ProdTrack_Root $relOs))
  if ((Test-Path -LiteralPath $direct) -and -not (Test-Path -LiteralPath $direct -PathType Container)) {
    return $direct
  }
  $asHtml = [System.IO.Path]::GetFullPath((Join-Path $global:ProdTrack_Root ($relOs + ".html")))
  if (Test-Path -LiteralPath $asHtml) { return $asHtml }
  $asIndex = [System.IO.Path]::GetFullPath((Join-Path $global:ProdTrack_Root (Join-Path $relOs "index.html")))
  if (Test-Path -LiteralPath $asIndex) { return $asIndex }

  # Missing static assets must not fall back to index.html (breaks .wasm).
  $leaf = Split-Path -Leaf $relOs
  $dotIx = $leaf.LastIndexOf(".")
  if ($dotIx -gt 0) {
    $assetExt = $leaf.Substring($dotIx).ToLowerInvariant()
    $noSpaFallbackExts = @(".wasm",".js",".mjs",".css",".map",".json",".png",".ico",".svg",".webp",".woff2",".txt",".woff",".ttf",".eot")
    if ($noSpaFallbackExts -contains $assetExt) { return $null }
  }
  return $global:ProdTrack_IndexPath
}

function Global:ProdTrackTestUnderRoot {
  param([string]$FilePath)
  $f = [System.IO.Path]::GetFullPath($FilePath)
  $r = [System.IO.Path]::GetFullPath($global:ProdTrack_Root)
  $sep = [System.IO.Path]::DirectorySeparatorChar
  return ($f -eq $r) -or ($f.StartsWith($r + $sep, [System.StringComparison]::OrdinalIgnoreCase))
}

function Global:ProdTrackGetMime {
  param([string]$Path)
  $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  $mapped = $global:ProdTrack_MimeByExtension[$ext]
  if ($mapped -ne $null) { return $mapped }
  return "application/octet-stream"
}

function Global:ProdTrackOpenBrowser {
  param([string]$Url)
  $pf = [Environment]::GetEnvironmentVariable("ProgramFiles")
  if (-not $pf) { $pf = "C:\Program Files" }
  $chrome = Join-Path $pf "Google\Chrome\Application\chrome.exe"
  if (Test-Path -LiteralPath $chrome) {
    Start-Process -FilePath $chrome -ArgumentList $Url
    return
  }
  $pf86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if (-not $pf86) { $pf86 = "C:\Program Files (x86)" }
  $edge = Join-Path $pf86 "Microsoft\Edge\Application\msedge.exe"
  if (Test-Path -LiteralPath $edge) {
    Start-Process -FilePath $edge -ArgumentList $Url
    return
  }
  Start-Process $Url
}

$prefix = "http://${BindHost}:${Port}/"
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($prefix)

try {
  $Listener.Start()
} catch {
  Write-Host "Could not start web listener on $prefix"
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "If this says access denied, open CMD as Administrator *one time* and run:"
  Write-Host "  netsh http add urlacl url=$prefix user=Everyone"
  Write-Host ""
  if ($Host.Name -eq "ConsoleHost") { pause }
  exit 1
}

$displayUrl = "http://${BindHost}:${Port}/"
Write-Host "ProdTrack: $displayUrl"
Write-Host "Use Google Chrome (required for saving your database file on this app)."
Write-Host "Close this window when finished (the app will stop)."
Write-Host ""

if ($OpenBrowser) {
  try { ProdTrackOpenBrowser $displayUrl } catch { Write-Host "(Could not open browser automatically. Open the link above.)" }
}

while ($Listener.IsListening) {
  try {
    $Context = $Listener.GetContext()
  } catch {
    break
  }
  $Request = $Context.Request
  $Response = $Context.Response
  $rawPath = $Request.Url.AbsolutePath
  try {
    try {
      $decodedPath = [System.Uri]::UnescapeDataString($rawPath)
    } catch {
      $decodedPath = $rawPath
    }
    $filePath = ProdTrackResolvePath $decodedPath
    if (-not $filePath) {
      $Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      $Response.ContentLength64 = $bytes.Length
      $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } elseif (-not (ProdTrackTestUnderRoot $filePath)) {
      $Response.StatusCode = 403
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
      $Response.ContentLength64 = $bytes.Length
      $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } elseif (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      $Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      $Response.ContentLength64 = $bytes.Length
      $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $contentType = ProdTrackGetMime $filePath
      $data = [System.IO.File]::ReadAllBytes($filePath)
      $Response.StatusCode = 200
      $Response.ContentType = $contentType
      $Response.Headers.Add("Cache-Control", "no-store")
      $Response.ContentLength64 = $data.LongLength
      $Response.OutputStream.Write($data, 0, $data.Length)
    }
  } finally {
    $Response.OutputStream.Close()
    $Response.Close()
  }
}
