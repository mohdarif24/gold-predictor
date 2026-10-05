# Gold Predictor: নিজে বানানোর Study Guide (Beginner → Advanced)

এই ফাইলের লক্ষ্য: এই প্রজেক্ট শূন্য থেকে নিজের হাতে বানাতে যা যা concept লাগে, সেগুলো ক্রমানুসারে, compact ভাবে। প্রতিটা ধাপে **কেন লাগে** আর **কোথায় ব্যবহার হয়েছে** দেওয়া আছে।

---

## ০. শেখার ক্রম (Roadmap)

```text
স্তর ১: Python + pandas          → ডেটা নাড়াচাড়া
স্তর ২: বাজারের মূল ধারণা       → candle, timeframe, spread, ATR
স্তর ৩: Feature engineering      → দাম থেকে সংখ্যা বানানো
স্তর ৪: ML মূল ধারণা            → classification, overfitting, tree
স্তর ৫: Time-series validation   → leakage, walk-forward (সবচেয়ে গুরুত্বপূর্ণ)
স্তর ৬: মূল্যায়ন               → AUC, baseline, calibration, Sharpe
স্তর ৭: Trading logic            → signal, SL/TP, risk, shadow trading
স্তর ৮: System design            → config, SQLite, pipeline, test
স্তর ৯: Advanced                 → regime, calibration, ensemble, execution
```

**সবচেয়ে বড় সত্য:** ৯০% কাজ ML না, বরং **ডেটা সঠিক রাখা** আর **নিজেকে ঠকানো এড়ানো** (স্তর ৫–৬)।

---

## স্তর ১: Python + pandas (ডেটা)

### মুখস্থ করার জিনিস
```python
import pandas as pd, numpy as np

df = pd.DataFrame({"close": [100, 101, 99]},
                  index=pd.date_range("2024-01-01", periods=3, freq="h"))

df["close"].pct_change()          # (আজ/গতকাল) - 1   → return
df["close"].shift(1)              # এক ঘর নিচে সরাও → গতকালের মান
df["close"].shift(-3)             # তিন ঘর উপরে → ভবিষ্যতের মান (শুধু target-এ!)
df["close"].rolling(20).mean()    # শেষ ২০টার গড় → moving average
df["close"].rolling(20).std()     # শেষ ২০টার standard deviation
df["close"].ewm(span=12).mean()   # EMA: নতুন মানে বেশি ওজন
df["close"].diff()                # আজ - গতকাল
df.iloc[-1]                       # শেষ সারি;  df.iloc[:100] প্রথম ১০০টা
df.reindex(columns=[...])         # কলাম নির্দিষ্ট ক্রমে সাজাও
pd.merge_asof(a, b, on="t")       # সময় ধরে "আগের সবচেয়ে কাছের" সারি জোড়ো
```

### কেন `shift` সবচেয়ে গুরুত্বপূর্ণ
- `shift(+n)` = **অতীত** আনা (feature-এ ঠিক আছে)।
- `shift(-n)` = **ভবিষ্যৎ** আনা (শুধু target বানাতে, কখনো feature-এ না)।
- ভুল জায়গায় ভুল দিকে shift = **data leakage** = সব ফল মিথ্যা।

### অনুশীলন
একটা CSV লোড করে: return, ২০-দিনের MA, rolling volatility বের করো। তারপর `shift(-1)` দিয়ে "আগামীকাল বাড়ল?" (০/১) বানাও।

---

## স্তর ২: বাজারের মূল ধারণা

| শব্দ | মানে |
|---|---|
| **Candle (OHLC)** | এক সময়-খণ্ডের Open, High, Low, Close |
| **Timeframe** | M5 = ৫ মিনিট, H1 = ১ ঘণ্টা, D1 = ১ দিন |
| **Bid / Ask** | বিক্রির দাম / কেনার দাম। Ask > Bid |
| **Spread** | Ask − Bid। প্রতি ট্রেডে এটাই তোমার **নিশ্চিত খরচ** |
| **Pip / point** | দামের সবচেয়ে ছোট ধাপ |
| **Long / Short** | BUY (দাম বাড়লে লাভ) / SELL (কমলে লাভ) |
| **SL / TP** | Stop Loss (ক্ষতি সীমা) / Take Profit (লাভ লক্ষ্য) |
| **Slippage** | চাওয়া দামে না পেয়ে একটু খারাপ দামে ভরা |
| **Lot / leverage** | ট্রেডের আকার / ধার করা শক্তি (লাভ-ক্ষতি দুটোই বাড়ায়) |
| **Volatility** | দাম কতটা দোলে |
| **ATR** | Average True Range: গড় candle কত বড় (volatility মাপার সবচেয়ে সাধারণ উপায়) |

### ATR সূত্র
```text
True Range = max( High−Low, |High−আগের Close|, |Low−আগের Close| )
ATR        = গত ১৪ True Range-এর গড়
```
**ব্যবহার:** SL/TP-কে ATR-এর গুণিতকে রাখলে বাজার অস্থির হলে স্বয়ংক্রিয়ভাবে বড় হয়। (`shadow.py`: SL = ১.৫×ATR)

### খরচ কেন সবকিছু
৩০ মিনিটে সোনা গড়ে হয়তো ০.১% নড়ে। spread+slippage ০.০২%। মানে প্রতিটা ট্রেডে লাভের পঞ্চমাংশ খরচেই যায়। **ছোট সময়ের মডেল সবচেয়ে কঠিন** কারণ খরচ/আয় অনুপাত খারাপ।

---

## স্তর ৩: Feature Engineering

**Feature = মডেলকে দেওয়া সংখ্যা।** মডেল candle ছবি দেখে না।

### নীতি: "stationary" রাখো
দাম নিজে (২০০০, ৪১৪০...) সময়ের সাথে বদলায়, মডেল শিখতে পারে না। তাই **অনুপাত/শতাংশ** দাও:
- `ret_n` = n candle-এর % পরিবর্তন
- `ma_gap` = `close / MA − 1`
- `atr_pct` = `ATR / close`

