# Competitive landscape: AI/quant stock pickers and stock-alert subscriptions (as of 28 Sep 2026)

Scope: pricing, delivery channel, how often picks arrive, what "AI" means in practice, how the track record is presented, user complaints, and the gaps. Figures come from search-result summaries, because direct page fetches were blocked. Where sources disagree I say so. Anything I could not confirm is marked UNVERIFIED.

---

## 1. Snapshot table

| Product | List price | Channel | Cadence | What "AI/quant" means | Track record type | EU stocks |
|---|---|---|---|---|---|---|
| Danelfin (Barcelona) | $29 / $79 / $179 per month, or $22 / $59 / $134 per month billed annually; free tier; 14-day trial ([therundown](https://www.therundown.ai/tools/danelfin)) | Email (daily), web, Android app with push | Daily score updates and daily "best stocks" email | ML probability of beating the benchmark over 3 months, 10k+ features per stock ([blog](https://blog.danelfin.com/danelfin-expands-european-stocks-coverage)) | Backtest headline plus a public forward audit site | Yes, 5,500+ European stocks |
| Seeking Alpha Premium (Quant) | $299/yr ([financer](https://financer.com/invest/seeking-alpha-premium-review/)) | Web, app push, email | Ratings update continuously | 5-factor rules model (value, growth, profitability, momentum, revisions) | 2010–2019 backtest, simulated after that | US-listed (UNVERIFIED for non-US) |
| Seeking Alpha Alpha Picks | $499/yr, annual only, $449 via affiliates ([stockdork](https://www.thestockdork.com/alpha-picks-pricing/)) | Email at 12:00 on pick day, dedicated app with push | 2 picks/month (1st and 15th) | Human pick from the Quant "Strong Buy" list | Live model portfolio since 1 Jul 2022 | No |
| SA PRO Quant Portfolio | Part of PRO ($2,400/yr) | Web | 30 stocks, rebalanced weekly | Quant system | Live model since Jun 2025, "not real money" ([SA](https://seekingalpha.com/article/4912112-plus-55-percent-in-year-one-exploring-the-success-of-pro-quant-portfolio)) | No |
| Zacks Premium / Ultimate | $249/yr; Ultimate $299/mo or $2,995/yr ([bullishbears](https://bullishbears.com/zacks-review/)) | Daily pre-market email; text alerts offered ([Zacks](https://www.zacks.com/my-account/alert-preferences/)) | Daily | Earnings-estimate-revision rules model | Hypothetical, equal-weighted, monthly-rebalanced since 1988 | No |
| Motley Fool Stock Advisor | $99 first year, then $199/yr ([flakjacket](https://flakjacketfinance.com/reviews/motley-fool-stock-advisor-cost)) | Email with report, app push; SMS used for marketing only ([Fool support](https://support.fool.com/hc/en-us/articles/360036391593-Email-settings)) | 2 picks/month (1st and 3rd Thursday) | None (human analysts) | Simple average of every pick vs S&P from each pick date | No (separate UK/CA products) |
| TipRanks Smart Score | Premium $360/yr, Ultimate $600/yr ([stockbrokers](https://www.stockbrokers.com/review/tools/tipranks)) | Web, app, email alerts | Continuous | 8-factor score (analysts, insiders, hedge funds, technicals); "Spark" LLM analyst launched Mar 2025 | Backtest labelled as such (Smart Score 10: 17.8%/yr since 2016) | Partial (UK, DE, ES and others) |
| Stockopedia StockRanks (UK) | From £295/yr; regional add-ons extra ([Stockopedia](https://www.stockopedia.com/plans/)) | Web, email alerts | Continuous | Quality, value and momentum percentile ranks | Live notional portfolios since Apr 2013, capital return only | Yes, but thin for mid/small caps |
| InvestingPro ProPicks AI | Pro $91/yr intro; Pro+ $229 intro, renews at $539/yr ([matchmybroker](https://www.matchmybroker.com/articles/investingpro-pricing)) | Web, app | Monthly refresh, up to 20 stocks per strategy | ML blend of 150+ financial models | Live since Nov 2023 plus a backtest | Yes (88 strategies worldwide) |
| Kavout (Kai Score) | ~$16–99/mo, conflicting sources (UNVERIFIED) | Web | Daily score | ML score 1–9 on 200+ factors | Self-published backtest | UNVERIFIED |
| Tickeron | ~$60–250/mo, conflicting sources (UNVERIFIED) | Web, app | Intraday to swing | "Financial Learning Models" robots and agents | Self-reported 125–313%/yr (UNVERIFIED) | No |
| Trade Ideas (Holly) | $127 or $254/mo; $89 or $178/mo billed annually ([stockbrokers](https://www.stockbrokers.com/review/tools/trade-ideas)); other sources say $167–228/mo | Desktop platform | Intraday | Nightly backtests of 70+ strategies, keeps those with >60% win rate and ≥2:1 reward/risk | Full trade log inside the platform; marketing shows only winners | No |
| Validea | $269.95/yr standard, $899.95/yr professional ([daytradereview](https://daytradereview.com/validea-review/), possibly outdated) | Web, email | Monthly, quarterly or annual rebalances | Rules copied from famous investors ("gurus") | Model returns since 2003, no costs | No |
| AAII | $29–49/yr membership; premium products ~$199 (conflicting) | Journal, web | Monthly | Screens | Real-money Shadow Stock portfolio since 1993 ([AAII](https://www.aaii.com/model-portfolios/stock-annual)) | No |
| WallStreetZen Zen Ratings / Zen Investor | Zen Investor $99/yr; plan renews at $234/yr ([stockdork](https://www.thestockdork.com/wallstreetzen-review/)) | Web, email | 2+ picks/month | 115-factor model including an "AI factor" | "A" rated stocks +28.5%/yr since 2003 (backtest; model changed Jul 2026) | No |
| Simply Wall St | $131.40/yr Premium, $258/yr Unlimited ([stockunlock](https://stockunlock.com/simply-wall-st-review.html)) | Web, app | Continuous | Visual rules-based "Snowflake" | None (research tool, not a picker) | Yes, 90+ markets |
| IBD Leaderboard / SwingTrader | $699/yr each ([traderhq](https://traderhq.com/investors-business-daily-swingtrader-review-stock-trading-technical-analysis/)) | App push, email | Several per week | CAN SLIM rules plus human curation | Self-reported | No |

---

## 2. Profiles (only what is not already in the table)

### Danelfin: the closest direct competitor, and EU-based
- Founded in 2018 in Barcelona by Tomás Diago (founder of Softonic). Raised €2M led by Nauta Capital in Jun 2024, about $2.46M in total, around 15 staff ([EU-Startups](https://www.eu-startups.com/2024/06/barcelona-based-danelfin-snaps-e2-million-to-help-retail-investors-make-better-decisions/), [Tracxn](https://tracxn.com/d/companies/danelfin/__EZQ3pz7k-Oe2w0ao5pvzrNf6DrSBLw0by9qpvtMAPZM)).
- Headline claims:
  - US stocks scored 10/10 earned +21.05% average annualized alpha over 3 months; stocks scored 1/10 earned −33.28%.
  - The top-score strategy returned +376% vs +166% for the S&P 500 (Jan 2017–Jun 2025). Danelfin itself labels this as a backtest ([pineify](https://pineify.app/danelfin/danelfin-review)).
  - European 10/10 stocks show +35.40% annualized alpha vs STOXX 600 over 7 years ([blog](https://blog.danelfin.com/danelfin-expands-european-stocks-coverage)).
- Explainability: shows the "alpha signals" behind each score, in green or red and ranked by relevance ([blog](https://blog.danelfin.com/danelfin-ai-update-more-accurate-etf-ratings-improved-explainability)). It is a list of factors, not a written thesis.
- Transparency: a forward audit site at [audit.danelfin.com](https://audit.danelfin.com/). Scores use point-in-time data, returns are measured from the day after publication, and the model retrains on a rolling 252 trading days.
- Channels: daily portfolio emails on upgrades and downgrades ([help](https://support.danelfin.com/hc/en-us/articles/4404427687313-What-stock-alerts-can-I-receive-via-email)) and app push. I found no SMS, WhatsApp or Telegram channel (UNVERIFIED).
- Complaints:
  - "A number, not a thesis."
  - Top-scored stocks that then fell.
  - Distrust of backtest-based headlines ([wallstreetzen](https://www.wallstreetzen.com/blog/danelfin-review/)).
  - One Trustpilot user tested 55 top picks from the daily emails (Jan–Jun 2026). Only 10 beat the market over 3 months, and the average was −7.6% vs +6.2% for the S&P 500 ([Trustpilot via search](https://www.trustpilot.com/review/danelfin.com)). This is a single user's claim (UNVERIFIED).
- Trustpilot score is about 4.1–4.2, on 44–90 reviews depending on the source.

### Seeking Alpha (Quant, Alpha Picks, PRO Quant Portfolio)
- Premium price rose from $239 (2023) to $269 (2024) to $299 (2026). The Premium + Alpha Picks bundle is $639 ([financer](https://financer.com/invest/seeking-alpha-premium-review/)).
- Quant headline: about 25%/yr for Strong Buys since 2010 vs about 10% for the S&P 500.
  - 2010–2019 is a backtest (validated by S&P Capital IQ); after 2020 the trades are simulated ([stockdork](https://www.thestockdork.com/seeking-alpha-track-record/)).
  - Performance assumes equal weight, daily rebalancing and no costs.
- Alpha Picks performance:
  - Reported figures vary between sources: +345% vs +102% for the S&P 500 (17 Sep 2026, [matchmybroker](https://www.matchmybroker.com/tools/alpha-picks-by-seeking-alpha-review)), +368% vs about +96% (25 Sep 2026), and +415% (Jun 2026). The spread reflects volatility in 2026.
  - Maximum drawdown was 34.25% (8 Apr 2025).
  - Picks from 2026 average about −6% with a 38% win rate (third-party reviews via search, UNVERIFIED).
- Exit rule: full sell if the rating drops to Sell, or stays at Hold for 180 days ([SA about](https://seekingalpha.com/alpha-picks/about)).
- Complaints:
  - Price pops right after the pick email goes out to thousands of subscribers, so subscribers buy above the model's entry price.
  - Replicators trailing the Nasdaq-100.
  - Renewal and billing disputes ([Trustpilot](https://www.trustpilot.com/review/www.seekingalpha.com)).
  - Quant ratings flip on a single earnings revision, and the momentum tilt means buying near 52-week highs ([SA FAQ](https://help.seekingalpha.com/premium/quant-ratings-and-factor-grades-faq)).
- LLM features: Virtual Analyst Reports (Dec 2024, 3,000+ US stocks, [PRNewswire](https://www.prnewswire.com/news-releases/seeking-alpha-launches-virtual-analyst-reports-its-first-ai-powered-tool-for-smarter-investment-research-302327635.html)) and the "Ask Seeking Alpha" chat.

### Zacks
- Rank #1 headline: about 23.7–23.8%/yr since 1988 vs about 11% for the S&P 500. This is a hypothetical equal-weighted portfolio, rebalanced monthly or weekly, with no costs ([Zacks disclosure](https://zacks.com/performance_disclosure)).
- Premium includes a #1 Rank list of about 220 stocks, a 50-stock Focus List and daily pre-market emails ([Zacks](https://www.zacks.com/premium/)).
- Trustpilot score is 1.6–1.8. Complaints: charged after cancelling during the trial, surprise $249 renewals, aggressive upselling, results that do not match the backtest ([bullishbears](https://bullishbears.com/zacks-review/)).

### Motley Fool Stock Advisor
- Claims +937% to +964% since 2002 vs +214% for the S&P 500. An independent recalculation of 526 picks gives +978.9%.
- About 34% of picks lose money, and the median pick returned +42.4% ([traderhq](https://traderhq.com/motley-fool-stock-advisor-review-worth-it-best-investment-advice-stock-analysis/)).
- How the figure is built: a simple average of pick returns, excluding dividends. One Nvidia pick (over +128,000%) dominates the average, and there is no independent audit ([techtimes](https://www.techtimes.com/articles/325852/20260828/motley-fool-stock-advisor-hits-964-what-that-figure-doesnt-tell-new-subscribers.htm), [Fool disclosure](https://www.fool.com/legal/investment-return-disclosure/)).
- Trustpilot score is 2.4/5 on about 9,200 reviews. The top complaint is being upsold to "Epic" on the day of joining; cancelling reportedly requires a phone call ([wallstreetzen](https://www.wallstreetzen.com/blog/motley-fool-review/)).

### TipRanks
- Its own disclaimer says the Smart Score results are a backtest built with hindsight, adjustable until returns are maximised, and before costs ([stockbrokers](https://www.stockbrokers.com/review/tools/tipranks)).
- Trustpilot 4.5 on about 1,576 reviews. The main complaint is renewal charges ([Trustpilot](https://www.trustpilot.com/review/tipranks.com)).
- Offers a 30-day money-back guarantee, including on renewals.

### Stockopedia
- Performance: the top decile returned about 14%/yr from 2013 to Nov 2022. This is described as live, not backtested, and excludes dividends and costs ([Stockopedia](https://www.stockopedia.com/learn/stockranks-ratings/reviewing-the-stockranks-performance-463388/)).
- Complaints: adding Europe or Asia costs more than the base plan, there is no free tier, and continental EU mid/small-cap data is thin ([Trustpilot/quantroutine](https://quantroutine.com/tools/stockopedia/)).
- Trustpilot score is about 5 stars on about 1,559 reviews. It is the best-liked product in this set.

### InvestingPro ProPicks AI (Investing.com)
- The Tech Titans strategy is up +182–185% since its Nov 2023 launch, vs +61.7% for the S&P 500 (Jun 2026) ([Investing.com](https://in.investing.com/news/stock-market-news/propicks-ai-up-184-since-launch--investingpro-sale-ends-today-5526889)).
- Performance assumes equal weights and buying before the open on the first trading day of each month.
- It frames the picks as "educational resources, not recommendations", which looks like a regulatory hedge ([support](https://pro.investing-support.com/hc/en-us/articles/21933511403025-How-are-Investing-com-ProPicks-Strategies-created)).
- It runs frequent 50–60% promotions, and renewal prices are much higher.

### Tickeron, Trade Ideas, Kavout (ML trading-signal tools)
- **Tickeron:**
  - Trustpilot about 3.0 on about 26 reviews. Complaints: autopay switched on without consent, "no correlation" between signals and outcomes, cancellation described as a "nightmare" ([Trustpilot](https://www.trustpilot.com/review/tickeron.com)).
  - Its 2026 "pattern accuracy of 85–92%" is a self-reported backtest.
- **Trade Ideas:**
  - Simulated fills ignore slippage, which can cut returns by 20–40% on small caps.
  - Public marketing shows only winners, while the full log sits inside the platform ([daytradingtoolkit](https://daytradingtoolkit.com/reviews/trade-ideas-review)).
  - Short ideas are often hard-to-borrow stocks, and there is a no-refund policy.
- **Kavout:** reviewers found the gap between scores 8–9 and scores 1–3 "modest" in their tests ([alphagaindaily](https://alphagaindaily.com/en/blog/kavout-ai-review)).

### Composer (acquired by SoFi, Jun 2026) and Magnifi
- **Composer:**
  - SoFi announced the acquisition on 23 Jun 2026 ([BusinessWire](https://www.businesswire.com/news/home/20260623095057/en/Introducing-Composer-by-SoFi-AI-Powered-Investing-From-Idea-to-Execution)).
  - It turns plain-English prompts into rules-based "Symphonies"; 2,000+ are shared by the community. A Trading Pass costs $40/mo or $384/yr.
  - The user owns the strategy; this is not a picker.
  - Backtests do not warn about overfitting ([alphagaindaily](https://alphagaindaily.com/en/blog/composer-ai-trading-platform-review)).
  - Available to US residents only (UNVERIFIED).
- **Magnifi (TIFIN):**
  - $13.99/mo or $131.99/yr ([wallstreetzen](https://www.wallstreetzen.com/blog/magnifi-review/)). A conversational search assistant plus a broker, not a picker.
  - Complaints: unreliable data, "canned" answers, 2FA delays, auto-renewal and refund problems.

### New LLM and agent entrants (2025–26)
- **Intellectia.ai:** daily picks at 8 AM ET, though its own documentation conflicts with a weekly "10 stocks on Monday" description. Self-reports "120%+ annual return" (UNVERIFIED). Prices from $11.96/mo on credits. Trustpilot users call the daily picker "a big letdown" ([diyai](https://diyai.io/ai-tools/finance/reviews/intellectia-review/)).
- **Robinhood Cortex:** AI digests for Gold members, $5/mo after a trial ([X/Robinhood](https://x.com/RobinhoodApp/status/2031731957252448633)). Agentic trading accounts launched May 2026 ([TechCrunch](https://techcrunch.com/2026/05/27/robinhood-now-lets-your-ai-agents-trade-stocks/)).
- **eToro Tori:** has memory, uses Grok-powered X sentiment, and offers "Agent Portfolios". It runs inside WhatsApp and Telegram, making it the first big EU-available broker using messaging apps as a channel ([eToro IR](https://investors.etoro.com/news-releases/news-release-details/etoros-ai-investing-companion-tori-gets-real-time-x-intelligence)).
- **Public.com Generated Assets:** turns a prompt into an index for a 0.49% fee ([NerdWallet](https://www.nerdwallet.com/investing/reviews/public)).
- **TipRanks Spark** (Mar 2025): an LLM stock analyst that also covers microcaps ([TipRanks](https://www.tipranks.com/news/tipranks-launches-the-worlds-most-comprehensive-ai-stock-analyst)).
- **Fiscal.ai** (formerly FinChat): $24–49/mo. **Perplexity Finance:** free. **Rallies.ai:** free. These are research copilots, not alert services.
- **Public LLM leaderboards:**
  - Rallies AI Arena: ChatGPT portfolio +72% since about Mar 2026, with public trade logs ([cryptobriefing](https://cryptobriefing.com/chatgpt-leads-rallies-ai-stock-market-arena/)).
  - Alpha Arena Season 1.5 (US stocks, real $10k per model, about 2 weeks): Grok 4.20 +12%, while others ranged from −1% to −32% at mid-run ([onedayadvisor](https://www.onedayadvisor.com/2025/12/nof1ai-alpha-arena-review-season-15.html)).
  - 1rok benchmark: 7 LLMs picking weekly since 20 Jan 2026 ([dev.to](https://dev.to/achaljhawar/which-llm-is-the-best-stock-picker-i-built-a-benchmark-to-find-out-1hco)).

### SMS-first and alert-first services
- **Tim Alerts (Timothy Sykes):** about $74.95/mo; email, SMS and push. PennyStocking Silver is $149.95/mo ([bullishbears](https://bullishbears.com/tim-sykes-review/)).
- **The Trading Analyst:** $787/yr; SMS, email and Telegram; 2–10 trades a week, about 165 a year ([tokenist](https://tokenist.com/investing/the-trading-analyst-review/)).
- **Top Stock Alerts:** daily SMS picks with target ranges ([TSA](https://topstockalerts.com/)).
- **StockGPT:** daily SMS of the top 5, 10 or 20 stocks ([substack](https://stockgpt.substack.com/p/introducing-our-textsms-alert-feature)).
- **Stock Alarm Pro:** $20/mo; price-trigger alerts by SMS, phone call and push. Not a picker ([stockalarm](https://pro.stockalarm.io/blog/best-stock-alert-apps-2026)).
- **Zacks** offers "text alerts". Among the big research brands, none makes SMS its main channel for picks: all use email, push or app.
- **US SMS delivery problems:**
  - Since Feb 2025, US carriers block unregistered A2P (business-to-person) SMS; 10DLC registration is required ([messageiq](https://messageiq.io/blogs/10dlc-registration-sms-compliance/)).
  - Since Aug 2024, carriers block crypto content in business SMS, and Twilio blocked those alerts to US and Canadian numbers ([cryptocurrencyalerting](https://cryptocurrencyalerting.com/guide/sms-alert-warning.html)).
- **Cautionary precedent:** RagingBull (alerts and "gurus") paid $2.425M to the FTC in 2022 over false earnings claims and hard-to-cancel subscriptions ([FTC](https://www.ftc.gov/news-events/news/press-releases/2022/03/online-investment-site-pay-more-24-million-bogus-stock-earnings-claims-hard-cancel-subscription)).

---

## 3. Independent evidence on whether "AI picks" work
- **NBER working paper w35153** (Carlin, Israelsen, Wazzan):
  - Tracked daily picks in real time from Aug 2025 for about 8 months, from four commercial chatbots (OpenAI, Anthropic, Google and xAI models).
  - Found no statistically significant abnormal returns.
  - The LLM portfolios were undiversified and tilted toward momentum, large caps and growth, and were driven by how much media attention a company gets ([NBER](https://www.nber.org/papers/w35153), [scienceofmoney](https://www.scienceofmoney.org/when-chatbots-play-stock-picker-what-ai-actually-recommends-for-your-portfolio-559/)).
- **AIEQ** (an ETF run on IBM Watson since Oct 2017): lagged the S&P 500 by about 62% cumulatively by Apr 2024, with 804% turnover and a 0.75% fee ([Seeking Alpha](https://seekingalpha.com/article/4684579-aieq-time-to-give-this-ai-powered-etf-the-old-yeller-treatment), [pluang](https://pluang.com/en/news-feed/etf-aieq-strategi-ai-yang-tidak-meyakinkan-masih-tertinggal-dari-pasar)).
- **SEC "AI washing" cases** (Mar 2024): Delphia and Global Predictions were fined $225k and $175k for claiming AI capabilities they did not have ([SEC](https://www.sec.gov/newsroom/press-releases/2024-36)).
- **Conclusion:** the strong 2026 LLM-arena returns are short, paper-traded and concentrated in AI-infrastructure stocks. They are not evidence of lasting alpha.

## 4. How track records are presented (a taxonomy)
1. **Backtest as the headline**, disclosed in fine print: Danelfin, TipRanks, Zacks, SA Quant before 2020, WallStreetZen, ProPicks historical, Kavout, Tickeron.
2. **Live model portfolio with no real money**: Alpha Picks, SA PRO Quant Portfolio, ProPicks since Nov 2023, Stockopedia since 2013 (capital return only).
3. **Average of all picks**: Motley Fool. Inflated by outliers; the median is hidden.
4. **Real money**: only the AAII Shadow Stock portfolio (since 1993).
5. **Third-party or forward audit**:
   - Hulbert Ratings, which newsletters pay to be tracked ([Hulbert](https://hulbertratings.com/honor-roll/)).
   - Danelfin's forward audit site.
   - Rallies' public trade logs.
   - Trade Ideas' full log, visible only to paying users.

No one publishes all of the following together: every alert with a timestamp, results measured from a price subscribers could actually get, the median and the hit rate, per-model accuracy, and a tamper-proof record.

## 5. Complaints that recur across products
1. **Backtests vs reality.** Danelfin, Zacks, Tickeron and TipRanks results do not match what users experience.
2. **Upselling, renewal and cancellation problems.** Motley Fool (Trustpilot 2.4), Zacks (1.6–1.8), Seeking Alpha, Tickeron, Magnifi and TipRanks. This is the most common complaint, and the FTC has acted on it before.
3. **The price moves after the alert.** Alpha Picks entry pops; Trade Ideas slippage of 20–40%.
4. **A score with no reason attached.** Danelfin.
5. **Ratings that swing too much.** SA Quant flips on a single revision.
6. **Weak or expensive EU coverage.** Stockopedia's add-ons; most US products do not cover EU stocks at all.
7. **Too few or too many signals.** Trade Ideas gave one user only 4 ideas; Tickeron and daily emails are noisy.
8. **Annual-only billing.** Alpha Picks and Motley Fool; Zacks Premium is annual.

## 6. Gaps: what nobody does well
- **Alerts sent only when conviction is high.** Every major service sends on a calendar (1st/15th, Thursdays, monthly refresh) or floods daily emails. None sends only when several independent models agree and says so.
- **SMS for long-term research picks.** SMS is used only by day-trading and penny-stock alert shops, which have poor reputations. No quant or ML research brand uses SMS as its main pick channel.
- **An honest, full, tamper-proof live record.** Record-keeping ranges from backtest headlines to curated live records; none publishes every alert with hash-stamping, the median and the hit rate.
- **An explanation of why.** Scores come with factor lists (Danelfin, SA grades) or long human essays (Motley Fool). None pairs a short factor breakdown with a readable thesis and pre-set exit conditions for every pick.
- **Results measured the way subscribers trade.** No one measures results from the next open after the alert, net of the price moving on the alert.
- **Per-model accuracy.** No one publishes how accurate each model has been, or how often the models agree.
- **EU-native coverage.** Only Danelfin (ML), Stockopedia (UK-centric, add-ons) and InvestingPro cover the EU seriously. Pricing is in USD or GBP, and there is no EU-language (e.g. Slovene or German) pick explanation.
- **Plain cancellation and monthly billing** in the higher-priced pick products.

---

## 7. Implications for our build
1. **Alerts are sent only when conviction is high.** Send an SMS only when at least 3 of N independent models agree and the combined score passes a published threshold. Publish the rule and the historical alert frequency (for example, "about 2–6 alerts a month"). Never send on a calendar. This is our main point of difference against Alpha Picks and Motley Fool (fixed dates) and Danelfin and Zacks (daily emails).
2. **Live track record only, built to be verifiable.**
   - From day one, write every alert to an append-only public ledger: timestamp, ticker, direction, conviction, the prices at send time and at the next open, and a SHA-256 hash published before sending.
   - Show every pick, including losers.
   - Headline numbers: an equal-weighted portfolio, the median pick, the hit rate vs benchmark, and the maximum drawdown.
   - Measure from the next open after the alert, not the signal price.
   - Any backtest goes on a separate page with a clear label and never appears in the hero.
   - Budget for a Hulbert-style third-party tracker once 12 months of live data exist.
3. **Show accuracy per model and how often the models agree.** The research-data section should show each model's forward hit rate and how often "all models agree" signals beat "split" signals. Nobody publishes this, and it fits our research-platform positioning.
4. **Explain every pick.**
   - Each SMS links to a pick page with: the factor breakdown (Danelfin-style signal bars), which models agreed and by how much, a short LLM-written thesis grounded in cited data (filings, estimate revisions, prices), and exit conditions set at entry.
   - Exit and downgrade alerts also go by SMS.
5. **LLMs explain and pull out events; they do not pick.** The NBER evidence says pure LLM picks carry no significant alpha and chase media attention. Use factor and ML models for picking, and LLMs for explanations, news and event extraction, and Q&A. Describe the model stack concretely on a methodology page to avoid "AI washing" risk.
6. **Reduce the price move after an alert.**
   - Apply a liquidity filter (a minimum market cap and average daily volume, so subscriber buying does not move the price).
   - Send at fixed windows (for example, after the close or before the pre-market) with a reference price of "next open".
   - Do not stagger sends across subscribers; it is unfair to later recipients.
7. **SMS format** (under 160 characters): `[Brand] BUY ASML · Conviction 4/5 · 3/3 models · Horizon ~3m · Why + exit: brand.co/p/xxxx · STOP to opt out`.
   - Channels: SMS first, with push, WhatsApp and Telegram as backups (eToro Tori already works in WhatsApp and Telegram).
   - For US subscribers, register 10DLC or a short code before launch, and keep crypto out of SMS entirely (carriers block it).
8. **Coverage and currency.** At launch, cover STOXX 600 plus the S&P 500 or Russell 1000, with benchmarks by region (STOXX 600 for EU picks, S&P 500 for US picks). Price in EUR. EU coverage should be included, not a paid add-on (a Stockopedia complaint). Treat Danelfin as the main head-to-head competitor, and win on SMS, conviction gating, the live ledger and written theses.
9. **Pricing and billing.**
   - Market anchors: Seeking Alpha $299/yr, Motley Fool $99–199/yr, Zacks $249/yr, Alpha Picks $499/yr, Danelfin $29–179/mo, TipRanks $30–50/mo, IBD $699/yr.
   - Proposal: around €19–29/mo or €199–249/yr for SMS alerts plus the data, offered monthly (Alpha Picks has no monthly plan).
   - One-click cancellation, a renewal reminder email 7 days before an annual charge, and no upsell emails in the first 30 days. This targets the most common complaint in the category and the conduct the FTC fined RagingBull for.
10. **Compliance built into the product** (for legal review):
    - Every alert and pick page carries the disclosures required for investment recommendations under the EU Market Abuse Regulation (MAR): who produced it, date and time, and conflicts of interest ([ESMA](https://www.esma.europa.eu/press-news/esma-news/requirements-when-posting-investments-recommendations-social-media)).
    - Keep recommendations generic, not personalised, to stay outside MiFID "investment advice". Confirm this with the Slovenian regulator (ATVP) or counsel (UNVERIFIED).
    - No testimonials or earnings claims (RagingBull precedent).
11. **Website design** (award-level, research-first):
    - The hero is the live ledger itself: a real-time count of alerts, hit rate, median and drawdown, all updating.
    - Each pick page reads like a research note: factor bars, model-agreement graphic, thesis, exit rules.
    - A methodology page and an "all picks, including losers" table replace the usual cumulative-return banner. Transparency is the brand.