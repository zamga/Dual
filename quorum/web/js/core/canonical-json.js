// RFC 8785 JSON Canonicalization Scheme (JCS).
// The ledger hashes this string, so anyone can recompute a record's hash from its JSON
// in any language that implements JCS.

export function canonicalize(value) {
  return serialize(value, '$');
}

function serialize(v, path) {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(v)) throw new TypeError(`canonicalize: non-finite number at ${path}`);
      // ECMAScript Number#toString is exactly the JCS number serialisation; -0 becomes "0".
      return JSON.stringify(v);
    case 'string':
      return JSON.stringify(v);
    case 'object': {
      if (Array.isArray(v)) {
        return `[${v.map((x, i) => serialize(x, `${path}[${i}]`)).join(',')}]`;
      }
      if (typeof v.toJSON === 'function') return serialize(v.toJSON(), path);
      const keys = Object.keys(v).sort(compareUtf16);
      const parts = [];
      for (const k of keys) {
        if (v[k] === undefined) throw new TypeError(`canonicalize: undefined at ${path}.${k}`);
        parts.push(`${JSON.stringify(k)}:${serialize(v[k], `${path}.${k}`)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalize: unsupported ${typeof v} at ${path}`);
  }
}

// Sort by UTF-16 code units, as JCS requires (not by locale, not by code point).
function compareUtf16(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}
