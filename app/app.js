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
  const fmtPd = pd => {
    if (pd >= 1) return 'In default';
    const p = pd * 100;
    return (p < 1 ? p.toFixed(2) : p < 10 ? p.toFixed(1) : p.toFixed(0)).replace('.', ',') + ' %';
  };
  const fmtPct = (v, d = 0) => (v * 100).toFixed(d).replace('.', ',') + ' %';
  const fmtDate = iso => { const [y, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${y}`; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  const gradePill = r => `<span class="pill t-${r.grade.tone}">${r.grade.grade}</span>`;

  // ---------- storage (per-viewer convenience only) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } },
  };

  // Default watchlist: a spread of customers across the grade scale.
  function defaultWatchlist() {
    const sorted = live.filter(c => c.form !== 's.p.').sort((a, b) => results.get(a.id).pd - results.get(b.id).pd);
    const picks = {};
    const step = Math.floor(sorted.length / 14);
    for (let i = 0; i < 14; i++) {
      const c = sorted[Math.min(sorted.length - 1, i * step + 3)];
      picks[c.id] = Math.max(5000, Math.round((c.fin.revenue / 60) / 1000) * 1000);
    }
    const alerting = live.filter(c => alertsFor(c).some(a => a.level === 'crit') && c.fin).slice(0, 3);
    for (const c of alerting) picks[c.id] = Math.max(5000, Math.round((c.fin.revenue / 80) / 1000) * 1000);
    return picks;
  }
  let watch = null;

  // ---------- alerts ----------
  function alertsFor(c) {
    const out = [];
    const r = results.get(c.id);
    if (c.status === 'insolvency') out.push({ level: 'crit', text: 'Insolvency proceedings open' });
    for (const b of c.events.blockPeriods) {
      if (daysBetween(b.to, asOf) <= 60) {
        const current = new Date(b.to) >= new Date(asOf);
        out.push({ level: 'crit', text: current ? `Bank account blocked since ${fmtDate(b.from)}` : `Bank account was blocked ${c.events.blockedDays12m} days, until ${fmtDate(b.to)}` });
      }
    }
    if (c.events.taxDebt > 0) out.push({ level: 'warn', text: `On FURS tax-debtor list: ${fmtEur(c.events.taxDebt)}` });
    if (c.pay) {
      const recent = avg(c.pay.dbt.slice(-3)), earlier = avg(c.pay.dbt.slice(0, 9));
      if (recent - earlier >= 10) out.push({ level: 'warn', text: `Paying ${Math.round(recent - earlier)} days later than earlier this year` });
    }
    if (c.fin && r.finAgeMonths > 18) out.push({ level: 'info', text: `FY${Number(c.fin.periodEnd.slice(0, 4)) + 1} annual report not filed (deadline 31 Mar)` });
    if (c.net && c.net.directorBankruptcies > 0) out.push({ level: 'info', text: `Director linked to ${c.net.directorBankruptcies} bankrupt ${c.net.directorBankruptcies === 1 ? 'company' : 'companies'}` });
    return out;
  }
  const levelTone = { crit: 'crit', warn: 'warn', info: 'fair' };
  const alertCache = new Map(live.map(c => [c.id, alertsFor(c)]));

  // ---------- sector medians ----------
  const sectorMedian = new Map();
  {
    const bySector = new Map();
    for (const c of live) {
      if (c.status !== 'active') continue;
      const k = c.sector.code;
      if (!bySector.has(k)) bySector.set(k, []);
      bySector.get(k).push(results.get(c.id).pd);
    }
    for (const [k, arr] of bySector) {
      arr.sort((a, b) => a - b);
      sectorMedian.set(k, arr[Math.floor(arr.length / 2)]);
    }
  }

  // ---------- finder ----------
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
      const r = results.get(c.id);
      const al = alertCache.get(c.id).filter(a => a.level !== 'info');
      const dot = al.length ? `<span class="dot bg-${levelTone[al[0].level]}" title="${esc(al[0].text)}"></span>` : '';
      return `<li><button data-open="${c.id}" aria-current="${c.id === state.current}">
        <span class="r-name">${esc(c.name)}</span>
        <span class="r-grade">${dot}${gradePill(r)}</span>
        <span class="r-meta">${esc(c.city)} · ${esc(c.sector.label)}</span>
      </button></li>`;
    }).join('') || '<li class="empty" style="margin:8px">No companies match. Try a town, a registration number or part of the name.</li>';
    $('#results-foot').textContent = list.length > shown.length
      ? `Showing ${shown.length} of ${int.format(list.length)}. Refine the search to narrow down.`
      : `${int.format(list.length)} ${list.length === 1 ? 'company' : 'companies'}`;
  }

  // ---------- dossier ----------
  const TONE_ORDER = E.GRADES.map(g => g.grade);

  function describeValue(f, c) {
    switch (f.unit) {
      case 'pct': return fmtPct(f.value, 0);
      case 'x': return f.value.toFixed(1).replace('.', ',') + '×';
      case 'days': return `${f.key === 'dbtTrend' && f.value > 0 ? '+' : ''}${f.value.toFixed(0)} days`;
      case 'lndays': return `${c.events.blockedDays12m} days`;
      case 'flag': return f.value ? fmtEur(c.events.taxDebt) : 'no';
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

  function scoreCard(c, r) {
    const med = sectorMedian.get(c.sector.code);
    const scale = E.GRADES.map(g => `<span class="t-${g.tone}${g.grade === r.grade.grade ? ' on' : ''}">${g.grade}</span>`).join('');
    const finLine = c.fin
      ? `<div>Annual accounts <b>FY${c.fin.periodEnd.slice(0, 4)}</b>, ${r.finAgeMonths} months old${r.finWeight < 1 ? `, weighted down to ${Math.round(r.finWeight * 100)} %` : ''}</div>`
      : '';
    const payLine = c.pay
      ? `<div>Payment data <b>${fmtDate(c.pay.updated)}</b> from ${c.pay.suppliers} suppliers, ${int.format(c.pay.invoices)} invoices</div>`
      : `<div>No invoice data yet. Score relies on filings and registers.</div>`;
    return `<section class="card" aria-label="Score">
      <div class="card-head"><h2>12-month default probability</h2><span class="eyebrow">Rok grade</span></div>
      <div class="score">
        <div class="grade-big t-${r.grade.tone}">${r.grade.grade}</div>
        <div>
          <div class="pd-line">${fmtPd(r.pd)}${r.inDefault ? '' : '<small>chance of default within 12 months</small>'}</div>
          ${med != null && !r.inDefault ? `<div class="muted" style="margin-top:4px">Sector median ${fmtPd(med)} · ${esc(c.sector.code)} ${esc(c.sector.label)}</div>` : ''}
          <div class="scale" aria-hidden="true">${scale}</div>
        </div>
      </div>
      <div class="fresh">${finLine}${payLine}<div>Registers checked <b>${fmtDate(asOf)}</b>: blocked accounts, FURS debtors, insolvency</div></div>
    </section>`;
  }

  function decisionOut(c, r, exposure) {
    const rec = E.recommend(c, r, exposure);
    const tone = rec.verdict.code === 'approve' ? 'good' : rec.verdict.code === 'cover' ? 'warn' : 'crit';
    const cover = rec.premiumRate == null ? '' : `<div class="cover">
        <span>Credit insurance on ${fmtEur(rec.exposure)}: about <b class="num">${fmtEur(rec.exposure * rec.premiumRate)}</b> a year (${fmtPct(rec.premiumRate, 2)})</span>
        <button class="btn" type="button" data-quote="${c.id}">Get quotes</button>
      </div>`;
    return `<div class="verdict"><span class="dot bg-${tone}"></span>${rec.verdict.label}</div>
      <div class="kv">
        <div><span class="eyebrow">Recommended limit</span><span class="v">${fmtEur(rec.limit)}</span></div>
        <div><span class="eyebrow">Payment terms</span><span class="v">${rec.term.label}</span></div>
        <div><span class="eyebrow">Expected loss</span><span class="v">${fmtEur(rec.expectedLoss)}</span></div>
        <div><span class="eyebrow">Loss if they default</span><span class="v">${fmtEur(rec.exposure * E.LGD)}</span></div>
      </div>
      ${cover}`;
  }

  function decisionCard(c, r, exposure) {
    const rec = E.recommend(c, r, exposure);
    const max = Math.max(50000, rec.limit * 3, rec.exposure);
    return `<section class="card decision" aria-label="Credit decision">
      <div class="card-head" style="margin-bottom:0"><h2>Credit decision</h2><span class="eyebrow">For your exposure</span></div>
      <div class="exposure">
        <label for="exposure">Planned exposure (open invoices at peak), EUR</label>
        <div class="exposure-row">
          <input id="exposure" type="number" min="0" step="1000" value="${rec.exposure}">
          <input id="exposure-range" type="range" min="0" max="${max}" step="1000" value="${Math.min(rec.exposure, max)}" aria-label="Planned exposure">
        </div>
      </div>
      <div class="decision" id="decision-out" aria-live="polite">${decisionOut(c, r, rec.exposure)}</div>
    </section>`;
  }

  function reasonsCard(c, r) {
    if (r.inDefault) {
      return `<section class="card"><div class="card-head"><h2>Why this grade</h2></div>
        <div class="empty">The company is ${c.status === 'insolvency' ? 'in insolvency proceedings' : 'bankrupt'}. Claims must be filed with the court within three months of the notice on AJPES.</div></section>`;
    }
    const top = r.contributions.filter(x => Math.abs(x.contribution) >= 0.03).slice(0, 7);
    const maxAbs = Math.max(0.5, ...top.map(x => Math.abs(x.contribution)));
    const rows = top.map(x => {
      const w = Math.abs(x.contribution) / maxAbs * 50;
      const up = x.contribution > 0;
      const typical = describeTypical(x);
      return `<div class="reason">
        <div class="reason-label">${esc(x.label)}<span class="muted">${describeValue(x, c)}${typical ? ` · typical ${typical}` : ''}</span></div>
        <div class="reason-bar" title="${up ? 'Raises' : 'Lowers'} risk"><i class="bg-${up ? 'crit' : 'good'}" style="${up ? `left:50%` : `right:50%`};width:${w.toFixed(1)}%"></i></div>
      </div>`;
    }).join('');
    return `<section class="card" aria-label="Reasons">
      <div class="card-head"><h2>Why this grade</h2><span class="eyebrow">Largest effects first</span></div>
      <div class="reasons">${rows || '<div class="muted">Close to a typical company on every factor.</div>'}</div>
      <div class="legend"><span><i class="bg-good"></i>Lowers risk</span><span><i class="bg-crit"></i>Raises risk</span></div>
    </section>`;
  }

  function paymentsCard(c) {
    if (!c.pay) {
      return `<section class="card" aria-label="Payment behaviour">
        <div class="card-head"><h2>How they pay suppliers</h2></div>
        <div class="empty">None of this company's suppliers share invoice data with Rok yet. Once e-invoicing becomes mandatory for B2B on 1 January 2028, every e-SLOG invoice a supplier connects adds to this view.<br><br>
        <b>Supplying them?</b> Connect your e-invoicing or accounting tool and your invoices to them fill this chart. Your Pro plan is then free.</div>
      </section>`;
    }
    const dbt = c.pay.dbt;
    const W = 560, H = 190, L = 34, R = 12, T = 12, B = 26;
    const yMax = Math.max(20, Math.ceil(Math.max(...dbt) / 10) * 10);
    const x = i => L + (i * (W - L - R)) / (dbt.length - 1);
    const y = v => T + (1 - v / yMax) * (H - T - B);
    const endMonth = new Date(asOf).getMonth();
    const label = i => MONTHS[(endMonth - (dbt.length - 1 - i) + 24) % 12];
    const ticks = [0, yMax / 2, yMax];
    const line = dbt.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(dbt.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
    const last = dbt[dbt.length - 1];
    const recent = avg(dbt.slice(-3)), earlier = avg(dbt.slice(0, 9));
    const delta = recent - earlier;
    const tone = recent > 20 || delta >= 10 ? 'crit' : recent > 8 || delta >= 4 ? 'warn' : 'good';
    const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average days beyond payment terms, last 12 months">
      ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
      <path d="${area}" fill="var(--${tone})" opacity="0.12"/>
      <path d="${line}" fill="none" stroke="var(--${tone})" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${x(dbt.length - 1)}" cy="${y(last)}" r="4" fill="var(--${tone})"/>
      ${dbt.map((_, i) => (i % 2 === 1 || i === dbt.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${label(i)}</text>` : '').join('')}
    </svg>`;
    return `<section class="card" aria-label="Payment behaviour">
      <div class="card-head"><h2>How they pay suppliers</h2><span class="eyebrow">Days beyond terms, monthly</span></div>
      ${svg}
      <div class="stat-row">
        <div><span class="eyebrow">Last 3 months</span><span class="v">${recent.toFixed(0)} days</span></div>
        <div><span class="eyebrow">Change</span><span class="v" style="color:var(--${tone})">${delta >= 0 ? '+' : ''}${delta.toFixed(0)} days</span></div>
        <div><span class="eyebrow">Paid 30+ days late</span><span class="v">${fmtPct(c.pay.lateShare30)}</span></div>
      </div>
    </section>`;
  }

  function networkCard(c) {
    const W = 760, H = 340, cx = W / 2, cy = H / 2;
    const nodes = [], edges = [];
    const ring1 = [];
    for (const pid of c.directors) ring1.push({ kind: 'person', id: pid, rel: 'director' });
    for (const o of c.owners) {
      if (o.type === 'person' && c.directors.includes(o.id)) continue;
      ring1.push({ kind: o.type, id: o.id, rel: `owns ${o.share} %` });
    }
    for (const id of (c.net.children || []).slice(0, 3)) ring1.push({ kind: 'company', id, rel: 'subsidiary' });

    const statusTone = co => co.status === 'bankrupt' || co.status === 'insolvency' ? 'crit'
      : (co.events.blockedDays12m > 0 || co.events.taxDebt > 0) ? 'warn' : 'good';
    const coLabel = co => co.name.length > 22 ? co.name.slice(0, 21) + '…' : co.name;
    const n1 = ring1.length;
    ring1.forEach((n, i) => {
      const a = -Math.PI / 2 + (i + 0.5) * (2 * Math.PI / Math.max(n1, 1)) + (n1 === 1 ? Math.PI / 2 : 0);
      n.x = cx + Math.cos(a) * 125; n.y = cy + Math.sin(a) * 80; n.a = a;
      nodes.push(n);
      edges.push({ x1: cx, y1: cy, x2: n.x, y2: n.y, label: n.rel });
      if (n.kind === 'person') {
        const others = c.net.viaDirector.filter(v => v.people.includes(n.id)).map(v => v.id).slice(0, 4);
        others.forEach((oid, j) => {
          const spread = (j - (others.length - 1) / 2) * 0.32;
          const b = a + spread;
          const m = { kind: 'company', id: oid, x: cx + Math.cos(b) * 230, y: cy + Math.sin(b) * 140, a: b };
          nodes.push(m);
          edges.push({ x1: n.x, y1: n.y, x2: m.x, y2: m.y });
        });
      }
    });

    const nodeSvg = n => {
      if (n.kind === 'person') {
        const p = personById.get(n.id);
        const anchor = Math.cos(n.a) < -0.2 ? 'end' : Math.cos(n.a) > 0.2 ? 'start' : 'middle';
        const dx = anchor === 'end' ? -10 : anchor === 'start' ? 10 : 0;
        const dy = anchor === 'middle' ? (Math.sin(n.a) < 0 ? -12 : 20) : 4;
        return `<g><circle cx="${n.x}" cy="${n.y}" r="6" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"/>
          <text x="${n.x + dx}" y="${n.y + dy}" text-anchor="${anchor}">${esc(p.name)}</text></g>`;
      }
      const co = byId.get(n.id);
      const t = statusTone(co);
      const anchor = Math.cos(n.a) < -0.2 ? 'end' : Math.cos(n.a) > 0.2 ? 'start' : 'middle';
      const dx = anchor === 'end' ? -10 : anchor === 'start' ? 10 : 0;
      const dy = anchor === 'middle' ? (Math.sin(n.a) < 0 ? -12 : 20) : 4;
      const sub = co.status === 'bankrupt' ? `bankrupt ${co.closedYear}` : co.status === 'insolvency' ? 'insolvency' : results.get(co.id).grade.grade;
      return `<g class="node-co" data-open="${co.status === 'bankrupt' ? '' : co.id}" tabindex="${co.status === 'bankrupt' ? -1 : 0}" role="${co.status === 'bankrupt' ? 'img' : 'link'}" aria-label="${esc(co.name)}">
        <rect x="${n.x - 6}" y="${n.y - 6}" width="12" height="12" rx="2" fill="var(--${t}-soft)" stroke="var(--${t})" stroke-width="1.5"/>
        <text x="${n.x + dx}" y="${n.y + dy}" text-anchor="${anchor}">${esc(coLabel(co))} <tspan class="lbl-muted">${sub}</tspan></text></g>`;
    };

    const svg = `<svg class="chart graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Directors, owners and linked companies">
      ${edges.map(e => `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="var(--line)" stroke-width="1.5"/>`).join('')}
      ${nodes.map(nodeSvg).join('')}
      <rect x="${cx - 8}" y="${cy - 8}" width="16" height="16" rx="3" fill="var(--accent)"/>
      <text x="${cx}" y="${cy + 26}" text-anchor="middle" style="font-weight:600">${esc(coLabel(c))}</text>
    </svg>`;
    const flags = [];
    if (c.net.directorBankruptcies) flags.push(`<span class="pill t-crit">${c.net.directorBankruptcies} past ${c.net.directorBankruptcies === 1 ? 'bankruptcy' : 'bankruptcies'} via directors</span>`);
    if (c.net.relatedDistress) flags.push(`<span class="pill t-warn">${c.net.relatedDistress} related ${c.net.relatedDistress === 1 ? 'company' : 'companies'} in distress</span>`);
    return `<section class="card" aria-label="Network">
      <div class="card-head"><h2>People and linked companies</h2><div class="chips">${flags.join('') || '<span class="pill t-good">No distress in the network</span>'}</div></div>
      <div class="table-wrap">${svg}</div>
      <div class="legend"><span><i class="bg-good"></i>Clean</span><span><i class="bg-warn"></i>Blocked account or tax debt</span><span><i class="bg-crit"></i>Bankrupt or insolvent</span></div>
    </section>`;
  }

  function eventsCard(c, r) {
    const ev = [];
    if (c.fin) {
      const fy = Number(c.fin.periodEnd.slice(0, 4));
      ev.push({ date: `${fy + 1}-03-${fy + 1 === 2026 ? 27 : 30}`, tone: 'fair', text: `FY${fy} annual report filed with AJPES` });
      if (r.finAgeMonths > 18) ev.push({ date: `${fy + 2}-03-31`, tone: 'warn', text: `FY${fy + 1} annual report missed the 31 March deadline` });
    }
    for (const b of c.events.blockPeriods) {
      ev.push({ date: b.from, tone: 'crit', text: `Bank account blocked (${c.events.blockedDays12m} days)` });
      if (new Date(b.to) < new Date(asOf)) ev.push({ date: b.to, tone: 'good', text: 'Account block lifted' });
    }
    if (c.events.taxDebt) ev.push({ date: c.events.taxListed, tone: 'warn', text: `Listed as FURS tax debtor, ${fmtEur(c.events.taxDebt)} overdue` });
    if (c.status === 'insolvency') ev.push({ date: asOf, tone: 'crit', text: 'Insolvency proceedings open, notice published on AJPES' });
    if (c.pay) {
      const recent = avg(c.pay.dbt.slice(-3)), earlier = avg(c.pay.dbt.slice(0, 9));
      if (recent - earlier >= 10) ev.push({ date: c.pay.updated, tone: 'warn', text: `Payment delays up from ${earlier.toFixed(0)} to ${recent.toFixed(0)} days beyond terms` });
    }
    ev.push({ date: `${c.founded}-01-01`, tone: 'fair', text: `Company registered (${c.form})`, yearOnly: true });
    ev.sort((a, b) => b.date.localeCompare(a.date));
    return `<section class="card" aria-label="Events">
      <div class="card-head"><h2>Events</h2><span class="eyebrow">Newest first</span></div>
      <ul class="timeline">${ev.map(e => `<li><time>${e.yearOnly ? e.date.slice(0, 4) : fmtDate(e.date)}</time><span class="dot bg-${e.tone}"></span><span>${esc(e.text)}</span></li>`).join('')}</ul>
    </section>`;
  }

  function financialsCard(c) {
    if (!c.fin) return '';
    const a = c.finPrev, b = c.fin;
    const rows = [
      ['Revenue', a.revenue, b.revenue],
      ['EBITDA', a.ebitda, b.ebitda],
      ['EBIT', a.ebit, b.ebit],
      ['Total assets', a.assets, b.assets],
      ['Equity', a.equity, b.equity],
      ['Financial debt', a.debt, b.debt],
    ];
    const ratio = (f, fn) => fn(f).toFixed(2).replace('.', ',');
    return `<section class="card" aria-label="Financial statements">
      <div class="card-head"><h2>Annual accounts</h2><span class="eyebrow">Source: AJPES, EUR</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>FY${a.periodEnd.slice(0, 4)}</th><th>FY${b.periodEnd.slice(0, 4)}</th><th>Change</th></tr></thead>
        <tbody>
          ${rows.map(([k, x, y]) => `<tr><td>${k}</td><td class="num">${int.format(x)}</td><td class="num">${int.format(y)}</td><td class="num">${x ? ((y / x - 1) * 100).toFixed(0) + ' %' : '–'}</td></tr>`).join('')}
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
    const watched = watch[id] != null;
    const st = c.status === 'insolvency' ? '<span class="status t-crit">In insolvency proceedings</span>' : '<span class="status t-good">Active</span>';
    const directors = c.directors.map(p => esc(personById.get(p).name)).join(', ');
    $('#dossier').innerHTML = `
      <section class="card" aria-label="Company">
        <div class="ident">
          <div>
            <div class="eyebrow">${esc(c.sector.code)} · ${esc(c.sector.label)}</div>
            <h1>${esc(c.name)}</h1>
            <div class="ident-meta">
              <span>Reg. no. <b class="mono">${c.ms}</b></span>
              <span>VAT <b class="mono">${c.ds}</b></span>
              <span><b>${esc(c.city)}</b></span>
              <span>Since <b>${c.founded}</b></span>
              <span>Director <b>${directors}</b></span>
              ${st}
            </div>
          </div>
          <button class="btn ${watched ? '' : 'primary'}" type="button" data-watch="${c.id}">${watched ? 'Stop monitoring' : 'Monitor this company'}</button>
        </div>
      </section>
      <div class="grid-2">${scoreCard(c, r)}${decisionCard(c, r, exposure)}</div>
      <div class="grid-2">${reasonsCard(c, r)}${paymentsCard(c)}</div>
      ${networkCard(c)}
      <div class="grid-2">${eventsCard(c, r)}${financialsCard(c) || '<div></div>'}</div>`;
    document.querySelectorAll('#results button[data-open]').forEach(b => b.setAttribute('aria-current', String(b.dataset.open === id)));
  }

  function updateDecision(value, source) {
    const c = byId.get(state.current);
    document.getElementById('decision-out').innerHTML = decisionOut(c, results.get(c.id), value);
    const other = document.getElementById(source === 'exposure' ? 'exposure-range' : 'exposure');
    if (other) other.value = value;
    if (watch[c.id] != null) { watch[c.id] = value; store.set('rok.watch', watch); }
  }

  // ---------- portfolio ----------
  function renderPortfolio() {
    const rows = Object.entries(watch).map(([id, exposure]) => {
      const c = byId.get(id), r = results.get(id);
      const rec = E.recommend(c, r, exposure);
      return { c, r, exposure, rec, alerts: alertCache.get(id) };
    });
    const total = rows.reduce((s, x) => s + x.exposure, 0);
    const el = rows.reduce((s, x) => s + x.rec.expectedLoss, 0);
    const wpd = total ? rows.reduce((s, x) => s + x.exposure * x.r.pd, 0) / total : 0;
    const over = rows.filter(x => x.exposure > x.rec.limit);
    const allAlerts = rows.flatMap(x => x.alerts.map(a => ({ ...a, c: x.c })))
      .sort((a, b) => ['crit', 'warn', 'info'].indexOf(a.level) - ['crit', 'warn', 'info'].indexOf(b.level));
    rows.sort((a, b) => b.r.pd * b.exposure - a.r.pd * a.exposure);

    $('#view-portfolio').innerHTML = `
      <div class="page-head"><div class="eyebrow">Your customers</div><h1>Portfolio</h1>
        <p class="muted prose">Every company you monitor is re-scored when a register, filing or invoice changes. Exposure is what they can owe you at peak. Change it on the company page.</p></div>
      <div class="tiles">
        <div class="tile"><span class="eyebrow">Total exposure</span><span class="v">${fmtEurShort(total)}</span><span class="sub">${rows.length} companies monitored</span></div>
        <div class="tile"><span class="eyebrow">Expected loss, 12 months</span><span class="v">${fmtEurShort(el)}</span><span class="sub">${total ? fmtPct(el / total, 2) : '–'} of exposure</span></div>
        <div class="tile"><span class="eyebrow">Weighted default probability</span><span class="v">${fmtPd(wpd)}</span><span class="sub">Weighted by exposure</span></div>
        <div class="tile"><span class="eyebrow">Above recommended limit</span><span class="v" style="color:var(--${over.length ? 'crit' : 'good'})">${over.length}</span><span class="sub">${fmtEurShort(over.reduce((s, x) => s + x.exposure - x.rec.limit, 0))} over limit</span></div>
      </div>
      <div class="portfolio-grid">
        <section class="card"><div class="card-head"><h2>Monitored companies</h2><span class="eyebrow">Largest expected loss first</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Company</th><th>Grade</th><th>PD</th><th>Exposure</th><th>Limit</th><th>Exp. loss</th></tr></thead>
            <tbody>${rows.map(x => `<tr class="clickable" data-open="${x.c.id}" tabindex="0">
              <td>${esc(x.c.name)}</td><td>${gradePill(x.r)}</td><td class="num">${fmtPd(x.r.pd)}</td>
              <td class="num" style="${x.exposure > x.rec.limit ? 'color:var(--crit)' : ''}">${fmtEur(x.exposure)}</td>
              <td class="num">${fmtEur(x.rec.limit)}</td><td class="num">${fmtEur(x.rec.expectedLoss)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>
        <section class="card"><div class="card-head"><h2>Alerts</h2><span class="eyebrow">${allAlerts.length} open</span></div>
          <ul class="alerts">${allAlerts.map(a => `<li><button data-open="${a.c.id}"><span class="stripe bg-${levelTone[a.level]}"></span>
            <span><span class="a-co">${esc(a.c.name)}</span><br><span class="a-msg">${esc(a.text)}</span></span><span class="pill t-${levelTone[a.level]}">${a.level === 'crit' ? 'Act now' : a.level === 'warn' ? 'Review' : 'Note'}</span></button></li>`).join('') || '<li class="empty">No alerts on your customers.</li>'}</ul>
          <p class="note">Alerts go out by email, Slack or Teams, and as webhooks into your ERP.</p>
        </section>
      </div>`;
  }

  // ---------- model ----------
  let modelHtml = null;
  function renderModel() {
    if (modelHtml) { $('#view-model').innerHTML = modelHtml; return; }
    const full = [], filings = [], y = [];
    const scored = [];
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

    // Share of defaults caught in the riskiest 10 % of companies.
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
      return pts.filter((p, i) => i % 8 === 0 || i === pts.length - 1);
    };
    const S = 260, M = 34;
    const px = v => M + v * (S - M - 10), py = v => S - M - v * (S - M - 10);
    const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join('');
    const rocSvg = `<svg class="chart" viewBox="0 0 ${S} ${S}" style="max-width:340px" role="img" aria-label="ROC curves for both models">
      ${[0, 0.5, 1].map(t => `<line x1="${px(0)}" x2="${px(1)}" y1="${py(t)}" y2="${py(t)}" stroke="var(--line)"/><text x="${px(0) - 6}" y="${py(t) + 4}" text-anchor="end">${t}</text><text x="${px(t)}" y="${S - M + 16}" text-anchor="middle">${t}</text>`).join('')}
      <line x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(1)}" stroke="var(--faint)" stroke-dasharray="3 4"/>
      <path d="${path(roc(filings))}" fill="none" stroke="var(--faint)" stroke-width="2"/>
      <path d="${path(roc(full))}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      <text x="${px(0.5)}" y="${S - 4}" text-anchor="middle">False alarm rate</text>
    </svg>`;

    const weightRows = E.FEATURES.map(f => {
      const w = E.MODELS.full.weights[f.key];
      const wo = E.MODELS.filings.weights[f.key];
      const fmt = v => v == null ? '<span class="muted">not used</span>' : (v > 0 ? '+' : '') + v.toFixed(3);
      return `<tr><td>${esc(f.label)}</td><td>${f.group}</td><td class="num">${fmt(w)}</td><td class="num">${fmt(wo)}</td></tr>`;
    }).join('');

    modelHtml = `
      <div class="page-head"><div class="eyebrow">Model card · published every quarter</div><h1>How good is the score?</h1>
        <p class="prose muted">Registry-based scores in Slovenia don't publish how often they are right. We do. Below: Rok's model against a model that sees only annual accounts and company age, which is what registry-only scores are built on. Both are tested on ${int.format(y.length)} companies they were not trained on, and ${defaults} of them defaulted within 12 months.</p></div>
      <div class="compare-tiles">
        <div class="tile"><span class="eyebrow">Rok, AUC</span><span class="v" style="color:var(--accent)">${aucF.toFixed(3)}</span><span class="sub">Gini ${(2 * aucF - 1).toFixed(2)}</span></div>
        <div class="tile"><span class="eyebrow">Annual accounts only, AUC</span><span class="v">${aucO.toFixed(3)}</span><span class="sub">Gini ${(2 * aucO - 1).toFixed(2)}</span></div>
        <div class="tile"><span class="eyebrow">Defaults caught in riskiest 10 %</span><span class="v">${fmtPct(capture(full))}</span><span class="sub">vs ${fmtPct(capture(filings))} from accounts only</span></div>
      </div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h2>Ranking power</h2><span class="eyebrow">ROC curve</span></div>
          ${rocSvg}
          <div class="legend"><span><i style="background:var(--accent)"></i>Rok</span><span><i style="background:var(--faint)"></i>Annual accounts only</span></div>
          <p class="note">Higher and further left is better: more defaulters flagged for the same number of false alarms.</p>
        </section>
        <section class="card"><div class="card-head"><h2>Calibration</h2><span class="eyebrow">Predicted vs actual</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Grade</th><th>Companies</th><th>Predicted PD</th><th>Actual default rate</th></tr></thead>
            <tbody>${cal.filter(g => g.n).map(g => `<tr><td><span class="pill t-${g.tone}">${g.grade}</span></td><td class="num">${g.n}</td><td class="num">${fmtPd(g.predicted)}</td><td class="num">${fmtPd(g.observed)}</td></tr>`).join('')}</tbody>
          </table></div>
          <p class="note">A calibrated score means a 4 % PD really does default about 4 times in 100. Use it directly for pricing and provisioning.</p>
        </section>
      </div>
      <section class="card" style="margin-top:16px"><div class="card-head"><h2>Every weight, in the open</h2><span class="eyebrow">Log-odds per unit above typical</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Factor</th><th>Source</th><th>Rok</th><th>Accounts only</th></tr></thead>
          <tbody>${weightRows}</tbody>
        </table></div>
        <p class="note">Fitted by sign-constrained logistic regression (scripts/fit.js). A factor may only push risk in its declared direction; one that comes out the wrong way is dropped. Annual-account weights fade as the accounts age, down to 40 % after three years.</p>
      </section>
      <p class="note prose"><b>About this demo.</b> The companies, people and defaults on this page are simulated, so these figures show how the method works and are not a real-world result. In production the same back-test runs on real AJPES defaults and insolvency notices, is re-published every quarter, and is checked by an outside validator.</p>`;
    $('#view-model').innerHTML = modelHtml;
  }

  // ---------- pricing ----------
  function renderPricing() {
    $('#view-pricing').innerHTML = `
      <div class="page-head"><div class="eyebrow">Proposed pricing · monthly, cancel any time</div><h1>Pay for what you check</h1>
        <p class="prose muted">No sales call and no 12-month contract. Share your invoices and you get Pro for free, because your data makes every score better.</p></div>
      <div class="tiers">
        <section class="card tier"><div class="eyebrow">Free</div><div class="price">0 €</div>
          <ul><li>Search every Slovenian company</li><li>Grade and alerts on 3 dossiers a month</li><li>Account-block and FURS checks</li></ul></section>
        <section class="card tier featured"><div class="eyebrow">Pro</div><div class="price">29 €<small> / month</small></div>
          <ul><li>Unlimited dossiers with reasons</li><li>Monitor 100 companies</li><li>Credit limits and payment terms</li><li>Payment-behaviour data</li><li>Email alerts</li></ul>
          <div class="cover"><span><b>Free</b> when you connect your e-invoicing or accounting tool</span></div></section>
        <section class="card tier"><div class="eyebrow">Team</div><div class="price">119 €<small> / month</small></div>
          <ul><li>5 seats, 1,000 monitored companies</li><li>API, webhooks, Slack and Teams</li><li>ERP plugins</li><li>Bulk portfolio re-score</li></ul></section>
        <section class="card tier"><div class="eyebrow">Pay as you go</div><div class="price">3,90 €<small> / dossier</small></div>
          <ul><li>Card payment, no account needed</li><li>Full dossier as PDF</li><li>Good enough for a public tender or a one-off deal</li></ul></section>
      </div>
      <section class="card" style="margin-top:16px"><div class="card-head"><h2>Against the market</h2><span class="eyebrow">Public list prices, 2025–2026</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th></th><th>Rok</th><th>AJPES eS.BON</th><th>D&amp;B (Bisnode)</th><th>EBONITETE.SI</th></tr></thead>
          <tbody>
            <tr><td>One company report</td><td class="num">3,90 €</td><td class="num">45,90 €</td><td class="num">20 € subscribers, 40 € others</td><td>Subscription only</td></tr>
            <tr><td>Prices on the website</td><td class="yes">Yes</td><td class="yes">Yes</td><td>Report prices</td><td class="no">On request</td></tr>
            <tr><td>Minimum contract</td><td>None</td><td>None</td><td>Annual access for the lower price</td><td>12 months</td></tr>
            <tr><td>Live payment behaviour from invoices</td><td class="yes">Weekly</td><td class="no">No, annual accounts</td><td>Not advertised</td><td>"Payment habits", source not stated</td></tr>
            <tr><td>Published back-test of the score</td><td class="yes">Quarterly</td><td>Methodology only</td><td>Methodology only</td><td>Not advertised</td></tr>
            <tr><td>Credit limit, terms and insurance price</td><td class="yes">Every dossier</td><td class="no">No</td><td>Not advertised in SI</td><td>Not advertised</td></tr>
          </tbody>
        </table></div>
        <p class="note">Competitor figures come from public price lists and product pages as of September 2026. "Not advertised" means we found no public claim, not that the feature is missing.</p>
      </section>`;
  }

  // ---------- routing ----------
  const VIEWS = ['companies', 'portfolio', 'model', 'pricing'];
  function route() {
    const h = (location.hash || '').slice(1);
    let view = VIEWS.includes(h) ? h : 'companies';
    if (/^c\d{4}$/.test(h) && byId.has(h)) { view = 'companies'; if (state.current !== h) renderDossier(h); }
    for (const v of VIEWS) document.getElementById(`view-${v}`).hidden = v !== view;
    document.querySelectorAll('nav a').forEach(a => a.setAttribute('aria-current', a.dataset.view === view ? 'page' : 'false'));
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
    const chip = e.target.closest('[data-filter]');
    if (chip) {
      state.filter = chip.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === chip)));
      renderResults();
      return;
    }
    const w = e.target.closest('[data-watch]');
    if (w) {
      const id = w.dataset.watch;
      if (watch[id] != null) delete watch[id];
      else {
        const input = document.getElementById('exposure');
        const c = byId.get(id);
        watch[id] = input ? Number(input.value) || 0 : E.recommend(c, results.get(id)).limit;
      }
      store.set('rok.watch', watch);
      renderDossier(id, Number(document.getElementById('exposure') && document.getElementById('exposure').value));
      renderResults();
      return;
    }
    const q = e.target.closest('[data-quote]');
    if (q) {
      q.textContent = 'Requested from 3 insurers';
      q.disabled = true;
    }
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
  watch = store.get('rok.watch', null);
  if (!watch || typeof watch !== 'object' || Object.keys(watch).some(id => !byId.has(id))) {
    watch = defaultWatchlist();
  }
  const firstAlerting = Object.keys(watch).find(id => alertCache.get(id).some(a => a.level === 'warn' || a.level === 'crit') && byId.get(id).status === 'active');
  renderDossier(firstAlerting || Object.keys(watch)[0]);
  route();
})();
