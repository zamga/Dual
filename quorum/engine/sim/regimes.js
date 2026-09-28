// The macro script of the simulated market. Regimes rhyme with real history without copying it:
// dates are shifted by days to weeks and magnitudes differ. Each market segment is hit exactly
// (a Brownian bridge inside the segment), so the shape is guaranteed for any seed while the daily
// path is random. Everything here is "hidden truth": the families never read this file.

// [segment end date, total return over the segment (total return, simple), annualised vol]
// The first segment starts at the simulation start (2005-01-03 by default).
export const MARKET_SEGMENTS = [
  ['2005-04-18', -0.05, 0.11],
  ['2006-05-08', 0.17, 0.1],
  ['2006-06-14', -0.07, 0.16],
  ['2007-02-23', 0.19, 0.09],
  ['2007-03-12', -0.05, 0.18],
  ['2007-07-17', 0.12, 0.11],
  ['2007-08-14', -0.09, 0.24],
  ['2007-10-09', 0.09, 0.16], // pre-crisis peak
  ['2008-01-23', -0.15, 0.25],
  ['2008-05-16', 0.1, 0.2],
  ['2008-07-14', -0.13, 0.26],
  ['2008-08-27', 0.05, 0.22],
  ['2008-11-20', -0.39, 0.6], // autumn crash
  ['2009-01-05', 0.2, 0.48], // bear-market rally
  ['2009-03-05', -0.26, 0.42], // final low
  ['2009-06-11', 0.36, 0.32], // sharp rebound: momentum crash window in the hidden process
  ['2009-07-09', -0.06, 0.22],
  ['2010-04-22', 0.27, 0.15],
  ['2010-07-01', -0.14, 0.26],
  ['2011-04-28', 0.31, 0.14],
  ['2011-07-21', -0.02, 0.15],
  ['2011-10-04', -0.18, 0.37], // 2011 drawdown
  ['2012-04-03', 0.26, 0.18],
  ['2012-06-04', -0.09, 0.18],
  ['2014-12-29', 0.58, 0.115],
  ['2015-07-17', 0.04, 0.11],
  ['2015-08-25', -0.12, 0.3], // 2015-16 drawdown, first leg
  ['2015-11-04', 0.1, 0.17],
  ['2016-02-10', -0.13, 0.23], // second leg
  ['2016-06-09', 0.13, 0.13],
  ['2016-06-28', -0.05, 0.22],
  ['2018-01-25', 0.42, 0.08], // low-volatility bull
  ['2018-02-09', -0.1, 0.32],
  ['2018-09-21', 0.12, 0.12],
  ['2018-12-24', -0.19, 0.24], // Q4-2018
  ['2019-05-02', 0.24, 0.14],
  ['2019-06-03', -0.06, 0.17],
  ['2020-02-19', 0.23, 0.12],
  ['2020-03-20', -0.33, 0.85], // pandemic-style crash
  ['2020-06-05', 0.4, 0.38], // fast rebound: second momentum crash window
  ['2020-10-30', 0.02, 0.22],
  ['2021-12-31', 0.44, 0.14],
  ['2022-06-15', -0.22, 0.26], // 2022 bear, first leg
  ['2022-08-17', 0.16, 0.2],
  ['2022-10-13', -0.17, 0.27], // 2022 low
  ['2023-07-28', 0.27, 0.15],
  ['2023-10-26', -0.1, 0.15],
  ['2025-02-18', 0.47, 0.12],
  ['2025-04-08', -0.19, 0.36], // spring-2025 shock
  ['2025-06-27', 0.22, 0.22],
  ['2025-11-19', 0.06, 0.12],
  ['2026-03-27', -0.07, 0.16],
  ['2026-09-28', 0.11, 0.12],
];

export const SECTORS = [
  'Information Technology',
  'Health Care',
  'Financials',
  'Consumer Discretionary',
  'Communication Services',
  'Industrials',
  'Consumer Staples',
  'Energy',
  'Utilities',
  'Real Estate',
  'Materials',
];

