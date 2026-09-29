// The launch status (backtest.json "launch", ARCHITECTURE.md §3 and amendment A-1), read defensively.
// Pure: used by the app (ctx.launch(), which every page may ask before it claims a text was sent), the
// member pages' launch line, #backtest, #status and tests/web/join.test.js.
//
// The gates that decide launch under A-1 are (a), (b), (c) and (e) on the holdout, (d1) on the research
// window and (d2) on the pooled out-of-sample record. Gate (d) as first written is published beside them
// (launch.original) but no longer decides; launch.pooled holds deflated pooled figures for comparison
// only (pooled.gate === false) and is never read as a gate here.
//
// SL: first draft, needs native review.

const n2 = (x, sl, d = 2) => (sl ? x.toFixed(d).replace('.', ',') : x.toFixed(d));
const list = (ids, sl) => {
  const w = ids.map((id) => `(${id})`);
  if (w.length < 2) return w.join('');
  return `${w.slice(0, -1).join(', ')} ${sl ? 'in' : 'and'} ${w.at(-1)}`;
};

// -> { known, ready, prelaunch, status, research, passed, total, failed: ['b', 'd1'], holdout: [{id, pass}],
//      gateD1: {dsr, need, pbo, pboNeed, pass} | null, gateD2: {psr, need, pass, firstPass} | null,
//      original: {dsr, need, pass} | null, asOf, text: {en, sl}, lead: {en, sl}, label: {en, sl} }
// `research` is true when a gate failed that no further month can change (a holdout gate or d1): under the
// brief the engine goes back to research and SMS alerts do not launch.
export function launchInfo(backtest) {
  const l = backtest?.launch;
  if (!l || typeof l !== 'object') {
    return {
      known: false,
      ready: false,
      prelaunch: true,
      status: 'pre-launch',
      research: false,
      passed: null,
      total: null,
      failed: [],
      holdout: [],
      gateD1: null,
      gateD2: null,
      original: null,
      asOf: null,
      text: { en: 'Pre-launch: the sealed record has no subscribers yet.', sl: 'Pred zagonom: zapečateni zapis še nima naročnikov.' },
      lead: { en: 'Paid SMS opens at launch.', sl: 'Plačljivi SMS se odpre ob zagonu.' },
      label: { en: 'Pre-launch', sl: 'Pred zagonom' },
    };
  }
  const holdout = (Array.isArray(l.holdoutGates) ? l.holdoutGates : []).filter((g) => g && g.id !== 'd').map((g) => ({ id: String(g.id), pass: !!g.pass }));
  const d1 = l.d1 && Number.isFinite(l.d1.dsrResearch)
    ? { dsr: l.d1.dsrResearch, need: l.d1.dsrThreshold ?? 0.95, pbo: l.d1.pbo ?? null, pboNeed: l.d1.pboThreshold ?? 0.3, pass: !!l.d1.pass }
    : null;
  const d2 = l.d2 && Number.isFinite(l.d2.psr) ? { psr: l.d2.psr, need: l.d2.threshold ?? 0.95, pass: !!l.d2.pass, firstPass: l.d2.firstPass ?? null } : null;
  const original = l.original && Number.isFinite(l.original.dsr) ? { dsr: l.original.dsr, need: 0.95, pass: !!l.original.pass } : null;
  const gates = [...holdout, ...(d1 ? [{ id: 'd1', pass: d1.pass }] : []), ...(d2 ? [{ id: 'd2', pass: d2.pass }] : [])];
  const passed = gates.filter((g) => g.pass).length;
  const total = gates.length;
  const failed = gates.filter((g) => !g.pass).map((g) => g.id);
  const ready = l.status === 'ready';
  // A holdout gate is measured once; d1 is measured on the closed research window. Neither can recover.
  const research = !ready && failed.some((id) => id !== 'd2');
  const remaining = l.remaining && typeof l.remaining === 'object' ? l.remaining : null;
  let en;
  let sl;
  if (ready) {
    en = 'Launch gate E has passed: gates (a), (b), (c) and (e) on the holdout, (d1) on the research window and (d2) on the pooled record.';
    sl = 'Pogoj za zagon E je izpolnjen: pogoji (a), (b), (c) in (e) na preizkusu, (d1) v raziskovalnem obdobju in (d2) na združenem zapisu.';
  } else if (remaining?.en) {
    en = remaining.en;
    sl = remaining.sl ?? remaining.en;
  } else {
    const hp = holdout.filter((g) => g.pass).map((g) => g.id);
    const hf = holdout.filter((g) => !g.pass).map((g) => g.id);
    const partsEn = [`holdout gates ${list(hp)} pass${hf.length ? `, ${list(hf)} ${hf.length > 1 ? 'fail' : 'fails'}` : ''}`];
    const partsSl = [`pogoji preizkusa ${list(hp, true)} izpolnjeni${hf.length ? `, ${list(hf, true)} ni${hf.length > 1 ? 'so' : ''} izpolnjen${hf.length > 1 ? 'i' : ''}` : ''}`];
    if (d1) {
      partsEn.push(`(d1) ${d1.pass ? 'passes' : 'fails'} (${n2(d1.dsr)}, needs ${n2(d1.need)})`);
      partsSl.push(`(d1) ${d1.pass ? 'izpolnjen' : 'ni izpolnjen'} (${n2(d1.dsr, true)}, potrebno ${n2(d1.need, true)})`);
    }
    if (d2) {
      partsEn.push(`(d2) ${d2.pass ? 'passes' : 'not yet'} (${n2(d2.psr, false, 3)}, needs ${n2(d2.need)})`);
      partsSl.push(`(d2) ${d2.pass ? 'izpolnjen' : 'še ne'} (${n2(d2.psr, true, 3)}, potrebno ${n2(d2.need, true)})`);
    }
    en = `Launch gate E: ${partsEn.join('; ')}.${research ? ' A failed holdout gate or (d1) cannot pass later: the engine goes back to research.' : ''}`;
    sl = `Pogoj za zagon E: ${partsSl.join('; ')}.${research ? ' Neizpolnjen pogoj preizkusa ali (d1) pozneje ne more biti izpolnjen: pogon se vrne v raziskave.' : ''}`;
  }
  const blocking = failed.filter((id) => id !== 'd2');
  const lead = ready
    ? { en: 'Paid SMS is open.', sl: 'Plačljivi SMS je odprt.' }
    : research
      ? {
          en: `Not launching: the engine is back in research (${blocking.length > 1 ? 'gates' : 'gate'} ${list(blocking)} failed). Paid SMS has no launch date.`,
          sl: `Brez zagona: pogon je spet v raziskavah (${blocking.length > 1 ? 'pogoji' : 'pogoj'} ${list(blocking, true)} ni${blocking.length > 1 ? 'so' : ''} izpolnjen${blocking.length > 1 ? 'i' : ''}). Plačljivi SMS nima datuma zagona.`,
        }
      : { en: 'Paid SMS opens at launch.', sl: 'Plačljivi SMS se odpre ob zagonu.' };
  const label = ready ? { en: 'Launched', sl: 'Zagnano' } : research ? { en: 'Pre-launch · back in research', sl: 'Pred zagonom · spet v raziskavah' } : { en: 'Pre-launch', sl: 'Pred zagonom' };
  return {
    known: true,
    ready,
    prelaunch: !ready,
    status: ready ? 'ready' : 'pre-launch',
    research,
    passed,
    total,
    failed,
    holdout,
    gateD1: d1,
    gateD2: d2,
    original,
    asOf: l.asOf ?? null,
    text: { en, sl },
    lead,
    label,
  };
}
