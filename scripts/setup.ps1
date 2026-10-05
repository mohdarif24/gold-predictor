<#
  One-command setup for Gold Predictor (Windows PowerShell 5.1 or 7).

  What YOU do first (a few minutes, only you can do these):
    1. Neon:       create a project at https://neon.tech and copy its connection string.
    2. Cloudflare: create an API token (template "Edit Cloudflare Workers") and note your Account ID.
    3. GitHub:     run `gh auth login` once (the account that owns the repository).

  What this script does for you:
    - checks the database connection and creates the tables
    - stores the secrets in GitHub Actions (nothing is written to a file in the repo)
    - runs the train workflow, then the predict workflow, and shows the result
    - registers the workers.dev address, deploys the site, and sets the Worker secrets
    - guides you through the one dashboard step that cannot be automated (Cloudflare Access login)

  Usage:   .\scripts\setup.ps1            (real run)
           .\scripts\setup.ps1 -DryRun    (prints every step, changes nothing, asks for nothing secret)
#>
param(
    [string]$Repo = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "   ok: $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   note: $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "   STOP: $text" -ForegroundColor Red; exit 1 }

function Read-Secret($prompt) {
    if ($DryRun) { return "dry-run-value" }
    $s = Read-Host -Prompt $prompt -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function Set-GhSecret($name, $value) {
    if ($DryRun) { Write-Host "   [dry-run] gh secret set $name --repo $Repo"; return }
    & gh secret set $name --repo $Repo --body $value | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "could not set GitHub secret $name" }
    Ok "GitHub secret $name saved"
}

function Run-Workflow($file) {
    if ($DryRun) { Write-Host "   [dry-run] gh workflow run $file ; gh run watch"; return $true }
    $before = (& gh run list --repo $Repo --workflow $file --limit 1 --json databaseId --jq '.[0].databaseId' 2>$null)
    & gh workflow run $file --repo $Repo | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "could not start workflow $file" }
    $id = $before
    for ($i = 0; $i -lt 30 -and $id -eq $before; $i++) {
        Start-Sleep -Seconds 4
        $id = (& gh run list --repo $Repo --workflow $file --limit 1 --json databaseId --jq '.[0].databaseId' 2>$null)
    }
    Write-Host "   running: https://github.com/$Repo/actions/runs/$id"
    & gh run watch $id --repo $Repo --interval 10 --exit-status | Out-Null
    return ($LASTEXITCODE -eq 0)
}

# ---------------------------------------------------------------- 0. tools
Step "Checking tools"
foreach ($t in "gh", "python", "node", "npx") {
    if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Fail "$t is not installed or not on PATH" }
}
if (-not $DryRun) {
    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) { Fail "GitHub CLI is not logged in. Run: gh auth login" }
}
if (-not $Repo) {
    $remote = (& git remote get-url origin 2>$null)
    if ($remote -match "github.com[:/]([^/]+/[^/.]+)") { $Repo = $Matches[1] } else { Fail "pass -Repo owner/name" }
}
Ok "repository: $Repo"

# ---------------------------------------------------------------- 1. database
Step "1/5  Neon database"
$dbUrl = Read-Secret "Paste the Neon connection string (input is hidden)"
if (-not $DryRun -and $dbUrl -notmatch "^postgres(ql)?://") { Fail "that does not look like a Postgres connection string (should start with postgresql://)" }
if ($DryRun) { Write-Host "   [dry-run] DATABASE_URL=... python run.py all init-db" }
else {
    $env:DATABASE_URL = $dbUrl
    & python run.py all init-db
    if ($LASTEXITCODE -ne 0) { Fail "could not connect to the database or create the tables. Check the connection string." }
    Remove-Item Env:\DATABASE_URL
    Ok "connected and tables created"
}
Set-GhSecret "DATABASE_URL" $dbUrl

# optional alerts
Step "Optional alerts (press Enter to skip)"
$tg = Read-Secret "Telegram bot token (from @BotFather), or Enter to skip"
if ($tg -and $tg -ne "dry-run-value") { Set-GhSecret "TELEGRAM_BOT_TOKEN" $tg } else { Warn "Telegram skipped. Email alerts: see docs/DEPLOY.md" }

# ---------------------------------------------------------------- 2. models + first predictions
Step "2/5  Train the models (a few minutes) and make the first predictions"
if (Run-Workflow "train.yml") { Ok "train finished" } else { Fail "train failed. Open the run link above to see why." }
if (Run-Workflow "predict.yml") { Ok "predict finished; it now repeats by itself every ~15 minutes" } else { Fail "predict failed. Open the run link above." }

