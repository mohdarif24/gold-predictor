/**
 * Arif's Notebook: the engineering reference for this project. Every service, model, technique and term, with where it
 * lives in the code and why it was chosen. English and Bengali.
 */
export type T = { en: string; bn: string };
export type Entry = { name: string; where?: string; what: T; why: T };
export type Section = { id: string; title: T; intro?: T; entries: Entry[] };

const t = (en: string, bn: string): T => ({ en, bn });

export const PITCH: T = t(
  "Python jobs on GitHub Actions collect free market, macro, positioning and news data every 15 minutes, build about 200 features with a strict no-look-ahead rule, and run machine-learning models that were chosen in a two-stage competition and judged once on a locked final 20% of history. Results are written to a Neon Postgres database. A backend API on its own Cloudflare Worker reads that database and checks every sign-in and role; a separate frontend (static Next.js pages on another Worker) calls the API from the browser. Clients see only a calibrated “higher X% / lower Y%” chance, while the super admin sees every model, input, log and setting. Nothing runs on a server we manage, and everything is free tier.",
  "GitHub Actions-এ চলা Python কাজগুলো প্রতি ১৫ মিনিটে বিনামূল্যের বাজার, অর্থনীতি, অবস্থান ও খবরের তথ্য আনে, কঠোর “ভবিষ্যৎ না দেখা” নিয়মে প্রায় ২০০টি বৈশিষ্ট্য বানায়, এবং এমন মেশিন-লার্নিং মডেল চালায় যা দুই ধাপের প্রতিযোগিতায় বাছাই হয়ে ইতিহাসের লক করা শেষ ২০%-এ একবার যাচাই হয়েছে। ফল যায় Neon Postgres ডেটাবেসে। নিজস্ব Cloudflare Worker-এ চলা ব্যাকএন্ড API সেই ডেটাবেস পড়ে এবং প্রতিটি সাইন-ইন ও ভূমিকা যাচাই করে; আলাদা আরেকটি Worker-এ থাকা ফ্রন্টএন্ড (স্ট্যাটিক Next.js পাতা) ব্রাউজার থেকে সেই API ডাকে। গ্রাহক শুধু ক্যালিব্রেটেড “বাড়বে X% / কমবে Y%” দেখেন, আর সুপার অ্যাডমিন সব মডেল, ইনপুট, লগ ও সেটিং দেখেন। আমাদের নিজের কোনো সার্ভার নেই, আর সবকিছু ফ্রি টিয়ারে চলে।",
);

/** The architecture map: lanes left to right, each with what runs there. */
export const MAP: { lane: T; tech: string; items: T[] }[] = [
  {
    lane: t("Data sources", "তথ্যের উৎস"), tech: "Internet (free)",
    items: [t("Yahoo Finance prices", "Yahoo Finance দাম"), t("FRED macro series", "FRED অর্থনীতি-সিরিজ"), t("CFTC positioning", "CFTC অবস্থান"), t("Google News + calendar", "Google News + ক্যালেন্ডার"), t("AI model API (optional)", "AI মডেল API (ঐচ্ছিক)")],
  },
  {
    lane: t("Brain (Python)", "মস্তিষ্ক (Python)"), tech: "GitHub Actions",
    items: [t("tick: every 15 min", "tick: প্রতি ১৫ মিনিট"), t("train: Sundays", "train: রবিবার"), t("research: 1st of month", "research: মাসের ১ তারিখ"), t("tests on every push", "প্রতি push-এ টেস্ট")],
  },
  {
    lane: t("Memory (database)", "স্মৃতি (ডেটাবেস)"), tech: "Neon Postgres",
    items: [t("predictions, models, studies", "প্রেডিকশন, মডেল, স্টাডি"), t("news, prices, drivers", "খবর, দাম, ড্রাইভার"), t("users, settings, API logs", "ব্যবহারকারী, সেটিং, API লগ")],
  },
  {
    lane: t("Backend (API)", "ব্যাকএন্ড (API)"), tech: "Cloudflare Worker: gold-predictor-api",
    items: [t("JSON endpoints, one route table", "JSON এন্ডপয়েন্ট, একটি রুট-তালিকা"), t("sign-in, roles, CORS", "সাইন-ইন, ভূমিকা, CORS"), t("holds every secret", "সব গোপন তথ্য এখানে")],
  },
  {
    lane: t("Frontend (website)", "ফ্রন্টএন্ড (ওয়েবসাইট)"), tech: "Cloudflare Worker: gold-predictor (static)",
    items: [t("static Next.js pages, no server code", "স্ট্যাটিক Next.js পাতা, সার্ভার কোড নেই"), t("client pages: signal only", "গ্রাহকের পাতা: শুধু সংকেত"), t("super admin pages: everything", "সুপার অ্যাডমিনের পাতা: সবকিছু")],
  },
];

/**
 * Code flowcharts: each step is a real function, top to bottom in the order it runs. `calls` are the functions that
 * step calls in turn (drawn side by side). `lib` is the library doing the heavy lifting.
 */
export type Step = { fn: string; file: string; lib?: string; what: T; calls?: { fn: string; file: string; lib?: string; what: T }[] };
export type Flow = { id: string; title: T; trigger: T; steps: Step[] };

