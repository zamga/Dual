# AI stock-picking engine: method, evidence, data and track record (research brief, 28 Sep 2026)

## Verification status (read first)
- **Live web research could not be done in this run.** The session's WebSearch budget (200 of 200) was already used up before this task started. WebFetch was egress-blocked for every domain I tried: arxiv.org, polygon.io, site.financialmodelingprep.com, alphavantage.co, eodhd.com, tiingo.com and jkpfactors.com.
- **Two tools did work:** GitHub repository search, and local computation for the simulations in sections 5 and 6.
- **Legend:**
  - **(V)** = verified live in this run.
  - **(R)** = a published, peer-reviewed or working-paper result recalled from reference knowledge (to mid-2026). The canonical DOI or SSRN/arXiv link is given, but the page was not re-fetched this run.
  - **UNVERIFIED** = volatile or uncertain. This covers all prices, licensing terms, events in 2025-26, and any exact figure I am not sure of.
- **Before anything is published or budgeted,** re-check every UNVERIFIED item and every vendor price by hand.

---

## 1. Factor evidence, 1993-2026

| Signal | Core evidence | What happened after publication / recently | Natural horizon | Role in our engine |
|---|---|---|---|---|
| **Price momentum 12-1** (skip the most recent month) | Jegadeesh-Titman (1993): 3-12 month winners minus losers earn about 1%/month (R) https://doi.org/10.1111/j.1540-6261.1993.tb04702.x. They confirmed it out of sample for 1990-98 in JT (2001) (R) https://doi.org/10.1111/0022-1082.00342 | **Crash risk:** momentum fails badly in rebounds after bear markets. Losses were about -73% in Mar-May 2009 and about -90% in 1932 (figures approximate) (R) Daniel-Moskowitz 2016 https://doi.org/10.1016/j.jfineco.2015.12.002. **Volatility scaling** raises the Sharpe ratio from about 0.53 to about 0.97 (R) Barroso-Santa-Clara 2015 https://doi.org/10.1016/j.jfineco.2014.11.010. **Residual (idiosyncratic) momentum** roughly doubles risk-adjusted returns and cuts crash exposure (R) Blitz-Huij-Martens 2011 https://doi.org/10.1016/j.jempfin.2011.01.003. **Crowding:** high "comomentum" among momentum stocks predicts weaker momentum returns and reversal (R) Lou-Polk, RFS 2022 (DOI UNVERIFIED). **2025-26:** momentum behaviour around the April 2025 tariff shock and the mid-2025 "junk"/most-shorted rally is UNVERIFIED | 3-12 months | Core "trend" family. Use residual, volatility-scaled momentum. |
| **Earnings momentum / PEAD / revisions** | Drift continues for about 60 trading days after an earnings surprise (R) Bernard-Thomas 1989 https://doi.org/10.2307/2491062. Analyst revisions and SUE predict returns separately from price momentum (R) Chan-Jegadeesh-Lakonishok 1996 https://doi.org/10.1111/j.1540-6261.1996.tb05222.x. Price momentum is largely explained by fundamental momentum (R) Novy-Marx 2015 https://www.nber.org/papers/w20984 | Classic PEAD has **largely disappeared in large caps since the mid-2000s** and survives mainly in microcaps (R, exact dates UNVERIFIED) Martineau, "Rest in Peace Post-Earnings Announcement Drift", Critical Finance Review 2022 (URL UNVERIFIED) | 1-3 months | "Fundamental momentum" family. Revision breadth is likely more robust than raw SUE in large caps. |
| **Quality / profitability** | Gross profits / assets predicts returns about as well as book-to-market (R) Novy-Marx 2013 https://doi.org/10.1016/j.jfineco.2013.01.003. Quality-minus-junk is significant in the US and 24 countries (R) Asness-Frazzini-Pedersen 2019 https://doi.org/10.1007/s11142-018-9470-2. Profitability (RMW) and investment (CMA) factors: in the US sample, value (HML) becomes redundant (R) Fama-French 2015 https://doi.org/10.1016/j.jfineco.2014.10.010 | Quality works as a defensive tilt. It reportedly lagged during the 2025 low-quality/most-shorted rally (UNVERIFIED) | 6-12 months | "Quality" family and quality filter. |
| **Value** | HML | Value had its deepest drawdown in 2017-2020. The value premium was lower in 1991-2019 but not statistically different from earlier (R) Fama-French 2021 https://doi.org/10.1093/rapstu/raaa021. Intangibles-adjusted book value and wide valuation spreads argue against "value is dead" (R) Arnott et al. 2021 https://doi.org/10.1080/0015198X.2020.1842704. **Value and momentum are negatively correlated** (about -0.4 to -0.6), and combining them lifts Sharpe (R) Asness-Moskowitz-Pedersen 2013 https://doi.org/10.1111/jofi.12021 | 12 months+ | Use a composite (EV/EBIT, FCF yield, intangible-adjusted B/M). **Do not require value AND momentum to agree** (see section 5). |
| **Low volatility / low beta** | High idiosyncratic volatility predicts low returns (R) Ang-Hodrick-Xing-Zhang 2006 https://doi.org/10.1111/j.1540-6261.2006.00836.x. Betting-against-beta (R) Frazzini-Pedersen 2014 https://doi.org/10.1016/j.jfineco.2013.10.005 | BAB's reported performance depends heavily on non-standard construction and on small or illiquid stocks (R) Novy-Marx & Velikov, "Betting against betting against beta", JFE 2022 (URL UNVERIFIED) | Months | A risk filter, not an alpha vote. It excludes lottery-like, high-IVOL names. |
| **Short interest** | Heavily shorted stocks underperform lightly shorted ones by about 1.16% risk-adjusted over the next 20 trading days (R) Boehmer-Jones-Zhang 2008 https://doi.org/10.1111/j.1540-6261.2008.01324.x. Short interest combined with low institutional ownership predicts underperformance (R) Asquith-Pathak-Ritter 2005 https://doi.org/10.1016/j.jfineco.2004.07.001. Days-to-cover beats raw short interest (R) Hong et al., NBER w21166 (UNVERIFIED) | Squeeze and meme episodes (2021; reportedly mid-2025, UNVERIFIED) produce violent short-horizon reversals | About 1 month | A **veto only**: never send a long pick in the top short-interest (days-to-cover) decile. |
| **Insider buying** | Purchases predict returns and sales mostly do not (R) Lakonishok-Lee 2001 https://doi.org/10.1093/rfs/14.1.79. "Opportunistic" (non-routine) insider trades earn about 82 bps/month on a value-weighted basis, while routine trades carry no information (R) Cohen-Malloy-Pomorski 2012 https://doi.org/10.1111/j.1540-6261.2012.01740.x | Form 4 must be filed within 2 business days (SOX section 403), so the data is fast and free (SEC) | 1-12 months | A strong confirmation signal. Weight cluster buys by officers/CEO/CFO and filter out routine traders. |