# ---------------------------------------------------------------- 3. cloudflare secrets
Step "3/5  Cloudflare"
$cfToken = Read-Secret "Cloudflare API token (Edit Cloudflare Workers), hidden"
$cfAccount = if ($DryRun) { "dry-run-account" } else { (Read-Host -Prompt "Cloudflare Account ID").Trim() }
Set-GhSecret "CLOUDFLARE_API_TOKEN" $cfToken
Set-GhSecret "CLOUDFLARE_ACCOUNT_ID" $cfAccount

# the first deploy needs a workers.dev subdomain on the account
$headers = @{ Authorization = "Bearer $cfToken" }
$api = "https://api.cloudflare.com/client/v4/accounts/$cfAccount/workers/subdomain"
$subdomain = $null
if ($DryRun) { Write-Host "   [dry-run] GET/PUT $api" ; $subdomain = "example" }
else {
    try {
        $r = Invoke-RestMethod -Uri $api -Headers $headers -Method Get
        $subdomain = $r.result.subdomain
    } catch { $subdomain = $null }
    if (-not $subdomain) {
        $want = (Read-Host -Prompt "Choose a workers.dev subdomain for your account (letters, digits, dashes)").Trim()
        try {
            $r = Invoke-RestMethod -Uri $api -Headers $headers -Method Put -ContentType "application/json" -Body (@{ subdomain = $want } | ConvertTo-Json)
            $subdomain = $r.result.subdomain
        } catch { Fail "could not register the subdomain: $($_.Exception.Message). Check the token has Workers permissions and the name is free." }
    }
}
Ok "workers.dev subdomain: $subdomain"

# ---------------------------------------------------------------- 4. deploy
Step "4/5  Deploy the website"
if (Run-Workflow "deploy.yml") { Ok "deployed" } else { Fail "deploy failed. Open the run link above." }
$site = "https://gold-predictor.$subdomain.workers.dev"

if ($DryRun) { Write-Host "   [dry-run] wrangler secret put DATABASE_URL" }
else {
    $env:CLOUDFLARE_API_TOKEN = $cfToken
    $env:CLOUDFLARE_ACCOUNT_ID = $cfAccount
    Push-Location (Join-Path $root "web")
    try {
        if (-not (Test-Path node_modules)) { & npm ci | Out-Null }
        $dbUrl | & npx wrangler secret put DATABASE_URL | Out-Null
        if ($LASTEXITCODE -ne 0) { Fail "could not set the Worker secret DATABASE_URL" }
        Ok "Worker secret DATABASE_URL saved"
    } finally { Pop-Location }
}

# ---------------------------------------------------------------- 5. access (login)
Step "5/5  Login with Cloudflare Access (the one step that needs the dashboard)"
Write-Host @"

   Open https://one.dash.cloudflare.com  ->  Zero Trust  and do this:
     1. If asked, create the Zero Trust organisation (the free plan covers up to 50 users). Note the
        team domain, it looks like  yourteam.cloudflareaccess.com
     2. Access -> Applications -> Add -> Self-hosted. Application domain: gold-predictor.$subdomain.workers.dev
     3. Policy: Action = Allow, Include = Emails, and list the people who may sign in.
        Login method: One-time PIN (they receive a code by email).
     4. Save, then open the application and copy its  Audience (AUD) tag.

"@
$team = if ($DryRun) { "dry-run.cloudflareaccess.com" } else { (Read-Host -Prompt "Team domain (yourteam.cloudflareaccess.com), or Enter to finish later").Trim() }
if ($team) {
    $aud = if ($DryRun) { "dry-run-aud" } else { (Read-Host -Prompt "Application Audience (AUD) tag").Trim() }
    if ($DryRun) { Write-Host "   [dry-run] wrangler secret put CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD" }
    else {
        Push-Location (Join-Path $root "web")
        try {
            $team -replace "^https?://", "" | & npx wrangler secret put CF_ACCESS_TEAM_DOMAIN | Out-Null
            $aud | & npx wrangler secret put CF_ACCESS_AUD | Out-Null
            Ok "Access settings saved"
        } finally { Pop-Location }
    }
} else {
    Warn "Finish later: set Worker secrets CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD (docs/DEPLOY.md, step 3). Until then the site refuses to show data, on purpose."
}

Write-Host "`nDone. Your site: $site" -ForegroundColor Green
Write-Host "Sign in with an email you allowed in the Access policy. Until a signal passes the tests every card says Wait; that is expected."
