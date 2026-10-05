"use client";
import { useSyncExternalStore } from "react";
import { makeStore } from "./persist";

const en = {
  "app.name": process.env.NEXT_PUBLIC_APP_NAME ?? "Gold Predictor",
  "nav.today": "Today",
  "nav.performance": "Results",
  "nav.history": "History",
  "nav.settings": "Alerts",
  "nav.about": "How it works",
  "logout": "Sign out",
  "loading": "Loading…",
  "retry": "Try again",
  "error.generic": "Something went wrong while loading. Please try again.",
  "error.backend": "The prediction service is not reachable right now. Please try again in a few minutes.",
  "footer.terms": "Risk & Terms",
  "footer.note": "Statistical estimates only. Not financial advice.",

  "login.title": "Sign in",
  "login.subtitle": "See what the system thinks about gold today.",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.busy": "Signing in…",
  "login.wrong": "Wrong email or password.",
  "login.locked": "Too many attempts. Please wait a few minutes.",

  "dash.title": "Today’s view",
  "dash.updated": "Last reading",
  "dash.market": "Market",
  "trust.none.title": "Waiting is the safest move right now",
  "trust.none.body": "We checked four time windows. None of them has strong enough evidence to trade. We only say Buy or Sell when our own testing proves the method beats guessing.",
  "trust.some.title": "{n} of 4 time windows have proven evidence",
  "trust.some.body": "Cards marked “Proven in testing” passed our checks on past data. The others stay on Wait.",
  "trust.learn": "How this works",

  "live.ok": "Live · checked {n} min ago",
  "live.paused": "Updates paused · last check {n} min ago",
  "live.never": "Waiting for the updater to start",
  "live.hint": "Readings change when a new price bar finishes (every 5 to 15 minutes while a market is open, daily otherwise).",

  "h.30m": "Next 30 minutes",
  "h.1h": "Next hour",
  "h.1d": "Tomorrow",
  "h.1w": "Next week",

  "act.BUY": "Buy",
  "act.SELL": "Sell",
  "act.WAIT": "Wait",
  "act.BUY.sub": "Price expected to rise",
  "act.SELL.sub": "Price expected to fall",
  "act.WAIT.sub": "No trade suggested",

  "r.no_edge": "Not enough proof to trade this window.",
  "r.uncertain": "Too close to call ({pct} chance of a rise).",
  "r.abnormal": "The market is moving unusually. Better to wait.",
  "r.no_data": "Waiting for the first reading.",
  "r.BUY": "Estimated chance the price rises: {pct}",
  "r.SELL": "Estimated chance the price falls: {pct}",

  "ev.proven": "Proven in testing",
  "ev.unproven": "Not proven yet",
  "details.show": "Details",
  "details.mood": "Market mood",
  "details.price": "Price at reading",
  "details.time": "Reading time",
  "details.acc": "Accuracy in testing",
  "details.vs": "{acc} vs {base} for plain guessing",
  "details.na": "Not tested yet",

  "regime.TRENDING": "Trending",
  "regime.RANGING": "Moving sideways",
  "regime.HIGH_VOL": "Very active",
  "regime.LOW_VOL": "Very quiet",
  "regime.BREAKOUT": "Breaking out",
  "regime.ABNORMAL": "Unusual",

  "chart.title": "Price",
  "chart.daily": "Daily",
  "chart.hourly": "Hourly",
  "chart.error": "Price chart is unavailable right now.",
  "chart.last": "Latest",

  "practice.title": "Practice trades",
  "practice.sub": "Virtual money only. Shows how the signals would have done.",
  "practice.closed": "Closed trades",
  "practice.win": "Winning trades",
  "practice.total": "Total result",
  "practice.open": "Open now",
  "practice.more": "See all results",
  "practice.none": "No practice trades yet. One opens only when a Buy or Sell signal appears.",

  "perf.title": "Results",
  "perf.intro": "Practice trades use virtual money. They show what would have happened if the signals had been followed.",
  "perf.curve": "Practice account over time",
  "perf.curve.none": "The line appears after the first practice trades close.",
  "perf.check": "Did the system call the direction?",
  "perf.check.body": "Out of {n} past readings, the price moved the way the system leaned {pct} of the time. Pure guessing gives about 50%.",
  "perf.check.none": "Not enough finished readings yet. This fills in as time passes.",
  "perf.trades": "Recent practice trades",
  "perf.col.time": "Opened",
  "perf.col.window": "Window",
  "perf.col.dir": "Direction",
  "perf.col.entry": "Entry price",
  "perf.col.result": "Result",
  "perf.col.status": "Status",
  "status.OPEN": "Open",
  "status.TP": "Target reached",
  "status.SL": "Stopped out",
  "status.EXPIRED": "Time ran out",

  "hist.title": "History",
  "hist.intro": "Every reading the system has made.",
  "hist.col.time": "Reading",
  "hist.col.chance": "Chance of rise",
  "hist.col.after": "What happened",
  "hist.up": "Price went up",
  "hist.down": "Price went down",
  "hist.pending": "Not yet known",
  "hist.none": "No readings yet.",

  "set.title": "Alerts",
  "set.intro": "Get a message when a new Buy or Sell signal appears. Wait signals never send alerts.",
  "set.tg": "Telegram",
  "set.tg.help": "Open Telegram, message @userinfobot, and copy the number it sends back. Paste it here.",
  "set.tg.id": "Telegram chat ID",
  "set.email": "Email",
  "set.email.help": "Alerts go to the email you sign in with.",
  "set.save": "Save",
  "set.saving": "Saving…",
  "set.saved": "Saved.",
  "set.on": "On",

  "about.title": "How it works",
  "about.s1.t": "It reads gold prices",
  "about.s1.b": "Prices come in through the day, from short moves of 30 minutes up to weekly moves.",
  "about.s2.t": "It looks for patterns",
  "about.s2.b": "A computer model studies thousands of past price moves and gives a chance that the price will rise.",
  "about.s3.t": "It tests itself honestly",
  "about.s3.b": "The model is checked on past data it never saw while learning, and compared with plain guessing. Trading costs are included.",
  "about.s4.t": "It only speaks up when proven",
  "about.s4.b": "If a time window does not beat guessing, the card says Wait. Saying Wait often is expected, because gold is hard to predict.",
  "about.s5.t": "Practice trades keep score",
  "about.s5.b": "Every Buy or Sell opens a virtual trade with a fixed target and stop. Results are recorded, so you can see real performance over time.",
  "about.words": "Words used",
  "about.w.buy": "Buy: the system expects the price to rise.",
  "about.w.sell": "Sell: the system expects the price to fall.",
  "about.w.wait": "Wait: no trade is suggested.",
  "about.w.chance": "Chance: the model’s estimate, from 0% to 100%. It is an estimate, never a promise.",
  "about.w.proven": "Proven in testing: the method beat plain guessing on past data it had not seen.",
  "about.terms": "Risk & Terms",
  "about.t1": "This service gives statistical estimates. It is not financial, investment or trading advice.",
  "about.t2": "Trading gold can lose money, including more than you planned to risk. Past results, including practice trades, do not guarantee future results.",
  "about.t3": "Prices come from third-party sources and can be delayed, wrong or missing. Signals can be late or wrong.",
  "about.t4": "No signal is guaranteed. You make your own decisions and are responsible for them.",
  "about.t5": "Do not risk money you cannot afford to lose.",
};

