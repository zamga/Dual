# Direction 03 — MERA (The Measure)

## Idea
**"Zaupanje, izmerjeno."** (Trust, measured.) Trust is business's oldest currency and it has never had a unit.
Jasno gives it one — the **Jasno indeks, 0 to 100** — and presents it with the authority of a *standard*, the way the
metre bar in Sèvres defines a metre. The site is a meticulously typeset **financial publication** — "Jasno, št. 1" —
rather than a sales page. Authority through craft.

In a category of stock photos and blue gradients, a page that reads like an impeccably set financial journal is instantly
premium and trustworthy. Giant numerals are the hero image; the **ruler** is the brand device (measurement = precision);
the **365 : 1** spread (daily vs yearly) is the one shareable typographic moment.

**Clichés broken:** stock photography, iconography, card grids, gradients. Everything is type, rule, number and ink.

## Visual language
- Newspaper/journal system: **masthead line**, folios, running heads, section marks **§ 1 … § 8**, hairline column rules,
  drop caps, pull quotes, marginalia, footnotes with superscripts, small caps labels, a colophon.
- **Rulers** everywhere precision matters: fine ticks (minor every 1, major every 10, labels every 10), a vermilion
  triangular marker. Vertical rulers run along the outer margins of the page (fixed, hairline, 5% ink) on desktop.
- Vermilion = the auditor's red pen: risk, negatives, markers, the one underline per section. Nothing else is coloured.
- Paper has a barely visible grain (SVG feTurbulence, 3–4% multiply) — never a texture you notice.

## Palette (tokens)
```
--paper:   #F2EEE6   page
--paper-2: #E9E3D8   tinted panels (report sheet bg is #FBF9F5)
--ink:     #151413   text & rules
--ink-2:   #5E5850   secondary text
--rule:    rgba(21,20,19,.22)
--hair:    rgba(21,20,19,.12)
--red:     #DF3B1E   vermilion — risk, markers, negative numbers, active states
```

## Typography
- **Noto Serif Display** (variable wdth 62.5–100, wght 100–900, + italic): headlines, numerals, drop caps, standfirsts.
  Hero numeral "87": `font-variation-settings` / `font-stretch: 62.5%`, weight 250, size `clamp(260px, 36vw, 560px)`,
  `line-height: .78`, lining figures. H1: stretch 70%, weight 380, `clamp(64px, 8vw, 128px)`, `line-height: .9`, `-.02em`.
  H2: stretch 75%, weight 400, `clamp(44px, 5vw, 84px)`. Standfirst/pull quotes: italic, stretch 85%, 28–36px.
- **Schibsted Grotesk** (variable 400–900): body 17/1.55 (400), UI, tables (`font-variant-numeric: tabular-nums`),
  labels: 11–12px, weight 600, uppercase, `letter-spacing: .09em`.
- Modular scale: 11 · 13 · 17 · 22 · 28 · 36 · 48 · 64 · 84 · 128 · 560.

## Page storyboard (desktop 1440; 12-col grid, 72px outer margins, 24px gutters)

### 0. Masthead header
Top line (11px caps, hairlines above and below): `ŠT. 1` · `LJUBLJANA, TOREK, 6. OKTOBRA 2026` · `IZHAJA VSAK DAN OB 6.00` · `CENA: 0 €`.
Below: wordmark "Jasno" (Noto Serif Display, stretch 62.5, weight 600, 34px) left, nav centre (Schibsted 500 15px), CTA right
(ink rectangle, paper text, square corners, 44px tall; hover → red). Sticky; on scroll the masthead line collapses.

### 1. Hero — "Zaupanje, izmerjeno."
- **Left (cols 1–5):** label `JASNO INDEKS — § 0`; **H1** "Zaupanje, / izmerjeno."; standfirst (serif italic 28px, max 34ch):
  "Vsak dan ob 6.00 izmerimo, koliko lahko zaupate vsakemu od 218.437 slovenskih podjetij — na lestvici od 0 do 100,
  z verjetnostjo neplačila in priporočenim kreditnim limitom." Search: underline-style field (no box; 2px ink baseline,
  label above in caps `IZMERITE PODJETJE`), button "Izmerite →" (ink). Microcopy.