### Replication, decay and multiple testing
- **Replication is mixed.**
  - Harvey-Liu-Zhu (2016) propose a t-stat hurdle of 3.0 for new factors (R) https://doi.org/10.1093/rfs/hhv059.
  - Hou-Xue-Zhang (2020): with NYSE breakpoints and value weighting, **65% of 452 anomalies fail |t|≥1.96, and 82% fail at t≥2.78**. Most of the failures are microcap or trading-friction anomalies (R) https://doi.org/10.1093/rfs/hhy131.
- **Jensen-Kelly-Pedersen (2023, JF):** a Bayesian replication of 153 factors across 93 countries.
  - Most factors replicate (reported at about 80%+ in the US; exact figure UNVERIFIED) and cluster into 13 themes. Many themes matter for the tangency portfolio, and the factors work in the 93-country out-of-sample data (R) https://doi.org/10.1111/jofi.13249.
  - Code is public (V): https://github.com/bkelly-lab/ReplicationCrisis and https://github.com/bkelly-lab/jkp-data.
- **Chen-Zimmermann** open-source dataset of about 300+ predictors (V repo): https://github.com/OpenSourceAP/CrossSection
- **Decay after publication:** across 97 predictors, returns are **26% lower out of sample and 58% lower after publication** (R) McLean-Pontiff 2016 https://doi.org/10.1111/jofi.12365.
- **Trading costs:**
  - Anomalies with monthly turnover below about 50% mostly survive costs; high-turnover anomalies mostly do not. Buy/hold spreads cut costs sharply (R) Novy-Marx-Velikov 2016 https://doi.org/10.1093/rfs/hhv063.
  - Real institutional execution costs are far below academic estimates, and value/size/momentum have large capacity (R) Frazzini-Israel-Moskowitz, "Trading Costs", SSRN 3229719 https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3229719.
  - Combining characteristics nets trades against each other, but only a small set of characteristics stays significant after costs (R) DeMiguel et al., RFS 2020 (DOI UNVERIFIED).
  - After costs and post-publication decay, the typical anomaly nets only a few bps/month (R, exact numbers UNVERIFIED) Chen-Velikov, JFQA 2023.
