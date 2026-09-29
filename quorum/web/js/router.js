// Hash routes (ARCHITECTURE.md §5, "Hosting constraints"). Pure: no DOM, so tests import it in Node.
//
// Canonical links are flat tokens, because only a plain `#token` (letters, digits, . _ ~ -) survives
// in a shared Artifact link:  #ledger · #p-0052 · #issue-2026-09-28 · #s-KSMM · #methodology-changelog
// · #legal-terms · #app-research · #u-7Kq2xZ · #join-signal, and an empty hash for home.
// A section inside a page is `~id` after the token (#ledger~scoreboard); never `?key=value`.
// The older slash form (#/p/0052, #/ledger?s=scoreboard, #/join?tier=signal) is still accepted and
// normalised by the app to the flat form.
//
// Every link the site renders is built with href(name, param?, section?).
// Each route names a page module at js/pages/<module>.js that exports render(ctx).

export const ROUTES = [
  { name: 'home', module: 'home', group: null, token: '', legacy: '/' },
  { name: 'how-it-works', module: 'how-it-works', group: 'how', token: 'how-it-works', legacy: '/how-it-works' },
  { name: 'methodology', module: 'methodology', group: 'how', token: 'methodology', legacy: '/methodology' },
  { name: 'methodology-changelog', module: 'changelog', group: 'how', token: 'methodology-changelog', legacy: '/methodology/changelog', parent: 'methodology' },
  { name: 'ledger', module: 'ledger', group: 'proof', token: 'ledger', legacy: '/ledger' },
  { name: 'backtest', module: 'backtest', group: 'proof', token: 'backtest', legacy: '/backtest' },
  { name: 'issue', module: 'issue', group: 'proof', prefix: 'issue-', param: 'date', re: /^\d{4}-\d{2}-\d{2}$/, legacy: '/issue/:date' },
  { name: 'pick', module: 'pick', group: 'proof', prefix: 'p-', param: 'no', re: /^\d{4,5}$/, legacy: '/p/:no' },
  { name: 'stock', module: 'stock', group: 'proof', prefix: 's-', param: 'ticker', re: /^[A-Z]{1,5}$/, legacy: '/s/:ticker' },
  { name: 'disclosures', module: 'disclosures', group: 'proof', token: 'disclosures', legacy: '/disclosures' },
  { name: 'pricing', module: 'pricing', group: 'get', token: 'pricing', legacy: '/pricing' },
  // #join, or #join-signal / #join-research to preselect a tier (legacy: #/join?tier=signal)
  { name: 'join', module: 'join', group: 'get', token: 'join', prefix: 'join-', param: 'tier', re: /^(signal|research)$/, legacy: '/join', queryParam: 'tier' },
  { name: 'app', module: 'app', group: 'get', token: 'app', legacy: '/app' },
  { name: 'app-research', module: 'research', group: 'get', token: 'app-research', legacy: '/app/research', parent: 'app' },
  { name: 'account', module: 'account', group: 'get', token: 'account', legacy: '/account' },
  { name: 'unsubscribe', module: 'unsubscribe', group: null, prefix: 'u-', param: 'token', re: /^[0-9A-Za-z]{6,64}$/, legacy: '/u/:token' },
  { name: 'help', module: 'help', group: null, token: 'help', legacy: '/help' },
  { name: 'status', module: 'status', group: null, token: 'status', legacy: '/status' },
  { name: 'about', module: 'about', group: null, token: 'about', legacy: '/about' },
  { name: 'legal', module: 'legal', group: null, prefix: 'legal-', param: 'doc', re: /^(terms|privacy|sms|imprint|cookies)$/, legacy: '/legal/:doc' },
];

export const NOT_FOUND = { name: 'not-found', module: 'not-found', group: null };

const BY_NAME = new Map(ROUTES.map((r) => [r.name, r]));
const SECTION_RE = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9._~-]*$/;
// In-page ids the shell uses (skip link target); never routes.
const RESERVED = new Set(['view', 'main-content']);

// Build a canonical link: href('ledger') -> '#ledger'; href('pick', '0052') -> '#p-0052';
// href('ledger', null, 'scoreboard') -> '#ledger~scoreboard'; href('home') -> '#'.
export function href(name, param, section) {
  const r = BY_NAME.get(name);
  if (!r) throw new Error(`href: unknown route "${name}"`);
  let token;
  if (param !== undefined && param !== null && param !== '' && r.prefix) token = `${r.prefix}${param}`;
  else if (r.token !== undefined) token = r.token;
  else throw new Error(`href: route "${name}" needs a ${r.param}`);
  const sec = section && SECTION_RE.test(section) ? `~${section}` : '';
  if (!token && sec) token = 'home';
  return `#${token}${sec}`;
}