### Feature-এর পরিবার
1. **Momentum:** `ret_1, ret_3, ret_6...`, দাম কোন দিকে ছুটছে।
2. **Volatility:** `rolling std`, `ATR`, `vol_ratio = ছোট vol / বড় vol` (>১ মানে হঠাৎ অস্থিরতা)।
3. **Oscillator:** RSI (০–১০০; >৭০ overbought, <৩০ oversold)।
4. **Trend:** MACD = `EMA12 − EMA26`। `macd_hist` = MACD − তার ৯-EMA।
5. **Position:** `range_pos = (close − ২০-low) / (২০-high − ২০-low)`।
6. **Candle আকার:** `(high−low)/close`, `(close−open)/close`।
7. **Volume / spread z-score:** `(মান − গড়) / std`। স্বাভাবিকের কতটা বাইরে।
8. **সময়:** ঘণ্টা (sin/cos), সপ্তাহের দিন।
9. **Multi-timeframe:** ছোট M5 মডেলকে বড় H1/H4 trend জানানো।
10. **Macro (শুধু daily):** ডলার সূচক (DXY), ইউরো/ইয়েন, US 10-year yield, তেল। সোনা সাধারণত ডলার ও yield-এর বিপরীতে নড়ে।

### RSI সূত্র (মুখস্থ)
```text
up   = ধনাত্মক diff-এর exponential গড়
down = ঋণাত্মক diff-এর (পজিটিভ করে) exponential গড়
RSI  = 100 − 100 / (1 + up/down)
```

### sin/cos সময় কেন
ঘণ্টা ২৩ আর ০ আসলে পাশাপাশি, কিন্তু সংখ্যায় দূরে। `sin(2π·h/24)`, `cos(2π·h/24)` দিলে বৃত্তে পাশাপাশি থাকে।

---

## স্তর ৪: ML মূল ধারণা

### ৪.১ সমস্যার ধরন
- **Classification:** উত্তর হ্যাঁ/না → "দাম বাড়বে? (১/০)"। আমরা এটাই করি।
- **Regression:** উত্তর সংখ্যা → "কত % বাড়বে?" (নয়েজ বেশি, কঠিন)।

মডেল `predict_proba` দিয়ে **P(up)** দেয় (০–১)। এটাই "কতটা নিশ্চিত"।

### ৪.২ Target বানানো
```python
fwd = close.shift(-steps) / close - 1     # steps candle পরের return
y   = (fwd > 0).astype(int)               # ১ = বাড়ল
```
শেষ `steps` সারির target NaN (ভবিষ্যৎ নেই), বাদ দাও।

### ৪.৩ Overfitting (মূল শত্রু)
মডেল অতীতের **noise মুখস্থ** করে ফেলা। training-এ দারুণ, নতুন ডেটায় শূন্য।
- **কারণ:** feature বেশি, ডেটা কম, মডেল জটিল।
- **লক্ষণ:** train accuracy ৯০%, test ৫০%।
- **প্রতিকার:** সরল মডেল, regularization, বেশি ডেটা, সঠিক validation।

আর্থিক ডেটায় signal দুর্বল, noise বিশাল, তাই overfit **খুব সহজে** হয়।

### ৪.৪ Decision Tree → Gradient Boosting
- **Decision tree:** প্রশ্নের গাছ। "RSI > ৬০? হ্যাঁ → ATR বেশি? ..." শেষ পাতায় সম্ভাবনা।
- একটা tree দুর্বল ও অস্থির।
- **Boosting:** অনেক ছোট tree পরপর। প্রতিটা আগের **ভুলগুলো** ঠিক করে। সবার যোগফল = চূড়ান্ত।
- **LightGBM** = দ্রুত boosting library।

### ৪.৫ LightGBM parameter (কোনটা কী)
| Parameter | ছোট করলে | কারণ |
|---|---|---|
| `n_estimators` (tree সংখ্যা) | সরল | বেশি হলে মুখস্থ বাড়ে |
| `learning_rate` | ধীর শেখা | ছোট হলে নিরাপদ, বেশি tree লাগে |
| `num_leaves` | সরল tree | কম = কম overfit |
| `min_child_samples` | — | বড় হলে ছোট দল নিয়ে ভাগ হয় না |
| `subsample` | প্রতি tree-তে কিছু সারি | ভিন্নতা, কম overfit |
| `colsample_bytree` | প্রতি tree-তে কিছু feature | ভিন্নতা |
| `reg_lambda` | জরিমানা | বড় weight-এ শাস্তি |

**নিয়ম:** ডেটা কম আর noise বেশি হলে মডেল **ইচ্ছা করে সরল ও ধীর** রাখো।

### ৪.৬ Baseline (না জানলে সব ভুল)
**মূর্খ মডেল:** "সবসময় সেই দিকটা বলো যেটা training-এ বেশি হয়েছে।" যদি ৫২% দিন দাম বাড়ে, সবসময় "↑" বললে ৫২% ঠিক। তোমার মডেল এর **চেয়ে ভালো** না হলে তা ব্যর্থ। প্রজেক্টে `base_p` এটাই।

---

## স্তর ৫: Time-series Validation (সবচেয়ে গুরুত্বপূর্ণ)

### ৫.১ কেন random split ভুল
সাধারণ ML-এ ডেটা এলোমেলো করে ভাগ করা হয়। time-series-এ এতে **ভবিষ্যৎ ডেটা training-এ ঢুকে** অতীত পরীক্ষা হয়। ফল অবাস্তব ভালো, বাস্তবে ব্যর্থ।

### ৫.২ Data Leakage-এর রূপ
1. Feature-এ ভবিষ্যৎ (`shift(-n)` ভুলে)।
2. Higher-timeframe candle বন্ধ হওয়ার আগেই তার মান ব্যবহার।
3. একই দিনের macro ডেটা যা আসলে পরে প্রকাশ হয়।
4. Train/test ভাগে overlapping label।
5. Test ডেটা দেখে parameter/threshold বেছে নেওয়া।

### ৫.৩ Walk-forward (Expanding window)
```text
fold 1:  [====train====]gap[test]
fold 2:  [=======train=======]gap[test]
fold 3:  [===========train===========]gap[test]
```
সবসময় **অতীতে শেখো → ভবিষ্যতে পরীক্ষা**, তারপর train বাড়াও।

### ৫.৪ Purge gap
label-এ `steps` candle পরের দাম আছে। train-এর শেষ সারির label test-এর শুরুর সারির সাথে ভবিষ্যৎ ভাগ করে নেয়। তাই train শেষ করো `test_শুরু − steps`-এ।

### ৫.৫ Overlapping trade
প্রতি candle-এ ট্রেড ধরলে পরপর ট্রেড একই চলাচল গোনে (ফল ফাঁপানো)। তাই backtest-এ `steps` candle পরপর একটা ট্রেড (`iloc[::steps]`)।

