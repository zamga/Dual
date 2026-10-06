# Jasno: shared brief for all four directions

> Read this file fully before building. Your direction's own `BRIEF.md` sits in its folder.
> Where the two disagree, the direction brief wins on look and feel. This file wins on facts, copy rules and engineering.

## 1. The job

Four award-level landing pages (Awwwards SOTD/SOTY, FWA, CSSDA bar) for **Jasno**, a new Slovenian
credit-intelligence service. Jasno competes with **EBONITETE.SI** from Prva bonitetna agencija d.o.o.
All four pages share one brand, one product and one content model. Each expresses them through a
different governing idea, so the client compares four ideas rather than four skins.

The client receives **screenshots** (desktop 1440 wide and mobile 390 wide, full page plus hero).
The pages must also be real, working, production-grade static sites: semantic, accessible, responsive
and animated, with full reduced-motion support.

## 2. The competitor (what we beat; never named or shown on the page)

- EBONITETE.SI, run by Prva bonitetna agencija d.o.o. (Slovenia, organised as a rating house since 2013).
- Rates companies on a numeric **1–10** scale (10 = best). The rating combines a "static" part from annual
  financial statements with a "dynamic" part from payment behaviour, blockades, lawsuits and tax debt.
- Positioning is generic: corporate look, a sales-led offer, and the tagline "Reduce risk. Increase success."
- On our page comparisons are always against **"klasična bonitetna ocena"** (the classic credit rating),
  never against a named company.

## 3. Jasno in one line

Jasno tells you, every morning at 6.00, whether a Slovenian company is likely to pay you. It covers every
company, explains the answer in plain Slovenian, and recommends a credit limit and a payment term.

