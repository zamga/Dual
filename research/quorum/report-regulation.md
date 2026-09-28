# Law on publishing stock recommendations to paying subscribers (US / EU / Slovenia)

## Verification status: please read first
- **No live checks were possible in this run.** The session's WebSearch budget was already used up (200 of 200 calls) before this task began. WebFetch was blocked by egress policy for every legal source I tried: supreme.justia.com, law.cornell.edu, eur-lex.europa.eu, sec.gov, esma.europa.eu and atvp.si.
- **Where the content comes from.** Everything below is from model knowledge (cutoff June 2026).
- **What the URLs are.** Each URL points to the canonical primary-source location so a human or a later agent can check the claim. I did not fetch any of these pages in this run.
- **What UNVERIFIED means here.** It marks items I am specifically unsure of: exact quotations, article sub-letters, penalty amounts, case outcomes after 2024, and anything whose status in 2025–26 may have changed.
- **What is on firmer ground.** The statutory definitions, the Lowe holding, the structure of MAR Art. 20 and 2016/958, and the MiFID "personal recommendation" test are well established. Even so, **counsel should verify all of it before launch.**

---

## 1. United States

### 1.1 The statute and the publisher exclusion
- **Definition.** Advisers Act §202(a)(11) defines an "investment adviser" as anyone who, for compensation, is in the business of advising others, directly or through publications or writings, on the value of securities or the advisability of buying or selling them. https://www.law.cornell.edu/uscode/text/15/80b-2
- **Exclusion (D).** This excludes "the publisher of any bona fide newspaper, news magazine or business or financial publication of general and regular circulation." (same URL)
- **Lowe v. SEC, 472 U.S. 181 (1985).** https://supreme.justia.com/cases/federal/us/472/181/
  - **Facts.** Lowe's adviser registration had been revoked after criminal convictions. The SEC tried to stop his paid newsletters. The Court held the newsletters fell within the exclusion and decided the case on statutory grounds, so it did not reach the First Amendment.
  - **Concurrence.** White J., with Burger C.J. and Rehnquist J., concurred and would have decided it on First Amendment grounds.
  - **Core reasoning (close paraphrase; exact wording UNVERIFIED).** Congress aimed at "personalized advice attuned to a client's concerns." The two qualifications "precisely differentiate 'hit and run tipsters' and 'touts' from genuine publishers."
    - **"Bona fide"** means "disinterested commentary and analysis as opposed to promotional material disseminated by a 'tout.'"
    - **"General and regular circulation"** excludes "people who send out bulletins from time to time on the advisability of buying and selling stocks."
    - Lowe's letters qualified because they were "offered to the general public on a regular schedule."
    - As long as communications "remain entirely impersonal and do not develop into … fiduciary, person-to-person relationships," publications are "at least presumptively" excluded.
- **The three-prong test as later courts and the SEC state it.**
  1. **Impersonal:** the advice is not tailored to any specific client's portfolio or needs.
  2. **Bona fide:** the content is disinterested and not promotional touting. Scalping or paid promotion defeats this prong.
  3. **General and regular circulation:** the publication is offered to the general public on a regular schedule and is **not timed to specific market activity**.
  - The "timed to specific market activity" wording is used in *SEC v. Park* (below). Whether that exact phrase appears in Lowe itself is UNVERIFIED.

