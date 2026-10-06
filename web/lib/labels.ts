import type { Lang } from "./i18n";

type Text = { en: string; bn: string };

/** Families of inputs, in the order the screen shows them. */
export const GROUPS: Record<string, Text & { hint: Text }> = {
  technical: {
    en: "Price behaviour", bn: "দামের আচরণ",
    hint: { en: "Recent moves, momentum, volatility and trend of gold itself.", bn: "সোনার নিজের সাম্প্রতিক নড়াচড়া, গতি, ওঠানামা ও প্রবণতা।" },
  },
  technical_extra: {
    en: "Chart indicators", bn: "চার্টের সূচক",
    hint: { en: "Classic chart tools: Bollinger bands, stochastic, ADX, candle shapes, distance from the 1-year high or low.", bn: "চেনা চার্ট-সরঞ্জাম: Bollinger band, stochastic, ADX, candle-এর আকার, বছরের সর্বোচ্চ-সর্বনিম্ন থেকে দূরত্ব।" },
  },
  macro: {
    en: "Dollar, rates & markets", bn: "ডলার, সুদ ও বাজার",
    hint: { en: "The dollar, bond yields, silver, copper, miners, stocks and the fear index.", bn: "ডলার, বন্ডের সুদ, রুপা, তামা, খনি-শেয়ার, শেয়ারবাজার ও ভয়ের সূচক।" },
  },
  positioning: {
    en: "Big investors' positions", bn: "বড় বিনিয়োগকারীদের অবস্থান",
    hint: { en: "Weekly US report on how much hedge funds and producers are betting on gold.", bn: "হেজ ফান্ড ও উৎপাদকেরা সোনায় কতটা বাজি ধরেছে, তার সাপ্তাহিক মার্কিন প্রতিবেদন।" },
  },
  calendar: {
    en: "Calendar & events", bn: "ক্যালেন্ডার ও ঘটনা",
    hint: { en: "Jobs-report day, options expiry, month and quarter end, holidays, season of the year.", bn: "চাকরির প্রতিবেদনের দিন, অপশন শেষের দিন, মাস ও ত্রৈমাসিকের শেষ, ছুটি, বছরের ঋতু।" },
  },
  news: {
    en: "News mood", bn: "খবরের হাওয়া",
    hint: { en: "Tone of recent gold and economy headlines.", bn: "সোনা ও অর্থনীতির সাম্প্রতিক শিরোনামের সুর।" },
  },
};

export const GROUP_ORDER = ["technical", "technical_extra", "macro", "positioning", "calendar", "news"];