- **Crowding and deleveraging:** in the quant quake of August 2007, crowded long/short equity factor books unwound together (R) Khandani-Lo 2011 https://doi.org/10.1016/j.finmar.2010.07.005.

**Combinations that have held up out of sample:**
- Momentum (residual, volatility-scaled) + profitability/quality + value composite + earnings/revision momentum, restricted to liquid stocks.
- Insider purchases and short-interest vetoes as overlays.
- Low-volatility as a filter.
- Microcap-dependent anomalies (plain PEAD, BAB, most friction-based signals) are not reliable at investable size.

---

## 2. ML ranking best practice

### Evidence
- **Gu-Kelly-Xiu (2020, RFS):** about 30k US stocks from 1957 to 2016, 94 characteristics interacted with 8 macro variables plus industry dummies (about 900 features) (R) https://doi.org/10.1093/rfs/hhaa009.
  - Trees and shallow neural nets beat linear models. Monthly out-of-sample R² is about 0.4% for NN3, against a negative R² for OLS on all features.
  - The ML long-short portfolios roughly **double the Sharpe ratio** of leading regression-based strategies (value-weighted NN4 is about 1.35; figure UNVERIFIED).
  - All methods agree on the dominant predictors: **momentum and price trends, liquidity, and volatility**.
- **Economic restrictions shrink ML gains.** Most ML profit comes from microcaps, distressed firms and unrated firms. Excluding them and charging costs sharply reduces performance (R) Avramov-Cheng-Metzker, Management Science 2023 https://doi.org/10.1287/mnsc.2022.4449. The same pattern appears in China, where predictability is concentrated in small and retail-heavy stocks (R) Leippold-Wang-Zhou, JFE 2022 https://doi.org/10.1016/j.jfineco.2021.08.017.
- **Parsimony and shrinkage:** only about a dozen of 62 characteristics carry independent information (R) Freyberger-Neuhierl-Weber 2020 https://doi.org/10.1093/rfs/hhz123. IPCA is a strong linear latent-factor benchmark (R) Kelly-Pruitt-Su 2019 https://doi.org/10.1016/j.jfineco.2019.05.001.
- **"Virtue of complexity":** larger models give better out-of-sample market-timing Sharpe (R) Kelly-Malamud-Zhou, JF 2024 (DOI UNVERIFIED). Nagel (2025) disputes this (UNVERIFIED). It is not relevant to cross-sectional picking at our scale.
- **Put costs in the objective:** optimising ML portfolios with costs inside the objective beats a two-step "predict, then trade" approach (R) Jensen-Kelly-Malamud-Pedersen, "Machine Learning and the Implementable Efficient Frontier", SSRN 4187217 (UNVERIFIED id).
- **Trees vs deep learning:** gradient-boosted trees still generally beat deep learning on tabular data (R) Grinsztajn et al., NeurIPS 2022 https://arxiv.org/abs/2207.08815. Microsoft Qlib (V, about 49k stars) https://github.com/microsoft/qlib ships LightGBM on its Alpha158 feature set as a strong baseline. Its benchmark numbers are UNVERIFIED.