export const SECTORS_SL = [
  'Informacijska tehnologija',
  'Zdravstvo',
  'Finance',
  'Ciklične potrošne dobrine',
  'Komunikacijske storitve',
  'Industrija',
  'Osnovne potrošne dobrine',
  'Energija',
  'Javne storitve',
  'Nepremičnine',
  'Surovine',
];

// Per-sector static parameters used by the company generator and the fundamentals model.
// weight: share of companies; beta: mean market beta; vol: sector factor vol (annual);
// gm: gross margin; ey: fair EBIT / enterprise-value yield; turn: asset turnover (revenue/assets);
// lev: debt / assets; intang: off-balance-sheet intangible capital / assets; nasdaq: share on NASDAQ.
export const SECTOR_PARAMS = [
  { weight: 0.14, beta: 1.2, vol: 0.12, gm: 0.58, ey: 0.05, turn: 0.75, lev: 0.18, intang: 0.5, nasdaq: 0.7 },
  { weight: 0.13, beta: 0.85, vol: 0.1, gm: 0.6, ey: 0.055, turn: 0.7, lev: 0.22, intang: 0.5, nasdaq: 0.55 },
  { weight: 0.13, beta: 1.15, vol: 0.11, gm: 0.75, ey: 0.08, turn: 0.2, lev: 0.3, intang: 0.1, nasdaq: 0.25 },
  { weight: 0.12, beta: 1.15, vol: 0.1, gm: 0.38, ey: 0.065, turn: 1.3, lev: 0.28, intang: 0.25, nasdaq: 0.35 },
  { weight: 0.05, beta: 1.0, vol: 0.1, gm: 0.55, ey: 0.06, turn: 0.55, lev: 0.3, intang: 0.4, nasdaq: 0.5 },
  { weight: 0.15, beta: 1.05, vol: 0.08, gm: 0.32, ey: 0.07, turn: 0.95, lev: 0.26, intang: 0.15, nasdaq: 0.2 },
  { weight: 0.05, beta: 0.65, vol: 0.07, gm: 0.36, ey: 0.065, turn: 1.4, lev: 0.28, intang: 0.3, nasdaq: 0.2 },
  { weight: 0.06, beta: 1.1, vol: 0.2, gm: 0.3, ey: 0.09, turn: 0.6, lev: 0.28, intang: 0.05, nasdaq: 0.1 },
  { weight: 0.04, beta: 0.55, vol: 0.08, gm: 0.42, ey: 0.07, turn: 0.3, lev: 0.45, intang: 0.03, nasdaq: 0.05 },
  { weight: 0.07, beta: 0.9, vol: 0.11, gm: 0.62, ey: 0.06, turn: 0.13, lev: 0.45, intang: 0.03, nasdaq: 0.1 },
  { weight: 0.06, beta: 1.1, vol: 0.12, gm: 0.28, ey: 0.08, turn: 0.8, lev: 0.28, intang: 0.08, nasdaq: 0.15 },
];

// Sector-specific drift episodes (relative to the market): [sectorIndex, from, to, total relative return]
export const SECTOR_EPISODES = [
  [2, '2007-06-01', '2009-03-05', -0.35], // financials in the credit crisis
  [8, '2008-06-01', '2009-03-05', 0.15], // utilities defensive
  [6, '2008-06-01', '2009-03-05', 0.12],
  [7, '2008-07-01', '2008-12-31', -0.18], // energy in the commodity collapse
  [0, '2009-03-06', '2010-12-31', 0.1],
  [7, '2014-06-20', '2016-01-20', -0.42], // energy bust
  [10, '2014-06-20', '2016-01-20', -0.12],
  [0, '2016-06-01', '2018-01-25', 0.12],
  [7, '2020-01-02', '2020-10-30', -0.33],
  [0, '2020-03-23', '2021-12-31', 0.14],
  [4, '2020-03-23', '2021-02-26', 0.1],
  [9, '2020-02-20', '2020-12-31', -0.12],
  [7, '2021-01-04', '2022-06-08', 0.62], // energy rally
  [0, '2022-01-03', '2022-10-13', -0.14],
  [9, '2022-01-03', '2022-10-31', -0.1],
  [0, '2023-01-03', '2024-12-31', 0.18],
  [8, '2024-04-01', '2025-06-30', 0.08],
];

