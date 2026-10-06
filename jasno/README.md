# Jasno: four landing-page directions

A standalone design project: four complete, working landing pages for **Jasno**, a new Slovenian
credit-intelligence brand built to compete with EBONITETE.SI (Prva bonitetna agencija d.o.o.).
Each direction is a real static site (HTML/CSS/JS, no build step). Screenshots are produced with Playwright.

> All companies, people, quotes and figures on the pages are fictional placeholders. "Jasno" is a working name;
> it still needs a trademark and domain check.

## The brief in one paragraph

EBONITETE.SI rates companies 1–10, mostly from annual accounts that can be up to 18 months old. It is sold through
sales calls and wrapped in a generic corporate look. Jasno's promise is simpler and sharper: **every morning at 6.00 it
tells you whether a company will pay you.** It covers every Slovenian company, explains the answer in plain Slovenian,
and recommends a credit limit and a payment term. The core insight behind all four directions:
**"Vsak račun je posojilo."** Every invoice with payment terms is a loan, so for those 60 days you are a bank,
without a bank's data.

## Four directions

| # | Direction | Idea | Signature moment | Look |
|---|---|---|---|---|
| 01 | **Napoved** (The Forecast) | *Tveganje je vreme.* Credit risk is weather, so Jasno publishes a 12-month payment forecast for every company. The name is the idea: *jasno* is the forecast word for a clear sky. | A WebGL isobar map of Slovenia; the cursor is a low-pressure system that bends the isobars. Alerts follow the Meteoalarm green/yellow/orange/red levels, each with an action. | Dawn sky, synoptic cartography, Mona Sans + IBM Plex Mono |
| 02 | **Rentgen** (The X-ray) | *Kar podjetje pove. Kar podjetje je.* Every company has a facade and a skeleton. | An X-ray lens over glossy serif marketing claims reveals the data beneath. Scrolling expands the lens into a radiograph world, and the report is a radiology *izvid*. | Cream facade → film black; Instrument Serif vs Geist Mono |
| 03 | **Mera** (The Measure) | *Zaupanje, izmerjeno.* Trust finally gets a unit, presented like a standard. | Monumental condensed numerals on an odometer, precision rulers with a vermilion marker, and the "365 : 1" spread. | A typeset financial journal: Noto Serif Display + Schibsted Grotesk |
| 04 | **Signal** (The Departure Board) | *Tveganje se ne najavi. Mi ga.* The economy as a live departures board. | A split-flap board of this morning's company events. Pricing appears as train tickets, and a countdown runs to the next 6.00 update. | Black, signal yellow, Big Shoulders Display + JetBrains Mono |

Briefs: [`BRIEF.md`](BRIEF.md) (shared: brand, product facts, copy rules, engineering, award gate) and `0X-*/BRIEF.md`
(per-direction storyboard, palette, type and motion spec).

## Layout

```
jasno/
  BRIEF.md                 shared creative + engineering brief
  01-napoved/ 02-rentgen/ 03-mera/ 04-signal/
      BRIEF.md             direction storyboard
      index.html styles.css main.js
  shared/
      fonts/               self-hosted OFL fonts (latin + latin-ext) with @font-face CSS per family
      vendor/              GSAP 3.15 (+ ScrollTrigger, SplitText, CustomEase, ScrambleText), Lenis 1.3
      geo/                 Slovenia outline, 12 regions and dot grid (Natural Earth 1:10m, public domain)
  tools/
      capture.mjs          Playwright screenshots (desktop 1440 @2x, mobile 390 @3x/@2x, review slices)
      boards.mjs           presentation boards from the captures
      build-geo.mjs        regenerates shared/geo from world-atlas
      fetch-fonts.py       regenerates shared/fonts from Google Fonts
  screens/                 the delivered images
```

## Run

```sh
cd jasno
npm run serve                 # http://localhost:5173/01-napoved/ (…02-rentgen, 03-mera, 04-signal)
npm run capture -- 01-napoved # screenshots → screens/01-napoved/
npm run capture:all           # all four
node tools/boards.mjs         # presentation boards → screens/boards/
```

Pages must be served over HTTP; fonts do not load from `file://`. Add `?capture=1` to any URL to see the static,
fully revealed state used for screenshots.

## Engineering notes

- **Stack:** plain HTML/CSS/JS with no build step, so each direction can be judged on its own. For production, port the chosen
  direction to Astro (static-first, island hydration for the signature component) with a headless CMS (Sanity or
  Storyblok) for copy, pricing and quotes, deployed on an edge host with preview deploys.
- **Motion:** GSAP + ScrollTrigger for choreography and Lenis for smooth scroll (off under reduced motion). Signature
  visuals use raw WebGL (Napoved), CSS masks (Rentgen), SVG and odometer DOM (Mera) or CSS 3D flaps (Signal). All of them
  animate transform and opacity, pause off-screen, and have static fallbacks.
- **Accessibility:** semantic landmarks, one `h1`, a skip link, visible focus, a full reduced-motion experience, and
  text equivalents for every visual. The X-ray has a keyboard toggle and the departure board is a real table with a pause control.
- **Capture mode:** `?capture=1` renders every section in its final state, with deterministic generative frames and no pinning,
  so a full-page screenshot shows the composed page.