### Recipe (standard practice, synthesised from the sources above)
1. **Features:** cross-sectionally rank-transform each characteristic to [-1, 1] each date and set missing values to 0 (the median), as in Gu-Kelly-Xiu and Kelly-Pruitt-Su. Neutralise by sector where appropriate.
2. **Target:** the cross-sectional rank (or z-score) of forward 21-day and 63-day return, in excess of the sector or benchmark. Do not use raw returns, which let market beta dominate. Optionally use LambdaRank/LambdaMART with top-decile NDCG.
3. **Models:** LightGBM/XGBoost (shallow trees, depth 3-6, strong regularisation, many seeds), benchmarked against a linear/IPCA baseline and an equal-weight composite of the hand-built factor scores. **If the GBM cannot beat the simple composite after costs, ship the composite.**
4. **Evaluation metrics:**
   - Rank IC (Spearman) per date, its mean, and ICIR (mean IC divided by its standard deviation).
   - Top-decile excess return, net of costs.
   - Turnover.
   - Fundamental law of active management: IR ≈ IC × √breadth (R) Grinold 1989 https://doi.org/10.3905/jpm.1989.409211.
5. **Walk-forward:** expanding-window training, retraining yearly or quarterly, with predictions made only on data after each training cutoff.
6. **Purged / embargoed cross-validation for hyperparameters:**
   - Remove (purge) any training samples whose label window overlaps the test fold, and add an embargo after each test fold. For a 21-day label: purge at least 21 trading days and embargo about 1 month.
   - Combinatorial purged CV (CPCV) gives a distribution of backtest paths.
   - Source (R): López de Prado, *Advances in Financial Machine Learning* (Wiley 2018), ch. 7 and 12.
7. **Overfitting control:**
   - Log **every** configuration tried.
   - Report the Deflated Sharpe Ratio (R) Bailey-López de Prado 2014 https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551 and the Probability of Backtest Overfitting (R) Bailey-Borwein-López de Prado-Zhu https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253.
   - Apply Harvey-Liu haircuts (R) https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2345489.
   - Worked example (computed): with 5 years of data and **100 zero-skill variants, the best one shows an expected annual Sharpe of about 1.13**. With 1,000 variants it is about 1.46; with 10 years and 100 variants, about 0.80.
8. **Look-ahead bias:**
   - Use fundamentals only after their **SEC acceptance timestamp**. When filing dates are missing, lag quarterly data by at least 45-90 days and annual by 90 days to 6 months.
   - Use as-first-reported values, not restated ones.
   - Use historical index membership, not today's constituents.
   - Use consensus estimates as they stood on that date.
9. **Survivorship bias:**
   - Include delisted stocks and **delisting returns**. Missing performance-delisting returns bias results upward; Shumway estimates they average about -30% (R) Shumway 1997 https://doi.org/10.1111/j.1540-6261.1997.tb03818.x.
   - Key securities on permanent identifiers (CIK/FIGI), not tickers.
10. **Costs, turnover and capacity:**
    - Model spread plus impact. Assumption (UNVERIFIED): about 5-10 bps one-way for mega caps and 15-30 bps for $1-10B caps.
    - Report gross and net figures. Use buy/hold bands to cut turnover.
    - For a signal service, **capacity means subscriber herding** (arithmetic, derived): 5,000 subscribers × $10k = $50M of buying. That is 10× the ADV of a stock trading $5M/day, so subscribers would move the price against themselves.

---

## 3. LLMs for return prediction
- **Headline sentiment:** GPT headline-sentiment scores predict next-day returns. The effect is strongest in small caps and after negative news, and weakens as adoption rises (R) Lopez-Lira & Tang 2023 https://arxiv.org/abs/2304.07619. The "weakening" detail is UNVERIFIED.
- **Text embeddings:** LLM embeddings of news beat word-based sentiment for return prediction across 16 markets, mainly at short horizons of days (R) Chen-Kelly-Xiu, "Expected Returns and Large Language Models" https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4416687.
- **Financial statements:** GPT-4 given anonymised standardised statements predicts the direction of next-year earnings changes with about 60% accuracy, at or above analysts (R) Kim-Muhn-Nikolaev 2024 https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4835311. Accuracy figures UNVERIFIED.
- **Look-ahead bias is the key risk:**
  - Tests on periods inside the model's training data are contaminated. Anonymising firm names reduces both look-ahead bias and "distraction" effects (R) Glasserman-Lin 2023 https://arxiv.org/abs/2309.17322.
  - LLMs memorise pre-cutoff market data (UNVERIFIED) Lopez-Lira-Tang-Zhu 2025, "The Memorization Problem".
  - Chronologically trained models exist that avoid lookahead (UNVERIFIED) He-Lv-Manela-Wu 2025, "Chronologically Consistent LLMs".