### 1.2 Cases where alert or newsletter operators were treated as advisers or as fraudsters
| Case | Holding / relevance | Source |
|---|---|---|
| **SEC v. Park ("Tokyo Joe")**, 99 F. Supp. 2d 889 (N.D. Ill. 2000) | Internet stock-pick service emailing paying members. The motion to dismiss was denied and the publisher exclusion was not established, because (a) alerts were sent irregularly and timed to market activity, (b) Park scalped (bought, recommended, sold), so the content was not "bona fide," and (c) he answered individual members' emails, which is personalization. Settlement amount (~$750k) UNVERIFIED. | https://www.courtlistener.com/?q=%22SEC+v.+Park%22+%22Tokyo+Joe%22 |
| **SEC v. Blavin**, 760 F.2d 706 (6th Cir. 1985) | A newsletter that was irregular, had limited distribution and touted stocks the author held was **not** bona fide or of general and regular circulation, so the author was an adviser. | https://www.courtlistener.com/?q=%22SEC+v.+Blavin%22 |
| **In re Weiss Research** (SEC admin., 2006) | Newsletter "auto-trading": brokers executed newsletter trades automatically in subscribers' accounts. The SEC treated this as unregistered adviser activity, outside the exclusion. Release number and sanction amounts UNVERIFIED. | https://www.sec.gov/enforcement-litigation/administrative-proceedings (UNVERIFIED path) |
| **In re Terry's Tips** (SEC admin., 2006) | Options newsletter plus auto-trading. Same theory as Weiss (UNVERIFIED details). | same |
| **SEC v. Pirate Investor LLC / Agora**, 580 F.3d 233 (4th Cir. 2009) | A newsletter publisher was held liable under **Rule 10b-5** for false claims in a paid stock report. The publisher exclusion does not shield a publisher from anti-fraud law, and the First Amendment defense was rejected. | https://www.courtlistener.com/?q=%22Pirate+Investor%22 |
| **SEC v. Capital Gains Research Bureau**, 375 U.S. 180 (1963) | An adviser buying before recommending to subscribers and selling into the rise (**scalping**) without disclosure is fraud under §206. | https://supreme.justia.com/cases/federal/us/375/180/ |
| **Zweig v. Hearst Corp.**, 594 F.2d 1261 (9th Cir. 1979) | A financial columnist who bought before touting a stock and sold after was liable under 10b-5. Scalping by a non-adviser publisher is fraud. | https://www.courtlistener.com/?q=%22Zweig+v.+Hearst%22 |
| **SEC v. Constantinescu et al. ("Atlas Trading")**, S.D. Tex., filed Dec 2022 | Eight Twitter/Discord "influencers" were alleged to have run a ~$100M scalping scheme through stock picks. The outcome of the parallel criminal case is UNVERIFIED. | https://www.sec.gov/newsroom/press-releases (search "social media influencers" Dec 2022) |
| **SEC v. Andrew Left / Citron**, C.D. Cal., filed July 2024 | A research publisher was alleged to have publicly recommended positions and then quickly traded the opposite way (~$20M). The outcome is UNVERIFIED. | https://www.sec.gov/newsroom/press-releases (search "Andrew Left") |

### 1.3 How the test applies to SMS alerts and "buy now" signals
- **Impersonal: low risk if designed for it.** The same message goes to every subscriber on a tier, with no reference to anyone's holdings or size.
  - Risk returns with any of these: 1:1 replies about a user's own positions (Park), portfolio-linked alerts, per-user sizing, or an AI chat that answers "should *I* buy X?".
- **Bona fide: low risk if staff trading is embargoed and there are no issuer payments.**
  - Scalping destroys this prong (Park, Blavin) and is separately 10b-5 fraud (Zweig, Capital Gains).
  - Securities Act §17(b) requires disclosure of any consideration received from an issuer or underwriter for describing a security. https://www.law.cornell.edu/uscode/text/15/77q
- **General and regular circulation: the main risk for our product.** A service that fires an SMS "whenever the models agree" is by design a "bulletin from time to time" timed to market activity. That is exactly the Lowe/Park fact pattern.
  - **Mitigation:** release picks only in fixed, published issue slots and treat the SMS as notice of a scheduled issue.
  - **Market precedent (UNVERIFIED):** Seeking Alpha "Alpha Picks" releases picks on a fixed twice-monthly schedule, and Motley Fool Stock Advisor on scheduled days.
  - Other risk factors: capping subscriber numbers ("only 200 seats"), invite-only channels, and private Discord/Telegram rooms with staff. These undercut "general" circulation (inference from Blavin; UNVERIFIED as a standalone rule).
- **No auto-trading, copy-trading or broker execution.** The Weiss and Terry's Tips theory applies.
- **Disclaimers do not cure conduct.** Park lost the exclusion on facts despite presenting itself as a publisher.
- **If the exclusion fails (US, for a non-US firm):**
  - The foreign private adviser exemption under §203(b)(3) requires fewer than 15 US clients and investors and under $25M from them, which is impossible for a subscription product. https://www.law.cornell.edu/uscode/text/15/80b-3
  - The alternative is SEC registration. Non-US advisers are generally not subject to the §203A under-$100M bar (moderate confidence; UNVERIFIED). Registration brings Form ADV, Form CRS, the Marketing Rule and a compliance program.
- **State law.** Most states copy the publisher exclusion. Uniform Securities Act wording, possibly "general, regular, and paid circulation", is UNVERIFIED.
- **CFTC.** If we cover futures or crypto derivatives, CTA registration applies, with the Rule 4.14(a)(9) exemption for advice not directed to specific client accounts. https://www.ecfr.gov/current/title-17/chapter-I/part-4/subpart-A/section-4.14

