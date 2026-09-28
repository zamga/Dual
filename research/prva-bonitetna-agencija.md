# Prva bonitetna agencija (EBONITETE.SI): Teardown and Attack Plan

_Research date: 2026-09-28. Their site (ebonitete.si) blocked our fetcher, so the facts below come from search-indexed pages from them, AJPES, D&B, CompanyWall and registry aggregators. Items marked **[verify]** need a check with a live login or trial._

---

## 1. Target snapshot

| Item | Fact |
|---|---|
| Legal entity | PRVA BONITETNA AGENCIJA, d.o.o., Tehnološki park 24, 1000 Ljubljana (branch in Limbuš, Maribor area) |
| Founded | 9 Mar 2007. The rating business started in late 2013, when the EBONITETE.SI app was finished |
| Representative | Dragica Razboršek. She also represents the sister company Prva finančna agencija d.o.o., which buys and collects receivables |
| Scale | Revenue about **€2.4–2.5M**, about **21–23 employees** (registry aggregators, latest filed year) |
| Sister company | Prva finančna agencija (debt collection and receivables purchase): about **€3.7M revenue, 19 employees** (2025) |
| Product | EBONITETE.SI, a web app covering **245k+ Slovenian business entities** |
| Score | Proprietary "PRO boniteta", scored **1–10 where 10 is best**. This runs opposite to AJPES S.BON (SB1 is best), which confuses users |
| Models shown | Altman Z, Kralicek quick test, discriminant analysis |
| Data surfaced | Ownership and representatives, financial statements, auditor opinions, insolvency proceedings with claims filed, "payment habits", blocked bank accounts, unpaid taxes |
| Monitoring | "Dnevni informator", a daily email covering more than 20 event types per watched company |
| Integration | API and web services for CRM/ERP alerting |
| Packaging | Basic, Basic Plus, Business, Advanced, Advanced Plus, Individual. **12-month minimum**, prices not published (sales-led) **[verify list prices]** |
| Foreign coverage | Foreign company reports are prepared on request, as a manual or resold report rather than native data |

## 2. Competitive board (Slovenia)

| Player | Position | Price signal |
|---|---|---|
| **AJPES** (state registry) | Original source of annual reports. Runs the S.BON model (SB1–SB10, SB10d = default) | eS.BON **€45.90**, S.BON-1 **€62.38** per report |
| **Dun & Bradstreet SI** (ex-Bisnode: GVIN, Bonitete.si, iBON) | Incumbent. Deepest dataset (real estate, public procurement, trademarks, media) plus a global network | Report **€20** for subscribers, **€40** for non-subscribers |
| **CompanyWall** | Regional aggregator (SI, HR, RS, BA, ME, HU, RO). Freemium, sells "excellence certificates" to the companies it rates | One-day pass, self-serve |
| **Bizi.si** (TSmedia) | Directory plus basic credit data. Mass-market SEO | Freemium |
| **EBONITETE.SI** | Mid-market SI SMEs, sales-led, heavy SEO on company pages | Opaque, 12-month lock-in |

**Core read:** everyone above (AJPES, D&B, CompanyWall, Bizi and EBONITETE) is **repackaging the same public data**: AJPES annual reports, the FURS tax-debtor list, blocked accounts, insolvency notices and the court register. The scores are different transforms of the same inputs. That makes it a **commodity market competing on UI and sales reach**. None of them own a proprietary, real-time data asset in Slovenia.

## 3. Where EBONITETE is structurally weak

1. **Stale fundamentals.** Annual reports for year N arrive in AJPES around April–May of N+1. EBONITETE itself said FY2023 data would land in May 2024. A company scored in March 2026 is being judged on FY2024 figures, which are **up to about 15 months old**. The "daily updates" only cover event flags such as blocks and tax debt. Those are **lagging indicators**: when an account block shows up, the money is already lost.
2. **No proprietary signal.** The data surfaced is either public or from the group's own collection files ("payment habits"). The second source is thin and slanted toward companies already in collections. There is no view of how a company pays its suppliers when nothing has gone wrong.
3. **Score UX friction.** A 1–10 scale that runs opposite to AJPES S.BON, three textbook models (Altman 1968, Kralicek) and no published back-test. There is no Gini/AUC and no probability-of-default calibration, so customers can't benchmark it.
4. **Commercial friction.** Hidden prices, a 12-month minimum and a sales call before buying. That is a 2010 SaaS motion in a market where CompanyWall sells a one-day pass by card.
5. **Stops at "information".** The score doesn't turn into a decision: no recommended credit limit, no payment-term advice and no one-click cover (insurance, factoring, collections). The group owns a collection company, yet the product doesn't close that loop for the user.
6. **Slovenia-only depth.** Slovenian exporters sell mainly into HR, RS, BA, AT, DE and IT, and foreign reports are manual, on request. CompanyWall is already regional.
7. **Possible conflict-of-interest perception.** The same group rates companies and collects/buys their debts. It isn't illegal, but a rival can position against it: "neutral data, no collection arm".