- **Implication:** an LLM signal can only be backtested **after the model's training cutoff**. Its alpha horizon (days) is much shorter than our holding period. Use LLMs for:
  1. A news/filing **negative-event veto** in the 48 hours before an SMS.
  2. Written explanations of the factor breakdown.
  3. Slow embeddings of 10-K/10-Q text as ML features, only with point-in-time dates.

---

## 4. Ensemble "vote": hit rate vs frequency (simulation, computed this run)

**Model:** standardised forward relative return y. Each signal has correlation IC with y, and signals are correlated with each other at ρ. A pick requires **all k signals in the top decile**. Universe: 3,000 stocks per month. With k=3 and ρ=0 there were only about 400 simulated picks, so hit rates carry roughly ±2.5 percentage points of noise.

| IC per signal | Signal corr ρ | k agree | Picks/month (3,000 names) | Hit rate (beats cross-section) | E[excess] in cross-sectional SD |
|---|---|---|---|---|---|
| 0.05 | 0.0 | 1 | 299 | 53.9% | 0.09 |
| 0.05 | 0.0 | 2 | 30 | 58.0% | 0.22 |
| 0.05 | 0.0 | 3 | 3.1 | ~59% | 0.26 |
| 0.05 | 0.5 | 2 | 97 | 55.1% | 0.13 |
| 0.05 | 0.5 | 3 | 46 | 56.1% | 0.16 |
| 0.10 | 0.0 | 3 | 3.4 | ~70% | 0.54 |
| 0.10 | 0.5 | 3 | 47 | 61.2% | 0.29 |

**What this shows:**
- **Unanimity helps only when signals are genuinely different.** Correlated signals (for example momentum and residual momentum) give about 15× more picks and little gain in precision.
- **Negatively correlated signals** (value vs momentum) give even fewer joint picks than the independent case.
- **The idealised numbers are an upper bound.** Real signal ICs vary over time and are usually 0.02-0.05, not 0.10.
- **Baseline for a single signal (computed):** the probability a single stock beats the benchmark is 0.5 + arcsin(IC)/π. That gives 51.6% at IC=0.05 and 53.2% at IC=0.10.
- **Realistic targets:**
  - Top-decile / consensus picks beating the benchmark: **53-58%** over a 1-month hold.
  - Anything above about 60% sustained live over years should be treated as suspicious.
  - Sub-decile picks: average excess of roughly +0.5 to +1.5% per month gross (UNVERIFIED, derived from IC and an assumed ~10% monthly cross-sectional SD).
- **Principled version of a vote:** meta-labelling. A primary model chooses candidates, and a secondary classifier decides whether to act. This trades recall for precision (R) López de Prado (2018), ch. 3.
- **Statistical power (computed):**
  - Distinguishing a hit rate from 50% at 2 standard errors needs about **400 independent picks at 55%, 278 at 56%, 156 at 58% and 100 at 60%**.
  - At 3-5 SMS per month, that takes **3-8 years**.
  - For Sharpe, t ≈ SR × √years, so SR 0.5 needs about 16 years to reach t=2.
- **Horizons implied by the literature:** reversal about 1 month, short interest about 20 days, PEAD and revisions 1-3 months, momentum 3-12 months, insider 6-12 months. **A 21-trading-day hold is the natural common horizon;** also report 5- and 63-day outcomes.

---

## 5. Market data providers
All prices and terms below are **UNVERIFIED** (recalled 2025-early 2026; the vendor pages were egress-blocked). Get written quotes before building on any of them.

