/**
 * Every factor known to move the gold price, and where each stands for this system. English and Bengali.
 * have = already in the system · free = free and could be added · paid = exists but costs money or is hard to get ·
 * never = cannot be known in advance.
 */
export type Status = "have" | "free" | "paid" | "never";
export type T = { en: string; bn: string };
export type Group = { title: T; items: { status: Status; text: T; note?: T }[] };

const t = (en: string, bn: string): T => ({ en, bn });
const ADDED = t("Added on 7 October 2026; the next model study decides whether it helps.", "৭ অক্টোবর ২০২৬-এ যোগ হয়েছে; পরের মডেল-যাচাই ঠিক করবে এটা কাজে লাগে কিনা।");

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
      { status: "have", note: ADDED, text: t("Behaviour by Asia, London and New York session; day of the week", "Asia, London, NY সেশন অনুযায়ী আচরণ, সপ্তাহের কোন দিন") },
      { status: "paid", text: t("Tick data, order-book depth (Level 2), the flow of every trade", "Tick ডেটা, order book-এর গভীরতা (Level 2), প্রতিটি লেনদেনের প্রবাহ") },
    ],
  },
  {
    title: t("2. Dollar and currencies", "২. ডলার ও মুদ্রা"),
    items: [
      { status: "have", text: t("DXY, broad dollar (FRED), USD/INR, EUR/USD, USD/JPY, USD/CNY", "DXY, broad dollar (FRED), USD/INR, EUR/USD, USD/JPY, USD/CNY") },
      { status: "have", note: t("Added: USD/BDT and the Indian premium (rupee gold ETF vs the world price in rupees). Bangladesh’s local gold price has no free data feed.", "যোগ হয়েছে: USD/BDT আর ভারতের প্রিমিয়াম (রুপির সোনার ETF বনাম রুপিতে বিশ্ব-দাম)। বাংলাদেশের স্থানীয় সোনার দামের কোনো ফ্রি ডেটা-ফিড নেই।"), text: t("USD/BDT and the local-market premium (gold in Bangladesh and India versus the world price)", "USD/BDT আর স্থানীয় বাজারের প্রিমিয়াম (বাংলাদেশ ও ভারতে সোনার দাম বনাম বিশ্ববাজার)") },
    ],
  },
  {
    title: t("3. Interest rates and inflation", "৩. সুদের হার ও মূল্যস্ফীতি"),
    items: [
      { status: "have", text: t("10-year real yield, the single most important driver", "১০ বছরের প্রকৃত সুদ (real yield), যা সবচেয়ে গুরুত্বপূর্ণ") },
      { status: "have", text: t("Breakeven and 5y5y inflation expectations, Fed funds rate, 2s10s curve", "Breakeven, 5y5y মূল্যস্ফীতির প্রত্যাশা, Fed funds rate, 2s10s curve") },
      { status: "have", text: t("3-month, 5-, 10- and 30-year yields, TIP, TLT", "৩ মাস, ৫, ১০ ও ৩০ বছরের বন্ড সুদ, TIP, TLT") },
      { status: "have", note: t("Added from 30-day Fed funds futures (ZQ=F): a free stand-in for CME FedWatch.", "৩০ দিনের Fed funds futures (ZQ=F) থেকে যোগ হয়েছে: CME FedWatch-এর ফ্রি বিকল্প।"), text: t("Market-implied chance of the next rate cut or hike from Fed funds futures (CME FedWatch style)", "Fed funds futures থেকে পরের সুদ কমা বা বাড়ার বাজারি সম্ভাবনা (CME FedWatch ধরনের)") },
      { status: "have", note: t("Added. Consensus forecasts are not free, so each release is compared with its own last 12 releases instead.", "যোগ হয়েছে। বাজারের পূর্বাভাস ফ্রি নয়, তাই প্রতিটি প্রকাশকে তার আগের ১২টি প্রকাশের সাথে তুলনা করা হয়।"), text: t("CPI, NFP, PCE actual versus forecast (economic surprise)", "CPI, NFP, PCE-এর আসল ফল বনাম পূর্বাভাস (economic surprise)") },
    ],
  },
  {
    title: t("4. Other markets", "৪. অন্যান্য বাজার"),
    items: [
      { status: "have", text: t("Silver, copper, gold miners (GDX), S&P 500, VIX, oil", "রুপা, তামা, খনি-কোম্পানির শেয়ার (GDX), S&P 500, VIX, তেল") },
      { status: "have", note: ADDED, text: t("Gold’s own volatility index GVZ (free on yfinance)", "সোনার নিজস্ব অস্থিরতা সূচক GVZ (yfinance-এ ফ্রি পাওয়া যায়)") },
      { status: "have", note: t("The gold/silver ratio was already in; Bitcoin added.", "সোনা/রুপার অনুপাত আগে থেকেই ছিল; Bitcoin যোগ হয়েছে।"), text: t("Gold/silver ratio, Bitcoin", "সোনা/রুপার অনুপাত, Bitcoin") },
      { status: "free", note: t("Not added: no free history of individual futures contracts to test on.", "যোগ হয়নি: আলাদা আলাদা ফিউচার্স চুক্তির ফ্রি ইতিহাস নেই, তাই যাচাই করা যায় না।"), text: t("Futures term structure (contango or backwardation)", "ফিউচার্সের মেয়াদ-কাঠামো (contango বা backwardation)") },
    ],
  },
  {
    title: t("5. Big players’ positions and flows", "৫. বড় খেলোয়াড়দের অবস্থান ও প্রবাহ"),
    items: [
      { status: "have", text: t("CFTC COT report (hedge funds’ and producers’ net positions, weekly)", "CFTC COT প্রতিবেদন (হেজ ফান্ড ও উৎপাদকদের নিট অবস্থান, সাপ্তাহিক)") },
      { status: "free", note: t("Not added: the GLD archive downloads as a PDF, and COMEX publishes only today’s stocks; no free history to test on.", "যোগ হয়নি: GLD-এর আর্কাইভ PDF হিসেবে আসে, আর COMEX শুধু আজকের মজুদ দেয়; যাচাইয়ের মতো ফ্রি ইতিহাস নেই।"), text: t("Gold held by GLD and IAU ETFs (daily), COMEX warehouse stocks", "GLD ও IAU ETF-এ সোনার মজুদ (দৈনিক), COMEX গুদামের মজুদ") },
      { status: "free", note: t("Not added: a manual download, monthly and one to two months late; too slow for a 30-minute to 1-week forecast.", "যোগ হয়নি: হাতে নামাতে হয়, মাসিক ও ১-২ মাস দেরিতে আসে; ৩০ মিনিট থেকে ১ সপ্তাহের অনুমানের জন্য খুব ধীর।"), text: t("Central-bank gold buying (World Gold Council, monthly, arrives late)", "কেন্দ্রীয় ব্যাংকের সোনা কেনা (World Gold Council, মাসিক, দেরিতে আসে)") },
      { status: "paid", text: t("Options flow, dealer gamma, banks’ positions", "অপশনের প্রবাহ, dealer gamma, ব্যাংকগুলোর অবস্থান") },
      { status: "never", text: t("Central banks’ undisclosed purchases, large institutions’ private orders", "কেন্দ্রীয় ব্যাংকের গোপন কেনাকাটা, বড় প্রতিষ্ঠানের ব্যক্তিগত অর্ডার") },
    ],
  },
  {
    title: t("6. Demand and supply", "৬. চাহিদা ও সরবরাহ"),
    items: [
      { status: "have", note: t("Added: Dhanteras/Diwali and Akshaya Tritiya countdowns, wedding season, India budget day (when import duty changes are announced).", "যোগ হয়েছে: ধনতেরাস/দিওয়ালি ও অক্ষয় তৃতীয়ার দিন-গণনা, বিয়ের মৌসুম, ভারতের বাজেটের দিন (যেদিন আমদানি শুল্কের পরিবর্তন ঘোষণা হয়)।"), text: t("India’s seasonal demand: wedding season, Diwali, Akshaya Tritiya, import-duty changes", "ভারতের মৌসুমি চাহিদা: বিয়ের মৌসুম, দিওয়ালি, অক্ষয় তৃতীয়া, আমদানি শুল্কের পরিবর্তন") },
      { status: "free", note: t("Not added: no free machine-readable Shanghai Gold Exchange history.", "যোগ হয়নি: Shanghai Gold Exchange-এর মেশিনে পড়ার মতো ফ্রি ইতিহাস নেই।"), text: t("China premium (Shanghai Gold Exchange versus London)", "চীনের প্রিমিয়াম (Shanghai Gold Exchange বনাম লন্ডনের দাম)") },
      { status: "free", note: t("Not added: quarterly, far too slow for these time windows.", "যোগ হয়নি: ত্রৈমাসিক, এই সময়সীমার জন্য অনেক ধীর।"), text: t("Mine production (quarterly, very slow)", "খনি থেকে উৎপাদন (ত্রৈমাসিক তথ্য, খুব ধীরে আসে)") },
      { status: "paid", text: t("Real-time imports into India and China, LBMA OTC trading", "ভারত ও চীনের রিয়েল-টাইম আমদানি, LBMA-র OTC লেনদেন") },
    ],
  },
  {
    title: t("7. News, risk and mood", "৭. খবর, ঝুঁকি ও মনোভাব"),
    items: [
      { status: "have", text: t("Google News headline sentiment (keyword rules or an AI model)", "Google News শিরোনামের sentiment (কীওয়ার্ড নিয়মে, বা AI মডেলে)") },
      { status: "have", text: t("Economic calendar (CPI, NFP, Fed meeting days)", "অর্থনৈতিক ক্যালেন্ডার (CPI, NFP, Fed বৈঠকের দিন)") },
      { status: "have", note: ADDED, text: t("Geopolitical Risk index (GPR), Economic Policy Uncertainty index (EPU), both free", "ভূরাজনৈতিক ঝুঁকি সূচক (GPR), অর্থনৈতিক নীতির অনিশ্চয়তা সূচক (EPU), দুটোই ফ্রি") },
      { status: "free", note: t("Not added: Google Trends has no official API and blocks cloud servers; Reddit and X need approved or paid API access.", "যোগ হয়নি: Google Trends-এর অফিসিয়াল API নেই এবং ক্লাউড সার্ভার আটকে দেয়; Reddit ও X-এর জন্য অনুমোদিত বা পেইড API লাগে।"), text: t("Google Trends searches for “buy gold”, Reddit or X discussion", "Google Trends-এ \"buy gold\" খোঁজ, Reddit বা X-এর আলোচনা") },
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
  t("Before the 7 October additions, with about 150 inputs, no time window had passed that test. Single factors are right 46–55% of the time.",
    "৭ অক্টোবরের সংযোজনের আগে প্রায় ১৫০টি ইনপুট দিয়েও কোনো সময়সীমা সেই যাচাই পার হয়নি। একক ফ্যাক্টরগুলো ৪৬–৫৫% সময় মেলে।"),
  t("On 7 October 2026 every free item that has a usable history was added (11 new market series and indices, plus session, India-calendar and surprise inputs: about 200 inputs in all). Each is judged only by the locked 20% test; an input that does not help is simply not chosen.",
    "৭ অক্টোবর ২০২৬-এ যেসব ফ্রি জিনিসের ব্যবহারযোগ্য ইতিহাস আছে সবই যোগ হয়েছে (১১টি নতুন বাজার-সিরিজ ও সূচক, সাথে সেশন, ভারতের ক্যালেন্ডার ও চমকের ইনপুট: মোট প্রায় ২০০টি ইনপুট)। প্রতিটির বিচার হয় শুধু লক করা ২০% যাচাইয়ে; যেটা কাজে লাগে না, সেটা বাছাই হয় না।"),
];
