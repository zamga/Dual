// HTTP plumbing on node:http: router, body limits (raw body kept for signature checks), cookies,
// HMAC-signed session cookies, security headers and per-IP rate limits. No framework.
import { createHmac, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  // new HttpError(status, code, message?, extra?) -> thrown by handlers, rendered as JSON
  constructor(status, code, message = code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// ------------------------------------------------------------------ router
// createRouter() -> { add(method, pattern, handler, opts), match(method, pathname) }
// pattern: '/api/phone/start', '/u/:token', '/data/:file'. Params match one path segment.
export function createRouter() {
  const routes = [];
  return {
    routes,
    add(method, pattern, handler, opts = {}) {
      const keys = [];
      const re = new RegExp(
        '^' +
          pattern.replace(/[.+*?^${}()|[\]\\]/g, '\\$&').replace(/\/:(\w+)/g, (_, k) => {
            keys.push(k);
            return '/([^/]+)';
          }) +
          '/?$',
      );
      routes.push({ method, pattern, re, keys, handler, opts });
      return this;
    },
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
        const params = {};
        r.keys.forEach((k, i) => {
          params[k] = decodeURIComponent(m[i + 1]);
        });
        return { route: r, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
}

// ------------------------------------------------------------------ bodies
// readBody(req, limit) -> Promise<Buffer>; rejects with 413 past the limit.
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new HttpError(413, 'body_too_large', `Request body over ${limit} bytes`));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, 'body_too_large', `Request body over ${limit} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    req.on('error', (e) => {
      if (!failed) reject(e);
    });
  });
}

export function mediaType(req) {
  return String(req.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

// parseBody(req, raw, accepts) -> parsed body. accepts: array of 'json' | 'form' | 'any'.
export function parseBody(req, raw, accepts) {
  const type = mediaType(req);
  if (type === 'application/json' && (accepts.includes('json') || accepts.includes('any'))) {
    if (raw.length === 0) return {};
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch {
      throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON');
    }
  }
  if (type === 'application/x-www-form-urlencoded' && (accepts.includes('form') || accepts.includes('any'))) {
    return Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
  }
  if (accepts.includes('empty') && raw.length === 0) return {};
  throw new HttpError(415, 'unsupported_media_type', `Content-Type must be ${accepts.map(mimeFor).filter(Boolean).join(' or ')}`);
}

function mimeFor(a) {
  return { json: 'application/json', form: 'application/x-www-form-urlencoded' }[a];
}

// ------------------------------------------------------------------ responses
export function sendJson(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(res.req?.method === 'HEAD' ? undefined : text);
}

export function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(html),
    ...headers,
  });
  res.end(res.req?.method === 'HEAD' ? undefined : html);
}

export function redirect(res, location, status = 303, headers = {}) {
  res.writeHead(status, { location, 'cache-control': 'no-store', 'content-length': 0, ...headers });
  res.end();
}

// ------------------------------------------------------------------ cookies
export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    let v = part.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, secure = false, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge != null) c += `; Max-Age=${Math.floor(maxAge)}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

export function appendHeader(res, name, value) {
  const prev = res.getHeader(name);
  if (prev == null) res.setHeader(name, value);
  else res.setHeader(name, [].concat(prev, value));
}

// ------------------------------------------------------------------ signed values (sessions)
// signValue(payload, secret) -> 'v1.<base64url json>.<base64url HMAC-SHA256>'
export function signValue(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret).update(`v1.${body}`).digest('base64url');
  return `v1.${body}.${mac}`;
}

// verifySignedValue(token, secret, nowMs) -> payload | null (null when tampered, malformed or past payload.exp)
export function verifySignedValue(token, secret, nowMs = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const expected = createHmac('sha256', secret).update(`v1.${parts[1]}`).digest();
  let given;
  try {
    given = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.exp === 'number' && payload.exp <= nowMs) return null;
  return payload;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ------------------------------------------------------------------ security headers
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Inline style attributes are used by the web renderer; styles still load only from self and Google Fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders({ https = false } = {}) {
  const h = {
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
  if (https) h['strict-transport-security'] = 'max-age=63072000; includeSubDomains';
  return h;
}

// ------------------------------------------------------------------ client IP
// clientIp(req, trustProxy) -> string. With trustProxy = n, the n-th address from the right of
// X-Forwarded-For is the client (each trusted proxy appends the address it saw).
export function clientIp(req, trustProxy = 0) {
  const socketIp = req.socket?.remoteAddress || '';
  if (trustProxy > 0) {
    const xff = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (xff.length >= trustProxy) return normalizeIp(xff[xff.length - trustProxy]);
  }
  return normalizeIp(socketIp);
}

function normalizeIp(ip) {
  return String(ip).replace(/^::ffff:/, '');
}

// ------------------------------------------------------------------ rate limits
// createRateLimiter({ clock }) -> { take(bucket, key, {capacity, windowMs}) -> {ok, retryAfterSec, remaining}, reset() }
// Token bucket: `capacity` tokens, refilled continuously so the bucket is full again after windowMs.
export function createRateLimiter({ clock = () => new Date() } = {}) {
  const buckets = new Map();
  let lastSweep = 0;
  function sweep(now) {
    if (now - lastSweep < 60_000 && buckets.size < 50_000) return;
    lastSweep = now;
    for (const [k, b] of buckets) if (now - b.t > b.windowMs) buckets.delete(k);
  }
  return {
    take(bucket, key, { capacity, windowMs }) {
      const now = clock().getTime();
      sweep(now);
      const id = `${bucket}\u0000${key}`;
      let b = buckets.get(id);
      if (!b) {
        b = { tokens: capacity, t: now, windowMs };
        buckets.set(id, b);
      }
      const rate = capacity / windowMs; // tokens per ms
      b.tokens = Math.min(capacity, b.tokens + (now - b.t) * rate);
      b.t = now;
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 };
      }
      return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((1 - b.tokens) / rate / 1000)) };
    },
    reset() {
      buckets.clear();
    },
    size: () => buckets.size,
  };
}