### ৫.৬ Look-ahead পরীক্ষার কৌশল
ডেটা `২০০০` সারিতে কেটে feature বানাও। পুরো ডেটায় বানানো feature-এর প্রথম ২০০০ সারি **হুবহু মিলতে** হবে। না মিললে কোথাও ভবিষ্যৎ ঢুকেছে। (`test_no_lookahead_in_features`)

---

## স্তর ৬: মূল্যায়ন (Metrics)

### ৬.১ Classification metric
| Metric | অর্থ | ভালো মান |
|---|---|---|
| **Accuracy** | কত % সঠিক | baseline-এর চেয়ে বেশি |
| **AUC** | ↑ কে ↓-এর চেয়ে বেশি P দিতে পারে কত সময় | ০.৫ = পাশা, ০.৫২+ = সামান্য সংকেত, ০.৫৫+ = ভালো (আর্থিক ডেটায়) |
| **Signal accuracy** | শুধু যেগুলোতে ট্রেড দিয়েছে তাদের accuracy | বেশি হলে ভালো |

আর্থিক বাজারে AUC ০.৫৫ ও খুব ভালো। ০.৭ দেখলে প্রায় নিশ্চিত leakage।

### ৬.২ Calibration (বিশ্বাসযোগ্যতা)
মডেল "৭০%" বললে সত্যিই কি ৭০% ক্ষেত্রে ঘটে? পরীক্ষা: P-কে ঝুড়িতে ভাগ করো, প্রতিটায় "পূর্বাভাসের গড়" বনাম "আসল হার" মেলাও। মেলে না = overconfident। প্রতিকার: **isotonic / Platt calibration**।

### ৬.৩ Trading metric
```text
net return  = Σ ( position × forward_return − খরচ )
Sharpe      = গড় return / std × √(বছরে ট্রেড সংখ্যা)
Max drawdown = equity-র সর্বোচ্চ থেকে সর্বনিম্ন পতন
```
- **Sharpe:** ঝুঁকির তুলনায় আয়। >১ ভালো, >২ চমৎকার, খুব বেশি হলে সন্দেহ।
- **Drawdown:** সবচেয়ে বড় ধাক্কা। এটা সইতে পারবে কিনা নিজেকে প্রশ্ন করো।

### ৬.৪ `has_edge` ফটক (প্রজেক্টের নিয়ম)
```text
AUC ≥ 0.52  এবং  accuracy ≥ baseline + 0.5%  এবং  net return > 0  এবং  ট্রেড ≥ 30
```
সবগুলো একসাথে না হলে সংকেত **WAIT**। এটা সবচেয়ে গুরুত্বপূর্ণ নিরাপত্তা-নিয়ম।

---

## স্তর ৭: Trading Logic

### ৭.১ Signal
```text
P(up) ≥ 0.55  → BUY
P(up) ≤ 0.45  → SELL
মাঝখানে      → WAIT   (no-trade band, অনিশ্চিত হলে বসে থাকো)
```
ট্রেড না করাও একটা সিদ্ধান্ত। খরচ আছে বলে অনিশ্চিত অবস্থায় না ঢোকাই ভালো।

### ৭.২ SL/TP (ATR ভিত্তিক)
```text
BUY :  SL = entry − 1.5·ATR     TP = entry + 2.0·ATR
SELL:  SL = entry + 1.5·ATR     TP = entry − 2.0·ATR
```
Risk:Reward = ১:১.৩। জেতার হার ৪৫% হলেও লাভ হতে পারে যদি reward > risk।

### ৭.৩ Position sizing (Phase 2-এর জন্য, এখনো বানানো হয়নি)
```text
ঝুঁকি-টাকা = account × ১%     (প্রতি ট্রেডে সর্বোচ্চ ক্ষতি)
lot        = ঝুঁকি-টাকা / (SL দূরত্ব × প্রতি-পয়েন্ট মান)
```
**নিয়ম:** কখনো এক ট্রেডে account-এর ১–২% এর বেশি ঝুঁকি না। দৈনিক ক্ষতির সীমা (যেমন ৩%) পেলে সেদিনের মতো বন্ধ।

### ৭.৪ Shadow (paper) trading
আসল টাকা ছাড়া ভার্চুয়াল ট্রেড। প্রতি ট্রেডে লিখে রাখো: কখন, কোন দিক, entry/SL/TP, ফল। কয়েক সপ্তাহ পরে backtest-এর সাথে মেলাও। মিললে বিশ্বাস, না মিললে মডেলে সমস্যা।

**সংঘাতের নিয়ম:** একই candle-এ SL আর TP দুটোই ছুঁলে কোনটা আগে জানা যায় না। **রক্ষণশীলভাবে SL ধরো।**

### ৭.৫ Market Regime
বাজার সবসময় একরকম না। trend-এর বাজারে যে নিয়ম চলে, range-এ তা ফেল করে।
```text
TRENDING / RANGING / HIGH_VOL / LOW_VOL / BREAKOUT / ABNORMAL
```
- মডেলকে feature হিসেবে দাও।
- `ABNORMAL` হলে ট্রেড বন্ধ।
- Advanced: regime-ভিত্তিক আলাদা মডেল।

---

## স্তর ৮: System Design

### ৮.১ ফাইল ভাগ (কে কী করে)
```text
config.yaml      সব সেটিং এক জায়গায় (hard-code কোরো না)
data provider    শুধু ডেটা আনে (MT5 / yfinance)  → একই আকৃতির DataFrame
features         DataFrame → feature
models           train/save/load
backtest         সৎ মূল্যায়ন
signal           P → BUY/SELL/WAIT
shadow           ভার্চুয়াল ট্রেড
store            SQLite
pipeline         সবকিছু জোড়া
run.py           CLI
app.py           dashboard (শুধু পড়ে)
```
**নীতি (Separation of concerns):** data provider বদলালে (MT5 ↔ yfinance) বাকি কোড যেন না বদলায়।

### ৮.২ Config-driven design
instrument, horizon, খরচ, threshold সব `config.yaml`-এ। নতুন instrument যোগ = শুধু config-এ কয়েক লাইন।

### ৮.৩ SQLite
```sql
CREATE TABLE predictions(... UNIQUE(instrument, horizon, bar_ts));
INSERT OR IGNORE ...   -- একই candle-এর জন্য দুবার না
```
**Idempotency:** একই কমান্ড দুবার চালালে ফল দুবার যেন না জমে।