**Core insight (use it in every direction):**
**"Vsak račun je posojilo."** (Every invoice is a loan.) An invoice with 60-day terms lends the customer money
for 60 days. A bank checks everything before it lends; most SMEs check only the name on the invoice.
**"Teh 60 dni ste banka. Brez bančnih podatkov."** (For those 60 days you are a bank. Without a bank's data.)

**The name:** *jasno* means "clear" in Slovenian. It is also the weather term for a clear sky, and it also means "of course!".
Use the wordmark "Jasno" in sentence case unless your direction brief says otherwise.

## 4. Product facts. All are placeholders; keep them identical across directions.

| Thing | Value |
|---|---|
| Score | **Jasno indeks**, 0–100, where 100 is best |
| Probability | **Verjetnost neplačila v 12 mesecih** (12-month PD), in % |
| Classes | **A Odlično** 80–100 (PD < 0,5 %) · **B Dobro** 65–79 (0,5–1,5 %) · **C Zmerno** 50–64 (1,5–4 %) · **D Povišano** 35–49 (4–12 %) · **E Visoko tveganje** 0–34 (> 12 %) |
| Recommendation | **Priporočeni kreditni limit** (€) + **priporočeni plačilni rok** (days) |
| Refresh | Every day at **6.00** ("vsak dan ob 6.00") |
| Coverage | **218.437** Slovenian business entities, plus 5 markets in the region (HR, RS, BA, ME, MK) |
| Payment data | **4,2 milijona plačilnih izkušenj**: anonymised invoices from users (how fast companies actually pay) |
| Sources | AJPES (letna poročila, Poslovni register), blokade transakcijskih računov, FURS (seznam davčnih dolžnikov), insolventni postopki in izvršbe, spremembe lastništva in zastopnikov, plačilne izkušnje. Count: **11 virov podatkov** |
| Speed | Rating in **3 sekunde** |
| Model quality (small print only) | Back-tested 2015–2025, **AUC 0,86** |
| Today | **torek, 6. oktobra 2026**; the morning update ran at **6.00** |
| Today's changes | **1.284 sprememb**: **57 novih blokad**, **12 začetih stečajev**, **312 izboljšanih ocen** |
| Alerts via | e-pošta, SMS, Slack/Teams, API webhook, ERP |

### Example companies (all fictional; never use real Slovenian brands)

| Company | Place | Sector | Indeks | Class | PD 12m | Limit / term | Story |
|---|---|---|---|---|---|---|---|
| **Hribar Les d.o.o.** | Škofja Loka | lesna industrija | **87** ▲3 | A | 0,4 % | 120.000 € / 60 dni | Pays 2 days early on average; equity has grown 3 years running; depends heavily on one customer |
| **Zupan Transport d.o.o.** | Koper | logistika | **71** ±0 | B | 0,9 % | 45.000 € / 45 dni | New director appointed 12. 6. 2026 |
| **Pekarna Zrno d.o.o.** | Kranj | živilska industrija | **79** ▲11 | B | 0,6 % | 30.000 € / 45 dni | Account blockade lifted 5. 10. 2026 |
| **Novak Elektro d.o.o.** | Celje | elektroinštalacije | **58** ▼6 | C | 2,1 % | 18.000 € / 30 dni | Paying 12 days late on average (6 months ago: 3) |
| **Avtoservis Horvat s.p.** | Murska Sobota | avtoservis | **63** ▲8 | C | 1,6 % | 8.000 € / 30 dni | Tax debt paid off |
| **Strojna Krajnc d.o.o.** | Velenje | strojegradnja | **46** ▼7 | D | 5,8 % | 6.000 € / 15 dni | Annual report filed late |
| **Tiskarna Vidmar d.o.o.** | Nova Gorica | tiskarstvo | **41** ▼9 | D | 7,4 % | 3.000 € / 15 dni | Enforcement order (izvršba) filed |
| **Kovač Gradnje d.o.o.** | Maribor | gradbeništvo (SKD F41.200) | **34** ▼29 | E | 18,6 % | **0 € / samo predplačilo** | Account blocked since **2. 10. 2026**; on the FURS tax-debtor list (**18.420 €**); pays **47 days** late (6 months ago: 9); equity **−212.300 €** |

Use these IDs where needed: Kovač Gradnje MŠ 6123456000, DŠ SI 12345678. Hribar Les MŠ 5874123000, DŠ SI 87654321.

### Pricing (EUR, excluding VAT: "brez DDV")

| Plan | Price | Includes |
|---|---|---|
| **Brezplačno** | 0 € | 10 preverb na mesec · Jasno indeks in razred · podatki iz registra |
| **Posel** (most popular) | 39 € / mesec | neomejene preverbe · spremljanje 50 partnerjev · opozorila po e-pošti · pojasnila ocene |
| **Ekipa** | 119 € / mesec | spremljanje 500 partnerjev · kreditni limiti · plačilne izkušnje · 5 uporabnikov · izvoz v Excel |
| **Po meri** | po dogovoru | API in integracija z ERP · neomejeni uporabniki · skrbnik računa |

Under the pricing, add one note: "Letna naročnina: dva meseca brezplačno. Brez vezave, prekličete kadarkoli."

### Quotes (fictional customers)

1. "Prej smo za blokado kupca izvedeli, ko je bilo že prepozno. Zdaj izvemo ob šestih zjutraj, preden tovornjak zapusti dvorišče." **Petra Hribar**, finančna direktorica, Hribar Les d.o.o.
2. "Kreditne limite zdaj postavljamo v minutah, ne v tednih." **Marko Zupan**, vodja prodaje, Zupan Transport d.o.o.
3. "Končno ocena, ki pove tudi, zakaj." **Nina Vidic**, računovodkinja, Računovodstvo Vidic d.o.o.

No client logo bars and no invented press badges or certificates.

## 5. Copy rules (Slovenian, sl-SI)

- Address the reader formally (*vi*): Preverite, Spremljajte, Preizkusite. Headlines in sentence case unless your direction is all-caps by design.
- Write short sentences with concrete nouns: računi, kupci, tovornjak, blokada, šest zjutraj. Ban: "inovativen", "celovit", "rešitve", "vodilni", "sinergija", "digitalna preobrazba".
- Number formatting: thousands with a dot (218.437), decimals with a comma (0,4 %), a space before % and € (18,6 %, 120.000 €), dates as `6. 10. 2026`, times with a dot (`ob 6.00`, `06.02` on boards).
- Characters č š ž (and ć đ) must render. Fonts are latin-ext, so test them.
- Use these exact strings for shared UI:
  - Nav: **Produkt · Podatki · Cenik · Za razvijalce · Prijava**, primary CTA **Preizkusite brezplačno**, language switch **SL / EN**.
  - Search placeholder: **Ime podjetja, davčna ali matična številka**.
  - Microcopy under the hero search: **Brez kartice. 10 brezplačnih preverb vsak mesec.**
  - Secondary CTA: **Oglejte si primer poročila**. Demo CTA: **Rezervirajte predstavitev**.
- Footer must include: © 2026 Jasno d.o.o., Ljubljana · Pogoji uporabe · Zasebnost · Piškotki · pozdrav@jasno.si,
  plus the line **"Podjetja in podatki v primerih so izmišljeni."** (The companies and data in the examples are fictional.)
- If you write extra Slovenian copy, keep the grammar flawless: check case endings, gender agreement and dual forms. If unsure, write less.

### Glossary

bonitetna ocena = credit rating · boniteta = creditworthiness · blokada transakcijskega računa (blokada TRR) = account blockade ·
odprava blokade = blockade lifted · davčni dolg / seznam davčnih dolžnikov (FURS) = tax debt / tax-debtor list ·
insolventni postopek, stečaj, prisilna poravnava = insolvency, bankruptcy, compulsory settlement · izvršba = enforcement order ·
zamuda pri plačilih = late payment · plačilna disciplina = payment discipline · plačilne izkušnje = payment experiences ·
terjatve = receivables · kupec / dobavitelj / partner · kreditni limit · plačilni rok · predplačilo = prepayment ·
spremljanje = monitoring · opozorilo = alert · letno poročilo = annual report · kapital = equity · zadolženost = leverage ·
likvidnost = liquidity · dobičkonosnost = profitability · zastopnik / direktor · lastništvo = ownership · verižna neplačila = chain non-payment.

## 6. Content model (every direction covers all of it, in its own order and form)

1. **Header**: wordmark, nav, language switch, primary CTA. Sticky or condensing on scroll. A skip link comes first.
2. **Hero**: the promise, a company search (a real `<form role="search">` with a labelled input), the primary CTA and the signature visual.
3. **Insight**: "Vsak račun je posojilo." plus "Teh 60 dni ste banka. Brez bančnih podatkov."
4. **How it works / data**: sources, the 6.00 daily refresh, and how a score is made.
5. **Product moment**: a beautifully designed company report (Jasno indeks, class, PD, limit and term, top reasons, recent events).
6. **Monitoring / alerts**: watchlist and alert examples with recommended actions.
7. **Classic rating vs Jasno**: a comparison. Rows: osveževanje (enkrat na leto vs vsak dan ob 6.00) ·
   starost podatkov (do 18 mesecev vs največ 24 ur) · plačilno vedenje (delno vs 4,2 mio plačilnih izkušenj) ·
   pojasnilo (številka vs razlogi v slovenščini) · priporočilo (— vs kreditni limit in plačilni rok) · cena (po ponudbi vs javni cenik, od 0 €).
8. **Pricing**: four plans and the annual-plan note.
9. **Social proof**: one to three quotes.
10. **Final CTA**: the search again or a strong button.
11. **Footer**.

## 7. Engineering (non-negotiable)

**Files.** Work only inside your folder `jasno/0X-name/`: `index.html`, `styles.css` and `main.js`. More files are fine.
Shared, read-only assets:
- Fonts: `../shared/fonts/<family>.css` (self-hosted @font-face, latin + latin-ext). Families: `mona-sans` (variable wdth 75–125, wght 200–900),
  `ibm-plex-mono`, `instrument-serif` (regular + italic), `geist` (variable), `geist-mono` (variable),
  `noto-serif-display` (variable wdth 62.5–100, wght 100–900, + italic), `schibsted-grotesk` (variable 400–900 + italic),
  `big-shoulders-display` (variable 100–900), `jetbrains-mono` (variable 100–800 + italic). Use only the families in your brief.
- JS (UMD globals): `../shared/vendor/gsap.min.js`, `ScrollTrigger.min.js`, `SplitText.min.js`, `CustomEase.min.js`,
  `ScrambleTextPlugin.min.js` (GSAP 3.15; all plugins free), and `lenis.min.js` (Lenis 1.3, `window.Lenis`).
- Geo: `../shared/geo/slovenia.js` sets `window.JASNO_GEO` (no fetch needed). It holds `frames.country` (viewBox 1000×650) and `frames.wide` (1600×1000).
  Each frame has `outline` (an SVG path of Slovenia), `neighbours` {Italija, Avstrija, Madžarska, Hrvaška} paths, `cities` [{name,x,y}],
  `regions` (the 12 statistical regions as seeds {id,name,x,y}), `dots` [[x,y,regionIndex]] (a dot grid inside the border), and `labels`.
  It is accurate Natural Earth 1:10m data. Preview: `../shared/geo/slovenia-preview.svg`.

**Runtime rules.**
- No network at runtime: no CDN, no Google Fonts URL, no remote images. Every visual is authored as HTML/CSS/SVG/Canvas/WebGL.
  Use no stock photos, no emoji as icons, and no icon fonts (draw small SVG icons inline).
- Vanilla JS (ES2020), no build step. Put `// @ts-check` at the top of JS files and add JSDoc types on functions.
- Animate `transform` and `opacity` by default. Cap canvas DPR at 2. Pause rAF loops when off-screen (IntersectionObserver) and when the tab is hidden.
  Initialise WebGL lazily and fall back gracefully (Canvas2D or static SVG) when WebGL is unavailable.

**Accessibility (WCAG 2.2 AA).**
- Landmarks (`header`, `nav`, `main`, `section` with `aria-labelledby`, `footer`) and one `h1`.
- Visible `:focus-visible` styles, 4.5:1 contrast for body text, and touch targets of at least 44×44 px.
- Decorative canvases get `aria-hidden="true"`. Any information shown only in a visual must also exist as text.
- **prefers-reduced-motion**: no smooth scroll, no scrub, no looping motion. Show a composed static frame, keep the idea intact and keep content visible immediately.

**SEO.** `<html lang="sl">`, a title of 60 characters or fewer, a meta description, Open Graph and Twitter tags, canonical `https://jasno.si/`,
JSON-LD `Organization` + `WebSite` with a SearchAction, and a theme-color. Use an inline SVG favicon via a data URI.

**Responsive.** Design at 1440 and at 390. The page must also hold at 1280, 1024 and 768, with no horizontal scroll at any width.
Design mobile as its own composition: thumb reach, stacked rhythm, and tap replacing hover deliberately.

## 8. Capture protocol (mandatory, or your screenshots will be wrong)

`tools/capture.mjs` loads `index.html?capture=1&shot=<desktop-hero|desktop-full|mobile-hero|mobile-full>`, with `window.__CAPTURE__ = true` set before your scripts run.

```js
const CAPTURE = window.__CAPTURE__ === true || new URLSearchParams(location.search).has('capture');
```

In capture mode:
1. Add `is-capture` to `<html>`. Do **not** start Lenis. Do **not** pin sections with ScrollTrigger: a full-page screenshot is one tall
   static image, so pinned sections and scroll-scrubbed timelines must render in their composed final state in normal flow.
2. Every reveal is in its **final visible state**. Nothing is left at opacity 0, translated off or clipped.
3. Generative and continuous visuals render a **deterministic, beautiful frame**: a fixed time `t` and a fixed seed.
   Use WebGL with `preserveDrawingBuffer: true` in capture mode.
4. Interactive signature moments are placed in their **most telling state** (for example a lens over the key finding, flaps mid-flip, a filled search
   showing a result preview). Do this through code in capture mode, not through the mouse.
5. Use `100svh` or `min-height` with a pixel floor for the hero so it stays exactly one viewport tall (1440×900 desktop, 390×844 mobile).
6. When fonts are loaded and the first frame is drawn, set **`window.__READY__ = true`** (`document.fonts.ready` → draw → set the flag).
7. Fixed or sticky headers must look right at the top of the page. In a full-page capture they appear once, at the top.

Run captures from `jasno/`:
```sh
node tools/capture.mjs 0X-name                                   # all shots (about 20–40 s)
node tools/capture.mjs 0X-name --shots=desktop-hero,mobile-hero  # quick iteration
```
Output goes to `screens/0X-name/`: `desktop-hero@2x.png`, `desktop-full@2x.jpg`, `desktop-full.jpg`, `mobile-hero@3x.png`, `mobile-full@2x.jpg`,
and `review/desktop-NN.jpg` (1440×1000 slices) and `review/mobile-NN.jpg` (4-up strips). **Review with the Read tool:** look at
every review slice and both hero shots. The console prints page errors and failed requests; fix every one.

## 9. Award gate (self-review loop: at least 3 rounds)

After each capture, score the page 1–10 as an Awwwards juror (Design, Usability, Creativity, Content) and as a
developer-award juror (semantics, animation quality, accessibility, performance, responsiveness, markup). Fix anything below 8.
Hard checks:
- **The hero is a poster.** It carries one idea, reads in 2 seconds, and the signature visual is unmistakable. Nothing in it is generic.
- **Every section is composed like a magazine spread**: a clear focal point, deliberate whitespace, and a changing rhythm.
  Never stack three or more same-looking card grids. Alternate scale, density and alignment.
- **Typography**: use only your brief's families, one modular scale, `text-wrap: balance` on headings and `pretty` on paragraphs,
  no widows in headlines, and tabular numbers in data. Big type must be really big. Small labels need tracking.
- **No defects**: no overlapping or clipped text, no accidental empty voids, no lorem ipsum, no broken glyphs, no mixed languages
  (EN only in the language switch), and no layout that looks like a template.
- **Mobile** is composed, not squeezed. Check every mobile strip.
- **Details win**: hover, focus and active states, cursor treatment if your brief has one, the footer, small metadata, and microcopy.
- **Truthfulness**: all data matches §4. No real company names, logos or people.

When done, report: what you built (sections), the signature interaction and how it works, the final screenshot paths,
your self-scores, and known compromises. Do not commit to git. Do not edit anything outside your folder (except `screens/<your-folder>/`).
