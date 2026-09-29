// The Assembly's WebGL engine: raw WebGL2, or WebGL1 with ANGLE_instanced_arrays. No library, no textures.
// Four passes: the Night ground with its grain, the columns and floor (one instanced cube), the grains
// (one instanced quad, 5,404 instances), and the screen-space light of the lintel and the rule slab.
import { BG_VS, BG_FS, BOX_VS, BOX_FS, GRAIN_VS, GRAIN_FS, BEAM_VS, BEAM_FS } from './shaders.js';
import { MOTE } from './level-data.js';

// GLSL ES 1.00 -> 3.00 for a WebGL2 context
// (fragment shaders write FRAG)
function port(src, vertex, v2) {
  if (!v2) return vertex ? src : `#define FRAG gl_FragColor\n${src}`;
  const head = vertex ? '#version 300 es\n#define attribute in\n#define varying out\n' : '#version 300 es\n#define varying in\nout highp vec4 q_frag;\n#define FRAG q_frag\n';
  return head + src;
}

export function openContext(canvas, { webgl1 = false } = {}) {
  const opts = { antialias: false, alpha: false, depth: true, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  let gl = null;
  let v2 = false;
  try {
    if (!webgl1) gl = canvas.getContext('webgl2', opts);
    v2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', opts);
  } catch {
    gl = null;
  }
  if (!gl) return null;
  let inst;
  if (v2) inst = { div: (l, n) => gl.vertexAttribDivisor(l, n), draw: (m, f, c, n) => gl.drawArraysInstanced(m, f, c, n) };
  else {
    const x = gl.getExtension('ANGLE_instanced_arrays');
    if (!x) return null;
    inst = { div: (l, n) => x.vertexAttribDivisorANGLE(l, n), draw: (m, f, c, n) => x.drawArraysInstancedANGLE(m, f, c, n) };
  }
  return { gl, v2, inst };
}

function program(gl, v2, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, port(src, type === gl.VERTEX_SHADER, v2));
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const u = {};
  const a = {};
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) {
    const info = gl.getActiveAttrib(p, i);
    a[info.name] = gl.getAttribLocation(p, info.name);
  }
  return { p, u, a };
}

// A unit cube (36 vertices): position and normal
function cube() {
  const F = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ];
  const out = [];
  for (const [n, u, v] of F) {
    const c = (s, t) => [0, 1, 2].map((i) => n[i] * 0.5 + u[i] * s * 0.5 + v[i] * t * 0.5);
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) out.push(...c(s, t), ...n);
  }
  return new Float32Array(out);
}

const QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);