- **Right (cols 6–12):** the giant numeral **87** (odometer-capable digits) with a superscript footnote marker **¹** in red.
  Directly under it a **full-width ruler 0–100** (spanning cols 6–12) with minor/major ticks, labels every 10, five class
  bands under the ruler (`A ODLIČNO 80–100` … `E VISOKO TVEGANJE 0–34`) separated by hairlines, and the **red marker**
  at 87. Footnote at the bottom of the hero (10px caps + serif): "¹ Hribar Les d.o.o., Škofja Loka. Jasno indeks na dan
  6. 10. 2026 ob 6.00. Verjetnost neplačila v 12 mesecih: 0,4 %. Priporočeni limit: 120.000 €."
- **Kinetic behaviour:** when idle, the number cycles every 5 s through Hribar Les 87 → Novak Elektro 58 → Kovač Gradnje 34
  (digits roll like an odometer, marker slides, footnote crossfades; at 34 the numeral turns red). Typing in the search
  pauses the cycle. Capture state: **87**.
- Mobile: masthead compresses to two lines; numeral full-width (~300px tall) *above* the H1; ruler below with labels every 20.

### 2. "§ 1 Vsak račun je posojilo." — editorial essay spread
- H2 across cols 1–9. Two columns of body text (cols 1–4 and 5–8), ragged right, **drop cap** (Noto Serif Display, 5 lines,
  red is NOT used for the drop cap — ink). Margin (cols 10–12): a pull quote in serif italic "Teh 60 dni ste banka.
  Brez bančnih podatkov." with a red hairline above, and a small typographic **invoice specimen** (a set of rules and caps:
  `RAČUN ŠT. 2026-0418` · `ZNESEK 24.600,00 €` · `ROK PLAČILA: 60 DNI` — the term circled in a hand-drawn red ellipse SVG).
- Essay copy (write ~170 words, flawless Slovenian): ko kupcu pošljete blago s 60-dnevnim rokom, mu posodite denar; banka bi
  pred posojilom preverila vse, podjetja pa pogosto le ime na računu; verižna neplačila — "ko en kupec ne plača, ne plača
  tudi njegov dobavitelj"; klasična ocena opisuje lansko leto; Jasno meri vsako jutro.

### 3. "§ 2 Enota" — the scale as a specimen sheet
A long ruler 0–100 across the full content width (~1300px) — **the** visual of the section — major ticks every 10 (24px),
minor every 1 (8px), mid every 5 (14px). Above it, sample companies as labelled pins at their values (Kovač Gradnje 34 [red],
Tiskarna Vidmar 41, Strojna Krajnc 46, Novak Elektro 58, Avtoservis Horvat 63, Zupan Transport 71, Pekarna Zrno 79,
Hribar Les 87). Below it, the five class bands and a **typeset table**: Razred · Razpon · Verjetnost neplačila · Pomen ·
Priporočilo (e.g. A — 80–100 — pod 0,5 % — Odlično — "Običajni plačilni roki."; E — 0–34 — nad 12 % — Visoko tveganje —
"Samo predplačilo."). Footnote with methodology: "Jasno indeks je statistični model, preverjen na podatkih 2015–2025
(AUC 0,86). Metodologija je javna."

### 4. "§ 3 Kaj merimo" — five measures
Asymmetric list: huge serif numerals **01–05** hanging in the left margin (stretch 62.5, weight 200, 160px, ink at 18%),
titles in serif 40px, two lines of grotesk text, and an **ink-line micro chart** on the right of each (each different:
a sparkline, a bar row, an event dot strip, a step line, a small network glyph):
01 Plačilna disciplina — "Kako hitro podjetje dejansko plača. 4,2 milijona računov." ·
02 Likvidnost — "Ali ima dovolj denarja za tekoče obveznosti." ·
03 Zadolženost — "Koliko dolguje glede na kapital in dobiček." ·
04 Pravni dogodki — "Blokade, izvršbe, insolventni postopki, davčni dolg." ·
05 Lastniki in vodstvo — "Kdo stoji za podjetjem in kakšno zgodovino ima."

### 5. "§ 4 Poročilo" — the product moment as a typeset document
A **report sheet** (`#FBF9F5`, 1px rule, very soft shadow, A4-ish proportion ~880px wide, centred, with a 3-col marginal
note column beside it). Content: running head `JASNO · BONITETNO POROČILO · 6. 10. 2026`; title "Novak Elektro d.o.o."
(serif 56px); facts line (Celje · elektroinštalacije · MŠ · DŠ); **58** (serif 200px) with "/100" and class `C — ZMERNO`;
grid: Verjetnost neplačila **2,1 %** · Kreditni limit **18.000 €** · Plačilni rok **30 dni**; a **fine ink line chart** of
the index over 24 months with two annotations (red dot "Zamude pri plačilih +12 dni"); a **financials table**
(2023 / 2024 / 2025: Prihodki, EBITDA, Kapital, Finančni dolg — invent plausible numbers, tabular figures, negatives in red);
"Razlogi za oceno" as 3 numbered sentences; "Dogodki" list. Marginal notes (serif italic 15px, red leader lines) explain
parts of the report: "Vsaka ocena ima razlog." / "Limit in rok — ne le številka."