// EURUSD (USD per EUR) anchors; a bridged random walk runs between them.
export const EURUSD_ANCHORS = [
  ['2005-01-03', 1.34],
  ['2005-11-14', 1.17],
  ['2006-12-04', 1.33],
  ['2008-04-21', 1.58],
  ['2008-10-27', 1.26],
  ['2009-11-24', 1.5],
  ['2010-06-08', 1.2],
  ['2011-05-03', 1.47],
  ['2012-07-23', 1.21],
  ['2014-05-07', 1.38],
  ['2015-03-12', 1.06],
  ['2016-12-20', 1.04],
  ['2018-02-01', 1.24],
  ['2019-09-30', 1.09],
  ['2020-03-19', 1.07],
  ['2021-01-06', 1.23],
  ['2022-09-26', 0.96],
  ['2023-07-17', 1.12],
  ['2023-10-02', 1.05],
  ['2024-09-27', 1.12],
  ['2025-01-10', 1.03],
  ['2025-07-01', 1.18],
  ['2026-09-28', 1.16],
];

// Hidden momentum premium multiplier windows (negative = momentum crash). Rebounds after bear markets.
export const MOMENTUM_WINDOWS = [
  ['2008-11-21', '2009-01-05', -0.6],
  ['2009-03-06', '2009-06-19', -2.6],
  ['2016-02-11', '2016-04-15', -0.4],
  ['2020-03-23', '2020-06-12', -2.4],
  ['2025-04-09', '2025-06-13', -0.5],
];

// Hidden value mean-reversion speed kappa(t) (per year). Negative = cheap stocks get cheaper.
export const VALUE_WINDOWS = [
  ['2017-01-03', '2020-10-30', -0.1],
  ['2020-11-02', '2022-06-30', 0.9],
];
export const VALUE_KAPPA_BASE = 0.25;

// Quality premium multiplier: stronger in drawdowns, negative in junk rallies.
export const QUALITY_WINDOWS = [
  ['2008-09-01', '2009-03-05', 2.2],
  ['2009-03-06', '2009-06-19', -0.8],
  ['2011-07-22', '2011-10-04', 1.8],
  ['2020-02-20', '2020-03-20', 2.2],
  ['2020-03-23', '2020-06-12', -0.6],
  ['2022-01-03', '2022-10-13', 1.6],
];

// Distress (bankruptcy path) hazard multiplier.
export const DISTRESS_WINDOWS = [
  ['2008-06-01', '2009-06-30', 7],
  ['2020-03-01', '2020-08-31', 3.5],
  ['2015-10-01', '2016-03-31', 1.8],
  ['2022-06-01', '2022-12-31', 1.5],
];

// IPO counts by year (full universe; scaled for small universes).
export const IPO_COUNTS = {
  2005: 16, 2006: 18, 2007: 20, 2008: 5, 2009: 10, 2010: 30, 2011: 27, 2012: 27, 2013: 29, 2014: 28,
  2015: 18, 2016: 12, 2017: 15, 2018: 16, 2019: 15, 2020: 24, 2021: 34, 2022: 6, 2023: 12, 2024: 16,
  2025: 15, 2026: 9,
};

// M&A announcement hazard multiplier by year (deal waves).
export const MA_YEAR_MULT = {
  2005: 1.1, 2006: 1.3, 2007: 1.4, 2008: 0.7, 2009: 0.5, 2010: 0.8, 2011: 0.75, 2012: 0.8, 2013: 1.0,
  2014: 1.2, 2015: 1.4, 2016: 1.2, 2017: 1.1, 2018: 1.2, 2019: 1.1, 2020: 0.7, 2021: 1.4, 2022: 0.9,
  2023: 0.8, 2024: 0.9, 2025: 1.0, 2026: 1.0,
};

/** Piecewise schedule lookup: value inside any window (first match), else base. */
export function windowValue(windows, date, base) {
  for (const w of windows) if (date >= w[0] && date <= w[1]) return w[2];
  return base;
}