### ৮.৪ মডেলের সাথে meta সেভ
`joblib.dump({"model": m, "meta": {features, metrics, version}})`। predict-এর সময় `reindex(columns=meta["features"])` দিয়ে training-এর কলাম-ক্রম হুবহু মেলাও, নইলে ভুল ফল।

### ৮.৫ অসম্পূর্ণ candle বাদ
চলমান (forming) candle-এর close এখনো বদলাচ্ছে। training-এ সম্পূর্ণ candle দেখেছ, লাইভেও সম্পূর্ণ candle দাও। MT5: `copy_rates_from_pos(sym, tf, 1, n)`, `start_pos=1` মানে চলমান বাদ।

### ৮.৬ ডেটা পরিষ্কার
- ভুল-scale bar (দাম হঠাৎ ১/১০০) → median থেকে ২× দূরের bar ফেলো।
- `open=0` bar ফেলো।
- duplicate index ফেলো।
- ছুটির gap, timezone মিলাও।
**নিয়ম:** মডেল চালানোর আগে ডেটার `describe()` আর `max/min return` দেখো।

### ৮.৭ Testing (কী কী test করবে)
1. Feature-এ look-ahead নেই।
2. Target শুধু ভবিষ্যৎ ব্যবহার করে।
3. **Random walk ডেটায় `has_edge=False`** (সবচেয়ে গুরুত্বপূর্ণ sanity check: noise-এ edge পেলে তোমার কোডে ফাঁক)।
4. Signal নিয়ম।
5. SL/TP যুক্তি, ডুপ্লিকেট প্রতিরোধ।
6. পুরো pipeline-এর smoke test (synthetic ডেটায়)।

---

## স্তর ৯: Advanced Concept

### ৯.১ Probability Calibration
চূড়ান্ত মডেল overconfident হলে validation অংশে **isotonic regression** বসাও: raw P → ঠিক P। scikit-learn: `CalibratedClassifierCV`।

### ৯.২ Feature importance
```python
model.feature_importances_   # কোন feature বেশি কাজে লাগছে
```
অদ্ভুত feature শীর্ষে (যেমন `dow`) = overfit/leakage-এর সন্দেহ।

### ৯.৩ Ensemble
অনেক মডেলের গড় (LightGBM + logistic regression + ভিন্ন seed)। একটার ভুল অন্যটা ঢাকে। উন্নতি সাধারণত ছোট কিন্তু স্থিতিশীল।

### ৯.৪ Meta-labeling
প্রথম মডেল দিক বলে (BUY/SELL)। **দ্বিতীয় মডেল** বলে "এই সংকেতে ট্রেড করা কি উচিত?" এতে ভুল সংকেত ছাঁটাই হয়।

### ৯.৫ Triple-barrier label
শুধু "n candle পরে বেশি?" না। দেখো TP, SL, সময়-সীমা, তিনটির কোনটা **আগে** ছুঁল। trading-এর সাথে বেশি মেলে।

### ৯.৬ Concept drift
বাজারের আচরণ বদলায় (২০২০-র নিয়ম ২০২৬-এ নাও চলতে পারে)। তাই:
- নিয়মিত retrain।
- **Champion/Challenger:** পুরনো মডেল চালু থাকে, নতুনটা shadow-এ পরীক্ষা হয়। প্রমাণ করলে বদলায়।
- Live calibration নজরে রাখো।

### ৯.৭ Execution (Phase 2)
- Order পাঠানো: MT5 `order_send`, তারপর **ফেরত ফল (retcode) যাচাই**।
- **Kill switch:** এক জায়গা থেকে সব নতুন ট্রেড বন্ধ।
- Risk নিয়ম **কোডে deterministic** থাকবে। LLM/মডেল কখনো সরাসরি account চালাবে না।
- সব ট্রেডের কারণ লিখে রাখো (explainability)।

### ৯.৮ Multiple testing সমস্যা
১০০টা strategy চেষ্টা করলে একটা **ভাগ্যে** ভালো দেখাবে। যত বেশি চেষ্টা, তত সাবধান। চূড়ান্ত পরীক্ষা এমন ডেটায় যা **কখনো তুমি দেখোনি** (hold-out)।

---

## মুখস্থ চেকলিস্ট (প্রতিবার)

**ডেটা**
- [ ] ডেটা পরিষ্কার (ভুল bar, duplicate, timezone)?
- [ ] অসম্পূর্ণ candle বাদ?

**Feature / Target**
- [ ] Feature-এ কোথাও `shift(-n)` নেই?
- [ ] বড়-timeframe/macro মান বন্ধ হওয়ার পরের?
- [ ] Target শুধু `shift(-steps)` থেকে?

**Validation**
- [ ] Walk-forward (random split না)?
- [ ] Purge gap আছে?
- [ ] Overlapping ট্রেড এড়ানো?
- [ ] Test দেখে parameter বদলাইনি?

**মূল্যায়ন**
- [ ] Baseline-এর সাথে তুলনা?
- [ ] খরচ ধরা (spread+slippage)?
- [ ] AUC অবাস্তব বেশি (০.৬৫+) হলে leakage খোঁজো।
- [ ] Calibration দেখেছ?

**ট্রেডিং**
- [ ] প্রমাণ না থাকলে WAIT?
- [ ] প্রতি ট্রেডে ঝুঁকি ≤ ১–২%?
- [ ] দৈনিক ক্ষতি-সীমা, kill switch?
- [ ] আগে demo/shadow কয়েক সপ্তাহ?

---

## সূত্র cheat sheet

```text
return           r = P_t / P_{t-1} − 1
log return       ln(P_t / P_{t-1})
SMA              গত n এর গড়
EMA              α = 2/(n+1);  EMA_t = α·P_t + (1−α)·EMA_{t−1}
MACD             EMA12 − EMA26
RSI              100 − 100/(1 + avg_up/avg_down)
True Range       max(H−L, |H−C₋₁|, |L−C₋₁|)
ATR              TR-এর n-গড়
z-score          (x − গড়) / std
Sharpe           গড়(r) / std(r) × √(বছরে-পিরিয়ড)
Drawdown         equity − সর্বোচ্চ-এ-পর্যন্ত-equity
Position size    ঝুঁকি-টাকা / (SL-দূরত্ব × পয়েন্ট-মান)
Risk:Reward      TP-দূরত্ব / SL-দূরত্ব
Break-even win%  1 / (1 + Risk:Reward)    (খরচ বাদে)
```

---

## নিজে বানানোর ধাপ (এই ক্রমে)

