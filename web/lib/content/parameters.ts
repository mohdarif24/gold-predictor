/**
 * Every factor known to move the gold price, and where each stands for this system. English and Bengali.
 * have = already in the system · free = free and could be added · paid = exists but costs money or is hard to get ·
 * never = cannot be known in advance.
 */
export type Status = "have" | "free" | "paid" | "never";
export type T = { en: string; bn: string };
export type Group = { title: T; items: { status: Status; text: T }[] };

const t = (en: string, bn: string): T => ({ en, bn });

export const LEGEND: Record<Status, { icon: string; label: T }> = {
  have: { icon: "✅", label: t("Already in the system", "সিস্টেমে আগে থেকেই আছে") },
  free: { icon: "🟡", label: t("Free; could be added", "বিনামূল্যে পাওয়া যায়, যোগ করা সম্ভব") },
  paid: { icon: "🟠", label: t("Exists, but costs money or is hard to get", "পাওয়া যায়, কিন্তু টাকা লাগে বা জোগাড় করা কঠিন") },
  never: { icon: "🔴", label: t("Impossible to know in advance", "আগে থেকে জানা অসম্ভব") },
};

export const PARAMETERS: Group[] = [
  {
    title: t("1. The price’s own behaviour", "১. দামের নিজস্ব আচরণ"),
    items: [
      { status: "have", text: t("Recent returns, momentum, volatility (ATR), RSI, MACD, moving-average gaps", "সাম্প্রতিক রিটার্ন, গতি, ওঠানামা (ATR), RSI, MACD, moving average-এর ফাঁক") },
      { status: "have", text: t("Bollinger, stochastic, ADX, CCI, candle shapes, distance from the 1-year high and low", "Bollinger, stochastic, ADX, CCI, candle-এর আকার, বছরের সর্বোচ্চ ও সর্বনিম্ন থেকে দূরত্ব") },
      { status: "have", text: t("Higher-timeframe trend (H1, H4, D1) and market regime", "বড় টাইমফ্রেমের প্রবণতা (H1, H4, D1) আর বাজারের অবস্থা (regime)") },
      { status: "free", text: t("Behaviour by Asia, London and New York session; day of the week", "Asia, London, NY সেশন অনুযায়ী আচরণ, সপ্তাহের কোন দিন") },
      { status: "paid", text: t("Tick data, order-book depth (Level 2), the flow of every trade", "Tick ডেটা, order book-এর গভীরতা (Level 2), প্রতিটি লেনদেনের প্রবাহ") },
    ],
  },
  {
    title: t("2. Dollar and currencies", "২. ডলার ও মুদ্রা"),
    items: [
      { status: "have", text: t("DXY, broad dollar (FRED), USD/INR, EUR/USD, USD/JPY, USD/CNY", "DXY, broad dollar (FRED), USD/INR, EUR/USD, USD/JPY, USD/CNY") },
      { status: "free", text: t("USD/BDT and the local-market premium (gold in Bangladesh and India versus the world price)", "USD/BDT আর স্থানীয় বাজারের প্রিমিয়াম (বাংলাদেশ ও ভারতে সোনার দাম বনাম বিশ্ববাজার)") },
    ],
  },
  {
    title: t("3. Interest rates and inflation", "৩. সুদের হার ও মূল্যস্ফীতি"),
    items: [
      { status: "have", text: t("10-year real yield, the single most important driver", "১০ বছরের প্রকৃত সুদ (real yield), যা সবচেয়ে গুরুত্বপূর্ণ") },
      { status: "have", text: t("Breakeven and 5y5y inflation expectations, Fed funds rate, 2s10s curve", "Breakeven, 5y5y মূল্যস্ফীতির প্রত্যাশা, Fed funds rate, 2s10s curve") },
      { status: "have", text: t("3-month, 5-, 10- and 30-year yields, TIP, TLT", "৩ মাস, ৫, ১০ ও ৩০ বছরের বন্ড সুদ, TIP, TLT") },
      { status: "free", text: t("Market-implied chance of the next rate cut or hike from Fed funds futures (CME FedWatch style)", "Fed funds futures থেকে পরের সুদ কমা বা বাড়ার বাজারি সম্ভাবনা (CME FedWatch ধরনের)") },
      { status: "free", text: t("CPI, NFP, PCE actual versus forecast (economic surprise)", "CPI, NFP, PCE-এর আসল ফল বনাম পূর্বাভাস (economic surprise)") },
    ],
  },
  {
    title: t("4. Other markets", "৪. অন্যান্য বাজার"),
    items: [
      { status: "have", text: t("Silver, copper, gold miners (GDX), S&P 500, VIX, oil", "রুপা, তামা, খনি-কোম্পানির শেয়ার (GDX), S&P 500, VIX, তেল") },
      { status: "free", text: t("Gold’s own volatility index GVZ (free on yfinance)", "সোনার নিজস্ব অস্থিরতা সূচক GVZ (yfinance-এ ফ্রি পাওয়া যায়)") },
      { status: "free", text: t("Gold/silver ratio, Bitcoin", "সোনা/রুপার অনুপাত, Bitcoin") },
      { status: "free", text: t("Futures term structure (contango or backwardation)", "ফিউচার্সের মেয়াদ-কাঠামো (contango বা backwardation)") },
    ],
  },
  {
    title: t("5. Big players’ positions and flows", "৫. বড় খেলোয়াড়দের অবস্থান ও প্রবাহ"),
    items: [
      { status: "have", text: t("CFTC COT report (hedge funds’ and producers’ net positions, weekly)", "CFTC COT প্রতিবেদন (হেজ ফান্ড ও উৎপাদকদের নিট অবস্থান, সাপ্তাহিক)") },
      { status: "free", text: t("Gold held by GLD and IAU ETFs (daily), COMEX warehouse stocks", "GLD ও IAU ETF-এ সোনার মজুদ (দৈনিক), COMEX গুদামের মজুদ") },
      { status: "free", text: t("Central-bank gold buying (World Gold Council, monthly, arrives late)", "কেন্দ্রীয় ব্যাংকের সোনা কেনা (World Gold Council, মাসিক, দেরিতে আসে)") },
      { status: "paid", text: t("Options flow, dealer gamma, banks’ positions", "অপশনের প্রবাহ, dealer gamma, ব্যাংকগুলোর অবস্থান") },
      { status: "never", text: t("Central banks’ undisclosed purchases, large institutions’ private orders", "কেন্দ্রীয় ব্যাংকের গোপন কেনাকাটা, বড় প্রতিষ্ঠানের ব্যক্তিগত অর্ডার") },
    ],
  },
  {
    title: t("6. Demand and supply", "৬. চাহিদা ও সরবরাহ"),
    items: [
      { status: "free", text: t("India’s seasonal demand: wedding season, Diwali, Akshaya Tritiya, import-duty changes", "ভারতের মৌসুমি চাহিদা: বিয়ের মৌসুম, দিওয়ালি, অক্ষয় তৃতীয়া, আমদানি শুল্কের পরিবর্তন") },
      { status: "free", text: t("China premium (Shanghai Gold Exchange versus London)", "চীনের প্রিমিয়াম (Shanghai Gold Exchange বনাম লন্ডনের দাম)") },
      { status: "free", text: t("Mine production (quarterly, very slow)", "খনি থেকে উৎপাদন (ত্রৈমাসিক তথ্য, খুব ধীরে আসে)") },
      { status: "paid", text: t("Real-time imports into India and China, LBMA OTC trading", "ভারত ও চীনের রিয়েল-টাইম আমদানি, LBMA-র OTC লেনদেন") },
    ],
  },
  {
    title: t("7. News, risk and mood", "৭. খবর, ঝুঁকি ও মনোভাব"),
    items: [
      { status: "have", text: t("Google News headline sentiment (keyword rules or an AI model)", "Google News শিরোনামের sentiment (কীওয়ার্ড নিয়মে, বা AI মডেলে)") },
      { status: "have", text: t("Economic calendar (CPI, NFP, Fed meeting days)", "অর্থনৈতিক ক্যালেন্ডার (CPI, NFP, Fed বৈঠকের দিন)") },
      { status: "free", text: t("Geopolitical Risk index (GPR), Economic Policy Uncertainty index (EPU), both free", "ভূরাজনৈতিক ঝুঁকি সূচক (GPR), অর্থনৈতিক নীতির অনিশ্চয়তা সূচক (EPU), দুটোই ফ্রি") },
      { status: "free", text: t("Google Trends searches for “buy gold”, Reddit or X discussion", "Google Trends-এ \"buy gold\" খোঁজ, Reddit বা X-এর আলোচনা") },
      { status: "paid", text: t("Bloomberg or Reuters real-time news, bank research reports", "Bloomberg বা Reuters-এর রিয়েল-টাইম খবর, ব্যাংকের গবেষণা প্রতিবেদন") },
      { status: "never", text: t("The next war, sudden political decisions, unexpected Fed announcements", "আগামী যুদ্ধ, হঠাৎ রাজনৈতিক সিদ্ধান্ত, অপ্রত্যাশিত Fed ঘোষণা") },
    ],
  },
  {
    title: t("8. Calendar", "৮. ক্যালেন্ডার"),
    items: [
      { status: "have", text: t("NFP day, options expiry, month and quarter end, holidays, season", "NFP-র দিন, অপশন মেয়াদ শেষের দিন, মাস ও ত্রৈমাসিকের শেষ, ছুটি, ঋতু") },
    ],
  },
  {
    title: t("9. What is never possible", "৯. যা কখনোই সম্ভব নয়"),
    items: [
      { status: "never", text: t("Knowing future news or events in advance", "ভবিষ্যতের খবর বা ঘটনা আগে থেকে জানা") },
      { status: "never", text: t("Knowing what someone will secretly buy or sell", "কেউ গোপনে কী কিনবে বা বেচবে, তা জানা") },
      { status: "never", text: t("Big unexpected events (black swans)", "বড় অপ্রত্যাশিত ঘটনা (black swan)") },
      { status: "never", text: t("100% or 80%+ certain predictions, however many parameters are added", "১০০% বা ৮০%+ নিশ্চিত অনুমান, যত প্যারামিটারই যোগ করা হোক") },
    ],
  },
];

