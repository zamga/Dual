# Direction 02 — RENTGEN (The X-ray)

## Idea
**"Kar podjetje pove. Kar podjetje je."** (What a company says. What a company is.)
Every company has a **facade** — brochures, websites, "zanesljiv partner od leta 1991" — and a **skeleton**: payments,
debts, blockades, equity. Jasno is the X-ray you take before you sign.

The value proposition becomes a physical gesture: move the lens, see the truth. The **type system is the concept**:
the facade is set in glossy marketing serif, the skeleton in clinical mono. The credit report becomes an
**izvid** (radiology report): *ugotovitve → diagnoza → priporočilo* (findings → diagnosis → recommendation) — the
clearest possible information design for a risk decision.

**Clichés broken:** dashboards-in-perspective, blue gradients, shields and padlocks. One daring light→dark transition
instead: you literally enter the X-ray.

## Visual language
- **Facade world** (hero only): warm brochure cream, ink serif claims, small corporate brochure details (fake company
  mark "KOVAČ GRADNJE", tagline "Gradimo prihodnost", "Od leta 1991"). Elegant, slightly too glossy — on purpose.
- **Skeleton world** (everything after the hero): radiograph film — blue-black, bone-white luminous lines and text
  (soft glow), cold film tint, fine grain (SVG feTurbulence overlay ~6%), faint horizontal scanlines (2px period, 3%).
- **Radiology overlays (DICOM style):** corner metadata blocks in mono 11px uppercase
  (`SUBJEKT: KOVAČ GRADNJE D.O.O.` / `MŠ 6123456000 · DŠ SI 12345678` / `SKEN 6. 10. 2026 06:00:14` / `SERIJA 4/11`),
  measurement ticks along edges, crosshair reticles, orientation markers **F** (fasada) / **S** (skelet) instead of L/R,
  calipers with values. The radiologist's **red marker** (circles, arrows, underlines) marks findings — and only findings.

## Palette (tokens)
```
--cream:   #EFE9DF   facade background
--cream-2: #E4DCCD
--ink:     #191512   facade text
--film:    #07090C   skeleton background
--film-2:  #0D1218   panels
--film-3:  #141B23   raised panels / lightbox frame
--bone:    #ECE6D9   skeleton text & lines (glow: 0 0 14px rgba(236,230,217,.22))
--bone-2:  #9AA6B2   secondary skeleton text (cool)
--tint:    #8FB3CF   film tint for hairlines/grids at 10–25% alpha
--marker:  #FF4B2B   red marker — findings only
--ok:      #7FD1A8   used once or twice for positive deltas
```

## Typography
- **Instrument Serif** (regular + italic): facade claims (huge), H1 line one, pull quotes. Facade claims:
  `font-size: clamp(64px, 9.6vw, 148px)`, `line-height: .92`, `letter-spacing: -.02em`, italic for one word per line.
- **Geist** (variable): UI, body (17/1.55, 400), H2 (`clamp(40px, 4.4vw, 68px)`, 500, `-.035em`).
- **Geist Mono** (variable): skeleton data, labels, metadata, numbers (tabular). Skeleton claim-replacements set at
  `clamp(22px, 2.6vw, 40px)`, 500, uppercase, `letter-spacing: .02em`.

## Signature interaction — the lens
- Two stacked layers in the hero: **facade** (cream, serif claims) and **skeleton** (film, mono truths) with *identical
  layout grid*, so every claim has its truth in the same position:

  | Facade (serif) | Skeleton (mono, bone; red marker on the key fact) |
  |---|---|
  | "Zanesljiv *partner*" | `ZAMUJA S PLAČILI POVPREČNO 47 DNI` (6 mesecev nazaj: 9) |
  | "od leta 1991." | `KAPITAL NEGATIVEN: −212.300 €` |
  | "Vodilni v *regiji*." | `NA SEZNAMU DAVČNIH DOLŽNIKOV FURS · 18.420 €` |
  | "Vedno *pravočasno*." | `BLOKADA TRR OD 2. 10. 2026` ← red circle + caliper "4 DNI" |

- The skeleton layer is masked with `mask-image: radial-gradient(circle var(--r) at var(--x) var(--y), #000 calc(100% - 1px), transparent 100%)`
  (CSS variables updated in rAF with lerp .14 — compositor-friendly, no layout).
- **Lens chrome** (separate element, pointer-events none): Ø 400px desktop; 1px bone ring + outer ring of 120 ticks
  (every 10th longer) rotating slowly (360° / 60 s); centre crosshair; a mono tag outside the ring at 1–2 o'clock:
  `JASNO RENTGEN · 6. 10. 2026 06:00`; the ring gains a red arc segment when the lens centre is over a finding.
- **Keyboard / a11y:** a visible toggle button `Pokaži skelet` / `Pokaži fasado` (Geist Mono, top-right of the hero)
  that animates the mask radius to cover the whole hero (and back). The truths also exist as a real `<ul>` (visually
  the skeleton layer; `aria-hidden` on duplicated decorative copies only).
- **Touch / mobile:** the lens becomes a full-width **scan band** (~170px tall, horizontal bone line top & bottom, mono
  label) that auto-sweeps slowly over the claims and can be dragged vertically.