1. CSV থেকে দাম লোড → return, ATR, RSI বের করো।
2. Target বানাও (`shift(-n)`), baseline accuracy বের করো।
3. একটা LightGBM, **random split** দিয়ে চালাও (ভুল পদ্ধতি দেখো, ফল কত ফাঁপা)।
4. এবার **walk-forward + purge** করো। ফল কত পড়ে দেখো। এটাই শিক্ষা।
5. খরচ যোগ করো, strategy simulate করো (Sharpe, drawdown)।
6. `has_edge` ফটক বসাও, signal বানাও।
7. Shadow trading + SQLite।
8. Multi-timeframe, regime যোগ।
9. Test লেখো (বিশেষত random-walk test)।
10. MT5 জোড়ো, demo-তে shadow চালাও।
11. (পরে) risk engine, execution, kill switch।

**শেষ কথা:** লক্ষ্য "মডেল বানানো" না, লক্ষ্য **মডেলকে ভুল প্রমাণ করার চেষ্টা** করা। কিছু টিকে গেলে তবেই তাতে ভরসা।

---

# পরিশিষ্ট ক: ডেটা কোথা থেকে আসে, free নাকি paid?

**সংক্ষেপে:** এই প্রজেক্টে কোনো টাকা লাগে না। ডেটা আসে দুই জায়গা থেকে। দুটোই free, কিন্তু দুটোর চরিত্র আলাদা।

## ১. yfinance (NSE ETF ও macro ডেটা)

| বিষয় | তথ্য |
|---|---|
| **এটা কী** | একটা Python library, যা Yahoo Finance-এর **সার্বজনীন ওয়েব endpoint** থেকে ডেটা টেনে আনে |
| **খরচ** | বিনামূল্যে, API key বা account লাগে না |
| **অফিসিয়াল?** | না। Yahoo কোনো গ্যারান্টি দেয় না। যেকোনো দিন কাজ বন্ধ বা বদলে যেতে পারে |
| **ডেটা কে দেয়** | Yahoo, যারা এটা বিভিন্ন exchange থেকে পায়। কিছু বাজারে কয়েক মিনিট দেরি থাকে |
| **ইতিহাসের সীমা** | ১ মিনিট ≈ ৭ দিন, ৫/১৫ মিনিট ≈ ৬০ দিন, ১ ঘণ্টা ≈ ৭৩০ দিন, দৈনিক = সর্বোচ্চ ইতিহাস |
| **ঝুঁকি** | ভুল দাম আসে (আমরা ২০১৯ সালে ১/১০০ scale-এর ভুল bar পেয়েছি), rate limit, হঠাৎ বন্ধ |
| **ব্যবহার** | শেখা, গবেষণা, personal প্রজেক্ট। আসল টাকার live trading-এর ভিত্তি হিসেবে নয় |

যে ticker ব্যবহার হচ্ছে:

| Ticker | কী |
|---|---|
| `GOLDBEES.NS` | NSE-র gold ETF |
| `GC=F` | সোনার futures (COMEX) |
| `USDINR=X` | ডলার/টাকা |
| `DX-Y.NYB` | ডলার সূচক (DXY) |
| `^TNX` | US ১০ বছরের bond yield |
| `CL=F` | কাঁচা তেল |

**Cache:** আমরা প্রতিবার ডাউনলোড করা ডেটা `data/*.parquet` ফাইলে জমিয়ে রাখি। yfinance ৬০ দিনের বেশি intraday দেয় না, কিন্তু আমাদের cache প্রতিদিন চালালে ধীরে ধীরে লম্বা হয়।

## ২. MetaTrader 5 (XAU/USD, Exness)

| বিষয় | তথ্য |
|---|---|
| **এটা কী** | Exness-এর trading terminal। `MetaTrader5` Python package ওই terminal-এর সাথে কথা বলে |
| **খরচ** | Demo account বিনামূল্যে। ডেটার জন্য আলাদা ফি নেই |
| **ডেটা কে দেয়** | **Exness নিজে**, তাদের নিজস্ব দাম (bid/ask/spread) |
| **কেন ভালো** | তুমি ঠিক যে দামে ট্রেড করবে, backtest-এও সেই দামই। spread-ও আসল |
| **সীমা** | Windows only। MT5 terminal **চালু ও login করা** থাকতে হবে। ইতিহাসের গভীরতা broker-এর সার্ভারের ওপর নির্ভর করে |
| **Web Terminal?** | না। ব্রাউজারের Web Terminal থেকে Python connect করা যায় না, desktop MT5 লাগে |

## ৩. ডেটা কি কোথাও পাঠানো হয়?

না। সবকিছু তোমার কম্পিউটারে চলে। কোড শুধু ডেটা **আনে** (Yahoo বা Exness থেকে)। মডেল, ডেটাবেস, রিপোর্ট সবই লোকাল ফোল্ডারে (`models/`, `store/`, `data/`, `reports/`)। কোনো cloud বা AI সার্ভিসে তোমার ডেটা যায় না।

## ৪. Paid বা বিকল্প উৎস (ভবিষ্যতের জন্য)

আরও নির্ভরযোগ্য ডেটা লাগলে এগুলো দেখতে পারো। দাম ও শর্ত বদলায়, তাই কিনে ফেলার আগে তাদের সাইটে যাচাই করো।

- **Broker API:** Zerodha Kite Connect, Angel One SmartAPI (ভারতীয় শেয়ারের জন্য, real-time ও ঐতিহাসিক)
- **ডেটা সেবা:** Polygon, Twelve Data, Alpha Vantage (সাধারণত free tier সীমিত, পূর্ণ সুবিধা paid)
- **Forex/সোনার tick ডেটা:** Dukascopy (ঐতিহাসিক tick ডেটা ডাউনলোডযোগ্য), OANDA API
- **মনে রাখো:** ডেটা-উৎস বদলালেও আমাদের কোড বদলাতে হয় না। শুধু একটা নতুন `get_bars(tf)` function লিখলেই চলে (এটাই provider-এর সুবিধা)।

---

# পরিশিষ্ট খ: ব্যবহৃত Library

