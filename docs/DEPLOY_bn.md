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
| `LLM_API_KEY`, `LLM_API_URL`, `LLM_MODEL` | খবরের শিরোনাম পড়ার AI মডেল (ঐচ্ছিক, নিচে দেখুন) |
| `SETTINGS_KEY` | ওয়েবসাইটের মডেল API পেজে রাখা AI key যাতে কাজগুলো পড়তে পারে (Worker secret-এর একই মান) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | ইমেইল alert (ঐচ্ছিক) |

   GitHub CLI দিয়ে: `gh secret set DATABASE_URL`।
3. **Actions** ট্যাব > `train` > **Run workflow**। এটা টেবিল বানায় আর মডেল প্রশিক্ষণ দেয় (কয়েক মিনিট)।
4. **Actions** ট্যাব > `predict` > **Run workflow**। সবুজ হলে ঠিক। এরপর থেকে প্রতি ১৫ মিনিটে নিজে চলবে।
5. **Actions** ট্যাব > `research` > **Run workflow** (কয়েক ঘণ্টা লাগে, বসে দেখতে হবে না)। এটা সব মডেল ও ইনপুট-সেট পুরনো ডেটায় চেষ্টা করে, একমাত্র
   বিজয়ীকে নতুন ২০% ডেটায় (তালা-দেওয়া hold-out) একবার পরীক্ষা করে, আর ফল দিয়ে চালু মডেল নতুন করে শেখায়। এরপর প্রতি মাসের ১ তারিখে নিজে চলে।
   এটা না চলা পর্যন্ত অ্যাপ একটা ডিফল্ট মডেল ব্যবহার করে এবং সে কথা জানায়।

## ৩. Cloudflare (ওয়েবসাইট): দুটো আলাদা হোস্ট
ব্যাকএন্ড আর ফ্রন্টএন্ড একই অ্যাকাউন্টে দুটো আলাদা Worker:

| Worker | ফোল্ডার | ঠিকানা | কী রাখে |
|---|---|---|---|
| `gold-predictor-api` (ব্যাকএন্ড) | `api/` | `https://gold-predictor-api.<আপনার-subdomain>.workers.dev` | সব ডেটা, সাইন-ইন, ভূমিকা, অ্যাডমিন সেটিং; সব secret |
| `gold-predictor` (ফ্রন্টএন্ড) | `web/` | `https://gold-predictor.<আপনার-subdomain>.workers.dev` | শুধু স্ট্যাটিক পেজ; কোনো secret নেই |

1. `api/wrangler.jsonc`-এ `ALLOWED_ORIGINS`-এ ফ্রন্টএন্ডের ঠিকানা দিন। দুটোকে একই সাইটে থাকতে হবে (একই `<subdomain>.workers.dev`, বা একটি নিজস্ব domain যেমন `app.example.com` + `api.example.com`), তাহলেই ব্রাউজার HttpOnly সাইন-ইন কুকি API-তে পাঠায়।
2. Repository **Settings > Secrets and variables > Actions > Variables**-এ `API_URL` = ব্যাকএন্ডের ঠিকানা দিন। ফ্রন্টএন্ড বিল্ডে এটা বসে যায়।
3. Actions থেকে `deploy` workflow চালান বা `api/` / `web/`-এ পরিবর্তন push করুন; যার ফোল্ডার বদলেছে শুধু সেটাই আবার deploy হয়। হাতে: `cd api && npx wrangler deploy`, তারপর `cd web && NEXT_PUBLIC_API_URL=<ব্যাকএন্ডের ঠিকানা> npm run build && npx wrangler deploy`।
4. ব্যাকএন্ডের secret (`cd api`, তারপর `npx wrangler secret put NAME`): `DATABASE_URL` (Neon-এর একই string), `SESSION_SECRET`, `SETTINGS_KEY` (দুটোই ৩২+ এলোমেলো অক্ষর)। ফ্রন্টএন্ডে কোনো secret লাগে না।
5. **Zero Trust (Access)** ঐচ্ছিক বাড়তি লগইন (না হলে ৩খ-এর অ্যাক্সেস কোড)। এর secret-ও ব্যাকএন্ডে যায়:
   1. একটা Zero Trust organisation বানান (বিনামূল্যে ৫০ জন পর্যন্ত)। আপনার **team domain** (`<team>.cloudflareaccess.com`) টুকে রাখুন।
   2. সাইট সুরক্ষিত করুন: Worker **Settings > Domains & Routes**-এ workers.dev ঠিকানার জন্য Cloudflare Access চালু করুন (বা নিজের domain-এর জন্য self-hosted Access application)।
   3. Policy: **Allow**, যাঁরা ঢুকবেন তাঁদের **ইমেইল** দিন। লগইন পদ্ধতি **One-time PIN** (ইমেইলে কোড আসে, পাসওয়ার্ড সামলাতে হয় না)।
   4. application-এর **Audience (AUD) tag** কপি করুন।
   5. ব্যাকএন্ডে আরও দুটো secret দিন: `CF_ACCESS_TEAM_DOMAIN` (team domain, `https://` ছাড়া) আর `CF_ACCESS_AUD`, এবং দুটো Worker-কেই একই Access application দিয়ে সুরক্ষিত করুন।