- **Capture state:** lens centred on "Vedno *pravočasno*." so the red-marked `BLOKADA TRR OD 2. 10. 2026` is fully readable
  inside the lens; on mobile the scan band sits over the same line.

## Page storyboard (desktop 1440; mobile notes inline)

### 0. Header
On cream in the hero (ink), turning bone-on-film after the transition (swap via a class when the hero leaves the
viewport). Wordmark "Jasno" in Geist 600 with a tiny crosshair glyph before it. Nav centre, CTA right (ink pill on
cream; bone outline on film).

### 1. Hero (facade + lens) — 1440×900
- Facade claims fill the upper ~62% of the hero across the full width with an editorial rag (line 2 indented 2 cols,
  line 4 indented 4 cols). Above the claims a small brochure strip: `KOVAČ GRADNJE` mark (Geist 700, tracked) ·
  "Gradimo prihodnost" (serif italic) · "Od leta 1991".
- Bottom band (hairline above): **left (cols 1–6)**: the real **H1** in two lines: line 1 "Kar podjetje pove." in
  Instrument Serif; line 2 "Kar podjetje je." in Geist Mono uppercase-free, same size (`clamp(36px, 3.6vw, 56px)`) —
  the type switch IS the headline. Sub: "Jasno je rentgen za slovenska podjetja. Pod vsako brošuro pokaže blokade, dolgove,
  zamude pri plačilih in pravo bonitetno oceno. Vsako jutro ob 6.00."
  **Right (cols 8–12)**: search (cream-2 field, ink 1px line, button "Presvetlite →") + microcopy + the `Pokaži skelet` toggle.
- Tiny prompt near the lens on first load: mono `PREMAKNITE MIŠKO — POGLEJTE SKOZI` (hidden in capture? no — keep it, small).
- DICOM corner blocks on all four hero corners (ink at 50% on cream).

### 2. Transition — "Vstop v skelet"
Scroll-scrubbed: the lens circle expands from its position to cover the viewport (clip-path circle on the next section,
or scale of a circular mask element) — cream gives way to film. Centered statement, Geist 500 `clamp(36px, 4vw, 64px)`,
balanced: **"Brošura pove, kaj podjetje želi. Rentgen pokaže, kaj zmore."** Under it a thin bone ring echo (the lens,
now 800px, ticks only) and the mono line `218.437 PODJETIJ · PRESVETLJENIH VSAKO JUTRO OB 6.00`.
Capture/reduced-motion: render the final state — dark section with the statement and ring.

### 3. "Štiri kosti bonitete" (four bones of creditworthiness)
H2 + intro "Pod vsako fasado so štiri nosilne kosti. Ko se ena zlomi, se podjetje zamaje." 4 **radiograph panels**
(2×2 on desktop, each ~640×400; 1 column on mobile). Each panel: film-2 frame with corner ticks, mono label top-left
(`01 · LIKVIDNOST`), a question in Geist ("Ali ima denar za račune ta mesec?"), a **bone-like curve** (thick soft-glow
SVG path drawn like a bone contour — a 24-month line chart rendered as a luminous bone with joints at data points),
and a **red finding marker** at the fracture point with caliper label:
1. Likvidnost — "Ali ima denar za račune ta mesec?" — finding `KRATKOROČNA SREDSTVA POKRIJEJO LE 58 % OBVEZNOSTI`
2. Zadolženost — "Koliko dolguje glede na to, kar ima?" — `DOLG ZNAŠA 4,1-KRATNIK LETNEGA EBITDA`
3. Plačilna disciplina — "Kako hitro dejansko plačuje?" — `POVPREČNA ZAMUDA 47 DNI (PRED 6 MESECI: 9)`
4. Pravna čistost — "Blokade, izvršbe, davčni dolgovi." — `BLOKADA TRR OD 2. 10. 2026 · FURS: 18.420 €`
Vary the panels (different curve shapes, one with stacked vertebrae-like bars for leverage, one with an event strip for legal).

### 4. "Slikamo vsak dan ob 6.00" — the CT stack (data sources)
Left: 6 **slices** — thin translucent film rectangles in an isometric/perspective stack (CSS 3D, `rotateX(58deg) rotateZ(-38deg)`),
spaced 34px, each with an edge label (`REZ 1 · AJPES — LETNA POROČILA` / `REZ 2 · BLOKADE TRANSAKCIJSKIH RAČUNOV` /
`REZ 3 · FURS — DAVČNI DOLŽNIKI` / `REZ 4 · INSOLVENTNI POSTOPKI IN IZVRŠBE` / `REZ 5 · LASTNIŠTVO IN ZASTOPNIKI` /
`REZ 6 · 4,2 MIO PLAČILNIH IZKUŠENJ`). On scroll, slices highlight one by one (bone glow) — capture: slice 3 highlighted.
Right: big numbers: **218.437** podjetij · **11** virov podatkov · **3 s** do ocene · **6.00** vsako jutro (Geist 300 numerals,
96px; mono captions).

