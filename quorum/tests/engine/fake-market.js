// A tiny hand-built market with the model interface engine/backtest.js uses. Every price, score and
// flag is set by the test, so entry and exit dates, costs, caps, cooldown and RENEW/CLOSE decisions can
// be checked by hand.
import { tradingDaysBetween } from '../../core/calendar.js';

const SECTORS = ['Industrials', 'Health Care', 'Energy', 'Utilities'];

/**
 * @param {object} o
 *   start ('2026-01-02'), days (80), stocks: [{ ticker, sector, mcap, price (flat), drift (daily open-to-open) }]
 * Returns a model-like object plus helpers: qualify(i, s, fams), veto(i, s, key), setCrash(s).
 */
export function fakeMarket({ start = '2026-01-02', days = 80, stocks }) {
  const dates = tradingDaysBetween(start, '2027-12-31').slice(0, days);
  const T = dates.length;
  const N = stocks.length;
  const open = new Float64Array(T * N);
  const close = new Float64Array(T * N);
  const mcap = new Float64Array(T * N);
  const adv60 = new Float32Array(T * N).fill(1e8);
  const eligible = new Uint8Array(T * N).fill(1);
  const pct = { A: new Float32Array(T * N).fill(0.5), B: new Float32Array(T * N).fill(0.5), C: new Float32Array(T * N).fill(0.5), D: new Float32Array(T * N).fill(0.5) };
  stocks.forEach((st, i) => {
    let p = st.price ?? 100;
    for (let t = 0; t < T; t++) {
      open[t * N + i] = p;
      close[t * N + i] = p * (1 + (st.drift ?? 0) / 2);
      mcap[t * N + i] = st.mcap ?? 20e9;
      p *= 1 + (st.drift ?? 0);
    }
  });
  const benchOpen = new Float64Array(T);
  const benchClose = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    benchOpen[t] = 1000 * 1.0005 ** t;
    benchClose[t] = benchOpen[t] * 1.0002;
  }
  const flags = new Map(); // `${s}:${i}` -> Set of veto keys
  const crashSwitch = new Uint8Array(T);
  const companies = stocks.map((st, i) => ({
    idx: i, ticker: st.ticker, name: `${st.ticker} Test Co.`, sector: st.sector ?? SECTORS[0], sectorSl: 'Industrija',
    isin: `ZZ${String(i).padStart(10, '0')}`, figi: `SIMTEST${String(i).padStart(5, '0')}`, venue: 'NYSE (simulated)',
    listDate: '2000-01-03', delistDate: null, delistReason: null, delistReturn: null, fictional: true,
  }));
  const model = {
    kind: 'fake', seed: 1, T, N, dates, companies, open, close, mcap, adv60, eligible, pct, crashSwitch,
    benchmark: { name: 'bench', open: benchOpen, close: benchClose },
    eurusd: new Float64Array(T).fill(1.1),
    periods: { research: [dates[0], dates[T - 1]], holdout: [dates[T - 1], dates[T - 1]], sealed: [dates[0], dates[T - 1]], freeze: dates[0] },
    vetoFlags(s, i) {
      const k = flags.get(`${s}:${i}`) ?? new Set();
      return {
        daysToCover: 1, dtcTopDecile: k.has('days_to_cover'), idioVol: 0.2, ivolTopDecile: k.has('idio_vol'),
        earningsWithin3d: k.has('earnings_within_3d'), nextEarnings: null, pendingMA: k.has('pending_ma'),
        newsNegative48h: k.has('llm_48h'), headline: null, headlines: [], llmStandIn: true, any: k.size > 0,
      };
    },
    holdReturn(i, a, b) {
      if (b >= T) return NaN;
      return open[b * N + i] / open[a * N + i] - 1;
    },
    benchReturn(a, b) {
      return b >= T ? NaN : benchOpen[b] / benchOpen[a] - 1;
    },
    oneWayCost(t, i) {
      return mcap[t * N + i] > 10e9 ? 0.001 : 0.0025;
    },
  };
  const helpers = {
    /** Put stock i in the top slice of the given families at signal day s (others at 0.5). */
    qualify(i, s, fams = ['A', 'B', 'D'], value = 0.97) {
      for (const f of ['A', 'B', 'C', 'D']) pct[f][s * N + i] = fams.includes(f) ? value : 0.5;
    },
    /** Qualify over a range of signal days [s0, s1]. */
    qualifyRange(i, s0, s1, fams, value) {
      for (let s = s0; s <= s1; s++) helpers.qualify(i, s, fams, value);
    },
    veto(i, s, key) {
      const k = `${s}:${i}`;
      if (!flags.has(k)) flags.set(k, new Set());
      flags.get(k).add(key);
    },
    setCrash(s0, s1 = s0) {
      for (let s = s0; s <= s1; s++) crashSwitch[s] = 1;
    },
  };
  return { model, ...helpers };
}
