// SHA-256 through WebCrypto, so the same code verifies the ledger on the server and in a browser.
import { canonicalize } from './canonical-json.js';

const encoder = new TextEncoder();

function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto (crypto.subtle) is not available in this context');
  return s;
}

export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  const digest = await subtle().digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

export async function hashCanonical(value) {
  return sha256Hex(canonicalize(value));
}

export function shortHash(hex, n = 8) {
  return String(hex).slice(0, n);
}

export function toHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Base62 token. With an rng it is deterministic (demo data); without one it uses the CSPRNG
// and rejection sampling so every character is uniform.
export function randomToken(len = 6, rng) {
  let out = '';
  if (rng) {
    for (let i = 0; i < len; i++) out += BASE62[Math.floor(rng() * 62)];
    return out;
  }
  const buf = new Uint8Array(len * 2);
  while (out.length < len) {
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < len; i++) {
      if (buf[i] < 248) out += BASE62[buf[i] % 62];
    }
  }
  return out;
}
