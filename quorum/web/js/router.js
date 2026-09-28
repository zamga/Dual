// Hash routes (ARCHITECTURE.md §5). Pure: no DOM, so tests import it in Node.
// Each route names a page module at js/pages/<module>.js that exports render(ctx).

export const ROUTES = [
  { path: '/', module: 'home', group: null },
  { path: '/how-it-works', module: 'how-it-works', group: 'how' },
  { path: '/methodology', module: 'methodology', group: 'how' },
  { path: '/methodology/changelog', module: 'changelog', group: 'how' },
  { path: '/ledger', module: 'ledger', group: 'proof' },
  { path: '/backtest', module: 'backtest', group: 'proof' },
  { path: '/issue/:date', module: 'issue', group: 'proof', params: { date: /^\d{4}-\d{2}-\d{2}$/ } },
  { path: '/p/:no', module: 'pick', group: 'proof', params: { no: /^\d{4,5}$/ } },
  { path: '/s/:ticker', module: 'stock', group: 'proof', params: { ticker: /^[A-Z]{1,5}$/ } },
  { path: '/disclosures', module: 'disclosures', group: 'proof' },
  { path: '/pricing', module: 'pricing', group: 'get' },
  { path: '/join', module: 'join', group: 'get' },
  { path: '/app', module: 'app', group: 'get' },
  { path: '/app/research', module: 'research', group: 'get' },
  { path: '/account', module: 'account', group: 'get' },
  { path: '/u/:token', module: 'unsubscribe', group: null, params: { token: /^[0-9A-Za-z]{6,64}$/ } },
  { path: '/help', module: 'help', group: null },
  { path: '/status', module: 'status', group: null },
  { path: '/about', module: 'about', group: null },
  { path: '/legal/:doc', module: 'legal', group: null, params: { doc: /^(terms|privacy|sms|imprint|cookies)$/ } },
];

export const NOT_FOUND = { path: '*', module: 'not-found', group: null };

// '#/issue/2026-09-28?x=1' -> { path: '/issue/2026-09-28', query: {x: '1'} }
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

// True when a hash is one of ours ('#/...' or empty); other hashes are in-page anchors.
export function isRouteHash(hash) {
  return !hash || hash === '#' || hash.startsWith('#/');
}

export function matchRoute(hash, routes = ROUTES) {
  const { path, query } = parseHash(hash);
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    const rparts = r.path.split('/').filter(Boolean);
    if (rparts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rparts.length; i++) {
      const rp = rparts[i];
      if (rp.startsWith(':')) {
        const name = rp.slice(1);
        const re = r.params?.[name];
        if (re && !re.test(parts[i])) {
          ok = false;
          break;
        }
        params[name] = parts[i];
      } else if (rp !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { ...r, params, query, pathname: path };
  }
  return { ...NOT_FOUND, params: {}, query, pathname: path };
}

export function href(path, query) {
  const q = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
  return `#${path}${q}`;
}
