// The approver console (brief §2.3 rule 7, §2.9, §4.3 12:00-13:40) behind ADMIN_TOKEN.
// Minimal server-rendered HTML (no script) plus a JSON API. Everything a person does is attributed
// to a named person (personId, e.g. 'p1'); every read of pre-release candidates is logged.
//
//   GET  /admin                        console page (sign-in form without a valid admin cookie)
//   POST /admin/login  /admin/logout   form: token -> HMAC-signed, SameSite=Strict cookie
//   POST /admin/veto /admin/news-review /admin/thesis /admin/signoff /admin/preclearance /admin/sms   (forms, 303 back)
// Every candidate is shown with its 48-hour news items in full (headline, source, time, summary),
// the scan's outcome and reason, and the keyword red flags, so the approver reads the news itself.
//   GET  /api/admin/candidates?date=   today's candidates (logs every access)
//   POST /api/admin/veto {candidateId, reason, reasonSl?, personId}   removal only, reason mandatory
//   POST /api/admin/news-review {candidateId, personId, note?}         "news read, nothing material" for a
//                                                                      candidate whose 48-hour scan did not clear
//   POST /api/admin/thesis {candidateId, en, sl, personId}            approver-written thesis (validated)
//   POST /api/admin/signoff {personId}                                 the approver's review of the day
//   GET|POST /api/admin/preclearance {personId, instrument, instrumentType, side}  funds and ETFs only
//   POST /api/admin/sms {paused: false}                                resume the SMS channel after a pause
//   GET  /api/admin/access-log
// JSON calls authenticate with `Authorization: Bearer <ADMIN_TOKEN>` (constant-time compare).
import { createHash, timingSafeEqual } from 'node:crypto';
import { formatInZone, LJUBLJANA } from '../core/calendar.js';
import { HttpError, sendHtml, redirect, parseCookies, serializeCookie, appendHeader, signValue, verifySignedValue } from './http.js';
import { PipelineError, PIPELINE_TIMES, pipelineInstant, NEWS_REVIEW_NEEDED } from './publisher.js';
import { escapeHtml, iso } from './util.js';

const COOKIE = 'qadm';
const COOKIE_TTL_MS = 8 * 3600_000;
export const CLEARABLE = ['fund', 'etf'];

