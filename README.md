# Gold Predictor

Can a model tell whether gold will be higher or lower 30 minutes, 1 hour, 1 day or 1 week from now, well enough to trade on?

I built a small pipeline to test that honestly, plus a website that shows the result in plain language. **Short answer from the data I have: no.** None of the four horizons beat plain guessing once the model is tested on data it never saw and trading costs are included. The system is built so that this outcome is the default: a time window only shows Buy or Sell if it passes the tests, otherwise it says Wait.

*Statistical research tool. Not financial advice. Results are as of 5 October 2026 and change as data grows.*

## Contents
[Result](#result) · [Data](#data) · [Method](#method) · [Reading the numbers](#reading-the-numbers) · [Limitations](#limitations) · [System](#system) · [Reproduce](#reproduce) · [Layout](#layout)

## Result

Out-of-sample results from walk-forward testing, which uses the last 60% of each series. "Guess" is the accuracy of always predicting whichever direction was more common in the training data.

| Series | Horizon | Test bars | AUC | Accuracy | Guess | Trades | Net return* | Buy & hold* | Long share |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gold futures (GC=F) | 30 min | 8,279 | 0.508 | 50.4% | 51.1% | 854 | -19.2% | -10.5% | 56% |
| | 1 hour | 8,276 | 0.498 | 49.9% | 49.6% | 483 | -17.5% | -10.4% | 55% |
| | 1 day | 3,899 | 0.510 | 51.4% | 52.0% | 2,312 | +45.3% | +129.6% | 76% |
| | 1 week | 3,897 | 0.489 | 51.7% | 54.4% | 559 | +31.1% | +131.1% | 78% |
| Gold ETF (GOLDBEES.NS) | 30 min | 855 | 0.515 | 52.5% | 50.5% | 319 | -17.7% | -2.3% | 61% |
| | 1 hour | 854 | 0.487 | 49.2% | 47.2% | 167 | -17.3% | -2.3% | 62% |
| | 1 day | 2,280 | 0.518 | 52.3% | 52.4% | 1,408 | -37.2% | +169.5% | 55% |
| | 1 week | 2,278 | 0.485 | 49.6% | 56.5% | 321 | +23.3% | +168.1% | 56% |

\* Sum of the per-trade returns (not compounded), after costs for the model; "Buy & hold" is the same sum for holding on every sampled bar, before costs. A trade is taken only when the model's probability is above 55% or below 45%.

None of the eight rows passes the gate described below, so all eight are Wait.

## Data

- **Gold futures (GC=F)** and **NSE gold ETF (GOLDBEES.NS)** from Yahoo Finance through `yfinance`. Daily history runs from 2000 (futures) and 2009 (ETF). Intraday history is short: about ten weeks of 5-minute bars for the futures (from late July 2026) and about twelve weeks of 15-minute bars for the ETF. That is a hard limit of the free source, so the intraday rows rest on very little data.
- **Drivers** for the daily models, lagged one day to avoid look-ahead: US dollar index, USD/INR, US 10-year yield, crude oil, and gold futures (as an input for the ETF).
- **Cleaning.** Yahoo returned a few bad bars. Two days in December 2019 appeared at one hundredth of the true price, and the ETF's earliest rows have an open of 0. Bars far from the local median are dropped before anything else runs.

## Method

- **Target:** is the close `n` bars ahead higher than now? Horizons: 6 and 12 five-minute bars (or 2 and 4 fifteen-minute bars for the ETF), 1 and 5 daily bars.
- **Features:** returns over several windows, volatility, ATR, RSI, MACD, distance from moving averages, position in the 20-bar range, candle shape, time of day, spread and volume z-scores where available, higher-timeframe trend (H1, H4), the daily drivers, and a rule-based market regime (trending, ranging, high or low volatility, breakout, abnormal).
- **Model:** LightGBM classifier, small and heavily regularised (200 trees, 15 leaves, learning rate 0.03). One fixed configuration for every horizon. I did not tune hyper-parameters, because tuning on the test data is how you fool yourself.
- **Validation:** expanding-window walk-forward in five folds, always training on the past and testing on the future. A gap of `n` bars between the training and test windows keeps overlapping labels from leaking across. Features are computed so that a bar never sees later data; a test cuts the series, recomputes, and checks the earlier rows are identical.
- **Costs:** a flat round-trip cost per trade (1.5 bp for the futures, 5 bp for the ETF).
- **The gate.** A horizon is allowed to show Buy or Sell only if all of these hold: AUC of at least 0.52, accuracy at least 0.5 points above the "guess" baseline, positive net return, and at least 30 trades. These numbers are my own judgement, set before the first backtest, not derived statistically. If any fails, the signal is Wait.
- **Sanity check.** A test feeds the pipeline a pure random walk and requires that it finds no edge. A pipeline that "finds" skill in noise has a bug.

## Reading the numbers

- **AUC** is 0.5 for guessing. Every row sits between 0.485 and 0.518. I did not compute confidence intervals, but with a few thousand overlapping samples differences this small are well inside the noise, so I read them as "no signal", not as "slightly good".
- **The positive daily and weekly returns are not skill.** The models leaned long 55-78% of the time, and gold rose strongly over the test period. Holding on every bar earned far more (for example +129.6% against +45.3% for the futures at 1 day), and the ETF's 1-day model lost money while the same period was a large gain for holding. Positive net return is only one of the four gate conditions for this reason.
- **Intraday results are negative after costs.** Moves over 30 or 60 minutes are small next to the cost of trading them, which is the usual reason short-horizon prediction is hard.
- **Probabilities from the saved models should not be trusted** where the gate fails. The final models are fitted on all data, so on small intraday samples they can output confident-looking numbers (the ETF's 30-minute model sometimes shows around 80%). The site never shows a probability as advice for those windows.

## Limitations

- One model family, one configuration, one source of free data. A different design, better data or other features could change the answer. This repository shows that this particular approach did not work, not that gold is unpredictable.
- Yahoo data is unofficial and can be late, wrong or missing. GC=F is a continuous futures series, so it carries roll gaps, and the ETF is not spot gold.
- Overlapping labels are only partly handled by the purge gap, and the strategy test samples one trade every `n` bars to avoid counting the same move twice.
- The cost model is a flat guess. Real spreads widen around news.
- Practice (virtual) trading started on 3 October 2026. No signal has passed the gate, so it has not opened a trade yet and says nothing about live performance.
- Exness / MetaTrader 5 support is written (`xauusd/`) but switched off, because it needs a Windows machine with the terminal running and could not be tested against a live account.

## System

```text
GitHub Actions (every 15 min)  ->  Neon Postgres  <-  Cloudflare Workers (website + API)
   Python, LightGBM                predictions,          sign-in by Cloudflare Access (email code)
   predict.yml / train.yml         models, candles
```

The Python jobs write to the database; the Next.js site only reads it. The site is in English and Bengali, shows one card per time window with the reason in plain words, a price chart, a history table and the practice-trade results, and can send Telegram or email alerts for new Buy/Sell signals. Every API call checks the signed Cloudflare Access token itself, so the data stays private even if the raw `workers.dev` address is reached.

GitHub's scheduler is best-effort: runs can start 5-15 minutes late and an occasional one is skipped, and GitHub pauses schedules after 60 days without repository activity. This is a near-real-time tool, not a tick-by-tick one; predictions change when a price bar closes.

Setup, step by step: [docs/DEPLOY.md](docs/DEPLOY.md) (English) and [docs/DEPLOY_bn.md](docs/DEPLOY_bn.md) (Bengali).

## Reproduce

```bash
pip install -r requirements.txt
python run.py all init-db        # SQLite at store/predictor.db unless DATABASE_URL is set
python run.py all train          # walk-forward backtest and save models (a few minutes)
python run.py all tick           # one prediction cycle
streamlit run app.py             # local dashboard
python -m pytest tests           # also set PGLITE_WORK_DIR to test against a real Postgres engine (see tests/conftest.py)
```

The table above comes from `python run.py all train`. Numbers move slightly each time because the free data source keeps adding bars.

## Layout

- `core/`: features, regime rules, LightGBM model, backtest, signal rules, practice trading, database layer, alerts
- `nse_etf/yf_data.py`, `xauusd/mt5_data.py`: price sources
- `config.yaml`: instruments, horizons, thresholds, costs
- `web/`: the website (Next.js on Cloudflare Workers); `.github/workflows/`: schedules, tests, deploy
- `docs/study_guide_bn.md`: a Bengali study guide to the concepts behind the system

## License

MIT, see [LICENSE](LICENSE).
