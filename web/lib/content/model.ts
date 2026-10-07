/** Text of the "How the model works" page, written like a short research paper. English and Bengali. */
export type T = { en: string; bn: string };
export type Box = { title: T; body: T; kind: "data" | "step" | "check" | "out" };
export type Row = { label: T; boxes: Box[] };

export const PAPER = {
  title: { en: "Gold direction forecasting: method and evidence", bn: "সোনার দামের দিক অনুমান: পদ্ধতি ও প্রমাণ" },
  abstract: {
    en: "We estimate the chance that the gold price ends higher or lower over four windows (30 minutes, 1 hour, 1 day, 1 week). Inputs come from free public sources: prices, the dollar, interest rates, inflation expectations, futures positioning, the calendar and news. Several machine-learning models compete on old data; the winner is then judged once on a locked final 20% of history it never saw. A model is allowed to give Buy/Sell only if it passes every check on that locked part. Clients never see a raw model number: they see how often gold actually rose or fell in similar past situations.",
    bn: "আমরা চারটি সময়সীমায় (৩০ মিনিট, ১ ঘণ্টা, ১ দিন, ১ সপ্তাহ) সোনার দাম বাড়ার বা কমার সম্ভাবনা অনুমান করি। তথ্য আসে বিনামূল্যের পাবলিক উৎস থেকে: দাম, ডলার, সুদের হার, মূল্যস্ফীতির প্রত্যাশা, ফিউচার্সে বড়দের অবস্থান, ক্যালেন্ডার ও খবর। কয়েকটি মেশিন-লার্নিং মডেল পুরোনো তথ্যে প্রতিযোগিতা করে; বিজয়ীকে তারপর ইতিহাসের শেষ ২০% অংশে একবারই যাচাই করা হয়, যা সে কখনো দেখেনি। সেই লক করা অংশে সব পরীক্ষায় পাস করলে তবেই মডেল কিনুন/বেচুন বলতে পারে। গ্রাহকেরা কখনো মডেলের কাঁচা সংখ্যা দেখেন না: তাঁরা দেখেন অতীতে একই রকম পরিস্থিতিতে সোনা আসলে কতবার বেড়েছে বা কমেছে।",
  },
  figure: { en: "Figure 1. The whole system, from raw data to the screen", bn: "চিত্র ১. পুরো সিস্টেম: কাঁচা তথ্য থেকে পর্দা পর্যন্ত" },
  legend: {
    data: { en: "Data", bn: "তথ্য" },
    step: { en: "Processing", bn: "প্রক্রিয়া" },
    check: { en: "Test / decision", bn: "পরীক্ষা / সিদ্ধান্ত" },
    out: { en: "Output", bn: "ফলাফল" },
  },
  results: { en: "Table 1. Locked hold-out result per window (live from the database)", bn: "সারণি ১. প্রতিটি সময়সীমার লক করা যাচাইয়ের ফল (ডেটাবেস থেকে সরাসরি)" },
  cols: {
    window: { en: "Window", bn: "সময়সীমা" },
    model: { en: "Chosen model", bn: "বাছাই করা মডেল" },
    tested: { en: "Candidates", bn: "প্রার্থী" },
    acc: { en: "Accuracy vs guessing", bn: "সঠিকতা বনাম আন্দাজ" },
    auc: { en: "AUC (95% range)", bn: "AUC (৯৫% পরিসর)" },
    verdict: { en: "Verdict", bn: "রায়" },
    pass: { en: "Passed: may trade", bn: "পাস: ট্রেড বলতে পারে" },
    fail: { en: "No proven edge: Wait", bn: "প্রমাণিত সুবিধা নেই: অপেক্ষা" },
    none: { en: "Not studied yet", bn: "এখনো যাচাই হয়নি" },
  },
};

