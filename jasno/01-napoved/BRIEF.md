# Direction 01 — NAPOVED (The Forecast)

## Idea
**"Tveganje je vreme."** Credit risk behaves like weather: systems form, drift, and break. You cannot stop a storm —
but you can see it coming and take an umbrella. Jasno publishes a 12-month **payment forecast** for every Slovenian
company in the one visual language everyone already reads fluently: the weather forecast.

The name *is* the idea: "jasno" is literally the forecast word for a clear sky. Probability of default becomes
"chance of a storm" — understood instantly by a bakery owner and a CFO. Alerts become storm warnings
(Meteoalarm logic: green / yellow / orange / red, each with a recommended action).

**Clichés broken:** corporate blue, handshake photos, floating dashboards in perspective. Replaced by synoptic
cartography — isobars, pressure centres, fronts, station labels — drawn with Swiss precision.

## Visual language
- **Synoptic chart:** thin isobars (contour lines of a pressure field), pressure centres labelled **V** (visok tlak = high =
  stable) and **N** (nizek tlak = low = risk) exactly like Slovenian weather maps, front lines with triangles (cold
  front) / semicircles (warm front) as section dividers, tiny station annotations in mono ("1018 hPa"-style numbers
  repurposed as indices), coordinates and timestamps.
- **Slovenia** is the recurring stage (use `JASNO_GEO`): outline as a 1px ink line; dot-grid "radar" for regional maps.
- **Dawn** is the brand moment: the update runs at 6.00, so the hero sky is a quiet dawn gradient (pale peach → pale sky).
- **Weather glyphs:** design one custom set of 5 SVG glyphs (line-based, 1.5px stroke, round caps, consistent 24-grid):
  `jasno` (sun), `pretežno jasno` (sun + small cloud), `delno oblačno` (cloud + sun edge), `oblačno` (cloud + rain lines),
  `nevihta` (cloud + lightning). These map to classes **A B C D E**.

## Palette (tokens)
```
--paper:   #F4F6F7   page background (cool white)
--sky-1:   #E4ECF2   pale sky
--sky-2:   #CFDFEC   deeper sky tint
--dawn:    #F7DCC8   dawn peach (gradients only)
--ink:     #0F1720   text, isobars at low alpha
--ink-2:   #4B5967   secondary text
--line:    rgba(15,23,32,.14)
--storm:   #1B2033   dark "storm" section background
--storm-2: #262C45
--g: #3DAA77  --y: #F2C230  --o: #F47C20  --r: #E2412E   (warning levels — data only)
```
Accent for interaction (buttons, focus, links) = `--ink` primary with hover to `--o`. Orange appears as a *warning*,
so use it sparingly: it means "look here".

## Typography
- **Mona Sans** (variable): display & UI. H1: `font-stretch: 112%`, `font-weight: 560`, `letter-spacing: -0.04em`,
  `line-height: .9`, size `clamp(56px, 7.2vw, 112px)`. H2: stretch 108%, weight 540, `clamp(40px, 4.6vw, 72px)`.
  Body 17/1.5 stretch 100% weight 420. Huge forecast numerals: stretch 125%, weight 250 (thin wide numerals like a
  premium weather app), e.g. "18,6 %" at 160px+.
- **IBM Plex Mono** 400/500: all annotations, labels, axis ticks, station names — 11–12px, uppercase, `letter-spacing: .06em`.

## Page storyboard (desktop 1440; mobile notes inline)

### 0. Header
Wordmark "Jasno" (Mona Sans, stretch 118%, weight 640) followed by a 6px station dot (ink; turns orange on hover).
Nav centre, CTA right (ink pill, white text). A small mono status chip next to the wordmark: `NAPOVED · 6. 10. 2026 · 6.00`.
Header is transparent over the hero and gains a paper background + hairline once scrolled.

### 1. Hero — "Vidite nevihto, preden vas ujame."
- **Full-bleed WebGL canvas** (fallback: Canvas2D static isobars). Fragment shader:
  pressure field `p(x,y,t)` = sum of 5–6 Gaussian highs/lows (slow drift, period ~60 s) + 2 octaves of smooth noise.
  Isobars via `abs(fract(p*N) - .5)` with `fwidth` antialiasing; every 5th line slightly heavier/darker; colour = ink at
  10–22% alpha; background = dawn gradient (top `--sky-1` → bottom `--dawn` at 35%, very subtle).
  **Cursor = a low-pressure system**: add a negative Gaussian at the pointer (radius ~0.16 of viewport width, eased
  with lerp .08), isobars visibly bend and tighten around it. Touch: follows the finger while dragging, then relaxes.
- **Slovenia outline** (country frame, ~700px wide) sits right-of-centre, 1px ink line at 60% alpha, with the dot grid
  at 6% ink. Place 7 company "stations" (dot + mono label + index), e.g. `HRIBAR LES · 87` at Škofja Loka,
  `ZUPAN TRANSPORT · 71` at Koper, `NOVAK ELEKTRO · 58` at Celje, `KOVAČ GRADNJE · 34` at Maribor, etc.
  A **low-pressure centre "N"** sits over Maribor (Kovač Gradnje) with an orange/red warning halo (two concentric soft
  rings, slow pulse); a **high "V"** sits over Gorenjska (Hribar Les). Labels V/N are DOM (Mona Sans 800, 40px) with
  the pressure value in mono underneath (`N · 34`, `V · 87`).