### 1.4 Performance claims: SEC and anti-fraud
- **Marketing Rule 206(4)-1.** Adopted Dec 2020 (Rel. IA-5653), compliance from 4 Nov 2022. It applies **only to SEC-registered advisers**. https://www.ecfr.gov/current/title-17/chapter-II/part-275/section-275.206(4)-1 · https://www.sec.gov/files/rules/final/2020/ia-5653.pdf
  - **Hypothetical performance** includes model, backtested and paper-portfolio results not achieved by an actual account. It is allowed only with:
    - policies ensuring it is relevant to the audience's financial situation and objectives;
    - enough information to understand the criteria and assumptions;
    - disclosure of risks and limitations.
  - Other rules: net performance must be shown with gross; 1-, 5- and 10-year periods; no cherry-picking; no implication of SEC approval.
  - A paper track record of published picks is "hypothetical" under this rule.
- **Enforcement on hypothetical performance.**
  - Sept 2023 sweep: nine advisers charged for advertising hypothetical performance on public websites without the required policies. Combined penalties of about $850k are UNVERIFIED.
  - Titan Global (Aug 2023): an advertised hypothetical annualized return of about 2,700%, settled for about $1M. Amounts UNVERIFIED.
  - https://www.sec.gov/newsroom/press-releases (search "marketing rule")
- **"AI-washing".** Delphia (USA) and Global Predictions settled (18 Mar 2024) for false claims about their use of AI or ML, paying $225k and $175k. https://www.sec.gov/news/press-release/2024-36. The SEC withdrew its Predictive Data Analytics proposal in June 2025 (UNVERIFIED date), but fraud-based AI claims remain enforceable.
- **Publishers outside the Marketing Rule** remain subject to:
  - **Rule 10b-5.** False track records or AI claims made "in connection with" securities trading (Pirate Investor).
  - **FTC Act §5 and state UDAP law.** Consumer advertising of the subscription.

### 1.5 FTC: earnings claims and subscription marketing
- **Notice of Penalty Offenses on money-making opportunities (Oct 2021).** It lets the FTC seek civil penalties (roughly $53k per violation in 2025; UNVERIFIED) against recipients-on-notice for false or unsubstantiated earnings claims and atypical-results testimonials. https://www.ftc.gov/enforcement/penalty-offenses/money-making
- **Endorsement Guides, 16 CFR 255 (revised June 2023).** If a testimonial shows results consumers generally will not achieve, the ad must clearly disclose generally expected results. "Results not typical" is not a safe harbor. https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255
- **Consumer Reviews and Testimonials Rule, 16 CFR 465 (effective Oct 2024).** It bans fake or AI-generated reviews and testimonials, with civil penalties. https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465
- **Trading-alert precedents.**
  - FTC v. Raging Bull (filed Dec 2020): deceptive earnings claims about following its trades, plus cancellation obstacles. Settled; ~$2.4M UNVERIFIED.
  - FTC v. Warrior Trading (2022): ~$3M UNVERIFIED.
  - https://www.ftc.gov/legal-library/browse/cases-proceedings
- **Cancellation law.**
  - ROSCA (15 USC 8401–8405) requires clear material terms, express informed consent and a simple cancellation method. https://www.law.cornell.edu/uscode/text/15/chapter-110
  - The FTC "click-to-cancel" rule was vacated by the 8th Circuit on 8 July 2025 (UNVERIFIED date).
  - California's auto-renewal law as amended by AB 2863 (effective 1 July 2025) requires online click-to-cancel and consent to renewal. https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240AB2863
- **SMS (US, adjacent).**
  - TCPA consent and records apply.
  - CTIA opt-out rules: STOP/HELP handling.
  - A2P 10DLC or toll-free verification is required (carrier content rules for "financial" messages UNVERIFIED).
  - The FCC one-to-one consent rule was vacated (11th Cir., Insurance Marketing Coalition v. FCC, Jan 2025).

---

## 2. European Union

### 2.1 MAR (EU) 596/2014: investment recommendations
Regulation: https://eur-lex.europa.eu/eli/reg/2014/596/oj

- **Art. 3(1)(34), "information recommending or suggesting an investment strategy."** Information:
  - **(i)** produced by an independent analyst, an investment firm, a credit institution, **"any other person whose main business is to produce investment recommendations"**, or their staff, which directly or indirectly expresses a particular investment proposal; or
  - **(ii)** produced by others, which **directly** proposes a particular investment decision.
