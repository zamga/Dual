// @ts-check
/**
 * Napoved · isobar field.
 *
 * A pressure field p(x, y, t) is the sum of Gaussian highs and lows (slow orbit), two octaves of smooth
 * domain-warped sine noise and an optional pointer low. Isobars are drawn with abs(fract(p / spacing) - .5)
 * and fwidth antialiasing; every 5th line is heavier. The same field is mirrored in JS (evaluate) so DOM
 * labels can sit exactly on the lines. Renderer: WebGL2, then WebGL1 + OES_standard_derivatives, then a
 * Canvas2D marching-squares fallback.
 *
 * Coordinates are "width units": CSS pixels divided by the canvas CSS width, origin top-left, y down.
 */
(function () {
  'use strict';

  /**
   * @typedef {{ x: number, y: number, amp: number, sigma: number, orbit?: number, phase?: number, speed?: number }} PSystem
   * @typedef {{ x: number, y: number, rx: number, ry: number }} Gap
   * @typedef {{ x0: number, y0: number, x1: number, y1: number, min: number, soft: number }} Fade
   * @typedef {{
   *   base: number, spacing: number,
   *   line: [number, number, number], alphaMinor: number, alphaMajor: number,
   *   widthMinor?: number, widthMajor?: number,
   *   tintLow?: [number, number, number], tintHigh?: [number, number, number], tintAlpha?: number, tintRange?: number,
   *   noise?: [number, number, number, number],
   *   pointer?: { amp: number, sigma: number },
   *   dprCap?: number,
   *   timeScale?: number,
   *   preserve?: boolean,
   *   onFrame?: (field: IsobarField, t: number) => void
   * }} FieldOptions
   */

  const MAX = 8;

  /**
   * Domain-warped sine noise in [-1, 1]. Mirrored exactly in GLSL.
   * @param {number} x @param {number} y @returns {number}
   */
  function snoise(x, y) {
    return (Math.sin(x + Math.sin(y * 0.73) * 1.3) * Math.cos(y * 1.09 - Math.sin(x * 0.61) * 1.1) +
      0.5 * Math.sin(x * 1.93 - y * 1.37 + 1.7)) / 1.5;
  }

  const FRAG_BODY = `
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_time;
uniform float u_base;
uniform float u_spacing;
uniform int u_count;
uniform vec4 u_sys[${MAX}];
uniform vec4 u_orb[${MAX}];
uniform vec4 u_ptr;
uniform float u_ptrSigma;
uniform vec4 u_noise;
uniform vec3 u_line;
uniform vec2 u_alpha;
uniform vec2 u_width;
uniform vec3 u_tintLow;
uniform vec3 u_tintHigh;
uniform vec2 u_tint;
uniform int u_gapCount;
uniform vec4 u_gap[${MAX}];
uniform vec4 u_fade;
uniform vec2 u_fadeAmt;

float snoise(vec2 p) {
  return (sin(p.x + sin(p.y * 0.73) * 1.3) * cos(p.y * 1.09 - sin(p.x * 0.61) * 1.1)
        + 0.5 * sin(p.x * 1.93 - p.y * 1.37 + 1.7)) / 1.5;
}

float field(vec2 q) {
  float p = u_base;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= u_count) break;
    vec4 s = u_sys[i];
    vec4 o = u_orb[i];
    vec2 c = s.xy + o.x * vec2(cos(u_time * o.z + o.y), sin(u_time * o.z * 0.8 + o.y));
    vec2 d = q - c;
    p += s.z * exp(-dot(d, d) / (2.0 * s.w * s.w));
  }
  float t = u_time;
  p += u_noise.x * snoise(q * u_noise.z + vec2(t * 0.11, -t * 0.08));
  p += u_noise.y * snoise(q * u_noise.w + vec2(-t * 0.09 + 3.1, t * 0.12 + 1.3));
  vec2 dp = q - u_ptr.xy;
  p -= u_ptr.z * u_ptr.w * exp(-dot(dp, dp) / (2.0 * u_ptrSigma * u_ptrSigma));
  return p;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 q = frag / u_res.x;
  float p = field(q);
  float v = p / u_spacing;
  float fw = max(fwidth(v), 1e-6);
  float d = abs(fract(v + 0.5) - 0.5);
  float idx = floor(v + 0.5);
  float major = 1.0 - step(0.5, abs(mod(idx, 5.0)));
  float halfW = 0.5 * mix(u_width.x, u_width.y, major) * u_dpr;
  float dist = d / fw;
  float lineA = 1.0 - smoothstep(halfW - 0.55, halfW + 0.55, dist);
  float density = 1.0 - smoothstep(0.16, 0.34, fw);
  float a = lineA * mix(u_alpha.x, u_alpha.y, major) * density;

  for (int i = 0; i < ${MAX}; i++) {
    if (i >= u_gapCount) break;
    vec4 g = u_gap[i];
    vec2 e = (q - g.xy) / g.zw;
    a *= smoothstep(0.8, 1.0, length(e));
  }

  float dx = max(u_fade.x - q.x, q.x - u_fade.z);
  float dy = max(u_fade.y - q.y, q.y - u_fade.w);
  float outside = max(dx, dy);
  a *= mix(u_fadeAmt.x, 1.0, smoothstep(-u_fadeAmt.y, u_fadeAmt.y, outside));

  float n = clamp((p - u_base) / u_tint.y, -1.0, 1.0);
  vec3 tc = n < 0.0 ? u_tintLow : u_tintHigh;
  float ta = n * n * u_tint.x;
  vec3 col = u_line * a + tc * ta * (1.0 - a);
  float alpha = a + ta * (1.0 - a);
  OUT_COLOR = vec4(col, alpha);
}
`;

  const VERT2 = '#version 300 es\nin vec2 a_pos;\nvoid main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';
  const VERT1 = 'attribute vec2 a_pos;\nvoid main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';
  const FRAG2 = '#version 300 es\nprecision highp float;\nout vec4 outColor;\n#define OUT_COLOR outColor\n' + FRAG_BODY;
  const FRAG1 = '#extension GL_OES_standard_derivatives : enable\nprecision highp float;\n#define OUT_COLOR gl_FragColor\n' + FRAG_BODY;

  /** @param {number} hex @returns {[number, number, number]} */
  function rgb(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }

  class IsobarField {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {FieldOptions} opts
     */
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.o = Object.assign({
        widthMinor: 1, widthMajor: 1.6,
        tintLow: [0, 0, 0], tintHigh: [0, 0, 0], tintAlpha: 0, tintRange: 26,
        noise: [2.4, 0.9, 6.0, 13.0],
        dprCap: 2, timeScale: 1, preserve: false,
      }, opts);
      /** @type {PSystem[]} */ this.systems = [];
      /** @type {Gap[]} */ this.gaps = [];
      /** @type {Fade} */ this.fade = { x0: 0, y0: 0, x1: 0, y1: 0, min: 1, soft: 0.01 };
      this.ptr = { x: 0.5, y: 0.3, amt: 0, tx: 0.5, ty: 0.3, tamt: 0 };
      this.t = 0;
      this.w = 1; this.h = 1; this.dpr = 1;
      this.running = false;
      this.visible = true;
      this.raf = 0;
      this.last = 0;
      /** @type {WebGL2RenderingContext | WebGLRenderingContext | null} */ this.gl = null;
      /** @type {CanvasRenderingContext2D | null} */ this.ctx2d = null;
      /** @type {Record<string, WebGLUniformLocation | null>} */ this.u = {};
      this.mode = 'none';
      this._init();
      this._observe();
    }

    _init() {
      const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: !!this.o.preserve, powerPreference: /** @type {'low-power'} */ ('low-power') };
      /** @type {any} */ let gl = null;
      let v2 = false;
      try { gl = this.canvas.getContext('webgl2', attrs); v2 = !!gl; } catch (e) { gl = null; }
      if (!gl) {
        try {
          gl = this.canvas.getContext('webgl', attrs) || this.canvas.getContext('experimental-webgl', attrs);
          if (gl && !gl.getExtension('OES_standard_derivatives')) gl = null;
        } catch (e) { gl = null; }
      }
      if (gl && this._program(gl, v2)) {
        this.gl = gl; this.mode = v2 ? 'webgl2' : 'webgl1';
        this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.stop(); this.gl = null; this._fallback(); }, { once: true });
      } else {
        this._fallback();
      }
    }

    _fallback() {
      try {
        // a fresh canvas is needed if a GL context was attempted on this one
        const c = /** @type {HTMLCanvasElement} */ (this.canvas.cloneNode(false));
        this.canvas.replaceWith(c);
        this.canvas = c;
        this.ctx2d = c.getContext('2d');
        this.mode = this.ctx2d ? 'canvas2d' : 'none';
      } catch (e) { this.mode = 'none'; }
    }

    /** @param {any} gl @param {boolean} v2 @returns {boolean} */
    _program(gl, v2) {
      /** @param {number} type @param {string} src */
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[isobars]', gl.getShaderInfoLog(s)); return null; }
        return s;
      };
      const vs = sh(gl.VERTEX_SHADER, v2 ? VERT2 : VERT1);
      const fs = sh(gl.FRAGMENT_SHADER, v2 ? FRAG2 : FRAG1);
      if (!vs || !fs) return false;
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, 'a_pos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[isobars]', gl.getProgramInfoLog(p)); return false; }
      gl.useProgram(p);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const names = ['u_res', 'u_dpr', 'u_time', 'u_base', 'u_spacing', 'u_count', 'u_sys', 'u_orb', 'u_ptr', 'u_ptrSigma', 'u_noise',
        'u_line', 'u_alpha', 'u_width', 'u_tintLow', 'u_tintHigh', 'u_tint', 'u_gapCount', 'u_gap', 'u_fade', 'u_fadeAmt'];
      for (const n of names) this.u[n] = gl.getUniformLocation(p, n.endsWith('sys') || n.endsWith('orb') || n.endsWith('gap') ? n + '[0]' : n) || gl.getUniformLocation(p, n);
      gl.disable(gl.BLEND);
      return true;
    }

    _observe() {
      if ('ResizeObserver' in window) {
        this.ro = new ResizeObserver(() => { this.resize(); if (!this.running) this.render(); });
        this.ro.observe(this.canvas);
      }
      if ('IntersectionObserver' in window) {
        this.io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            this.visible = e.isIntersecting;
            if (this.visible && this.running) this._loop();
          }
        }, { rootMargin: '80px' });
        this.io.observe(this.canvas);
      }
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.running) this._loop(); });
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      const dpr = Math.min(window.devicePixelRatio || 1, this.o.dprCap || 2);
      this.w = w; this.h = h; this.dpr = dpr;
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    }

    /** @param {PSystem[]} s */
    setSystems(s) { this.systems = s.slice(0, MAX); }
    /** @param {Gap[]} g */
    setGaps(g) { this.gaps = g.slice(0, MAX); }
    /** @param {Fade} f */
    setFade(f) { this.fade = f; }

    /**
     * Point the pointer low at (x, y) in width units; amt 0..1 is the target strength.
     * @param {number} x @param {number} y @param {number} amt @param {boolean} [snap]
     */
    setPointer(x, y, amt, snap) {
      this.ptr.tx = x; this.ptr.ty = y; this.ptr.tamt = amt;
      if (snap) { this.ptr.x = x; this.ptr.y = y; this.ptr.amt = amt; }
    }

    /**
     * Field value at (x, y) in width units, time t. Mirrors the shader.
     * @param {number} x @param {number} y @param {number} [t] @returns {number}
     */
    evaluate(x, y, t = this.t) {
      const o = this.o;
      let p = o.base;
      for (const s of this.systems) {
        const orb = s.orbit || 0, sp = s.speed || 0, ph = s.phase || 0;
        const cx = s.x + orb * Math.cos(t * sp + ph), cy = s.y + orb * Math.sin(t * sp * 0.8 + ph);
        const dx = x - cx, dy = y - cy;
        p += s.amp * Math.exp(-(dx * dx + dy * dy) / (2 * s.sigma * s.sigma));
      }
      const n = /** @type {[number, number, number, number]} */ (o.noise);
      p += n[0] * snoise(x * n[2] + t * 0.11, y * n[2] - t * 0.08);
      p += n[1] * snoise(x * n[3] - t * 0.09 + 3.1, y * n[3] + t * 0.12 + 1.3);
      if (o.pointer) {
        const dx = x - this.ptr.x, dy = y - this.ptr.y, sg = o.pointer.sigma;
        p -= this.ptr.amt * o.pointer.amp * Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg));
      }
      return p;
    }

    /**
     * March from (x, y) along angle (radians, screen space) until the field crosses `value`.
     * @param {number} x @param {number} y @param {number} angle @param {number} value @param {number} [maxDist]
     * @returns {{x: number, y: number} | null}
     */
    crossing(x, y, angle, value, maxDist = 0.4) {
      const step = 0.0025, ca = Math.cos(angle), sa = Math.sin(angle);
      let prev = this.evaluate(x, y) - value;
      for (let d = step; d <= maxDist; d += step) {
        const px = x + ca * d, py = y + sa * d;
        const cur = this.evaluate(px, py) - value;
        if ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) {
          let lo = d - step, hi = d;
          for (let k = 0; k < 14; k++) {
            const mid = (lo + hi) / 2;
            const v = this.evaluate(x + ca * mid, y + sa * mid) - value;
            if ((prev <= 0 && v > 0) || (prev >= 0 && v < 0)) hi = mid; else lo = mid;
          }
          const dd = (lo + hi) / 2;
          return { x: x + ca * dd, y: y + sa * dd };
        }
        prev = cur;
      }
      return null;
    }

    /** @param {number} [t] */
    render(t) {
      if (typeof t === 'number') this.t = t;
      if (this.o.onFrame) this.o.onFrame(this, this.t);
      if (this.gl) this._renderGL();
      else if (this.ctx2d) this._render2D();
    }

    _renderGL() {
      const gl = /** @type {WebGLRenderingContext} */ (this.gl), u = this.u, o = this.o;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.uniform2f(u.u_res, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.u_dpr, this.canvas.width / this.w);
      gl.uniform1f(u.u_time, this.t);
      gl.uniform1f(u.u_base, o.base);
      gl.uniform1f(u.u_spacing, o.spacing);
      const sys = new Float32Array(MAX * 4), orb = new Float32Array(MAX * 4);
      this.systems.forEach((s, i) => {
        sys.set([s.x, s.y, s.amp, s.sigma], i * 4);
        orb.set([s.orbit || 0, s.phase || 0, s.speed || 0, 0], i * 4);
      });
      gl.uniform1i(u.u_count, this.systems.length);
      gl.uniform4fv(u.u_sys, sys);
      gl.uniform4fv(u.u_orb, orb);
      const p = o.pointer || { amp: 0, sigma: 0.1 };
      gl.uniform4f(u.u_ptr, this.ptr.x, this.ptr.y, this.ptr.amt, p.amp);
      gl.uniform1f(u.u_ptrSigma, p.sigma);
      const n = /** @type {number[]} */ (o.noise);
      gl.uniform4f(u.u_noise, n[0], n[1], n[2], n[3]);
      gl.uniform3fv(u.u_line, o.line);
      gl.uniform2f(u.u_alpha, o.alphaMinor, o.alphaMajor);
      gl.uniform2f(u.u_width, /** @type {number} */ (o.widthMinor), /** @type {number} */ (o.widthMajor));
      gl.uniform3fv(u.u_tintLow, /** @type {number[]} */ (o.tintLow));
      gl.uniform3fv(u.u_tintHigh, /** @type {number[]} */ (o.tintHigh));
      gl.uniform2f(u.u_tint, /** @type {number} */ (o.tintAlpha), /** @type {number} */ (o.tintRange));
      const gaps = new Float32Array(MAX * 4);
      this.gaps.forEach((g, i) => gaps.set([g.x, g.y, Math.max(g.rx, 1e-4), Math.max(g.ry, 1e-4)], i * 4));
      gl.uniform1i(u.u_gapCount, this.gaps.length);
      gl.uniform4fv(u.u_gap, gaps);
      const f = this.fade;
      gl.uniform4f(u.u_fade, f.x0, f.y0, f.x1, f.y1);
      gl.uniform2f(u.u_fadeAmt, f.min, f.soft);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** Canvas2D fallback: marching squares over a coarse grid. */
    _render2D() {
      const ctx = /** @type {CanvasRenderingContext2D} */ (this.ctx2d);
      const W = this.w, H = this.h, dpr = this.canvas.width / W, o = this.o;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cell = 7;
      const cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
      const vals = new Float32Array(cols * rows);
      let mn = Infinity, mx = -Infinity;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const v = this.evaluate((i * cell) / W, (j * cell) / W);
        vals[j * cols + i] = v; if (v < mn) mn = v; if (v > mx) mx = v;
      }
      const c = o.line.map((x) => Math.round(x * 255)).join(',');
      for (let lv = Math.ceil(mn / o.spacing) * o.spacing; lv <= mx; lv += o.spacing) {
        const major = Math.round(lv / o.spacing) % 5 === 0;
        ctx.beginPath();
        for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
          const a = vals[j * cols + i], b = vals[j * cols + i + 1], d = vals[(j + 1) * cols + i], e = vals[(j + 1) * cols + i + 1];
          const x = i * cell, y = j * cell;
          /** @type {[number, number][]} */ const pts = [];
          if ((a < lv) !== (b < lv)) pts.push([x + ((lv - a) / (b - a)) * cell, y]);
          if ((b < lv) !== (e < lv)) pts.push([x + cell, y + ((lv - b) / (e - b)) * cell]);
          if ((d < lv) !== (e < lv)) pts.push([x + ((lv - d) / (e - d)) * cell, y + cell]);
          if ((a < lv) !== (d < lv)) pts.push([x, y + ((lv - a) / (d - a)) * cell]);
          if (pts.length >= 2) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); }
          if (pts.length === 4) { ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[3][0], pts[3][1]); }
        }
        ctx.strokeStyle = `rgba(${c},${major ? o.alphaMajor : o.alphaMinor})`;
        ctx.lineWidth = major ? /** @type {number} */ (o.widthMajor) : /** @type {number} */ (o.widthMinor);
        ctx.stroke();
      }
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      this._loop();
    }

    stop() { this.running = false; cancelAnimationFrame(this.raf); }

    _loop() {
      cancelAnimationFrame(this.raf);
      const tick = (/** @type {number} */ now) => {
        if (!this.running || !this.visible || document.hidden) { this.last = 0; return; }
        const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
        this.last = now;
        this.t += dt * (this.o.timeScale || 1);
        const k = 1 - Math.pow(1 - 0.08, dt * 60);
        const kr = 1 - Math.pow(1 - 0.035, dt * 60);
        this.ptr.x += (this.ptr.tx - this.ptr.x) * k;
        this.ptr.y += (this.ptr.ty - this.ptr.y) * k;
        this.ptr.amt += (this.ptr.tamt - this.ptr.amt) * (this.ptr.tamt > this.ptr.amt ? k : kr);
        this.render();
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
  }

  /** @type {any} */ (window).NapovedIsobars = { IsobarField, snoise, rgb };
})();