- **Left column (cols 1–6):** mono eyebrow `NAPOVED ZA TOREK, 6. OKTOBRA 2026 · OB 6.00`; **H1** in 3 lines:
  "Vidite nevihto, / preden vas / ujame." — the word "nevihto" gets a hand-drawn-feeling orange underline drawn as an
  SVG path (cold-front triangles along the underline!). Sub (max 46ch): "Jasno vsako jutro napove plačilno sposobnost
  vseh 218.437 slovenskih podjetij za naslednjih 12 mesecev. V jeziku, ki ga razume vsak."
  **Search** (large, 64px tall, white, 1px line, radius 999px): input + ink button "Napoved →". Microcopy below.
- **Forecast card** (bottom-right, glassy white 88% + 1px line + soft shadow, 360px wide): `KOVAČ GRADNJE D.O.O. · MARIBOR`;
  row of 12 monthly glyphs (nov → okt) degrading from `delno oblačno` to `nevihta`; big "18,6 %" thin-wide numeral with
  caption "verjetnost neplačila v 12 mesecih"; red chip "Rdeče opozorilo · blokada TRR od 2. 10."; ink link "Celotna napoved →".
- **Bottom edge strip** (mono, 12px, hairline above): `DANES OB 6.00 — 1.284 SPREMEMB · 57 NOVIH BLOKAD · 12 ZAČETIH STEČAJEV · 312 IZBOLJŠANIH OCEN` with a small live clock at the right.
- **Mobile:** isobars full-bleed; H1 ~46px; Slovenia smaller below the H1 with 4 stations; search full-width; the
  forecast card becomes a bottom sheet peeking 140px (rounded top, grab handle).

### 2. Front transition (divider)
A full-width **cold front** line (ink, 1.5px) with filled triangles every 48px, slightly curved, sweeping across
(scrub with scroll on desktop; static in capture). Mono caption on it: `HLADNA FRONTA · KLASIČNA OCENA ZAOSTAJA 12 MESECEV`.

### 3. Insight — "Vsak račun je posojilo."
Spread layout: H2 left (cols 1–6) "Vsak račun je posojilo." + body: "Ko kupcu pošljete blago s 60-dnevnim rokom plačila,
mu posodite denar. Banka bi pred posojilom preverila vse. Večina podjetij preveri samo ime na računu."
Right (cols 7–12): **the invoice forecast** graphic — a 60-day horizontal timeline (day ticks, every 10th labelled, mono),
from `IZDAJA RAČUNA` to `ROK PLAČILA`, above it a smooth probability band ("verjetnost plačila") that thins from
99 % to 81 % for a risky buyer (orange) vs stays at 99,6 % for a safe one (ink) — two labelled lines.
Huge pull line under the graphic: **"Teh 60 dni ste banka. Brez bančnih podatkov."** (Mona Sans stretch 110, 40px).

### 4. How the forecast is made — "Napoved iz treh plasti"
Atmospheric cross-section: three stacked horizontal bands (full width, each ~220px tall, translucent sky tints darker
toward the bottom), left axis like altitude with mono labels. Each band = a data layer with its own micro-visual:
1. **Podnebje** (climate) — "Kakšno je podjetje v osnovi." Letna poročila AJPES: kapital, zadolženost, likvidnost,
   dobičkonosnost. `OSVEŽITEV: LETNO`. Visual: slow wide bars (annual columns).
2. **Vreme** (weather) — "Kaj se dogaja ta teden." Blokade TRR, davčni dolgovi FURS, insolventni postopki, izvršbe,
   spremembe lastništva. `OSVEŽITEV: VSAK DAN OB 6.00`. Visual: event dots/rain streaks.
3. **Veter** (wind) — "Kam piha." 4,2 milijona plačilnih izkušenj: kako hitro podjetje dejansko plača. `OSVEŽITEV: SPROTI`.
   Visual: streamlines/wind arrows.
On the right, the three layers converge (thin lines) into an output block: **Napoved** = Jasno indeks 0–100 +
verjetnost neplačila v 12 mesecih + priporočeni limit in rok. Mention "11 virov podatkov" and "3 sekunde".

### 5. Product moment — "Napoved za podjetje"
Large white panel (radius 28px, 1px line, soft long shadow), like a beautifully designed weather app on desktop:
- Tabs/chips: `Hribar Les — Jasno` (active) · `Novak Elektro — Delno oblačno` · `Kovač Gradnje — Nevihta` (they work; content swaps).
- Header: company, place, sector, MŠ/DŠ in mono; current state: big sun glyph + "Jasno"; **87** (thin wide, 180px) + `/100`;
  "Verjetnost neplačila v 12 mesecih: **0,4 %**".
