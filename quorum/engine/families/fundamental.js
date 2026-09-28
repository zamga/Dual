// Family B: fundamental momentum. The standardised earnings surprise of the latest filing whose
// filing date is on or before t (EPS versus the consensus estimate, scaled by the dispersion of the
// company's past surprises; stale after 130 trading days), combined with the year-on-year change in
// gross profitability (quarterly GP / assets, annualised, versus the same quarter a year earlier).
// Expected to be the weakest family (post-earnings drift is small in large caps and decays).
import { rankTransform } from '../lib/stats.js';

export const FUNDAMENTAL_WEIGHTS = Object.freeze({ sue: 0.5, gp_chg: 0.5 });

export function fundamentalScore(ctx, out = new Float64Array(ctx.n)) {
  const { raw, N, n, J, scratch } = ctx;
  const rs = scratch.a;
  const rg = scratch.b;
  const sue = raw.subarray(J.sue * N, J.sue * N + n);
  const gp = raw.subarray(J.gp_chg * N, J.gp_chg * N + n);
  rankTransform(sue, n, rs, scratch.tmp);
  rankTransform(gp, n, rg, scratch.tmp);
  const w = FUNDAMENTAL_WEIGHTS;
  for (let e = 0; e < n; e++) {
    const hs = sue[e] === sue[e];
    const hg = gp[e] === gp[e];
    out[e] = hs && hg ? w.sue * rs[e] + w.gp_chg * rg[e] : hs ? rs[e] : hg ? rg[e] : NaN;
  }
  return out;
}
