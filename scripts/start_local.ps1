<#
  Run everything on this computer: one prediction cycle, then the website at http://localhost:3000.

  Needs .env (repo root) and web\.env.local with DATABASE_URL (see .env.example and web\.dev.vars.example).
  Use a Neon test branch there, not the live database, so local readings do not mix with the live Prediction Log.

  Usage:  .\scripts\start_local.ps1          (one prediction cycle, then the website)
          .\scripts\start_local.ps1 -Loop    (also keeps predicting every 15 minutes in its own window)
          .\scripts\start_local.ps1 -SkipTick
#>
param([switch]$Loop, [switch]$SkipTick)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

foreach ($f in ".env", "web\.env.local") {
    if (-not (Test-Path $f)) { Write-Host "Missing $f (needs DATABASE_URL). See docs/DEPLOY.md." -ForegroundColor Red; exit 1 }
}
if (-not (Test-Path "web\node_modules")) {
    Write-Host "Installing website packages (first time only)..." -ForegroundColor Cyan
    Push-Location web; npm install; Pop-Location
}

if (-not $SkipTick) {
    Write-Host "Prediction cycle (prices, news, models)..." -ForegroundColor Cyan
    python run.py all tick
}
if ($Loop) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; python run.py all loop --every 900"
    Write-Host "Predicting every 15 minutes in a separate window (close it to stop)." -ForegroundColor Cyan
}

Write-Host "Starting the website..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\web'; npm run dev"
for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Seconds 2 }
}
Start-Process "http://localhost:3000"
Write-Host "Open: http://localhost:3000  (close the website window to stop it)" -ForegroundColor Green