| Provider | Relevant data | Point-in-time / survivorship | Indicative price | Redistribution to subscribers |
|---|---|---|---|---|
| **Massive.com (formerly Polygon.io)**: the official client repo now reads "Massive.com REST and WebSocket API" (V) https://github.com/massive-com/client-python | US stocks tick/minute/daily, reference data, corporate actions, XBRL-derived "financials" | Financials carry filing dates (approximately PIT); delisted tickers available (UNVERIFIED) | Individual plans roughly $0 / $29 / $79 / $199 per month (UNVERIFIED) | Individual plans are for personal, non-business use. Business plans cost much more (four figures/month) plus exchange fees for real-time display (UNVERIFIED) |
| **Financial Modeling Prep** https://site.financialmodelingprep.com | Statements, estimates, insider, 13F, transcripts | Statements include filingDate/acceptedDate, and "as reported" endpoints exist; standardised values may be restated (UNVERIFIED) | About $0 / ~$20-30 / ~$50-60 / ~$100-150 per month (UNVERIFIED) | Standard plans forbid display or redistribution; a separate commercial "data display" licence is quoted individually (UNVERIFIED) |
| **Alpha Vantage** https://www.alphavantage.co | Prices, fundamentals, EARNINGS (reported date and surprise), news sentiment | Snapshot-style fundamentals; no restatement history (UNVERIFIED) | Free 25 requests/day; premium about $50-250/month by rate limit (UNVERIFIED) | Commercial or redistribution use needs a separate agreement (UNVERIFIED) |
| **EODHD** https://eodhd.com | Global EOD/intraday, 30 years of US fundamentals, delisted tickers | Delisted coverage; fundamentals include some filing dates, but are not true PIT (UNVERIFIED) | About $20 EOD / $30 intraday / $60 fundamentals / $100 all-in-one per month (UNVERIFIED) | Personal plans; commercial/B2B licence is separate (UNVERIFIED) |
| **Tiingo** https://www.tiingo.com | EOD with delisted tickers, IEX intraday, news, fundamentals add-on | Fundamentals add-on (PIT status UNVERIFIED) | About $30/month individual; about $50/month internal commercial (UNVERIFIED) | Redistribution needs a custom licence (UNVERIFIED) |
| **Nasdaq Data Link, Sharadar** https://data.nasdaq.com/databases/SF1 | SF1 fundamentals; SEP prices including delisted; SF2 insider (Form 4); SF3 13F; historical S&P 500 membership | **Best budget PIT option:** "AR" dimensions (ARQ/ART) exclude restatements and are keyed by `datekey` (the SEC filing date), while "MR" dimensions are restated (R). Delisted firms included | Tens of USD/month for personal use; professional/commercial tiers much higher (UNVERIFIED) | Internal research use; display requires a commercial licence (UNVERIFIED) |
| **Intrinio** https://intrinio.com | Standardised and as-reported fundamentals, prices, estimates (Zacks) | As-reported with filing dates (UNVERIFIED) | Packages from low hundreds of USD/month; redistribution is enterprise-quoted (UNVERIFIED) | **Sells explicit web-display / redistribution licences to fintechs** (UNVERIFIED) |

**Free or public sources:**
- **SEC EDGAR APIs** https://www.sec.gov/search-filings/edgar-application-programming-interfaces: XBRL `companyfacts` and `frames` with a `filed` date on every fact (true PIT for filing timing), and Form 4 insider data. US government data; fair-access limit of about 10 requests per second https://www.sec.gov/os/accessing-edgar-data (R).
- **FINRA short interest**, published twice a month with a lag https://www.finra.org/finra-data (redistribution terms UNVERIFIED).
- **Kenneth French data library and JKP factors** (jkpfactors.com), for factor attribution and benchmarks.
- **OpenFIGI**, for identifier mapping.

