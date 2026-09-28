// Holding-period returns on the simulated market, open to open, with delisting proceeds.

/**
 * Gross return of buying company i at the open of sim day tEntry and selling at the open of tExit.
 * If the company delists at day d (last close) with tEntry <= d < tExit, the position is closed at
 * close[d] * (1 + delistReturn) and held in cash afterwards. NaN when there is no entry open.
 */
export function holdReturn(m, i, tEntry, tExit) {
  const N = m.N;
  if (tEntry >= m.S) return NaN;
  const o = m.open[tEntry * N + i];
  if (!(o === o)) return NaN;
  const dl = m.companies.delistIdx[i];
  if (dl >= 0 && dl < tExit) {
    if (dl < tEntry) return NaN;
    const dr = m.companies.delistReturn[i];
    return (m.close[dl * N + i] * (1 + (dr === dr ? dr : -0.3))) / o - 1;
  }
  if (tExit >= m.S) return NaN;
  const x = m.open[tExit * N + i];
  return x === x ? x / o - 1 : NaN;
}

/** Benchmark (total return) open-to-open return between two sim days. */
export function benchReturn(m, tEntry, tExit) {
  if (tExit >= m.S) return NaN;
  return m.bench.open[tExit] / m.bench.open[tEntry] - 1;
}

/** One-way trading cost as a fraction: 10 bps above $10B market cap, 25 bps for $2-10B. */
export function oneWayCost(mcap) {
  return mcap > 10e9 ? 0.001 : 0.0025;
}