### 6. "§ 5 365 : 1" — the comparison spread
Giant **"365 : 1"** (Noto Serif Display stretch 62.5, weight 200, ~300px, centred). Under it two timelines across the full
width: row "Klasična bonitetna ocena" with **one** thick tick (at end of March, label "letno poročilo") on a 12-month axis;
row "Jasno" with **365 hairline ticks** (one per day, the last one red = "danes, 6.00"). Caption: "Klasična ocena se osveži,
ko podjetje odda letno poročilo. Jasno se osveži vsako jutro." Then the shared comparison rows as a **typeset table**
(hairlines, caps headers, Jasno column in ink, classic column in ink-2).

### 7. "§ 6 Spremljanje" — monitoring as news briefs
Left (cols 1–5): H2 "Novice o vaših partnerjih. Vsako jutro." + copy (watchlist, e-pošta, Slack, ERP). Right (cols 7–12):
a column titled `KRATKE NOVICE · 6. 10. 2026` with 5 dated briefs separated by hairlines, each: time in caps (`06.02`),
headline in serif 22px, one line of grotesk, and a red/ink action tag:
"Kovač Gradnje d.o.o.: blokada transakcijskega računa" → `USTAVITE DOBAVE` (red) ·
"Tiskarna Vidmar d.o.o.: vložena izvršba" → `SKRAJŠAJTE ROK` ·
"Strojna Krajnc d.o.o.: letno poročilo ni oddano" → `BODITE POZORNI` ·
"Pekarna Zrno d.o.o.: blokada odpravljena" → `OCENA 79 ▲11` ·
"Hribar Les d.o.o.: ocena izboljšana na 87" → `BREZ UKREPA`.

### 8. "§ 7 Cenik" — the price list
Typeset like a classic price list with **leader dots** (CSS `::after` dotted fill) — four rows, each: plan name (serif 40px),
dots, price (serif 40px, tabular), then a line of features in grotesk 15px beneath, and a small text link "Izberite →".
`Posel` row marked with a red `NAJPOGOSTEJE IZBRAN` caps tag. Annual note below. Hover: row background `--paper-2`, dots darken.

### 9. "§ 8 Pisma bralcev" — letters to the editor
Three short letters in three columns, each: salutation "Spoštovani," (serif italic), the quote as the letter body (serif 22px),
signature: name, function, company, place (caps 11px). Column rules between.

### 10. Final CTA
Centered, big serif: "Koliko zaupate svojemu največjemu kupcu?" Under it: "Izmerite ga. Prvih 10 meritev vsak mesec je
brezplačnih." + search (underline style) + "Rezervirajte predstavitev" text link. A ruler under the section with the marker
waiting at **?** (a red question mark above the marker).

### 11. Footer — "Kolofon"
Three columns: **Kolofon** ("Jasno d.o.o., Ljubljana. Stavljeno v črkah Noto Serif Display in Schibsted Grotesk.
Podatki: AJPES, FURS, sodišča in 4,2 milijona plačilnih izkušenj. Izhaja vsak dan ob 6.00."), **Rubrike** (links),
**Pravno** (links). Huge wordmark "Jasno" set across the full width (stretch 62.5, weight 300) with a ruler under it.
Legal line + fictional-data note.

## Motion (trigger · duration · easing)
- Odometer: each digit is a vertical strip 0–9; roll `translateY` 1.2 s `cubic-bezier(.2,.8,.2,1)`, digits staggered .08.
- Ruler ticks draw in (scaleY 0→1, origin bottom) left→right, total .9 s, stagger .006; marker slides 1.2 s `expo.out`.
- Headlines: SplitText lines with mask, `yPercent 100→0`, .9 s `power3.out`, stagger .06; body paragraphs fade .8 s.
- 365 ticks: draw sequentially over 1.6 s when in view; the red last tick pings.
- Hover: links → red underline draws left→right .3 s; price rows tint; CTA ink→red .25 s.
- Lenis duration 1.1 (not in capture). Reduced motion: no roll, no draw, static values.

## Capture state
Hero numeral 87 with marker at 87; all rulers fully drawn; all 365 ticks drawn; all sections visible.