export const FLOWS: Flow[] = [
  {
    id: "flow-predict",
    title: t("Flow 1: how one prediction is made (every 15 minutes)", "ফ্লো ১: একটি প্রেডিকশন কীভাবে হয় (প্রতি ১৫ মিনিটে)"),
    trigger: t("Started by GitHub Actions (.github/workflows/predict.yml) with: python run.py all tick", "GitHub Actions (.github/workflows/predict.yml) চালায়: python run.py all tick"),
    steps: [
      { fn: "main()", file: "run.py", lib: "argparse", what: t("Reads config.yaml, connects to the database, loops over every enabled instrument.", "config.yaml পড়ে, ডেটাবেসে যুক্ত হয়, প্রতিটি চালু ইন্সট্রুমেন্টে ঘোরে।"),
        calls: [
          { fn: "store.connect_cfg()", file: "core/store.py", lib: "psycopg / sqlite3", what: t("Neon if DATABASE_URL is set, else SQLite; creates missing tables.", "DATABASE_URL থাকলে Neon, না হলে SQLite; না থাকা টেবিল বানায়।") },
          { fn: "store.sync_instruments()", file: "core/store.py", what: t("Copies the instrument list to the database for the website.", "ওয়েবসাইটের জন্য ইন্সট্রুমেন্ট-তালিকা ডেটাবেসে রাখে।") },
        ] },
      { fn: "run_command(\"tick\")", file: "run.py", what: t("One full cycle for one instrument.", "একটি ইন্সট্রুমেন্টের জন্য একটি পূর্ণ চক্র।") },
      { fn: "pipeline.update()", file: "core/pipeline.py", lib: "pandas", what: t("First settle the past: did earlier readings and practice trades come true?", "আগে অতীত মেটানো: আগের পর্যবেক্ষণ ও অনুশীলন ট্রেড কি মিলেছে?"),
        calls: [
          { fn: "shadow.update_trades()", file: "core/shadow.py", what: t("Closes practice trades that hit stop or target.", "stop বা target ছোঁয়া অনুশীলন ট্রেড বন্ধ করে।") },
          { fn: "shadow.resolve_predictions()", file: "core/shadow.py", what: t("Fills outcome_up and outcome_price, which marks the Prediction Log right or wrong.", "outcome_up ও outcome_price পূরণ করে, যা প্রেডিকশন লগে সঠিক/ভুল চিহ্ন দেয়।") },
        ] },
      { fn: "refresh_news_once()", file: "run.py", what: t("At most every 10 minutes: new headlines and calendar.", "সর্বোচ্চ প্রতি ১০ মিনিটে: নতুন শিরোনাম ও ক্যালেন্ডার।"),
        calls: [
          { fn: "news.refresh_news()", file: "core/news.py", lib: "urllib + xml", what: t("Google News RSS for six searches.", "ছয়টি খোঁজের Google News RSS।") },
          { fn: "news.score_articles()", file: "core/news.py", what: t("settings.llm_config() → score_llm() (AI, logged by settings.log()) or score_rules() (keywords).", "settings.llm_config() → score_llm() (AI, settings.log() দিয়ে লগ) অথবা score_rules() (কীওয়ার্ড)।") },
          { fn: "news.refresh_events()", file: "core/news.py", what: t("This week’s economic calendar.", "এই সপ্তাহের অর্থনৈতিক ক্যালেন্ডার।") },
        ] },
      { fn: "pipeline.predict()", file: "core/pipeline.py", what: t("For each window (30m, 1h, 1d, 1w) the steps below.", "প্রতিটি সময়সীমার (30m, 1h, 1d, 1w) জন্য নিচের ধাপগুলো।") },
      { fn: "store.load_model()", file: "core/store.py", lib: "joblib", what: t("Loads the trained model chosen by the study, with its list of inputs.", "স্টাডিতে বাছাই করা প্রশিক্ষিত মডেল ও তার ইনপুট-তালিকা লোড করে।") },
      { fn: "_features()", file: "core/pipeline.py", lib: "yfinance, httpx", what: t("Fetches every input.", "সব ইনপুট আনে।"),
        calls: [
          { fn: "yf_data.get_bars()", file: "nse_etf/yf_data.py", lib: "yfinance", what: t("Gold bars (or mt5_data.get_bars() for Exness).", "সোনার বার (Exness হলে mt5_data.get_bars())।") },
          { fn: "yf_data.get_drivers()", file: "nse_etf/yf_data.py", lib: "yfinance", what: t("23 market series.", "২৩টি বাজার-সিরিজ।") },
          { fn: "sources.load_fred()", file: "core/sources.py", lib: "httpx", what: t("10 FRED series, plus load_gpr() for the Geopolitical Risk index.", "১০টি FRED সিরিজ, সাথে ভূরাজনৈতিক ঝুঁকি সূচকের জন্য load_gpr()।") },
          { fn: "load_cot() → sources.cot_features()", file: "core/pipeline.py, core/sources.py", what: t("CFTC positioning.", "CFTC অবস্থান।") },
          { fn: "news.news_features()", file: "core/news.py", what: t("Daily news mood.", "দৈনিক খবরের হাওয়া।") },
        ] },
      { fn: "features.build_features()", file: "core/features.py", lib: "pandas, numpy", what: t("Turns everything into ~200 columns, shifting each to the day it was public.", "সবকিছু ~২০০টি কলামে রূপ দেয়, প্রতিটিকে প্রকাশের দিনে সরিয়ে।"),
        calls: [
          { fn: "_rsi(), atr(), htf_features()", file: "core/features.py", what: t("Chart indicators and the bigger timeframe.", "চার্ট-সূচক ও বড় টাইমফ্রেম।") },
          { fn: "sources.calendar_features()", file: "core/sources.py", what: t("Jobs-report day, expiries, month end.", "চাকরির প্রতিবেদনের দিন, মেয়াদ শেষ, মাসের শেষ।") },
          { fn: "regime.compute_regime()", file: "core/regime.py", what: t("Market-state label.", "বাজারের অবস্থা।") },
        ] },
      { fn: "model.predict_proba()", file: "core/models.py", lib: "LightGBM / XGBoost / scikit-learn / PyTorch", what: t("The model’s own chance that the price ends higher (the “model raw” number, admin only).", "দাম বাড়ার মডেলের নিজস্ব সম্ভাবনা (“মডেলের নিজস্ব” সংখ্যা, শুধু অ্যাডমিন)।") },
      { fn: "signal.decide()", file: "core/signal.py", what: t("Buy / Sell / Wait: Wait unless the window passed the locked test.", "কিনুন / বেচুন / অপেক্ষা: লক করা পরীক্ষায় পাস না করলে অপেক্ষা।") },
      { fn: "scorecard.build()", file: "core/scorecard.py", lib: "pandas", what: t("Daily windows: the 10-factor checklist and its measured hit rate; saved by store.save_scorecard().", "দৈনিক সময়সীমা: ১০-ফ্যাক্টরের চেকলিস্ট ও মাপা মিলের হার; store.save_scorecard() দিয়ে সংরক্ষণ।") },
      { fn: "public.chance_up()", file: "core/public.py", what: t("The client’s %: checklist rate (daily) or the model number mapped through its calibration (intraday).", "গ্রাহকের %: চেকলিস্টের হার (দৈনিক) বা ক্যালিব্রেশনে মেলানো মডেলের সংখ্যা (ইন্ট্রাডে)।") },
      { fn: "store.log_prediction()", file: "core/store.py", what: t("Writes the reading to the predictions table (with shown_p_up).", "পর্যবেক্ষণ predictions টেবিলে লেখে (shown_p_up সহ)।") },
      { fn: "explain.explain()", file: "core/explain.py", what: t("Which input families pushed the chance up or down; saved by store.save_explanation().", "কোন ইনপুট-পরিবার সম্ভাবনা উপরে বা নিচে ঠেলেছে; store.save_explanation() দিয়ে সংরক্ষণ।") },
      { fn: "shadow.open_trade() · alerts.notify_new()", file: "core/shadow.py, core/alerts.py", what: t("Practice trade for Buy/Sell; Telegram / email alerts.", "কিনুন/বেচুনে অনুশীলন ট্রেড; Telegram / ইমেইল অ্যালার্ট।") },
      { fn: "store.save_candles() · save_series() · beat()", file: "core/store.py", what: t("Chart bars, input values and the “live” heartbeat for the website.", "ওয়েবসাইটের জন্য চার্টের বার, ইনপুটের মান ও “লাইভ” heartbeat।") },
    ],
  },
  {
    id: "flow-web",
    title: t("Flow 2: how the website shows it", "ফ্লো ২: ওয়েবসাইট কীভাবে দেখায়"),
    trigger: t("A person opens the frontend (static pages on the gold-predictor Worker).", "কেউ ফ্রন্টএন্ড খোলেন (gold-predictor Worker-এ স্ট্যাটিক পাতা)।"),
    steps: [
      { fn: "SignalPage → useApi(\"public/…\")", file: "web/app/(app)/page.tsx, web/lib/api.ts", lib: "React", what: t("The page in the browser asks the backend for the client signal (refreshes every 2 minutes).", "ব্রাউজারের পাতা ব্যাকএন্ডের কাছে গ্রাহকের সংকেত চায় (প্রতি ২ মিনিটে হালনাগাদ)।"),
        calls: [
          { fn: "apiRequest()", file: "web/lib/api.ts", lib: "fetch", what: t("Calls NEXT_PUBLIC_API_URL with credentials: \"include\", so the HttpOnly session cookie travels along.", "credentials: \"include\" দিয়ে NEXT_PUBLIC_API_URL ডাকে, তাই HttpOnly সেশন কুকি সাথে যায়।") },
        ] },
      { fn: "fetch() → match()", file: "api/src/index.ts, api/src/routes.ts", lib: "Cloudflare Workers", what: t("The backend Worker checks the caller’s origin (CORS), finds GET /api/public/:name in the route table.", "ব্যাকএন্ড Worker কলারের origin যাচাই করে (CORS), রুট-তালিকায় GET /api/public/:name খোঁজে।") },
      { fn: "secured()", file: "api/src/lib/http.ts", lib: "jose", what: t("Checks sign-in and role on every request.", "প্রতিটি অনুরোধে সাইন-ইন ও ভূমিকা যাচাই।"),
        calls: [
          { fn: "access.caller()", file: "api/src/lib/access.ts", lib: "jose (HS256)", what: t("Verifies the session cookie (or Cloudflare Access token).", "সেশন কুকি (বা Cloudflare Access টোকেন) যাচাই।") },
          { fn: "queries.accessOf()", file: "api/src/lib/queries.ts", what: t("Re-reads role and extra pages; admin-only routes return 403 to clients.", "ভূমিকা ও বাড়তি পাতা আবার পড়ে; অ্যাডমিন রুট গ্রাহককে 403 দেয়।") },
        ] },
      { fn: "queries.getPublicSignal()", file: "api/src/lib/queries.ts", what: t("Reads scorecards, research and the latest predictions; returns only “higher X% / lower Y%”.", "scorecards, research ও সর্বশেষ predictions পড়ে; শুধু “বাড়বে X% / কমবে Y%” ফেরত দেয়।") },
      { fn: "db.run() → neon().query()", file: "api/src/lib/db.ts", lib: "@neondatabase/serverless", what: t("SQL over HTTPS to Neon Postgres.", "HTTPS-এ Neon Postgres-এ SQL।") },
      { fn: "Card per window", file: "web/app/(app)/page.tsx", lib: "Tailwind CSS", what: t("Back in the browser: green / red bar and plain words in English or Bengali (web/lib/i18n.tsx).", "ব্রাউজারে ফিরে: সবুজ / লাল বার ও ইংরেজি বা বাংলায় সহজ কথা (web/lib/i18n.tsx)।") },
    ],
  },
  {
    id: "flow-train",
    title: t("Flow 3: how the model is chosen and trained", "ফ্লো ৩: মডেল কীভাবে বাছাই ও প্রশিক্ষণ হয়"),
    trigger: t("research.yml on the 1st of each month (python -m research.study all), then train.yml every Sunday (python run.py all train).", "প্রতি মাসের ১ তারিখে research.yml (python -m research.study all), তারপর প্রতি রবিবার train.yml (python run.py all train)।"),
    steps: [
      { fn: "study.main() → study_horizon()", file: "research/study.py", what: t("Per instrument and window: builds features and the target, splits 80% / 20%.", "প্রতি ইন্সট্রুমেন্ট ও সময়সীমায়: বৈশিষ্ট্য ও লক্ষ্য বানায়, ৮০% / ২০% ভাগ করে।"),
        calls: [
          { fn: "features.build_features()", file: "core/features.py", what: t("Same inputs as live.", "লাইভের মতো একই ইনপুট।") },
          { fn: "features.make_target()", file: "core/features.py", what: t("1 if the price ended higher.", "দাম বাড়লে ১।") },
        ] },
      { fn: "dev_score() × ≈18", file: "research/study.py", lib: "scikit-learn (roc_auc_score)", what: t("Stage A: every model; stage B: best two on 4 more input sets. Scored by AUC on the first 80% only.", "ধাপ A: সব মডেল; ধাপ B: সেরা দুটি আরও ৪টি ইনপুট-সেটে। শুধু প্রথম ৮০%-এ AUC দিয়ে নম্বর।"),
        calls: [
          { fn: "features.select_columns()", file: "core/features.py", what: t("Picks an input set (core, tech+, macro, flow, all).", "ইনপুট-সেট বাছে (core, tech+, macro, flow, all)।") },
          { fn: "backtest.walk_forward()", file: "core/backtest.py", what: t("Train on the past, purge gap, test the next block.", "অতীতে শেখা, purge gap, পরের অংশে পরীক্ষা।") },
          { fn: "models.fit() → make_model()", file: "core/models.py", lib: "LightGBM, XGBoost, scikit-learn, PyTorch", what: t("Builds and trains one candidate.", "একটি প্রার্থী বানিয়ে শেখায়।") },
        ] },
      { fn: "walk_forward() on the locked 20%", file: "core/backtest.py", what: t("The single winner, tested once on data no choice touched.", "একমাত্র বিজয়ী, এমন তথ্যে একবার পরীক্ষা যা কোনো বাছাইয়ে ব্যবহার হয়নি।") },
      { fn: "backtest.evaluate() · stats.block_bootstrap_auc()", file: "core/backtest.py, core/stats.py", lib: "numpy, scikit-learn", what: t("Accuracy, AUC with 95% range, calibration, return after costs, Sharpe, trades.", "সঠিকতা, ৯৫% পরিসরসহ AUC, ক্যালিব্রেশন, খরচের পরে লাভ, Sharpe, ট্রেড।") },
      { fn: "GATE checks → has_edge", file: "research/study.py", what: t("All five must pass, or the window stays on Wait.", "পাঁচটিই পাস করতে হবে, না হলে সময়সীমা অপেক্ষায় থাকে।") },
      { fn: "store.save_research()", file: "core/store.py", what: t("Stores the choice, the hold-out result and the calibration table.", "বাছাই, hold-out ফল ও ক্যালিব্রেশন সারণি সংরক্ষণ করে।") },
      { fn: "pipeline.train()", file: "core/pipeline.py", what: t("Weekly: store.load_research() → select_columns() → models.fit() on all data → store.save_model().", "সাপ্তাহিক: store.load_research() → select_columns() → সব তথ্যে models.fit() → store.save_model()।") },
    ],
  },
];