- **Art. 3(1)(35), "investment recommendations."** Information recommending or suggesting an investment strategy, **explicitly or implicitly**, about instruments or issuers, **including any opinion on present or future value or price**, intended for distribution channels or the public.
- **Consequence for us.** An AI stock-picking company whose main business is picks falls in category (i). The stricter "additional" obligations of 2016/958 therefore apply (Art. 4 and Art. 6 below).
  - Numeric scores and ratings on each stock ("AI score 92/100") are at minimum *implicit* recommendations or opinions on future value. Treat them as in scope (conservative reading; no ESMA Q&A located on quant scores, so UNVERIFIED).
  - Distribution to paying subscribers should be assumed to be "intended for distribution channels" (ESMA Q&A position on subscriber-only distribution UNVERIFIED).
- **Instrument scope.** MAR covers instruments admitted to or traded on EU regulated markets, MTFs or OTFs (Art. 2). Many US large caps trade on EU MTFs such as Tradegate and German open markets, so assume US-stock picks are in scope too (inference; per-instrument check UNVERIFIED).
- **Art. 20(1).** Producers and disseminators must "take reasonable care to ensure that such information is objectively presented, and to disclose their interests or indicate conflicts of interest."
- **Art. 21.** A journalism carve-out applies unless the person derives an advantage or profit. Do not rely on it.
- **Art. 12(2)(d): EU anti-scalping.** It is market manipulation to voice an opinion on an instrument via traditional or electronic media after taking a position, and then profit from the opinion's impact without properly and effectively disclosing the conflict. See also the German BGH "Scalping" judgment, 6 Nov 2003, 1 StR 24/03 (Prior case; details UNVERIFIED).
- **Inside information.** CJEU C-302/20 (15 Mar 2022) held that information about the forthcoming publication of market-moving content can itself be precise inside information. Pre-release knowledge of a pick can therefore create insider-dealing and unlawful-disclosure exposure (Arts 7, 10, 14) for staff and anyone tipped. https://curia.europa.eu/juris/liste.jsf?num=C-302/20
- **Sanctions (Art. 30(2)).** Maximum administrative fines for Art. 20 breaches are at least €500k for natural persons and €1M for legal persons (Member States may set higher). Market manipulation carries up to €15M or 15% of turnover. Criminal law applies via Directive 2014/57/EU.

### 2.2 Delegated Regulation (EU) 2016/958: required content
Regulation: https://eur-lex.europa.eu/eli/reg_del/2016/958/oj. Exact article sub-letter numbering is UNVERIFIED; the elements themselves are high confidence.

- **"Expert" (Art. 1).** A category-(ii) person who repeatedly proposes investment decisions and presents as, or is reasonably believed to have, financial expertise. This matters for **founders' and staff personal social-media posts**.
- **Art. 2: identity** (all producers).
  - Name and job title of every natural person who worked on the recommendation, and the legal entity's name.
  - Investment firms and credit institutions must also name their competent authority.
  - Others subject to self-regulatory codes must reference those codes.
- **Art. 3: objective presentation** (all producers).
  - (a) Facts clearly distinguished from interpretation, estimates and opinion.
  - (b) All substantially material sources indicated.
  - (c) Sources reliable, or doubt flagged.
  - (d) Projections, forecasts and price targets labelled as such, with material assumptions.
  - (e) Date and time when **production was completed**, clearly and prominently.
  - **Proportionality clause.** Where disclosure is disproportionate to the length or form (non-written or short-form), give a clear and prominent reference to where the information can be directly and easily accessed, for example a direct link. This is the legal basis for an SMS carrying a link. Which articles contain this clause is UNVERIFIED; it appears in several.
- **Art. 4: additional objective-presentation duties** (our category).
  - Material sources, including the issuer, and whether the recommendation was disclosed to the issuer and amended before release.
  - **A summary of the valuation basis or methodology and its underlying assumptions**, plus a summary of **any changes** to them.
  - Where proprietary models are used, where detailed methodology can be accessed.
  - **The meaning of "buy/sell/hold"**, including the time horizon.
  - A risk warning, **including a sensitivity analysis of the relevant assumptions**.
  - The planned frequency of updates.
  - **Date and time of any price mentioned.**
  - **Date and time of first dissemination.**
  - If the recommendation differs from one on the same instrument in the prior 12 months, the change and the date of the prior recommendation.
  - **A list of all recommendations on any instrument or issuer disseminated in the preceding 12 months.** For each: dissemination date, the natural persons responsible, **price target and market price at dissemination**, direction, and the validity period of the target or recommendation.
  - ESMA reportedly reads "all" as all of the producer's recommendations, not only those on the same issuer (UNVERIFIED).