- **12-month forecast strip**: 12 columns (nov–okt), glyph + PD per month, connected by a smooth curve (SVG).
- **Priporočilo** box: "Kreditni limit **120.000 €**" · "Plačilni rok **do 60 dni**".
- **Zakaj?** — 3 reasons with impact bars: "Plačuje povprečno 2 dni pred rokom" (+), "Kapital raste tretje leto zapored" (+),
  "Velika odvisnost od enega kupca" (−).
- **Dogodki** — mini timeline: `28. 3. 2026 Oddano letno poročilo 2025` · `12. 6. 2026 Nov prokurist` · `6. 10. 2026 Ocena izboljšana na 87`.
- Mobile: panel becomes full-width stacked cards; strip scrolls horizontally with snap.

### 6. Storm warnings (DARK section, `--storm`) — "Ko se nad partnerjem zbirajo oblaki, izveste isto jutro."
Isobars continue here in light lines (8% white). Left: H2 + copy "Dodajte kupce in dobavitelje na seznam. Jasno jih
spremlja vsak dan in vas opozori po e-pošti, v Slacku ali neposredno v vašem ERP-ju." **Warning legend** (4 rows, each with
colour chip + level + meaning + action): Zeleno — ni posebnosti · Rumeno — bodite pozorni · Oranžno — skrajšajte plačilni
rok · Rdeče — ustavite dobave ali zahtevajte predplačilo.
Right: Slovenia **dot-radar** (country frame dots, 2.2px, white 14%) with your 8 partners as coloured station dots + labels;
stacked notification cards (dark glass) timestamped `06.02`: red Kovač Gradnje "Blokada TRR · ustavite dobave";
orange Strojna Krajnc "Letno poročilo ni oddano"; yellow Novak Elektro "Plačila zamujajo povprečno 12 dni";
green Pekarna Zrno "Blokada odpravljena · ocena 79".

### 7. Economic weather map — "Gospodarska vremenska karta"
Light again. A **large dot-grid map** of Slovenia (country frame, all dots) coloured by region risk (sequential sky→storm
scale, not the warning colours), region names in mono, and a side table of 12 regions with index + trend arrow.
Caption: "Vsak prvi torek v mesecu objavimo napoved za slovensko gospodarstvo. Brezplačno, v vaš e-poštni predal."
Inline newsletter form (email + "Naročite se"). This is the shareable content asset.

### 8. Comparison — "Podnebje ni vreme."
H2 "Podnebje ni vreme." Sub: "Klasična bonitetna ocena opisuje lansko leto. Jasno napove naslednjih dvanajst mesecev."
Two-column table (§6 rows of the shared brief), left column muted (`Klasična bonitetna ocena`), right column in ink with a
faint sky tint (`Jasno`). Row labels in mono.

### 9. Pricing — "Paketi"
4 columns. Clean, airy cards; the **Posel** card is highlighted with an ink background and white text and a small
`NAJPOGOSTEJE IZBRAN` tag. Prices in Mona Sans stretch 120 weight 300 at 64px. Note line under.

### 10. Quote
One big quote (Mona Sans stretch 104, weight 420, 44px) — quote #1 — with attribution in mono. A thin isobar flourish.

### 11. Final CTA — "Jutri ob 6.00 bo jasno."
Full-bleed dawn gradient + isobars (second canvas instance or CSS/SVG). H2 huge: "Jutri ob 6.00 bo jasno." Sub: "Preverite
prvega partnerja danes. Brez kartice." Search again + secondary "Rezervirajte predstavitev".

### 12. Footer
Massive wordmark "Jasno" (stretch 125, weight 700, ~26vw, ink, cropped by the bottom edge), link columns
(Produkt, Podatki, Podjetje, Pravno), mini live "weather" line in mono: `LJUBLJANA · JASNO · 14 °C · NASLEDNJA NAPOVED 6.00`.
Legal line + fictional-data note.

## Motion (trigger · duration · easing)
- Isobar drift: continuous, speed .015/s; pointer low: lerp .08; pause off-screen.
- Hero load: H1 lines `yPercent 110→0`, 1.1 s, `expo.out`, stagger .08 (SplitText lines, masked); search `y 16→0 + opacity`,
  .8 s, delay .45; Slovenia outline stroke draw 1.6 s `power2.inOut`; stations `scale 0→1` `back.out(2)` stagger .05; card
  `y 24→0` .9 s delay 1.0; underline front draws .9 s delay .9.
- Front divider: translateX scrubbed with scroll.
- Sections: fade + rise 24px, .9 s `power3.out`, at 78% viewport; strip glyphs stagger .04; counters 1.2 s `power2.out`.
- Hovers: buttons fill sweep (scaleX) .35 s; cards lift 2px; links underline draw .3 s; chips crossfade .25 s.
- Reduced motion: static isobar frame (no drift, no pointer), no scrub, content visible.

## Capture state
Hero: isobars at a composed `t` with the pointer-low placed near the forecast card (≈ x .72, y .62) so the bend is visible;
all stations visible; underline drawn; card visible. Product tabs show Hribar Les. Notifications all visible.
