// The launch status (backtest.json "launch", ARCHITECTURE.md §3 and amendment A-1), read defensively, and
// every launch sentence the pages print (launchCopy). Pure: used by the app (ctx.launch(), which every page
// asks before it says anything about texts), the member pages' launch line, #backtest, #status, #home,
// #methodology, #pricing and tests/web/launch.test.js.
//
// Two different things are called "launch" and the copy keeps them apart:
// - The ENGINE LAUNCH GATE (gate E of the brief, §8): (a), (b), (c) and (e) on the holdout, (d1) on the
//   research window and (d2) on the pooled out-of-sample record. backtest.json says whether it passes:
//   launch.status is "ready" when it does, "pre-launch" otherwise. Gate (d) as first written is published
//   beside them (launch.original) but no longer decides; launch.pooled holds deflated pooled figures for
//   comparison only (pooled.gate === false) and is never read as a gate here.
// - LAUNCH ITSELF (paid SMS open, subscribers texted) also needs the brief's other gates (§8): L (legal:
//   counsel review, the ATVP query, the SMS carrier's letter of authorisation, the payment processor's
//   written confirmation), D (data licences) and, for the Research tier, R. No data file records them, so
//   this build never claims launch: `launched` is false and `prelaunch` true in every state, and no page
//   may say a text was sent. "ready" changes what the pages say about the engine, never about delivery.
//
// SL: first draft, needs native review.

const n2 = (x, sl, d = 2) => (sl ? x.toFixed(d).replace('.', ',') : x.toFixed(d));
const list = (ids, sl) => {
  const w = ids.map((id) => `(${id})`);
  if (w.length < 2) return w.join('');
  return `${w.slice(0, -1).join(', ')} ${sl ? 'in' : 'and'} ${w.at(-1)}`;
};

// The brief's other launch gates (§8), none of which is in the data: what "ready" still waits for.
export const OTHER_GATES = [
  { id: 'L', en: 'legal review (counsel, the ATVP query, the payment processor’s written confirmation)', sl: 'pravni pregled (odvetniki, poizvedba pri ATVP, pisna potrditev ponudnika plačil)' },
  { id: 'D', en: 'data licences', sl: 'licence za podatke' },
  { id: 'SMS', en: 'the SMS carrier’s approval (the letter of authorisation for Slovenia)', sl: 'odobritev ponudnika SMS (pooblastilo za Slovenijo)' },
];