### 5. "Izvid" — the product moment
A **lightbox**: a glowing near-white panel (`#F3F1EA`, soft bloom shadow `0 0 120px rgba(236,230,217,.25)`) mounted in a
film-3 frame with clips, on which a **radiology-style report** is "printed" (ink on light — the one light surface in the dark world):
- Header row: `IZVID ŠT. 2026-10-06-0412` · `JASNO RENTGEN` · date/time.
- Subjekt: Kovač Gradnje d.o.o., Maribor · MŠ · DŠ · Dejavnost: F41.200 Gradnja stavb.
- **UGOTOVITVE** (numbered, red marker dots): 1. Blokada TRR od 2. 10. 2026 (4 dni). 2. Na seznamu davčnih dolžnikov FURS:
  18.420 €. 3. Povprečna zamuda pri plačilih: 47 dni (pred 6 meseci: 9 dni). 4. Kapital negativen: −212.300 €.
- **DIAGNOZA**: Jasno indeks **34**/100 · Razred **E — Visoko tveganje** · Verjetnost neplačila v 12 mesecih **18,6 %**
  (big Geist numerals; a small 0–100 scale with marker).
- **PRIPOROČILO**: "Dobave samo proti predplačilu. Kreditni limit: 0 €. Ponovni pregled: samodejno, vsak dan ob 6.00."
- Footer of report: mini radiograph thumbnail (the four bones, tiny) + "Samodejni izvid · Jasno d.o.o."
Beside the lightbox (left column on film): H2 "Izvid, ki ga razume vsak." + 3 short points + CTA "Oglejte si primer poročila".

### 6. "Redni pregledi" — monitoring
H2 "Vsako jutro presvetlimo vse vaše partnerje." Copy: "Dodajte kupce in dobavitelje na seznam. Če se karkoli
spremeni, izveste pred prvo kavo — po e-pošti, v Slacku ali v vašem ERP-ju."
A **patient-monitor list** (6 rows): company · tiny ECG-like sparkline (bone line; red segment where the event hit) ·
indeks + delta · last event · status chip. Rows: Kovač Gradnje 34 ▼29 "Blokada TRR" (red) / Tiskarna Vidmar 41 ▼9 "Izvršba"
/ Strojna Krajnc 46 ▼7 "Letno poročilo ni oddano" / Novak Elektro 58 ▼6 "Zamuda 12 dni" / Pekarna Zrno 79 ▲11 "Blokada
odpravljena" (ok) / Hribar Les 87 ▲3 "Ocena izboljšana" (ok). Plus one alert card example floating at the right:
`06.02 · RDEČE · KOVAČ GRADNJE D.O.O. — BLOKADA TRR. PRIPOROČILO: USTAVITE DOBAVE.`

### 7. Comparison — "Ena slika na leto ni diagnoza."
Two columns styled as two films on a viewer: left a single faded, overexposed film labelled `KLASIČNA BONITETNA OCENA ·
1 SLIKA / LETO`, right a crisp film strip of daily frames `JASNO · 365 SLIK / LETO`; below, the shared comparison rows as
a clean table (mono labels).

### 8. Pricing — "Paketi"
4 film-sheet cards (film-2, corner ticks, mono plan code `PAKET 01..04`), Posel card highlighted with a bone outline and a
red marker tag `NAJPOGOSTEJE IZBRAN`. Prices in Geist 300 64px. Annual note under.

### 9. Quote
Quote #1 in Instrument Serif italic, 52px, bone on film, with a mono attribution and a tiny caliper flourish.

### 10. Final CTA — "Poglejte skozi prvega partnerja. Brezplačno."
Return to cream for the last section (bookend). A smaller lens demo again over a single facade line ("Odličen plačnik.")
revealing `PLAČUJE 2 DNI PRED ROKOM · INDEKS 87` (a *positive* truth — Jasno is not only about bad news). Search + CTA.

### 11. Footer
Film. Big wordmark "Jasno" (Geist 600, ~22vw, bone at 10% with a lens-shaped reveal of full opacity in the capture),
DICOM-style legal block, link columns, legal line + fictional-data note.

## Motion (trigger · duration · easing)
- Lens follow: rAF lerp .14; radius ease when over a finding (+10px, .35 s `power2.out`); ring ticks rotate continuously.
- Skeleton text inside lens: on first reveal of each line, a 220 ms ScrambleText from random mono glyphs (once only).
- Hero load: facade claims rise by line (SplitText lines, `yPercent 105→0`, 1.0 s `expo.out`, stagger .07); lens fades/scales
  in from .6 at 1.0 s; DICOM corners type in (ScrambleText .6 s).
- Transition: clip-path circle radius scrubbed (`scrub: .6`).
- Bones: stroke-dashoffset draw 1.4 s `power2.inOut`, red marker ping (scale 0→1 `back.out(3)`, ring pulse once).
- CT slices: scrub highlight; numbers count 1.2 s.
- Lightbox: flicker-on like a real viewer (opacity 0→.6→.3→1 over .5 s, once) — subtle, no strobe.
- Hovers: rows highlight with bone hairline; buttons invert; links get red underline.
- Reduced motion: no lens follow (static composed lens + toggle), no scramble, no scrub, no flicker.