// tokenMatches(given, expected): constant-time over SHA-256 digests (equal length whatever the input).
export function tokenMatches(given, expected) {
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

const HTTP_FOR = {
  not_found: 404,
  no_candidates: 404,
  not_an_approver: 403,
  not_active: 403,
  reason_required: 400,
  thesis_invalid: 400,
  review_closed: 409,
  not_open: 409,
  review_not_needed: 409,
  already_sealed: 409,
};

function asHttp(e) {
  if (e instanceof PipelineError) return new HttpError(HTTP_FOR[e.code] ?? 409, e.code, e.message);
  return e;
}

export function registerAdminRoutes(router, ctx) {
  const { db, config } = ctx;
  const tokenTag = () => createHash('sha256').update(`qadm:${config.adminToken}`).digest('hex').slice(0, 16);

  function authed(req) {
    if (!config.adminToken) return null;
    const h = String(req.headers.authorization || '');
    if (h.startsWith('Bearer ') && tokenMatches(h.slice(7).trim(), config.adminToken)) return { via: 'bearer' };
    const c = verifySignedValue(parseCookies(req.headers.cookie)[COOKIE], config.sessionSecret, ctx.now().getTime());
    if (c?.adm === 1 && c.tag === tokenTag()) return { via: 'cookie' };
    return null;
  }
  function need(req) {
    if (!config.adminToken) throw new HttpError(404, 'not_found', 'Not found');
    const a = authed(req);
    if (!a) throw new HttpError(401, 'admin_auth', 'Admin token required');
    return a;
  }
  const today = () => formatInZone(ctx.now(), LJUBLJANA).date;
  const pick = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const actorOf = (req, personId) => (personId ? `person:${personId}` : `admin:${authed(req)?.via ?? 'unknown'}`);
  const publisher = () => ctx.publisher;

  function candidatesView(date, actor, ip) {
    const r = publisher().run(date);
    if (!r) return { date, stage: null, candidates: [] };
    const rows = publisher().readCandidates(date, { actor, purpose: 'admin_view', ip });
    return {
      date,
      stage: r.stage,
      reviewClosesAt: formatInZone(pipelineInstant(date, PIPELINE_TIMES.reviewCloses), LJUBLJANA).iso,
      approver: db.get('SELECT p.public_id FROM approver_signoffs s JOIN persons p ON p.id = s.person_id WHERE s.issue_date = ? ORDER BY s.id LIMIT 1', date)?.public_id ?? null,
      candidates: rows.map((c) => {
        const t = publisher().thesisOf(c.id);
        const scan = parseJson(c.veto_scan_detail) ?? {};
        const reviewer = c.news_reviewed_by ? db.get('SELECT public_id FROM persons WHERE id = ?', c.news_reviewed_by)?.public_id ?? null : null;
        return {
          id: c.id,
          kind: c.kind,
          priorNo: c.prior_no,
          publicNo: c.public_no,
          ticker: c.payload.ticker,
          name: c.payload.name ?? null,
          sector: c.payload.sector ?? null,
          agreement: c.payload.agreement,
          agreeing: c.payload.agreeing,
          combined: c.combined_score,
          status: c.status,
          statusReason: c.status_reason,
          vetoScan: c.veto_scan,
          thesisStatus: c.thesis_status,
          thesis: t ? { en: t.en, sl: t.sl, drafter: t.drafter } : null,
          newsItems: (c.payload.news ?? []).length,
          // The items in full: the approver reads them (third-party text, escaped in the page).
          news: (c.payload.news ?? []).map((x, i) => ({ id: String(x.id ?? i + 1), at: x.at ?? null, source: x.source ?? null, headline: x.headline ?? '', summary: x.summary ?? null })),
          scan: c.veto_scan_detail
            ? { status: scan.status ?? c.veto_scan, category: scan.category ?? null, reason: scan.reason ?? null, itemIds: scan.itemIds ?? [], redFlags: scan.redFlags ?? [], unscanned: scan.unscanned ?? 0 }
            : null,
          newsReview: c.news_reviewed_at ? { by: reviewer, at: c.news_reviewed_at, note: scan.review?.note ?? null } : null,
          needsNewsReview: c.status === 'candidate' && NEWS_REVIEW_NEEDED.includes(c.veto_scan),
        };
      }),
    };
  }

  function preclear({ personId, instrument, instrumentType, side, deciderId, ip, actor }) {
    const p = db.get('SELECT * FROM persons WHERE public_id = ?', personId);
    if (!p) throw new HttpError(400, 'unknown_person', 'No such staff member');
    const name = String(instrument ?? '').trim();
    if (!name || name.length > 120) throw new HttpError(400, 'invalid_instrument', 'Name the instrument (fund or ETF)');
    const type = String(instrumentType ?? '').toLowerCase();
    if (!['fund', 'etf', 'stock', 'other'].includes(type)) throw new HttpError(400, 'invalid_type', 'instrumentType must be fund, etf, stock or other');
    const s = String(side ?? '').toLowerCase();
    if (!['buy', 'sell'].includes(s)) throw new HttpError(400, 'invalid_side', 'side must be buy or sell');
    const decider = deciderId ? db.get('SELECT id FROM persons WHERE public_id = ?', deciderId) : null;
    const cleared = CLEARABLE.includes(type);
    const reason = cleared ? 'Funds and ETFs may be traded (brief §2.9).' : 'Staff, founders and their families trade funds and ETFs only, never single stocks (brief §2.9).';
    const now = iso(ctx.now());
    const id = db.run(
      'INSERT INTO staff_trade_requests (person_id, instrument, side, decision, decided_by, created_at, decided_at, instrument_type, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      p.id,
      name,
      s,
      cleared ? 'cleared' : 'refused',
      decider?.id ?? null,
      now,
      now,
      type,
      reason,
    ).lastInsertRowid;
    db.run('INSERT INTO access_log (actor, action, object_type, object_id, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)', actor, 'preclearance', 'staff_trade_request', String(id), ip, now);
    return { id, decision: cleared ? 'cleared' : 'refused', reason };
  }
  function preclearances(limit = 50) {
    return db.all(
      `SELECT r.id, p.public_id AS person, r.instrument, r.instrument_type AS type, r.side, r.decision, r.reason, r.created_at
       FROM staff_trade_requests r LEFT JOIN persons p ON p.id = r.person_id ORDER BY r.id DESC LIMIT ?`,
      limit,
    );
  }
  function setSms(paused, by) {
    if (paused === false) return ctx.receipts.resumeSms({ by });
    db.setSetting('sms_paused', '1', iso(ctx.now()));
    db.setSetting('sms_paused_reason', `paused by ${by}`, iso(ctx.now()));
    return { ok: true, paused: true };
  }

  // ---------------------------------------------------------------- JSON API
  router.add(
    'GET',
    '/api/admin/candidates',
    async (req, res, { query, ip }) => {
      need(req);
      const date = pick(query.get('date')) ?? today();
      return candidatesView(date, actorOf(req, pick(query.get('person')) ?? pick(req.headers['x-admin-person'])), ip);
    },
    { rate: 'admin' },
  );
  const post = (path, fn) =>
    router.add(
      'POST',
      path,
      async (req, res, { body, ip }) => {
        need(req);
        try {
          return await fn(body ?? {}, { req, ip });
        } catch (e) {
          throw asHttp(e);
        }
      },
      { accepts: ['json'], rate: 'admin' },
    );
  post('/api/admin/veto', (b, { ip }) => publisher().veto(pick(b.date) ?? today(), b.candidateId, { personId: b.personId, reason: b.reason, reasonSl: b.reasonSl, ip }));
  post('/api/admin/news-review', (b, { ip }) => publisher().reviewNews(pick(b.date) ?? today(), b.candidateId, { personId: b.personId, note: b.note ?? null, ip }));
  post('/api/admin/thesis', (b, { ip }) => publisher().writeThesis(pick(b.date) ?? today(), b.candidateId, { personId: b.personId, en: String(b.en ?? ''), sl: String(b.sl ?? ''), ip }));
  post('/api/admin/signoff', (b, { ip }) => publisher().signOff(pick(b.date) ?? today(), { personId: b.personId, ip }));
  post('/api/admin/preclearance', (b, { req, ip }) => preclear({ ...b, deciderId: b.deciderId ?? null, ip, actor: actorOf(req, b.personId) }));
  post('/api/admin/sms', (b, { req }) => setSms(b.paused, actorOf(req, b.personId)));
  router.add(
    'GET',
    '/api/admin/preclearance',
    async (req) => {
      need(req);
      return { requests: preclearances() };
    },
    { rate: 'admin' },
  );
  router.add(
    'GET',
    '/api/admin/access-log',
    async (req, res, { query, ip }) => {
      need(req);
      const actor = actorOf(req, pick(query.get('person')));
      db.run('INSERT INTO access_log (actor, action, object_type, object_id, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)', actor, 'read', 'access_log', null, ip, iso(ctx.now()));
      const limit = Math.min(500, Math.max(1, Number(query.get('limit')) || 100));
      return { entries: db.all('SELECT id, actor, action, object_type, object_id, created_at FROM access_log ORDER BY id DESC LIMIT ?', limit) };
    },
    { rate: 'admin' },
  );

  // ---------------------------------------------------------------- HTML console
  router.add(
    'GET',
    '/admin',
    async (req, res, { query, ip }) => {
      if (!config.adminToken) throw new HttpError(404, 'not_found', 'Not found');
      if (!authed(req)) return sendHtml(res, 200, loginPage(query.get('e')), PAGE_HEADERS);
      const date = pick(query.get('date')) ?? today();
      const person = pick(query.get('person'));
      const view = candidatesView(date, actorOf(req, person), ip);
      return sendHtml(res, 200, consolePage({ ctx, view, person, preclear: preclearances(20), msg: query.get('m'), err: query.get('e') }), PAGE_HEADERS);
    },
    { rate: 'admin' },
  );
  router.add(
    'POST',
    '/admin/login',
    async (req, res, { body }) => {
      if (!config.adminToken) throw new HttpError(404, 'not_found', 'Not found');
      if (!tokenMatches(String(body.token ?? ''), config.adminToken)) return redirect(res, '/admin?e=bad_token');
      const value = signValue({ adm: 1, tag: tokenTag(), exp: ctx.now().getTime() + COOKIE_TTL_MS }, config.sessionSecret);
      appendHeader(res, 'set-cookie', serializeCookie(COOKIE, value, { maxAge: COOKIE_TTL_MS / 1000, sameSite: 'Strict', secure: config.publicBaseUrl.startsWith('https://') }));
      return redirect(res, '/admin');
    },
    { accepts: ['form'], limit: 'form', rate: 'adminLogin' },
  );
  router.add(
    'POST',
    '/admin/logout',
    async (req, res) => {
      appendHeader(res, 'set-cookie', serializeCookie(COOKIE, '', { maxAge: 0, sameSite: 'Strict' }));
      return redirect(res, '/admin');
    },
    { accepts: ['form', 'empty'], limit: 'form', rate: 'admin' },
  );
  const form = (path, fn) =>
    router.add(
      'POST',
      path,
      async (req, res, { body, ip }) => {
        if (!config.adminToken) throw new HttpError(404, 'not_found', 'Not found');
        if (!authed(req)) return redirect(res, '/admin?e=signin');
        const back = (k, v) => `/admin?date=${encodeURIComponent(body.date ?? today())}${body.personId ? `&person=${encodeURIComponent(body.personId)}` : ''}&${k}=${encodeURIComponent(v)}`;
        try {
          const r = await fn(body, { req, ip });
          return redirect(res, back('m', r?.message ?? 'done'));
        } catch (e) {
          const h = asHttp(e);
          if (h instanceof HttpError) return redirect(res, back('e', h.message));
          throw e;
        }
      },
      { accepts: ['form'], limit: 'json', rate: 'admin' },
    );
  form('/admin/veto', (b, { ip }) => {
    publisher().veto(b.date ?? today(), b.candidateId, { personId: b.personId, reason: b.reason, reasonSl: b.reasonSl, ip });
    return { message: `Candidate ${b.candidateId} removed` };
  });
  form('/admin/news-review', (b, { ip }) => {
    if (b.confirm !== '1') throw new HttpError(400, 'confirm_required', 'Tick the box to confirm you have read every item.');
    publisher().reviewNews(b.date ?? today(), b.candidateId, { personId: b.personId, note: b.note ?? null, ip });
    return { message: `News review recorded for candidate ${b.candidateId}` };
  });
  form('/admin/thesis', (b, { ip }) => {
    publisher().writeThesis(b.date ?? today(), b.candidateId, { personId: b.personId, en: b.en ?? '', sl: b.sl ?? '', ip });
    return { message: `Thesis saved for candidate ${b.candidateId}` };
  });
  form('/admin/signoff', (b, { ip }) => {
    publisher().signOff(b.date ?? today(), { personId: b.personId, ip });
    return { message: 'Review signed off' };
  });
  form('/admin/preclearance', (b, { req, ip }) => {
    const r = preclear({ personId: b.staffId, instrument: b.instrument, instrumentType: b.instrumentType, side: b.side, deciderId: b.personId ?? null, ip, actor: actorOf(req, b.personId) });
    return { message: `Pre-clearance ${r.decision}` };
  });
  form('/admin/sms', (b, { req }) => {
    setSms(b.paused === '1', actorOf(req, b.personId));
    return { message: b.paused === '1' ? 'SMS paused' : 'SMS resumed' };
  });
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ pages
const PAGE_HEADERS = { 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' };
const STYLE = `
:root{color-scheme:light;--karst:#e3e6e4;--paper:#f4f5f3;--graphite:#111418;--slate:#545c63;--hairline:#aeb6b9;--loss:#b3261e}
*{box-sizing:border-box}
body{margin:0;background:var(--karst);color:var(--graphite);font:400 15px/1.45 ui-sans-serif,system-ui,sans-serif;padding:16px}
main{max-width:1100px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
.muted{color:var(--slate)}.err{color:var(--loss);font-weight:600}.ok{font-weight:600}
table{width:100%;border-collapse:collapse;background:var(--paper)}th,td{border-bottom:1px solid var(--hairline);text-align:left;padding:8px;vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--slate)}
code,.mono{font-family:ui-monospace,Menlo,monospace}
form.inline{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin:4px 0}
textarea{width:100%;min-height:60px;font:inherit}input,select,button,textarea{font:inherit}
input,select,textarea{border:1px solid var(--hairline);background:#fff;padding:6px}
button{background:var(--graphite);color:var(--karst);border:0;padding:8px 12px;cursor:pointer}
button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--graphite);outline-offset:2px}
details{margin-top:6px}.box{background:var(--paper);border:1px solid var(--hairline);padding:12px;margin:8px 0}
.news{list-style:none;margin:6px 0;padding:0}.news li{border-left:2px solid var(--hairline);padding:2px 0 2px 8px;margin:6px 0}
.news li.flag{border-left-color:var(--loss)}.news .src{font-size:12px;color:var(--slate)}
.warn{color:var(--loss);font-weight:600}
`;

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Quorum Research</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

function loginPage(error) {
  return shell(
    'Approver console',
    `<h1>Quorum approver console</h1><p class="muted">Simulated market, fictional companies. Access is logged.</p>
     ${error ? `<p class="err">${error === 'bad_token' ? 'That token is not valid.' : 'Sign in first.'}</p>` : ''}
     <form method="post" action="/admin/login" class="box"><label for="token">Admin token</label><br><input id="token" name="token" type="password" autocomplete="off" required> <button type="submit">Sign in</button></form>`,
  );
}

// newsCell(candidate) -> the 48-hour news block: the scan's outcome and reason, then every item in
// full (third-party text, escaped), items with a red flag marked, beside the model's reason.
function newsCell(c) {
  const e = escapeHtml;
  const flags = new Map((c.scan?.redFlags ?? []).map((f) => [f.id, f]));
  const cited = new Set(c.scan?.itemIds ?? []);
  const items = (c.news ?? [])
    .map((x) => {
      const f = flags.get(x.id);
      const marks = [f ? `red flag: ${[...f.terms, ...(f.instructionLike ? ['instruction-like text'] : [])].join(', ')}` : null, cited.has(x.id) ? 'cited by the scan' : null].filter(Boolean);
      return `<li class="${f ? 'flag' : ''}"><strong>${e(x.headline)}</strong>${x.summary ? `<br>${e(x.summary)}` : ''}<br><span class="src">${e(x.source ?? 'unknown source')} · <span class="mono">${e(x.at ?? 'no time')}</span> · item ${e(x.id)}${marks.length ? ` · <span class="warn">${e(marks.join('; '))}</span>` : ''}</span></li>`;
    })
    .join('');
  const review = c.newsReview ? `<br>news reviewed by <strong>${e(c.newsReview.by ?? '?')}</strong> <span class="mono">${e(c.newsReview.at)}</span>${c.newsReview.note ? `: ${e(c.newsReview.note)}` : ''}` : '';
  const reason = c.scan?.reason ? `<br><span class="muted">scan: ${e(c.scan.category ?? '')}${c.scan.category ? ': ' : ''}${e(c.scan.reason)}</span>` : '';
  const unscanned = c.scan?.unscanned && c.scan.status !== 'unavailable' ? `<br><span class="warn">${c.scan.unscanned} item(s) not scanned (over the cap)</span>` : '';
  return `news scan: <strong>${e(c.vetoScan ?? '-')}</strong> (${c.newsItems} ${c.newsItems === 1 ? 'item' : 'items'})${reason}${unscanned}${review}${items ? `<details${c.needsNewsReview ? ' open' : ''}><summary>48-hour news (${c.newsItems})</summary><ul class="news">${items}</ul></details>` : ''}`;
}

function consolePage({ ctx, view, person, preclear, msg, err }) {
  const e = escapeHtml;
  const approvers = ctx.db.all("SELECT public_id, full_name, job_title, role, fictional FROM persons ORDER BY public_id");
  const paused = ctx.db.getSetting('sms_paused') === '1';
  const personField = person ? `<input type="hidden" name="personId" value="${e(person)}">` : '';
  const dateField = `<input type="hidden" name="date" value="${e(view.date)}">`;
  const open = view.stage && !['reviewed', 'sealed', 'published', 'marked', 'anchored'].includes(view.stage);
  const rows = view.candidates
    .map((c) => {
      const newsReview =
        open && person && c.needsNewsReview
          ? `<form method="post" action="/admin/news-review" class="box">${dateField}${personField}<input type="hidden" name="candidateId" value="${c.id}">
               <p class="warn">News review needed: the automated scan did not clear this candidate. Without a review it is removed at 13:40.</p>
               <label><input type="checkbox" name="confirm" value="1" required> I have read every item above: nothing is material negative news.</label>
               <br><label class="muted" for="nr${c.id}">Note (optional)</label><textarea id="nr${c.id}" name="note"></textarea>
               <button type="submit">Record news review</button> <span class="muted">Material news: remove the candidate instead.</span></form>`
          : '';
      const actions =
        open && c.status === 'candidate' && person
          ? `<form method="post" action="/admin/veto" class="inline">${dateField}${personField}<input type="hidden" name="candidateId" value="${c.id}">
               <label class="muted" for="r${c.id}">Reason for removal (required)</label><textarea id="r${c.id}" name="reason" required minlength="10"></textarea><button type="submit">Remove (veto)</button></form>
             <details><summary>Write the thesis</summary><form method="post" action="/admin/thesis">${dateField}${personField}<input type="hidden" name="candidateId" value="${c.id}">
               <label for="en${c.id}">EN</label><textarea id="en${c.id}" name="en" required></textarea><label for="sl${c.id}">SL</label><textarea id="sl${c.id}" name="sl" required></textarea><button type="submit">Save thesis</button></form></details>`
          : '';
      return `<tr><td class="mono">${c.id}</td><td>${e(c.kind)}${c.priorNo ? ` of #${e(c.priorNo)}` : ''}${c.publicNo ? `<br><span class="mono">#${e(c.publicNo)}</span>` : ''}</td>
        <td><strong class="mono">${e(c.ticker)}</strong><br>${e(c.name ?? '')}<br><span class="muted">${e(c.sector ?? '')}</span></td>
        <td class="mono">${c.agreement ?? ''}/4 ${e((c.agreeing ?? []).join(''))}</td>
        <td>${e(c.status)}${c.statusReason ? `<br><span class="muted">${e(c.statusReason)}</span>` : ''}</td>
        <td>${newsCell(c)}${newsReview}thesis: ${e(c.thesisStatus ?? '-')}${c.thesis ? `<details><summary>Read (${e(c.thesis.drafter)})</summary><p>${e(c.thesis.en)}</p><p lang="sl">${e(c.thesis.sl)}</p></details>` : ''}</td>
        <td>${actions}</td></tr>`;
    })
    .join('');
  return shell(
    'Approver console',
    `<h1>Quorum approver console</h1>
     <p class="muted">Simulated market, fictional companies. Every view of pre-release candidates is logged. The approver can only remove a candidate, with a written reason; there is no add and no substitute.</p>
     ${msg ? `<p class="ok">${e(msg)}</p>` : ''}${err ? `<p class="err">${e(err)}</p>` : ''}
     <form method="get" action="/admin" class="inline box"><label for="date">Issue date</label><input id="date" name="date" value="${e(view.date)}">
       <label for="person">Acting as</label><select id="person" name="person"><option value="">(read only)</option>${approvers.map((p) => `<option value="${e(p.public_id)}"${p.public_id === person ? ' selected' : ''}>${e(p.full_name)}, ${e(p.job_title ?? p.role)}${p.fictional ? ' (fictional)' : ''}</option>`).join('')}</select>
       <button type="submit">Show</button></form>
     <p>Stage: <strong>${e(view.stage ?? 'no candidates')}</strong>${view.reviewClosesAt ? ` · review closes <span class="mono">${e(view.reviewClosesAt)}</span>` : ''} · signed off by: <strong>${e(view.approver ?? 'nobody yet')}</strong></p>
     <table><thead><tr><th>Id</th><th>Kind</th><th>Stock</th><th>Models</th><th>Status</th><th>Checks</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No candidates.</td></tr>'}</tbody></table>
     ${open && person ? `<form method="post" action="/admin/signoff" class="box">${dateField}${personField}<p>Sign off: I have reviewed today's candidates and their news. Without a sign-off by 13:40 nothing is issued ("no approver"). A candidate marked "news review needed" is removed at 13:40 unless its news review is recorded.</p><button type="submit">Sign off the review</button></form>` : ''}
     <h2>SMS channel</h2><form method="post" action="/admin/sms" class="inline box">${dateField}${personField}<span>${paused ? `<strong class="err">Paused</strong> <span class="muted">${e(ctx.db.getSetting('sms_paused_reason') ?? '')}</span>` : 'Sending'}</span>
       <input type="hidden" name="paused" value="${paused ? '0' : '1'}"><button type="submit">${paused ? 'Resume SMS' : 'Pause SMS'}</button></form>
     <h2>Staff pre-clearance (funds and ETFs only)</h2>
     <form method="post" action="/admin/preclearance" class="inline box">${dateField}${personField}
       <select name="staffId" aria-label="Staff member">${approvers.map((p) => `<option value="${e(p.public_id)}">${e(p.full_name)}</option>`).join('')}</select>
       <input name="instrument" placeholder="Instrument" aria-label="Instrument" required>
       <select name="instrumentType" aria-label="Instrument type"><option value="fund">Fund</option><option value="etf">ETF</option><option value="stock">Single stock</option><option value="other">Other</option></select>
       <select name="side" aria-label="Side"><option value="buy">Buy</option><option value="sell">Sell</option></select><button type="submit">Log request</button></form>
     <table><thead><tr><th>When</th><th>Who</th><th>Instrument</th><th>Decision</th></tr></thead><tbody>${preclear.map((r) => `<tr><td class="mono">${e(r.created_at)}</td><td>${e(r.person ?? '')}</td><td>${e(r.side)} ${e(r.instrument)} (${e(r.type ?? '')})</td><td>${e(r.decision)}<br><span class="muted">${e(r.reason ?? '')}</span></td></tr>`).join('') || '<tr><td colspan="4">None.</td></tr>'}</tbody></table>
     <form method="post" action="/admin/logout" class="box"><button type="submit">Sign out</button></form>`,
  );
}
