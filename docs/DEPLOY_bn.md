# Deploy: GitHub Actions + Neon + Cloudflare (বিনামূল্যের plan)

নিজে সার্ভার সামলাতে হয় না। প্রথমবার প্রায় ৪৫ মিনিট লাগবে। বিনামূল্যের সীমা আর dashboard-এর লেখা বদলায়, তাই প্রতিটা সেবার সাইটে বর্তমান শর্ত দেখে নিন।

## সবচেয়ে সহজ পথ: একটা script

তিনটা জিনিস হাতে থাকলে: (১) Neon project-এর connection string, (২) Cloudflare API token ("Edit Cloudflare Workers" template) ও Account ID, (৩) `gh auth login` করা। তখন নিচের ১ থেকে ৩ ধাপ script নিজে করে দেয়:

```powershell
.\scripts\setup.ps1            # আগে -DryRun দিয়ে দেখুন, কিছু বদলায় না
```

এটা ডেটাবেস যাচাই করে, GitHub-এ secret রাখে (লুকানো ইনপুট, ডিস্কে কিছু লেখে না), `train` তারপর `predict` চালায়, workers.dev ঠিকানা নিবন্ধন করে, deploy করে আর Worker secret বসায়। Cloudflare Access-এর লগইন শুধু ধাপে ধাপে দেখিয়ে দেয়, ওটা নিজে করতে পারে না। নিচের হাতে-করা ধাপগুলো একই কাজ।

## ০. যা লাগবে
GitHub, [Neon](https://neon.tech) আর [Cloudflare](https://dash.cloudflare.com) account। লোকালে চালাতে চাইলে Node 22 আর Python 3.13। alert চাইলে Telegram bot (@BotFather থেকে) বা SMTP।

## ১. Neon (ডেটাবেস)
1. একটা project বানান। **connection string** কপি করুন (শেষে `?sslmode=require` থাকে)।
2. এটা গোপন। শুধু GitHub আর Cloudflare-এর Secret-এ বসবে, repo-র কোনো ফাইলে কখনো না।

## ২. GitHub (কোড + সময়সূচি)
1. একটা **public** repo বানিয়ে প্রজেক্ট push করুন। Public repo-তে Actions-এর মিনিট সীমাহীন। Private-এ মাসিক সীমা আছে, প্রতি ১৫ মিনিটের schedule তা পার করে ফেলবে।
2. Repo **Settings > Secrets and variables > Actions > New repository secret**:

| Secret | কীসের জন্য |
|---|---|
| `DATABASE_URL` | Neon connection string (আবশ্যক) |
| `CLOUDFLARE_API_TOKEN` | deploy job ("Edit Cloudflare Workers" template-এর token) |
| `CLOUDFLARE_ACCOUNT_ID` | deploy job (Cloudflare dashboard-এ দেখায়) |
| `TELEGRAM_BOT_TOKEN` | Telegram alert (ঐচ্ছিক) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | ইমেইল alert (ঐচ্ছিক) |

   GitHub CLI দিয়ে: `gh secret set DATABASE_URL`।
3. **Actions** ট্যাব > `train` > **Run workflow**। এটা টেবিল বানায় আর মডেল প্রশিক্ষণ দেয় (কয়েক মিনিট)।
4. **Actions** ট্যাব > `predict` > **Run workflow**। সবুজ হলে ঠিক। এরপর থেকে প্রতি ১৫ মিনিটে নিজে চলবে।

## ৩. Cloudflare (ওয়েবসাইট)
1. Actions থেকে `deploy` workflow চালান (বা `web/`-এ কোনো পরিবর্তন push করুন)। প্রথমবারে `gold-predictor` নামে Worker তৈরি হয়: `https://gold-predictor.<আপনার-subdomain>.workers.dev`।
2. Worker-এর **Settings > Variables and Secrets**-এ Secret `DATABASE_URL` দিন (Neon-এর একই string)।
3. **Zero Trust (Access)** হলো লগইন:
   1. একটা Zero Trust organisation বানান (বিনামূল্যে ৫০ জন পর্যন্ত)। আপনার **team domain** (`<team>.cloudflareaccess.com`) টুকে রাখুন।
   2. সাইট সুরক্ষিত করুন: Worker **Settings > Domains & Routes**-এ workers.dev ঠিকানার জন্য Cloudflare Access চালু করুন (বা নিজের domain-এর জন্য self-hosted Access application)।
   3. Policy: **Allow**, যাঁরা ঢুকবেন তাঁদের **ইমেইল** দিন। লগইন পদ্ধতি **One-time PIN** (ইমেইলে কোড আসে, পাসওয়ার্ড সামলাতে হয় না)।
   4. application-এর **Audience (AUD) tag** কপি করুন।
4. আরও দুটো Worker Secret দিন: `CF_ACCESS_TEAM_DOMAIN` (team domain, `https://` ছাড়া) আর `CF_ACCESS_AUD`।
5. সাইট খুলুন। প্রথমে ইমেইল-কোডের পর্দা, তারপর dashboard আসবে। সব API 401 দিলে team domain বা AUD ভুল। বৈধ Access token ছাড়া সাইট ডেটা দেখাতে অস্বীকার করে, এটা ইচ্ছাকৃত।

নতুন client যোগ করতে: Access policy-তে তাঁর ইমেইল যোগ করুন। আর কিছু না।

## ৪. Alert (ঐচ্ছিক)
GitHub-এ Telegram ও/বা SMTP Secret দিন। প্রত্যেকে সাইটের **অ্যালার্ট** পেজে নিজের alert চালু করবেন। Telegram-এর জন্য একবার `@userinfobot`-কে বার্তা দিয়ে নিজের chat ID জানতে হবে, আর আপনার bot-এ **Start** চাপতে হবে যাতে সে তাঁকে লিখতে পারে। শুধু নতুন কিনুন/বেচুন সংকেতে alert যায়, অপেক্ষায় কখনো না।

## ৫. যা ঘটবে (আগে থেকে জেনে রাখুন)
- **dashboard-এ "আপডেট বিরতিতে":** শেষ সফল run ১৫ মিনিটের বেশি পুরনো। Actions ট্যাব দেখুন। GitHub মাঝে মাঝে schedule দেরিতে চালায় বা বাদ দেয়। সোনার বাজার বন্ধ থাকায় সপ্তাহান্তে সবকিছু শান্ত থাকে।
- **৬০ দিন repository-তে কোনো কাজ না হলে GitHub schedule বন্ধ করে দেয়।** আগে ইমেইলে জানায়। Actions ট্যাবে আবার চালু করুন (যেকোনো commit-ও টাইমার রিসেট করে)।
- **Neon ঘুম থেকে জাগে** দীর্ঘ বিরতির পর প্রথম request-এ, তাই প্রথম পেজ লোডে এক-দুই সেকেন্ড বেশি লাগতে পারে।
- **পুনঃপ্রশিক্ষণ** সাপ্তাহিক (`train.yml`)। মডেল git-এ না, ডেটাবেসে থাকে।
- দাম আসে Yahoo Finance থেকে `yfinance` দিয়ে (অনানুষ্ঠানিক, দেরি বা ভুল হতে পারে)। গুরুতর ব্যবহারে অনুমোদিত, পেইড ডেটা ফিডে যান।

## ৬. লোকাল ডেভেলপমেন্ট
```bash
cp web/.dev.vars.example web/.dev.vars          # DATABASE_URL + DEV_USER_EMAIL (লোকালে Access এড়ায়)
cd web && npm install && npm run dev
```
`DEV_USER_EMAIL` production build-এ উপেক্ষিত হয়।