// model: { motes (Float32Array, MOTE floats each), count }, colors: { night, mist, ultra, lift } as [r,g,b] 0..1
export function createGLEngine(canvas, model, colors, { onLost, webgl1 = false } = {}) {
  const ctx = openContext(canvas, { webgl1 });
  if (!ctx) return null;
  const { gl, v2, inst } = ctx;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe|software|basic render/i.test(dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '');
  let P;
  try {
    P = {
      bg: program(gl, v2, BG_VS, BG_FS),
      box: program(gl, v2, BOX_VS, BOX_FS),
      grain: program(gl, v2, GRAIN_VS, GRAIN_FS),
      beam: program(gl, v2, BEAM_VS, BEAM_FS),
    };
  } catch (e) {
    console.warn('Quorum: WebGL program failed, using the canvas', e);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  const buf = (data) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  };
  const quad = buf(QUAD);
  const tri = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));
  const cubeBuf = buf(cube());
  // expand: one vertex per quad corner instead of instancing (software renderers pay per instance)
  const expand = model.expand ?? software;
  let moteBuf;
  if (expand) {
    const n = model.motes.length / MOTE;
    const ST = MOTE + 2;
    const out = new Float32Array(n * 6 * ST);
    let o = 0;
    for (let i = 0; i < n; i++)
      for (let v = 0; v < 6; v++) {
        out[o++] = QUAD[v * 2];
        out[o++] = QUAD[v * 2 + 1];
        out.set(model.motes.subarray(i * MOTE, i * MOTE + MOTE), o);
        o += MOTE;
      }
    moteBuf = buf(out);
  } else moteBuf = buf(model.motes);
  const boxBuf = gl.createBuffer();
  const nMotes = model.motes.length / MOTE;

  // attribute binding: [loc, buffer, size, stride(floats), offset(floats), divisor]
  const bound = [];
  function bind(list) {
    for (const [loc, b, size, stride, off, div] of list) {
      if (loc === undefined || loc < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4);
      inst.div(loc, div);
      bound.push(loc);
    }
  }
  function unbind() {
    while (bound.length) {
      const l = bound.pop();
      inst.div(l, 0);
      gl.disableVertexAttribArray(l);
    }
  }

  let lost = false;
  const onLoss = (e) => {
    e.preventDefault();
    lost = true;
    onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLoss);
  let W = 0;
  let H = 0;
  let dpr = 1;
  let boxes = 0;

  return {
    kind: 'webgl',
    api: v2 ? 'webgl2' : 'webgl1',
    software,
    instanced: !expand,
    el: canvas,
    resize(w, h, d, L) {
      W = w;
      H = h;
      dpr = d;
      canvas.width = Math.max(1, Math.round(w * d));
      canvas.height = Math.max(1, Math.round(h * d));
      gl.viewport(0, 0, canvas.width, canvas.height);
      // columns: 0.05 x H x 0.05 on the four rules, from the floor to above the frame; the floor slab
      const top = 6;
      const bh = top - L.floorY;
      const data = [];
      for (const x of L.colX) data.push(x, L.floorY + bh / 2, 0, 0, 0.05, bh, 0.05);
      data.push(L.cc[0], L.floorY - 0.05, -1, 1, 80, 0.1, 12);
      boxes = data.length / 7;
      gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    },
    // f: { vp, eye, S (scene), time, L, ag, dim, beam: {a, b, half, int} | null, slab: {a, b, half, int} | null }
    draw(f) {
      if (lost || !W) return;
      const L = f.L;
      const on = f.passes ?? 15; // bit mask of the four passes (benchmarks switch them off one by one)
      // 1 ground and grain
      gl.disable(gl.DEPTH_TEST);
      if (!(on & 1)) gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(P.bg.p);
      gl.uniform3fv(P.bg.u.u_night, colors.night);
      gl.uniform1f(P.bg.u.u_grain, 0.035);
      bind([[P.bg.a.a_corner, tri, 2, 2, 0, 0]]);
      if (on & 1) gl.drawArrays(gl.TRIANGLES, 0, 3);
      unbind();
      // 2 columns and floor
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.useProgram(P.box.p);
      gl.uniformMatrix4fv(P.box.u.u_vp, false, f.vp);
      gl.uniform3fv(P.box.u.u_mist, colors.mist);
      gl.uniform3fv(P.box.u.u_night, colors.night);
      gl.uniform3fv(P.box.u.u_eye, f.eye);
      gl.uniform1f(P.box.u.u_dim, f.dim);
      gl.uniform1f(P.box.u.u_floorY, L.floorY);
      bind([
        [P.box.a.a_pos, cubeBuf, 3, 6, 0, 0],
        [P.box.a.a_nrm, cubeBuf, 3, 6, 3, 0],
        [P.box.a.a_bc, boxBuf, 4, 7, 0, 1],
        [P.box.a.a_bs, boxBuf, 3, 7, 4, 1],
      ]);
      if (on & 2) inst.draw(gl.TRIANGLES, 0, 36, boxes);
      unbind();
      // 3 grains: additive, tested against the columns, never written
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(P.grain.p);
      const u = P.grain.u;
      gl.uniformMatrix4fv(u.u_vp, false, f.vp);
      gl.uniform4f(u.u_colX, L.colX[0], L.colX[1], L.colX[2], L.colX[3]);
      gl.uniform4f(u.u_lay, L.y0, L.yH, L.floorY, L.thr);
      gl.uniform4f(u.u_cc, L.cc[0], L.cc[1], L.cc[2], L.bay);
      gl.uniform3f(u.u_cr, L.cr[0], L.cr[1], L.cr[2]);
      gl.uniform4f(u.u_sc, f.S.vote, f.S.fall, f.S.brighten, f.time);
      gl.uniform4f(u.u_ag, f.ag[0], f.ag[1], f.ag[2], f.ag[3]);
      gl.uniform4f(u.u_px, (H * dpr) / (2 * Math.tan((28 * Math.PI) / 360)), 1.1 * dpr, W * dpr, H * dpr);
      gl.uniform3fv(u.u_mist, colors.mist);
      gl.uniform1f(u.u_dim, f.dim);
      // additive grains saturate on narrow screens: the same 5,404 grains share a narrower cloud
      gl.uniform1f(u.u_gain, Math.min(1, Math.max(0.4, W / 1440)));
      const a = P.grain.a;
      if (expand) {
        const ST = MOTE + 2;
        bind([
          [a.a_corner, moteBuf, 2, ST, 0, 0],
          [a.a_pct, moteBuf, 4, ST, 2, 0],
          [a.a_r, moteBuf, 4, ST, 6, 0],
          [a.a_c, moteBuf, 4, ST, 10, 0],
          [a.a_pick, moteBuf, 1, ST, 14, 0],
        ]);
        if (on & 4) gl.drawArrays(gl.TRIANGLES, 0, nMotes * 6);
      } else {
        bind([
          [a.a_corner, quad, 2, 2, 0, 0],
          [a.a_pct, moteBuf, 4, MOTE, 0, 1],
          [a.a_r, moteBuf, 4, MOTE, 4, 1],
          [a.a_c, moteBuf, 4, MOTE, 8, 1],
          [a.a_pick, moteBuf, 1, MOTE, 12, 1],
        ]);
        if (on & 4) inst.draw(gl.TRIANGLES, 0, 6, nMotes);
      }
      unbind();
      // 4 screen-space light: the rule slab, then the lintel
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(P.beam.p);
      const b = P.beam.u;
      gl.uniform2f(b.u_res, W * dpr, H * dpr);
      gl.uniform1f(b.u_dpr, dpr);
      gl.uniform3fv(b.u_ultra, colors.ultra);
      gl.uniform3fv(b.u_lift, colors.lift);
      gl.uniform3fv(b.u_mist, colors.mist);
      bind([[P.beam.a.a_corner, quad, 2, 2, 0, 0]]);
      for (const [q, mode, pad] of [[f.slab, 1, 1], [f.beam, 0, 24]]) {
        if (!q || q.int <= 0.001 || !(on & 8)) continue;
        gl.uniform2f(b.u_a, q.a[0] * dpr, q.a[1] * dpr);
        gl.uniform2f(b.u_b, q.b[0] * dpr, q.b[1] * dpr);
        gl.uniform1f(b.u_half, q.half * dpr);
        gl.uniform1f(b.u_pad, pad * dpr);
        gl.uniform1f(b.u_mode, mode);
        gl.uniform1f(b.u_int, q.int * (mode ? f.dim : 1));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      unbind();
    },
    destroy() {
      canvas.removeEventListener('webglcontextlost', onLoss);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