export const SECTIONS: Section[] = [
  {
    id: "python",
    title: t("Where Python is used", "Python কোথায় ব্যবহার হয়"),
    intro: t(
      "All data collection, feature building, machine learning, testing and scoring is Python 3.13 (pandas, numpy, scikit-learn, LightGBM, XGBoost, PyTorch). It runs on GitHub Actions on a schedule, or on a laptop with “python run.py all tick”.",
      "সব তথ্য সংগ্রহ, বৈশিষ্ট্য তৈরি, মেশিন লার্নিং, পরীক্ষা ও নম্বর দেওয়া Python 3.13-এ (pandas, numpy, scikit-learn, LightGBM, XGBoost, PyTorch)। এটি GitHub Actions-এ সময়মতো চলে, অথবা ল্যাপটপে “python run.py all tick” দিয়ে।",
    ),
    entries: [
      { name: "run.py", where: "run.py", what: t("Command line: init-db, train, predict, update, tick (= update + predict + publish), loop.", "কমান্ড লাইন: init-db, train, predict, update, tick (= update + predict + publish), loop।"), why: t("One entry point for both the scheduled jobs and local use.", "নির্ধারিত কাজ ও লোকাল ব্যবহারের জন্য একটাই প্রবেশপথ।") },
      { name: "pipeline", where: "core/pipeline.py", what: t("train(): fits the chosen model per window. predict(): builds features, asks the model, explains it, builds the checklist, stores the reading with the chance clients see.", "train(): প্রতি সময়সীমায় বাছাই করা মডেল শেখায়। predict(): বৈশিষ্ট্য বানায়, মডেলকে জিজ্ঞেস করে, ব্যাখ্যা করে, চেকলিস্ট বানায়, গ্রাহককে দেখানো সম্ভাবনাসহ পর্যবেক্ষণ সংরক্ষণ করে।"), why: t("Keeps the order of steps in one place, so live use matches research exactly.", "ধাপগুলোর ক্রম এক জায়গায় রাখে, তাই লাইভ ব্যবহার গবেষণার সাথে হুবহু মেলে।") },
      { name: "features", where: "core/features.py", what: t("Turns bars and drivers into ~200 columns in 6 families; make_target() builds the up/down label.", "বার ও ড্রাইভারকে ৬ পরিবারে ~২০০টি কলামে রূপ দেয়; make_target() উপরে/নিচে লেবেল বানায়।"), why: t("Every value uses only data known at that bar (tested by a no-look-ahead test).", "প্রতিটি মান শুধু ওই বারে জানা তথ্য ব্যবহার করে (no-look-ahead টেস্ট দিয়ে যাচাই)।") },
      { name: "models", where: "core/models.py", what: t("All 11 model types behind one interface: fit() and predict_proba().", "১১ ধরনের সব মডেল এক ইন্টারফেসে: fit() ও predict_proba()।"), why: t("The research harness can swap models without special cases.", "গবেষণা-কাঠামো আলাদা নিয়ম ছাড়াই মডেল বদলাতে পারে।") },
      { name: "backtest", where: "core/backtest.py", what: t("walk_forward() with a purge gap; evaluate() gives accuracy, AUC, calibration, return after costs, Sharpe, drawdown.", "purge gap-সহ walk_forward(); evaluate() দেয় সঠিকতা, AUC, ক্যালিব্রেশন, খরচের পরে লাভ, Sharpe, drawdown।"), why: t("Time-ordered testing is the only honest test for price data.", "দামের তথ্যের জন্য সময়ক্রমে পরীক্ষাই একমাত্র সৎ পরীক্ষা।") },
      { name: "research study", where: "research/study.py", what: t("Two-stage model competition on the first 80%, one locked test on the last 20%, five-check gate.", "প্রথম ৮০%-এ দুই ধাপের মডেল-প্রতিযোগিতা, শেষ ২০%-এ একবার লক করা পরীক্ষা, পাঁচ পরীক্ষার গেট।"), why: t("Stops us from picking a lucky model.", "ভাগ্যক্রমে ভালো মডেল বাছাই ঠেকায়।") },
      { name: "stats", where: "core/stats.py", what: t("Block-bootstrap AUC range and Wilson intervals.", "Block-bootstrap AUC পরিসর ও Wilson interval।"), why: t("A number without its uncertainty range can mislead.", "অনিশ্চয়তার পরিসর ছাড়া সংখ্যা ভুল বোঝাতে পারে।") },
      { name: "scorecard", where: "core/scorecard.py", what: t("The 10-factor checklist and the measured hit rate of past days that agreed as strongly.", "১০-ফ্যাক্টরের চেকলিস্ট এবং যেসব অতীত দিনে সমান জোরালো মিল ছিল তাদের মাপা মিলের হার।"), why: t("Explainable rules a person can check by hand.", "মানুষ হাতে যাচাই করতে পারে এমন ব্যাখ্যাযোগ্য নিয়ম।") },
      { name: "public chance", where: "core/public.py", what: t("Turns the checklist (daily) or the model’s calibration (intraday) into the client’s % and stores it with each reading.", "চেকলিস্ট (দৈনিক) বা মডেলের ক্যালিব্রেশন (ইন্ট্রাডে) থেকে গ্রাহকের % বানায় এবং প্রতিটি পর্যবেক্ষণের সাথে রাখে।"), why: t("Clients only see measured frequencies, and the log can score exactly what they saw.", "গ্রাহক শুধু মাপা হার দেখেন, আর লগ ঠিক সেটারই নম্বর দিতে পারে যা তাঁরা দেখেছেন।") },
      { name: "explain", where: "core/explain.py", what: t("Occlusion: replace one family of inputs with typical values and see how much the chance moves.", "Occlusion: এক পরিবারের ইনপুট সাধারণ মান দিয়ে বদলে দেখা সম্ভাবনা কতটা নড়ে।"), why: t("Works for every model type, unlike tree-only explanations.", "সব ধরনের মডেলে কাজ করে, শুধু tree-ভিত্তিক ব্যাখ্যার মতো নয়।") },
      { name: "sources / news", where: "core/sources.py, core/news.py", what: t("Downloads FRED, CFTC and calendar data; fetches and scores headlines (rules or AI).", "FRED, CFTC ও ক্যালেন্ডারের তথ্য নামায়; শিরোনাম এনে নম্বর দেয় (নিয়ম বা AI)।"), why: t("Free, public, no account needed (except the optional AI).", "বিনামূল্যে, প্রকাশ্য, অ্যাকাউন্ট লাগে না (ঐচ্ছিক AI ছাড়া)।") },
      { name: "settings / API log", where: "core/settings.py", what: t("Reads the AI provider chosen by the super admin (key decrypted with SETTINGS_KEY) and logs every AI call.", "সুপার অ্যাডমিনের বাছাই করা AI সেবা পড়ে (SETTINGS_KEY দিয়ে কী ডিক্রিপ্ট) এবং প্রতিটি AI কল লগ করে।"), why: t("The provider can be changed from the website without touching code or GitHub.", "কোড বা GitHub না ছুঁয়েই ওয়েবসাইট থেকে সেবা বদলানো যায়।") },
      { name: "shadow / signal / regime", where: "core/shadow.py, core/signal.py, core/regime.py", what: t("Practice trades with ATR stop and target; Buy/Sell/Wait rule; market-state label. resolve_predictions() marks each reading right or wrong.", "ATR stop ও target-সহ অনুশীলন ট্রেড; কিনুন/বেচুন/অপেক্ষা নিয়ম; বাজারের অবস্থা। resolve_predictions() প্রতিটি পর্যবেক্ষণ সঠিক বা ভুল চিহ্নিত করে।"), why: t("Keeps score in real time, after costs.", "খরচের পরে, সরাসরি হিসাব রাখে।") },
      { name: "store", where: "core/store.py", what: t("One database layer for SQLite (laptop) and Postgres (Neon); creates tables and adds new columns automatically.", "SQLite (ল্যাপটপ) ও Postgres (Neon)-এর জন্য একটাই ডেটাবেস স্তর; টেবিল বানায় ও নতুন কলাম নিজে যোগ করে।"), why: t("Same code locally and in the cloud.", "লোকাল ও ক্লাউডে একই কোড।") },
      { name: "scripts", where: "scripts/", what: t("access_code.py (give or revoke access), copy_db.py (move data SQLite→Neon), backfill_news.py (10 years of headlines), readme_table.py, setup.ps1.", "access_code.py (প্রবেশাধিকার দেওয়া/বাতিল), copy_db.py (SQLite→Neon তথ্য সরানো), backfill_news.py (১০ বছরের শিরোনাম), readme_table.py, setup.ps1।"), why: t("One-off admin tasks stay out of the live code.", "এককালীন প্রশাসনিক কাজ লাইভ কোডের বাইরে থাকে।") },
    ],
  },
  {
    id: "models",
    title: t("The machine-learning models", "মেশিন-লার্নিং মডেলগুলো"),
    intro: t(
      "All are created by make_model(name) in core/models.py and called through fit() and predict_proba(). They compete in research/study.py; the winner per window is saved in the database by pipeline.train() and used every 15 minutes by pipeline.predict().",
      "সবগুলো core/models.py-এর make_model(name) দিয়ে তৈরি এবং fit() ও predict_proba() দিয়ে ডাকা হয়। research/study.py-তে প্রতিযোগিতা করে; প্রতি সময়সীমার বিজয়ী pipeline.train() ডেটাবেসে রাখে এবং pipeline.predict() প্রতি ১৫ মিনিটে ব্যবহার করে।",
    ),
    entries: [
      { name: "lgbm · LightGBM", where: "lightgbm.LGBMClassifier", what: t("Gradient-boosted decision trees: many small trees, each fixing the previous ones’ mistakes. 200 trees, 15 leaves, strong regularisation.", "Gradient-boosted decision tree: অনেক ছোট গাছ, প্রতিটি আগেরগুলোর ভুল ঠিক করে। ২০০ গাছ, ১৫ পাতা, শক্ত regularisation।"), why: t("Best general model for tabular data; fast; handles missing values. The default.", "টেবিল-তথ্যের জন্য সবচেয়ে ভালো সাধারণ মডেল; দ্রুত; ফাঁকা মান সামলায়। ডিফল্ট।") },
      { name: "xgb · XGBoost", where: "xgboost.XGBClassifier", what: t("Another boosted-trees library with shallower trees (depth 3).", "আরেকটি boosted-tree লাইব্রেরি, অগভীর গাছ (গভীরতা ৩)।"), why: t("A second opinion from the same family; different regularisation.", "একই পরিবারের দ্বিতীয় মত; ভিন্ন regularisation।") },
      { name: "rf · Random forest", where: "sklearn RandomForestClassifier", what: t("300 independent trees on random samples, averaged.", "এলোমেলো নমুনায় ৩০০টি স্বাধীন গাছ, গড় নেওয়া।"), why: t("Very stable on noisy data; hard to overfit.", "গোলমেলে তথ্যে খুব স্থির; overfit করা কঠিন।") },
      { name: "et · Extra-trees", where: "sklearn ExtraTreesClassifier", what: t("Like a random forest but the split points are random too.", "র‍্যান্ডম ফরেস্টের মতো, তবে ভাগের বিন্দুও এলোমেলো।"), why: t("Even more noise-resistant; often wins on weak signals.", "আরও বেশি noise-প্রতিরোধী; দুর্বল সংকেতে প্রায়ই জেতে।") },
      { name: "logit · Elastic-net logistic", where: "sklearn LogisticRegression (saga, l1_ratio 0.5)", what: t("A straight-line model on scaled inputs; L1+L2 penalties switch off useless inputs.", "স্কেল করা ইনপুটে সরলরেখার মডেল; L1+L2 শাস্তি অকেজো ইনপুট বন্ধ করে।"), why: t("Simple baseline; if complex models can’t beat it, they aren’t learning anything real.", "সহজ মাপকাঠি; জটিল মডেল একে হারাতে না পারলে সত্যিকারের কিছু শিখছে না।") },
      { name: "ridge · Ridge logistic", where: "sklearn LogisticRegression (L2)", what: t("Logistic regression with only the L2 penalty.", "শুধু L2 শাস্তিসহ লজিস্টিক রিগ্রেশন।"), why: t("Keeps all inputs but shrinks them; good when many inputs each matter a little.", "সব ইনপুট রাখে কিন্তু ছোট করে; যখন অনেক ইনপুট সামান্য সামান্য গুরুত্বপূর্ণ।") },
      { name: "mlp · Small neural network", where: "sklearn MLPClassifier (32→16)", what: t("Two hidden layers with early stopping.", "early stopping-সহ দুটি লুকানো স্তর।"), why: t("Can find non-linear mixes that linear models miss.", "লিনিয়ার মডেল যা পায় না এমন non-linear মিশ্রণ খুঁজতে পারে।") },
      { name: "lstm · LSTM", where: "PyTorch, LSTMClassifier", what: t("A recurrent network reading the last 30 rows as a sequence.", "শেষ ৩০টি সারি ধারাবাহিকভাবে পড়া একটি recurrent নেটওয়ার্ক।"), why: t("Tests whether order in time carries extra information.", "সময়ের ক্রমে বাড়তি তথ্য আছে কি না পরীক্ষা করে।") },
      { name: "blend", where: "Blend(FAST_BASES)", what: t("Average of LightGBM, XGBoost, random forest, extra-trees and logistic.", "LightGBM, XGBoost, র‍্যান্ডম ফরেস্ট, এক্সট্রা-ট্রি ও লজিস্টিকের গড়।"), why: t("Averaging different models cancels some of their errors.", "ভিন্ন মডেলের গড় তাদের কিছু ভুল কাটাকাটি করে।") },
      { name: "stack", where: "Stack(FAST_BASES)", what: t("A small logistic model learns how much to trust each base model, from their out-of-fold predictions.", "একটি ছোট লজিস্টিক মডেল out-of-fold প্রেডিকশন থেকে শেখে কোন মূল মডেলকে কতটা বিশ্বাস করতে হবে।"), why: t("Weights models by evidence instead of equally.", "সমান নয়, প্রমাণ অনুযায়ী মডেলের ওজন দেয়।") },
      { name: "meta · Meta-labeling", where: "MetaLabeled(primary)", what: t("A second LightGBM predicts “is the first model’s call right?”.", "দ্বিতীয় একটি LightGBM অনুমান করে “প্রথম মডেলের কথা কি ঠিক?”।"), why: t("Used to test whether skipping low-confidence calls raises accuracy.", "কম আত্মবিশ্বাসের কল বাদ দিলে সঠিকতা বাড়ে কি না পরীক্ষায় ব্যবহার হয়।") },
      { name: "AI language model (optional)", where: "core/news.py score_llm()", what: t("An OpenAI-compatible chat model (GitHub Models, Groq, Gemini, OpenRouter…) reads headlines and returns sentiment −1…+1, topic and impact as JSON.", "একটি OpenAI-সামঞ্জস্যপূর্ণ চ্যাট মডেল (GitHub Models, Groq, Gemini, OpenRouter…) শিরোনাম পড়ে JSON-এ sentiment −১…+১, বিষয় ও প্রভাব দেয়।"), why: t("Reads news better than keywords. It never predicts the price; its output is one input among ~200. Any failure falls back to the rules and is shown in API Logs.", "কীওয়ার্ডের চেয়ে ভালো খবর পড়ে। দাম কখনো অনুমান করে না; এর ফল ~২০০টির মধ্যে একটি ইনপুট। ব্যর্থ হলে নিয়মে ফিরে যায় এবং API লগে দেখা যায়।") },
    ],
  },
  {
    id: "strategy",
    title: t("Strategy and evaluation", "কৌশল ও যাচাই"),
    entries: [
      { name: "Target", where: "core/features.py make_target()", what: t("1 if the close after N bars is higher than now (30m = 6×5-min bars, 1h = 12, 1d = 1 day, 1w = 5 days).", "N বার পরের দাম এখনকার চেয়ে বেশি হলে ১ (30m = ৬×৫-মিনিট বার, 1h = ১২, 1d = ১ দিন, 1w = ৫ দিন)।"), why: t("Direction is what a trader acts on.", "ট্রেডার দিক দেখেই সিদ্ধান্ত নেন।") },
      { name: "No look-ahead", where: "features + sources", what: t("Macro values shifted 1–3 days, CFTC +4 days, higher timeframes only after their bar closes.", "অর্থনীতির মান ১–৩ দিন, CFTC +৪ দিন সরানো; বড় টাইমফ্রেম শুধু বার বন্ধ হওয়ার পরে।"), why: t("The most common reason backtests look too good.", "Backtest অতিরিক্ত ভালো দেখানোর সবচেয়ে সাধারণ কারণ।") },
      { name: "Walk-forward + purge gap", where: "core/backtest.py", what: t("Train on everything before a block, skip N bars, test the block, move on.", "একটি অংশের আগের সব দিয়ে শেখা, N বার বাদ, অংশটি পরীক্ষা, এগিয়ে যাওয়া।"), why: t("Mimics live use; the gap stops overlapping labels leaking.", "লাইভ ব্যবহারের মতো; gap একে অন্যে মেশা লেবেল ফাঁস হওয়া থামায়।") },
      { name: "Two-stage competition", where: "research/study.py", what: t("Stage A: every model on chart inputs. Stage B: the best two on four more input sets. ≈18 candidates, scored by AUC on the first 80%.", "ধাপ A: চার্ট-ইনপুটে সব মডেল। ধাপ B: সেরা দুটি আরও চারটি ইনপুট-সেটে। ≈১৮ প্রার্থী, প্রথম ৮০%-এ AUC দিয়ে নম্বর।"), why: t("Search wide but keep the number of tries countable.", "বিস্তৃত খোঁজা, কিন্তু চেষ্টার সংখ্যা গণনাযোগ্য রাখা।") },
      { name: "Locked hold-out + gate", where: "research/study.py GATE", what: t("The winner is tested once on the last 20%. Pass needs: ≥300 rows, AUC 95% range above 0.5, accuracy ≥ guessing + 1 pt, positive return and Sharpe after costs, ≥30 trades.", "বিজয়ীকে শেষ ২০%-এ একবার পরীক্ষা। পাসের শর্ত: ≥৩০০ সারি, AUC-এর ৯৫% পরিসর ০.৫-এর উপরে, সঠিকতা ≥ আন্দাজ + ১ পয়েন্ট, খরচের পরে লাভ ও Sharpe ধনাত্মক, ≥৩০ ট্রেড।"), why: t("If it fails, Buy/Sell is switched off for that window (Wait).", "ব্যর্থ হলে সেই সময়সীমায় কিনুন/বেচুন বন্ধ (অপেক্ষা)।") },
      { name: "Client chance", where: "core/public.py, api/src/lib/queries.ts", what: t("Daily: checklist hit rate of similar past days (≥30). Intraday: the model’s number mapped through its hold-out calibration. Clamped 5–95%.", "দৈনিক: একই রকম অতীত দিনের চেকলিস্ট মিলের হার (≥৩০)। ইন্ট্রাডে: মডেলের সংখ্যা তার hold-out ক্যালিব্রেশনে মেলানো। ৫–৯৫%-এ সীমিত।"), why: t("A % shown to a client must be a measured frequency, not a guess.", "গ্রাহককে দেখানো % অবশ্যই মাপা হার, আন্দাজ নয়।") },
      { name: "Prediction Log", where: "/logs, predictions table", what: t("Each reading is marked right / wrong / waiting / no clear call, with daily, weekly, monthly and yearly counts.", "প্রতিটি পর্যবেক্ষণ সঠিক / ভুল / অপেক্ষায় / স্পষ্ট মত নেই হিসেবে চিহ্নিত, দৈনিক, সাপ্তাহিক, মাসিক ও বার্ষিক গণনাসহ।"), why: t("Live, out-of-sample proof that nobody can tune afterwards.", "লাইভ, নমুনার বাইরের প্রমাণ যা পরে কেউ বদলাতে পারে না।") },
      { name: "Shadow trades", where: "core/shadow.py", what: t("Virtual trades: stop 1.5×ATR, target 2×ATR, costs included.", "ভার্চুয়াল ট্রেড: stop ১.৫×ATR, target ২×ATR, খরচসহ।"), why: t("Shows money results without risking money.", "টাকা ঝুঁকিতে না ফেলে টাকার ফল দেখায়।") },
    ],
  },
  {
    id: "data",
    title: t("Data services", "তথ্যের সেবা"),
    entries: [
      { name: "Yahoo Finance (yfinance)", where: "nse_etf/yf_data.py", what: t("Gold futures GC=F, GOLDBEES.NS and 23 driver series. Free, no key. Intraday kept ~60 days, so bars are cached.", "সোনার ফিউচার GC=F, GOLDBEES.NS ও ২৩টি ড্রাইভার সিরিজ। বিনামূল্যে, কী লাগে না। ইন্ট্রাডে মাত্র ~৬০ দিন, তাই বার ক্যাশে রাখা হয়।"), why: t("The only free source with intraday gold and all market drivers in one place.", "একই জায়গায় ইন্ট্রাডে সোনা ও সব বাজার-ড্রাইভারের একমাত্র ফ্রি উৎস।") },
      { name: "Dukascopy (spot XAU/USD history)", where: "core/dukascopy.py", what: t("Three years of free 1-minute spot gold candles, one compressed file per day, turned into 15-minute and hourly bars. It is the backbone of the intraday data; Yahoo only adds today's newest hours, scaled to the spot price.", "তিন বছরের ফ্রি ১-মিনিটের স্পট সোনার candle, প্রতিদিন একটি সংকুচিত ফাইল, যা থেকে ১৫ মিনিট ও ঘণ্টার বার বানানো হয়। ইন্ট্রাডে ডেটার মূল ভিত্তি এটাই; Yahoo শুধু আজকের নতুন ঘণ্টাগুলো যোগ করে, স্পট দামে মেলিয়ে।"), why: t("Yahoo keeps only ~60 days of intraday bars, so the 30-minute and 1-hour models learned one short episode; the futures series also jumps at each contract roll. Spot is what Exness trades.", "Yahoo মাত্র ~৬০ দিনের ইন্ট্রাডে বার রাখে, তাই ৩০ মিনিট ও ১ ঘণ্টার মডেল একটা ছোট পর্ব মুখস্থ করছিল; ফিউচার্স সিরিজ প্রতিটি চুক্তি বদলের সময় লাফও দেয়। আর Exness স্পট দামেই ট্রেড করে।") },
      { name: "Exness MT5", where: "xauusd/mt5_data.py", what: t("Broker prices for XAU/USD through the MetaTrader 5 terminal (Windows only). Off in the cloud.", "MetaTrader 5 টার্মিনালের মাধ্যমে XAU/USD-এর ব্রোকার দাম (শুধু Windows)। ক্লাউডে বন্ধ।"), why: t("Exact prices of the account that would trade.", "যে অ্যাকাউন্টে ট্রেড হবে তার হুবহু দাম।") },
      { name: "FRED", where: "core/sources.py load_fred()", what: t("US Federal Reserve data: real yield DFII10, breakeven T10YIE, 5y5y T5YIFR, policy rate DFF, curve T10Y2Y, broad dollar DTWEXBGS. Public CSV, no key.", "মার্কিন ফেডারেল রিজার্ভের তথ্য: প্রকৃত সুদ DFII10, breakeven T10YIE, 5y5y T5YIFR, নীতি-সুদ DFF, curve T10Y2Y, broad dollar DTWEXBGS। প্রকাশ্য CSV, কী লাগে না।"), why: t("Real yield is the best-known driver of gold.", "প্রকৃত সুদ সোনার সবচেয়ে পরিচিত চালক।") },
      { name: "CFTC Commitments of Traders", where: "core/sources.py load_cot_raw()", what: t("Weekly report of hedge-fund and producer positions in gold futures (contract 088691) since 2006.", "২০০৬ থেকে সোনার ফিউচারে (চুক্তি 088691) হেজ ফান্ড ও উৎপাদকদের অবস্থানের সাপ্তাহিক প্রতিবেদন।"), why: t("Crowded bets often reverse.", "ভিড় করা বাজি প্রায়ই উল্টে যায়।") },
      { name: "Google News RSS", where: "core/news.py", what: t("Six searches (gold, Fed, inflation, dollar, geopolitics, central-bank buying) every 15 min; date-restricted backfill to 2016.", "প্রতি ১৫ মিনিটে ছয়টি খোঁজ (সোনা, ফেড, মূল্যস্ফীতি, ডলার, ভূরাজনীতি, কেন্দ্রীয় ব্যাংকের কেনা); ২০১৬ পর্যন্ত তারিখ-সীমিত পুরোনো খবর।"), why: t("Free, wide coverage, no key.", "বিনামূল্যে, বিস্তৃত, কী লাগে না।") },
      { name: "Economic calendar", where: "core/news.py refresh_events()", what: t("This week’s scheduled releases (CPI, jobs, Fed) from a public JSON feed.", "প্রকাশ্য JSON ফিড থেকে এই সপ্তাহের নির্ধারিত ঘোষণা (CPI, চাকরি, ফেড)।"), why: t("Big moves cluster around these events.", "বড় নড়াচড়া এসব ঘটনার আশেপাশে জমে।") },
      { name: "AI provider (optional)", where: "Model API page", what: t("Any OpenAI-compatible chat endpoint; the super admin sets URL, model and key and can test it.", "যেকোনো OpenAI-সামঞ্জস্যপূর্ণ চ্যাট এন্ডপয়েন্ট; সুপার অ্যাডমিন URL, মডেল ও কী দেন এবং পরীক্ষা করতে পারেন।"), why: t("Free tiers exist; switching providers needs no code change.", "ফ্রি টিয়ার আছে; সেবা বদলাতে কোড বদলাতে হয় না।") },
    ],
  },
  {
    id: "web",
    title: t("Frontend and backend: two separate hosts", "ফ্রন্টএন্ড ও ব্যাকএন্ড: দুটো আলাদা হোস্ট"),
    intro: t(
      "Two folders, two Cloudflare Workers, deployed independently. web/ (frontend): Next.js 16, React 19, TypeScript, Tailwind CSS 4, exported as static files; no server code and no secrets. api/ (backend): a TypeScript Worker with one route table; it alone talks to the database and holds every secret. Node.js is used only on the developer’s laptop and in CI to build, test and deploy.",
      "দুটো ফোল্ডার, দুটো Cloudflare Worker, আলাদাভাবে deploy হয়। web/ (ফ্রন্টএন্ড): Next.js 16, React 19, TypeScript, Tailwind CSS 4, স্ট্যাটিক ফাইল হিসেবে export; কোনো সার্ভার কোড বা গোপন তথ্য নেই। api/ (ব্যাকএন্ড): একটি রুট-তালিকাসহ TypeScript Worker; শুধু এটিই ডেটাবেসের সাথে কথা বলে এবং সব গোপন তথ্য রাখে। Node.js শুধু ডেভেলপারের ল্যাপটপে ও CI-তে বিল্ড, টেস্ট ও deploy-এ লাগে।",
    ),
    entries: [
      { name: "Pages (frontend)", where: "web/app/(app)/*/page.tsx", what: t("Signal (everyone); Dashboard, Prediction Logs, Checklist, What moves gold, News, Results, History, How the model works, Notebook, Model API, API Logs, Users (super admin).", "সংকেত (সবার জন্য); ড্যাশবোর্ড, প্রেডিকশন লগ, চেকলিস্ট, সোনা কীসে নড়ে, খবর, ফলাফল, ইতিহাস, মডেল কীভাবে কাজ করে, নোটবুক, মডেল API, API লগ, ব্যবহারকারী (সুপার অ্যাডমিন)।"), why: t("Client screens stay simple; every detail is one click away for the admin.", "গ্রাহকের পর্দা সহজ থাকে; অ্যাডমিনের জন্য প্রতিটি খুঁটিনাটি এক ক্লিকে।") },
      { name: "API client (frontend)", where: "web/lib/api.ts", what: t("apiFetch() / useApi() call NEXT_PUBLIC_API_URL with credentials: \"include\"; a 401 sends the person to sign-in.", "apiFetch() / useApi() credentials: \"include\" দিয়ে NEXT_PUBLIC_API_URL ডাকে; 401 পেলে সাইন-ইনে পাঠায়।"), why: t("The frontend only knows the API’s address, nothing else.", "ফ্রন্টএন্ড শুধু API-র ঠিকানা জানে, আর কিছু না।") },
      { name: "Route table (backend)", where: "api/src/routes.ts, api/src/index.ts", what: t("Every endpoint in one list (method, path, who may call it). index.ts adds CORS for the frontend’s origin and refuses changes sent from other sites.", "সব এন্ডপয়েন্ট একটি তালিকায় (method, path, কে ডাকতে পারে)। index.ts ফ্রন্টএন্ডের origin-এর জন্য CORS যোগ করে এবং অন্য সাইট থেকে পাঠানো পরিবর্তন ফিরিয়ে দেয়।"), why: t("Easy to audit: one file shows the whole API surface.", "যাচাই সহজ: একটি ফাইলেই পুরো API দেখা যায়।") },
      { name: "secured() (backend)", where: "api/src/lib/http.ts", what: t("Wraps each endpoint: checks sign-in, re-reads role and extra pages from the database, returns JSON. Admin routes return 403 to clients.", "প্রতিটি এন্ডপয়েন্ট মোড়ায়: সাইন-ইন যাচাই, ডেটাবেস থেকে আবার ভূমিকা ও বাড়তি পাতা পড়া, JSON ফেরত। অ্যাডমিন রুট গ্রাহককে 403 দেয়।"), why: t("Hiding a page is not security; the data itself is refused.", "পাতা লুকানো নিরাপত্তা নয়; তথ্যটাই দেওয়া হয় না।") },
      { name: "queries / admin (backend)", where: "api/src/lib/queries.ts, api/src/lib/admin.ts", what: t("All SQL in pure functions over a run() callback.", "সব SQL একটি run() callback-এর উপর বিশুদ্ধ ফাংশনে।"), why: t("Tested against a real in-memory Postgres (PGlite) with Vitest.", "Vitest দিয়ে আসল in-memory Postgres (PGlite)-এ পরীক্ষিত।") },
      { name: "Auth (backend)", where: "api/src/lib/access.ts", what: t("Access code → SHA-256 hash lookup → 30-day signed HttpOnly session cookie (jose, HS256), SameSite=Lax. Optional Cloudflare Access.", "অ্যাক্সেস কোড → SHA-256 হ্যাশ মেলানো → ৩০ দিনের সাইন করা HttpOnly সেশন কুকি (jose, HS256), SameSite=Lax। ঐচ্ছিক Cloudflare Access।"), why: t("No passwords stored; page scripts cannot read the cookie; revoking a code locks the person out at once.", "কোনো পাসওয়ার্ড রাখা হয় না; পাতার স্ক্রিপ্ট কুকি পড়তে পারে না; কোড বাতিল করলে সাথে সাথে বের হয়ে যায়।") },
      { name: "Charts, i18n (frontend)", where: "lightweight-charts, web/lib/i18n.tsx", what: t("TradingView’s free chart library; every text in English and Bengali.", "TradingView-এর ফ্রি চার্ট লাইব্রেরি; প্রতিটি লেখা ইংরেজি ও বাংলায়।"), why: t("Small and fast on phones; the client reads Bengali.", "ফোনে ছোট ও দ্রুত; গ্রাহক বাংলা পড়েন।") },
    ],
  },
  {
    id: "neon",
    title: t("Neon: the database", "Neon: ডেটাবেস"),
    intro: t(
      "Serverless Postgres (free tier, Singapore region). Python connects with psycopg through the pooled endpoint; the backend API connects with @neondatabase/serverless over HTTPS (the frontend never touches the database). The connection string is a secret (DATABASE_URL) in GitHub and Cloudflare, never in the code.",
      "Serverless Postgres (ফ্রি টিয়ার, সিঙ্গাপুর)। Python pooled endpoint দিয়ে psycopg-এ যুক্ত হয়; ব্যাকএন্ড API HTTPS-এ @neondatabase/serverless দিয়ে (ফ্রন্টএন্ড কখনো ডেটাবেস ছোঁয় না)। সংযোগের ঠিকানা GitHub ও Cloudflare-এ গোপন (DATABASE_URL), কোডে কখনো নয়।",
    ),
    entries: [
      { name: "predictions", what: t("Every reading: time, window, price, model %, client %, signal, regime, and later the outcome and price.", "প্রতিটি পর্যবেক্ষণ: সময়, সময়সীমা, দাম, মডেলের %, গ্রাহকের %, সংকেত, অবস্থা, এবং পরে ফল ও দাম।"), why: t("Source of the Prediction Log.", "প্রেডিকশন লগের উৎস।") },
      { name: "models · research · reports", what: t("Trained models (as blobs), study results per window, walk-forward reports.", "প্রশিক্ষিত মডেল (blob হিসেবে), প্রতি সময়সীমার স্টাডির ফল, walk-forward রিপোর্ট।"), why: t("Jobs are stateless; the database is their memory.", "কাজগুলো স্টেট রাখে না; ডেটাবেসই তাদের স্মৃতি।") },
      { name: "scorecards · explanations", what: t("Latest checklist and input-push breakdown per window.", "প্রতি সময়সীমার সর্বশেষ চেকলিস্ট ও ইনপুটের ঠেলার বিশ্লেষণ।"), why: t("The website shows them without running Python.", "Python না চালিয়েই ওয়েবসাইট দেখায়।") },
      { name: "candles · series · news · events · instruments", what: t("Chart bars, driver values, scored headlines, calendar, which instruments are on.", "চার্টের বার, ড্রাইভারের মান, নম্বর দেওয়া শিরোনাম, ক্যালেন্ডার, কোন ইন্সট্রুমেন্ট চালু।"), why: t("Everything the screens need, in one place.", "পর্দার যা লাগে, সব এক জায়গায়।") },
      { name: "shadow_trades · heartbeat", what: t("Practice trades; time of the last successful job.", "অনুশীলন ট্রেড; শেষ সফল কাজের সময়।"), why: t("Results page and the “Live” indicator.", "ফলাফল পাতা ও “লাইভ” নির্দেশক।") },
      { name: "access_codes · user_settings", what: t("Hashed codes with role (user / admin); alert preferences.", "ভূমিকাসহ (user / admin) হ্যাশ করা কোড; অ্যালার্টের পছন্দ।"), why: t("Who may see what.", "কে কী দেখতে পারবেন।") },
      { name: "app_settings · api_logs", what: t("AI provider settings (key encrypted with AES-256-GCM); last 2,000 outside API calls.", "AI সেবার সেটিং (কী AES-256-GCM-এ এনক্রিপ্টেড); বাইরের শেষ ২,০০০ API কল।"), why: t("Super-admin control without redeploying.", "আবার ডিপ্লয় না করেই সুপার অ্যাডমিনের নিয়ন্ত্রণ।") },
    ],
  },
  {
    id: "cloudflare",
    title: t("Cloudflare: hosting", "Cloudflare: হোস্টিং"),
    entries: [
      { name: "Two Workers", what: t("gold-predictor-api (backend, code) and gold-predictor (frontend, static files) run at the edge, close to the user. Free tier: 100,000 requests a day; static files are free.", "gold-predictor-api (ব্যাকএন্ড, কোড) ও gold-predictor (ফ্রন্টএন্ড, স্ট্যাটিক ফাইল) ব্যবহারকারীর কাছাকাছি edge-এ চলে। ফ্রি টিয়ার: দিনে ১,০০,০০০ অনুরোধ; স্ট্যাটিক ফাইল বিনামূল্যে।"), why: t("No server to patch or pay for; each side can be deployed, scaled or replaced on its own.", "প্যাচ বা টাকা দেওয়ার মতো সার্ভার নেই; প্রতিটি অংশ আলাদাভাবে deploy, বড় বা বদলানো যায়।") },
      { name: "Static assets", where: "web/wrangler.jsonc, web/next.config.ts (output: \"export\")", what: t("The frontend build is plain HTML/JS/CSS in out/, served by Cloudflare without running code.", "ফ্রন্টএন্ড বিল্ড out/-এ সাধারণ HTML/JS/CSS, Cloudflare কোড না চালিয়েই পরিবেশন করে।"), why: t("Fast, cheap, and nothing on the frontend host can leak data.", "দ্রুত, সস্তা, আর ফ্রন্টএন্ড হোস্ট থেকে কোনো তথ্য ফাঁস হতে পারে না।") },
      { name: "wrangler", where: "api/wrangler.jsonc, web/wrangler.jsonc", what: t("Cloudflare’s CLI: deploys both Workers; backend secrets (DATABASE_URL, SESSION_SECRET, SETTINGS_KEY) are stored with wrangler secret put.", "Cloudflare-এর CLI: দুটো Worker deploy করে; ব্যাকএন্ডের গোপন তথ্য (DATABASE_URL, SESSION_SECRET, SETTINGS_KEY) wrangler secret put দিয়ে রাখা হয়।"), why: t("Secrets live in Cloudflare, not in the repository, and only on the backend.", "গোপন তথ্য Cloudflare-এ থাকে, রিপোজিটরিতে নয়, এবং শুধু ব্যাকএন্ডে।") },
      { name: "Security headers · CORS", where: "web/scripts/postbuild.mjs (_headers), api/src/lib/http.ts", what: t("Frontend: Content-Security-Policy allowing calls only to the API, no framing, HTTPS only. Backend: CORS only for the frontend’s origin, with credentials.", "ফ্রন্টএন্ড: শুধু API-তে কল করতে দেওয়া Content-Security-Policy, ফ্রেমিং নিষেধ, শুধু HTTPS। ব্যাকএন্ড: শুধু ফ্রন্টএন্ডের origin-এর জন্য credentials-সহ CORS।"), why: t("Other sites can neither embed the pages nor read the API with a signed-in visitor’s cookie.", "অন্য সাইট পাতাগুলো বসাতে পারে না, আর সাইন-ইন করা কারও কুকি দিয়ে API-ও পড়তে পারে না।") },
    ],
  },
  {
    id: "actions",
    title: t("GitHub Actions: automation", "GitHub Actions: স্বয়ংক্রিয়তা"),
    entries: [
      { name: "predict.yml", what: t("Every 15 minutes: settle practice trades, score finished readings, predict, refresh news, publish candles, send alerts.", "প্রতি ১৫ মিনিটে: অনুশীলন ট্রেড মেটানো, শেষ হওয়া পর্যবেক্ষণে নম্বর, প্রেডিকশন, খবর হালনাগাদ, ক্যান্ডেল প্রকাশ, অ্যালার্ট পাঠানো।"), why: t("Free compute on a schedule (public repo).", "সময়মতো বিনামূল্যের কম্পিউট (পাবলিক রিপো)।") },
      { name: "train.yml", what: t("Sundays 02:30 UTC: retrain the chosen models on the latest data.", "রবিবার ০২:৩০ UTC: সর্বশেষ তথ্যে বাছাই করা মডেল আবার শেখানো।"), why: t("Models stay current without re-choosing them every week.", "প্রতি সপ্তাহে আবার বাছাই না করেই মডেল হালনাগাদ থাকে।") },
      { name: "research.yml", what: t("1st of each month: the full competition and locked test, one job per instrument.", "প্রতি মাসের ১ তারিখ: পুরো প্রতিযোগিতা ও লক করা পরীক্ষা, প্রতি ইন্সট্রুমেন্টে একটি কাজ।"), why: t("Re-checks the evidence as new data arrives.", "নতুন তথ্য এলে প্রমাণ আবার যাচাই করে।") },
      { name: "test.yml · deploy.yml", what: t("Python, backend and frontend tests on every push; deploy.yml redeploys only the Worker whose folder (api/ or web/) changed.", "প্রতি push-এ Python, ব্যাকএন্ড ও ফ্রন্টএন্ড টেস্ট; deploy.yml শুধু সেই Worker আবার deploy করে যার ফোল্ডার (api/ বা web/) বদলেছে।"), why: t("Nothing broken reaches clients.", "ভাঙা কিছু গ্রাহকের কাছে পৌঁছায় না।") },
    ],
  },
  {
    id: "security",
    title: t("Security and control", "নিরাপত্তা ও নিয়ন্ত্রণ"),
    entries: [
      { name: "Roles", what: t("user: Signal, Alerts, How it works. admin (super admin): everything, including Users, Model API and API Logs.", "user: সংকেত, অ্যালার্ট, কীভাবে কাজ করে। admin (সুপার অ্যাডমিন): সবকিছু, ব্যবহারকারী, মডেল API ও API লগসহ।"), why: t("Clients get a simple answer; the owner keeps full control.", "গ্রাহক সহজ উত্তর পান; মালিকের হাতে পুরো নিয়ন্ত্রণ।") },
      { name: "Per-client pages (perms)", where: "access_codes.perms, secured({ perm })", what: t("The super admin can open extra pages to one client from the Users page; today: Prediction Logs. A client sees only the readings they were shown, never the model’s own number.", "সুপার অ্যাডমিন ব্যবহারকারী পাতা থেকে একজন গ্রাহকের জন্য বাড়তি পাতা খুলে দিতে পারেন; এখন: প্রেডিকশন লগ। গ্রাহক শুধু তাঁকে দেখানো পর্যবেক্ষণ দেখেন, মডেলের নিজস্ব সংখ্যা কখনো নয়।"), why: t("Transparency for clients who want proof, without exposing internals.", "যে গ্রাহক প্রমাণ চান তাঁর জন্য স্বচ্ছতা, ভেতরের খুঁটিনাটি না দেখিয়ে।") },
      { name: "No secrets in code", what: t("Keys live in GitHub secrets, Cloudflare secrets or (encrypted) in the database. The repository is public and clean.", "কী থাকে GitHub secret, Cloudflare secret বা (এনক্রিপ্টেড) ডেটাবেসে। রিপোজিটরি পাবলিক ও পরিষ্কার।"), why: t("Open source without leaking access.", "প্রবেশাধিকার ফাঁস না করে ওপেন সোর্স।") },
      { name: "SETTINGS_KEY", what: t("Shared secret that encrypts the AI key on the website and decrypts it in the Python job.", "যে গোপন চাবি ওয়েবসাইটে AI কী এনক্রিপ্ট করে এবং Python কাজে ডিক্রিপ্ট করে।"), why: t("A database leak alone does not reveal the AI key.", "শুধু ডেটাবেস ফাঁস হলে AI কী প্রকাশ পায় না।") },
    ],
  },
  {
    id: "glossary",
    title: t("Code words (glossary)", "কোড-শব্দ (পরিভাষা)"),
    entries: [
      { name: "AUC", what: t("Chance the model ranks a random up-move above a random down-move. 0.5 = coin flip, 1 = perfect.", "মডেল একটি এলোমেলো ওঠাকে একটি এলোমেলো নামার উপরে রাখার সম্ভাবনা। ০.৫ = টস, ১ = নিখুঁত।"), why: t("Not fooled by a market that rises more often than it falls.", "যে বাজার বেশি ওঠে তাতে বিভ্রান্ত হয় না।") },
      { name: "Base rate", what: t("How often gold rose in the period, e.g. 53% of days.", "সময়কালে সোনা কতবার উঠেছে, যেমন ৫৩% দিন।"), why: t("“Guessing” to beat.", "যে “আন্দাজ”কে হারাতে হবে।") },
      { name: "Calibration", what: t("When the model says 60%, does it happen 60% of the time?", "মডেল ৬০% বললে কি ৬০% সময় ঘটে?"), why: t("Makes a % trustworthy.", "একটি %-কে বিশ্বাসযোগ্য করে।") },
      { name: "Hold-out", what: t("Data locked away until the final test.", "শেষ পরীক্ষা পর্যন্ত তালাবদ্ধ তথ্য।"), why: t("The only unbiased score.", "একমাত্র পক্ষপাতহীন নম্বর।") },
      { name: "Look-ahead bias / leakage", what: t("Using information that wasn’t known yet.", "তখনো না-জানা তথ্য ব্যবহার করা।"), why: t("Makes backtests lie.", "Backtest-কে মিথ্যা বলায়।") },
      { name: "Purge gap", what: t("Bars removed between train and test so their labels don’t overlap.", "শেখা ও পরীক্ষার মাঝে বাদ দেওয়া বার, যাতে লেবেল না মেশে।"), why: t("Prevents leakage in multi-bar targets.", "বহু-বারের লক্ষ্যে ফাঁস ঠেকায়।") },
      { name: "Block bootstrap", what: t("Resampling chunks of time to get a range for AUC.", "সময়ের টুকরো আবার নমুনা নিয়ে AUC-এর পরিসর বের করা।"), why: t("Respects that nearby days are related.", "কাছাকাছি দিন সম্পর্কিত, তা মানে।") },
      { name: "Wilson interval", what: t("Range for a hit rate from a small sample.", "ছোট নমুনা থেকে মিলের হারের পরিসর।"), why: t("Shows how sure a % really is.", "একটি % আসলে কতটা নিশ্চিত দেখায়।") },
      { name: "Sharpe ratio", what: t("Average return divided by its volatility, yearly.", "গড় লাভকে তার ওঠানামা দিয়ে ভাগ, বার্ষিক।"), why: t("Profit per unit of risk.", "প্রতি একক ঝুঁকিতে লাভ।") },
      { name: "ATR · RSI · regime", what: t("Average true range (typical bar size); relative strength index (overbought/oversold); market-state label.", "Average true range (সাধারণ বারের আকার); relative strength index (অতিরিক্ত কেনা/বেচা); বাজারের অবস্থা।"), why: t("Standard chart tools used as inputs and for stops.", "প্রচলিত চার্ট-সরঞ্জাম, ইনপুট ও stop-এর জন্য।") },
      { name: "Real yield · breakeven · COT", what: t("Bond yield after inflation; market’s inflation forecast; CFTC positioning report.", "মূল্যস্ফীতির পরে বন্ডের সুদ; বাজারের মূল্যস্ফীতির পূর্বাভাস; CFTC অবস্থান প্রতিবেদন।"), why: t("Core macro drivers of gold.", "সোনার প্রধান অর্থনৈতিক চালক।") },
      { name: "Edge", what: t("Proven advantage over guessing on the locked hold-out, after costs.", "খরচের পরে, লক করা hold-out-এ আন্দাজের চেয়ে প্রমাণিত সুবিধা।"), why: t("Without it the system says Wait.", "এটি না থাকলে সিস্টেম অপেক্ষা বলে।") },
      { name: "Occlusion · stacking · blending · meta-labeling", what: t("Explain by removing inputs; learn model weights; average models; predict if a call is right.", "ইনপুট সরিয়ে ব্যাখ্যা; মডেলের ওজন শেখা; মডেলের গড়; কল ঠিক কি না অনুমান।"), why: t("See the sections above.", "উপরের অংশগুলো দেখুন।") },
    ],
  },
  {
    id: "qa",
    title: t("Questions a senior may ask", "সিনিয়র যা জিজ্ঞেস করতে পারেন"),
    entries: [
      { name: "Why not show the model’s own %?", what: t("Raw model outputs are often over- or under-confident.", "মডেলের কাঁচা ফল প্রায়ই অতিরিক্ত বা কম আত্মবিশ্বাসী।"), why: t("We show how often that situation actually came true.", "আমরা দেখাই সেই পরিস্থিতি আসলে কতবার সত্যি হয়েছে।") },
      { name: "How do you know it isn’t overfit?", what: t("Choice on the first 80%, one locked test on the last 20%, five-check gate, and a live log nobody can edit.", "প্রথম ৮০%-এ বাছাই, শেষ ২০%-এ একবার লক করা পরীক্ষা, পাঁচ পরীক্ষার গেট, এবং কেউ বদলাতে পারে না এমন লাইভ লগ।"), why: t("Each layer catches a different kind of self-deception.", "প্রতিটি স্তর ভিন্ন ধরনের আত্মপ্রবঞ্চনা ধরে।") },
      { name: "Can an AI model predict gold better?", what: t("Language models read text; they don’t have a price edge and can answer differently each time.", "ভাষা মডেল লেখা পড়ে; দামের সুবিধা তাদের নেই এবং প্রতিবার ভিন্ন উত্তর দিতে পারে।"), why: t("Used only to score news, at temperature 0, logged and replaceable.", "শুধু খবরে নম্বর দিতে, temperature 0-তে, লগসহ ও বদলযোগ্যভাবে ব্যবহার।") },
      { name: "What does it cost?", what: t("Free tiers: GitHub Actions (public repo), Neon, Cloudflare Workers, public data, free AI tiers.", "ফ্রি টিয়ার: GitHub Actions (পাবলিক রিপো), Neon, Cloudflare Workers, প্রকাশ্য তথ্য, ফ্রি AI টিয়ার।"), why: t("No server to maintain.", "রক্ষণাবেক্ষণের কোনো সার্ভার নেই।") },
      { name: "What would you improve next?", what: t("Paid tick data and order-book depth, longer intraday history, a broker execution layer with a risk engine.", "পেইড tick ডেটা ও order-book গভীরতা, দীর্ঘ ইন্ট্রাডে ইতিহাস, risk engine-সহ ব্রোকার এক্সিকিউশন স্তর।"), why: t("Free data is the main limit today.", "আজ প্রধান সীমা হলো ফ্রি তথ্য।") },
    ],
  },
];
