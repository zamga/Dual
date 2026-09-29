# Quorum v2 art direction: "Stone and Signal"

29.09.2026. Replaces the *look* of `docs/DESIGN.md`; keeps every product rule (BRIEF §2, §7, ultramarine's meaning, DESIGN §14 copy contract). Target: SOTD + Developer + Mobile Excellence.

Screenshots: `/tmp/claude-0/-home-user-Dual/20bffdcd-5e6b-5fde-b318-f55e969d0b83/scratchpad/v2-direction/` (`d-` 1440×900, `m-` 390×844). Some desktop captures show the Arial-metric fallback (Archivo failed through the sandbox proxy); that it looks generic is gap 3.

---

## 1. Jury scorecard of the current site

| Criterion (weight) | Score | Why |
|---|---|---|
| Design (40%) | **6.4** | Disciplined but flat: one template everywhere, heavy generic display type, empty bays, broken rules. |
| Usability (30%) | **7.1** | Native scroll, keyboard model and step buttons are good. Chrome is heavy on phones and routes have no transitions. |
| Creativity (20%) | **6.3** | The lintel is a strong idea. On screen it is a parallel-coordinates chart, then DOM swaps on an empty stage. |
| Content (10%) | **7.8** | Rare honesty: worst pick, intervals, sealed chain. |
| **Weighted** | **6.73** | Honorable Mention at best. September SOTDs scored 7.22–7.69, with Design sub-scores of 7.25–7.93. |

### The 10 biggest gaps against the winners

1. **No hero object, only a chart.** `d-home-hero-0.png` is a 1,351-line hairball that reads as a dashboard. Winners carry one object (Lando's helmet, the Tresmares peak, Moto Finance's card); our colonnade is four hairlines.
2. **An empty stage for 400svh.** About 70% of `d-home-hero-1.png` is black, and in `d-home-hero-2.png` a flat CSS phone floats mid-frame. The headline never moves, so scroll changes the caption rather than the scene. USAvionix makes every beat a new scene.
3. **Type without a voice.** The display face is a heavy 580–600 grotesk that becomes Arial Bold as a fallback (`d-home-s07.png`, `d-ledger-0.png`). Two-line mastheads have loose leading (`d-join-0.png`). Words collide on phones ("Threeoffourcolumns", `m-p-0075-1.png`). Three families compete; winners use one for ~99% (Oryzo, Mercury).
4. **Every page is the same page.** Ledger, backtest, join, research and pricing (`d-*-0.png`) all use kicker, bold H1, lede and a table of contents in the strip. About 60% of each first screen is empty.
5. **The core device looks broken.** Opaque text grounds chop rule 2 into stubs around every paragraph (`d-p-0075-0.png` at x=540, `m-p-0075-1.png`, `m-join-1.png`). Rules also cut through headlines (`d-home-s07.png`). A juror reads this as a bug.
6. **No intro, no transition, no persistence.** A route change is a 10 px fade. LxL and Aspen have seamless transitions.
7. **Almost no motion vocabulary.** Reveals are a 28 px fade and hover is an underline. Nothing is tactile. Winners own one gesture (bleibtgleich's dial, Cerebrium's shield).
8. **Chrome eats the phone.** The demo bar (3 lines) and header take about 145 px, or 17% of the first screen (`m-home-hero-0.png`). The desktop header is 116 px.
9. **Timid tonal range.** Karst to Chamber is a hard cut (`d-home-s04.png` to `s05`), and Paper barely separates from Karst (`d-p-0075-0.png`). On dark, Lift #8C96FF as a 3 px stroke reads lavender, so the most important moment has the least presence.
10. **Dead ends.** The footer wordmark is a default grotesk (`d-home-s10.png`). The menu is a plain list (`m-menu.png`). Research shows a glossary where the product should be (`d-app-research-1.png`).

---

## 2. Concept

**"Stone and Signal": every day 1,351 stocks fall through four stone columns and nearly all come to rest as silence; on the rare day three columns hold the same stock, one ultramarine beam of light is laid across them, and that beam is the text.**

Why it wins:
- It gives our truth one weighty hero object, a lit colonnade, which is what Lando, Tresmares and Moto Finance won with.
- It makes the rarest product event the only loud thing on the site, following Oryzo.
- The spectacle is real data. Every grain is a scored stock, so Content and Developer scores rise together.
- Raw WebGL suffices: instanced points and four boxes, no models or textures.
- The floor of sediment makes "we mostly do nothing" visible, which no finance winner has done.

---

## 3. The system

### 3.1 Type

Font URL: `https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,200..900&family=Martian+Mono:wdth,wght@75..112.5,100..800&family=Instrument+Serif:ital@1&display=swap`. On 29.09.2026 I checked that all three serve latin-ext (č š ž) and that Mona Sans exposes `font-stretch: 75% 125%`.

- **Mona Sans sets about 95% of all text.** Condensed means column and wide means lintel:
  - stacked statements use wdth 75;
  - single horizontal statements use wdth 125 at a light weight;
  - weights are intermediate only: 300, 420, 460, 480, 520.
- **Martian Mono** at wdth 75 sets every figure, ticker, timestamp, hash and label, with tabular figures and slashed zero.
- **Instrument Serif Italic is the voice.** Use it once per page at most, for the verdict line: "Whatever happened.", "Most days, nothing." or the scoreboard answer.
- **Newsreader is retired.**

| Token | Face / axes | Size | Leading | Tracking |
|---|---|---|---|---|
| `--t-hero` | Mona 75 / 460 | `clamp(4.5rem, 1.6rem + 11.2vw, 13rem)` | .84 | −.035em |
| `--t-d1` | Mona 75 / 480 | `clamp(3.25rem, 1.4rem + 7vw, 9rem)` | .88 | −.03em |
| `--t-d2` | Mona 75 / 500 | `clamp(2.5rem, 1.3rem + 4.2vw, 6rem)` | .9 | −.025em |
| `--t-lintel` | Mona **125 / 300** | `clamp(1.6rem, .9rem + 2.6vw, 3.6rem)` | 1 | −.015em |
| `--t-voice` | Instrument Serif italic | `clamp(2rem, 1.1rem + 3.2vw, 4.75rem)` | .95 | −.01em |
| `--t-lede` | Mona 112 / 360 | `clamp(1.2rem, 1rem + .8vw, 1.65rem)` | 1.3 | 0 |
| `--t-body` | Mona 100 / 420 | 17 px (16 px below 640) | 1.55 | 0 |
| `--t-fig-xl` | Martian 75 / 300 | `clamp(2.5rem, 1.4rem + 3.4vw, 5.5rem)` | 1 | −.04em |
| `--t-fig` / `--t-label` | Martian 75 / 420; 520 caps | 13 / 11 px | 1.35 | 0 / +.08em |

Display type runs to at most 3 lines with `text-wrap: balance`. Add `word-spacing: .06em` at wdth 75, which fixes gap 3. The display minimum on phones is 2.5 rem.

### 3.2 Colour (dark first, same product rules)

| Token | Hex | Role |
|---|---|---|
| `--night` / `--night-2` | `#0A0C0F` / `#12151A` | Home, pick hero, research, menu / raised |
| `--mist` / `--mist-2` | `#C9CFD2` (12.6:1) / `#8E979D` (6.3:1) | Text on night |
| `--karst` | `#E3E6E4` | Reading ground: ledger, backtest, pricing, join |
| `--paper` | `#F7F8F6` | Notes and phone screen (lifted so it separates from Karst) |
| `--graphite` / `--slate` | `#111418` / `#545C63` | Text on light |
| `--rule` | Graphite 11% / Mist 10% | The four rules |
| `--ultra` | `#1F2EE0` | **Quorum only**: fills, badge, SMS bubble, lintel core |
| `--lift` | `#8C96FF` | Quorum text and strokes on night (7.2:1) |
| gain / loss | `#0B6E4F` / `#B3261E`; night `#4FD1A1` / `#FF8A7A` | Always with sign and arrow |

**On night the lintel is light, not paint.** It has an ultramarine core, a 1 px Lift edge and an analytic falloff (4.3), which fixes gap 9 without adding a colour. Only the lintel may emit light, because it means agreement. Nothing uses a gradient fill; shader falloff and masks are technique.

### 3.3 Grid

- Keep the four rules and `--cols` (rules at 180, 540, 900 and 1260 px at 1440).
- **Rules become continuous and faint** (1 px at `--rule`) and pass behind prose. Delete the opaque text grounds, which fixes gap 5. Only `.display` masks them, using a ground clipped to its box with .12em padding. Tables keep their columns on the rules.
- Measure: r1→r3, 64ch maximum.
- New class `.c-lintel`: one line from r1 to r4.
- In e2e, replace `proseStrike` with `ruleContrast` (rule alpha ≤ .12 under text) and keep `ruleStrike` for digits.

### 3.4 Texture and icons

- **Grain.** Static luminance grain in the WebGL composite pass, 3.5% on night and 2.5% on light, regenerated only on resize and never animated. Without WebGL, use an inline `feTurbulence` data URI (`baseFrequency .9`) on `body::before`.
- **Column stone.** Two-scale value noise (38/140) at ±4% albedo, plus fluting `.5+.5*cos(x*π*8)`.
- **Icons.** Ten inline SVGs on a 16 px grid, 1.5 px stroke, square caps, no fills. The menu icon is two lintels that cross to ±45° to become close (220 ms). Figure arrows stay as the glyphs ↑ ↓ →.

### 3.5 Motion tokens

- **Easings:**
  - `--e-out: cubic-bezier(.16,1,.3,1)` for reveals;
  - `--e-io: cubic-bezier(.7,0,.2,1)` for wipes and the camera;
  - `--e-ui: cubic-bezier(.2,0,0,1)` for controls;
  - `--e-land: cubic-bezier(.2,.9,.25,1)` for the lintel.
- **Durations:** 150, 260, 420 and 700 ms.
- **Kept rules:**
  - numbers never pass through false values;
  - no looping UI animation;
  - the hero's idle drift pauses after 12 s idle and whenever it is off-screen.

---

## 4. Signature moments

### 4.1 Hero: "The Assembly" (raw WebGL2, WebGL1 fallback)

**Setup.** One fixed canvas `#stage` sits behind `<main>`. DPR is capped at 1.75 (1.5 on phones). The hero section is 520svh with a sticky 100svh viewport, and `p` is native scroll progress through it. The camera is perspective, fov 28°, z = 9.

**Geometry, all generated in JS:**
- **Columns:** four 0.05 × H × 0.05 boxes at the projected rule positions. Lambert key light from (−.4, 1, .6), a Mist rim `pow(1−n·v, 3)*.35`, and limestone from 3.4.
- **Grains:** 1,351 stocks from `hero.json`, times 4 motes, drawn as 5,404 instanced quads. Attributes are `a_pct` (vec4), `a_seed` and `a_isPick`. The vertex shader computes everything from `u_p`, so there is no per-frame CPU work.
- **Lintel:** a box from A to D at the 91st-percentile height, scaled in x by `u_lintel`.
- **Floor:** a sediment plane at y = −1.05.

**States by `p`** (every state keeps its step button):

| p | Scene | DOM |
|---|---|---|
| 0–.10 Universe | Grains drift as a cloud in front of the columns (curl noise, amplitude .03). | "No quorum, / no text." in `--t-hero`, the lede, and "Issue #215 · 10.08.26 · 1,351 scored". |
| .10–.30 The vote | Each grain splits into 4 motes that fly to their column at percentile height. Each mote's delay is `seed*.5` of the phase, on `--e-out`. The 91–100 band shows as a 6% Mist slab. | The headline masks out upward (−102%, 450 ms, 25 ms stagger). New line: "Four families rank every stock." |
| .30–.50 Silence | Motes below 91 fall (`y −= g·t²`, about .08 of p per fall) and settle into the sediment with ±.01 jitter. The camera tilts down 4°. | `--t-lintel`: "1,349 stocks, no quorum." then, in the voice face, "Most days, nothing." |
| .50–.64 The quorum | The camera dollies to z = 6.2 on the pick. Its A, B and D motes brighten; C stays at 69, labelled "69 · no vote". The lintel extrudes from A to D over .06 of p on `--e-land`, overshooting 2 px and settling. This is the only ultramarine in the scene. `hero.json` identifies only the pick, so only the pick gets a lintel. | "SHGP · 3/4" in Lift Martian, at the lintel's end. |
| .64–.82 The text | The lintel contracts to a 2 px line on the exact rect of the SMS baseline, then crossfades to the DOM line on the same pixels. | The phone rises (`clip-path: inset(100% 0 0 0)` to `inset(0)`) and the bubble grows (4.6). |
| .82–1 The result | The canvas dims to 30%. | The phone screen expands into the Paper note (FLIP, 700 ms). The 21-day excess path draws with `stroke-dashoffset` scrubbed by p. The result appears as a digit reveal, followed by "Whatever happened." |

**Idle and cost.** Pointer parallax ±1.2° (lerp .06, `pointer:fine` only). Three draw calls; render only while intersecting and changed.

**Fallbacks** (current ladder kept):
- the inline SVG, a 300-grain subsample with a static frame per state, is the LCP element;
- a 2D canvas on weak GPUs;
- stepped SVG for reduced motion and `?gl=0`.

### 4.2 Intro: the "14:00" boot

**Rules:**
- first visit per session only (`sessionStorage` in try/catch);
- 1,400 ms maximum, skipped by any key, click or scroll;
- added by JS as a class, so content is visible at rest without JS;
- never shown under reduced motion.

**Sequence** (on night):

| Time | What happens |
|---|---|
| 0–80 ms | The rules sit at height 0 |
| 80–680 ms | The rules rise (`scaleY` 0→1, `--e-io`, 60 ms stagger from A to D) |
| 200–900 ms | Four mono lines appear in bay 1, 120 ms apart, each revealed by `clip-path` in 12 `steps()` over 180 ms |
| 900 ms | The readout fades out over 200 ms |
| 1,000–1,400 ms | The headline masks in (4.7) |

The four lines use the real latest issue:

```
06:00 data in · 1,353 stocks
11:30 vetoes · 0 rule · 0 news
13:45 sealed · sha256 3f94299f
14:00 published · issue #249 · no quorum
```

It awaits `document.fonts.load('460 1em "Mona Sans"')` (1,200 ms timeout), hiding the font load.

### 4.3 Lintel light

The lintel quad is expanded by 24 px on each side and drawn with additive blending. There are no blur passes.

```
float d = abs(uv.y - .5) * h;                  // px from beam centre
float core = smoothstep(1.5, .5, d - halfT);   // 3 px core
float glow = exp(-d*d / (2.*49.)) * .55;       // sigma 7 px
col = mix(ULTRA, LIFT, core*.35) * (core + glow);
```

The ledger pick rows and the pick hero reuse it.

### 4.4 Page transition: "The lintel sweep"

View Transitions run on `main` only. The rules, the header and `#stage` each have their own `view-transition-name` and never move.

1. **Out.** Old content moves `translateY(0 → −16px)` and fades to opacity 0 over 180 ms on `cubic-bezier(.7,0,.84,0)`.
2. **Sweep.** A 1 px `--fg` line spanning r1→r4 travels from the header's bottom edge to the viewport bottom in 420 ms on `--e-io` (WAAPI). On the same curve, `::view-transition-new(main)` animates `clip-path: inset(0 0 100% 0)` to `inset(0)`. Between night and karst, that line is the only border, which replaces the hard cut from gap 9.
3. **In.** Display lines mask in, starting 120 ms into the sweep. Body text fades up 12 px over 420 ms after a 200 ms delay.
4. **Shared element.** The ultramarine lintel or badge carries `view-transition-name: pick-<no>` on the hero, ledger rows, calendar cells and the pick page, and morphs between them over 520 ms.

**Budget:** first change within 50 ms, done within 700 ms.

**Fallbacks:** no View Transitions: instant swap plus reveals; reduced motion: 150 ms crossfade.

### 4.5 Cursor and hover: "Plumb line"

The native cursor stays.

**Rules** (on `pointer:fine`):
- Within 24 px of a rule, the rule lights to alpha .5 over a 180 px window centred on the pointer's y. This is a `mask-image` falloff.
- A Martian label, e.g. "B · Fundamental momentum", fades in over 120 ms and out over 200 ms.
- This replaces the 220 ms dwell tip. The plinth buttons stay for keyboard users.

**Other hovers:** link underline scales in from the left (220 ms), arrow moves 4 px; button fill swaps via `clip-path: inset(0 100% 0 0)` → `inset(0)` (260 ms); ledger rows lift to Paper.

### 4.6 The SMS moment

**The phone** is DOM only:
- 300×620 px on desktop, 78vw on phones;
- 44 px radius and a 10 px `--night-2` bezel with a 1 px inner edge at Mist 14%;
- a Paper screen, with the real "14:00" in the status bar.

**The bubble** grows up from the baseline the lintel hands over, one whole line every 90 ms. Each line masks in over 260 ms, and links are underlined last. Under the phone sits the static label "154/160 GSM-7 · 1 segment", computed by `core/gsm7.js`.

### 4.7 Type and number reveals

**Masked lines.** Split lines with `Range.getClientRects()` after fonts are ready, and wrap each in `overflow: clip`.

| | Motion | Duration | Stagger | Easing |
|---|---|---|---|---|
| In | `translateY(102%)` → 0 | 700 ms | 60 ms | `--e-out` |
| Out | 0 → −102% | 450 ms | 25 ms | — |

Trigger them with `animation-timeline: view()` and `animation-range: entry 5% cover 25%` inside `@supports`, with an IntersectionObserver fallback.

**Digits.** Each digit sits in a 1ch cell.
1. The sign and arrow fade in first (150 ms).
2. Each digit drops from blank (−100%) to 0 over 520 ms, with a 35 ms stagger from right to left.

No intermediate value is ever shown, and `aria-label` holds the whole value.

### 4.8 The ownable control: "Lower the bar"

This goes on home §1 and #how-it-works.

**Control.** A `role="slider"` with range 50–99 and default 91. Arrow keys move ±1, PageUp/PageDown ±10, Home/End jump to the ends.

**Chart.** A 2D-canvas mini colonnade plots the latest issue's 1,351 stocks at 4 dots each. Dots above the bar are Mist; dots below fall grey.

**Readout.** It crossfades in 150 ms: "At the 91st percentile: *q* stocks on three columns. At the 70th: *n*." Both are computed live from `hero.json` percentiles (before vetoes, and labelled so).

**Honesty.** Only at 91, the real rule, does the pick turn ultramarine. Every other value is labelled "Hypothetical threshold".

The product explains its silence by letting you break it.

### 4.9 Footer lintel

"QUORUM" is set in Mona 125 / 300 across r1→r4, above a 6 px lintel.
- If the latest issue had a quorum, the lintel is ultramarine.
- If not, it is a hairline labelled "No quorum today".

---

## 5. Page compositions (desktop / phone)

### Home (night → karst → night)
- **Hero** (4.1).
- **§1 Silence.** The calendar runs r1→r4 with 14 px cells, under the headline "249 issues. 75 texts.". "Lower the bar" sits in bay 4.
- **§2 The day.** A sticky Martian clock in the margin steps from 06:00 to 14:00 as the timetable rows pass (CSS scroll-driven). The four families take one bay each.
- **§3 The chain** (night, entered via the sweep). "Verify in your browser" prints one line per record, 30 ms apart, ending "87/87 match".
- **§4 Scoreboard.** The dot plot sits on the rules, with the answer in the voice face.
- **§5 Pricing.** Three plinths, then the footer lintel.
- **Phone:** same order. Calendar cells are 9 px and the calendar scrolls sideways within its row. The slider runs full width.

### Ledger (karst)
- A **record wall**: "The ledger." in d1, then five `--t-fig-xl` figures, one per rule, in the brief's order: 87 · 51% · ↑ +0.7% · ↓ −20.3% · −15.9%.
- The CI is a 1 px bar under the hit rate.
- The table sits on the rules. Pick rows carry a 3 px ultramarine lintel, which is the shared transition element.
- The chain sits on night.
- **Phone:** the figures form a 2×3 grid of half-bays, and rows become 3-line cards.

### Pick `#p-0075` (night, then paper)
- The first screen is the Assembly frozen at "The quorum" for this pick. That only works when `hero.json` holds that issue; other picks use the 2D colonnade.
- "SHGP" is set in `--t-hero`, with the name, FICTIONAL and "BUY · 3/4" in the strip.
- On scroll, a Paper note sheet (24 px top radius) rises over the stage. It holds:
  - the thesis and colonnade;
  - the drivers and sensitivity;
  - the 21-day path;
  - the disclosures, always open.
- **Phone:** the ticker is 30vw and the note runs full width.

### Backtest (karst): stone versus scaffold
- Everything hypothetical is drawn as scaffold: dashed 4/3 strokes on the existing hatch, never a solid curve.
- Sticky HYPOTHETICAL banner; the H1 "Hypothetical." in the voice face.
- **Phone:** the chart is 4:5, and the table scrolls sideways with a sticky first column.

### Join (karst)
- Seven steps as a vertical colonnade on rule 1; a completed step draws a short lintel. Live SMS preview sticky in bay 4 (septet counter, non-GSM highlight); consent hash under the checkbox.
- **Phone:** the preview becomes a sticky bottom sheet (48 px handle, 60svh).

### Research (night)
- The first screen is the universe as four strips on the rules: 1,353 dots on a 2D canvas, with the top decile marked.
- Research viewers get a virtualised table (56 DOM rows); Signal viewers keep strips and glossary, no fake rows.
- **Phone:** the strips stack, with a sticky ticker column.

### Pricing (karst)
- "One price for everyone." in d1; three equal plinths on bays 1–3 (prices in `--t-fig-xl`); launch note in bay 4. No tier highlighted, no ultramarine.
- **Phone:** stacked plinths under a 44 px monthly/annual control.

### Menu (night sheet)
- Opens with the sweep reversed (420 ms). Three questions in d2 across bays 1–3; links mask in at 40 ms stagger; hovering a question lights its rule.
- Bottom strip: the day's status, locale, legal links.
- **Phone:** questions at 2.75 rem, and links as 48 px rows.

### Shell
- **Demo bar:** 1 line on desktop and at most 2 on phones, in Martian 10 px at wdth 75, with the same copy.
- **Header:** 64 px. The inline nav appears only from 1280 px.

---

## 6. Build plan: three independent work packages

This document is the contract for tokens and class names. Each package merges behind `?v2=1` (`html[data-v2]`), and v2 becomes the default once all three pass.

### WP-A: System and page styling

**Owns:** `web/css/*`, the `<head>` of `web/index.html`, `tests/web/design-system.test.js`, and `ruleContrast` in `tests/e2e/checks.js`.

**Tasks:**
1. Swap the font URL and add metric fallbacks: Mona Sans per width band (75, 100, 112, 125) on Arial, Helvetica and Liberation Sans; Instrument Serif on Georgia.
2. Add the tokens from 3.1, 3.2 and 3.5.
3. Make the rules continuous, mask them behind display type, and remove the prose grounds.
4. Add the grain fallback.
5. Write the reveal CSS.
6. Build the §5 layouts: record wall, plinths, note sheet, scaffold, join colonnade and menu.

**Acceptance:**
- Contrast tests cover every pair in 3.2.
- No hex value appears outside `tokens.css`.
- Ultramarine appears only in allowlisted places.
- CSS is 45 KB gzipped or less.
- CLS is .02 or less with fonts blocked.
- No word boxes overlap at 360 px.

### WP-B: The Assembly (WebGL)

**Owns:** `web/js/hero/*` (new `assembly.js`, `gl.js`, `shaders.js`), `level-data.js` with its tests, and `web/js/charts/colonnade.js`.

**Tasks:**
1. Set up WebGL2, falling back to WebGL1 with `ANGLE_instanced_arrays`.
2. Draw the grains, columns and lintel shader, plus the composite pass.
3. Write the 4.1 state machine as pure functions, tested in Node.
4. Hand off the SMS baseline rect.
5. Keep the SVG and canvas fallbacks on the new states.
6. Build the "Lower the bar" canvas.

**Acceptance:**
- Hero JS is 30 KB gzipped or less.
- No fetch other than `hero.json`, and no textures.
- At least 55 fps on a tier-2 GPU at 1440×900 and DPR 1.75, and at least 50 fps on a Pixel 6a-class phone.
- Main-thread work stays under 4 ms per frame.
- Zero frames render off-screen, asserted with a counter.
- Reduced motion gets stepped SVG; `?gl=` forces an engine; the SVG is LCP.

### WP-C: Shell, transitions and page modules

**Owns:** `web/js/shell.js`, the transition and boot code in `web/js/app.js`, `web/js/dom.js` (`reveal()`, `digits()`, `sweep()`), and the markup in `web/js/pages/*.js`.

**Tasks:**
1. The boot (4.2).
2. The sweep and shared elements (4.4).
3. The plumb line (4.5).
4. The menu sheet.
5. The slim header.
6. The §5 markup.
7. The truthful footer lintel.

**Acceptance:**
- A route change shows its first change within 50 ms and finishes within 700 ms. INP is 150 ms or less.
- Back, forward and deep links (`#p-0075`, `#ledger~scoreboard`) work, focus the `h1`, and announce the change.
- The boot is skippable, lasts 1.4 s or less, and never shows under reduced motion or on a repeat visit.
- Every existing e2e contract stays green at all five sizes: demo-bar copy, launch copy, one `h1`, no overflow, 44 px targets.
- It runs as a static Artifact: hash routes, no downloads, storage wrapped in try/catch.

### Whole-site budgets (Lighthouse mobile, Moto G Power, 4G, in CI)

| Metric | Budget |
|---|---|
| LCP | ≤ 1.8 s |
| CLS | ≤ .02 |
| INP / TBT | ≤ 150 ms |
| JS initial / hero | ≤ 90 / 30 KB gz |
| Fonts | ≤ 190 KB |
| First-view transfer (excluding `data/`) | ≤ 450 KB |
| Lighthouse Performance / Accessibility / Best Practices | ≥ 90 / 100 / ≥ 95 |
| Mobile Excellence self-audit | ≥ 8/10 per criterion |

**Build order:**
1. Type, tokens and the rule fix (WP-A), which I estimate adds about +0.4 to Design.
2. The hero (WP-B).
3. Transitions and the boot (WP-C).
4. The page compositions.
5. "Lower the bar" and the footer lintel.

**Target after v2** (estimate, not a promise): Design 7.8, Usability 7.6, Creativity 7.7, Content 7.9, **7.72 weighted**. That would sit level with Léo Parpeix (7.69, the month's highest) and above every finance winner (7.25–7.55). The hero's first 10 seconds on a phone decide it.