// -> { known, status, state: 'unknown'|'waiting'|'research'|'ready', ready, launched, prelaunch, research, passed,
//      total, failed: ['b', 'd1'], holdout: [{id, pass}], gateD1: {dsr, need, pbo, pboNeed, pass} | null,
//      gateD2: {psr, need, pass, firstPass} | null, original: {dsr, need, pass} | null, asOf,
//      text: {en, sl}, lead: {en, sl}, label: {en, sl} }
// `ready`: the engine launch gate passes (launch.status "ready"). `research`: a gate failed that no further
// month can change (a holdout gate or d1): under the brief the engine goes back to research and SMS alerts
// do not launch. `launched`: always false here (see above); `prelaunch` = !launched.
export function launchInfo(backtest) {
  const l = backtest?.launch;
  if (!l || typeof l !== 'object') {
    return {
      known: false,
      status: 'pre-launch',
      state: 'unknown',
      ready: false,
      launched: false,
      prelaunch: true,
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
  const state = ready ? 'ready' : research ? 'research' : 'waiting';
  const remaining = l.remaining && typeof l.remaining === 'object' ? l.remaining : null;
  let en;
  let sl;
  if (ready) {
    en = 'Engine launch gate: passes. Gates (a), (b), (c) and (e) on the holdout, (d1) on the research window and (d2) on the pooled record.';
    sl = 'Pogoj pogona za zagon: izpolnjen. Pogoji (a), (b), (c) in (e) na preizkusu, (d1) v raziskovalnem obdobju in (d2) na združenem zapisu.';
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
    en = `Engine launch gate: ${partsEn.join('; ')}.${research ? ' A failed holdout gate or (d1) cannot pass later: the engine goes back to research.' : ''}`;
    sl = `Pogoj pogona za zagon: ${partsSl.join('; ')}.${research ? ' Neizpolnjen pogoj preizkusa ali (d1) pozneje ne more biti izpolnjen: pogon se vrne v raziskave.' : ''}`;
  }
  const blocking = failed.filter((id) => id !== 'd2');
  const lead = ready
    ? { en: 'The engine launch gate passes. Paid SMS still waits for the other launch gates: legal review, data licences and the SMS carrier’s approval.', sl: 'Pogoj pogona za zagon je izpolnjen. Plačljivi SMS še čaka na druge pogoje za zagon: pravni pregled, licence za podatke in odobritev ponudnika SMS.' }
    : research
      ? {
          en: `Not launching: the engine is back in research (${blocking.length > 1 ? 'gates' : 'gate'} ${list(blocking)} failed). Paid SMS has no launch date.`,
          sl: `Brez zagona: pogon je spet v raziskavah (${blocking.length > 1 ? 'pogoji' : 'pogoj'} ${list(blocking, true)} ni${blocking.length > 1 ? 'so' : ''} izpolnjen${blocking.length > 1 ? 'i' : ''}). Plačljivi SMS nima datuma zagona.`,
        }
      : { en: 'Paid SMS opens at launch.', sl: 'Plačljivi SMS se odpre ob zagonu.' };
  const label = ready
    ? { en: 'Pre-launch · engine gate passed', sl: 'Pred zagonom · pogoj pogona izpolnjen' }
    : research
      ? { en: 'Pre-launch · back in research', sl: 'Pred zagonom · spet v raziskavah' }
      : { en: 'Pre-launch', sl: 'Pred zagonom' };
  return {
    known: true,
    status: ready ? 'ready' : 'pre-launch',
    state,
    ready,
    launched: false,
    prelaunch: true,
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

// Every launch-dependent sentence a page prints, for one locale, in each state. Pages take their launch
// copy from here so that both states are designed in one place and tested (tests/web/launch.test.js):
// "ready" says the engine launch gate passes and that launch still needs the brief's other gates; no state
// says a text was sent, because there are no subscribers.
export function launchCopy(info, locale = 'en') {
  const sl = locale === 'sl';
  const L = (en, s) => (sl ? s : en);
  const st = info?.state ?? 'unknown';
  const ready = st === 'ready';
  const research = st === 'research';
  const others = OTHER_GATES.map((g) => (sl ? g.sl : g.en));
  const othersList = `${others.slice(0, -1).join(', ')} ${L('and', 'in')} ${others.at(-1)}`;
  return {
    state: st,
    label: (info?.label ?? { en: 'Pre-launch', sl: 'Pred zagonom' })[sl ? 'sl' : 'en'],
    lead: (info?.lead ?? { en: 'Paid SMS opens at launch.', sl: 'Plačljivi SMS se odpre ob zagonu.' })[sl ? 'sl' : 'en'],
    // #backtest §04: the headline and kicker of the launch test
    kicker: L('Engine launch gate', 'Pogoj pogona za zagon'),
    title: ready
      ? L('The engine gate passes. Launch waits on legal, data and SMS approvals.', 'Pogoj pogona je izpolnjen. Zagon čaka na pravne, podatkovne in SMS odobritve.')
      : research
        ? L('Back to research. SMS alerts do not launch.', 'Nazaj v raziskave. Obvestila SMS se ne zaženejo.')
        : L('Pre-launch. SMS alerts stay off.', 'Pred zagonom. Obvestila SMS ostajajo izklopljena.'),
    // #backtest: what the engine gate does not cover, in every state
    others: ready
      ? L(`This is the engine gate only. Launch also needs the brief’s other gates (§8): ${othersList}. None of them is in this data, so there are still no subscribers and no text is sent.`, `To je samo pogoj pogona. Zagon potrebuje še druge pogoje iz izhodišč (§8): ${othersList}. Nobenega od njih ni v teh podatkih, zato naročnikov še ni in noben SMS se ne pošlje.`)
      : L(`This is the engine gate only. Even when it passes, launch also needs the brief’s other gates (§8): ${othersList}.`, `To je samo pogoj pogona. Tudi ko bo izpolnjen, zagon potrebuje še druge pogoje iz izhodišč (§8): ${othersList}.`),
    // #home: the Silence Calendar lede's last sentence (n = days on which a BUY, RENEW or CLOSE was due)
    homeTexts: (n) =>
      ready
        ? L(`A text was due on ${n} days (a BUY, RENEW or CLOSE). The engine launch gate has passed, but SMS alerts wait for legal review, data licences and the SMS carrier’s approval, so none was sent.`, `SMS je bil predviden ${n} dni (NAKUP, PODALJŠANJE ali ZAPRTJE). Pogoj pogona za zagon je izpolnjen, a obvestila SMS čakajo na pravni pregled, licence za podatke in odobritev ponudnika SMS, zato ni bil poslan noben.`)
        : research
          ? L(`A text was due on ${n} days (a BUY, RENEW or CLOSE); the engine is back in research and SMS alerts have not launched, so none was sent.`, `SMS je bil predviden ${n} dni (NAKUP, PODALJŠANJE ali ZAPRTJE); pogon je spet v raziskavah in obvestila SMS niso zagnana, zato ni bil poslan noben.`)
          : L(`A text was due on ${n} days (a BUY, RENEW or CLOSE); SMS alerts have not launched, so none was sent.`, `SMS je bil predviden ${n} dni (NAKUP, PODALJŠANJE ali ZAPRTJE); obvestila SMS še niso zagnana, zato ni bil poslan noben.`),
    // #join, the final step (nothing is charged in any state of this build)
    joinDone: (demo) =>
      `${demo ? L('Nothing was charged and nothing was sent: this was the demo. ', 'Nič ni bilo zaračunano in nič poslano: to je bil demo. ') : L('Nothing was charged. ', 'Nič ni bilo zaračunano. ')}${
        ready
          ? L('The engine launch gate has passed; paid SMS still waits for legal review, data licences and the SMS carrier’s approval. Until then the sealed record runs with no subscribers, in public.', 'Pogoj pogona za zagon je izpolnjen; plačljivi SMS še čaka na pravni pregled, licence za podatke in odobritev ponudnika SMS. Do takrat zapečateni zapis teče brez naročnikov, javno.')
          : research
            ? L('The engine is back in research, so paid SMS has no launch date; the sealed record keeps running with no subscribers, in public.', 'Pogon je spet v raziskavah, zato plačljivi SMS nima datuma zagona; zapečateni zapis teče naprej brez naročnikov, javno.')
            : L('Paid SMS opens at launch; until then the sealed record runs with no subscribers, in public.', 'Plačljivi SMS se odpre ob zagonu; do takrat zapečateni zapis teče brez naročnikov, javno.')
      }`,
    // #join, the payment step: the flag over the preview sheet
    checkoutFlag: (demo) =>
      demo
        ? L('Demo · a preview of the payment page, nothing is charged', 'Demo · predogled plačilne strani, nič se ne zaračuna')
        : ready
          ? L('Pre-launch · engine gate passed · a preview, nothing is charged', 'Pred zagonom · pogoj pogona izpolnjen · predogled, nič se ne zaračuna')
          : L('Pre-launch · a preview, nothing is charged', 'Pred zagonom · predogled, nič se ne zaračuna'),
    // #app, the demo reader box
    appLabel: ready ? L('Pre-launch preview · engine gate passed', 'Predogled pred zagonom · pogoj pogona izpolnjen') : L('Pre-launch preview', 'Predogled pred zagonom'),
    appNote: (tierName) =>
      ready
        ? L(`No subscriber exists yet: the engine launch gate has passed, and paid SMS waits for legal, data and SMS approvals. This is what a ${tierName} reader will see; switch “View as” for the other tiers.`, `Naročnikov še ni: pogoj pogona za zagon je izpolnjen, plačljivi SMS pa čaka na pravne, podatkovne in SMS odobritve. Tako bo videl bralec paketa ${tierName}; z »Pogled kot« vidite druge pakete.`)
        : L(`No subscriber exists yet. This is what a ${tierName} reader will see; switch “View as” for the other tiers.`, `Naročnikov še ni. Tako bo videl bralec paketa ${tierName}; z »Pogled kot« vidite druge pakete.`),
    // #status, the SMS channel's note
    statusSms: ready
      ? L('Not open yet: the engine gate has passed; legal, data and carrier approvals are pending. Sender QUORUM, SI AT DE HR IT.', 'Še ni odprto: pogoj pogona je izpolnjen; pravne, podatkovne in odobritve ponudnika še čakajo. Pošiljatelj QUORUM, SI AT DE HR IT.')
      : research
        ? L('Not launching: the engine is back in research. Sender QUORUM, SI AT DE HR IT.', 'Brez zagona: pogon je spet v raziskavah. Pošiljatelj QUORUM, SI AT DE HR IT.')
        : L('Paid SMS opens at launch. Sender QUORUM, SI AT DE HR IT.', 'Plačljivi SMS se odpre ob zagonu. Pošiljatelj QUORUM, SI AT DE HR IT.'),
    // #methodology, under the gates table
    methodology: ready
      ? L('Under amendment A-1 the engine launch gate passes; launch still needs legal review, data licences and the SMS carrier’s approval. ', 'Po dopolnilu A-1 je pogoj pogona za zagon izpolnjen; zagon potrebuje še pravni pregled, licence za podatke in odobritev ponudnika SMS. ')
      : research
        ? L('Under the brief the engine returns to research and SMS alerts do not launch. ', 'Po izhodiščih se pogon vrne v raziskave in obvestila SMS se ne zaženejo. ')
        : L('The engine launch gate is not met yet: (d2) is re-tested at every month-end. ', 'Pogoj pogona za zagon še ni izpolnjen: (d2) se preverja ob koncu vsakega meseca. '),
    // #pricing and the home pricing teaser (ui.js launchNote, after the state label): paid tiers before launch
    pricing: ready
      ? L('The engine launch gate has passed; paid SMS opens once legal review, data licences and the SMS carrier’s approval are in. Join runs as a preview and charges nothing.', 'Pogoj pogona za zagon je izpolnjen; plačljivi SMS se odpre, ko bodo urejeni pravni pregled, licence za podatke in odobritev ponudnika SMS. Naročilo teče kot predogled in ne zaračuna ničesar.')
      : research
        ? L('The engine is back in research, so paid SMS has no launch date. Join runs as a preview and charges nothing.', 'Pogon je spet v raziskavah, zato plačljivi SMS nima datuma zagona. Naročilo teče kot predogled in ne zaračuna ničesar.')
        : L('Paid SMS opens at launch. Join runs as a preview and charges nothing.', 'Plačljivi SMS se odpre ob zagonu. Naročilo teče kot predogled in ne zaračuna ničesar.'),
    testLink: L('The launch test →', 'Preizkus za zagon →'),
  };
}