- **Art. 5: conflicts** (all producers). All relationships and circumstances reasonably expected to impair objectivity, including those of the firm, of staff involved in production, and of related legal persons and anyone with pre-release access.
- **Art. 6: additional conflict disclosures** (our category).
  - A net long or short position above **0.5%** of the issuer's share capital.
  - The issuer holding above 5% of the producer.
  - Other financial interests.
  - Market-maker or liquidity-provider role.
  - Lead manager of an offering in the past 12 months.
  - Investment-banking agreements.
  - **Any agreement with the issuer on producing the recommendation** (paid research).
  - Quarterly disclosure of the buy/hold/sell proportion over 12 months. Whether this applies beyond investment firms and credit institutions is UNVERIFIED, so do it anyway.
- **Arts 7–9:** third-party dissemination and summaries/extracts. Relevant if partners re-publish our picks.

### 2.3 ESMA guidance
- **MAR Q&A (ESMA70-145-111), section on investment recommendations.** Covers links as a disclosure method, the "expert" concept, and the 12-month list (item-level answers UNVERIFIED). https://www.esma.europa.eu/sites/default/files/library/esma70-145-111_qa_on_mar.pdf
- **ESMA Statement on investment recommendations on social media (ESMA70-154-2780, 28 Oct 2021).** MAR Art. 20 applies to social-media and short-form posts. Identity and conflicts must be disclosed; links are acceptable where character limits make full disclosure disproportionate (URL UNVERIFIED). https://www.esma.europa.eu
- **ESMA public statement on AI in retail investment services (30 May 2024).** It applies to MiFID firms; use it as a benchmark only. Management remains responsible for AI outputs, AI use must be disclosed to clients, and the content must be accurate (UNVERIFIED details).
- **EU Retail Investment Strategy** (finfluencer and marketing provisions). Its status as of Sept 2026 is UNVERIFIED.

### 2.4 MiFID II: general recommendation vs "investment advice"
- **Investment advice (licensable), Directive 2014/65/EU Art. 4(1)(4).** The provision of **personal recommendations** to a client. https://eur-lex.europa.eu/eli/dir/2014/65/oj
- **Personal recommendation, Delegated Reg. 2017/565 Art. 9.** A recommendation to a person as an investor that is **"presented as suitable for that person, or is based on a consideration of the circumstances of that person"**, to buy, sell or hold a particular instrument. It is **"not a personal recommendation if it is issued exclusively to the public."** https://eur-lex.europa.eu/eli/reg_del/2017/565/oj
- **Ancillary service.** "Investment research and financial analysis or other forms of general recommendation" is an **ancillary service** (MiFID Annex I Section B(5)). Standing alone it does not require authorization.
- **CESR Q&A "Understanding the definition of advice under MiFID" (CESR/10-293, April 2010)** (URL UNVERIFIED): https://www.esma.europa.eu/sites/default/files/library/2015/11/10_293.pdf
  - The test is substance over form.
  - Disclaimers such as "not advice" are not decisive if the message is presented as suitable or based on the person's circumstances.
  - A message sent to many people can still be personal if framed as suitable for each of them (specific paragraph references UNVERIFIED).
- **ESMA suitability guidelines (ESMA35-43-3172, 2022).** Automated tools that take user inputs and output recommendations are investment advice. Risk questionnaires that drive which picks a user receives cross the line.
- **Copy trading.** It can amount to portfolio management or advice. ESMA issued a supervisory briefing on copy trading in 2025 (UNVERIFIED).
- **If personalization is wanted later.**
  - Option 1: MiFID authorization as an investment firm. Initial capital of €75k under IFD Art. 9 for firms giving advice or reception/transmission without holding client money. https://eur-lex.europa.eu/eli/dir/2019/2034/oj
  - Option 2: operate as a **tied agent** (MiFID Art. 29) of a licensed firm.

