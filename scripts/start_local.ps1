<#
  Run everything on this computer: one prediction cycle, then the backend API (http://localhost:8787) and the frontend
  (http://localhost:3000), each in its own window, like the two separate hosts in production.

  Needs (all git-ignored):
    .env              DATABASE_URL for the Python jobs (see .env.example)
    api\.dev.vars     DATABASE_URL, ALLOWED_ORIGINS, DEV_USER_EMAIL, SESSION_SECRET, SETTINGS_KEY (see api\.dev.vars.example)
    web\.env.local    NEXT_PUBLIC_API_URL=http://localhost:8787 (see web\.env.example)
  Use a Neon test branch, not the live database, so local readings do not mix with the live Prediction Log.

  Usage:  .\scripts\start_local.ps1          (one prediction cycle, then API + website)
          .\scripts\start_local.ps1 -Loop    (also keeps predicting every 15 minutes in its own window)
          .\scripts\start_local.ps1 -SkipTick
#>
param([switch]$Loop, [switch]$SkipTick)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

foreach ($f in ".env", "api\.dev.vars", "web\.env.local") {
    if (-not (Test-Path $f)) { Write-Host "Missing $f. See the comments at the top of this script." -ForegroundColor Red; exit 1 }
}
foreach ($d in "api", "web") {
    if (-not (Test-Path "$d\node_modules")) {
        Write-Host "Installing $d packages (first time only)..." -ForegroundColor Cyan
        Push-Location $d; npm install; Pop-Location
    }
}

if (-not $SkipTick) {
    Write-Host "Prediction cycle (prices, news, models)..." -ForegroundColor Cyan
    python run.py all tick
}
if ($Loop) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; python run.py all loop --every 900"
    Write-Host "Predicting every 15 minutes in a separate window (close it to stop)." -ForegroundColor Cyan
}

function Wait-Up($url) {
    for ($i = 0; $i -lt 150; $i++) {  # up to 5 minutes: the first `wrangler dev` downloads its local runtime
        try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true } catch { Start-Sleep -Seconds 2 }
    }
    return $false
}

Write-Host "Starting the backend API (port 8787)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\api'; npm run dev"
if (-not (Wait-Up "http://localhost:8787/api/health")) { Write-Host "The API did not start; look at its window." -ForegroundColor Red; exit 1 }

Write-Host "Starting the frontend (port 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\web'; npm run dev"
Wait-Up "http://localhost:3000/login" | Out-Null
Start-Process "http://localhost:3000"
Write-Host "Frontend: http://localhost:3000   API: http://localhost:8787   (close their windows to stop)" -ForegroundColor Green