**Gaps and licensing notes:**
- **Analyst revisions:** proper point-in-time estimate history (I/B/E/S, FactSet, Zacks) is enterprise-priced. **Cheap APIs expose only the current consensus, so we must snapshot it daily from launch** to build our own history.
- **Licensing principle:** showing raw vendor or exchange data (prices, standardised financials) to paying users counts as redistribution. It needs a display licence and, for real-time prices, exchange vendor agreements and fees; 15-minute-delayed and EOD data are cheaper.
- **Derived data:** our own scores and ranks are generally treated as derived data, but exchange and vendor derived-data policies still apply (UNVERIFIED).
- **Practical split:** show our scores and outcome returns. For displayed fundamentals, use SEC-sourced data (public). License a display-permitted price feed (Massive business or Intrinio) for charts.

---

## 6. Presenting the track record honestly

### Ledger
- **Record every SMS signal**, including losers, cancellations and model changes, in an append-only log.
- Each record holds:
  - UTC timestamps for "produced" and "sent";
  - the ticker and FIGI;
  - the reference price at send time;
  - the planned exit rule;
  - the model version hash;
  - the signal scores.
- **Make it tamper-evident:** anchor a daily SHA-256 Merkle root with OpenTimestamps (https://opentimestamps.org) or an RFC 3161 timestamp authority, and let users download the full CSV.

### Execution realism
- Entry is the **next regular-session open after the SMS** (or the VWAP of the first 30 minutes), never the prior close.
- Exits follow the pre-declared time rule (21 trading days).
- Deduct costs: an assumed spread plus about 10-30 bps, disclosed.
- Show results in **USD and EUR**, because EU users bear the FX effect.

### Benchmarks
- SPY total return (or an equal-weight universe for equal-weighted picks), plus the sector ETF.
- Regression alpha against FF5 + UMD, to show whether "AI" is really repackaged momentum or quality.

### Metrics to show
- Number of signals and the "live since" date.
- Hit rate against the benchmark. Absolute win rate may be shown only next to it, since beta inflates it in bull markets.
- Average win, average loss, payoff ratio and expectancy per signal.
- Median excess return and the full return distribution.
- CAGR of the equal-weight "follow every SMS" portfolio.
- Maximum drawdown and the longest underwater period.
- Sharpe, Sortino, volatility and beta.
- Turnover.
- Yearly and monthly tables.
- Rolling 12-month hit rate.
- Worst 10 signals.

### Keep backtest and live results apart
- **Never show a hypothetical backtest and live results as one curve.** Label the backtest "hypothetical, simulated".
- Disclose the number of variants tried and the Deflated Sharpe Ratio (with PBO) of the backtest.
- For breadth, also publish the **full-universe score deciles and monthly rank IC**, so evidence builds faster than a 3-5 pick/month record allows.

### EU rules and standards
- **MiFID II Delegated Regulation 2017/565, Art. 44 (past performance):**
  - at least 5 years, or the whole period if shorter;
  - complete 12-month periods;
  - source and reference period stated;
  - a prominent "past performance is not a reliable indicator" warning;
  - fee effects disclosed;
  - simulated past performance only under strict conditions.
  - Source (R): https://eur-lex.europa.eu/eli/reg_del/2017/565/oj. Whether it applies to us is UNVERIFIED and should be confirmed with counsel.
- **MAR Art. 20 and Delegated Regulation 2016/958** (recommendations to the public):
  - the producer's identity;
  - an objective presentation that separates facts from opinion;
  - the methodology;
  - the date and time of production and first dissemination;
  - the price at dissemination;
  - conflicts of interest;
  - for firms or "experts", a list of all recommendations from the past 12 months.
  - Sources (R): https://eur-lex.europa.eu/eli/reg/2014/596/oj and https://eur-lex.europa.eu/eli/reg_del/2016/958/oj. Article numbering and applicability to algorithmic picks are UNVERIFIED.
  - **The honest ledger above also satisfies these requirements.**
- **GIPS 2020** (https://www.gipsstandards.org) and the **US SEC Marketing Rule, 17 CFR 275.206(4)-1** (https://www.ecfr.gov/current/title-17/section-275.206(4)-1), which restricts hypothetical performance, are best-practice references.
- **Staff trading:** a personal-trading embargo and holdings disclosure, because pre-positioning before an SMS is scalping/manipulation risk under MAR.

---

## Implications for our build
1. **Universe:** US common stocks with price above $5, market cap above $2B and 60-day ADV above $25M (about 1,200-1,500 names). **Liquidity rule:** estimated subscriber flow (subscribers × assumed ticket size) must stay at or below 2-5% of ADV, and the floor rises as the subscriber base grows. Exclude microcaps entirely. This avoids the Hou-Xue-Zhang and Avramov-Cheng-Metzker traps.
2. **Four signal families vote, plus vetoes:**
   - (A) **Trend:** residual, volatility-scaled 12-1 momentum.
   - (B) **Fundamental momentum:** SUE from EDGAR plus revision breadth from our own daily consensus snapshots.
   - (C) **Quality/value composite:** gross profitability, QMJ-style metrics, EV/EBIT and FCF yield.
   - (D) **LightGBM cross-sectional ranker:** about 60-120 rank-normalised features; target = sector-relative 21-day forward return rank.
   - **Insider cluster buying** (opportunistic, Cohen-Malloy-Pomorski filter) is a bonus confirmation.
   - **Vetoes:** top days-to-cover decile; top idiosyncratic-volatility decile; earnings within the next 3 trading days; LLM-flagged material negative news in the last 48 hours.
3. **SMS rule:** send only when **at least 3 of the 4 families are in the top decile, with no veto**, then take the top-N by combined score. Calibrate the thresholds on the validation period so the service sends **about 3-8 SMS per month**. Do not make value and momentum a mandatory pair.
4. **Holding period:** fixed 21 trading days with a time-based exit and no discretionary stops. Also report 5- and 63-day outcomes. Target messaging: "about 55% beat the benchmark over the long run." Never promise more than about 60%.
5. **Validation:**
   - Expanding walk-forward with annual retraining.
   - Purged k-fold (21-day purge, 1-month embargo) for hyperparameters.
   - An **untouched final holdout of the last 3 years**.
   - Log every experiment; publish the Deflated Sharpe Ratio and PBO.
   - The GBM must beat the equal-weight composite after costs, or it is not used.
6. **Data stack:**
   - Research: Sharadar SF1 (ARQ/ART dimensions) + SEP (including delisted) + SF2 via Nasdaq Data Link.
   - Public-domain displayed fundamentals and insider data: SEC EDGAR XBRL and Form 4.
   - Short interest: FINRA.
   - User-facing prices: a display-licensed feed (Massive business tier or Intrinio). Get quotes; EOD/delayed data only at launch.
   - Snapshot consensus estimates and short interest daily from day one.
   - Key everything on CIK/FIGI.
7. **LLM use:** news/filing veto, "why this pick" text generated from the factor breakdown (numbers only, no invented claims), and 10-K/10-Q embeddings as ML features. **Backtest LLM components only on dates after the model's training cutoff,** with anonymised inputs.
8. **Track-record page (a core feature, not an afterthought):**
   - Append-only public ledger with a daily OpenTimestamps-anchored hash and CSV download.
   - Next-open entry; net of costs; USD and EUR.
   - SPY and sector benchmarks plus FF5+UMD alpha.
   - Hit rate, average win/loss, payoff, expectancy, MDD, Sharpe/Sortino, per-year table, worst-10 list.
   - "Live since" clearly separated from the shaded "hypothetical backtest".
   - Full-universe decile/IC chart for statistical breadth.
   - The MiFID Art. 44 warning text, and the MAR-style 12-month recommendation list with production and dissemination timestamps.
9. **Costs in every number shown:** assume 10 bps one-way for caps above $10B and 25 bps for $2-10B, and show turnover. Cap position turnover with buy/hold bands in the full-universe model portfolio.
10. **Expect and disclose momentum crash risk:** add a market-state switch that shrinks the trend family's weight after bear-market rebounds (Daniel-Moskowitz). Publish drawdowns rather than hiding them.
11. **Before launch:** re-verify every UNVERIFIED vendor price and licence term with written quotes. Confirm MiFID and MAR status (investment advice vs general recommendation, the "expert" definition) with Slovenian counsel / ATVP. A separate workstream should own this.