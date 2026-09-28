// Family A: trend. Residual 12-1 momentum (daily returns regressed on the benchmark and the
// sector's excess return over a rolling 252-day window; residuals summed over months t-12..t-2),
// scaled by the residual volatility (a t-statistic of the residual drift).
//
// Crash switch (ex-ante, in the spirit of Daniel-Moskowitz 2016): momentum crashes when a bear
// market rebounds. Using benchmark closes up to and including t only, the switch turns ON at the
// close of day t when all three hold:
//   bear market:  the benchmark's 24-month (504-day) total return is negative;
//   deep drawdown: the benchmark fell at least 28% from its 252-day high to its 63-day low;
//   rebound:      the benchmark closes at least 12% above that 63-day low;
// The switch stays ON for 63 trading days (about three months) after the last day the trigger held.
// While ON, A's vote is suspended and the quorum needs all three of B, C and D.
export const CRASH_RULE = Object.freeze({
  bearLookback: 504,
  highLookback: 252,
  lowLookback: 63,
  drawdown: 0.28,
  rebound: 0.12,
  hold: 63,
});

/** Crash-switch state per day from benchmark closes (Uint8Array, 1 = A suspended). */
export function crashSwitchSeries(benchClose, rule = CRASH_RULE) {
  const S = benchClose.length;
  const out = new Uint8Array(S);
  let onUntil = -1;
  for (let t = 0; t < S; t++) {
    if (t <= onUntil) out[t] = 1;
    const b = benchClose[t];
    if (t < rule.bearLookback || !(b / benchClose[t - rule.bearLookback] - 1 < 0)) continue;
    let low = Infinity;
    for (let k = Math.max(0, t - rule.lowLookback + 1); k <= t; k++) low = Math.min(low, benchClose[k]);
    let high = 0;
    for (let k = Math.max(0, t - rule.highLookback + 1); k <= t; k++) high = Math.max(high, benchClose[k]);
    const bear = low / high - 1 <= -rule.drawdown;
    if (bear && b >= low * (1 + rule.rebound)) {
      onUntil = t + rule.hold - 1;
      out[t] = 1;
    }
  }
  return out;
}

/** Contiguous ON periods as [from, to] date pairs. */
export function crashPeriods(series, dates, offset = 0) {
  const out = [];
  let start = -1;
  for (let t = 0; t < series.length; t++) {
    if (series[t] && start < 0) start = t;
    if ((!series[t] || t === series.length - 1) && start >= 0) {
      const end = series[t] ? t : t - 1;
      out.push([dates[start + offset], dates[end + offset]]);
      start = -1;
    }
  }
  return out;
}

/** A's raw score for the eligible cross-section: the vol-scaled residual momentum column. */
export function trendScore(ctx) {
  const { raw, N, n, J } = ctx;
  return raw.subarray(J.resid_mom_vs * N, J.resid_mom_vs * N + n);
}