export const HONEST: T[] = [
  t("More parameters do not mean better predictions. The more parameters, the higher the chance that something matched the past by luck (overfitting), so every new parameter must pass the locked 20% test.",
    "বেশি প্যারামিটার মানেই ভালো অনুমান নয়। প্যারামিটার যত বাড়ে, অতীতে ভাগ্যক্রমে মিলে যাওয়ার ঝুঁকিও তত বাড়ে (overfitting)। তাই প্রতিটি নতুন প্যারামিটারকে লক করা ২০% যাচাই পার হতে হবে।"),
  t("So far, even with about 150 features, no time window has passed that test. Single factors are right 46–55% of the time.",
    "এখন পর্যন্ত প্রায় ১৫০টি বৈশিষ্ট্য দিয়েও কোনো সময়সীমা সেই যাচাই পার হয়নি। একক ফ্যাক্টরগুলো ৪৬–৫৫% সময় মেলে।"),
  t("Most promising free additions: GVZ, ETF holdings, economic surprise, the GPR and EPU indices, India’s seasonal demand.",
    "যোগ করার মতো সবচেয়ে সম্ভাবনাময়: GVZ, ETF-এর মজুদ, economic surprise, GPR ও EPU সূচক, ভারতের মৌসুমি চাহিদা।"),
];