## 4. Where we win: the product thesis

**Rule: don't build a better scorecard on the same public data. Own a data stream nobody else has, then give away the scorecard.**

### Wedge A: payment data from e-invoices (the moat)
- **Catalyst:** Slovenia makes **structured B2B e-invoicing mandatory for all businesses from 1 Jan 2028** (e-SLOG / EN 16931 XML). The CTC real-time reporting to FURS was dropped, so **the state won't hold a central invoice ledger**. Invoice and payment data will sit with access points, accounting software and banks. That is the gap.
- **Mechanism:** a free (or near-free) AR/AP layer for SMEs: e-invoice sending and receipt, dunning, cash-flow view. In exchange (give-to-get, like D&B **Paydex** trade tapes or **Waze**-style crowd data), the SME contributes anonymised invoice → due date → paid date records per counterparty.
- **Output:** a **live DSO / days-beyond-terms score** per company, updated weekly, **12–15 months ahead** of the annual report. In Slovenia about 40% of B2B sales are on credit, average terms are 53 days, **49% of credit invoices are overdue and 7% become bad debt** (Atradius 2025). A payment-behaviour signal is the one that matters there.
- **Distribution:** partner with or integrate into the leading Slovenian accounting and e-invoicing platforms (Pantheon, Minimax, e-računi, Metakocka and similar), with revenue share on the data. Aim to be the data co-op, not the invoicing vendor.

### Wedge B: consented bank data (PSD2 AIS), paid by the rated company
- Flip who pays. The **rated company** connects its bank accounts through PSD2 account information (AIS) to get a **"Verified liquidity" badge** and an up-to-date score to show its suppliers, banks and public tenders. This copies Nav (US) and the "bring your own credit file" motion. CompanyWall already sells certificates, but those rest on stale public data. Ours would be backed by the company's own bank data.
- Result: a second revenue line and a real-time dataset **no competitor can scrape**.

### Wedge C: move from score to decision (embedded finance)
- For every counterparty, output a **recommended credit limit, recommended payment term and a price for cover**.
- One click to: **trade credit insurance** quote (Coface, Allianz Trade, Atradius, SID-PKZ), **invoice financing / factoring**, or a **B2B BNPL** partner in the style of Hokodo, Billie or Mondu.
- We earn **per-bound-policy / per-financed-invoice commissions**, a bigger pool than subscriptions. Take rates on financed receivables are in the 0.5–2% range, compared with €20–60 per report.

### Wedge D: network and fraud graph
- Ownership, director and address graph across SI plus the ex-YU region. Flags: **phoenix patterns** (directors behind earlier bankruptcies), **contagion** (a parent or sister company blocked), sudden ownership flips, many companies at one address. The techniques come from AML graph analytics.
- Nobody in the local market sells this as a first-class feature.

### Wedge E: regional unified model
- One PD-calibrated score across **SI, HR, RS, BA, MK, ME** on a single probability-of-default scale, built on each country's open registries: FINA/Sudski registar (HR), APR (RS) and so on.
- Price for the **exporter** use case: "check any ex-YU buyer in 10 seconds".

### Hygiene items (cheap, and they flip deals)
| EBONITETE today | Us |
|---|---|
| Opaque pricing, 12-mo minimum | Public pricing, free tier, monthly plans, pay-per-report by card |
| 1–10 textbook score | Calibrated **12-month PD %** plus letter grade, **published back-test (AUC/Gini) every quarter** |
| Black-box result | **Reason codes** ("score −2: DSO worsened 18 days, director linked to 2 bankruptcies") |
| Email alerts | Webhooks, Slack/Teams, native ERP plugins, bulk portfolio re-score through the API |
| Manual foreign reports | Native regional data |
| Human-written reports | LLM-generated credit memo in SI, HR or EN, plus Q&A over the filings (auditor qualifications, notes) |

## 5. Positioning line
> **"Others show you last year's balance sheet. We show you how your buyer paid their suppliers last week, and what credit limit to give them."**

## 6. Monetisation stack
1. **Free:** company lookups, basic flags (SEO acquisition, same as the incumbents).
2. **Pro subscription:** monitoring, portfolio, alerts, API. Per-seat plus per-monitored-entity, monthly, no lock-in.
3. **Data co-op:** contributors get a discount or free Pro. Non-contributors pay full price. This is the classic credit-bureau reciprocity rule.
4. **Verified badge:** annual fee paid by the rated company (Wedge B).
5. **Embedded finance commissions:** insurance, factoring, BNPL (Wedge C). This becomes the biggest line at scale.
6. **Enterprise and bank feeds:** bulk data, model licensing for banks and leasing companies (IRB / early-warning inputs).

