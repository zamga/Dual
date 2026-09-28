/* Rok credit desk UI. Plain DOM rendering over RokEngine + RokData. */
(function () {
  'use strict';
  const E = window.RokEngine;
  const { companies, people, asOf } = window.RokData.generate(2026, 600);
  E.attachNetwork(companies);

  const byId = new Map(companies.map(c => [c.id, c]));
  const personById = new Map(people.map(p => [p.id, p]));
  const results = new Map();
  for (const c of companies) results.set(c.id, E.score(c, { asOf }));
  const live = companies.filter(c => c.status !== 'bankrupt');

  // ---------- formatting ----------
  const eur = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const int = new Intl.NumberFormat('sl-SI', { maximumFractionDigits: 0 });
  const fmtEur = v => eur.format(Math.round(v));
  const fmtEurShort = v => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toLocaleString('sl-SI', { maximumFractionDigits: 1 }) + ' M€';
    if (a >= 1e3) return (v / 1e3).toLocaleString('sl-SI', { maximumFractionDigits: 0 }) + ' k€';
    return fmtEur(v);
  };
  const pdNumber = pd => {
    const p = pd * 100;
    return (p < 1 ? p.toFixed(2) : p < 10 ? p.toFixed(1) : p.toFixed(0)).replace('.', ',');
  };
  const fmtPd = pd => (pd >= 1 ? 'In default' : pdNumber(pd) + ' %');
  const fmtPct = (v, d = 0) => (v * 100).toFixed(d).replace('.', ',') + ' %';
  const fmtDate = iso => { const [y, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${y}`; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  const GRADE_KEY = { 'A+': 'Ap', A: 'A', 'B+': 'Bp', B: 'B', 'C+': 'Cp', C: 'C', D: 'D', E: 'E', X: 'X' };
  const gvar = g => `var(--g-${GRADE_KEY[g]})`;
  const gradeChip = r => `<span class="grade" style="--g:${gvar(r.grade.grade)}">${r.grade.grade}</span>`;

  const ICON = {
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.5 3 3 6-7"/></svg>',
    shield: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 1.8 2.8 3.8v4c0 3 2.2 5.2 5.2 6.4 3-1.2 5.2-3.4 5.2-6.4v-4Z"/></svg>',
    cross: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
  };

  // ---------- guilloché (banknote engraving) ----------
  function guilloche(R, amp, lobes, strands, amp2 = 0, lobes2 = 0) {
    const out = [];
    const points = 540;
    for (let s = 0; s < strands; s++) {
      const ph = (s / strands) * 2 * Math.PI;
      let d = '';
      for (let i = 0; i <= points; i++) {
        const t = (i / points) * 2 * Math.PI;
        const r = R + amp * Math.sin(lobes * t + ph) + amp2 * Math.sin(lobes2 * t - 2 * ph);
        d += (i ? 'L' : 'M') + (r * Math.cos(t)).toFixed(2) + ',' + (r * Math.sin(t)).toFixed(2);
      }
      out.push(d + 'Z');
    }
    return out;
  }
  const RING_OUTER = guilloche(64, 9, 18, 9, 1.5, 6);
  const RING_INNER = guilloche(48, 4.5, 28, 6);
  const MARK = guilloche(30, 12, 7, 5);

  function seal(r) {
    const g = r.grade.grade;
    const circ = (2 * Math.PI * 87).toFixed(1);
    const ring = `Rok grade · 12-month default probability · ${fmtDate(asOf)} · `;
    return `<svg class="seal" viewBox="-100 -100 200 200" role="img" aria-label="Rok grade ${g}" style="--g:${gvar(g)}">
      <defs><path id="seal-arc" d="M 0,-87 a 87,87 0 1,1 -0.01,0"/></defs>
      <circle r="97" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.5"/>
      <circle r="94.5" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.5"/>
      <text class="ring-text"><textPath href="#seal-arc" textLength="${circ}" lengthAdjust="spacing">${esc(ring.toUpperCase())}</textPath></text>
      <circle r="79" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.6"/>
      <g class="rings">${RING_OUTER.map(d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="0.42" opacity="0.8"/>`).join('')}</g>
      <g class="rings rings-2">${RING_INNER.map(d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="0.35" opacity="0.55"/>`).join('')}</g>
      <circle r="39" fill="var(--card)" stroke="currentColor" stroke-width="0.8"/>
      <circle r="35.5" fill="none" stroke="currentColor" stroke-width="0.3"/>
      <text class="letter" text-anchor="middle" y="${g.length > 1 ? 19 : 23}" style="font-size:${g.length > 1 ? 52 : 64}px">${g}</text>
    </svg>`;
  }

  // ---------- storage (per-viewer convenience only) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } },
  };

  // ---------- alerts ----------
  function alertsFor(c) {
    const out = [];
    const r = results.get(c.id);
    if (c.status === 'insolvency') out.push({ level: 'crit', text: 'Insolvency proceedings open' });
    for (const b of c.events.blockPeriods) {
      if (daysBetween(b.to, asOf) <= 60) {
        const current = new Date(b.to) >= new Date(asOf);
        out.push({ level: 'crit', text: current ? `Bank account blocked since ${fmtDate(b.from)}` : `Account was blocked ${c.events.blockedDays12m} days, until ${fmtDate(b.to)}` });
      }
    }
    if (c.events.taxDebt > 0) out.push({ level: 'warn', text: `On FURS tax-debtor list: ${fmtEur(c.events.taxDebt)}` });
    if (c.pay) {
      const recent = avg(c.pay.dbt.slice(-3)), earlier = avg(c.pay.dbt.slice(0, 9));
      if (recent - earlier >= 10) out.push({ level: 'warn', text: `Paying ${Math.round(recent - earlier)} days later than earlier this year` });
    }
    if (c.fin && r.finAgeMonths > 18) out.push({ level: 'info', text: `FY${Number(c.fin.periodEnd.slice(0, 4)) + 1} annual report not filed (deadline 31 March)` });
    if (c.net && c.net.directorBankruptcies > 0) out.push({ level: 'info', text: `Director linked to ${c.net.directorBankruptcies} bankrupt ${c.net.directorBankruptcies === 1 ? 'company' : 'companies'}` });
    return out;
  }
  const levelColor = { crit: 'var(--crit)', warn: 'var(--warn)', info: 'var(--info)' };
  const levelWord = { crit: 'Act now', warn: 'Review', info: 'Note' };
  const alertCache = new Map(live.map(c => [c.id, alertsFor(c)]));

  // Default watchlist: a spread of customers across the grade scale.
  function defaultWatchlist() {
    const sorted = live.filter(c => c.form !== 's.p.').sort((a, b) => results.get(a.id).pd - results.get(b.id).pd);
    const picks = {};
    const step = Math.floor(sorted.length / 14);
    for (let i = 0; i < 14; i++) {
      const c = sorted[Math.min(sorted.length - 1, i * step + 3)];
      picks[c.id] = Math.max(5000, Math.round((c.fin.revenue / 60) / 1000) * 1000);
    }
    const alerting = live.filter(c => alertCache.get(c.id).some(a => a.level === 'crit') && c.fin).slice(0, 3);
    for (const c of alerting) picks[c.id] = Math.max(5000, Math.round((c.fin.revenue / 80) / 1000) * 1000);
    return picks;
  }
  let watch = null;

  // ---------- sector medians ----------
  const sectorMedian = new Map();
  {
    const bySector = new Map();
    for (const c of live) {
      if (c.status !== 'active') continue;
      if (!bySector.has(c.sector.code)) bySector.set(c.sector.code, []);
      bySector.get(c.sector.code).push(results.get(c.id).pd);
    }
    for (const [k, arr] of bySector) {
      arr.sort((a, b) => a - b);
      sectorMedian.set(k, arr[Math.floor(arr.length / 2)]);
    }
  }

  // ---------- ledger ----------
  const $ = sel => document.querySelector(sel);
  const state = { filter: 'all', query: '', current: null };

  function matches(c, q) {
    if (!q) return true;
    const hay = `${c.name} ${c.ms} ${c.ds} ${c.city} ${c.sector.code}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every(t => hay.includes(t));
  }

  function renderResults() {
    let list = live.filter(c => matches(c, state.query));
    if (state.filter === 'watched') list = list.filter(c => watch[c.id] != null);
    if (state.filter === 'alerts') list = list.filter(c => alertCache.get(c.id).some(a => a.level !== 'info'));
    if (state.filter === 'risky') list = list.filter(c => results.get(c.id).pd >= 0.03);
    list.sort((a, b) => a.name.localeCompare(b.name, 'sl'));
    const shown = list.slice(0, 80);
    $('#results').innerHTML = shown.map(c => {
      const al = alertCache.get(c.id).filter(a => a.level !== 'info');
      const flag = al.length ? `<span class="flag" style="background:${levelColor[al[0].level]}" title="${esc(al[0].text)}"></span>` : '';
      return `<li><button data-open="${c.id}" aria-current="${c.id === state.current}">
        <span class="row-name">${esc(c.name)}</span>
        <span class="row-side">${flag}${gradeChip(results.get(c.id))}</span>
        <span class="row-meta">${esc(c.city)} · ${esc(c.sector.label)}</span>
      </button></li>`;
    }).join('') || '<li class="empty" style="margin-top:12px">No companies match. Try a town, a registration number or part of the name.</li>';
    $('#results-foot').textContent = list.length > shown.length
      ? `First ${shown.length} of ${int.format(list.length)}. Type to narrow down.`
      : `${int.format(list.length)} ${list.length === 1 ? 'company' : 'companies'}`;
  }

  // ---------- dossier: certificate ----------
  function certificate(c, r) {
    const med = sectorMedian.get(c.sector.code);
    const watched = watch[c.id] != null;
    const g = r.grade.grade;
    const directors = c.directors.map(p => esc(personById.get(p).name)).join(', ');
    const name = c.form === 's.p.' ? esc(c.name) : `${esc(c.name)} <span class="form">${c.form}</span>`;
    const ribbon = E.GRADES.map(x => `<span class="${x.grade === g ? 'on' : ''}" style="--g:${gvar(x.grade)}"></span>`).join('');
    const keys = E.GRADES.map(x => `<span class="${x.grade === g ? 'on' : ''}">${x.grade}</span>`).join('');
    const finFresh = c.fin && r.finAgeMonths <= 12;
    const sources = [
      c.fin ? `<span class="source"><span class="flag" style="background:${finFresh ? 'var(--good)' : 'var(--warn)'}"></span>Accounts FY${c.fin.periodEnd.slice(0, 4)} · ${r.finAgeMonths} months old</span>` : '',
      c.pay
        ? `<span class="source"><span class="flag" style="background:var(--good)"></span>Invoices ${fmtDate(c.pay.updated)} · ${c.pay.suppliers} suppliers</span>`
        : `<span class="source"><span class="flag" style="background:var(--faint)"></span>No invoice data yet</span>`,
      `<span class="source"><span class="flag" style="background:var(--good)"></span>Registers ${fmtDate(asOf)}</span>`,
    ].join('');
    const pd = r.inDefault
      ? `<div class="pd-big" style="--pdc:${gvar(g)}">Default</div><div class="pd-caption">${c.status === 'insolvency' ? 'Insolvency proceedings are open. File claims with the court.' : 'Company is bankrupt.'}</div>`
      : `<div class="pd-big" style="--pdc:${gvar(g)}">${pdNumber(r.pd)}<small>%</small></div>
         <div class="pd-caption">chance of default in the next 12 months${med != null ? `. Sector median ${fmtPd(med)}` : ''}.</div>`;
    return `<section class="panel cert" aria-label="Company and grade">
      <div>
        <div class="cert-top"><div class="label">${esc(c.sector.code)} · ${esc(c.sector.label)}</div></div>
        <h1 class="cert-name">${name}</h1>
        <div class="facts">
          <div><span class="label">Reg. no.</span><span class="v num">${c.ms}</span></div>
          <div><span class="label">VAT no.</span><span class="v num">${c.ds}</span></div>
          <div><span class="label">Seat</span><span class="v">${esc(c.city)}</span></div>
          <div><span class="label">Founded</span><span class="v">${c.founded}</span></div>
          <div><span class="label">Director</span><span class="v" title="${directors}">${directors}</span></div>
          <div><span class="label">Status</span><span class="v" style="color:${c.status === 'insolvency' ? 'var(--crit)' : 'var(--good)'}">${c.status === 'insolvency' ? 'Insolvency' : 'Active'}</span></div>
        </div>
        <div class="pd-block">${pd}</div>
        <div class="ribbon" aria-hidden="true"><div class="ribbon-bar">${ribbon}</div><div class="ribbon-keys">${keys}</div></div>
        <div class="sources">${sources}</div>
      </div>
      <div class="seal-wrap">
        ${seal(r)}
        <button class="toggle" type="button" data-watch="${c.id}" aria-pressed="${watched}">${watched ? ICON.check + 'Monitoring' : ICON.plus + 'Monitor'}</button>
      </div>
    </section>`;
  }

  // ---------- dossier: decision ----------
  function verdictHtml(c, r, exposure) {
    const rec = E.recommend(c, r, exposure);
    const tone = rec.verdict.code === 'approve' ? 'var(--good)' : rec.verdict.code === 'cover' ? 'var(--warn)' : 'var(--crit)';
    const icon = rec.verdict.code === 'approve' ? ICON.check : rec.verdict.code === 'cover' ? ICON.shield : ICON.cross;
    return `<div class="verdict"><span class="verdict-mark" style="background:${tone}">${icon}</span><span class="verdict-text">${rec.verdict.label}</span></div>`;
  }
  function figuresHtml(c, r, exposure) {
    const rec = E.recommend(c, r, exposure);
    const insure = rec.premiumRate == null ? '' : `<div class="insure">
        <span>Insure ${fmtEur(rec.exposure)} for about <b class="num">${fmtEur(rec.exposure * rec.premiumRate)}</b> a year</span>
        <button class="btn" type="button" data-quote="${c.id}">Get quotes</button>
      </div>`;
    return `<div class="figures">
        <div><span class="label">Recommended limit</span><span class="v">${fmtEur(rec.limit)}</span></div>
        <div><span class="label">Payment terms</span><span class="v">${rec.term.label}</span></div>
        <div><span class="label">Expected loss</span><span class="v">${fmtEur(rec.expectedLoss)}</span></div>
        <div><span class="label">Loss if they default</span><span class="v">${fmtEur(rec.exposure * E.LGD)}</span></div>
      </div>${insure}`;
  }
  function decisionPanel(c, r, exposure) {
    const rec = E.recommend(c, r, exposure);
    const max = Math.max(50000, rec.limit * 3, rec.exposure);
    return `<section class="panel decide" aria-label="Credit decision">
      <div class="sec-head" style="margin-bottom:0"><h2 class="sec-title">Credit decision</h2><span class="label">For your exposure</span></div>
      <div id="verdict" aria-live="polite">${verdictHtml(c, r, rec.exposure)}</div>
      <div class="field">
        <label class="label" for="exposure">Most they will owe you at once</label>
        <div class="money"><input id="exposure" type="number" min="0" step="1000" value="${rec.exposure}"><span>€</span></div>
        <input id="exposure-range" type="range" min="0" max="${max}" step="1000" value="${Math.min(rec.exposure, max)}" aria-label="Exposure slider">
      </div>
      <div id="figures">${figuresHtml(c, r, rec.exposure)}</div>
    </section>`;
  }

  // ---------- dossier: reasons ----------
  function describeValue(f, c) {
    switch (f.unit) {
      case 'pct': return fmtPct(f.value, 0);
      case 'x': return f.value.toFixed(1).replace('.', ',') + '×';
      case 'days': return `${f.key === 'dbtTrend' && f.value > 0 ? '+' : ''}${f.value.toFixed(0)} days`;
      case 'lndays': return `${c.events.blockedDays12m} days`;
      case 'flag': return f.value ? fmtEur(c.events.taxDebt) + ' owed' : 'not listed';
      case 'count': return String(f.value);
      case 'log10': return fmtEurShort(Math.pow(10, f.value));
      case 'lnyears': return `${Math.round(Math.exp(f.value) - 1)} years`;
      default: return String(f.value);
    }
  }
  function describeTypical(f) {
    switch (f.unit) {
      case 'pct': return fmtPct(f.typical, 0);
      case 'x': return f.typical.toFixed(1).replace('.', ',') + '×';
      case 'days': return `${f.typical} days`;
      case 'log10': return fmtEurShort(Math.pow(10, f.typical));
      case 'lnyears': return `${Math.round(Math.exp(f.typical) - 1)} years`;
      default: return null;
    }
  }
  function reasonsSection(c, r) {
    const head = `<div class="sec-head"><h2 class="sec-title">Why <i>this grade</i></h2><span class="label">Largest effect first</span></div>`;
    if (r.inDefault) {
      return `<section class="plain">${head}<div class="empty">The company is ${c.status === 'insolvency' ? 'in insolvency proceedings' : 'bankrupt'}. Creditors have three months from the notice on AJPES to file claims with the court.</div></section>`;
    }
    const top = r.contributions.filter(x => Math.abs(x.contribution) >= 0.03).slice(0, 7);
    const maxAbs = Math.max(0.5, ...top.map(x => Math.abs(x.contribution)));
    const rows = top.map(x => {
      const w = (Math.abs(x.contribution) / maxAbs) * 46;
      const up = x.contribution > 0;
      const typical = describeTypical(x);
      return `<div class="reason">
        <div><div class="reason-name">${esc(x.label)}</div><div class="reason-val"><b>${describeValue(x, c)}</b>${typical ? ` · typical ${typical}` : ''}</div></div>
        <div class="bar" title="${up ? 'Raises' : 'Lowers'} risk"><i class="${up ? 'up' : 'down'}" style="width:${w.toFixed(1)}%"></i></div>
      </div>`;
    }).join('');
    return `<section class="plain" aria-label="Reasons">${head}
      <div class="reasons">${rows || '<div class="muted">Close to a typical company on every factor.</div>'}</div>
      <div class="axis-keys"><div></div><div><span>← lowers risk</span><span>raises risk →</span></div></div>
    </section>`;
  }

  // ---------- dossier: payments ----------
  function smoothPath(pts) {
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function paymentsPanel(c) {
    const head = `<div class="sec-head"><h2 class="sec-title">How they <i>pay suppliers</i></h2><span class="label">Days past due, monthly</span></div>`;
    if (!c.pay) {
      return `<section class="panel" aria-label="Payment behaviour">${head}
        <div class="empty">None of this company's suppliers share invoices with Rok yet, so the grade rests on filings and registers.<br><br>
        <b>Do you supply them?</b> Connect your e-invoicing or accounting tool and your invoices to them appear here. Your Pro plan is then free. E-invoicing becomes mandatory for all B2B trade in Slovenia on 1 January 2028.</div>
      </section>`;
    }
    const dbt = c.pay.dbt;
    const W = 600, H = 210, L = 28, R = 38, T = 16, B = 26;
    const yMax = Math.max(20, Math.ceil(Math.max(...dbt) / 10) * 10);
    const x = i => L + (i * (W - L - R)) / (dbt.length - 1);
    const y = v => T + (1 - v / yMax) * (H - T - B);
    const pts = dbt.map((v, i) => [x(i), y(v)]);
    const line = smoothPath(pts);
    const area = `${line}L${x(dbt.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
    const endMonth = new Date(asOf).getMonth();
    const label = i => MONTHS[(endMonth - (dbt.length - 1 - i) + 24) % 12];
    const last = dbt[dbt.length - 1];
    const recent = avg(dbt.slice(-3)), earlier = avg(dbt.slice(0, 9));
    const delta = recent - earlier;
    const tone = recent > 20 || delta >= 10 ? 'var(--crit)' : recent > 8 || delta >= 4 ? 'var(--warn)' : 'var(--accent)';
    const grid = [yMax / 2, yMax].map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule)" stroke-dasharray="2 4"/><text class="tick" x="${L - 8}" y="${y(t) + 3.5}" text-anchor="end">${t}</text>`).join('');
    const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average days past due, last 12 months">
      <defs><linearGradient id="payfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tone}" stop-opacity="0.28"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--rule-strong)"/>
      <text class="note" x="${W - R + 6}" y="${y(0) + 3.5}">on time</text>
      <path d="${area}" fill="url(#payfill)"/>
      <path d="${line}" fill="none" stroke="${tone}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="${x(dbt.length - 1)}" cy="${y(last)}" r="7" fill="${tone}" opacity="0.18"/>
      <circle cx="${x(dbt.length - 1)}" cy="${y(last)}" r="3.6" fill="${tone}" stroke="var(--card)" stroke-width="1.5"/>
      <text class="note" x="${x(dbt.length - 1) + 10}" y="${y(last) - 8}" style="fill:${tone}">${last.toFixed(0)} d</text>
      ${dbt.map((_, i) => (i % 2 === 1 ? `<text class="tick" x="${x(i)}" y="${H - 6}" text-anchor="middle">${label(i)}</text>` : '')).join('')}
    </svg>`;
    return `<section class="panel" aria-label="Payment behaviour">${head}${svg}
      <div class="stats">
        <div><span class="label">Last 3 months</span><span class="v">${recent.toFixed(0)} days</span></div>
        <div><span class="label">Versus before</span><span class="v" style="color:${delta >= 4 ? tone : 'var(--ink)'}">${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(0)} days</span></div>
        <div><span class="label">Paid 30+ days late</span><span class="v">${fmtPct(c.pay.lateShare30)}</span></div>
      </div>
    </section>`;
  }

  // ---------- dossier: network ----------
  function networkPanel(c) {
    const statusColor = co => co.status === 'bankrupt' || co.status === 'insolvency' ? 'var(--crit)'
      : (co.events.blockedDays12m > 0 || co.events.taxDebt > 0) ? 'var(--warn)' : 'var(--good)';
    const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

    // Columns: other companies of the same people | people and owners | this company | subsidiaries
    const ring = [];
    const ownerShare = new Map(c.owners.filter(o => o.type === 'person').map(o => [o.id, o.share]));
    for (const pid of c.directors) ring.push({ kind: 'person', id: pid, rel: ownerShare.has(pid) ? `director · owns ${ownerShare.get(pid)} %` : 'director' });
    for (const o of c.owners) {
      if (o.type === 'person' && c.directors.includes(o.id)) continue;
      ring.push({ kind: o.type, id: o.id, rel: `owns ${o.share} %` });
    }
    const far = [];
    for (const n of ring) {
      if (n.kind !== 'person') continue;
      for (const v of c.net.viaDirector.filter(v => v.people.includes(n.id)).slice(0, 4)) far.push({ id: v.id, from: n });
    }
    const subs = (c.net.children || []).slice(0, 5);

    const W = 900, rowH = 46;
    const rows = Math.max(far.length, ring.length, subs.length, 1);
    const H = Math.max(170, rows * rowH + 50);
    const col = (n, i) => H / 2 + (i - (n - 1) / 2) * rowH;
    const X = { far: 210, ring: 350, center: 560, sub: 710 };

    const curve = (x1, y1, x2, y2) => {
      const mx = (x1 + x2) / 2;
      return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="var(--rule-strong)" stroke-width="1.2"/>`;
    };
    const chip = (co, x, y, align) => {
      const dead = co.status === 'bankrupt';
      const sub = dead ? `bankrupt ${co.closedYear}` : co.status === 'insolvency' ? 'insolvency' : results.get(co.id).grade.grade;
      const label = short(co.name, 20);
      const w = Math.round(label.length * 6.7 + sub.length * 6.4 + 40);
      const x0 = align === 'end' ? x - w : align === 'start' ? x : x - w / 2;
      return `<g class="co${dead ? ' dead' : ''}" ${dead ? 'role="img"' : `data-open="${co.id}" tabindex="0" role="link"`} aria-label="${esc(co.name)}">
        <rect class="chip" x="${x0}" y="${y - 13}" width="${w}" height="26" rx="13" fill="var(--card)" stroke="var(--rule-strong)"/>
        <circle cx="${x0 + 14}" cy="${y}" r="4" fill="${statusColor(co)}"/>
        <text x="${x0 + 25}" y="${y + 4}">${esc(label)} <tspan class="gsub" dx="4">${sub}</tspan></text>
      </g>`;
    };

    const ringPos = ring.map((n, i) => ({ ...n, x: X.ring, y: col(ring.length, i) }));
    const farPos = far.map((f, i) => ({ ...f, x: X.far, y: col(far.length, i), fromPos: ringPos.find(p => p.id === f.from.id) }));
    const subPos = subs.map((id, i) => ({ id, x: X.sub, y: col(subs.length, i) }));
    const cy = H / 2;

    const cname = short(c.name, 22);
    const cw = Math.round(cname.length * 7.4 + 36);
    let edges = '', nodes = '';
    for (const p of ringPos) edges += curve(p.x, p.y, X.center - cw / 2, cy);
    for (const f of farPos) edges += curve(f.x, f.y, f.fromPos.x, f.fromPos.y);
    for (const s of subPos) edges += curve(X.center + cw / 2, cy, s.x, s.y);
    for (const f of farPos) nodes += chip(byId.get(f.id), f.x, f.y, 'end');
    for (const p of ringPos) {
      if (p.kind === 'person') {
        nodes += `<g class="person"><circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--card)" stroke="var(--ink-2)" stroke-width="1.4"/>
          <text x="${p.x}" y="${p.y - 11}" text-anchor="middle">${esc(personById.get(p.id).name)}</text>
          <text class="gsub" x="${p.x}" y="${p.y + 20}" text-anchor="middle">${p.rel}</text></g>`;
      } else {
        nodes += chip(byId.get(p.id), p.x, p.y, 'middle');
      }
    }
    for (const s of subPos) nodes += chip(byId.get(s.id), s.x, s.y, 'start');
    nodes += `<g><rect x="${X.center - cw / 2}" y="${cy - 16}" width="${cw}" height="32" rx="16" fill="var(--ink)"/>
      <text x="${X.center}" y="${cy + 4.5}" text-anchor="middle" style="fill:var(--paper);font-weight:600">${esc(cname)}</text></g>`;

    const heads = `<text class="gsub" x="${X.far}" y="16" text-anchor="end">OTHER COMPANIES OF THE SAME PEOPLE</text>
      <text class="gsub" x="${X.ring}" y="16" text-anchor="middle">PEOPLE AND OWNERS</text>
      ${subs.length ? `<text class="gsub" x="${X.sub}" y="16">SUBSIDIARIES</text>` : ''}`;
    const svg = `<svg class="chart graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Directors, owners and linked companies" style="min-width:640px">${far.length ? heads : heads.replace(/<text[^>]*>OTHER[^<]*<\/text>/, '')}${edges}${nodes}</svg>`;

    const tags = [];
    if (c.net.directorBankruptcies) tags.push(`<span class="tag crit">${c.net.directorBankruptcies} past ${c.net.directorBankruptcies === 1 ? 'bankruptcy' : 'bankruptcies'} through directors</span>`);
    if (c.net.relatedDistress) tags.push(`<span class="tag warn">${c.net.relatedDistress} related ${c.net.relatedDistress === 1 ? 'company' : 'companies'} in distress</span>`);
    return `<section class="panel" aria-label="Network">
      <div class="sec-head"><h2 class="sec-title">People <i>and linked companies</i></h2><div class="tags">${tags.join('') || '<span class="tag good">No distress in the network</span>'}</div></div>
      <div class="table-wrap">${svg}</div>
      <div class="keys"><span><i style="background:var(--good)"></i>Clean</span><span><i style="background:var(--warn)"></i>Blocked account or tax debt</span><span><i style="background:var(--crit)"></i>Bankrupt or insolvent</span></div>
    </section>`;
  }

  // ---------- dossier: events + accounts ----------
  function eventsSection(c, r) {
    const ev = [];
    if (c.fin) {
      const fy = Number(c.fin.periodEnd.slice(0, 4));
      ev.push({ date: `${fy + 1}-03-${fy + 1 === 2026 ? 27 : 30}`, color: 'var(--info)', text: `FY${fy} annual report filed with AJPES` });
      if (r.finAgeMonths > 18) ev.push({ date: `${fy + 2}-03-31`, color: 'var(--warn)', text: `FY${fy + 1} annual report missed the 31 March deadline` });
    }
    for (const b of c.events.blockPeriods) {
      ev.push({ date: b.from, color: 'var(--crit)', text: `Bank account blocked for ${c.events.blockedDays12m} days` });
      if (new Date(b.to) < new Date(asOf)) ev.push({ date: b.to, color: 'var(--good)', text: 'Account block lifted' });
    }
    if (c.events.taxDebt) ev.push({ date: c.events.taxListed, color: 'var(--warn)', text: `Listed as FURS tax debtor, ${fmtEur(c.events.taxDebt)} overdue` });
    if (c.status === 'insolvency') ev.push({ date: asOf, color: 'var(--crit)', text: 'Insolvency proceedings open' });
    if (c.pay) {
      const recent = avg(c.pay.dbt.slice(-3)), earlier = avg(c.pay.dbt.slice(0, 9));
      if (recent - earlier >= 10) ev.push({ date: c.pay.updated, color: 'var(--warn)', text: `Payment delays rose from ${earlier.toFixed(0)} to ${recent.toFixed(0)} days` });
    }
    ev.push({ date: `${c.founded}-01-01`, color: 'var(--faint)', text: `Registered as ${c.form}`, yearOnly: true });
    ev.sort((a, b) => b.date.localeCompare(a.date));
    return `<section class="plain" aria-label="Events">
      <div class="sec-head"><h2 class="sec-title">Events</h2><span class="label">Newest first</span></div>
      <ul class="timeline">${ev.map(e => `<li><time>${e.yearOnly ? e.date.slice(0, 4) : fmtDate(e.date)}</time><span class="node" style="background:${e.color}"></span><span>${esc(e.text)}</span></li>`).join('')}</ul>
    </section>`;
  }

  function accountsSection(c) {
    if (!c.fin) return '';
    const a = c.finPrev, b = c.fin;
    const rows = [
      ['Revenue', a.revenue, b.revenue],
      ['EBITDA', a.ebitda, b.ebitda],
      ['Operating profit (EBIT)', a.ebit, b.ebit],
      ['Total assets', a.assets, b.assets],
      ['Equity', a.equity, b.equity],
      ['Financial debt', a.debt, b.debt, true],
    ];
    const change = (x, y, inverse) => {
      if (!x) return '<td class="num">–</td>';
      const ch = y / x - 1;
      const good = inverse ? ch < 0 : ch > 0;
      return `<td class="num ${Math.abs(ch) < 0.005 ? '' : good ? 'pos' : 'neg'}">${ch > 0 ? '+' : ch < 0 ? '−' : ''}${Math.abs(ch * 100).toFixed(0)} %</td>`;
    };
    const ratio = (f, fn) => fn(f).toFixed(2).replace('.', ',');
    return `<section class="plain" aria-label="Annual accounts">
      <div class="sec-head"><h2 class="sec-title">Annual <i>accounts</i></h2><span class="label">AJPES · EUR</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>FY${a.periodEnd.slice(0, 4)}</th><th>FY${b.periodEnd.slice(0, 4)}</th><th>Change</th></tr></thead>
        <tbody>
          ${rows.map(([k, x, y, inv]) => `<tr><td>${k}</td><td class="num">${int.format(x)}</td><td class="num">${int.format(y)}</td>${change(x, y, inv)}</tr>`).join('')}
          <tr><td>Current ratio</td><td class="num">${ratio(a, f => f.currentAssets / f.currentLiabilities)}</td><td class="num">${ratio(b, f => f.currentAssets / f.currentLiabilities)}</td><td></td></tr>
          <tr><td>Equity ratio</td><td class="num">${fmtPct(a.equity / a.assets)}</td><td class="num">${fmtPct(b.equity / b.assets)}</td><td></td></tr>
          <tr><td>Employees</td><td class="num">–</td><td class="num">${c.employees}</td><td></td></tr>
        </tbody>
      </table></div>
    </section>`;
  }

  function renderDossier(id, keepExposure) {
    const c = byId.get(id);
    if (!c) return;
    state.current = id;
    const r = results.get(id);
    const exposure = keepExposure != null ? keepExposure : watch[id] != null ? watch[id] : null;
    $('#dossier').innerHTML = `
      ${certificate(c, r)}
      <div class="row-2">${decisionPanel(c, r, exposure)}${reasonsSection(c, r)}</div>
      <div class="row-2b">${paymentsPanel(c)}${eventsSection(c, r)}</div>
      ${networkPanel(c)}
      ${accountsSection(c)}`;
    document.querySelectorAll('#results button[data-open]').forEach(b => b.setAttribute('aria-current', String(b.dataset.open === id)));
  }

  function updateDecision(value, source) {
    const c = byId.get(state.current);
    const r = results.get(c.id);
    $('#verdict').innerHTML = verdictHtml(c, r, value);
    $('#figures').innerHTML = figuresHtml(c, r, value);
    const other = document.getElementById(source === 'exposure' ? 'exposure-range' : 'exposure');
    if (other) other.value = value;
    if (watch[c.id] != null) { watch[c.id] = value; store.set('rok.watch', watch); }
  }

  // ---------- portfolio ----------
  function renderPortfolio() {
    const rows = Object.entries(watch).map(([id, exposure]) => {
      const c = byId.get(id), r = results.get(id);
      return { c, r, exposure, rec: E.recommend(c, r, exposure), alerts: alertCache.get(id) };
    });
    const total = rows.reduce((s, x) => s + x.exposure, 0);
    const el = rows.reduce((s, x) => s + x.rec.expectedLoss, 0);
    const wpd = total ? rows.reduce((s, x) => s + x.exposure * x.r.pd, 0) / total : 0;
    const over = rows.filter(x => x.exposure > x.rec.limit);
    const order = ['crit', 'warn', 'info'];
    const allAlerts = rows.flatMap(x => x.alerts.map(a => ({ ...a, c: x.c }))).sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
    rows.sort((a, b) => b.rec.expectedLoss - a.rec.expectedLoss);

    $('#view-portfolio').innerHTML = `
      <div class="page-head"><div class="label">Portfolio</div><h1 class="page-title">Your <i>customers</i></h1>
        <p class="lede">Each company you monitor is re-scored when a register, a filing or an invoice changes. Exposure is the most a customer can owe you at once. Change it on the company page.</p></div>
      <div class="strip">
        <div><span class="label">Total exposure</span><span class="v">${fmtEurShort(total)}</span><span class="sub">${rows.length} companies monitored</span></div>
        <div><span class="label">Expected loss, 12 months</span><span class="v">${fmtEurShort(el)}</span><span class="sub">${total ? fmtPct(el / total, 2) : '–'} of exposure</span></div>
        <div><span class="label">Default probability</span><span class="v">${fmtPd(wpd)}</span><span class="sub">Weighted by exposure</span></div>
        <div><span class="label">Over their limit</span><span class="v" style="color:${over.length ? 'var(--crit)' : 'var(--good)'}">${over.length}</span><span class="sub">${fmtEurShort(over.reduce((s, x) => s + x.exposure - x.rec.limit, 0))} above recommended limits</span></div>
      </div>
      <div class="row-2b">
        <section class="panel"><div class="sec-head"><h2 class="sec-title">Monitored <i>companies</i></h2><span class="label">Largest expected loss first</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Company</th><th>Grade</th><th>PD</th><th>Exposure</th><th>Limit</th><th>Exp. loss</th></tr></thead>
            <tbody>${rows.map(x => `<tr class="go" data-open="${x.c.id}" tabindex="0">
              <td>${esc(x.c.name)}</td><td>${gradeChip(x.r)}</td><td class="num">${fmtPd(x.r.pd)}</td>
              <td class="num" style="${x.exposure > x.rec.limit ? 'color:var(--crit)' : ''}">${fmtEur(x.exposure)}</td>
              <td class="num">${fmtEur(x.rec.limit)}</td><td class="num">${fmtEur(x.rec.expectedLoss)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>
        <section class="plain"><div class="sec-head"><h2 class="sec-title">Alerts</h2><span class="label">${allAlerts.length} open</span></div>
          <ul class="alerts">${allAlerts.map(a => `<li><button data-open="${a.c.id}"><span class="flag" style="background:${levelColor[a.level]}"></span>
            <span><span class="a-co">${esc(a.c.name)}</span><br><span class="a-msg">${esc(a.text)}</span></span><span class="a-lvl" style="color:${levelColor[a.level]}">${levelWord[a.level]}</span></button></li>`).join('') || '<li class="empty">No alerts on your customers.</li>'}</ul>
          <p class="fine">Alerts go out by email, Slack or Teams, and as webhooks into your ERP.</p>
        </section>
      </div>`;
  }

  // ---------- model ----------
  let modelHtml = null;
  function renderModel() {
    if (modelHtml) { $('#view-model').innerHTML = modelHtml; return; }
    const full = [], filings = [], y = [], scored = [];
    for (const seed of [101, 102, 103, 104, 105, 106]) {
      const d = window.RokData.generate(seed, 600);
      E.attachNetwork(d.companies);
      for (const c of d.companies) {
        if (c.status !== 'active') continue;
        const rf = E.score(c, { asOf: d.asOf });
        full.push(rf.pd); scored.push(rf);
        filings.push(E.score(c, { asOf: d.asOf, model: 'filings' }).pd);
        y.push(c.outcome12m);
      }
    }
    const aucF = E.auc(full, y), aucO = E.auc(filings, y);
    const defaults = y.filter(Boolean).length;
    const cal = E.calibration(scored, y);
    const capture = pds => {
      const idx = pds.map((p, i) => i).sort((a, b) => pds[b] - pds[a]).slice(0, Math.round(pds.length * 0.1));
      return idx.filter(i => y[i]).length / defaults;
    };
    const roc = pds => {
      const idx = pds.map((p, i) => i).sort((a, b) => pds[b] - pds[a]);
      const P = defaults, Nn = y.length - P;
      let tp = 0, fp = 0;
      const pts = [[0, 0]];
      for (const i of idx) { if (y[i]) tp++; else fp++; pts.push([fp / Nn, tp / P]); }
      return pts.filter((p, i) => i % 6 === 0 || i === pts.length - 1);
    };
    const S = 300, M = 36;
    const px = v => M + v * (S - M - 12), py = v => S - M - v * (S - M - 12);
    const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join('');
    const fullPts = roc(full);
    const rocSvg = `<svg class="chart" viewBox="0 0 ${S} ${S}" style="max-width:380px" role="img" aria-label="ROC curves for both models">
      <defs><linearGradient id="rocfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0.2"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${[0.5, 1].map(t => `<line x1="${px(0)}" x2="${px(1)}" y1="${py(t)}" y2="${py(t)}" stroke="var(--rule)" stroke-dasharray="2 4"/>`).join('')}
      ${[0, 0.5, 1].map(t => `<text class="tick" x="${px(0) - 8}" y="${py(t) + 3.5}" text-anchor="end">${t}</text><text class="tick" x="${px(t)}" y="${S - M + 16}" text-anchor="middle">${t}</text>`).join('')}
      <line x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(0)}" stroke="var(--rule-strong)"/>
      <line x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(1)}" stroke="var(--faint)" stroke-dasharray="3 4"/>
      <path d="${path(fullPts)}L${px(1)},${py(0)}Z" fill="url(#rocfill)"/>
      <path d="${path(roc(filings))}" fill="none" stroke="var(--faint)" stroke-width="1.6"/>
      <path d="${path(fullPts)}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>
      <text class="note" x="${px(0.5)}" y="${S - 4}" text-anchor="middle">Share of healthy companies flagged</text>
      <text class="note" x="12" y="${py(0.5)}" text-anchor="middle" transform="rotate(-90 12 ${py(0.5)})">Share of defaults caught</text>
    </svg>`;
    const maxRate = Math.max(...cal.filter(g => g.n).map(g => Math.max(g.predicted, g.observed)));
    const weightRows = E.FEATURES.map(f => {
      const w = E.MODELS.full.weights[f.key], wo = E.MODELS.filings.weights[f.key];
      const fmt = v => (v == null ? '<span class="muted">not used</span>' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(3));
      return `<tr><td>${esc(f.label)}</td><td class="muted">${f.group}</td><td class="num">${fmt(w)}</td><td class="num">${fmt(wo)}</td></tr>`;
    }).join('');

    modelHtml = `
      <div class="page-head"><div class="label">Model card · published every quarter</div><h1 class="page-title">How good is <i>the score?</i></h1>
        <p class="lede">Registry-based scores in Slovenia don't publish how often they are right. Rok does. Here Rok's model is tested against a model that only sees annual accounts and company age, the inputs registry-only scores rely on. Both are tested on ${int.format(y.length)} companies they were not trained on, and ${defaults} of those defaulted within 12 months.</p></div>
      <div class="versus">
        <div class="panel"><span class="label">Rok · AUC</span><span class="v accent">${aucF.toFixed(3)}</span><span class="sub">Gini ${(2 * aucF - 1).toFixed(2)}</span></div>
        <div class="panel"><span class="label">Annual accounts only · AUC</span><span class="v">${aucO.toFixed(3)}</span><span class="sub">Gini ${(2 * aucO - 1).toFixed(2)}</span></div>
        <div class="panel"><span class="label">Defaults in the riskiest 10 %</span><span class="v">${fmtPct(capture(full))}</span><span class="sub">versus ${fmtPct(capture(filings))} with accounts only</span></div>
      </div>
      <div class="row-2">
        <section class="panel"><div class="sec-head"><h2 class="sec-title">Ranking <i>power</i></h2><span class="label">ROC curve</span></div>
          ${rocSvg}
          <div class="keys"><span><i style="background:var(--accent)"></i>Rok</span><span><i style="background:var(--faint)"></i>Annual accounts only</span></div>
          <p class="fine">A curve closer to the top-left corner catches more defaults for the same number of false alarms.</p>
        </section>
        <section class="plain"><div class="sec-head"><h2 class="sec-title">Calibration</h2><span class="label">Predicted against actual</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Grade</th><th>Companies</th><th>Predicted</th><th>Actual</th><th></th></tr></thead>
            <tbody>${cal.filter(g => g.n).map(g => `<tr><td><span class="grade" style="--g:${gvar(g.grade)}">${g.grade}</span></td><td class="num">${int.format(g.n)}</td><td class="num">${fmtPd(g.predicted)}</td><td class="num">${fmtPd(g.observed)}</td>
              <td><span class="cal-bars"><i style="width:${(g.predicted / maxRate) * 100}%;background:var(--faint)"></i><i style="width:${Math.max(1, (g.observed / maxRate) * 100)}%;background:${gvar(g.grade)}"></i></span></td></tr>`).join('')}</tbody>
          </table></div>
          <p class="fine">Grey bars show the predicted rate, coloured bars what actually happened. When they match, a 4 % PD means about 4 defaults in every 100 companies, so you can price and provision on it directly.</p>
        </section>
      </div>
      <section class="plain" style="margin-top:28px"><div class="sec-head"><h2 class="sec-title">Every weight, <i>in the open</i></h2><span class="label">Log-odds per unit above typical</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Factor</th><th>Source</th><th>Rok</th><th>Accounts only</th></tr></thead>
          <tbody>${weightRows}</tbody>
        </table></div>
        <p class="fine">Fitted by sign-constrained logistic regression (scripts/fit.js). Each factor may only push risk in its declared direction; one that comes out the wrong way is dropped. Annual-account weights fade as the accounts age, to 40 % after three years.</p>
      </section>
      <p class="caveat"><b>About this demo.</b> The companies, people and defaults here are simulated, so these figures show how the method works. They are not a real-world result. In production the same back-test runs on real AJPES defaults and insolvency notices, is re-published every quarter and is checked by an outside validator.</p>`;
    $('#view-model').innerHTML = modelHtml;
  }

  // ---------- pricing ----------
  function renderPricing() {
    $('#view-pricing').innerHTML = `
      <div class="page-head"><div class="label">Proposed pricing · monthly · cancel any time</div><h1 class="page-title">Pay for what <i>you check</i></h1>
        <p class="lede">No sales call and no 12-month contract. Share your invoices and Pro is free, because your data makes every score better.</p></div>
      <div class="tiers">
        <section class="panel tier"><div class="tier-name">Free</div><div class="tier-price">0 €</div><div class="for">For a quick look before a first order.</div>
          <ul><li>Search every Slovenian company</li><li>Grade and alerts on 3 dossiers a month</li><li>Blocked-account and FURS checks</li></ul></section>
        <section class="panel tier hero"><div class="tier-name">Pro</div><div class="tier-price">29 €<small>/ month</small></div><div class="for">For owners and credit controllers.</div>
          <ul><li>Unlimited dossiers with reasons</li><li>Monitor 100 companies</li><li>Credit limits and payment terms</li><li>Payment behaviour from invoices</li><li>Email alerts</li></ul>
          <div class="coop"><b>Free</b> when you connect your e-invoicing or accounting tool.</div></section>
        <section class="panel tier"><div class="tier-name">Team</div><div class="tier-price">119 €<small>/ month</small></div><div class="for">For finance teams with a customer book.</div>
          <ul><li>5 seats, 1,000 monitored companies</li><li>API, webhooks, Slack and Teams</li><li>ERP plugins</li><li>Bulk portfolio re-score</li></ul></section>
        <section class="panel tier"><div class="tier-name">Single report</div><div class="tier-price">3,90 €<small>/ dossier</small></div><div class="for">For a tender or a one-off deal.</div>
          <ul><li>Card payment, no account needed</li><li>Full dossier as PDF</li></ul></section>
      </div>
      <section class="plain" style="margin-top:36px"><div class="sec-head"><h2 class="sec-title">Against <i>the market</i></h2><span class="label">Public information, September 2026</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th></th><th>Rok</th><th>AJPES eS.BON</th><th>D&amp;B (Bisnode)</th><th>EBONITETE.SI</th></tr></thead>
          <tbody>
            <tr><td>One company report</td><td class="num">3,90 €</td><td class="num">45,90 €</td><td class="wrap">20 € subscribers, 40 € others</td><td class="wrap">Subscription only</td></tr>
            <tr><td>Prices on the website</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="wrap">Report prices</td><td class="no">On request</td></tr>
            <tr><td>Minimum contract</td><td>None</td><td>None</td><td class="wrap">Annual access for the lower price</td><td class="wrap">12 months</td></tr>
            <tr><td>Live payment behaviour</td><td class="yes">Weekly, from invoices</td><td class="no">No</td><td class="wrap">Not advertised</td><td class="wrap">"Payment habits", source not stated</td></tr>
            <tr><td>Published back-test</td><td class="yes">Quarterly</td><td class="wrap">Methodology only</td><td class="wrap">Methodology only</td><td class="wrap">Not advertised</td></tr>
            <tr><td>Credit limit, terms, insurance price</td><td class="yes">Every dossier</td><td class="no">No</td><td class="wrap">Not advertised in Slovenia</td><td class="wrap">Not advertised</td></tr>
          </tbody>
        </table></div>
        <p class="fine">Competitor figures come from public price lists and product pages. "Not advertised" means we found no public claim, not that the feature is missing.</p>
      </section>`;
  }

  // ---------- routing ----------
  const VIEWS = ['companies', 'portfolio', 'model', 'pricing'];
  function route() {
    const h = (location.hash || '').slice(1);
    let view = VIEWS.includes(h) ? h : 'companies';
    if (/^c\d{4}$/.test(h) && byId.has(h)) { view = 'companies'; if (state.current !== h) renderDossier(h); }
    for (const v of VIEWS) document.getElementById(`view-${v}`).hidden = v !== view;
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === view ? 'page' : 'false'));
    if (view === 'portfolio') renderPortfolio();
    if (view === 'model') renderModel();
    if (view === 'pricing') renderPricing();
    if (view === 'companies') renderResults();
  }
  function open(id) {
    if (!id || !byId.has(id)) return;
    if (location.hash === `#${id}`) route(); else location.hash = id;
    window.scrollTo({ top: 0 });
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o && o.dataset.open) { e.preventDefault(); open(o.dataset.open); return; }
    const f = e.target.closest('[data-filter]');
    if (f) {
      state.filter = f.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === f)));
      renderResults();
      return;
    }
    const w = e.target.closest('[data-watch]');
    if (w) {
      const id = w.dataset.watch;
      const input = document.getElementById('exposure');
      const current = input ? Number(input.value) || 0 : 0;
      if (watch[id] != null) delete watch[id];
      else watch[id] = current;
      store.set('rok.watch', watch);
      renderDossier(id, current);
      renderResults();
      return;
    }
    const q = e.target.closest('[data-quote]');
    if (q) { q.textContent = 'Requested from 3 insurers'; q.disabled = true; }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const o = e.target.closest && e.target.closest('[data-open]');
    if (o && o.dataset.open) open(o.dataset.open);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'search') { state.query = e.target.value.trim(); renderResults(); }
    if (e.target.id === 'exposure' || e.target.id === 'exposure-range') updateDecision(Math.max(0, Number(e.target.value) || 0), e.target.id);
  });
  window.addEventListener('hashchange', route);

  // ---------- boot ----------
  $('#brand-mark').innerHTML = MARK.map(d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.9"/>`).join('');
  watch = store.get('rok.watch', null);
  if (!watch || typeof watch !== 'object' || Object.keys(watch).some(id => !byId.has(id))) watch = defaultWatchlist();
  const firstAlerting = Object.keys(watch).find(id => alertCache.get(id).some(a => a.level === 'warn' || a.level === 'crit') && byId.get(id).status === 'active' && byId.get(id).pay);
  renderDossier(firstAlerting || Object.keys(watch)[0]);
  route();
})();