// '#/issue/2026-09-28?x=1' -> { path: '/issue/2026-09-28', query: {x: '1'} }  (the legacy slash form)
export function parseHash(hash) {
  let h = String(hash ?? '');
  if (h.startsWith('#')) h = h.slice(1);
  if (!h.startsWith('/')) h = `/${h}`;
  const qi = h.indexOf('?');
  const rawPath = qi >= 0 ? h.slice(0, qi) : h;
  const query = {};
  if (qi >= 0) {
    for (const [k, v] of new URLSearchParams(h.slice(qi + 1))) query[k] = v;
  }
  let path = rawPath.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/$/, '');
  try {
    path = decodeURI(path);
  } catch {
    /* keep the raw path; it will 404 */
  }
  return { path, query };
}

// True when the router should handle this hash. Every hash is a route except the shell's own
// in-page ids and strings that cannot be tokens (the browser may leave those behind).
export function isRouteHash(hash) {
  if (!hash || hash === '#') return true;
  if (hash.startsWith('#/')) return true;
  const tok = hash.slice(1);
  return TOKEN_RE.test(tok) && !RESERVED.has(tok);
}

function result(r, params, { query = {}, section = null, legacy = false }) {
  const token = r.prefix && params[r.param] !== undefined ? `${r.prefix}${params[r.param]}` : r.token;
  const hash = section ? `#${token || 'home'}~${section}` : `#${token}`;
  return {
    name: r.name,
    module: r.module,
    group: r.group,
    parent: r.parent ?? null,
    params,
    query,
    section,
    token,
    hash,
    pathname: token === '' ? '#' : `#${token}`,
    legacy,
  };
}

function notFound(raw, { query = {}, legacy = false } = {}) {
  return { ...NOT_FOUND, parent: null, params: {}, query, section: null, token: raw, hash: `#${raw}`, pathname: `#${raw}`, legacy };
}

function matchFlat(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [base, sec] = raw.split('~');
  const section = sec && SECTION_RE.test(sec) ? sec : null;
  const tok = base === 'home' ? '' : base;
  for (const r of ROUTES) {
    if (r.token !== undefined && r.token === tok) return result(r, {}, { section });
  }
  for (const r of ROUTES) {
    if (!r.prefix || !tok.startsWith(r.prefix)) continue;
    const v = tok.slice(r.prefix.length);
    if (!r.re || r.re.test(v)) return result(r, { [r.param]: v }, { section });
  }
  return notFound(raw);
}

function matchLegacy(hash) {
  const { path, query } = parseHash(hash);
  const parts = path.split('/').filter(Boolean);
  const section = query.s && SECTION_RE.test(query.s) ? query.s : null;
  for (const r of ROUTES) {
    const rparts = r.legacy.split('/').filter(Boolean);
    if (rparts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rparts.length; i++) {
      const rp = rparts[i];
      if (rp.startsWith(':')) {
        const name = rp.slice(1);
        if (r.re && !r.re.test(parts[i])) {
          ok = false;
          break;
        }
        params[name] = parts[i];
      } else if (rp !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (r.queryParam && query[r.queryParam] && (!r.re || r.re.test(query[r.queryParam]))) params[r.param] = query[r.queryParam];
    const rest = { ...query };
    delete rest.s;
    if (r.queryParam) delete rest[r.queryParam];
    return result(r, params, { query: rest, section, legacy: true });
  }
  return notFound(path.replace(/^\//, '').replace(/\//g, '-'), { query, legacy: true });
}

// Resolve a hash (flat or legacy) to its route: { name, module, group, parent, params, query,
// section, token, hash (canonical), pathname (for display), legacy }.
export function matchRoute(hash) {
  const h = String(hash ?? '');
  if (h.startsWith('#/') || h.startsWith('/')) return matchLegacy(h);
  return matchFlat(h);
}

// The canonical flat hash for any accepted form ('#/p/0052' -> '#p-0052'); null for a 404.
export function canonicalHash(hash) {
  const r = matchRoute(hash);
  return r.name === 'not-found' ? null : r.hash;
}

// The route a rendered link points at (for aria-current and prefetching).
export function routeOfHref(value) {
  const v = String(value ?? '');
  if (!v.startsWith('#')) return null;
  return matchRoute(v);
}
