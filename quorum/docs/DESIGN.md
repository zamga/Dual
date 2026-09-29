# Quorum design system: Stone and Signal (v2), as built

This is the system in `web/`. The art direction and its reasons are `docs/DESIGN-V2.md` (29.09.2026), which replaced the v1 "Colonnade" look; the product rules did not change (brief §2, §5, §7; the meaning of ultramarine; §9 and §14 below). The structure is `docs/ARCHITECTURE.md` §5. Where this file and the code disagree, the code is right and this file is a bug. v2 is the default; there is no v1 switch.

**The idea in one line:** every day about 1,350 stocks fall through four stone columns (the four faint rules on every page) and nearly all come to rest as silence; on the rare day three columns hold the same stock, one ultramarine beam is laid across them, and that beam is the text. Ultramarine still means only one thing: the models agreed. The only imagery is data and type.

---

## 1. Files

| File | What it holds |
|---|---|
| `web/index.html` | The shell: fonts, CSS, skip link, **the four rules** (`.rules`), demo bar, header, `<main id="view">`, footer, menu sheet, plinths, rule tip, two aria-live regions. No inline script or style (the server CSP forbids them). |
| `web/css/tokens.css` | Palette, semantic tokens per surface, type, space, motion, and the metric-matched fallback faces (§3). **The only file allowed to contain hex colours.** v1 token names (`--chamber`, `--ultramarine`, `--hairline`, `--fs-*`, `--t-fast` …) remain as aliases of the v2 tokens. |
| `web/css/base.css` | Reset, type classes, the grid and the rules (with the plumb line), focus ring, grain, reveals (masked lines, digits), the boot, reduced motion, View Transitions (the lintel sweep). |
| `web/css/components.css` | Shell and shared components (§7): demo bar, header, pill, menu sheet, plinths, plumb label, footer and footer lintel, buttons, tables, SMS and phone. |
| `web/css/layouts.css` | The v2 page compositions (§10): record wall, stage screen, note sheet, scaffold, pricing plinths, join colonnade, day clock, "Lower the bar", strips. **Page modules compose these.** |
| `web/css/pages.css` | Page blocks (one banner comment per page prefix, §9), and the Assembly's block (`.asm`, owned by the hero). |
| `web/js/app.js` | Boot, hash router, View Transitions, data loader + cache, demo clock, locale, view-as tier (demo) or the viewer's tier from `GET /api/me` (live), `ctx.launch()`. |
| `web/js/router.js` | Route table (pure). **Add routes here.** Links are built with `href(name, param?, section?)`: `href('ledger', null, 'scoreboard')` → `#ledger~scoreboard` (a section is `~id` after the flat token, never `?key=value`). |
| `web/js/launch.js` | `launchInfo(backtest)` (pure): the **engine launch gate** under amendment A-1, gates (a)(b)(c)(e) + (d1) + (d2); `state` is `waiting`, `research` (a gate that cannot recover failed), `ready` (the engine gate passes) or `unknown`. `launchCopy(info, locale)`: every launch sentence a page prints, for every state (§9). Every page asks `ctx.launch()` before it says anything about texts. |
| `web/js/shell.js` | Demo bar, header, pill, menu sheet (the day's status in its foot, a question lights its rule), footer and the footer lintel (from the latest issue), the plumb line and plinth labels, header surface detection. |
| `web/js/clock.js` | Demo clock and pill state (pure, tested). |
| `web/js/i18n.js` | Shared EN/SL strings, `t()`, `tp()` (plurals), `pickL()`, `formatters()`. |
| `web/js/dom.js` | `h()`, `svg()`, `html```, `raw()`, `announce()`, `focusEl()`, `copyText()`, `setNumber()`, `store()`, `prefersReducedMotion()`, `onVisible()`; the reveals: `splitLines()` / `reveal()` (masked lines, undone once they land), `digits()` / `playDigits()` (digit reveal), `sweepLine()` / `sweep()` (the lintel sweep). |
| `web/js/ui.js` | Components with behaviour: `hashChip`, `timestamp`, `signed`, `quorumBadge`, `sectionHead`, `statStrip`, `trackRecordLabel`, `launchNote`, `simulationNote`, `phone`, `familyName`, `familyDef`. |
| `web/js/pages/_content.js` | Long-form template: `masthead`, `contentSections`, `toc`, `table`, `page`, `toNode`. |
| `web/js/hero/assembly.js`, `gl.js`, `shaders.js`, `flat.js`, `level-data.js` | The Assembly (home hero, DESIGN-V2 §4.1) and its pure helpers. |
| `web/js/charts/*.js` | Charts (`silence-calendar.js`, `lower-the-bar.js`, `quorum-example.js` …). |
| `web/js/pages/*.js` | One module per route. Stubs (`export { render } from './_pending.js'`) mark routes still to build: replace the file. |

## 2. Palette and surfaces (DESIGN-V2 §3.2)

Dark first. Exact values; never add a colour.

| Token | Hex | Use |
|---|---|---|
| `--night` / `--night-2` | `#0A0C0F` / `#12151A` | Home, the pick hero, research, the chain, the menu, the footer / raised on night (demo bar, phone bezel) |
| `--mist` / `--mist-2` | `#C9CFD2` (12.6:1) / `#8E979D` (6.3:1) | Text / secondary text on night |
| `--karst` | `#E3E6E4` | The reading ground: ledger, backtest, pricing, join |
| `--paper` | `#F7F8F6` | Note sheets, the phone screen (lifted so it separates from Karst) |
| `--graphite` / `--slate` | `#111418` / `#545C63` | Text / secondary text on light |
| `--ultra` | `#1F2EE0` | **Only a quorum**: fills, badge, SMS bubble, lintel core, favicon |
| `--lift` | `#8C96FF` | Quorum text and strokes on night (7.2:1) |
| `--gain` / `--loss` | `#0B6E4F` / `#B3261E` | P&L on light, always with sign and arrow |
| `--gain-night` / `--loss-night` | `#4FD1A1` / `#FF8A7A` | P&L on night |
| `--white` | `#FFFFFF` | Text on an ultramarine fill only |

Alphas (not colours): `--rule-light` Graphite 11% and `--rule-night` Mist 10% (the four rules); `--line-*` 20% (borders, table rules; never text); `--line-soft-*` 10% (inner rules). `--hairline` is kept as an opaque Graphite-24%-on-Karst mix for v1 blocks that mix it.

**Semantic tokens** switch per surface; components use only these: `--bg --surface --fg --fg-2 --rule --line --rule-inner --quorum --on-quorum --gain-c --loss-c --focus --grain`.

- Default: Karst. `.night` (also `.chamber`, `[data-surface='night'|'chamber']`) flips to night: `--quorum` becomes Lift, Gain/Loss the night variants, focus Mist, grain 3.5%. `.paper` returns to light (Paper ground) inside night; `.karst` does the same on Karst.
- `prefers-contrast: more` raises the rule and line alphas and darkens Slate.
- **On night the lintel is light, not paint** (DESIGN-V2 §4.3): an ultramarine core with a Lift edge and a falloff. Only the lintel may emit light. Nothing uses a gradient fill; a `mask-image` falloff is technique (the plumb line), and `tests/web/design-system.test.js` allows `gradient(` only inside a mask.

**Rule: if ultramarine is on screen, the models agreed.** Buttons, links, focus, hover, decoration: never ultramarine. The design-system test fails a CSS rule that reads `--ultra`, `--ultramarine`, `--lift` or `--quorum` unless its selector names a quorum element (allowlist in the test; extend it only for a real quorum element).

## 3. Type (DESIGN-V2 §3.1)

Fonts (exact URL in `index.html`, with preconnect): **Mona Sans** (wdth 75–125, wght 200–900) for ~95% of text, **Martian Mono** (wdth 75–112.5) for every figure, ticker, timestamp, hash and label, **Instrument Serif Italic** for the voice. Newsreader and Archivo are retired. `font-variant-numeric: tabular-nums` is global; weights are intermediate (300, 360, 420, 460, 480, 500, 520).

| Class | Setting | Use |
|---|---|---|
| `.display.d-hero` | Mona 75 / 460, `--t-hero` (to 13rem), leading .84, −.035em | The home headline; the pick ticker |
| `.display.d1` | Mona 75 / 480, `--t-d1` (to 9rem), .88, −.03em | Page titles (`masthead`, `.wall__title`) |
| `.display.d2` | Mona 75 / 500, `--t-d2` (to 6rem), .9 | Section headlines (`sectionHead`), the menu questions |
| `.display.d3` / `.d4` | Mona 75 / 500, `--t-d3` / `--t-d4` | Sub-heads, content-section h2, step titles |
| `.t-lintel` | Mona **125 / 300**, `--t-lintel` | One horizontal statement across r1→r4 ("1,349 stocks, no quorum.") |
| `.voice` | Instrument Serif italic, `--t-voice`, .95 | **Once per page at most**: the verdict ("Most days, nothing.", "Whatever happened.", the scoreboard answer, "Hypothetical.") |
| `.lede` | Mona 112 / 360, `--t-lede`, 1.3, max 40ch | Standfirst under a headline |
| `.prose` | Mona 100 / 420, 17 px (16 below 640), 1.55, max **64ch** | Long text (r1→r3) |
| `.fig-xl` | Martian 75 / 300, `--t-fig-xl`, −.04em, nowrap | Record figures: the ledger wall, pricing prices |
| `.label` | Martian 75 / 520 caps, 11 px, +.08em, `--fg-2` | Kickers, metadata, table heads |
| `.mono`, `.num` | Martian 75 / 420, 13 px, slashed zero | Tickers, timestamps, hashes, numeric columns |

Display type runs to at most three lines with `text-wrap: balance`, `word-spacing: var(--ws-condensed)` (.02em: measured with the real Mona Sans, DESIGN-V2's .06em read loose), and a minimum of 2.5rem on phones. `.serif` / `.prose--serif` (v1 names in page modules) now set Mona Sans.

**Metric-matched fallbacks.** If Google Fonts does not load, the layout holds (`tokens.css`): `'Mona Sans Fallback'` maps Arial-metric faces (Arial, Liberation Sans, Arimo, Helvetica) with one face per width band, picked by the element's `font-stretch` (≤87.4% the display band, ≤106% text, ≤118% ledes, above that the lintel), plus a bold face for text; display type tries `'Mona Sans Fallback N'` (Arial Narrow / Liberation Sans Narrow, width estimated) first. `'Martian Mono Fallback'` maps Courier-metric faces; `'Instrument Serif Fallback'` maps Georgia Italic (estimated from the Times ratio) and `'Instrument Serif Fallback T'` Times-metric italics (measured). `size-adjust` is the web font's width over the fallback's on sample copy (Mona 75 at 480: 70.6%, 100: 102.4%, 112: 104.6%, 125: 107.6%; Martian 75: 100%; Instrument Serif: 86.4% of Times italic); ascent/descent are the web fonts' own metrics (Mona 1.09/0.32, Martian 1.0/0.2, Instrument Serif 0.99/0.31) divided by `size-adjust`, so line breaks and line boxes match. Re-measure if a font or a stretch token changes (render sample copy in both faces and compare widths).

## 4. The grid and the rules (DESIGN-V2 §3.3)

Four fixed, full-height rules (`.rules > i`, in `index.html`) are painted once and never re-render. They are the axes of every page. Every full-width element uses the same template, so its lines coincide with the rules:

```
--cols: [full-start] M [r1] BAY [r2] BAY [r3] BAY [r4] M [full-end]
phone  (<640):   M = 16px, BAY = 1fr
tablet (640+):   M = 40px, BAY = 1fr
desktop(1024+):  BAY = min(25%, 460px), M = 1fr each (1440 → rules at 180/540/900/1260)
```

Bays: **bay 1** r1–r2, **bay 2** r2–r3, **bay 3** r3–r4, **bay 4** r4 → the edge (the families take one bay each; "Lower the bar" and the pricing launch note sit in bay 4).

- Put `.grid` on any full-width block. Children get `padding-inline: var(--inset)` (12/14/16 px); `.flush` removes it.
- Placement: `.c-head` r1→full-end (headlines), `.c-body` r1→r3 (text, 64ch), `.c-meta` / `.c-b3` r3→r4, `.c-wide` and **`.c-lintel`** r1→r4 (one line from r1 to r4), `.c-b1` `.c-b2` `.c-b12` `.c-b23`, `.c-b34` r3→edge, `.c-b4` / `.c-r4` r4→edge, `.c-margin` full-start→r1. Below 1024 the margin and bay-4 placements fall to r1→r4; below 640 everything but `.c-head`/`.c-wide`/`.c-margin` spans r1→r4. `.on-bays` lays four children one per bay (two halves below 1024).
- Nested alignment: `grid-template-columns: subgrid` on a child spanning `full-start / full-end`.
- **The rules are continuous and faint** (1 px, Graphite 11% on light). They pass behind running text: there are no text grounds any more. Opaque full-width surfaces (night sections, the footer) add `.ruled`, whose pseudo-elements redraw the rules in that surface's `--rule` (Mist 10% on night). `tests/e2e/checks.js ruleContrast` fails a rule above alpha .12 where it crosses a line of text.
- **Only display type masks the rules**: `.display` paints its surface's `--bg` clipped to its own box (`width: fit-content`, .12em padding), so a rule never cuts a headline. `.display--open` opts out (a headline over a canvas; the Assembly's headlines).
- **Rules never strike a digit** (`ruleStrike`): lay table columns out on the rules (`.table--on-rules`), or let the rules pass behind opaque cells (every other `.table` and `.dl` values are opaque). A container that paints its own colour redefines `--bg` (`.paper`, `.night`, the phone), so opaque cells and display grounds match it (`groundMismatch`).
- **The plumb line** (DESIGN-V2 §4.5, `pointer: fine`): within 24 px of a rule, shell.js adds `.is-lit` to that `.rules > i` and sets `--py` (pointer y) on it; the rule lights to alpha .5 over a 180 px window through a `mask-image` falloff. `.rules[data-surface='night']` lights it Mist. The label is `.rule-tip` (a Martian line, in 120 ms, out 200 ms). Keyboard and screen-reader users keep the four `.plinth` buttons at the rule bases.
- Charts put their axes on the rules (50% on rule 3; the pick's 21 trading days across r1→r4, 7 a bay; three pricing plinths on three bays).

## 5. Space, texture and rhythm

4 px base: `--s-1` 4 … `--s-10` 128. Sections pad `--section` (5–11 rem); one idea per viewport. Tap targets are at least 44 px on phones.

**Grain** (DESIGN-V2 §3.4): static luminance grain, 2.5% on light and 3.5% on night (`--grain`), never animated. Without the WebGL composite it is an inline `feTurbulence` tile on `body::before`; the Assembly's composite pass sets `html[data-grain='gl']` to hide it (`off` hides it too).

## 6. Motion (DESIGN-V2 §3.5, §4.2, §4.4, §4.7)

- Easings: `--e-out` (reveals), `--e-io` (wipes, camera, the sweep), `--e-ui` (controls), `--e-land` (the lintel), `--e-exit` (route out). Durations `--d-1` 150, `--d-2` 260, `--d-3` 420, `--d-4` 700 ms. (`--ease`, `--t-fast|mid|slow` are aliases.)
- Native scroll only; nothing hijacks it. Numbers never pass through false values; no looping UI animation; the hero's idle drift pauses after 12 s idle and off-screen.
- **Everything is readable at rest.** A reveal starts from a visible state or is scroll-driven by the element's own position.
- `.reveal`: body blocks fade up 12 px (scroll-driven, `entry 5% cover 25%`); `.draw`: a rule scales in from the left.
- **Masked lines**: `span.ml > span.ml__i` per display line (set `--i` for the stagger). `.is-in` plays in (`translateY(102%)` → 0, 700 ms, 60 ms stagger, `--e-out`), `.is-out` plays out (→ −102%, 450 ms, 25 ms stagger). Inside `[data-reveal='scroll']` the lines ride a view timeline instead.
- **Digits** (`digits(value, { sign })` in dom.js): `span.dg > span.visually-hidden(<whole value>) + span.dg__vis[aria-hidden] > span.dg__sign + span.dg__c > i` per character (`--r` = index from the right). `playDigits(el)` adds `.dg.is-in`: the sign fades in (150 ms) and each digit drops from blank (−100%) over 520 ms, 35 ms apart, right to left. The value is complete at rest; app.js plays the figures of the first screen on arrival.
- **The boot** (first visit per session via `sessionStorage`, never under reduced motion or with blocked storage, skipped by any key, click, wheel or touch, gone by 1.4 s; `?boot=0` turns it off for tooling): app.js sets `html.is-boot` and inserts `div.boot > div.boot__rules > i × 4` (its own four rules rise, 60 ms apart; the page's rules are never touched) and `div.boot__lines > p.boot__line × 4`, the real latest issue from issues.json (`06:00 data in · 1,353 stocks` … `14:00 published · issue #249 · no new pick`, the outcome worded by the quorum rules of §9), typed in 12 steps, 120 ms apart; the readout fades at 900 ms, the cover at 1,200 ms, and the headline masks in from 1,000 ms. The boot hides the wait for Mona Sans (`document.fonts.load`, 1,200 ms timeout).
- **Route changes: the lintel sweep.** `#view` is `view-transition-name: main`; the rules, the header (`chrome`), the plinths, the menu sheet and `#stage` never move. On `hashchange` a `div.sweep` (1 px on r1→r4, `view-transition-name: sweep`) draws itself along the header's bottom edge at once (the first visible change). When the page is rendered, the old main lifts 16 px and fades (180 ms, `--e-exit`), the line travels to the viewport bottom (420 ms, `--e-io`, WAAPI on `::view-transition-group(sweep)`), and the new main is revealed behind it by a px-exact `clip-path` on `::view-transition-new(main)` on the same curve. Without View Transitions the line still travels over an instant swap. A pick's badge or lintel carries `view-transition-name: pick-<no>` plus `.vt-pick` and morphs over 520 ms. Body text arriving after the sweep: `.reveal-in` inside `#view.vt-in`. Reduced motion: a 150 ms crossfade.
- `prefers-reduced-motion` (or `?motion=reduce`): animations and transitions are cut to 0.01 ms, the boot never shows, the hero is stepped SVG.

## 7. Components (class names are the contract)

**Shell.** `.demo-bar` (Night-2 strip, Martian 10 px at wdth 75: the whole disclaimer "Simulated market · fictional companies · demo — not a real service, not investment advice" at every width, one line from 1024 px, at most two on phones; view-as `.seg` (demo only, never in live mode), locale `.locale-btn`; a `<select>` on phones) · `.site-header` (64 px, sticky, hides on scroll down and shows on scroll up and on focus; `data-surface` follows the section under it; the inline nav only from 1280 px) · `.mark` (lintel glyph + wordmark in Mona 125) · `.nav > .nav__group` (three questions in three bays: `.nav__q`, `.nav__links`; hover scales an underline in from the left, `aria-current="page"` holds a 2 px one) · `.pill` (`data-state="countdown|quorum|none"`, `data-mode`) · `.menu-btn` (the icon is two lintels that cross to ±45°, 220 ms) + `.sheet` (night; opens with the sweep reversed, a 420 ms clip from the bottom; three questions in d2 across bays 1–3, 2.75rem on phones; links are 48 px rows that mask in 40 ms apart; `.sheet__foot` carries the other links and the locale; focus trapped; Escape closes) · `.site-footer` (night, `.ruled`: four link columns on the rules, brief §7 disclosure, data line) with **the footer lintel**: `.footer-mark > p.d-foot` ("QUORUM" in Mona 125 / 300 across r1→r4, sized in container units) + `div.foot-lintel[data-state='quorum'|'none']` (6 px of quorum light when the latest issue had a quorum, else a hairline) + `p.label` (e.g. "No quorum today").

**Actions.** `.btn` (Graphite fill; on hover the ground wipes in from the left through `clip-path`, 260 ms; the arrow moves 4 px; Mist on night) · `.btn--ghost` · `.arrow-link` (text + `→` in `.btn__arrow`; the underline scales in from the left, 220 ms) · `.link-u` (the same underline on any link) · `.seg` / `.seg--light` (segmented control with `aria-pressed`). Two copies of related data are labelled apart by what they hold: on #ledger "Copy the hash chain (CSV)" and "Copy the picks table (CSV)", each with a one-line description under it.

**Headings.** `sectionHead({ index, kicker, title, lede, id })` returns the section index in the margin, the kicker `.label` and a `.display.d2` headline hanging from rule 1. `masthead({ kicker, title, lede, meta, draft })` is the page-level version (`h1.d1`, meta in the strip, optional `.draft-banner`).

**Data atoms.**
- `hashChip(hex)` → `button.hash`: 8 characters, `#` prefix, click copies the full hash, announces "Full hash copied: 6b80fa3c…" and flashes "Copied".
- `timestamp([{ at, kind }])` → `span.ts` (focusable): shows `14:00 CEST`; hover or focus reveals `.ts__pop` with ISO-8601 with offset, UTC, and the kind (`produced`, `disseminated`, `sealed`, `published`).
- `signed(x)` → `span.signed.gain|loss|flat` with arrow and sign (`+3.4%`, `−2.0%`, true minus). Gain/Loss colour never appears without both.
- `quorumBadge(n)` / `.badge-quorum` (ultramarine, `3/4` or `4/4` only) · `.tag` (hairline mono tag: `fictional`, `anchored`, `pass`) · `.ticker`.
- `statStrip(summary, { counts })` → `dl.stats`: the headline statistics **in the brief §2.8 order**. `.stat__v` is Martian 300, capped at 2 rem: never the largest element on a page that also has a display headline, never animated. Pair it with `trackRecordLabel(locale)` wherever a record figure appears. (The ledger's record wall, §10, is the one place the figures are the headline.)
- `CONTACT` + `contactHtml(addr)` (ui.js): one set of addresses as selectable mono text with a Copy button. Never `mailto:`.

**Reading.** `.prose` lists use hairline dashes and mono counters · `.table` (hairline rules, a `--fg` head rule, `.num` columns right-aligned in mono, `th scope="row"` first column) via `table({ head, rows, numCols })` · `.table-scroll` (sideways scroll with a sticky first column) · `.dl` definition rows · `.faq details` · `.note-box` · `.draft-banner` · `.toc`.

**SMS.** `phone({ text, at, locale })` → the DOM phone (DESIGN-V2 §4.6): 300 px wide (78vw max), 44 px radius, a 10 px Night-2 bezel with a 1 px Mist-14% inner edge, a Paper screen with the real "14:00", and the ultramarine `.sms` bubble (links underlined) · `.sms-plain` (mono, quorum rule) for templates in prose.

**Launch and simulation notes.** `launchNote(info, locale)` (`p.launch-note`) wherever a paid tier is offered; the member pages use `launchBox` (`.m-launch`). `simulationNote(meta, locale)` (`section.sim-note#simulation`) near the top of #methodology and #backtest; the footer's demo line links to it ("About the simulation" → `#methodology~simulation`) when the note exists.

**States.** `.state` (error: data file named, Try again; a render error shows a generic sentence, never the exception) · `pages/not-found.js` ("Nothing stands here.") · `_pending.js` ("This room is still being built").

## 8. Chart conventions

1. Axes are the rules. Pick the domain so a meaningful value lands on a rule (50% on rule 3; day 7 and 14 on rules 2 and 3).
2. Ultramarine (Lift on night) marks only quorum marks: the lintel, 3/4 and 4/4 dots, quorum cells. Controls and non-quorum series are Graphite/Mist, hollow where they are "not a pick".
3. Every estimate shows its uncertainty (CI whiskers with end caps; the wall's `.wall__ci` bar), and small n is shown, not hidden.
4. SVG first: `viewBox` normalised to 0–1000 with `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke`; labels are HTML positioned in % over the plot. Canvas (2D or WebGL) where the mark count needs it (the Assembly, "Lower the bar", research strips), always with a text alternative.
5. Text alternative always: a caption (`.figcaption`) plus a visually hidden table or an `aria-label` summary. Interactive cells use a roving tabindex with arrow keys; a slider is `role="slider"` with arrows ±1, PageUp/PageDown ±10, Home/End.
6. Numbers in Martian, tabular, true minus. Dates `28.09.26`; times `14:00 CEST` with the ISO on focus.
7. No gradient fills, no glass, no drop shadows. The one light is the quorum lintel (DESIGN-V2 §4.3); low-alpha Mist fills are allowed for bands (the 91–100 slab).
8. **No label across a line.** A tick that falls on a rule is written beside it, never centred on it; end labels are stacked apart and kept clear of the zero line on an opaque ground.
9. One format per axis kind: months `MM.YY`, multipliers `1× 2× 5× 10×` on ticks, axis words uppercase like `.label` (`DAY 0`).
10. A number that rounds to `0.0%` is flat: no arrow colour (`i18n.js signClassAt`).
11. **Everything hypothetical is scaffold**: dashed 4/3 strokes (`.scaffold` on the figure or `.is-hypo` on a mark) over the hatch, in Graphite, never a solid curve and never ultramarine: a backtest's quorum rows are not quorum marks. Outside #backtest (the ledger's holdout view) they are labelled "Hypothetical backtest".

## 9. The page-module contract

```js
// web/js/pages/<module>.js   (module name from web/js/router.js ROUTES)
export async function render(ctx) {
  const data = await ctx.data('picks');        // cached fetch of web/data/picks.json; throws {file} on failure
  return {
    title: 'Pick #0055',                        // document.title becomes "<title> · Quorum"; announced on navigation
    node,                                       // a DOM node; the app swaps it into <main id="view">
    top: 'karst' | 'chamber',                   // surface at the top of the page (header colour); default karst
    afterMount() {},                            // optional: runs after the node is in the document (measure, start WebGL)
    cleanup() {},                               // optional: remove listeners, stop loops; runs before the next page
  };
}
```

`ctx`: `route` (`{ path, module, group, params, query, pathname, section }`), `params`, `query`, `locale` (`'en'|'sl'`), `t(key, vars)`, `tp(key, n, vars)`, `L(en, sl)` (inline copy), `fmt` (`formatters(locale)`: `int num pct pct0 rank bps eur date dm long signed`), `tier` (`'free'|'signal'|'research'`), `mode` (`'demo'|'live'`), `flags` (page query: `gl`, `now`, `motion`, `locale`, `tier`), `clock` (`now()`, `mode`, `pinnedInstant`), `now()`, `data(name)`, `launch()` (→ `launchInfo`: `ready`, `prelaunch`, `research`, `failed`, `lead`, `text`; unknown counts as pre-launch), `me` (live: the `/api/me` answer), `signal` (AbortSignal, aborted when the page is left), `navigate(hash)`, `announce(msg)`, `reload()` (live: asks `/api/me` again first and drops the cached data files if the tier changed), `href`, `reducedMotion`.

**Links.** Build every link with `href(name, param?, section?)`. A section of a page is `~id` after the token (`#backtest~launch`, `#ledger~scoreboard`, `#issue-2026-09-28~r421`); the app scrolls to it without re-rendering.

The app does the rest: scroll to top (or to `?s=<id>`), focus the page's `h1` (give it no tabindex; the app adds `-1`), announce the title, mark `aria-current`, run the View Transition, render errors (a thrown error with `.file` shows the data-error state). Exactly one `h1` per page.

**Copy.** Shared UI strings live in `i18n.js` (both locales, same keys; `tests/web/i18n.test.js` fails otherwise). Page copy lives in the module as `const COPY = { en: {...}, sl: {...} }`. Every Slovene string is a first draft: say so in a comment at the top of the module ("SL: first draft, needs native review").

**Tier (demo "view as").** `free` hides the ticker, name, thesis and reveal of *open* picks (show number, time, commit `hashChip`, `sealed`) and gates the Research explorer; `signal` and `research` see everything published at 14:00. The paid tiers never differ in timing; Free sees open picks sealed until they close. Read only fields defined in ARCHITECTURE.md §3. **Live mode** has no view-as: the tier comes from `/api/me` entitlements and is `free` until it answers, and a record the server redacted (`sealed: true`, no ticker) is sealed for every tier (`_records.js isSealedFor`).

**Launch and delivery copy.** Two things are called launch, and the copy keeps them apart. The **engine launch gate** (gate E of brief §8; never "Launch gate E", which reads like gate (e)) is what `backtest.json` reports: `launch.status` is `ready` when (a), (b), (c), (e), (d1) and (d2) pass, else `pre-launch`. **Launch itself** (paid SMS open, subscribers texted) also needs the brief's other gates: legal review, data licences and the SMS carrier's approval (and R for the Research tier). No data file records those, so `launchInfo` returns `launched: false` and `prelaunch: true` in every state: nothing says a text was sent, delivered or received (write "the text as written for 14:00", "a text was due", "once SMS alerts launch"), and the join checkout stays a labelled preview that charges nothing. Take launch sentences from `launchCopy(info, locale)`, never from an inline `launch.ready ?` branch (`tests/web/launch.test.js` checks both): per state it gives the label, lead, the backtest kicker and title, `others` (what the engine gate does not cover), the home calendar's last sentence, the join checkout flag and final lede, the #app reader box, the #status SMS note, the #methodology verdict and the pricing note. States: `waiting` ("Pre-launch. SMS alerts stay off."), `research` ("Back to research. SMS alerts do not launch."; paid SMS has no launch date), `ready` ("The engine gate passes. Launch waits on legal, data and SMS approvals."). The pooled deflated figures are comparison only: never a gate, never a pass date.

**Quorum words.** "No quorum today" only when no stock reached the rule (`closest` below the required agreement). A day on which stocks met the rule but none could be issued (already open, capped, cooling down, removed) is "No new pick today", and says which (`_records.js issueCounts`). The quorum colour marks only stocks that met the rule with no veto.

**Class prefixes (page blocks in `pages.css`).** Stage 1: `asm__` (the Assembly), `lv` (the shared hero hook), `home-`, `how-`, `sc-` (Silence Calendar), `hw-` (#how-it-works figures), `content-` (long-form). Stage 2, record pages: `rec-` (shared), `pk-` (pick), `lg-` (ledger), `cb-` (chain blocks), `is-` (issue; the same letters as the `.is-*` state modifiers, so issue blocks always carry a noun: `.is-cards`, `.is-funnel`), `st-` under `.stock` (stock), `dc-` (disclosures), `bt-` (backtest); charts `eq-` (equity), `path-`, `col-` (colonnade), `sb-` (scoreboard), `ic-`, `ds-` (deciles), `vh-` (variant histogram). Stage 3, member pages: `m-` (shared: forms, switches, consent boxes, phone thread, copy panels, confirmations, the launch line), `jn-` (join), `us-` (stop link), `st-` under `.st` (status; scope new status classes as `.st .st-*`), `app-` (app), `acc-` (account), `rx-` (research). A new page takes a new two- or three-letter prefix and a banner comment.

**Adding a page.** Replace the stub file for its route (or add a route to `ROUTES` and a file). Use `masthead` + `contentSections` for long-form pages, the §10 compositions (`layouts.css`) for composed pages, `.night.ruled` for data spectacles. Add page-specific CSS to `pages.css` under a banner comment. Run `node --test "tests/web/**/*.test.js"` and `node scripts/e2e.js`.

## 10. Page compositions (DESIGN-V2 §5; classes in `layouts.css`)

Every page composes the grid (§4) with these blocks. Each composition names its surface; sections alternate by content, never by decoration, and the sweep is the only border between night and karst.

**Home** (night → karst → night). The Assembly (§11) · §1 Silence: the calendar on r1→r4 under the headline, "Lower the bar" in bay 4 (`figure.ltb`, below) · §2 The day: a sticky clock in the margin (`div.day-clock.c-margin > time.fig-xl`) beside the timetable rows; the four families on `.on-bays` · §3 The chain (`section.night.ruled`) · §4 Scoreboard, the answer as `p.voice.verdict` · §5 Pricing (`.pl-row`), then the footer lintel.

**Ledger** (karst): the **record wall**.
```
section.wall.grid
  p.label.c-wide                         kicker
  h1.display.d1.wall__title              "The ledger."
  div.wall__figs                         one figure per bay, in the brief's order; phones: a 2 × 3 grid of half-bays
    div.wall__fig × 5                    87 · 51% · ↑ +0.7% · ↓ −20.3% · −15.9% (desktop: one row of five on r1→r4, an opaque slab the rules pass behind)
      span.label.wall__k                 what it is
      span.fig-xl.wall__v                the figure (signed() inside for excess)
      span.wall__vci > span.wall__ci     under the hit rate only, as wide as the figure: --lo, --hi, --pt as % of its width (the 95% CI)
      span.wall__s                       the note (n, window, "hypothetical paper portfolio" …)
    div.wall__aside                      the sixth cell: trackRecordLabel() and a line
```
Then the table on the rules (`.table--on-rules`); a pick row carries `span.row-lintel` (3 px quorum, the shared `pick-<no>` transition element). The chain sits on night. Phones: rows become 3-line cards.

**Pick `#p-NNNN`** (night, then paper).
```
section.stage-screen.night.ruled.grid    first screen (min 100svh minus chrome, content at the bottom)
  p.label.stage-screen__kicker
  h1.display.d-hero.stage-screen__title  the ticker (30vw on phones)
  div.stage-screen__strip                name (.t-lintel), .tag FICTIONAL, .badge-quorum BUY · 3/4
article.note-sheet.paper                 rises over the stage on scroll, 24 px top radius
  section.grid × n                       thesis + colonnade · drivers + sensitivity · the 21-day path · disclosures (always open)
```
When `hero.json` holds the pick, the stage is the Assembly frozen at the quorum (`createAssembly(ctx, hero, { freeze: 'quorum' })` inside `div.pk-scene`; its caption is demoted from h1, the ticker is the page's one h1); other picks get `div.pk-cols`: the four family percentiles as pillars on the rules with the lintel of quorum light over the ones that agreed. The strip's badge (`BUY · 3/4`) and the ledger row's `span.lg-lintel` carry `data-vt-pick=<no>`; app.js names the pair `pick-<no>` for one transition when both pages hold it, so it morphs. A sealed pick (Free, open) gets the same stage without the scene. The page's top is `chamber`.

**Backtest** (karst): stone versus scaffold. `div.scaffold-banner` (sticky under the header: HYPOTHETICAL) · the H1 "Hypothetical." in `.voice` · figures in `.scaffold` (`.scaffold-fig`: 16:9, 4:5 on phones) · wide tables in `.table-scroll`.

**Join** (karst): the **join colonnade**.
```
section.jc.grid
  ol.jc__steps                           r1→r3; the steps stand on rule 1
    li.jc__step.jn-step.jn-step--<id>[.is-done|.is-current|.is-todo|.is-skipped]
      span.jc__n  h2.jc__t  div.jc__b    a node on rule 1; a done step draws a short lintel (Graphite: not a quorum)
  aside.jc__preview.jn-preview           sticky, r3→edge, for the whole flow: the live SMS preview (phoneThread), p.jn-meter.jc__count (septets)
    button.jc__handle[aria-expanded]     phones and tablets: the preview is a bottom sheet with a 48 px handle; .is-open = 60svh
```

**Research** (night): `figure.strips-fig > div.strips` (`charts/strips.js`, full width) holds the universe canvas: every stock as a dot on each family's rule at its percentile, the top decile as a band, the rule as a dashed line (four equal lanes on phones). Research viewers see the latest universe and the virtualised table; everyone else sees the public hero issue (hero.json, dated as such), dots only, then the gate and glossary.

**Pricing** (karst): "One price for everyone." in d1, then the **plinths**.
```
div.pl-row                               a subgrid row
  article.pl × 3                         bays 1–3, equal, none highlighted, no ultramarine; a 6 px base under each
    p.label.pl__name  p.fig-xl.pl__price  p.pl__per  p.pl__lead  ul.pl__items  div.pl__cta
  p.pl-note                              its own row under the plinths, r1→r3 at a reading measure: launchNote()
```
Phones: stacked, under a 44 px monthly/annual `.seg`. (`.plinth` is the rule-label button; the pricing blocks are `.pl`.)

**"Lower the bar"** (`charts/lower-the-bar.js`; on home §1 and in #how-it-works §5 it spans r1→r4 so its four columns are centred on the rules; the canvas spills past r1 and r4 into side pads; the thumb rides outside r4 from 1024 px, between B and C below): `figure.ltb > p.label.ltb__kicker + div.ltb__plot (canvas.ltb__canvas, span.ltb__lintel, div.ltb__bar[role=slider] > span.ltb__line + span.ltb__thumb) + figcaption.ltb__cap (span.tag.ltb__tag, p.ltb__readout, .ltb__how)`. `.is-hypothetical` on the figure dashes the tag; only at the real rule is the pick ultramarine.

**Long-form** (how it works, methodology, help, legal, about): `masthead` then numbered `content-sec` sections (index in the margin, `h2` on rule 1, `.prose` r1→r3, notes in the strip). **Legal**: masthead with `.draft-banner`, placeholders in [brackets].

## 11. The Assembly (home hero)

DESIGN-V2 §4.1: `web/js/hero/assembly.js` builds `section.asm.lv.chamber` (520svh, a sticky 100svh `.asm__view`) with the scene on a canvas (`.asm__canvas`) over the inline SVG first paint; its block in `pages.css` is owned by the hero. The scene never runs through the words: the floor is measured to stay above every beat's headline (and the family labels under it), the quorum shot cranes in y only (no dolly in x or z; the silence tilt is 3° with depth compensation), so A and D stay within 4 px of rules 1 and 4 at every width; the step indicator's states come from the same `AT` table as the scene. A frozen scene (pick page) clears the host's kicker by 48 px (`clearOf`). States by native scroll progress `p`: universe, the vote, silence, the quorum (the lintel, the only ultramarine), the text (the lintel hands over to the SMS baseline, the phone rises, the bubble grows a line at a time), the result (the note, the 21-day path, the digit reveal, "Whatever happened."). Every state has a step button. Engines: SVG first paint (300-grain subsample) → WebGL2 (WebGL1 fallback) → 2D canvas on weak GPUs; `?gl=webgl|webgl1|canvas|0` forces one; reduced motion gets stepped SVG. Data: `hero.json` only. Before launch the captions say the text was published with the issue, not sent.

## 12. Demo clock and pill

If the real time is before the first issue slot after `meta.asOf` 22:30, the pill counts down live ("Next issue 14:00 · 15h 24m"); after that the clock is pinned to `asOf` 22:30 and the pill adds "demo clock". A page left open across that slot pins itself too: `now()` stops at the pinned instant and the route re-renders once (`app.onClockPinned`). A result state says "No quorum today" or "No new pick today" by the issue's counts. From 14:00 to 22:15 on an issue day it shows that issue's result ("No quorum today" or "Quorum: 1 pick" with an ultramarine dot) only if the data contains that issue. `?now=2026-09-28T13:59:00+02:00` overrides the clock for testing.

## 13. Accessibility

WCAG 2.2 AA. Skip link (moves focus to the page `h1`). 2 px focus ring, Graphite (Mist on Chamber), 2 px offset, `:focus-visible`. Every interactive element reachable by keyboard; composite widgets use a roving tabindex. aria-live announcements for route changes, copies, verification and tier or locale changes. Charts have text alternatives. `lang` follows the locale. Tap targets 44 px on phones. Text contrast is tested per token pair (unit test) and per rendered element (e2e).

## 14. Do and don't

**Do** say "would be texted", "a text was due" or "once SMS alerts launch" before launch, and compute every launch or gate sentence from `backtest.json` through `launchCopy` · say "engine launch gate" and name the other gates when it passes · let the faint rules pass behind running text, keep tables and digits off them, and redefine `--bg` on any container with its own colour · align every edge to a rule or the inset line · use one idea per viewport and real data as the spectacle · set the voice face once per page at most · set every figure in Martian Mono · show the worst pick and every interval · keep headline stats small and in order · write "Not personal advice" where a pick appears · label every person and company in data as fictional · give every chart a caption and a text alternative · test at 1440×900, 1920×1080, 834×1194, 390×844 and 360×780.

**Don't** use ultramarine for anything but a quorum · add colours, gradient fills, glows (the quorum lintel is the one light), glass, shadows, purple · use stock imagery or bulls, coins, robots, sparkles · animate numbers or loop animations · hijack scroll or smooth-scroll the page · centre body text or exceed 64ch · write `style=""` in templates or add external JS · show a real company name or a well-known real ticker · present a backtest outside the Backtest page · promise returns, urgency or scarcity · let a rule strike a digit or a headline, or darken a rule above alpha .12 behind text · paint text grounds · say "launched", "SMS is open" or that a text was sent while there are no subscribers, whatever `launch.status` says · give two copy buttons the same label.

## 15. Tests

- `node --test "tests/web/**/*.test.js"` — i18n parity and plurals, router, clock and pill states, hero data helpers, calendar layout, fixture contract and non-overwrite rule, page-module contract, design-system guards (the v2 palette, the faint rules, type and motion tokens, the fallback bands, no stray hex, gradients only in masks, retired fonts gone, ultramarine allowlist, font URL, no inline script, contrast of every §2 text pair on each surface, CSS ≤ 45 KB gzipped), and the `web/js/core` copy.
- `node --test tests/web/launch.test.js` — the launch states with a pre-launch (back in research), a waiting and a ready fixture: labels, leads, every `launchCopy` sentence in both locales, no delivery claim in any state, the old gate name gone, the pages reading their launch copy from `launch.js`, and `simulationText`.
- `node scripts/e2e.js` — Playwright: every route at the five sizes (390×844, 834×1194, 1440×900, 1920×1080, 360×780); fails on console errors, horizontal overflow, missing names, duplicate ids, one-h1, text contrast below AA, a rule striking a number (`ruleStrike`), a rule above alpha .12 where it crosses a line of text (`ruleContrast`), a ground (a display mask, an opaque cell) that differs from the surface under it or a grounded page-grid row (`groundMismatch`), and copy that breaks a contract (`copyChecks`: the demo bar's advice line at every width, no delivery claim in any launch state, no "Launch gate E", no implied launch date, no stray "null"); then a launch-state tour (home, #backtest, #methodology, #pricing, #join, #app, #status at 1440 and 390 with `backtest.json` patched to `ready` and to back-in-research and `meta.notes.simulation` present: the state's own copy, no "launched", the simulation note near the top, the footer link); plus the keyboard path, the three hero engines, reduced motion, and a live-mode tour through the Node server as an anonymous visitor (`tests/e2e/live.js`: no crash, no open ticker, no view-as; `--no-live` skips it). `node tests/e2e/member-run.js` covers the member pages' interactive states. `--sizes` picks sizes; `--base URL` tests a running server. Behind an intercepting proxy set `E2E_SPKI` to the proxy CA's SPKI hash so Google Fonts load; without them the metric-matched fallbacks (§3) keep every check meaningful.
