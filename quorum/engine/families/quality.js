// Family C: quality/value. Sector-neutral ranks of gross profits to assets, EBIT to enterprise value
// (the inverse of EV/EBIT, so higher is cheaper), free-cash-flow yield and intangibles-adjusted
// book-to-market, averaged (at least two of the four must be available).
import { rankInto } from '../lib/stats.js';
import { FAMILY_INPUTS_C } from './inputs.js';

export function qualityScore(ctx, out = new Float64Array(ctx.n)) {
  const { raw, N, n, J, idx, sector, K, scratch } = ctx;
  const sum = out;
  sum.fill(0, 0, n);
  const cnt = scratch.cnt;
  cnt.fill(0, 0, n);
  const members = Array.from({ length: K }, () => []);
  for (let e = 0; e < n; e++) members[sector[idx[e]]].push(e);
  const vals = scratch.a;
  const rk = scratch.b;
  for (const key of FAMILY_INPUTS_C) {
    const jj = J[key];
    for (let k = 0; k < K; k++) {
      const mem = members[k];
      const nk = mem.length;
      if (nk < 3) continue;
      for (let z = 0; z < nk; z++) vals[z] = raw[jj * N + mem[z]];
      const m2 = rankInto(vals, nk, rk);
      for (let z = 0; z < nk; z++) {
        const r = rk[z];
        if (r === r) {
          sum[mem[z]] += (2 * (r - 0.5)) / m2 - 1;
          cnt[mem[z]]++;
        }
      }
    }
  }
  for (let e = 0; e < n; e++) out[e] = cnt[e] >= 2 ? sum[e] / cnt[e] : NaN;
  return out;
}