/** Everything gold's price is known to lean on, with the reason in plain words. */
export const DRIVERS: Record<string, { group: string; label: Text; why: Text; level?: boolean }> = {
  dxy: { group: "dollar", label: { en: "US dollar index", bn: "মার্কিন ডলার সূচক" },
    why: { en: "Gold is priced in dollars. When the dollar gets stronger, gold usually gets more expensive for everyone else and tends to fall.", bn: "সোনার দাম ডলারে। ডলার শক্তিশালী হলে অন্যদের কাছে সোনা দামি হয় আর সাধারণত দাম কমে।" } },
  usdinr: { group: "dollar", label: { en: "Dollar / rupee", bn: "ডলার / টাকা (রুপি)" },
    why: { en: "A weaker rupee lifts gold's price in India even if the world price is flat.", bn: "রুপি দুর্বল হলে বিশ্ব-দাম একই থাকলেও ভারতে সোনার দাম বাড়ে।" } },
  eurusd: { group: "dollar", label: { en: "Euro / dollar", bn: "ইউরো / ডলার" },
    why: { en: "The euro is the dollar's biggest rival. A rising euro usually means a weaker dollar, which helps gold.", bn: "ইউরো ডলারের প্রধান প্রতিদ্বন্দ্বী। ইউরো বাড়া মানে সাধারণত ডলার দুর্বল, যা সোনার জন্য ভালো।" } },
  usdjpy: { group: "dollar", label: { en: "Dollar / yen", bn: "ডলার / ইয়েন" },
    why: { en: "The yen is a safe-haven currency like gold, so the two often react to the same fears.", bn: "ইয়েন সোনার মতোই নিরাপদ আশ্রয়ের মুদ্রা, তাই দুটোই প্রায়ই একই ভয়ে সাড়া দেয়।" } },
  usdcny: { group: "dollar", label: { en: "Dollar / yuan", bn: "ডলার / ইউয়ান" },
    why: { en: "China is the world's biggest gold buyer. A weak yuan makes gold costlier for Chinese buyers and can cool demand.", bn: "চীন বিশ্বের সবচেয়ে বড় সোনা-ক্রেতা। ইউয়ান দুর্বল হলে সোনা তাদের কাছে দামি হয়ে চাহিদা কমতে পারে।" } },
  real_yield: { group: "rates", level: true, label: { en: "US 10-year real yield", bn: "মার্কিন ১০ বছরের প্রকৃত সুদ" },
    why: { en: "The interest rate after inflation. It is the single most-watched driver of gold: when real yields fall, gold usually rises, and when they rise gold usually falls.", bn: "মূল্যস্ফীতি বাদ দেওয়া সুদের হার। সোনার সবচেয়ে বেশি-নজর-রাখা চালক: প্রকৃত সুদ কমলে সোনা সাধারণত বাড়ে, বাড়লে কমে।" } },
  breakeven: { group: "rates", level: true, label: { en: "10-year inflation expectation", bn: "১০ বছরের মূল্যস্ফীতির প্রত্যাশা" },
    why: { en: "What bond markets expect inflation to average over ten years. Higher expectations tend to support gold as a store of value.", bn: "বন্ডবাজার আগামী দশ বছরে গড় মূল্যস্ফীতি কত আশা করছে। প্রত্যাশা বাড়লে মূল্য-সংরক্ষক হিসেবে সোনা সমর্থন পায়।" } },
  fwd_infl_5y5y: { group: "rates", level: true, label: { en: "Inflation expected 5 to 10 years out", bn: "৫ থেকে ১০ বছর পরের মূল্যস্ফীতির প্রত্যাশা" },
    why: { en: "A long-run inflation gauge the Fed watches closely. It moves slowly and shows whether the market trusts the Fed to keep prices stable.", bn: "ফেডের নজরে থাকা দীর্ঘমেয়াদি মূল্যস্ফীতির মাপ। ধীরে নড়ে, আর দেখায় ফেড দাম স্থির রাখবে বলে বাজার ভরসা করে কিনা।" } },
  fed_funds: { group: "rates", level: true, label: { en: "Fed policy rate", bn: "ফেডের নীতি-সুদ" },
    why: { en: "The rate the US central bank sets. Cuts usually help gold and hikes usually hurt it.", bn: "মার্কিন কেন্দ্রীয় ব্যাংকের ঠিক করা সুদ। কমালে সাধারণত সোনার লাভ, বাড়ালে ক্ষতি।" } },
  curve_2s10s: { group: "rates", level: true, label: { en: "Yield curve (10-year minus 2-year)", bn: "সুদের বক্ররেখা (১০ বছর বাদ ২ বছর)" },
    why: { en: "When it turns negative the bond market is warning of a slowdown, which can draw money towards gold.", bn: "ঋণাত্মক হলে বন্ডবাজার মন্দার সতর্কতা দিচ্ছে, যা সোনার দিকে টাকা টানতে পারে।" } },
  usd_broad: { group: "dollar", label: { en: "Dollar against many currencies", bn: "অনেক মুদ্রার বিপরীতে ডলার" },
    why: { en: "A wider, trade-weighted view of the dollar than the dollar index. A stronger broad dollar usually weighs on gold.", bn: "ডলার সূচকের চেয়ে বিস্তৃত, বাণিজ্য-ওজনযুক্ত ডলারের চিত্র। শক্ত ডলার সাধারণত সোনার উপর চাপ ফেলে।" } },
  us3m: { group: "rates", level: true, label: { en: "US 3-month yield", bn: "মার্কিন ৩ মাসের সুদ" },
    why: { en: "Short-term rates follow the Fed's policy. Higher rates make gold, which pays nothing, less attractive.", bn: "স্বল্পমেয়াদি সুদ ফেডের নীতি অনুসরণ করে। সুদ বাড়লে কিছু না-দেওয়া সোনা কম আকর্ষণীয় হয়।" } },
  us5y: { group: "rates", level: true, label: { en: "US 5-year yield", bn: "মার্কিন ৫ বছরের সুদ" },
    why: { en: "Medium-term yields show what investors expect from the Fed and inflation.", bn: "মাঝারি মেয়াদের সুদে ফেড ও মূল্যস্ফীতি নিয়ে বিনিয়োগকারীদের প্রত্যাশা ফুটে ওঠে।" } },
  us10y: { group: "rates", level: true, label: { en: "US 10-year yield", bn: "মার্কিন ১০ বছরের সুদ" },
    why: { en: "The key interest rate for gold. When it rises, holding gold costs more in missed interest, so gold tends to fall.", bn: "সোনার জন্য সবচেয়ে গুরুত্বপূর্ণ সুদ। বাড়লে সোনা ধরে রাখার সুযোগ-খরচ বাড়ে, তাই সোনা কমার প্রবণতা থাকে।" } },
  us30y: { group: "rates", level: true, label: { en: "US 30-year yield", bn: "মার্কিন ৩০ বছরের সুদ" },
    why: { en: "Long yields reflect long-run inflation worries and government debt.", bn: "দীর্ঘমেয়াদি সুদে দীর্ঘ-মেয়াদের মূল্যস্ফীতির দুশ্চিন্তা ও সরকারি ঋণ প্রতিফলিত হয়।" } },
  tips: { group: "rates", label: { en: "Inflation-protected bonds (TIP)", bn: "মূল্যস্ফীতি-সুরক্ষিত বন্ড (TIP)" },
    why: { en: "Their price rises when 'real' yields (yield minus inflation) fall. Falling real yields are usually good for gold.", bn: "'প্রকৃত' সুদ (সুদ বাদ মূল্যস্ফীতি) কমলে এদের দাম বাড়ে। প্রকৃত সুদ কমা সাধারণত সোনার জন্য ভালো।" } },
  tlt: { group: "rates", label: { en: "Long US government bonds (TLT)", bn: "দীর্ঘমেয়াদি মার্কিন সরকারি বন্ড (TLT)" },
    why: { en: "Bond prices rise when yields fall. Bond rallies often come with gold rallies.", bn: "সুদ কমলে বন্ডের দাম বাড়ে। বন্ডের দাম বাড়ার সময় প্রায়ই সোনাও বাড়ে।" } },
  global_gold: { group: "metals", label: { en: "Gold futures (world price)", bn: "সোনার ফিউচার্স (বিশ্ব-দাম)" },
    why: { en: "The world gold price itself, set mostly on the US futures market.", bn: "বিশ্বের সোনার দাম, যা মূলত মার্কিন ফিউচার্স বাজারে ঠিক হয়।" } },
  silver: { group: "metals", label: { en: "Silver", bn: "রুপা" },
    why: { en: "Silver usually follows gold with bigger swings. A fast-rising silver often shows investors are piling into metals.", bn: "রুপা সাধারণত সোনাকে অনুসরণ করে, ওঠানামা আরও বেশি। রুপা দ্রুত বাড়লে বোঝা যায় বিনিয়োগকারীরা ধাতুতে ঝুঁকছে।" } },
  copper: { group: "metals", label: { en: "Copper", bn: "তামা" },
    why: { en: "Copper is a gauge of world factory demand. Strong copper means a healthy economy, which can reduce the need for safe havens.", bn: "তামা বিশ্বের কারখানা-চাহিদার মাপকাঠি। তামা শক্ত মানে অর্থনীতি সুস্থ, ফলে নিরাপদ আশ্রয়ের প্রয়োজন কমতে পারে।" } },
  gdx: { group: "metals", label: { en: "Gold miners (GDX)", bn: "সোনার খনি-কোম্পানি (GDX)" },
    why: { en: "Miners' shares often move a little ahead of gold because investors bet on future gold prices.", bn: "খনি-কোম্পানির শেয়ার প্রায়ই সোনার একটু আগে নড়ে, কারণ বিনিয়োগকারীরা ভবিষ্যৎ দামের উপর বাজি ধরে।" } },
  vix: { group: "risk", label: { en: "VIX (fear index)", bn: "VIX (ভয়ের সূচক)" },
    why: { en: "Spikes in fear often send money towards gold as a refuge.", bn: "ভয় হঠাৎ বাড়লে টাকা প্রায়ই নিরাপদ আশ্রয় হিসেবে সোনার দিকে যায়।" } },
  spx: { group: "risk", label: { en: "US stock market (S&P 500)", bn: "মার্কিন শেয়ারবাজার (S&P 500)" },
    why: { en: "Stocks and gold compete for the same money, but in a crash both can be sold together.", bn: "শেয়ার ও সোনা একই টাকার জন্য প্রতিযোগী, তবে ধসের সময় দুটোই একসাথে বিক্রি হতে পারে।" } },
  oil: { group: "risk", label: { en: "Crude oil", bn: "অপরিশোধিত তেল" },
    why: { en: "Oil feeds inflation expectations, and inflation fears often support gold.", bn: "তেল মূল্যস্ফীতির প্রত্যাশা বাড়ায়, আর মূল্যস্ফীতির ভয় প্রায়ই সোনাকে সমর্থন করে।" } },
};

