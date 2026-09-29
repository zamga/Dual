// The Assembly's shaders (DESIGN-V2 §4.1, §4.3, §3.4). Written once in GLSL ES 1.00; gl.js prefixes them
// for WebGL2 (GLSL ES 3.00). The grain vertex shader is motePos() of level-data.js, line for line: the
// fallbacks draw the same frames from the same numbers.

// Full-screen triangle: the Night ground and its static luminance grain (3.5%). The grain depends on the
// pixel only, so it never animates; it changes only when the canvas is resized.
export const BG_VS = `
attribute vec2 a_corner;
void main(){ gl_Position = vec4(a_corner, 0.0, 1.0); }`;

export const BG_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 u_night;
uniform float u_grain;
float hash(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
void main(){
  float n = hash(floor(gl_FragCoord.xy)) - 0.5;
  FRAG = vec4(u_night + n * u_grain, 1.0);
}`;

// Columns and floor: one instanced unit cube. Lambert key light from (-.4, 1, .6), a Mist rim
// pow(1 - n.v, 3) * .35, limestone: two-scale value noise (38 / 140) at +-4% albedo, fluting .5+.5cos(x pi 8).
export const BOX_VS = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec4 a_bc;
attribute vec3 a_bs;
uniform mat4 u_vp;
varying vec3 v_n;
varying vec3 v_w;
varying vec3 v_l;
varying float v_kind;
void main(){
  vec3 w = a_bc.xyz + a_pos * a_bs;
  v_n = a_nrm; v_w = w; v_l = a_pos; v_kind = a_bc.w;
  gl_Position = u_vp * vec4(w, 1.0);
}`;

export const BOX_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 u_mist;
uniform vec3 u_night;
uniform vec3 u_eye;
uniform float u_dim;
uniform float u_floorY;
varying vec3 v_n;
varying vec3 v_w;
varying vec3 v_l;
varying float v_kind;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main(){
  vec3 n = normalize(v_n);
  vec3 L = normalize(vec3(-0.4, 1.0, 0.6));
  vec3 V = normalize(u_eye - v_w);
  float lam = max(dot(n, L), 0.0);
  vec3 col;
  if (v_kind < 0.5) {
    vec2 q = abs(n.z) > 0.5 ? v_w.xy : v_w.zy;
    float nz = 0.5 * vnoise(q * 38.0) + 0.5 * vnoise(q * 140.0);
    float across = abs(n.z) > 0.5 ? v_l.x : v_l.z;
    float flute = 0.5 + 0.5 * cos(across * 2.0 * 3.14159 * 8.0);
    float alb = 0.3 * (1.0 + 0.08 * (nz - 0.5)) * mix(0.84, 1.0, flute);
    float ao = mix(0.55, 1.0, smoothstep(u_floorY, u_floorY + 0.9, v_w.y));
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.35;
    col = u_mist * (alb * (0.2 + 0.8 * lam) * ao + rim * 0.5);
  } else {
    float fade = smoothstep(-5.0, 0.8, v_w.z) * (1.0 - smoothstep(2.0, 4.0, v_w.z));
    col = u_mist * 0.075 * lam * fade;
  }
  FRAG = vec4(u_night + col * u_dim, 1.0);
}`;

// The grains: 5,404 instanced quads (1,351 stocks x 4 motes); every position comes from u_sc, so a frame
// costs the CPU nothing but uniforms. Additive.
export const GRAIN_VS = `
attribute vec2 a_corner;
attribute vec4 a_pct;
attribute vec4 a_r;
attribute vec4 a_c;
attribute float a_pick;
uniform mat4 u_vp;
uniform vec4 u_colX;
uniform vec4 u_lay;
uniform vec4 u_cc;
uniform vec3 u_cr;
uniform vec4 u_sc;
uniform vec4 u_ag;
uniform vec4 u_px; // projection scale (device px per world unit at w = 1), min size px, canvas w, h
varying vec2 v_uv;
varying float v_a;
float at4(vec4 v, float k){ return k < 0.5 ? v.x : (k < 1.5 ? v.y : (k < 2.5 ? v.z : v.w)); }
float eOut(float t){ return t >= 1.0 ? 1.0 : (1.0 - exp2(-10.0 * t)) / (1.0 - exp2(-10.0)); }
void main(){
  float k = a_c.w;
  float pct = at4(a_pct, k);
  float seed = a_r.x;
  float t = u_sc.w;
  vec3 c = u_cc.xyz + a_c.xyz * u_cr + 0.03 * vec3(
    sin(t * 0.53 + a_c.y * 4.0 + seed * 6.2832),
    sin(t * 0.47 + a_c.z * 4.0 + seed * 3.1),
    sin(t * 0.41 + a_c.x * 4.0 + seed * 9.0));
  vec3 tg = vec3(at4(u_colX, k) + (a_r.y - 0.5) * 0.16, u_lay.x + max(pct, 0.0) * u_lay.y, 0.06 + (a_r.z - 0.5) * 0.16);
  float ev = eOut(clamp((u_sc.x - seed * 0.5) / 0.5, 0.0, 1.0));
  vec3 p = mix(c, tg, ev);
  float falls = (pct < u_lay.w && a_pick < 0.5) ? 1.0 : 0.0;
  float tf = clamp((u_sc.y - seed * 0.6) / 0.4, 0.0, 1.0) * falls;
  p.y = mix(p.y, u_lay.z + 0.004 + 0.01 * a_r.z, tf * tf);
  p.x += (a_r.w - 0.5) * u_cc.w * tf;
  p.z += (a_r.z - 0.5) * 1.4 * tf;
  float inBand = pct >= u_lay.w ? 1.0 : 0.0;
  float a = mix(0.3, mix(0.42, 0.95, inBand), ev);
  a = mix(a, 0.2, tf);
  float agk = at4(u_ag, k);
  float br = u_sc.z;
  a *= mix(1.0, a_pick > 0.5 ? 1.0 : 0.42, br);
  a = mix(a, 1.0, a_pick * agk * br);
  float size = mix(0.013, 0.0105, ev) * (1.0 + a_pick * br * (1.3 * agk + 0.5)) * mix(1.0, 0.8, tf);
  vec4 clip = u_vp * vec4(p, 1.0);
  float px = size * u_px.x / clip.w;
  float pc = max(px, u_px.y);
  v_a = a * (px * px) / (pc * pc);
  v_uv = a_corner;
  clip.xy += a_corner * pc * vec2(2.0 / u_px.z, 2.0 / u_px.w) * clip.w;
  gl_Position = clip;
}`;

export const GRAIN_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 u_mist;
uniform float u_dim;
uniform float u_gain;
varying vec2 v_uv;
varying float v_a;
void main(){
  float r = length(v_uv);
  float m = smoothstep(1.0, 0.3, r);
  FRAG = vec4(u_mist * (v_a * m * u_dim * u_gain), 1.0);
}`;

// Screen-space quads: the lintel's light (DESIGN-V2 §4.3) and the 6% Mist slab of the rule band.
// The quad runs from u_a to u_b (device px), expanded by u_pad; the beam is distance-to-segment, so its
// ends fall off like its sides. Additive, no blur passes.
export const BEAM_VS = `
attribute vec2 a_corner;
uniform vec2 u_a;
uniform vec2 u_b;
uniform float u_half;
uniform float u_pad;
uniform vec2 u_res;
varying vec2 v_px;
void main(){
  vec2 d = u_b - u_a;
  float len = max(length(d), 0.0001);
  vec2 dir = d / len;
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 P = mix(u_a - dir * u_pad, u_b + dir * u_pad, a_corner.x * 0.5 + 0.5) + nrm * a_corner.y * (u_half + u_pad);
  v_px = P;
  gl_Position = vec4(P.x / u_res.x * 2.0 - 1.0, 1.0 - P.y / u_res.y * 2.0, 0.0, 1.0);
}`;

export const BEAM_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_a;
uniform vec2 u_b;
uniform float u_half;
uniform float u_dpr;
uniform float u_mode;
uniform float u_int;
uniform vec3 u_ultra;
uniform vec3 u_lift;
uniform vec3 u_mist;
varying vec2 v_px;
void main(){
  vec2 ab = u_b - u_a;
  float h = clamp(dot(v_px - u_a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  float d = length(v_px - u_a - ab * h) / u_dpr;
  if (u_mode > 0.5) {
    float inside = smoothstep(0.5, -0.5, d - u_half / u_dpr);
    FRAG = vec4(u_mist * 0.06 * inside * u_int, 1.0);
    return;
  }
  float halfT = u_half / u_dpr;
  float core = smoothstep(1.5, 0.5, d - halfT);
  float glow = exp(-d * d / (2.0 * 49.0)) * 0.55;
  float edge = smoothstep(1.0, 0.0, abs(d - halfT - 0.5)) * 0.5;
  vec3 col = mix(u_ultra, u_lift, core * 0.35) * (core + glow) + u_lift * edge;
  FRAG = vec4(col * u_int, 1.0);
}`;
