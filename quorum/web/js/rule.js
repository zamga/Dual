// Labels for the quorum rule, derived from the data (meta.rule). Pure: no DOM, tested in Node.
// The threshold is calibrated per methodology version (meta.rule.topPct, 0.95 = "top 5%"), so no copy
// may hard-code it: every page builds its wording here.
//
// SL: first draft, needs native review.

// The rule threshold as a fraction (0.95), or null when the data does not say.
export function topPctOf(...sources) {
  for (const s of sources) {
    const v = s?.rule?.topPct ?? s?.topPct;
    if (Number.isFinite(v) && v > 0 && v < 1) return v;
  }
  return null;
}

function ordinalEn(n) {
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

// A percentage without float noise: 0.05 -> '5', 0.025 -> '2.5' (',' in SL).
function pctText(x, locale) {
  const v = Math.round(x * 1000) / 10;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return locale === 'sl' ? s.replace('.', ',') : s;
}

// Every wording of the threshold the site uses. topPct null gives neutral wording.
export function ruleText(topPct, locale = 'en') {
  const sl = locale === 'sl';
  if (!Number.isFinite(topPct)) {
    return sl
      ? {
          top: 'zgornji del',
          inTop: 'v svojem zgornjem delu',
          topCap: 'Zgornji del',
          pctile: 'prag',
          pctileNum: null,
          plus: '',
          share: '',
          band: 'Zgornji del',
          topPct: null,
        }
      : {
          top: 'top slice',
          inTop: 'in their top slice',
          topCap: 'Top slice',
          pctile: 'the threshold',
          pctileNum: null,
          plus: '',
          share: '',
          band: 'Top slice',
          topPct: null,
        };
  }
  const share = pctText(1 - topPct, locale); // '5'
  const num = Math.round(topPct * 1000) / 10; // 95
  const numS = Number.isInteger(num) ? String(num) : sl ? String(num).replace('.', ',') : String(num);
  if (sl) {
    return {
      top: `zgornjih ${share} %`, // "med zgornjih 5 %"
      inTop: `med zgornjih ${share} %`,
      topCap: `Zgornjih ${share} %`,
      pctile: `${numS}. percentil`,
      pctileNum: num,
      plus: `${numS}+`,
      share: `${share} %`,
      band: `Zgornjih ${share} % · ${numS}+`,
      topPct,
    };
  }
  return {
    top: `top ${share}%`,
    inTop: `in their top ${share}%`,
    topCap: `Top ${share}%`,
    pctile: Number.isInteger(num) ? `${ordinalEn(num)} percentile` : `${numS}th percentile`,
    pctileNum: num,
    plus: `${numS}+`,
    share: `${share}%`,
    band: `Top ${share}% · ${numS}+`,
    topPct,
  };
}

// Convenience: ruleText straight from meta (or anything carrying rule.topPct).
export function ruleLabels(meta, locale) {
  return ruleText(topPctOf(meta), locale);
}
