// Quarterly fundamentals, as first reported (never restated), each keyed to its fiscal period end
// and an SEC-style filing date 25-60 days later. The simulation records the latent state at each
// period end; this module turns it into statements. The economic scale of a company follows its
// latent value path plus the smoothed economy, so valuation ratios carry the mispricing M.
import { makeRng } from '../lib/prng.js';

const FIELDS = ['revenue', 'grossProfit', 'ebit', 'netIncome', 'fcf', 'assets', 'bookEquity', 'intangibles', 'debt', 'cash', 'eps', 'epsConsensus', 'sue', 'shares'];

export function buildFundamentals({ fl, c, dates, S, N, mk, sec }) {
  const keep = [];
  for (let f = 0; f < fl.F; f++) if (fl.filed[f]) keep.push(f);
  const F = keep.length;
  const out = {
    F,
    fields: FIELDS,
    company: new Int32Array(F),
    periodEnd: new Array(F),
    periodEndIdx: new Int32Array(F),
    filingIdx: new Int32Array(F),
    fiscalQ: new Uint8Array(F),
    start: new Int32Array(N),
    end: new Int32Array(N),
  };
  for (const k of FIELDS) out[k] = new Float64Array(F);
  const seed = 0x51f0;
  let prevCompany = -1;
  let rng = null;
  let assetsPrev = NaN;
  const surpHist = [];
  for (let n = 0; n < F; n++) {
    const f = keep[n];
    const i = fl.company[f];
    if (i !== prevCompany) {
      if (prevCompany >= 0) out.end[prevCompany] = n;
      out.start[i] = n;
      prevCompany = i;
      rng = makeRng(seed, 'fund', i);
      assetsPrev = NaN;
      surpHist.length = 0;
    }
    const k = c.sector[i];
    const L0 = mk.L[c.listIdx[i]];
    const Sl0 = sec.Slev[k * S + c.listIdx[i]];
    const zBase = c.mcap0[i] * Math.exp(-c.m0[i] - c.beta[i] * L0 - c.gload[i] * Sl0);
    // the dollar scale follows the value path and the market, less the capital paid out since listing
    // (payouts shrink the share count and the firm alike, so per-share and valuation ratios ignore them)
    const Z = zBase * Math.exp(fl.x[f] + fl.pay[f] + c.beta[i] * fl.ls[f] + c.gload[i] * fl.ss[f]);
    const u = fl.u[f];
    const mg = fl.margin[f];
    const gm = c.gm[i] * Math.exp(0.5 * mg);
    const emBase = c.gm[i] * c.emFrac[i];
    const rev = (Z * c.ey[i]) / (4 * emBase) * Math.exp(0.02 * rng.n() + 0.01 * u);
    const ebit = rev * emBase * Math.exp(mg);
    const gp = rev * gm;
    const target = (4 * rev) / c.turn[i];
    const assets = assetsPrev === assetsPrev ? assetsPrev ** 0.5 * target ** 0.5 : target;
    assetsPrev = assets;
    const debt = c.lev[i] * assets;
    const cash = 0.08 * assets * Math.exp(0.1 * rng.n());
    const book = assets * Math.max(0.08, 1 - c.lev[i] - 0.25);
    const intang = assets * c.intang[i] * Math.exp(0.05 * rng.n());
    const pretax = ebit - (debt * 0.05) / 4;
    const ni = pretax > 0 ? pretax * 0.78 : pretax;
    const fcf = ebit * 0.78 * c.conv[i] + 0.25 * Math.abs(ebit) * rng.n();
    const sh = fl.shares[f];
    const eps = ni / sh;
    const sd$ = Math.max(0.01, (0.035 * Math.abs(ebit * 0.78)) / sh);
    const surprise = sd$ * (0.9 * u + 0.45 * fl.eta[f]);
    const cons = eps - surprise;
    let sue;
    if (surpHist.length >= 3) {
      const h = surpHist.slice(-8);
      const m = h.reduce((a, b) => a + b, 0) / h.length;
      const sdev = Math.sqrt(h.reduce((a, b) => a + (b - m) ** 2, 0) / (h.length - 1));
      sue = surprise / Math.max(sdev, 0.25 * sd$);
    } else sue = surprise / sd$;
    surpHist.push(surprise);
    out.company[n] = i;
    out.periodEnd[n] = fl.periodEnd[f];
    out.periodEndIdx[n] = fl.periodEndIdx[f];
    out.filingIdx[n] = fl.filingIdx[f];
    out.fiscalQ[n] = fl.fiscalQ[f];
    out.revenue[n] = rev;
    out.grossProfit[n] = gp;
    out.ebit[n] = ebit;
    out.netIncome[n] = ni;
    out.fcf[n] = fcf;
    out.assets[n] = assets;
    out.bookEquity[n] = book;
    out.intangibles[n] = intang;
    out.debt[n] = debt;
    out.cash[n] = cash;
    out.eps[n] = eps;
    out.epsConsensus[n] = cons;
    out.sue[n] = sue;
    out.shares[n] = sh;
  }
  if (prevCompany >= 0) out.end[prevCompany] = F;
  // companies without filings: empty range
  for (let i = 0; i < N; i++) if (out.end[i] < out.start[i]) out.end[i] = out.start[i];
  out.filingDate = Array.from(out.filingIdx, (t) => dates[t]);
  // public earnings calendar per company (includes scheduled dates after the end of the data and
  // dates a company would have reported had it not been delisted first)
  out.schedule = fl.schedule;
  return out;
}