export const DRIVER_GROUPS: Record<string, Text> = {
  dollar: { en: "Dollar and currencies", bn: "ডলার ও মুদ্রা" },
  rates: { en: "Interest rates and bonds", bn: "সুদ ও বন্ড" },
  metals: { en: "Gold, silver and miners", bn: "সোনা, রুপা ও খনি" },
  risk: { en: "Fear, stocks and oil", bn: "ভয়, শেয়ার ও তেল" },
};

const BASE: Record<string, Text> = {
  ret_1: { en: "Price change, last bar", bn: "দামের পরিবর্তন, শেষ বার" },
  ret_3: { en: "Price change, last 3 bars", bn: "দামের পরিবর্তন, শেষ ৩ বার" },
  ret_6: { en: "Price change, last 6 bars", bn: "দামের পরিবর্তন, শেষ ৬ বার" },
  ret_12: { en: "Price change, last 12 bars", bn: "দামের পরিবর্তন, শেষ ১২ বার" },
  ret_24: { en: "Price change, last 24 bars", bn: "দামের পরিবর্তন, শেষ ২৪ বার" },
  vol_12: { en: "Short-term volatility", bn: "স্বল্পমেয়াদি ওঠানামা" },
  vol_48: { en: "Longer-term volatility", bn: "দীর্ঘমেয়াদি ওঠানামা" },
  vol_ratio: { en: "Volatility rising or falling", bn: "ওঠানামা বাড়ছে না কমছে" },
  atr_pct: { en: "Typical daily range", bn: "সাধারণ দৈনিক পরিসর" },
  rsi: { en: "RSI (overbought / oversold)", bn: "RSI (অতি-কেনা / অতি-বেচা)" },
  macd: { en: "MACD (trend strength)", bn: "MACD (প্রবণতার শক্তি)" },
  macd_hist: { en: "MACD momentum", bn: "MACD গতি" },
  ma_gap_20: { en: "Distance from 20-bar average", bn: "২০-বারের গড় থেকে দূরত্ব" },
  ma_gap_50: { en: "Distance from 50-bar average", bn: "৫০-বারের গড় থেকে দূরত্ব" },
  range_pos: { en: "Position in recent range", bn: "সাম্প্রতিক পরিসরে অবস্থান" },
  hl_range: { en: "Size of the last candle", bn: "শেষ candle-এর আকার" },
  body: { en: "Direction of the last candle", bn: "শেষ candle-এর দিক" },
  volume_z: { en: "Trading volume vs normal", bn: "স্বাভাবিকের তুলনায় লেনদেন" },
  spread_z: { en: "Trading cost vs normal", bn: "স্বাভাবিকের তুলনায় লেনদেন-খরচ" },
  regime_code: { en: "Market mood (trending, quiet...)", bn: "বাজারের মেজাজ (প্রবণতা, শান্ত...)" },
  dow: { en: "Day of the week", bn: "সপ্তাহের দিন" },
  hour_sin: { en: "Time of day", bn: "দিনের সময়" },
  hour_cos: { en: "Time of day", bn: "দিনের সময়" },
  bb_pctb: { en: "Position inside Bollinger bands", bn: "Bollinger band-এর ভেতরে অবস্থান" },
  bb_width: { en: "Bollinger band width", bn: "Bollinger band-এর প্রস্থ" },
  stoch_k: { en: "Stochastic (fast)", bn: "Stochastic (দ্রুত)" },
  stoch_d: { en: "Stochastic (slow)", bn: "Stochastic (ধীর)" },
  di_diff: { en: "Buyers vs sellers strength", bn: "ক্রেতা বনাম বিক্রেতার শক্তি" },
  adx: { en: "ADX (how strong the trend is)", bn: "ADX (প্রবণতা কতটা জোরালো)" },
  cci20: { en: "CCI", bn: "CCI" },
  skew20: { en: "Lopsidedness of recent moves", bn: "সাম্প্রতিক নড়াচড়ার একপেশেভাব" },
  kurt20: { en: "Extreme-move tendency", bn: "চরম নড়াচড়ার প্রবণতা" },
  gap: { en: "Opening gap", bn: "খোলার ব্যবধান" },
  dist_hi: { en: "Distance below the high", bn: "সর্বোচ্চ থেকে নিচে দূরত্ব" },
  dist_lo: { en: "Distance above the low", bn: "সর্বনিম্ন থেকে উপরে দূরত্ব" },
  obv_slope20: { en: "Volume-backed trend", bn: "লেনদেন-সমর্থিত প্রবণতা" },
  pat_doji: { en: "Candle pattern: doji", bn: "candle প্যাটার্ন: doji" },
  pat_hammer: { en: "Candle pattern: hammer", bn: "candle প্যাটার্ন: hammer" },
  pat_shooting: { en: "Candle pattern: shooting star", bn: "candle প্যাটার্ন: shooting star" },
  pat_bull_engulf: { en: "Candle pattern: bullish engulfing", bn: "candle প্যাটার্ন: bullish engulfing" },
  pat_bear_engulf: { en: "Candle pattern: bearish engulfing", bn: "candle প্যাটার্ন: bearish engulfing" },
  x_gold_silver_lvlz: { en: "Gold/silver ratio vs its year", bn: "সোনা/রুপা অনুপাত, বছরের তুলনায়" },
  x_copper_gold_lvlz: { en: "Copper/gold ratio vs its year", bn: "তামা/সোনা অনুপাত, বছরের তুলনায়" },
  x_curve_10y3m: { en: "Yield curve (10-year minus 3-month)", bn: "সুদের বক্ররেখা (১০ বছর বাদ ৩ মাস)" },
  x_curve_30y5y: { en: "Yield curve (30-year minus 5-year)", bn: "সুদের বক্ররেখা (৩০ বছর বাদ ৫ বছর)" },
  x_tips_vs_nominal20: { en: "Real yields falling vs nominal", bn: "প্রকৃত সুদ কমছে নামমাত্র সুদের তুলনায়" },
  news_sent_mean: { en: "News mood today", bn: "আজকের খবরের হাওয়া" },
  news_sent_3d: { en: "News mood, last 3 days", bn: "খবরের হাওয়া, গত ৩ দিন" },
  news_count: { en: "How many gold headlines", bn: "সোনার শিরোনামের সংখ্যা" },
  news_high_share: { en: "Share of high-impact headlines", bn: "বড়-প্রভাবের শিরোনামের অংশ" },
  cot_mm_net: { en: "Hedge funds' net bet on gold", bn: "হেজ ফান্ডের সোনায় নিট বাজি" },
  cot_pm_net: { en: "Producers' net hedge", bn: "উৎপাদকদের নিট সুরক্ষা-অবস্থান" },
  cot_mm_chg4: { en: "Change in hedge-fund bets (4 weeks)", bn: "হেজ ফান্ডের বাজির পরিবর্তন (৪ সপ্তাহ)" },
  cot_mm_rank3y: { en: "Hedge-fund bets vs the last 3 years", bn: "হেজ ফান্ডের বাজি, গত ৩ বছরের তুলনায়" },
  cot_oi_chg4: { en: "Change in market activity (4 weeks)", bn: "বাজারের সক্রিয়তার পরিবর্তন (৪ সপ্তাহ)" },
  cal_dom: { en: "Day of the month", bn: "মাসের দিন" },
  cal_days_to_month_end: { en: "Days to month end", bn: "মাস শেষ হতে দিন" },
  cal_days_to_quarter_end: { en: "Days to quarter end", bn: "ত্রৈমাসিক শেষ হতে দিন" },
  cal_days_to_nfp: { en: "Days to US jobs report", bn: "মার্কিন চাকরির প্রতিবেদনে দিন" },
  cal_days_to_opex: { en: "Days to options expiry", bn: "অপশন শেষ হতে দিন" },
  cal_days_to_holiday: { en: "Days to next US holiday", bn: "পরের মার্কিন ছুটিতে দিন" },
  cal_days_since_holiday: { en: "Days since last US holiday", bn: "শেষ মার্কিন ছুটির পর দিন" },
  cal_month_sin: { en: "Season of the year", bn: "বছরের ঋতু" },
  cal_month_cos: { en: "Season of the year", bn: "বছরের ঋতু" },
};

