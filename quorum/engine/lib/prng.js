// Fast seeded draws for the simulation. The uniform stream is core/random.js mulberry32, so every
// simulated number still traces back to one seed; the normal generator keeps Box-Muller's second
// value instead of discarding it (the core helper favours simplicity, the simulation needs ~40M draws).
import { mulberry32, hashSeed } from '../../core/random.js';

export function makeRng(...seedParts) {
  const u = mulberry32(hashSeed(...seedParts));
  let spare = 0;
  let hasSpare = false;
  function n() {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    let x = 0;
    while (x === 0) x = u();
    const y = u();
    const r = Math.sqrt(-2 * Math.log(x));
    spare = r * Math.sin(2 * Math.PI * y);
    hasSpare = true;
    return r * Math.cos(2 * Math.PI * y);
  }
  // Exponential(1)
  function e() {
    let x = 0;
    while (x === 0) x = u();
    return -Math.log(x);
  }
  // Integer in [lo, hi] inclusive
  function int(lo, hi) {
    return lo + Math.floor(u() * (hi - lo + 1));
  }
  function pick(arr) {
    return arr[Math.floor(u() * arr.length)];
  }
  return { u, n, e, int, pick };
}
