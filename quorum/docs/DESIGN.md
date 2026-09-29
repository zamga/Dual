# Quorum design system: Colonnade, as built

This is the system the web lead built in `web/`. Follow it exactly and new pages will be indistinguishable from the existing ones. The spec it implements is `docs/BRIEF.md` §5; the structure is `docs/ARCHITECTURE.md` §5. Where this file and the code disagree, the code is right and this file is a bug.

**The idea in one line:** four model families are four columns (the fixed hairline rules on every page). A pick is a lintel resting on at least three of them. Ultramarine means the models agreed. The only imagery is data and type.

---

## 1. Files

| File | What it holds |
|---|---|
| `web/index.html` | The shell: fonts, CSS, skip link, **the four rules** (`.rules`), demo bar, header, `<main id="view">`, footer, menu sheet, plinths, rule tip, two aria-live regions. No inline script or style (the server CSP forbids them). |
| `web/css/tokens.css` | Palette, semantic tokens per surface, type, space, motion. **The only file allowed to contain hex colours.** |
| `web/css/base.css` | Reset, type classes, the grid and the rules, focus ring, reduced motion, scroll-driven reveals, View Transitions. |
| `web/css/components.css` | Shell and shared components (§7). |
| `web/css/pages.css` | Page layouts: The Level, home sections, long-form pages, pricing, about, legal, 404. Add your page's block here with a banner comment. |
| `web/js/app.js` | Boot, hash router, View Transitions, data loader + cache, demo clock, locale, view-as tier (demo) or the viewer's tier from `GET /api/me` (live), `ctx.launch()`. |
| `web/js/router.js` | Route table (pure). **Add routes here.** Links are built with `href(name, param?, section?)`: `href('ledger', null, 'scoreboard')` → `#ledger~scoreboard` (a section is `~id` after the flat token, never `?key=value`). |
| `web/js/launch.js` | `launchInfo(backtest)` (pure): the launch status under amendment A-1, gates (a)(b)(c)(e) + (d1) + (d2); `research` when a gate that cannot recover failed. Every page asks `ctx.launch()` before it says a text was sent. |
| `web/js/shell.js` | Demo bar, header, pill, menu sheet, footer, rule labels, header surface detection. |
| `web/js/clock.js` | Demo clock and pill state (pure, tested). |
| `web/js/i18n.js` | Shared EN/SL strings, `t()`, `tp()` (plurals), `pickL()`, `formatters()`. |
| `web/js/dom.js` | `h()`, `svg()`, `html```, `raw()`, `announce()`, `focusEl()`, `copyText()`, `setNumber()`, `store()`, `prefersReducedMotion()`, `onVisible()`. |
| `web/js/ui.js` | Components with behaviour: `hashChip`, `timestamp`, `signed`, `quorumBadge`, `sectionHead`, `statStrip`, `trackRecordLabel`, `phone`, `familyName`, `familyDef`. |
| `web/js/pages/_content.js` | Long-form template: `masthead`, `contentSections`, `toc`, `table`, `page`, `toNode`. |
| `web/js/hero/level.js`, `level-data.js` | The Level (home hero) and its pure helpers. |
| `web/js/charts/silence-calendar.js` | The Silence Calendar. Put new charts in `web/js/charts/` (`quorum-example.js` is the small real quorum used on home and #how-it-works). |
| `web/js/pages/*.js` | One module per route. Stubs (`export { render } from './_pending.js'`) mark routes still to build: replace the file. |

## 2. Palette and surfaces

Exact brief §5 values. Never add a colour; derive only as listed.

| Token | Hex | Use |
|---|---|---|
| `--karst` | `#E3E6E4` | Page background |
| `--paper` | `#F4F5F3` | Note sheets, the pick note, SMS phone screen |
| `--graphite` | `#111418` | Text, primary buttons, focus ring, demo bar |
| `--slate` | `#545C63` | Secondary text (5.4:1 on Karst) |
| `--hairline` | `#AEB6B9` | Rules and table rules. **Never text.** |
| `--chamber` | `#0D1014` | Dark data surfaces: hero, ledger chain, research |
| `--mist` | `#C9CFD2` | Text on Chamber |
| `--ultramarine` | `#1F2EE0` | **Only a quorum**: lintel, pick badge, SMS bubble, quorum cells and dots, favicon |
| `--lift` | `#8C96FF` | The same role on Chamber |
| `--gain` / `--loss` | `#0B6E4F` / `#B3261E` | P&L on light surfaces, always with sign and arrow |
| `--gain-dark` / `--loss-dark` | `#4FD1A1` / `#FF8A7A` | P&L on Chamber |

Derived (same hues): `--mist-2` `#9AA3A8` (secondary text on Chamber, 7.4:1), `--rule-dark` (Mist 17%: rules on Chamber), `--rule-dark-strong` (Mist 32%), `--hairline-soft` (inner table rules).

**Semantic tokens** switch per surface; components use only these: `--bg --surface --fg --fg-2 --rule --rule-inner --quorum --on-quorum --gain-c --loss-c --focus`.

- Default (Karst). `.chamber` or `[data-surface='chamber']` flips to Chamber (`--quorum` becomes Lift, Gain/Loss become the dark variants, focus becomes Mist). `.paper` returns to light inside a Chamber section.
- `prefers-contrast: more` darkens Hairline and Slate and raises the Chamber rule alpha.

**Rule: if ultramarine is on screen, the models agreed.** Buttons, links, focus, hover, decoration: never ultramarine. `tests/web/design-system.test.js` fails a CSS rule that uses `--ultramarine`, `--lift` or `--quorum` unless its selector names a quorum element (allowlist in the test; extend it only for a real quorum element).

## 3. Type

Fonts (exact URL in `index.html`, with preconnect): **Archivo** (wdth 62–125), **Newsreader** (opsz), **Martian Mono** (wdth 75–112.5). `font-variant-numeric: tabular-nums` is global. The first route render waits up to 700 ms for Archivo and Martian Mono so headlines never reflow.

| Class | Face and setting | Use |
|---|---|---|
| `.display` + `.d-hero` | Archivo 62%, 600, `--fs-hero` (to 11rem), leading 0.88 | The home headline only |
| `.display.d1` | Archivo 64%, 580, `--fs-d1` (to 8.5rem) | Page titles (`masthead`) |
| `.display.d2` | same, `--fs-d2` (to 6rem) | Section headlines (`sectionHead`) |
| `.display.d3` / `.d4` | `--fs-d3` / `--fs-d4` (78%) | Sub-heads, content-section h2, step titles |
| `.lede` (+ `.serif`) | Archivo 100, `--fs-lede`, max 44ch | Standfirst under a headline |
| `.prose` (+ `.prose--serif`) | body, max **68ch** | Long text; Newsreader for theses and notes |
| `.serif` | Newsreader, optical sizing | Theses, pull quotes (`.honest-quote`), the hero's last caption |
| `.label` | Martian Mono 87.5%, 11px, uppercase, tracked 0.09em, `--fg-2` | Kickers, metadata, table heads |
| `.mono`, `.num` | Martian Mono 87.5%, 13px, slashed zero | Tickers (`.ticker`), ISO timestamps, hashes, numeric columns |

Headlines hang from rule 1: `.display` has a −0.04em optical margin so stems, not side bearings, sit on the inset line. Headlines may run past rule 4 into the right margin; body text never does.

## 4. The grid and the rules

Four fixed, full-height hairlines (`.rules > i`, in `index.html`) are painted once and never re-render. They are the axes of every page. Every full-width element uses the same template, so its lines coincide with the rules:

```
--cols: [full-start] M [r1] BAY [r2] BAY [r3] BAY [r4] M [full-end]
phone  (<640):   M = 16px, BAY = 1fr         (rules on a 4-column grid with 16 px gutters)
tablet (640+):   M = 40px, BAY = 1fr
desktop(1024+):  BAY = min(25%, 460px), M = 1fr each (1440 → rules at 180/540/900/1260)
```

- Put `.grid` on any full-width block (sections, rows). Children get `padding-inline: var(--inset)` (12/14/16 px) so text never touches a rule; `.flush` removes it (plots, canvases, subgrids).
- Placement: `.c-head` r1→full-end (headlines), `.c-body` r1→r3 (text, 68ch), `.c-meta` r3→r4 (metadata strip), `.c-wide` r1→r4 (charts, tables), `.c-b1/.c-b2/.c-b3` single bays, `.c-b23`, `.c-r4` r4→full-end, `.c-margin` full-start→r1 (section index, clock times; falls to r1→r4 below 1024). Below 640 everything but `.c-head`/`.c-wide`/`.c-margin` spans r1→r4.
- Nested alignment: `display: grid; grid-template-columns: subgrid` on a child spanning `full-start / full-end` keeps the line names (used by the nav, footer, scoreboard, families row, hero axes).
- Opaque full-width surfaces (Chamber sections, the hero stage, the footer) add `.ruled`: two pseudo-elements redraw the rules in `--rule` (Mist at 17% on Chamber), so the colonnade continues through dark sections.
- Charts put their axes on the rules. Examples: the hero's four percentile axes; the scoreboard's 10–90% hit-rate axis across r2→r4 so **50% is rule 3**; the pick note's 21 trading days across r1→r4 (7 days a bay); three pricing tiers on three bays; four responsible persons on four rules.
- **Rule labels.** Hovering within 5 px of a rule for 220 ms lights it and shows a tip (`.rule-tip`): "Column A · Trend · definition" from `meta.families`. Keyboard and screen readers get the four `.plinth` buttons (A–D) fixed at the rule bases, hidden over the hero (whose axes carry the labels) and below 1024 px. The plinths never sit on content: they are transparent and let clicks through until the pointer comes within 48 px of the viewport's bottom (`.is-near`), a rule is lit, or a keyboard user tabs to one (`:focus-within`).
- **Rules pass behind data, never through it.** A column rule must not strike a digit (`tests/e2e/checks.js ruleStrike`). Either lay the columns out on the rules (the ledger's record table, marked `.table--on-rules`), or let the rules pass behind: every other `.table` has opaque cells (`--bg`) and `.dl` terms and values are opaque, so the colonnade stops at the data and resumes after it. Stat strips (`dl.stats`) stand on the colonnade: one stat per bay from 640 px, one per half-bay from 1280 px, text inset from the rule, and each `.stat` is a row subgrid so values share one baseline. On phones (<640) prose, ledes and theses are opaque inside the inset (`background-clip: content-box`), so rules 2 and 3 stop at each paragraph and rules 1 and 4 stay.
- **Below 1024 px** a 2 × 2 of four things (the home families, the pick drivers below 1280) uses two equal halves between rule 1 and rule 4, never two bays beside one.

## 5. Space and rhythm

4 px base: `--s-1` 4 … `--s-10` 128. Sections: `.section` pads `--section` (5–11 rem) and separates with a Hairline; one idea per viewport. Mastheads pad 4–8 rem. Tables pad 11 px vertically. Tap targets are at least 44 px on phones (pill, menu, selects, footer links, FAQ summaries).

## 6. Motion

- Easing `--ease: cubic-bezier(0.2, 0, 0, 1)`; durations `--t-fast` 150, `--t-mid` 250, `--t-slow` 400 ms.
- Native scroll only. The hero reads scroll progress; nothing hijacks it. The hero's step buttons scroll natively to a state.
- Section reveals: add `.reveal` (fade + 28 px rise) or `.draw` (scaleX from the left) to any element; CSS scroll-driven animations (`animation-timeline: view()`) inside `@supports`, so no support means no animation.
- Route changes: View Transitions on the root (viewport-sized snapshot, cheap); the rules, plinths and header are their own groups and never move. Content leaves up 10 px (160 ms) and arrives from 14 px (300 ms).
- **Numbers never count up.** Change a number with `setNumber(el, text)`: a 150 ms cross-fade.
- No looping animation after the hero settles. Nothing blinks, pulses or spins.
- `prefers-reduced-motion` (or `?motion=reduce`): all transitions and animations are cut to 0.01 ms; the hero uses its stepped static states and the SVG field.

## 7. Components (class names are the contract)

**Shell.** `.demo-bar` (Graphite strip: the whole disclaimer "Simulated market · fictional companies · demo — not a real service, not investment advice" at every width, wrapping on narrow screens; view-as `.seg` (demo only, never in live mode), locale `.locale-btn`; a `<select>` on phones) · `.site-header` (sticky, hides on scroll down, shows on scroll up and on focus; `data-surface` follows the section under it) · `.mark` (lintel glyph + wordmark) · `.nav > .nav__group` (three questions in three bays: `.nav__q` label, `.nav__links`; `aria-current="page"` gets a 2 px underline) · `.pill` (issue pill: `data-state="countdown|quorum|none"`, `data-mode="live|pinned|override"`; two lines between 1200 and 1599 px) · `.menu-btn` + `.sheet` (full-height Chamber menu by the three questions; focus trapped; Escape closes) · `.site-footer` (four link columns on the rules, brief §7 disclosure, data line, wordmark).

**Actions.** `.btn` (Graphite fill; hover inverts; Mist on Chamber) · `.btn--ghost` · `.arrow-link` (text + `→` in `.btn__arrow`, underline rule) · `.seg` / `.seg--light` (segmented control with `aria-pressed`).

**Headings.** `sectionHead({ index, kicker, title, lede, id })` returns the section index in the margin, the kicker `.label` and a `.display.d2` headline hanging from rule 1. `masthead({ kicker, title, lede, meta, draft })` is the page-level version (`h1.d1`, meta in the strip, optional `.draft-banner`).

**Data atoms.**
- `hashChip(hex)` → `button.hash`: 8 characters, `#` prefix, click copies the full hash, announces "Full hash copied: 6b80fa3c…" and flashes "Copied".
- `timestamp([{ at, kind }])` → `span.ts` (focusable): shows `14:00 CEST`; hover or focus reveals `.ts__pop` with ISO-8601 with offset, UTC, and the kind: `produced` (production completed), `disseminated` (first disseminated), `sealed`, `published`. Pass both rows on a pick page.
- `signed(x)` → `span.signed.gain|loss|flat` with arrow and sign (`+3.4%`, `−2.0%`, true minus). Gain/Loss colour never appears without both.
- `quorumBadge(n)` / `.badge-quorum` (ultramarine, `3/4` or `4/4` only) · `.tag` (hairline mono tag: `fictional`, `anchored`, `pass`) · `.ticker`.
- `statStrip(summary, { counts })` → `dl.stats`: the headline statistics **in the brief §2.8 order** (recommendations + live since, split into new picks and renewals; hit rate with CI, median excess, mean excess, worst pick, max drawdown, median alert gap). `.stat__v` is capped at 2 rem: never the largest element, never animated. Pair it with `trackRecordLabel(locale)` wherever a record figure appears (ledger, home, pricing).
- `CONTACT` + `contactHtml(addr)` (ui.js): one set of addresses; an address is selectable mono text with a Copy button (`button[data-copy]`, one delegated handler in app.js). In copy strings write `{{contact:support}}`; `_content.js toNode` fills it. Never `mailto:`.

**Reading.** `.prose` lists use hairline dashes and mono counters · `.table` (hairline rules, Graphite head and foot rule, `.num` columns right-aligned in mono, `th scope="row"` first column) via `table({ head, rows, numCols })` · `.dl` definition rows · `.faq details` · `.note-box` · `.draft-banner` ("Draft for counsel review") · `.toc` (numbered, scrolls without re-rendering, updates `?s=` with `replaceState`).

**SMS.** `phone({ text, at, locale })` → a hairline device with a Paper screen and the ultramarine `.sms` bubble (links underlined) · `.sms-plain` (mono, ultramarine rule) for templates in prose.

**States.** `.state` (error: data file named, Try again; a render error shows a generic sentence, never the exception) · `pages/not-found.js` (four hollow columns under a dashed lintel: "Nothing stands here.") · `_pending.js` (same room, "This room is still being built").

## 8. Chart conventions

1. Axes are the rules. Pick the domain so a meaningful value lands on a rule (50% on rule 3; day 7 and 14 on rules 2 and 3).
2. Ultramarine (Lift on Chamber) marks only quorum marks: the lintel, 3/4 and 4/4 dots, quorum cells. Controls and non-quorum series are Graphite/Mist, hollow where they are "not a pick" (the 2/4 shadow dot, the non-agreeing column).
3. Every estimate shows its uncertainty (CI whiskers with end caps), and small n is shown, not hidden.
4. SVG first: `viewBox` normalised to 0–1000 with `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke`; labels are HTML positioned in % over the plot so text never stretches.
5. Text alternative always: a caption (`.figcaption`) plus a visually hidden table or an `aria-label` summary. Interactive cells use a roving tabindex with arrow keys (see the Silence Calendar).
6. Numbers in mono, tabular, true minus. Dates `28.09.26`; times `14:00 CEST` with the ISO on focus.
7. No gradients, no glow, no 3D, no shadows except the hairline. Low-alpha Mist fills are allowed for bands (the top-decile band).
8. **No label across a line.** A tick that falls on a rule is written beside it (`.sb__tick.is-start|is-mid|is-end`), never centred on it; ticks inside a plot (below 1024 px) sit above their line on an opaque `--bg` ground; end labels are stacked apart and kept clear of the zero line (`path.js endLabelYs`) on an opaque ground; a band label never sits under the lintel (below 1024 px it goes under it, centred in bay 1). Phones show fewer ticks (`.is-minor` hidden) and put notes like "coin flip" on their own line.
9. One format per axis kind: months `MM.YY` (like dates `28.09.26`), multipliers `1× 2× 5× 10×` on ticks (`2.34×` in readouts), axis words uppercase like `.label` (`DAY 0`).
10. A number that rounds to `0.0%` is flat: no arrow colour (`i18n.js signClassAt`, used by `fmt.signed`).
11. Hypothetical figures shown outside #backtest (the ledger's holdout view) are labelled "Hypothetical backtest", hatched (`hatchLayer`) and drawn in Graphite: a backtest's quorum rows are not quorum marks.

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

**Launch and delivery copy.** Before launch (`ctx.launch().prelaunch`) nothing says a text was sent, delivered or received: write "the text as written for 14:00", "a text was due", "once SMS alerts launch". When a gate that cannot recover failed (`research`), the launch line says the engine is back in research and paid SMS has no launch date (`launchBox`). The pooled deflated figures are comparison only: never a gate, never a pass date.

**Quorum words.** "No quorum today" only when no stock reached the rule (`closest` below the required agreement). A day on which stocks met the rule but none could be issued (already open, capped, cooling down, removed) is "No new pick today", and says which (`_records.js issueCounts`). The quorum colour marks only stocks that met the rule with no veto.

**Class prefixes (page blocks in `pages.css`).** Stage 1: `lv-` (the Level, written `lv__`), `home-`, `how-`, `sc-` (Silence Calendar), `hw-` (#how-it-works figures), `content-` (long-form). Stage 2, record pages: `rec-` (shared), `pk-` (pick), `lg-` (ledger), `cb-` (chain blocks), `is-` (issue; the same letters as the `.is-*` state modifiers, so issue blocks always carry a noun: `.is-cards`, `.is-funnel`), `st-` under `.stock` (stock), `dc-` (disclosures), `bt-` (backtest); charts `eq-` (equity), `path-`, `col-` (colonnade), `sb-` (scoreboard), `ic-`, `ds-` (deciles), `vh-` (variant histogram). Stage 3, member pages: `m-` (shared: forms, switches, consent boxes, phone thread, copy panels, confirmations, the launch line), `jn-` (join), `us-` (stop link), `st-` under `.st` (status; scope new status classes as `.st .st-*`), `app-` (app), `acc-` (account), `rx-` (research). A new page takes a new two- or three-letter prefix and a banner comment.

**Adding a page.** Replace the stub file for its route (or add a route to `ROUTES` and a file). Use `masthead` + `contentSections` for long-form pages, `sectionHead` + `.section.grid` for composed pages, `.chamber.ruled` for data spectacles. Add layout CSS to `pages.css` under a banner comment. Run `node --test "tests/web/**/*.test.js"` and `node scripts/e2e.js`.

## 10. Page templates

- **Home** (`#/`): The Level (Chamber, 400svh sticky stage, pulls up under the demo bar and header), 01 Silence Calendar, 02 How a pick happens (a timetable on rule 1; the families on all four rules; a real colonnade example), 03 Sealed ledger (Chamber: chain, Verify in your browser, headline statistics), 04 Scoreboard teaser (with the computed answer: holdout gate (b) and the sealed record), 05 Pricing teaser, footer.
- **#how-it-works** uses the long-form template with figures (`contentSections` `figure`: a `.content-fig` subgrid under the text): the real quorum in §02, the sealed record's veto funnel in §03, the cadence as a timetable on rule 1 in §04.
- **Long-form** (how it works, methodology, help, legal, about, pricing): `masthead` (kicker, `h1.d1`, lede in r1→r3, table of contents or controls in the meta strip), then numbered `content-sec` sections: index in the margin, `h2` on rule 1, `.prose` r1→r3, notes in the strip. Wide tables may take r1→r4 (the methodology model table does).
- **Legal**: masthead with `.draft-banner` ("Draft for counsel review"), the other legal documents in the strip, placeholders in [brackets].

## 11. The Level (home hero)

States by scroll progress `p` of the tall section (native scroll): **0 load** (900 ms: lines settle from noise, columns rise, the pick's polyline locks into the lintel at the 90th percentile; only after the engine is ready) → **1** `p .07–.30` every other line falls (gravity in the vertex shader, staggered by a per-line seed) → **2** `p .36–.62` the lintel travels into the phone and becomes the baseline of the real SMS; the bubble grows from it → **3** `p .68–.95` the phone screen scales into the pick note; the lintel extends 21 trading days as the excess path, Gain or Loss with sign and arrow. Caption: "Our latest closed pick. Whatever happened."

Every in-between frame reads: the phone rises fully opaque behind a mask (never a half-transparent device), the SMS bubble grows one whole line at a time, the note's blocks appear whole one after another (never an ultramarine badge at partial opacity), and the path starts drawing as soon as the note is in place. On phones the note starts under the moved caption and keeps its "Not personal advice" line; below 1200 px the in-plot result label sits on the side of the end point away from the lintel (phones print it only in the result row).

Engines: first paint is an inline SVG (300-line deterministic subsample, `level-data.subsample`); after two frames and idle time, raw WebGL1 (every line as anti-aliased quads, additive blending, DPR ≤ 2) on capable GPUs, a 2D canvas with the same 300 lines on software renderers, low core counts or without WebGL, and SVG only for `?gl=0` and reduced motion. Force with `?gl=webgl|canvas|0`. Rendering stops off-screen (IntersectionObserver) and when nothing changes; style writes are cached. On phones the headline yields to the caption from state 1 so the phone and note get the stage. Data: `hero.json` only (it carries the SMS in both languages, `sms` and `smsSl`, and `pick.kind`/`priorNo`: a RENEW hero is labelled "RENEW of #NNNN"). Before launch the captions say the text was published with the issue, not sent.

## 12. Demo clock and pill

If the real time is before the first issue slot after `meta.asOf` 22:30, the pill counts down live ("Next issue 14:00 · 15h 24m"); after that the clock is pinned to `asOf` 22:30 and the pill adds "demo clock". A page left open across that slot pins itself too: `now()` stops at the pinned instant and the route re-renders once (`app.onClockPinned`). A result state says "No quorum today" or "No new pick today" by the issue's counts. From 14:00 to 22:15 on an issue day it shows that issue's result ("No quorum today" or "Quorum: 1 pick" with an ultramarine dot) only if the data contains that issue. `?now=2026-09-28T13:59:00+02:00` overrides the clock for testing.

## 13. Accessibility

WCAG 2.2 AA. Skip link (moves focus to the page `h1`). 2 px focus ring, Graphite (Mist on Chamber), 2 px offset, `:focus-visible`. Every interactive element reachable by keyboard; composite widgets use a roving tabindex. aria-live announcements for route changes, copies, verification and tier or locale changes. Charts have text alternatives. `lang` follows the locale. Tap targets 44 px on phones. Text contrast is tested per token pair (unit test) and per rendered element (e2e).

## 14. Do and don't

**Do** say "would be texted", "a text was due" or "once SMS alerts launch" before launch, and compute every launch or gate sentence from `backtest.json` · align every edge to a rule or the inset line · use one idea per viewport and real data as the spectacle · show the worst pick and every interval · keep headline stats small and in order · write "Not personal advice" where a pick appears · label every person and company in data as fictional · give every chart a caption and a text alternative · test at 1440×900, 1920×1080, 834×1194, 390×844 and 360×780.

**Don't** use ultramarine for anything but a quorum · add colours, gradients, glows, glass, shadows, purple · use stock imagery or bulls, coins, robots, sparkles · animate numbers or loop animations · hijack scroll or smooth-scroll the page · centre body text or exceed 68ch · write `style=""` in templates or add external JS · show a real company name or a well-known real ticker · present a backtest outside the Backtest page · promise returns, urgency or scarcity.

## 15. Tests

- `node --test "tests/web/**/*.test.js"` — i18n parity and plurals, router, clock and pill states, hero data helpers, calendar layout, fixture contract and non-overwrite rule, page-module contract, design-system guards (palette, no stray hex, no gradients, ultramarine allowlist, font URL, no inline script, contrast of token pairs), and the `web/js/core` copy.
- `node scripts/e2e.js` — Playwright: every route at 390×844, 834×1194 and 1440×900; fails on console errors, horizontal overflow, missing names, duplicate ids, one-h1, text contrast below AA, a rule striking a number (`ruleStrike`), and copy that breaks a contract (`copyChecks`: the demo bar's advice line at every width, no delivery claim before launch, no implied launch date, no stray "null"); plus the keyboard path, the three hero engines, reduced motion, and a live-mode tour through the Node server as an anonymous visitor (`tests/e2e/live.js`: no crash, no open ticker, no view-as; `--no-live` skips it). `node tests/e2e/member-run.js` covers the member pages' interactive states. `--sizes 360x780,1920x1080` adds sizes; `--base URL` tests a running server. Behind an intercepting proxy set `E2E_SPKI` to the proxy CA's SPKI hash so Google Fonts load.