export const FLOW: Row[] = [
  {
    label: { en: "1. Collect", bn: "১. সংগ্রহ" },
    boxes: [
      { kind: "data", title: { en: "Gold prices", bn: "সোনার দাম" }, body: { en: "5-min, 15-min, hourly and daily bars (Yahoo Finance; Exness MT5 when connected).", bn: "৫ মিনিট, ১৫ মিনিট, ঘণ্টা ও দিনের বার (Yahoo Finance; সংযুক্ত থাকলে Exness MT5)।" } },
      { kind: "data", title: { en: "Markets & macro", bn: "বাজার ও অর্থনীতি" }, body: { en: "23 market series (dollar, taka, yields, Fed futures, silver, oil, stocks, VIX, gold volatility, Bitcoin, India’s gold ETF) + 10 US Federal Reserve series (real yield, inflation expectations, policy rate, CPI, jobs, PCE, policy uncertainty) + the daily Geopolitical Risk index.", bn: "২৩টি বাজার-সিরিজ (ডলার, টাকা, বন্ড-সুদ, ফেড ফিউচার্স, রুপা, তেল, শেয়ার, VIX, সোনার অস্থিরতা, বিটকয়েন, ভারতের সোনার ETF) + মার্কিন ফেডারেল রিজার্ভের ১০টি সিরিজ (প্রকৃত সুদ, মূল্যস্ফীতির প্রত্যাশা, নীতি-সুদ, CPI, চাকরি, PCE, নীতির অনিশ্চয়তা) + দৈনিক ভূরাজনৈতিক ঝুঁকি সূচক।" } },
      { kind: "data", title: { en: "Positioning & calendar", bn: "অবস্থান ও ক্যালেন্ডার" }, body: { en: "Weekly CFTC report of hedge-fund and producer bets on gold; jobs-report days, expiries, month ends.", bn: "হেজ ফান্ড ও উৎপাদকদের সোনার বাজির সাপ্তাহিক CFTC প্রতিবেদন; চাকরির প্রতিবেদনের দিন, মেয়াদ শেষ, মাসের শেষ।" } },
      { kind: "data", title: { en: "News", bn: "খবর" }, body: { en: "Google News headlines every 15 minutes, scored −1…+1 for gold by keyword rules or an AI model.", bn: "প্রতি ১৫ মিনিটে Google News-এর শিরোনাম, সোনার জন্য −১…+১ স্কোর: কীওয়ার্ড নিয়ম বা AI মডেল দিয়ে।" } },
    ],
  },
  {
    label: { en: "2. Make it fair", bn: "২. ন্যায্য করা" },
    boxes: [
      { kind: "check", title: { en: "Publication-lag guard", bn: "প্রকাশের দেরি-রক্ষা" }, body: { en: "Every input is shifted to the day it was really public (macro 1–3 days, CFTC report +4 days). The model never sees the future.", bn: "প্রতিটি তথ্য সেই দিনে সরানো হয় যেদিন তা সত্যিই প্রকাশ্য ছিল (অর্থনীতি ১–৩ দিন, CFTC প্রতিবেদন +৪ দিন)। মডেল কখনো ভবিষ্যৎ দেখে না।" } },
    ],
  },
  {
    label: { en: "3. Describe", bn: "৩. বর্ণনা" },
    boxes: [
      { kind: "step", title: { en: "≈200 features in 6 families", bn: "৬ পরিবারে ≈২০০টি বৈশিষ্ট্য" }, body: { en: "Price behaviour, chart indicators, dollar & rates, positioning, calendar, news mood. Plus a market-regime label (trending, ranging, high/low volatility, breakout, abnormal).", bn: "দামের আচরণ, চার্ট-সূচক, ডলার ও সুদ, অবস্থান, ক্যালেন্ডার, খবরের হাওয়া। সাথে বাজারের অবস্থা (ট্রেন্ড, রেঞ্জ, বেশি/কম ওঠানামা, ব্রেকআউট, অস্বাভাবিক)।" } },
      { kind: "step", title: { en: "Target", bn: "লক্ষ্য" }, body: { en: "1 if the close after the window is above today’s close, else 0.", bn: "সময়সীমা শেষের দাম আজকের দামের উপরে হলে ১, না হলে ০।" } },
    ],
  },
  {
    label: { en: "4. Compete", bn: "৪. প্রতিযোগিতা" },
    boxes: [
      { kind: "step", title: { en: "11 model types", bn: "১১ ধরনের মডেল" }, body: { en: "LightGBM, XGBoost, random forest, extra-trees, two logistic regressions, a small neural network, an LSTM, plus blend, stack and meta-labeling ensembles.", bn: "LightGBM, XGBoost, র‍্যান্ডম ফরেস্ট, এক্সট্রা-ট্রি, দুটি লজিস্টিক রিগ্রেশন, ছোট নিউরাল নেটওয়ার্ক, LSTM, এবং blend, stack ও meta-labeling ensemble।" } },
      { kind: "check", title: { en: "Walk-forward on the first 80%", bn: "প্রথম ৮০%-এ walk-forward" }, body: { en: "Train on the past, test on the next block, repeat; a purge gap removes overlapping labels. Stage A: all models; stage B: the best two on 4 more input sets (≈18 candidates).", bn: "অতীতে শেখা, পরের অংশে পরীক্ষা, বারবার; purge gap একে অন্যের সাথে মিশে যাওয়া লেবেল সরায়। ধাপ A: সব মডেল; ধাপ B: সেরা দুটি আরও ৪টি ইনপুট-সেটে (≈১৮ প্রার্থী)।" } },
    ],
  },
  {
    label: { en: "5. Judge once", bn: "৫. একবার বিচার" },
    boxes: [
      { kind: "check", title: { en: "Locked final 20%", bn: "লক করা শেষ ২০%" }, body: { en: "The single winner is tested on data no choice ever touched. Five checks: ≥300 rows, AUC 95% range above 0.5, accuracy ≥ guessing + 1 point, profit and Sharpe > 0 after costs, ≥30 trades.", bn: "একমাত্র বিজয়ীকে এমন তথ্যে পরীক্ষা করা হয় যা কোনো বাছাইয়ে ব্যবহার হয়নি। পাঁচটি পরীক্ষা: ≥৩০০ সারি, AUC-এর ৯৫% পরিসর ০.৫-এর উপরে, সঠিকতা ≥ আন্দাজ + ১ পয়েন্ট, খরচের পরে লাভ ও Sharpe > ০, ≥৩০টি ট্রেড।" } },
    ],
  },
  {
    label: { en: "6. Run live", bn: "৬. লাইভ চালানো" },
    boxes: [
      { kind: "step", title: { en: "Every 15 minutes", bn: "প্রতি ১৫ মিনিটে" }, body: { en: "A scheduled job fetches fresh data, asks the trained model, explains which inputs pushed it, builds the 10-factor checklist and stores everything.", bn: "একটি নির্ধারিত কাজ নতুন তথ্য আনে, প্রশিক্ষিত মডেলকে জিজ্ঞেস করে, কোন তথ্য কোন দিকে ঠেলেছে তা ব্যাখ্যা করে, ১০-ফ্যাক্টরের চেকলিস্ট বানায় এবং সব সংরক্ষণ করে।" } },
      { kind: "step", title: { en: "Weekly / monthly", bn: "সাপ্তাহিক / মাসিক" }, body: { en: "Models are retrained every Sunday; the full competition and locked test run on the 1st of each month.", bn: "প্রতি রবিবার মডেল আবার শেখে; পুরো প্রতিযোগিতা ও লক করা পরীক্ষা প্রতি মাসের ১ তারিখে চলে।" } },
    ],
  },
  {
    label: { en: "7. Turn into a fair chance", bn: "৭. ন্যায্য সম্ভাবনায় রূপান্তর" },
    boxes: [
      { kind: "check", title: { en: "Daily & weekly windows", bn: "দিন ও সপ্তাহের সময়সীমা" }, body: { en: "Count how many of 10 factors point up or down now; the chance = how often gold actually moved that way on past days that agreed at least as strongly (needs ≥30 such days).", bn: "এখন ১০টি ফ্যাক্টরের কয়টি উপরে বা নিচে নির্দেশ করছে গুনি; সম্ভাবনা = অতীতে যেসব দিনে অন্তত এতটা মিল ছিল, সেসব দিনে সোনা আসলে কতবার সেদিকে গেছে (অন্তত ৩০টি এমন দিন লাগবে)।" } },
      { kind: "check", title: { en: "30-minute & 1-hour windows", bn: "৩০ মিনিট ও ১ ঘণ্টার সময়সীমা" }, body: { en: "The model’s raw number is mapped onto its locked-test calibration: when it said ~55% before, how often did gold really rise?", bn: "মডেলের কাঁচা সংখ্যাকে তার লক করা পরীক্ষার ক্যালিব্রেশনে মেলানো হয়: আগে যখন সে ~৫৫% বলেছিল, সোনা আসলে কতবার বেড়েছিল?" } },
    ],
  },
  {
    label: { en: "8. Show", bn: "৮. দেখানো" },
    boxes: [
      { kind: "out", title: { en: "Client", bn: "গ্রাহক" }, body: { en: "Only “Higher X% / Lower Y%” per window, in plain words.", bn: "প্রতিটি সময়সীমায় শুধু “বাড়বে X% / কমবে Y%”, সহজ ভাষায়।" } },
      { kind: "out", title: { en: "Super admin", bn: "সুপার অ্যাডমিন" }, body: { en: "Everything: raw model, inputs and their push, checklist, news, practice trades, prediction log, API settings and logs.", bn: "সবকিছু: কাঁচা মডেল, ইনপুট ও তাদের ঠেলা, চেকলিস্ট, খবর, অনুশীলন ট্রেড, প্রেডিকশন লগ, API সেটিং ও লগ।" } },
      { kind: "check", title: { en: "Scoring itself", bn: "নিজেকে নম্বর দেওয়া" }, body: { en: "After each window ends, the reading is marked right or wrong in the Prediction Log.", bn: "প্রতিটি সময়সীমা শেষ হলে পর্যবেক্ষণটি প্রেডিকশন লগে সঠিক বা ভুল হিসেবে চিহ্নিত হয়।" } },
    ],
  },
];

