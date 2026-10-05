# Deploy: GitHub Actions + Neon + Cloudflare (free tiers)

Nothing here needs a server you manage. Allow about 45 minutes the first time. Free-tier limits and dashboard labels
change, so check each provider's current pricing and wording.

## Fastest route: one script

After you have (1) a Neon project's connection string, (2) a Cloudflare API token with the "Edit Cloudflare Workers" template plus your Account ID, and (3) run `gh auth login`, this does steps 1-3 below for you:

```powershell
.\scripts\setup.ps1            # add -DryRun first to see every step without changing anything
```

It checks the database, stores the secrets in GitHub (hidden input, nothing written to disk), runs `train` then `predict`, registers the workers.dev address, deploys, and sets the Worker secrets. The Cloudflare Access login is the one step it can only guide you through. The manual steps below are the same thing done by hand.

## 0. What you need
GitHub account, [Neon](https://neon.tech) account, [Cloudflare](https://dash.cloudflare.com) account, Node 22 and
Python 3.13 only if you want to run things locally. Optional: a Telegram bot (via @BotFather) and an SMTP account for alerts.

## 1. Neon (database)
1. Create a project. Copy the **connection string** (it ends with `?sslmode=require`).
2. Keep it secret. It goes into GitHub and Cloudflare as a secret, never into a file in the repo.

## 2. GitHub (code + schedules)
1. Create a **public** repository and push this project. Public repositories get unlimited Actions minutes;
   a private one has a monthly allowance that a 15-minute schedule will exceed.
2. Repository **Settings > Secrets and variables > Actions > New repository secret**:

| Secret | Needed for |
|---|---|
| `DATABASE_URL` | the Neon connection string (required) |
| `CLOUDFLARE_API_TOKEN` | deploy job (token template "Edit Cloudflare Workers") |
| `CLOUDFLARE_ACCOUNT_ID` | deploy job (shown on the Cloudflare dashboard) |
| `TELEGRAM_BOT_TOKEN` | Telegram alerts (optional) |
| `LLM_API_KEY`, `LLM_API_URL`, `LLM_MODEL` | an AI model that reads news headlines (optional, see below) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | email alerts (optional) |

   With the GitHub CLI: `gh secret set DATABASE_URL`.
3. **Actions** tab > `train` > **Run workflow**. This creates the tables and trains the models (a few minutes).
4. **Actions** tab > `predict` > **Run workflow**. Check it is green. From now on it runs every 15 minutes by itself.
5. **Actions** tab > `research` > **Run workflow** (takes hours, no need to watch). It tries every model and every input set on older
   data, tests the single winner once on the newest 20% (the locked hold-out), and retrains the live models with the result.
   It then runs by itself on the 1st of each month. Until it has run, the app uses a default model and says so.

## 3. Cloudflare (website)
1. Run the `deploy` workflow (Actions tab) or push a change under `web/`. The first run creates the Worker
   `gold-predictor` at `https://gold-predictor.<your-subdomain>.workers.dev`.
2. Worker **Settings > Variables and Secrets**: add the secret `DATABASE_URL` (same Neon string).
3. **Zero Trust (Access)** is the login:
   1. Create a Zero Trust organisation (free plan covers up to 50 users). Note your **team domain**
      (`<team>.cloudflareaccess.com`).
   2. Protect the site: Worker **Settings > Domains & Routes**, enable Cloudflare Access for the workers.dev address
      (or add a self-hosted Access application for your own domain).
   3. Policy: **Allow**, include the **emails** of the people who may sign in. Login method: **One-time PIN**
      (they get a code by email, no passwords to manage).
   4. Copy the application's **Audience (AUD) tag**.
4. Add two more Worker secrets: `CF_ACCESS_TEAM_DOMAIN` (the team domain, no `https://`) and `CF_ACCESS_AUD`.
5. Open the site. You should get the email-code screen, then the dashboard. If every API call answers 401, the team
   domain or AUD value is wrong. The site refuses to show data without a valid Access token, by design.

To add a client later: add their email to the Access policy. Nothing else.

## 4. News reading with an AI model (optional)
Without a key, headlines are read by keyword rules (always works, less subtle). To use an AI model set `LLM_API_KEY` to a key from any
provider with an OpenAI-compatible chat API, and optionally `LLM_API_URL` (the full `.../chat/completions` address) and `LLM_MODEL`.
Free tiers exist at several providers and change often; check the provider's current limits. If the model fails or runs out of quota the
rules take over, so the site never breaks. Headline readings are automatic guesses and can be wrong.

## 4b. Alerts (optional)
Add the Telegram and/or SMTP secrets in GitHub. Each person turns alerts on in the site's **Alerts** page. For Telegram they
message `@userinfobot` once to learn their chat ID, and press **Start** on your bot so it may write to them.
Only new Buy/Sell signals send alerts, never Wait.

## 5. Things that will happen
- **"Updates paused" on the dashboard:** the last successful run is older than 15 minutes. Open the Actions tab. GitHub
  sometimes delays or skips scheduled runs; weekends are quiet because gold markets are closed.
- **Schedules stop after 60 days without repository activity.** GitHub emails you first. Re-enable in the Actions tab
  (any commit also resets the timer).
- **Neon wakes from sleep** on the first request after a quiet period, so that first page load can take a second or two longer.
- **Retraining** runs weekly (`train.yml`). Models are stored in the database, not in git.
- Prices come from Yahoo Finance via `yfinance` (unofficial, can be late or wrong). For serious use switch to a paid,
  licensed data feed.

## 6. Local development
```bash
cp web/.dev.vars.example web/.dev.vars          # DATABASE_URL + DEV_USER_EMAIL (skips Access locally)
cd web && npm install && npm run dev
```
`DEV_USER_EMAIL` is ignored in production builds.