type Key = keyof typeof en;

const bn: Record<Key, string> = {
  "app.name": process.env.NEXT_PUBLIC_APP_NAME ?? "Gold Predictor",
  "nav.today": "আজ",
  "nav.performance": "ফলাফল",
  "nav.history": "ইতিহাস",
  "nav.settings": "অ্যালার্ট",
  "nav.about": "কীভাবে কাজ করে",
  "logout": "সাইন আউট",
  "loading": "লোড হচ্ছে…",
  "retry": "আবার চেষ্টা করুন",
  "error.generic": "লোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
  "error.backend": "পূর্বাভাস সেবা এখন পাওয়া যাচ্ছে না। কয়েক মিনিট পরে আবার চেষ্টা করুন।",
  "footer.terms": "ঝুঁকি ও শর্ত",
  "footer.note": "এগুলো শুধু পরিসংখ্যানভিত্তিক অনুমান। আর্থিক পরামর্শ নয়।",

  "login.title": "সাইন ইন",
  "login.subtitle": "আজ সোনা নিয়ে সিস্টেম কী ভাবছে দেখুন।",
  "login.email": "ইমেইল",
  "login.password": "পাসওয়ার্ড",
  "login.submit": "সাইন ইন",
  "login.busy": "সাইন ইন হচ্ছে…",
  "login.wrong": "ইমেইল বা পাসওয়ার্ড ভুল।",
  "login.locked": "অনেকবার চেষ্টা হয়েছে। কয়েক মিনিট অপেক্ষা করুন।",

  "dash.title": "আজকের চিত্র",
  "dash.updated": "সর্বশেষ পর্যবেক্ষণ",
  "dash.market": "বাজার",
  "trust.none.title": "এখন অপেক্ষা করাই সবচেয়ে নিরাপদ",
  "trust.none.body": "আমরা চারটি সময়সীমা দেখেছি। কোনোটাতেই ট্রেড করার মতো যথেষ্ট প্রমাণ নেই। আমাদের নিজস্ব পরীক্ষায় পদ্ধতিটি আন্দাজের চেয়ে ভালো প্রমাণিত হলেই আমরা কিনুন বা বেচুন বলি।",
  "trust.some.title": "৪টির মধ্যে {n}টি সময়সীমায় প্রমাণ আছে",
  "trust.some.body": "“পরীক্ষায় প্রমাণিত” চিহ্নিত কার্ড অতীতের তথ্যে আমাদের যাচাই পার হয়েছে। বাকিগুলো অপেক্ষায় থাকে।",
  "trust.learn": "কীভাবে কাজ করে",

  "live.ok": "লাইভ · {n} মিনিট আগে যাচাই হয়েছে",
  "live.paused": "আপডেট বিরতিতে · শেষ যাচাই {n} মিনিট আগে",
  "live.never": "আপডেটার চালু হওয়ার অপেক্ষা",
  "live.hint": "নতুন দামের বার শেষ হলে পর্যবেক্ষণ বদলায় (বাজার খোলা থাকলে ৫ থেকে ১৫ মিনিটে, নইলে দৈনিক)।",

  "h.30m": "পরের ৩০ মিনিট",
  "h.1h": "পরের ১ ঘণ্টা",
  "h.1d": "আগামীকাল",
  "h.1w": "আগামী সপ্তাহ",

  "act.BUY": "কিনুন",
  "act.SELL": "বেচুন",
  "act.WAIT": "অপেক্ষা",
  "act.BUY.sub": "দাম বাড়বে বলে আশা",
  "act.SELL.sub": "দাম কমবে বলে আশা",
  "act.WAIT.sub": "ট্রেডের পরামর্শ নেই",

  "r.no_edge": "এই সময়সীমায় ট্রেড করার মতো যথেষ্ট প্রমাণ নেই।",
  "r.uncertain": "বলা কঠিন (দাম বাড়ার সম্ভাবনা {pct})।",
  "r.abnormal": "বাজার অস্বাভাবিকভাবে নড়ছে। অপেক্ষা করা ভালো।",
  "r.no_data": "প্রথম পর্যবেক্ষণের অপেক্ষা।",
  "r.BUY": "দাম বাড়ার আনুমানিক সম্ভাবনা: {pct}",
  "r.SELL": "দাম কমার আনুমানিক সম্ভাবনা: {pct}",

  "ev.proven": "পরীক্ষায় প্রমাণিত",
  "ev.unproven": "এখনো প্রমাণিত নয়",
  "details.show": "বিস্তারিত",
  "details.mood": "বাজারের মেজাজ",
  "details.price": "পর্যবেক্ষণের সময়ের দাম",
  "details.time": "পর্যবেক্ষণের সময়",
  "details.acc": "পরীক্ষায় সঠিকতা",
  "details.vs": "শুধু আন্দাজ করলে {base}, এখানে {acc}",
  "details.na": "এখনো পরীক্ষা হয়নি",

  "regime.TRENDING": "এক দিকে চলছে",
  "regime.RANGING": "পাশাপাশি নড়ছে",
  "regime.HIGH_VOL": "খুব সক্রিয়",
  "regime.LOW_VOL": "খুব শান্ত",
  "regime.BREAKOUT": "সীমা ভেঙে বেরোচ্ছে",
  "regime.ABNORMAL": "অস্বাভাবিক",

  "chart.title": "দাম",
  "chart.daily": "দৈনিক",
  "chart.hourly": "ঘণ্টাভিত্তিক",
  "chart.error": "দামের চার্ট এখন পাওয়া যাচ্ছে না।",
  "chart.last": "সর্বশেষ",

  "practice.title": "অনুশীলন ট্রেড",
  "practice.sub": "শুধু ভার্চুয়াল টাকা। সংকেত মানলে কেমন ফল হতো তা দেখায়।",
  "practice.closed": "শেষ হওয়া ট্রেড",
  "practice.win": "লাভজনক ট্রেড",
  "practice.total": "মোট ফল",
  "practice.open": "এখন চালু",
  "practice.more": "সব ফলাফল দেখুন",
  "practice.none": "এখনো কোনো অনুশীলন ট্রেড নেই। কিনুন বা বেচুন সংকেত এলেই একটি খোলে।",

  "perf.title": "ফলাফল",
  "perf.intro": "অনুশীলন ট্রেডে ভার্চুয়াল টাকা ব্যবহার হয়। সংকেত অনুসরণ করলে কী হতো তা দেখায়।",
  "perf.curve": "সময়ের সাথে অনুশীলন অ্যাকাউন্ট",
  "perf.curve.none": "প্রথম কয়েকটি অনুশীলন ট্রেড শেষ হলে রেখাটি দেখা যাবে।",
  "perf.check": "সিস্টেম কি দিক ঠিক ধরেছে?",
  "perf.check.body": "অতীতের {n}টি পর্যবেক্ষণের মধ্যে {pct} ক্ষেত্রে দাম সিস্টেমের ঝোঁকের দিকে গেছে। শুধু আন্দাজে প্রায় ৫০% হয়।",
  "perf.check.none": "যথেষ্ট শেষ হওয়া পর্যবেক্ষণ নেই। সময়ের সাথে এটা ভরবে।",
  "perf.trades": "সাম্প্রতিক অনুশীলন ট্রেড",
  "perf.col.time": "খোলা হয়েছে",
  "perf.col.window": "সময়সীমা",
  "perf.col.dir": "দিক",
  "perf.col.entry": "ঢোকার দাম",
  "perf.col.result": "ফল",
  "perf.col.status": "অবস্থা",
  "status.OPEN": "চালু",
  "status.TP": "লক্ষ্যে পৌঁছেছে",
  "status.SL": "ক্ষতি-সীমায় বন্ধ",
  "status.EXPIRED": "সময় শেষ",

  "hist.title": "ইতিহাস",
  "hist.intro": "সিস্টেমের করা প্রতিটি পর্যবেক্ষণ।",
  "hist.col.time": "পর্যবেক্ষণ",
  "hist.col.chance": "বাড়ার সম্ভাবনা",
  "hist.col.after": "পরে কী হলো",
  "hist.up": "দাম বেড়েছে",
  "hist.down": "দাম কমেছে",
  "hist.pending": "এখনো জানা নেই",
  "hist.none": "এখনো কোনো পর্যবেক্ষণ নেই।",

  "set.title": "অ্যালার্ট",
  "set.intro": "নতুন কিনুন বা বেচুন সংকেত এলে বার্তা পান। অপেক্ষা সংকেতে কখনো অ্যালার্ট যায় না।",
  "set.tg": "টেলিগ্রাম",
  "set.tg.help": "টেলিগ্রামে @userinfobot-কে বার্তা দিন, সে যে নম্বর পাঠায় তা কপি করে এখানে বসান।",
  "set.tg.id": "টেলিগ্রাম চ্যাট আইডি",
  "set.email": "ইমেইল",
  "set.email.help": "আপনি যে ইমেইলে সাইন ইন করেন, অ্যালার্ট সেখানে যাবে।",
  "set.save": "সংরক্ষণ",
  "set.saving": "সংরক্ষণ হচ্ছে…",
  "set.saved": "সংরক্ষিত হয়েছে।",
  "set.on": "চালু",

  "about.title": "কীভাবে কাজ করে",
  "about.s1.t": "এটি সোনার দাম পড়ে",
  "about.s1.b": "দিনভর দাম আসে, ৩০ মিনিটের ছোট নড়াচড়া থেকে সাপ্তাহিক নড়াচড়া পর্যন্ত।",
  "about.s2.t": "এটি ধরন খোঁজে",
  "about.s2.b": "একটি কম্পিউটার মডেল হাজার হাজার অতীত দামের নড়াচড়া দেখে দাম বাড়ার একটি সম্ভাবনা বলে।",
  "about.s3.t": "এটি নিজেকে সততার সাথে পরীক্ষা করে",
  "about.s3.b": "মডেল শেখার সময় যে অতীত তথ্য দেখেনি, তাতে যাচাই করা হয় এবং শুধু আন্দাজের সাথে তুলনা করা হয়। ট্রেডের খরচও ধরা হয়।",
  "about.s4.t": "প্রমাণ থাকলে তবেই কথা বলে",
  "about.s4.b": "কোনো সময়সীমা আন্দাজের চেয়ে ভালো না হলে কার্ডে “অপেক্ষা” লেখা থাকে। অনেক সময় অপেক্ষা দেখা স্বাভাবিক, কারণ সোনার দাম আগে থেকে বলা কঠিন।",
  "about.s5.t": "অনুশীলন ট্রেড হিসাব রাখে",
  "about.s5.b": "প্রতিটি কিনুন বা বেচুন সংকেতে নির্দিষ্ট লক্ষ্য ও ক্ষতি-সীমা দিয়ে একটি ভার্চুয়াল ট্রেড খোলে। ফল লেখা থাকে, তাই সময়ের সাথে আসল কার্যকারিতা দেখা যায়।",
  "about.words": "ব্যবহৃত শব্দ",
  "about.w.buy": "কিনুন: সিস্টেম দাম বাড়বে বলে আশা করছে।",
  "about.w.sell": "বেচুন: সিস্টেম দাম কমবে বলে আশা করছে।",
  "about.w.wait": "অপেক্ষা: ট্রেডের পরামর্শ নেই।",
  "about.w.chance": "সম্ভাবনা: মডেলের অনুমান, ০% থেকে ১০০%। এটা অনুমান, প্রতিশ্রুতি নয়।",
  "about.w.proven": "পরীক্ষায় প্রমাণিত: যে অতীত তথ্য মডেল দেখেনি তাতে পদ্ধতিটি আন্দাজের চেয়ে ভালো করেছে।",
  "about.terms": "ঝুঁকি ও শর্ত",
  "about.t1": "এই সেবা পরিসংখ্যানভিত্তিক অনুমান দেয়। এটি আর্থিক, বিনিয়োগ বা ট্রেডিং পরামর্শ নয়।",
  "about.t2": "সোনার ট্রেডে টাকা হারানো যায়, এমনকি ঝুঁকির পরিকল্পনার চেয়েও বেশি। অতীতের ফল, অনুশীলন ট্রেডসহ, ভবিষ্যতের ফলের নিশ্চয়তা দেয় না।",
  "about.t3": "দাম তৃতীয় পক্ষের উৎস থেকে আসে এবং দেরিতে আসতে, ভুল হতে বা না আসতে পারে। সংকেতও দেরিতে বা ভুল হতে পারে।",
  "about.t4": "কোনো সংকেতের নিশ্চয়তা নেই। সিদ্ধান্ত আপনার নিজের এবং তার দায়ও আপনার।",
  "about.t5": "যে টাকা হারানো সহ্য করতে পারবেন না, তা ঝুঁকিতে ফেলবেন না।",
};

export type Lang = "en" | "bn";
const dict: Record<Lang, Record<Key, string>> = { en, bn };

const langStore = makeStore("gp_lang", "en");

export function useLang(): Lang {
  const v = useSyncExternalStore(langStore.subscribe, langStore.get, langStore.getServer);
  return v === "bn" ? "bn" : "en";
}

export function setLang(l: Lang) {
  langStore.set(l);
}

const bnDigits = "০১২৩৪৫৬৭৮৯";
export function localizeDigits(s: string, lang: Lang): string {
  return lang === "bn" ? s.replace(/\d/g, (d) => bnDigits[Number(d)]) : s;
}

export function useT() {
  const lang = useLang();
  return {
    lang,
    t(key: Key, vars?: Record<string, string | number>): string {
      let s: string = dict[lang][key] ?? dict.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, localizeDigits(String(v), lang));
      return s;
    },
    num(s: string): string {
      return localizeDigits(s, lang);
    },
  };
}

export type { Key };