| Library | কী | কোথায় ব্যবহার | কাজ |
|---|---|---|---|
| **numpy** | সংখ্যার array ও গণিত | `features`, `backtest`, `regime` | `np.where`, `np.sqrt`, `np.cumsum`, `np.maximum.accumulate`, `NaN`/`inf` সামলানো |
| **pandas** | টেবিল (DataFrame) ও time-series | প্রায় সব ফাইল | `rolling`, `ewm`, `pct_change`, `shift`, `merge_asof`, `groupby`, `read_parquet` |
| **lightgbm** | gradient boosting মডেল | `models.py` | `LGBMClassifier`: শেখা (`fit`) ও সম্ভাবনা (`predict_proba`) |
| **scikit-learn** | ML সরঞ্জাম | `backtest.py` | শুধু `roc_auc_score` (AUC মাপতে)। এছাড়া `lightgbm` ভেতরে এর ওপর নির্ভর করে |
| **joblib** | Python object ফাইলে সেভ | `models.py` | মডেল + meta `.joblib` ফাইলে `dump`/`load` (scikit-learn-এর সাথে আসে) |
| **yfinance** | Yahoo ডেটা | `nse_etf/yf_data.py` | `Ticker(sym).history(...)` |
| **MetaTrader5** | MT5 terminal সংযোগ | `xauusd/mt5_data.py` | `initialize`, `symbol_select`, `copy_rates_from_pos`, `symbol_info_tick` |
| **pyarrow** | parquet ফাইল ফরম্যাট | cache (`data/*.parquet`) | pandas-এর `to_parquet`/`read_parquet`-এর পেছনের ইঞ্জিন |
| **pyyaml** | YAML পড়া | `run.py`, `app.py` | `yaml.safe_load` দিয়ে `config.yaml` |
| **python-dotenv** | `.env` ফাইল পড়া | `mt5_data.py` | login তথ্য (secret) কোড থেকে আলাদা রাখা |
| **streamlit** | ওয়েব dashboard | `app.py` | কয়েক লাইনে টেবিল, chart, metric |
| **pytest** | স্বয়ংক্রিয় test | `tests/` | `python -m pytest` |
| **sqlite3** (Python-এর ভেতরেই) | হালকা ডেটাবেস | `store.py`, `shadow.py` | `predictions`, `shadow_trades` টেবিল |
| **argparse** (ভেতরেই) | কমান্ড-লাইন আর্গুমেন্ট | `run.py` | `python run.py xauusd train` |
| **functools.lru_cache** (ভেতরেই) | ফল মনে রাখা | `run.py` | একই timeframe দুবার ডাউনলোড না করা |
| **pathlib, json, datetime** (ভেতরেই) | ফাইল পথ, JSON, সময় | বিভিন্ন | ফাইল পড়া/লেখা, রিপোর্ট সেভ, সময়চিহ্ন |

**কোনটা না বুঝলেও চলে, কোনটা বুঝতেই হবে:** `pandas` আর `lightgbm` গভীরভাবে শেখো। বাকিগুলো দরকার পড়লে docs দেখে ব্যবহার করা যায়।

---

# পরিশিষ্ট গ: কোন function কী করে (ফাইল ধরে)

## `run.py`
| Function | কাজ |
|---|---|
| `load_config()` | `config.yaml` পড়ে dict ফেরত দেয় |
| `providers(name, cfg)` | instrument-এর source (mt5/yfinance) অনুযায়ী `get_bars` আর `get_drivers` function ফেরত দেয় |
| `show(results)` | পূর্বাভাসের ফল টার্মিনালে সুন্দর করে ছাপে |
| `main()` | কমান্ড পড়ে `train`/`predict`/`update`/`loop` চালায় |
| `run_once(command)` | একবার চালানোর সময় ডাউনলোড cache করে (`lru_cache`) |

## `core/features.py`
| Function | কাজ |
|---|---|
| `_rsi(c, n)` | RSI (০–১০০) বের করে |
| `atr(df, n)` | Average True Range বের করে |
| `htf_features(df, tf)` | বড় timeframe-এর trend/RSI/ATR বের করে, candle **বন্ধ হওয়ার সময়ের** চিহ্ন দিয়ে (leakage ঠেকাতে) |
| `build_features(df, tf, htf, drivers)` | সব feature একসাথে বানায়: return, volatility, RSI, MACD, MA gap, সময়, spread/volume z-score, higher-timeframe, macro, regime |
| `make_target(df, steps)` | `steps` candle পরের return ও ↑/↓ label (০/১) বানায় |

## `core/regime.py`
| Function | কাজ |
|---|---|
| `compute_regime(df, f)` | প্রতিটা candle-কে TRENDING/RANGING/HIGH_VOL/LOW_VOL/BREAKOUT/ABNORMAL লেবেল দেয় |
| `regime_code(regime)` | লেবেলকে সংখ্যায় বদলায় (মডেলের জন্য) |

## `core/models.py`
| Function | কাজ |
|---|---|
| `new_model()` | নির্দিষ্ট parameter-সহ নতুন LightGBM মডেল বানায় |
| `fit(X, y)` | মডেল শেখায় |
| `save_model(path, model, meta)` | মডেল + meta (feature তালিকা, backtest ফল, version) ফাইলে রাখে |
| `load_model(path)` | সেভ করা মডেল ফেরত আনে (না থাকলে `None`) |

## `core/backtest.py`
| Function | কাজ |
|---|---|
| `walk_forward(X, y, steps)` | অতীতে শিখে ভবিষ্যতে পরীক্ষা, ৫ ধাপে। purge gap সহ। out-of-sample P(up) ফেরত দেয় |
| `calibration_table(p, y)` | P-কে ঝুড়িতে ভাগ করে "পূর্বাভাস বনাম আসল হার" দেখায় |
| `evaluate(oof, fwd_ret, ...)` | AUC, accuracy, baseline, strategy return, Sharpe, drawdown বের করে এবং `has_edge` ঠিক করে |

## `core/signal.py`
| Function | কাজ |
|---|---|
| `decide(p_up, has_edge, regime, thr)` | BUY/SELL/WAIT আর কারণ ফেরত দেয় |

## `core/shadow.py`
| Function | কাজ |
|---|---|
| `open_trade(...)` | BUY/SELL হলে ভার্চুয়াল ট্রেড খোলে, ATR দিয়ে SL/TP বসায় |
| `_pos(bars, ts)` | candle-এর অবস্থান (index) খোঁজে |
| `update_trades(...)` | খোলা ট্রেড SL/TP/মেয়াদে বন্ধ করে, লাভ-ক্ষতি হিসাব করে |
| `resolve_predictions(...)` | পূর্বাভাসের পর আসলে কী হলো, লিখে রাখে (calibration-এর জন্য) |