/** A readable name for any input column the model used. */
export function featureLabel(col: string, lang: Lang): string {
  if (BASE[col]) return BASE[col][lang];
  const d = /^(.*)_(ret1|ret5|ret20|lvlz)$/.exec(col);
  if (d && DRIVERS[d[1]]) {
    const name = DRIVERS[d[1]].label[lang];
    const how = { ret1: ["1-day change", "১ দিনের পরিবর্তন"], ret5: ["5-day change", "৫ দিনের পরিবর্তন"], ret20: ["20-day change", "২০ দিনের পরিবর্তন"], lvlz: ["level vs its year", "বছরের তুলনায় স্তর"] }[d[2] as "ret1"];
    return `${name}, ${how[lang === "en" ? 0 : 1]}`;
  }
  const h = /^(H1|H4|M15|D1)_(trend|rsi|ma_gap|atr_pct)$/.exec(col);
  if (h) return lang === "en" ? `Bigger picture (${h[1]}): ${h[2].replace("_", " ")}` : `বড় চিত্র (${h[1]}): ${h[2].replace("_", " ")}`;
  return col.replace(/_/g, " ");
}

export const MODEL_NAMES: Record<string, Text> = {
  lgbm: { en: "LightGBM (boosted decision trees)", bn: "LightGBM (বর্ধিত সিদ্ধান্ত-গাছ)" },
  xgb: { en: "XGBoost (boosted decision trees)", bn: "XGBoost (বর্ধিত সিদ্ধান্ত-গাছ)" },
  rf: { en: "Random forest", bn: "র‍্যান্ডম ফরেস্ট" },
  et: { en: "Extra-trees forest", bn: "এক্সট্রা-ট্রি ফরেস্ট" },
  logit: { en: "Elastic-net logistic regression", bn: "ইলাস্টিক-নেট লজিস্টিক রিগ্রেশন" },
  ridge: { en: "Ridge logistic regression", bn: "রিজ লজিস্টিক রিগ্রেশন" },
  mlp: { en: "Small neural network", bn: "ছোট নিউরাল নেটওয়ার্ক" },
  lstm: { en: "LSTM neural network", bn: "LSTM নিউরাল নেটওয়ার্ক" },
  blend: { en: "Average of five models", bn: "পাঁচ মডেলের গড়" },
  stack: { en: "Stacked ensemble of five models", bn: "পাঁচ মডেলের স্ট্যাকড ensemble" },
};

export const INPUT_SETS: Record<string, Text> = {
  core: { en: "price behaviour only", bn: "শুধু দামের আচরণ" },
  "tech+": { en: "price behaviour and chart indicators", bn: "দামের আচরণ ও চার্টের সূচক" },
  macro: { en: "plus dollar, rates and markets", bn: "সাথে ডলার, সুদ ও বাজার" },
  flow: { en: "plus big investors' positions and the calendar", bn: "সাথে বড় বিনিয়োগকারীদের অবস্থান ও ক্যালেন্ডার" },
  all: { en: "everything, including news", bn: "সব কিছু, খবরসহ" },
};

/** Short, human-friendly number: no false precision, and small values do not collapse to 0. */
export function niceNumber(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return String(Number(v.toPrecision(2)));
}

export const REGIME_ORDER = ["TRENDING", "RANGING", "HIGH_VOL", "LOW_VOL", "BREAKOUT", "ABNORMAL"];