export const SECTIONS: { h: T; p: T }[] = [
  {
    h: { en: "Why so careful?", bn: "এত সাবধানতা কেন?" },
    p: {
      en: "Gold’s short-term moves are close to random. With hundreds of models and inputs, one will always look good on the past by luck. Choosing on one part of history and judging once on a locked later part is the standard defence against fooling ourselves.",
      bn: "সোনার স্বল্পমেয়াদি নড়াচড়া প্রায় এলোমেলো। শত শত মডেল ও ইনপুট থাকলে ভাগ্যক্রমে কোনো একটি অতীতে ভালো দেখাবেই। ইতিহাসের এক অংশে বাছাই করে পরের লক করা অংশে একবার বিচার করা নিজেকে ভুল বোঝানো থেকে বাঁচার প্রচলিত উপায়।",
    },
  },
  {
    h: { en: "What the evidence says", bn: "প্রমাণ কী বলে" },
    p: {
      en: "So far no window passes all five locked checks, so the trading signal stays on Wait. The single factors hit 46–55% of the time. When many factors agree strongly, past hit rates reach 60–74%, but on few days, so they are shown with their sample size and never inflated.",
      bn: "এখন পর্যন্ত কোনো সময়সীমা লক করা পাঁচটি পরীক্ষার সবগুলোতে পাস করেনি, তাই ট্রেডিং সংকেত “অপেক্ষা”-তেই থাকে। একক ফ্যাক্টরগুলো ৪৬–৫৫% সময় মেলে। অনেক ফ্যাক্টর জোরালোভাবে একমত হলে অতীতের মিলের হার ৬০–৭৪% হয়, তবে অল্প দিনে; তাই সেগুলো নমুনার আকারসহ দেখানো হয় এবং কখনো বাড়িয়ে বলা হয় না।",
    },
  },
  {
    h: { en: "Limits", bn: "সীমাবদ্ধতা" },
    p: {
      en: "Free data arrives late or with gaps; yfinance keeps only ~60 days of intraday bars; news history is thin before 2016; the scheduled job can start a few minutes late. None of this is hidden: the Prediction Log scores every reading in the open.",
      bn: "বিনামূল্যের তথ্য দেরিতে বা ফাঁকসহ আসে; yfinance মাত্র ~৬০ দিনের ইন্ট্রাডে বার রাখে; ২০১৬-এর আগে খবরের ইতিহাস কম; নির্ধারিত কাজ কয়েক মিনিট দেরিতে শুরু হতে পারে। কিছুই লুকানো নয়: প্রেডিকশন লগ প্রকাশ্যে প্রতিটি পর্যবেক্ষণের নম্বর দেয়।",
    },
  },
];