6. ফ্রন্টএন্ডের ঠিকানা খুলুন। ব্যাকএন্ড ঠিক আছে কিনা দেখতে: `https://gold-predictor-api.<আপনার-subdomain>.workers.dev/api/health`। সব কল 401 দিলে আবার সাইন-ইন করুন; ব্রাউজার console-এ CORS ত্রুটি দেখালে `ALLOWED_ORIGINS` ফ্রন্টএন্ডের ঠিকানার সাথে হুবহু মেলেনি।

নতুন client যোগ করতে: অ্যাক্সেস কোড হলে ওয়েবসাইটের **ব্যবহারকারী** পেজ; Access হলে policy-তে তাঁর ইমেইল।

## ৩খ. Cloudflare Access ছাড়া সাইন-ইন: অ্যাক্সেস কোড
Zero Trust চালু করতে না চাইলে সাইটের নিজস্ব সাইন-ইন আছে। ব্যাকএন্ডে secret `SESSION_SECRET` বসান (৩২+ অক্ষরের যেকোনো এলোমেলো লেখা),
তারপর প্রত্যেককে একটা কোড দিন:

```bash
python scripts/access_code.py add client@example.com --save store/code_client.txt   # DATABASE_URL বসানো অবস্থায়
python scripts/access_code.py revoke client@example.com                            # সাথে সাথে প্রবেশ বন্ধ
python scripts/access_code.py list
```

কোড ২২টা এলোমেলো অক্ষর, ডেটাবেসে শুধু তার hash থাকে। ঢুকলে ৩০ দিনের HttpOnly কুকি, আর প্রতিটা অনুরোধে কোড এখনো আছে কিনা যাচাই হয়।
Cloudflare Access-ও চালু থাকলে দুই পথেই ঢোকা যায়।

**ভূমিকা।** *ব্যবহারকারী* শুধু সহজ “বাড়বে X% / কমবে Y%” সংকেত দেখেন। *সুপার অ্যাডমিন* সব পর্দা দেখেন (ড্যাশবোর্ড, প্রেডিকশন লগ,
চেকলিস্ট, ড্রাইভার, খবর, ফলাফল, মডেলের ব্যাখ্যা, নোটবুক, মডেল API, API লগ) এবং **ব্যবহারকারী** পেজে লোক যোগ/বাতিল করেন।
প্রথম সুপার অ্যাডমিন: `python scripts/access_code.py add you@example.com --admin`; এরপর ওয়েবসাইট থেকেই যোগ করুন।
Cloudflare Access ব্যবহার করলে সুপার অ্যাডমিনদের ইমেইল Worker variable `ADMIN_EMAILS`-এ দিন (কমা দিয়ে আলাদা)।
ব্যবহারকারী পেজে কোনো গ্রাহকের জন্য **প্রেডিকশন লগ** টিক দিলে তিনি তাঁকে দেখানো সম্ভাবনাগুলোর লগ আর প্রতিটি মিলেছে কিনা দেখতে পারবেন (মডেলের নিজস্ব সংখ্যা কখনো নয়)।