## `core/store.py`
| Function | কাজ |
|---|---|
| `connect(path)` | SQLite খোলে, টেবিল না থাকলে বানায় |
| `log_prediction(conn, rec)` | পূর্বাভাস সেভ করে; একই candle-এর ডুপ্লিকেট হলে `None` |

## `core/pipeline.py`
| Function | কাজ |
|---|---|
| `_core_cols(X)` | যে feature অবশ্যই থাকতে হবে তাদের তালিকা (macro/higher-timeframe বাদে) |
| `_features(...)` | bars আনে, সব feature বানায় |
| `_periods_per_year(...)` | বছরে কত candle (Sharpe-এর জন্য) |
| `train(...)` | প্রতি horizon: feature → backtest → চূড়ান্ত মডেল → সেভ → রিপোর্ট |
| `predict(...)` | সর্বশেষ candle-এ P(up) → signal → ডেটাবেসে লগ → shadow ট্রেড |
| `update(...)` | shadow ট্রেড ও পূর্বাভাসের ফল হালনাগাদ |

## ডেটা মডিউল
| Function | কাজ |
|---|---|
| `mt5_data.connect()` | চলমান MT5-তে সংযোগ (দরকারে `.env` দিয়ে login) |
| `mt5_data.get_bars(symbol, tf, n)` | শেষ n সম্পূর্ণ candle (চলমানটা বাদ) |
| `mt5_data.current_tick(symbol)` | এখনকার bid/ask/spread (এখনো কোথাও ব্যবহার হয়নি) |
| `yf_data.sanitize(df)` | ভুল-scale ও `open=0` bar ছেঁকে ফেলে |
| `yf_data.get_bars(symbol, tf, data_dir)` | yfinance থেকে ডেটা এনে cache-এ জোড়ে, অসম্পূর্ণ candle বাদ দেয় |
| `yf_data.get_drivers(drivers_cfg)` | DXY, USDINR, তেল ইত্যাদির daily ডেটা আনে |

## `app.py`
Streamlit পেজ: সর্বশেষ signal, backtest টেবিল, calibration chart, shadow ট্রেড ও লাইভ calibration দেখায়। শুধু পড়ে, কিছু চালায় না।

## `tests/test_core.py`
| Test | কী যাচাই করে |
|---|---|
| `test_no_lookahead_in_features` | feature-এ ভবিষ্যৎ ঢোকেনি |
| `test_target_uses_future_only` | target ঠিক `steps` পরের দাম থেকে |
| `test_random_walk_has_no_edge` | এলোমেলো ডেটায় edge পাওয়া যায় না |
| `test_signal_waits_without_edge_or_when_abnormal` | signal নিয়ম |
| `test_pipeline_smoke_with_htf` | XAU-ধাঁচের পুরো pipeline চলে |
| `test_shadow_sl_tp_logic` | SL/TP ও ডুপ্লিকেট প্রতিরোধ |

---

# পরিশিষ্ট ঘ: ML মডেল কোথায়, কীভাবে, কী কাজে

## ১. এই প্রজেক্টে কয়টা ML মডেল?

**একটাই ধরন: LightGBM (`LGBMClassifier`)।** বাকি অংশ সাধারণ নিয়ম, ML না।

| অংশ | ML? | কী |
|---|---|---|
| **LightGBM মডেল** | হ্যাঁ | feature দেখে P(up) বলে |
| Baseline | না | training-এ ↑ হওয়ার গড় হার (একটা সংখ্যা, `base_p`) |
| Regime detector (`regime.py`) | না | হাতে লেখা নিয়ম (ATR, trend, breakout) |
| Signal (`signal.py`) | না | threshold নিয়ম (০.৫৫/০.৪৫) |
| SL/TP, shadow | না | সাধারণ গণিত |

**মডেলের সংখ্যা:** প্রতিটা instrument-এর ৪টা horizon (৩০m, ১h, ১d, ১w), প্রতিটার জন্য **আলাদা** মডেল। তিন instrument মিলিয়ে সর্বোচ্চ ১২টা। এখন ট্রেন করা আছে `xauusd_yf` আর `nse_etf`, মানে ৮টা `.joblib` ফাইল `models/` ফোল্ডারে।

## ২. মডেল কী কাজ করে?

**প্রশ্ন:** "এখনকার feature দেখে, আগামী `steps` candle পরে দাম কি এখনকার চেয়ে বেশি হবে?"
**উত্তর:** ০ থেকে ১-এর মধ্যে একটা সংখ্যা, P(up)।

- `P(up) = 0.62` মানে "মডেলের হিসাবে ৬২% সম্ভাবনা দাম বাড়বে"।
- মডেল BUY/SELL বলে না। সেটা `signal.decide` ঠিক করে।
- **Input (X):** একটা সারি, ~৩০টা সংখ্যা (return, RSI, ATR, regime_code...)।
- **Output:** একটা সংখ্যা (P)।

## ৩. কোথায় কোন কোড মডেল ডাকে? (চারটা জায়গা)

### (ক) মডেল বানানো: `core/models.py`
```python
def new_model():
    return lgb.LGBMClassifier(n_estimators=200, learning_rate=0.03, num_leaves=15, ...)

def fit(X, y):
    m = new_model()
    m.fit(X, y.astype(int))     # ← এখানে শেখে
    return m
```
`fit` মানে: X (feature) আর y (আসল ফল ০/১) দেখে নিয়ম শেখা।

### (খ) Backtest-এ ৫ বার: `core/backtest.py → walk_forward`
```python
model = fit(X.iloc[:tr_end], y.iloc[:tr_end])        # অতীতে শেখা
p = model.predict_proba(X.iloc[a:b])[:, 1]           # ভবিষ্যৎ অংশে P(up)
```
- প্রতি fold-এ **নতুন, আলাদা** মডেল। ৫ fold = ৫টা অস্থায়ী মডেল।
- এই মডেলগুলো সেভ হয় না। কাজ শেষে ফেলে দেওয়া হয়।
- উদ্দেশ্য: সৎভাবে জানা "এই পদ্ধতি অজানা ডেটায় কেমন চলে?"

