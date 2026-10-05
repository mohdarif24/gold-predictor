# Gold Predictor

Can a model tell whether gold will be higher or lower 30 minutes, 1 hour, 1 day or 1 week from now, well enough to trade on?

I built a pipeline to test that honestly, with as many inputs and models as I could reasonably add, plus a website that shows the result in plain language. **Short answer from the data I have: no.** After adding technical indicators, 18 market series, positioning data, calendar effects and eight model families, none of the eight series-and-horizon combinations beat plain guessing on a locked test set. The system is built so that this outcome is the default: a time window only shows Buy or Sell if it passes the tests, otherwise it says Wait. The site's "What moves gold" screen is still useful without a forecast, because it shows what the model looked at and how it did.

*Statistical research tool. Not financial advice. Results are as of 6 October 2026 and change as data grows.*

## Contents
[Result](#result) · [Inputs](#inputs) · [Models](#models) · [Protocol](#protocol) · [Reading the numbers](#reading-the-numbers) · [Limitations](#limitations) · [System](#system) · [Reproduce](#reproduce) · [Layout](#layout)

## Result

The last 20% of each series was locked away. One model and input set per row was chosen using only the earlier 80%, then tested once on the locked part, retraining as it unfolds as it would live. "Guess" is the accuracy of always predicting whichever direction was more common in the training data.

| Series | Horizon | Chosen on older data | Hold-out bars | AUC (95% range) | Accuracy | Guess | Net return* | Buy & hold* | Long share | Verdict |
|---|---|---|---:|---|---:|---:|---:|---:|---:|---|
| Gold futures (GC=F) | 30 min | core + et | 2,769 | 0.463 (0.427 to 0.502) | 48.0% | 52.6% | -1.3% | -5.0% | 45% | no edge |
|  | 1 hour | tech+ + lgbm | 2,768 | 0.492 (0.439 to 0.540) | 49.3% | 51.3% | -5.5% | -4.9% | 40% | no edge |
|  | 1 day | tech+ + lgbm | 1,300 | 0.530 (0.499 to 0.561) | 54.0% | 54.1% | +24.6% | +92.4% | 68% | no edge |
|  | 1 week | core + et | 1,299 | 0.486 (0.438 to 0.543) | 58.6% | 57.4% | +31.9% | +91.9% | 100% | no edge |
| Gold ETF (GOLDBEES.NS) | 30 min | flow + lgbm | 285 | 0.510 (0.424 to 0.599) | 54.4% | 50.9% | -5.4% | -2.3% | 56% | no edge |
|  | 1 hour | tech+ + lstm | 285 | 0.411 (0.328 to 0.535) | 45.3% | 40.4% | -4.1% | -2.0% | 42% | no edge |
|  | 1 day | flow + xgb | 755 | 0.525 (0.481 to 0.559) | 52.6% | 55.0% | +35.8% | +95.9% | 64% | no edge |
|  | 1 week | tech+ + rf | 754 | 0.507 (0.426 to 0.583) | 55.3% | 60.1% | +52.0% | +94.2% | 93% | no edge |

\* Sum of per-trade returns (not compounded) after costs; "Buy & hold" is the same sum for holding on every sampled bar, before costs. A trade is taken only when the model's probability is above 55% or below 45%. The input sets are explained under [Inputs](#inputs); `et` is extra-trees, `lgbm` LightGBM, `xgb` XGBoost, `rf` random forest.

Every row fails the gate described under [Protocol](#protocol), so all eight are Wait. The closest cases are the futures at 1 day (AUC range 0.499 to 0.561, accuracy equal to guessing) and the ETF at 1 day.

## Inputs

| Family | What it contains | Where it comes from |
|---|---|---|
| Price behaviour | returns, volatility, ATR, RSI, MACD, moving-average gaps, position in the 20-bar range, candle size, time of day, higher-timeframe trend, a rule-based market regime | the price series |
| Chart indicators | Bollinger bands, stochastic, ADX and directional index, CCI, skew and kurtosis of returns, opening gap, distance from the 1-year high and low, volume trend, five candle patterns | the price series |
| Dollar, rates and markets | dollar index, USD/INR, EUR/USD, USD/JPY, USD/CNY, US 3-month, 5-year, 10-year and 30-year yields, inflation-protected and long bonds, silver, copper, gold miners, VIX, S&P 500, oil, plus ratios and yield-curve slopes | Yahoo Finance (`yfinance`), lagged one day |
| Big investors' positions | hedge funds' and producers' net position in gold futures, its 4-week change and its 3-year percentile | CFTC weekly report, treated as known from the Saturday after the Tuesday it describes |
| Calendar | days to the US jobs report, options expiry, month and quarter end, holidays, season of the year | computed |
| News mood | tone of recent gold and economy headlines | Google News RSS, read by keyword rules or an optional AI model |

News and the economic calendar are shown on the site, and the news mood becomes a model input only after months of history exist, because it cannot be reconstructed for the past. Until then models see it as missing. Every input carries the date it became public, and a test checks that features never see later rows.

## Models

Single models: LightGBM, XGBoost, random forest, extra-trees, elastic-net logistic regression, ridge logistic regression, a small neural network (MLP) and an LSTM. Combinations: an average of five, a stacked ensemble in which a linear model learns how to weigh them, and a meta-labeling model that estimates how often the first model's calls are right, so low-confidence calls can be skipped. All are small and heavily regularised, with one fixed configuration each. I did not tune hyper-parameters on test data.

## Protocol

1. The last 20% of every series is the **hold-out** and nothing before step 4 reads it. A test flips every hold-out label and checks the development scores do not change.
2. On the first 80%, every candidate (a model and an input set) is scored by walk-forward testing. Stage A compares all models on one input set; stage B tries the other input sets with the best models. That is 18 candidates per series and horizon.
3. The single best development candidate is picked. Picking the best of 18 is optimistic by construction, so its score is reported as such and never used as evidence.
4. That one candidate is tested **once** on the hold-out, retraining as the hold-out unfolds. Uncertainty comes from a block bootstrap, because neighbouring rows share the same future price move.
5. The gate: the 95% range of AUC must lie entirely above 0.5, accuracy must beat guessing by at least a point, return after costs must be positive, and there must be enough trades. These thresholds are my own judgement, set before the first backtest. If any check fails the signal is Wait.

Two tests guard the procedure itself: a pure random walk must never get an edge, and a planted signal must be found. Both pass.

## Reading the numbers

- **AUC** is 0.5 for guessing. Every hold-out range includes 0.5 or sits at its edge. Six of the eight point estimates are within 0.03 of 0.5. The other two are below it (0.463 for the futures at 30 minutes and 0.411 for the ETF at 1 hour, the latter on only 285 bars).
- **The positive daily and weekly returns are not skill.** The models leaned long 64-100% of the time and gold rose strongly. Holding on every bar earned far more (for example +92.4% against +24.6% for the futures at 1 day).
- **Confidence is not reliability.** The ETF's 1-hour model said it was at least 80% sure 72 times and was right in 36% of them. The 30-minute ETF model said it 6 times and was right in none. The futures' 1-hour model said it 4 times and was right each time, which is too few to mean anything. No model reached anything close to 80% accuracy overall.
- **Keeping only the most confident calls did not fix it.** The top 10% scored between 25% and 61% depending on the row, on 29 to 277 cases each, with no consistent gain.
- **Intraday results are negative after costs.** Moves over 30 or 60 minutes are small next to the cost of trading them.
- Probabilities from the saved models should not be trusted where the gate fails. The site shows what drove each reading, but a reading explained is not a reading proved.

## Limitations

- One source of free data and a modest number of years. A different design, paid data or other inputs could change the answer. This repository shows that this approach did not work, not that gold is unpredictable.
- Intraday history from Yahoo is short (about ten weeks of 5-minute bars, twelve of 15-minute bars), so the intraday rows rest on little data and their ranges are wide.
- Yahoo data is unofficial and can be late, wrong or missing. GC=F is a continuous futures series with roll gaps, and the ETF is not spot gold.
- The cost model is a flat guess. Real spreads widen around news.
- News headlines are read automatically and can be wrong. The optional AI-model reader was not run against a live provider in testing; the rules reader was.
- Practice trading started on 3 October 2026. No signal has passed the gate, so it has opened no trade.
- Exness / MetaTrader 5 support is written (`xauusd/`) but switched off, because it needs a Windows machine with the terminal and could not be tested against a live account.

## System

```text
GitHub Actions (every 15 min)  ->  Neon Postgres  <-  Cloudflare Workers (website + API)
   Python: predict.yml, train.yml,  predictions, models,    sign-in by Cloudflare Access (email code)
   research.yml (monthly study)     research, news, candles
```

The Python jobs write to the database; the Next.js site only reads it. The site is in English and Bengali and has: a card per time window with the reason in plain words, a **What moves gold** screen (model accuracy with its range, how much of the reading comes from the latest data versus background, what each family of inputs is pushing, the biggest single inputs, how reliable confident calls were, and the live state of every market input with the reason it matters), **News & events**, a price chart, history, practice-trade results, and Telegram or email alerts for new Buy/Sell signals. Every API call checks the signed Cloudflare Access token itself.

GitHub's scheduler is best-effort: runs can start 5-15 minutes late and an occasional one is skipped, and GitHub pauses schedules after 60 days without repository activity. This is a near-real-time tool, not a tick-by-tick one.

Setup, step by step: [docs/DEPLOY.md](docs/DEPLOY.md) (English) and [docs/DEPLOY_bn.md](docs/DEPLOY_bn.md) (Bengali), or run `scripts/setup.ps1`.

## Reproduce

```bash
pip install -r requirements.txt
python run.py all init-db        # SQLite at store/predictor.db unless DATABASE_URL is set
python -m research.study all     # the locked hold-out study (a long run; add --quick for a smoke test)
python run.py all train          # retrain live models using the study's choices
python run.py all tick           # one prediction cycle, plus news and calendar
python scripts/readme_table.py   # prints the results table above from the database
python -m pytest tests           # also set PGLITE_WORK_DIR to test against a real Postgres engine (see tests/conftest.py)
```

Numbers move slightly each time because the free data source keeps adding bars.

## Layout

- `core/`: features, regime rules, models, backtest, signal rules, practice trading, explanations, news, database layer, alerts
- `research/study.py`: the locked hold-out study
- `nse_etf/yf_data.py`, `xauusd/mt5_data.py`: price sources
- `config.yaml`: instruments, horizons, thresholds, costs, market inputs
- `web/`: the website (Next.js on Cloudflare Workers); `.github/workflows/`: schedules, study, tests, deploy
- `docs/study_guide_bn.md`: a Bengali study guide to the concepts behind the system

## License

MIT, see [LICENSE](LICENSE).