## ৪. AI মডেল দিয়ে খবর পড়া (ঐচ্ছিক)
key না দিলে শিরোনাম কিওয়ার্ড-নিয়মে পড়া হয় (সবসময় কাজ করে, কম সূক্ষ্ম)। AI মডেল চাইলে যেকোনো OpenAI-সুসঙ্গত chat API-র key `LLM_API_KEY`-তে দিন, আর
চাইলে `LLM_API_URL` (পুরো `.../chat/completions` ঠিকানা) ও `LLM_MODEL`। কয়েকটা পরিষেবার বিনামূল্যের plan আছে, তা প্রায়ই বদলায়, তাই বর্তমান সীমা দেখে নিন।
মডেল ব্যর্থ হলে বা কোটা ফুরোলে নিয়ম কাজ চালায়, তাই সাইট ভাঙে না। শিরোনামের পাঠ স্বয়ংক্রিয় অনুমান, ভুল হতে পারে।

সুপার অ্যাডমিন ওয়েবসাইট থেকেও সেবা বদলাতে পারেন (**মডেল API** পেজ: ঠিকানা, মডেল, key, চালু/বন্ধ, আর **পরীক্ষা** বোতাম)। এর জন্য একই এলোমেলো
`SETTINGS_KEY` (৩২+ অক্ষর) Worker secret ও GitHub secret দুই জায়গায় দিন: ওয়েবসাইট এটা দিয়ে key এনক্রিপ্ট করে, নির্ধারিত কাজ ডিক্রিপ্ট করে।
ওয়েবসাইটে রাখা সেটিং `LLM_*` secret-এর চেয়ে অগ্রাধিকার পায়। প্রতিটি AI কল (অনুরোধ, উত্তর, সময়, ত্রুটি) **API লগ** পেজে দেখা যায়।

## ৪খ. Alert (ঐচ্ছিক)
GitHub-এ Telegram ও/বা SMTP Secret দিন। প্রত্যেকে সাইটের **অ্যালার্ট** পেজে নিজের alert চালু করবেন। Telegram-এর জন্য একবার `@userinfobot`-কে বার্তা দিয়ে নিজের chat ID জানতে হবে, আর আপনার bot-এ **Start** চাপতে হবে যাতে সে তাঁকে লিখতে পারে। শুধু নতুন কিনুন/বেচুন সংকেতে alert যায়, অপেক্ষায় কখনো না।

## ৫. যা ঘটবে (আগে থেকে জেনে রাখুন)
- **dashboard-এ "আপডেট বিরতিতে":** শেষ সফল run ১৫ মিনিটের বেশি পুরনো। Actions ট্যাব দেখুন। GitHub মাঝে মাঝে schedule দেরিতে চালায় বা বাদ দেয়। সোনার বাজার বন্ধ থাকায় সপ্তাহান্তে সবকিছু শান্ত থাকে।
- **৬০ দিন repository-তে কোনো কাজ না হলে GitHub schedule বন্ধ করে দেয়।** আগে ইমেইলে জানায়। Actions ট্যাবে আবার চালু করুন (যেকোনো commit-ও টাইমার রিসেট করে)।
- **Neon ঘুম থেকে জাগে** দীর্ঘ বিরতির পর প্রথম request-এ, তাই প্রথম পেজ লোডে এক-দুই সেকেন্ড বেশি লাগতে পারে।
- **পুনঃপ্রশিক্ষণ** সাপ্তাহিক (`train.yml`)। মডেল git-এ না, ডেটাবেসে থাকে।
- দাম আসে Yahoo Finance থেকে `yfinance` দিয়ে (অনানুষ্ঠানিক, দেরি বা ভুল হতে পারে)। গুরুতর ব্যবহারে অনুমোদিত, পেইড ডেটা ফিডে যান।

## ৬. লোকাল ডেভেলপমেন্ট
```bash
cp api/.dev.vars.example api/.dev.vars     # DATABASE_URL, DEV_USER_EMAIL, SESSION_SECRET, SETTINGS_KEY
cp web/.env.example web/.env.local         # NEXT_PUBLIC_API_URL=http://localhost:8787
cd api && npm install && npm run dev       # ব্যাকএন্ড: http://localhost:8787
cd web && npm install && npm run dev       # ফ্রন্টএন্ড: http://localhost:3000 (আরেকটা টার্মিনালে)
```
Windows-এ `start-local.cmd` সব একসাথে করে। `DEV_USER_EMAIL` শুধু localhost-এর অনুরোধে সুপার অ্যাডমিন হিসেবে ঢোকায়, production-এ কখনো না।
