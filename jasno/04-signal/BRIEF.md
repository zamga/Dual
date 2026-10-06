# Direction 04 — SIGNAL (The Departure Board)

## Idea
**"Tveganje se ne najavi. Mi ga."** (Risk doesn't announce itself. We do.)
The Slovenian economy as a live **departures board**: every morning at 6.00, every change on every company flips
into view. Urgent, mechanical, unmissable. Movement is the message — the split-flap board makes "live data" physical.

It's the most shareable of the four: everyone loves a split-flap. And it builds a coherent, witty system — the data
pipeline is a **rail line**, your watchlist is **your platform** ("Vaš peron"), alerts are **platform announcements**,
pricing plans are **tickets** ("vozovnice"), and the final CTA is a **countdown to the next update at 6.00**.

**Clichés broken:** gradients, glassmorphism, dashboards, stock. Pure signal: black, yellow, warm white, mechanical type.

## Visual language
- Railway/airport wayfinding: strong horizontal bands, platform numbers in boxes, pictograms (custom SVG: arrow, clock,
  bell, platform box, ticket), section numbering as tracks ("TIR 1", "TIR 2"…).
- The **split-flap cell**: dark flap (`#1C1C1A`) with a hairline split across the middle (darker line + 1px highlight below),
  slight top-to-bottom gradient, 2px radius, warm-white mono character centred. Cells in rows with 2px gaps on a board
  panel `#141413` with a subtle inner bevel and tiny screw dots in the corners.
- Full-bleed **yellow** sections (black text on yellow) alternate with black ones for drama.

## Palette (tokens)
```
--black:  #0B0B0A   page
--board:  #141413   board panels
--flap:   #1C1C1A   flap cells (top half #202020 → bottom #191917)
--white:  #F4F1E8   flap characters, text on black
--grey:   #8A877F   secondary text on black
--line:   rgba(244,241,232,.14)
--yellow: #FFD400   signal accent / yellow sections
--red:    #FF4436   critical statuses (text on flaps)
--amber:  #FF9F1A   warning statuses
--green:  #2BD07F   positive statuses
```

## Typography
- **Big Shoulders Display** (variable): headlines, giant counters, ticket prices. Uppercase, weight 800–900,
  `line-height: .82`, `letter-spacing: -.01em`. H1 `clamp(72px, 12.5vw, 200px)`. Counters `clamp(96px, 14vw, 230px)`.
- **JetBrains Mono** (variable): flaps (700), labels, data, body-small (400/500). Body copy may use JetBrains Mono 400 at
  16/1.6 — keep paragraphs short. Labels 11–12px, uppercase, `letter-spacing: .08em`.

## The split-flap engine (signature)
- DOM-based: each cell = `<span class="flap">` with static top/bottom halves + an animated leaf (`rotateX`, perspective
  400px, `backface-visibility: hidden`). Character set: ` ABCČDEFGHIJKLMNOPRSŠTUVZŽ0123456789.,:-+%▲▼/€·→`.
- To change a cell, flip sequentially through the set from current to target (cap at 10 intermediate flips, 55–70 ms each,
  random jitter ±15 ms); stagger by column 18 ms so rows cascade left→right.
- Board updates every 4.5 s: a new event enters at the top row, older rows flip down one line. Only changed cells animate.
- Optional **Zvok** toggle (default OFF) in the header: WebAudio-synthesised soft click per flip (short noise burst, 8 ms,
  highpass) — no audio files. Respect reduced motion (sound off, no flipping: instant text).
- Screen readers: the board is a real `<table>` (caption "Spremembe danes ob 6.00") with text content; flap visuals are
  `aria-hidden`. Use `aria-live="off"` (no live spam); provide a "Ustavi" (pause) button for the rotation (WCAG 2.2.2).
- **Capture state:** board fully populated with the rows below; **3–4 cells mid-flip** (leaf frozen at ~60° in row 1) so the
  mechanism reads in a still image.

## Page storyboard (desktop 1440; mobile notes inline)

### 0. Header (black)
Wordmark **JASNO** (Big Shoulders 900, 30px, tracked .04em) with a small yellow square "platform" box before it containing
a white "J". Nav (mono 13px caps), `ZVOK ○` toggle, CTA yellow (black text, square, 44px). Under the header a thin status bar
(mono 11px): `● V ŽIVO` (red pulsing dot) · `LJUBLJANA` · live clock `06:00:14` · `TOREK 6. 10. 2026` · right side
`NASLEDNJA POSODOBITEV: JUTRI OB 6.00`.

### 1. Hero — "Tveganje se ne najavi. Mi ga."
- **H1** across cols 1–8 in two lines: "TVEGANJE SE NE NAJAVI." (white) / "MI GA." (yellow) — Big Shoulders 900.
- **Right (cols 9–12)**, aligned to the H1 baseline: sub in mono 16px: "Jasno vsako jutro ob 6.00 zabeleži vsako spremembo
  pri vseh 218.437 slovenskih podjetjih — blokade, davčne dolgove, stečaje, zamude pri plačilih — in vas opozori, preden
  postane vaš problem." + search styled like a **ticket machine**: black field with yellow 2px border, mono caps placeholder,
  yellow button `PREVERITE →`. Microcopy.
- **The board** (full width, below): header row in yellow mono caps labels: `ČAS · PODJETJE · KRAJ · DOGODEK · OCENA · STATUS`.
  8 rows (desktop shows ~5 above the fold, rest just below):
  ```
  06:00  KOVAČ GRADNJE D.O.O.     MARIBOR        BLOKADA TRR             34 ▼29   RDEČE
  06:00  STROJNA KRAJNC D.O.O.    VELENJE        LETNO POROČILO MANJKA   46 ▼7    ORANŽNO
  06:01  NOVAK ELEKTRO D.O.O.     CELJE          ZAMUDA PLAČIL +12 DNI   58 ▼6    RUMENO
  06:01  HRIBAR LES D.O.O.        ŠKOFJA LOKA    OCENA IZBOLJŠANA        87 ▲3    ZELENO
  06:02  TISKARNA VIDMAR D.O.O.   NOVA GORICA    VLOŽENA IZVRŠBA         41 ▼9    ORANŽNO
  06:02  ZUPAN TRANSPORT D.O.O.   KOPER          NOV DIREKTOR            71 ·0    INFO
  06:03  PEKARNA ZRNO D.O.O.      KRANJ          ODPRAVA BLOKADE         79 ▲11   ZELENO
  06:03  AVTOSERVIS HORVAT S.P.   MURSKA SOBOTA  DAVČNI DOLG PORAVNAN    63 ▲8    ZELENO
  ```
  Status words coloured (RDEČE red, ORANŽNO amber, RUMENO yellow, ZELENO green, INFO white). `▼` red / `▲` green.
  Board controls bottom-right: `❚❚ USTAVI` and `VSE SPREMEMBE →`.
- **Mobile:** H1 ~64px in 3–4 lines; the board becomes stacked **mini-boards** (one per event: time + status on row 1,
  company on row 2, event on row 3, index on the right) — still flaps; show 4.

### 2. Ticker band (yellow, 56px)
Infinite marquee (CSS, linear, 40 s): `▼ KOVAČ GRADNJE 34 BLOKADA TRR · ▲ HRIBAR LES 87 · ▲ PEKARNA ZRNO 79 ODPRAVA BLOKADE · ...`
in black mono 700 18px with yellow-on-black separators. Pause on hover; static in reduced motion.

### 3. TIR 1 — "Danes ob 6.00"
2×2 grid of **giant counters** separated by hairlines (Big Shoulders 900): **1.284** sprememb · **57** novih blokad ·
**12** začetih stečajev · **312** izboljšanih ocen — mono captions + a tiny sparkline of the last 30 days under each.
Intro line above (mono): "Toliko se je spremenilo med polnočjo in šesto zjutraj." Punchline below (Big Shoulders 700, 44px):
**"KLASIČNA BONITETNA OCENA BO ZA TO IZVEDELA PRIHODNJE LETO."**

### 4. TIR 2 — "Proga" (the data line)
A horizontal **rail-line diagram** (SVG, yellow 6px line on black): stations (white ring, black fill) **AJPES** →
**BLOKADE TRR** → **FURS** → **SODIŠČA** → **PLAČILNE IZKUŠNJE** → interchange **JASNO MODEL** (big double ring) which branches
into three terminal stations **E-POŠTA / SMS**, **SLACK / TEAMS**, **ERP / API**. Each station has a mono caption (what +
frequency, e.g. `LETNA POROČILA · 1× LETNO`, `VSAK DAN 6.00`). A small yellow "train" (rounded rect) travels the line in a loop.
H2 above: "OD VIRA DO OPOZORILA V TREH SEKUNDAH." Mobile: the line runs vertically.

### 5. TIR 3 — "Vaš peron" (monitoring)
Left: a **personal board** (smaller flaps, 6 rows: your partners — company · indeks · status) titled `PERON 3 · VAŠI PARTNERJI`.
Right: H2 "VAŠ PERON. VAŠI PARTNERJI." + mono copy ("Dodajte kupce in dobavitelje. Ko se pri kateremkoli kaj spremeni,
vas obvestimo isto jutro — po e-pošti, SMS, v Slacku ali v ERP.") + 2 **platform-announcement alert cards** (black with
yellow top bar, bell pictogram): `OBVESTILO · 06.02 · PERON 3` / "KOVAČ GRADNJE D.O.O. — BLOKADA TRANSAKCIJSKEGA RAČUNA." /
`PRIPOROČILO: USTAVITE DOBAVE ALI ZAHTEVAJTE PREDPLAČILO.`; second (amber): Strojna Krajnc — letno poročilo ni oddano —
`PRIPOROČILO: SKRAJŠAJTE PLAČILNI ROK NA 15 DNI.`

### 6. TIR 4 — the report as a timetable ("Vozni red tveganja")
A big panel: left — **34** (Big Shoulders 900, 260px, red) + `/100`, `RAZRED E · VISOKO TVEGANJE`, `VERJETNOST NEPLAČILA 18,6 %`,
`KREDITNI LIMIT 0 € · SAMO PREDPLAČILO`, company header (Kovač Gradnje d.o.o., Maribor, MŠ, DŠ). Right — a **timetable**
(table) of events: date · event · vpliv na oceno: `02.10.2026 BLOKADA TRR −14` · `15.09.2026 FURS DAVČNI DOLG 18.420 € −8` ·
`01.08.2026 ZAMUDA PLAČIL 47 DNI −5` · `30.06.2026 KAPITAL NEGATIVEN −2` · `31.03.2026 LETNO POROČILO 2025 ODDANO ·0`.
Below: "ZAKAJ?" three reason lines. CTA `OGLEJTE SI PRIMER POROČILA →`.

### 7. Yellow section — "VOZNI RED ENKRAT NA LETO?"
Full-bleed yellow, black type. H2 (Big Shoulders 900, 140px) "VOZNI RED ENKRAT NA LETO?" then the comparison as a two-column
board-like table in black lines: `KLASIČNA BONITETNA OCENA` vs `JASNO` (rows from the shared brief), Jasno column cells
inverted (black bg, yellow text).

### 8. TIR 5 — "Vozovnice" (pricing as tickets)
4 **tickets** (horizontal, ~320×190 each in a 2×2 grid, or 4 columns at 1440): body + perforated stub (CSS radial-gradient
notches + dashed line), ticket code `JS-01..04`, `VELJA: 1 MESEC`, `RAZRED: BREZPLAČNO / POSEL / EKIPA / PO MERI`, features as
mono list, price in Big Shoulders 900 (64px) e.g. `39 €` + `/ MESEC`. Posel ticket inverted (yellow) + `NAJPOGOSTEJE IZBRAN` stamp
(rotated -8°, red outline). Hover: ticket lifts and the stub tears 4px. Annual note in mono.

### 9. Quote (black)
Quote #1 in Big Shoulders 800 uppercase 56px, white, with yellow quotation marks; mono attribution. Quotes #2 and #3 smaller in
a row below (mono 16px).

### 10. Final CTA (yellow, full-bleed) — countdown
`NASLEDNJA POSODOBITEV` (mono caps) + a **giant split-flap countdown** `HH:MM:SS` to the next 6.00 (real time; capture:
fixed value `07:59:46`). H2 "IZVEJTE PRVI." CTA black button `PREIZKUSITE BREZPLAČNO →` + secondary link
`REZERVIRAJTE PREDSTAVITEV`.

### 11. Footer (black)
Massive **JASNO** (Big Shoulders 900, ~30vw, white, line-height .75, cropped at the bottom), wayfinding-style link groups with
pictograms (→ arrows), status bar repeat, legal line + fictional-data note.

## Motion (trigger · duration · easing)
- Flaps: per flip 55–70 ms, `cubic-bezier(.3,.0,.6,1)` on the leaf; column stagger 18 ms; board cadence 4.5 s; pause off-screen.
- Hero load: board header types in (ScrambleText .6 s), rows cascade flips from blank (row stagger 120 ms); H1 lines rise
  (`yPercent 100→0`, .8 s, `power4.out`); yellow "MI GA." does a hard cut-in (no fade) 200 ms after line 1 — signage, not silk.
- Counters: flap-style digit roll .9 s on enter.
- Rail train: continuous along the path (CSS `offset-path` or computed), 9 s loop; stations light yellow as it passes.
- Yellow sections: enter with a hard horizontal wipe (clip-path inset 0→100%) .6 s `power3.inOut`.
- Hovers: buttons invert instantly (no easing — mechanical), tickets lift 6px + stub tear, links get a yellow block highlight.
- Reduced motion: no flipping (static text), marquee becomes a static wrapped list, no train, no wipes.