### 2.5 Slovenia
- **ATVP (Agencija za trg vrednostnih papirjev)** is the competent authority for MiFID II investment firms and for MAR supervision and sanctions in Slovenia. https://www.atvp.si
- **ZTFI-1 (Zakon o trgu finančnih instrumentov, Ur. l. RS 77/2018 as amended)** transposes MiFID II and sets MAR sanctions. https://pisrs.si (search "ZTFI-1")
  - It defines "investicijsko svetovanje" (investment advice) per MiFID. Providing it requires authorization as a *borznoposredniška družba* or bank.
  - "Investicijske raziskave in finančne analize ali druge oblike splošnih priporočil" is an ancillary service. Specific ZTFI-1 article numbers are UNVERIFIED.
  - Whether Slovenia uses the MiFID Art. 3 optional exemption is UNVERIFIED; assume it does not.
  - The ZTFI-1 fine ranges for MAR Art. 20 breaches (*prekrški*) are UNVERIFIED.
- **No registration or notification** with ATVP is required to act as a MAR recommendation producer (MAR is directly applicable).
  - Recommended step: an informal written query to ATVP confirming our non-personal model before launch.
- **Adjacent Slovenian and EU consumer law.**
  - **ZVPot-1 and the Consumer Rights Directive:** a 14-day withdrawal right for the subscription, plus express consent to immediate performance.
  - **Directive (EU) 2023/2673:** requires an online **"withdrawal function" (button)** for distance contracts **from 19 June 2026**. https://eur-lex.europa.eu/eli/dir/2023/2673/oj
  - **ZVPNPP (Slovenia's UCPD implementation):** covers misleading performance and AI claims.
  - **Consumer-facing Slovene language** is required under ZJRS (UNVERIFIED specifics).
  - **ePrivacy / ZEKom-2:** SMS consent.
- **AI Act (EU) 2024/1689.** Investment recommendations are not Annex III high-risk. Art. 50 transparency duties apply from 2 Aug 2026: tell users when they are talking to an AI chatbot; AI-generated public-interest text needs labelling unless under human editorial responsibility. The "digital omnibus" may have changed timing (UNVERIFIED). https://eur-lex.europa.eu/eli/reg/2024/1689/oj

### 2.6 Other jurisdictions to geofence at launch (all UNVERIFIED specifics)
- **UK.**
  - Advising on investments (RAO Art. 53) covers "tip sheets."
  - The Art. 54 periodical-publication exclusion fails where the publication's principal purpose is to lead people to invest (PERG 7). Exclude the UK or obtain FCA authorization.
  - https://www.handbook.fca.org.uk/handbook/PERG/7/ · https://www.legislation.gov.uk/uksi/2001/544/article/54
- **Australia.** Even "general advice" needs an AFS licence. Exclude.
- **Canada.** NI 31-103 s.8.25 "advising generally" exemption, with disclosure of interests.
- **Switzerland.** FinSA covers only personal financial services, so general content is likely fine.

---

## 3. Structural choices that keep us a publisher/recommender rather than an adviser
| Rule | US basis | EU basis |
|---|---|---|
| Identical content per tier; no reference to any user's holdings, size or objectives | Lowe "impersonal" | 2017/565 Art. 9 "exclusively to the public" |
| Picks released only in **fixed, pre-announced issue slots**; SMS = notice of the scheduled issue; no ad hoc price-triggered "buy now" | Lowe/Park "general and regular circulation," not timed to market activity | Not required; also supports MAR objectivity (no urgency) |
| Exit rules (target, stop, horizon) published at entry; exits reported in the next scheduled issue | Same | Art. 4: validity period, update frequency |
| Open to the general public at a published price; no seat caps, invite-only rooms or private chat groups with staff | "General" circulation (Blavin, Park) | — |
| No suitability quiz, risk-profile routing of picks, "picks for you" copy, per-user position sizing, portfolio-import action advice, or 1:1 Q&A about personal positions (support and AI chat scripted to refuse) | Park (individual emails); Lowe person-to-person | Art. 9 "presented as suitable / based on circumstances"; CESR/10-293; ESMA suitability guidelines |
| No auto-trade, copy-trade, broker API execution or managed accounts | Weiss Research, Terry's Tips | MiFID portfolio management / RTO |
| Staff and firm trading embargo; pre-clearance; never trade against a pick | Capital Gains, Zweig, Park, Left | MAR Art. 12(2)(d), Arts 8/10/14; C-302/20 |
| No issuer-paid coverage; any referral or affiliate revenue disclosed | §17(b); "bona fide" | 2016/958 Art. 6 |
| Full, immutable track record including every loser, entry at the price at dissemination; backtests segregated and labelled | 10b-5; FTC §5; Marketing Rule logic | MAR Art. 20 objectivity; 12-month list |

---

## 4. Mandatory and recommended disclosure text elements

### 4.1 SMS (160 chars, GSM-7, per pick)
`[BRAND] Pick #0417 BUY ACME (US0000000000) ref $41.20 28.09.26 14:00 CET, 12m horizon. General research, not personal advice. Disclosures: brnd.eu/p/0417`
- **US:** add "Reply STOP to opt out" in the first message and periodically.
- **Brand in sender ID:** the alphanumeric sender ID should be the brand (EU).
- **Tone:** no urgency words ("now," "before it's too late").

### 4.2 Pick page (every recommendation; 2016/958 Arts 2–6)
1. **Instrument:** name, ISIN, ticker and venue.
2. **Recommendation:** rating (BUY/HOLD/SELL, with a link to definitions), price target if any, horizon or validity period.
3. **Reference price:** the price, its source and an ISO-8601 timestamp with UTC offset.
4. **Timestamps:** "Production completed: 2026-09-28T13:52:10+02:00". "First disseminated: 2026-09-28T14:00:00+02:00".
5. **Producer:** legal entity name, registered seat and registration number. The responsible natural person(s) with job titles (for example "Head of Research, approver"). "Signal generated by model ensemble v3.4.1 (see methodology)."
6. **Status:**
   - "This is an investment recommendation within the meaning of Art. 3(1)(35) Regulation (EU) 596/2014. It is issued exclusively to the public and is not a personal recommendation or investment advice under Directive 2014/65/EU. [Entity] is not an investment firm and is not authorised by ATVP to provide investment advice."
   - US version: "[Entity] publishes impersonal research of general and regular circulation; it is not registered as an investment adviser with the SEC or any state, and content is not tailored to any person's objectives, financial situation or needs."
   - Reference any self-regulatory code adopted, for example the CFA Institute Research Objectivity Standards (Art. 2(3)).
7. **Methodology summary:** data sources, model families, the consensus rule ("≥N of M models"), and what the score means. Link to the full methodology and to a **changelog of methodology or assumption changes**.
8. **Facts vs opinion:** facts and opinion in separate sections. Label forecasts or probabilities as forecasts, with their assumptions. Probabilities only if calibration evidence is published.
9. **Risk warning and sensitivity analysis:** for example, the effect on the score or target of ±1σ moves in the key factors; horizon risk.
10. **Change vs prior recommendation** on the same instrument in the last 12 months, with the date.
11. **Conflicts:** firm position (none / above or below 0.5%); staff holdings policy with the embargo statement; issuer relationships (none); paid research (none); referral or affiliate arrangements.
    - Suggested embargo statement: "Staff may not trade the instrument from production start until 5 trading days after dissemination and may never trade against a recommendation."
    - Benchmark for the window: the former NASD Rule 2711 used 30 days before and 5 after; FINRA Rule 2241 is now principles-based. https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241
12. **Links:** to the firm-wide **12-month list of all recommendations** (date, persons, target, market price at dissemination, direction, validity) and to the **quarterly buy/hold/sell distribution**.
13. **Performance warning:** "Past performance is not a reliable indicator of future results." State the reference period and currency effects. Voluntarily adopt the MiFID 2017/565 Art. 44(4) standard: 5 years or since inception, in complete 12-month periods, and performance never the most prominent feature.

### 4.3 Track-record and marketing text
- **Paper record:** "Hypothetical paper portfolio: returns assume entry at the reference price at the dissemination timestamp and exit per published rules; no actual account achieved these results; excludes commissions, spreads, taxes and FX costs [or state the assumptions]."
- **Backtests:** "BACKTESTED — HYPOTHETICAL. Generated with hindsight on data from [period]; subject to look-ahead, survivorship and overfitting bias; not live results." Show them only on a separate page, never in headline stats.
- **No earnings or income claims.** No "subscribers made X." Testimonials only with substantiated typical results. No AI-generated reviews.

---

## Implications for our build

**Legal posture and markets**
1. **EU (Slovenia) posture: MAR Art. 20 recommendation producer, "main business" category.** Implement the full 2016/958 Art. 2–6 disclosure set on every pick and every per-stock score page. Apply it to US-listed stocks too, since they are likely traded on EU MTFs.
2. **Stay outside MiFID.** Every output is "issued exclusively to the public."
   - Build **no** suitability questionnaire, risk-profile routing, "for you" personalization, per-user sizing, portfolio-linked action alerts, auto-trade, copy-trade or broker execution.
   - Personalization later requires a MiFID licence (€75k initial capital) or tied-agent status.
3. **US posture: the Lowe publisher exclusion.** Get a US securities counsel opinion before enabling US sign-ups. Until then, **geofence the US, and exclude UK and Australia at launch.**

**Picks, alerts and the website**
4. **Publication cadence (key design change to the user's "SMS when a good pick appears").**
   - Picks publish only in fixed issue slots: one daily slot, 14:00 CET (before the 09:30 ET US open; recheck during DST mismatch weeks), plus the scheduled weekly issue.
   - A consensus signal between slots is **queued** for the next slot.
   - The web issue publishes every slot even when there is no new pick; the SMS goes out only when a pick or exit is in the issue.
   - Exits follow rules published at entry and are reported in slots.
   - No intraday price-triggered texts.
5. **Tiers differ by data breadth, never by pick timing.** Every tier that includes picks gets them at the same second. If early access is ever sold, disclose it and treat the pre-release window as inside-information-sensitive.
6. **AI assistant and support.** Restrict them to explaining published data and methodology. Hard-refuse questions like "should I buy or sell, given my portfolio." Log conversations. Label the bot as AI (AI Act Art. 50).
7. **Website copy.** No "picks for you," "act now," "guaranteed" or "the AI predicts." Every "AI" claim must match the models actually used (Delphia / Global Predictions precedent).

**Data model and records**
8. **Data model: an append-only `recommendation` record.** Fields:
   - instrument (ISIN, venue);
   - direction, target, horizon/validity, exit rules;
   - reference price, price source and price timestamp;
   - production-completed timestamp and dissemination timestamp;
   - responsible persons and titles;
   - model version and methodology version;
   - prior recommendation ID and change summary;
   - conflicts snapshot.
   Hash-chain the records and never delete or edit them; corrections are new records. Retain ≥5 years.
9. **Auto-generated pages from that record:**
   - a per-pick disclosure page;
   - a firm-wide rolling 12-month list;
   - a per-instrument history;
   - a quarterly rating distribution;
   - a methodology changelog.
   Every SMS links to its pick page, which satisfies the 2016/958 proportionality clause.
10. **Track record page.**
    - Covers all picks since launch, open and closed, including losers.
    - Stats: hit rate, average and median return, max drawdown, vs a stated benchmark, in complete 12-month periods.
    - Standard label: "hypothetical paper portfolio."
    - Backtests sit on a separate, clearly labelled page, never in hero numbers or ads.

**Trading, conflicts and staff**
11. **Trading and conflicts policy, signed by all staff and founders (including family accounts).**
    - Pre-clearance of personal trades.
    - Embargo on covered instruments from production start until 5 trading days after dissemination.
    - Never trade against a pick.
    - The firm itself holds no single-stock positions.
    - Pick content is access-controlled and logged before release (C-302/20 risk).
    - No issuer payments of any kind.
    - Broker or affiliate referral revenue is disclosed on every page.
12. **Founder and staff social-media policy.** Posts about specific stocks carry MAR identity and conflict disclosures ("expert" rule) and must not preview picks.

**Subscription, SMS and marketing mechanics**
13. **Subscription flow.**
    - EU: express consent to immediate performance with acknowledgment of the withdrawal right, **plus a withdrawal button (required since 19 June 2026)**; Slovene-language terms for Slovenian consumers.
    - US, if launched: ROSCA / California click-to-cancel and renewal notices.
14. **SMS stack.**
    - Double opt-in with a stored consent record.
    - STOP/HELP handling.
    - Alphanumeric sender ID in the EU.
    - 10DLC or toll-free verification for the US.
    - The GSM-7 160-character template from section 4.1.
15. **Marketing.** No income or earnings claims, no cherry-picked "up to X%" figures, no fake or AI testimonials. Every performance figure carries its period, method and the "past performance" warning.

**Before launch**
16. **Scope for v1:** equities only (MAR/MiFID). Exclude crypto (MiCA Title VI) and futures (CFTC CTA rules) until reviewed.
17. **Pre-launch legal checklist:**
    - Slovenian counsel review of the ZTFI-1 fine ranges and whether any national exemption exists.
    - An informal ATVP query confirming the non-personal model.
    - A US counsel opinion on the fixed-slot SMS design under Lowe/Park.
    - Re-check every item marked UNVERIFIED above against primary sources.
18. **Market-data licensing (outside recommendation law, but a launch gate).** Showing exchange prices on the site and in SMS needs vendor or exchange redistribution rights.