## 7. Build vs. buy
- **Build** the moat pieces (Wedges A and B). No incumbent has them and they can't be bought locally.
- **Buy or roll up** distribution. EBONITETE is a founder-led business with about €2.5M revenue, about 21 staff, a recurring subscriber base and strong SEO on company pages. The structure: acquire the company, re-platform its subscribers onto the payment-data product, and carve out or keep the collection sister company as a separate **Wedge C collections partner** (this also removes the conflict-of-interest issue). The entry multiple depends on churn, gross margin and subscriber count, all **[verify]** in diligence. The strategic value is the **subscriber base plus traffic**, not the scoring IP. An earn-out tied to subscriber retention after migration protects the downside.
- **Alternative:** partner with a regional player (CompanyWall) for data coverage while we own the payment-data layer.

## 8. 90-day execution sequence
1. **Weeks 0–2:** buy EBONITETE (trial or Basic), D&B GVIN and CompanyWall accounts. Capture real prices, feature gaps and data latency by testing 50 companies known to have defaulted. **[verify all "stale data" claims with timestamps]**
2. **Weeks 2–6:** build the SI registry ingest (AJPES open data, FURS tax debtors, insolvency notices, court register) and the graph. Train a baseline PD model and publish its back-test.
3. **Weeks 4–10:** sign 1–2 accounting / e-invoice platforms for a data co-op pilot. Get PSD2 AIS access through a licensed aggregator.
4. **Weeks 8–12:** launch public pricing, a free tier, the explainable score and the credit-limit recommendation. Pilot one credit-insurance referral partner.
5. **Gate:** more than 500 contributing SMEs, or more than 50k invoices a month, before scaling Wedge A sales. Below that the payment signal is too thin.

## 9. Kill risks to underwrite
- **Contributor cold-start:** mitigated by making the free AR tool useful on its own, and by the 2028 mandate forcing SMEs to adopt some e-invoicing tool.
- **GDPR / ZVOP-2:** sole traders (s.p.) are natural persons. Payment data about them needs a legitimate-interest assessment and DPIA. Company (d.o.o./d.d.) data is lower risk.
- **Incumbent response:** D&B has the money to copy us but moves slowly locally. EBONITETE has neither the capital nor the engineering bench (about 21 staff) to build a data co-op.

---

### Sources
- [EBONITETE.SI (EN)](https://www.ebonitete.si/en/) · [Subscriptions](https://www.ebonitete.si/en/subscriptions/) · [Advantages](https://www.ebonitete.si/en/advantages/) · [Company credit rating](https://www.ebonitete.si/en/company-credit-rating/) · [Monitoring / daily informator](https://www.ebonitete.si/monitoring-podjetij-funkcionalnost-dnevni-informator/) · [CRM integration](https://www.ebonitete.si/crm-sistem/) · [Annual report timing](https://www.ebonitete.si/blog/post/rok-za-oddajo-letnih-porocil-2023)
- [Bizi.si company profile](https://www.bizi.si/PRVA-BONITETNA-AGENCIJA-D-O-O/) · [CompanyWall profile](https://www.companywall.si/podjetje/prva-bonitetna-agencija-doo/MM1oiYyY) · [Prva finančna agencija group page](https://www.prvafina.si/en/skupina/prva-bonitetna-agencija/) · [LinkedIn](https://si.linkedin.com/company/prva-bonitetna-agencija-d-o-o-)
- [AJPES S.BON scale](https://www.ajpes.si/bonitetne_storitve/s.bon_ajpes/bonitetna_lestvica) · [AJPES price list (PDF)](https://www.ajpes.si/doc/AJPES/Cenik/Cenik_bonitetnih_in_drugih_trznih_storitev.pdf)
- [D&B GVIN](https://www.bisnode.si/produkti/bisnode-gvin/) · [D&B Bonitete](https://www.dnb.com/sl-si/produkti/bisnode-bonitete/) · [CompanyWall about](https://www.companywall.si/o-nas) · [CompanyWall pricing](https://www.companywall.si/Home/Cenik)
- [VATupdate: SI mandatory B2B e-invoicing 2028](https://www.vatupdate.com/2025/12/10/slovenia-confirms-mandatory-b2b-e-invoicing-for-all-businesses-from-january-2028/) · [vatcalc: e-SLOG 2028](https://www.vatcalc.com/slovenia/slovenia-b2b-e-invoicing-e-slog-on-pause/) · [EDICOM Slovenia](https://edicomgroup.com/electronic-invoicing/slovenia)
- [Atradius: B2B payment practices Slovenia 2025](https://atradiuscollections.com/us/knowledge-and-research/reports/b2b-payment-practices-trends-slovenia-2025)