### (গ) চূড়ান্ত মডেল সেভ: `core/pipeline.py → train`
```python
oof     = walk_forward(X, y, steps)       # ১. সৎ পরীক্ষা (৫টা অস্থায়ী মডেল)
metrics = evaluate(oof, ...)              # ২. ফল মাপা → has_edge?
model   = fit(X, y)                       # ৩. পুরো ডেটায় চূড়ান্ত মডেল
save_model(".../xauusd_1h.joblib", model, meta)   # ৪. ফাইলে রাখা
```
**ক্রম মনে রাখো:** আগে পরীক্ষা, পরে চূড়ান্ত মডেল। চূড়ান্ত মডেল পুরো ডেটা দেখে ফেলেছে, তাই তাকে দিয়ে নিজেকে পরীক্ষা করা যায় না। পরীক্ষা হয় শুধু (খ)-এর মডেল দিয়ে।

### (ঘ) লাইভ পূর্বাভাস: `core/pipeline.py → predict`
```python
saved = load_model("models/xauusd_1h.joblib")         # সেভ করা মডেল
row   = X.iloc[[-1]].reindex(columns=meta["features"])  # সর্বশেষ candle
p_up  = saved["model"].predict_proba(row)[0, 1]       # P(up)
signal, reason = decide(p_up, has_edge, regime, thr)  # নিয়ম দিয়ে BUY/SELL/WAIT
```
এখানে মডেল **শেখে না**, শুধু একটা সারি পড়ে P বলে।

## ৪. `fit` আর `predict_proba`-র ভেতরে কী ঘটে?

### `fit` (শেখা), Gradient Boosting
```text
শুরু:  প্রতিটা সারির অনুমান = সাধারণ গড় (যেমন ৫০%)
ধাপ ১: ভুল (আসল − অনুমান) বের করো → একটা ছোট tree বানাও যা এই ভুল কমায়
ধাপ ২: অনুমান আপডেট = পুরনো + learning_rate × tree-র সংশোধন
ধাপ ৩: নতুন ভুল বের করো → আরেকটা tree
... এভাবে ২০০ বার (n_estimators=200)
```
- প্রতিটা tree **ছোট** (`num_leaves=15`) আর সংশোধন **ধীর** (`learning_rate=0.03`)। এতে একটা tree-র ভুল পুরো মডেলকে নষ্ট করতে পারে না।
- প্রতিটা tree random ৮০% সারি ও ৮০% feature দেখে (`subsample`, `colsample_bytree`), যাতে সব tree একই জিনিস মুখস্থ না করে।
- `reg_lambda=5`: বড় সংশোধনে জরিমানা।

### একটা tree দেখতে কেমন
```text
RSI > 62 ?
├─ হ্যাঁ → ATR% > 0.4% ?
│          ├─ হ্যাঁ → পাতা: +0.08   (ভুল-সংশোধন)
│          └─ না   → পাতা: −0.02
└─ না   → MACD_hist > 0 ?
           ├─ হ্যাঁ → পাতা: +0.03
           └─ না   → পাতা: −0.05
```
প্রশ্নগুলো মডেল নিজে ডেটা থেকে বের করে। আমরা শুধু feature আর parameter দিই।

### `predict_proba` (পূর্বাভাস)
```text
score = গড় + (tree1-র পাতা) + (tree2-র পাতা) + ... + (tree200-র পাতা)
P(up) = 1 / (1 + e^(−score))        ← sigmoid, score-কে ০–১ সংখ্যায় বদলায়
```
`predict_proba(row)` দেয় `[[P(down), P(up)]]`। তাই কোডে `[0, 1]` মানে "প্রথম সারি, P(up)"।

## ৫. মডেলের ফাইলে কী থাকে?

`models/nse_etf_1h.joblib`-এর ভেতরে:
```python
{
  "model": <LGBMClassifier>,          # ২০০টা tree
  "meta": {
     "version": "nse_etf_1h_20261003",
     "features": [...],               # কোন কোন feature, কোন ক্রমে
     "metrics": {...,"has_edge": False},   # backtest ফল
     "horizon": {...}
  }
}
```
**`features`-এর ক্রম কেন জরুরি:** মডেল কলামের **নাম** না, **অবস্থান** মনে রাখে। `predict`-এ তাই `reindex(columns=meta["features"])` দিয়ে training-এর ক্রম মেলানো হয়। না মেলালে চুপচাপ ভুল ফল আসে।

## ৬. মডেল আসলে কতটা ভালো?

বর্তমান ফল (backtest): কোনো horizon-ই baseline হারাতে পারেনি, AUC ≈ ০.৪৯–০.৫২। মানে মডেল প্রায় পাশা ছোঁড়ার মতো। তাই `has_edge=False` আর সব signal WAIT।

**এটা ব্যর্থতা না, সিস্টেম ঠিকমতো কাজ করছে:** প্রমাণ ছাড়া ট্রেড করতে বলছে না।

## ৭. নিজে পরীক্ষা করে দেখো (১০ লাইন)

```python
import yaml, pandas as pd
from nse_etf import yf_data
from core.features import build_features, make_target
from core.models import fit

df = yf_data.get_bars("GOLDBEES.NS", "D1")
X  = build_features(df, "D1")
y, fwd = make_target(df, 1)
ok = y.notna() & X.notna().all(axis=1)
X, y = X[ok], y[ok]

model = fit(X.iloc[:-500], y.iloc[:-500])           # শেষ ৫০০ দিন বাদে শেখাও
p = model.predict_proba(X.iloc[-500:])[:, 1]        # শেষ ৫০০ দিনে পরীক্ষা
print("গড় P(up):", p.mean(), " আসল ↑ হার:", y.iloc[-500:].mean())

imp = pd.Series(model.feature_importances_, index=X.columns).sort_values()
print(imp.tail(8))       # কোন feature সবচেয়ে বেশি কাজে লেগেছে
```
**শেখার জিনিস:** `feature_importances_` দেখে বোঝো মডেল কী ধরছে। অদ্ভুত feature শীর্ষে থাকলে সন্দেহ করো (overfit বা leakage)।

## ৮. ভবিষ্যতে আরও মডেল যোগ করলে

| মডেল | কাজ | কোথায় বসবে |
|---|---|---|
| Logistic Regression | সরল তুলনা-মডেল (LightGBM-কে হারাতে পারে কিনা দেখতে) | `models.py`-এ নতুন `new_model` বিকল্প |
| Calibration (isotonic) | P-কে বাস্তবের সাথে মেলানো | `fit`-এর পর validation অংশে |
| Ensemble | কয়েকটা মডেলের P-এর গড় | `predict`-এ |
| Meta-label মডেল | "এই signal-এ ট্রেড করা কি উচিত?" | signal-এর পরে |
| Regime-ভিত্তিক মডেল | প্রতি regime-এ আলাদা মডেল | `train`-এ regime ধরে ভাগ |
