(() => {
'use strict';

/* ───────────────────────── constants ───────────────────────── */
const W = 1920, H = 1080, TAU = Math.PI * 2, DIAG = Math.hypot(W, H);
const GRAD_H = 128;          // samples along one gradient cycle
const MAX_L = 512;           // max rays in one repeat of the pattern
const LOOP_SEC = 10;
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ───────────────────────── colour maths (OKLab / OKLCH) ───────────────────────── */
const s2l = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function rgbToHex(r, g, b) {
  const h = v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
function linToLab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
function labToLin(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
function rgbToLch(rgb) {
  const [L, a, b] = linToLab(s2l(rgb[0]), s2l(rgb[1]), s2l(rgb[2]));
  return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}
const hexToLch = hex => rgbToLch(hexToRgb(hex));
/* OKLCH → sRGB, pulling chroma in until the colour fits the sRGB gamut (hue and lightness kept) */
function lchToRgb(c) {
  const L = clamp(c.L, 0, 1), hr = c.h * Math.PI / 180, ca = Math.cos(hr), sa = Math.sin(hr);
  const inG = v => v[0] >= -0.0005 && v[0] <= 1.0005 && v[1] >= -0.0005 && v[1] <= 1.0005 && v[2] >= -0.0005 && v[2] <= 1.0005;
  let C = Math.max(0, c.C), lin = labToLin(L, C * ca, C * sa);
  if (!inG(lin)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inG(labToLin(L, mid * ca, mid * sa))) lo = mid; else hi = mid;
    }
    lin = labToLin(L, lo * ca, lo * sa);
  }
  return [l2s(clamp(lin[0], 0, 1)), l2s(clamp(lin[1], 0, 1)), l2s(clamp(lin[2], 0, 1))];
}
const lchToHex = c => { const r = lchToRgb(c); return rgbToHex(r[0], r[1], r[2]); };
const NEUTRAL_C = 0.03;
/* Clean mix: hue travels round the wheel on the short arc, chroma is interpolated,
   so the midpoint never collapses into grey. A neutral end borrows the other end's hue. */
function mixLch(A, B, t) {
  let hA = A.h, hB = B.h;
  if (A.C < NEUTRAL_C) hA = hB;
  if (B.C < NEUTRAL_C) hB = hA;
  const dh = ((hB - hA + 540) % 360) - 180;
  return { L: A.L + (B.L - A.L) * t, C: A.C + (B.C - A.C) * t, h: hA + dh * t };
}

/* ───────────────────────── palettes ───────────────────────── */
const PALETTES = [
  { id: 'scarlet', name: 'Алый и чёрный', flow: false, colors: ['#0A0A0A', '#161616', '#231C1C', '#3D0D0A', '#6E120D', '#9C1C13', '#BE271B', '#DD2E1E', '#FF3A22', '#FF5B3D'] },
  { id: 'noir', name: 'Неон-нуар', flow: false, colors: ['#07061A', '#170A52', '#3D0FD1', '#7A1CFF', '#C21CFF', '#FF1F8E', '#FF5CB8', '#2B6BFF', '#22D3FF', '#F2FBFF'] },
  { id: 'deep', name: 'Глубина', flow: false, colors: ['#01040F', '#02104A', '#0331B8', '#0A5CFF', '#1E90FF', '#00C8FF', '#5CF0FF', '#E6FCFF', '#00FFD0', '#00A6A6'] },
  { id: 'sunset', name: 'Сансет', flow: false, colors: ['#12051F', '#3A0A6B', '#7A0FB0', '#D4145A', '#FF1F5A', '#FF4D2E', '#FF8A00', '#FFC400', '#FFE873', '#FFF8E0'] },
  { id: 'acid', name: 'Кислота и графит', flow: false, colors: ['#070908', '#131816', '#232B27', '#3C4742', '#C8FF00', '#7DFF2A', '#00FFA3', '#00E5FF', '#F4FFE8', '#0E1210'] },
  { id: 'pearl', name: 'Перламутр', flow: true, colors: ['#0E0B1E', '#2B1B5A', '#6B3BFF', '#B15CFF', '#FF5AD0', '#FF7AB8', '#FFF0F8', '#7FE9FF', '#35C8FF', '#2BFFC8', '#9DFF6E', '#FFE85C'] },
  { id: 'petrol', name: 'Бензин', flow: true, colors: ['#05060B', '#120F2E', '#2A1375', '#5A1FE0', '#B01FFF', '#FF2BB5', '#FF6A2B', '#FFC21F', '#3DFF8A', '#00E0C0', '#0A8CFF', '#14208A'] },
  { id: 'mineral', name: 'Минерал', flow: true, colors: ['#06100F', '#063B33', '#00A86B', '#19F0A0', '#B6FFD9', '#6FB6FF', '#1F5BFF', '#0B2A6B', '#5A189A', '#C77DFF', '#FF5A1F', '#FFB000'] },
  { id: 'opal', name: 'Опал', flow: true, colors: ['#050816', '#10206B', '#1F4BFF', '#19C8FF', '#3DFFD2', '#F2FFFA', '#FFE14D', '#FF8A1F', '#FF3D6E', '#FF4DDB', '#A45CFF', '#3A1578'] },
  { id: 'titan', name: 'Титан', flow: true, colors: ['#0B0B24', '#1E1A7A', '#3B2BFF', '#1E7BFF', '#12D6E8', '#2BFFA8', '#E8F02B', '#FFA51F', '#FF4D5E', '#E82BD0', '#8A2BFF', '#F4F0FF'] },
];
const IMAGE_PALETTE = { id: 'image', name: 'Из картинки', flow: false, colors: [] };
const paletteById = id => (id === 'image' ? IMAGE_PALETTE : PALETTES.find(p => p.id === id) || PALETTES[0]);

/* ───────────────────────── state ───────────────────────── */
/* The default preset is tuned for the strongest pull: an off-centre well, dense rays that
   wind into it, uneven widths for a perspective cue and a shaded core. */
const DEFAULTS = {
  palette: 'scarlet', seed: 11,
  count: 168, repeat: 4, spread: 0.7,
  radius: 560, bend: 0.7, bendDir: 0, twist: 1.25,
  cx: 0.36, cy: 0.5, depth: 0.7,
  gType: 'none', gStops: 3, gFreq: 1, gPhase: 0,
  imgW: 560, imgRad: 0, imgShadow: 0.45, imgMode: 'comp',
  aSpeed: 1, aBreath: 0.3, aPulse: 0.25, aFlow: 1, aWaves: 0.4,
  gifSize: '1280x720', gifFps: 20,
  vidFmt: 'mp4', vidSize: '1920x1080', vidFps: 30, vidQ: 'high',
};
const S = Object.assign({}, DEFAULTS);
const image = { on: false, w: 0, h: 0, alpha: false, name: '', dom: [], thumb: '' };

/* ───────────────────────── random + sequence ───────────────────────── */
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seqLength() { return clamp(Math.round(S.count / S.repeat), 2, MAX_L); }
function buildSeq(P, L, seed, flow) {
  const rnd = mulberry32(seed * 7919 + 13), seq = new Array(L);
  if (P < 2) return seq.fill(0);
  if (flow) {
    /* complex palettes: walk along the palette so neighbouring rays are neighbouring tints,
       the way interference colours run on pearl or an oil film */
    let idx = Math.floor(rnd() * P), dir = rnd() < 0.5 ? 1 : -1;
    for (let i = 0; i < L; i++) {
      seq[i] = idx;
      const x = rnd(), step = x < 0.6 ? 1 : x < 0.84 ? 2 : x < 0.93 ? 3 : -1;
      idx = ((idx + dir * step) % P + P) % P;
      if (rnd() < 0.05) dir = -dir;
    }
  } else {
    let prev = -1, bag = [];
    for (let i = 0; i < L; i++) {
      if (!bag.length) {
        bag = Array.from({ length: P }, (_, k) => k);
        for (let k = P - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [bag[k], bag[j]] = [bag[j], bag[k]]; }
        if (bag[P - 1] === prev) [bag[P - 1], bag[0]] = [bag[0], bag[P - 1]];
      }
      prev = bag.pop(); seq[i] = prev;
    }
  }
  if (L > 2 && seq[L - 1] === seq[0]) {
    for (let c = 0; c < P; c++) if (c !== seq[0] && c !== seq[L - 2]) { seq[L - 1] = c; break; }
  }
  return seq;
}

/* ───────────────────────── scene data (CPU side) ───────────────────────── */
const scene = { L: 0, seq: [], gw: null, pp: null, gp: null, lch: [], gradData: null, edges: null, pulseKey: -1 };

function rebuildScene() {
  const pal = paletteById(S.palette);
  const colors = pal.colors.length ? pal.colors : PALETTES[0].colors;
  const L = seqLength();
  scene.L = L;
  scene.lch = colors.map(hexToLch);
  scene.seq = buildSeq(colors.length, L, S.seed, pal.flow);
  const rw = mulberry32(S.seed * 104729 + 71);
  scene.gw = new Float32Array(L); scene.pp = new Float32Array(L); scene.gp = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    scene.gw[i] = (rw() + rw() + rw()) / 1.5 - 1;   // bell-shaped in [-1, 1]
    scene.pp[i] = rw();                             // phase of the width pulse
    scene.gp[i] = rw();                             // phase of the gradient
  }
  scene.edges = new Float32Array((L + 1) * 4);
  scene.pulseKey = -1;
  buildGradient();
}

/* gradient partners for a ray: step along the palette, skipping neutrals when the ray itself
   is chromatic so no transition is dragged through grey */
function stopsFor(idx, K) {
  const P = scene.lch.length, base = scene.lch[idx], out = [base];
  const chroma = base.C >= NEUTRAL_C;
  const enough = scene.lch.filter(c => c.C >= NEUTRAL_C).length >= K;
  let j = idx;
  for (let guard = 0; out.length < K && guard < P * 3; guard++) {
    j = (j + 1) % P;
    if (j === idx) continue;
    const c = scene.lch[j];
    if (chroma && enough && c.C < NEUTRAL_C) continue;
    out.push(c);
  }
  while (out.length < K) out.push(base);
  return out;
}
function buildGradient() {
  const L = scene.L, P = scene.lch.length, none = S.gType === 'none';
  const K = none ? 1 : S.gStops, GH = none ? 2 : GRAD_H;
  const cols = new Array(P);
  const mainHue = scene.lch.reduce((m, c) => (c.C > m.C ? c : m), scene.lch[0]).h;
  for (let p = 0; p < P; p++) {
    const col = new Uint8Array(GH * 3), st = stopsFor(p, K);
    for (let y = 0; y < GH; y++) {
      let c = st[0];
      if (K > 1) {
        const t = (y + 0.5) / GH * K, j0 = Math.floor(t) % K, f = t - Math.floor(t);
        const e = f * 0.5 + 0.5 * (f * f * (3 - 2 * f));   // soften the turn at each stop
        const A = st[j0], B = st[(j0 + 1) % K];
        c = mixLch(A, B, e);
        /* light-to-dark pairs with little colour of their own would sag into grey halfway:
           lift the middle into a tint (the palette's own hue when both ends are neutral) */
        const want = Math.min(0.09, 0.22 * Math.abs(A.L - B.L));
        if (c.C < want) {
          if (A.C < NEUTRAL_C && B.C < NEUTRAL_C) c.h = mainHue;
          c.C += (want - c.C) * 4 * e * (1 - e);
        }
      }
      const rgb = lchToRgb(c);
      col[y * 3] = Math.round(rgb[0] * 255); col[y * 3 + 1] = Math.round(rgb[1] * 255); col[y * 3 + 2] = Math.round(rgb[2] * 255);
    }
    cols[p] = col;
  }
  const data = new Uint8Array(L * GH * 4);
  for (let x = 0; x < L; x++) {
    const col = cols[scene.seq[x]];
    for (let y = 0; y < GH; y++) {
      const o = (y * L + x) * 4;
      data[o] = col[y * 3]; data[o + 1] = col[y * 3 + 1]; data[o + 2] = col[y * 3 + 2]; data[o + 3] = 255;
    }
  }
  scene.gradData = data; scene.gradH = GH; scene.cols = cols;
  if (gl) {
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texGrad);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, L, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
}
/* The three functions below are shared with the exported live background: exportLive() writes
   their source text into the HTML file. They must stay self-contained (no outer variables). */

/* ray edges inside one repeat; amp > 0 lets every ray breathe in width with its own phase */
function fillEdges(e, L, gw, pp, gp, spread, amp, t) {
  var TAU = Math.PI * 2, w = new Float64Array(L), sum = 0, acc = 0, i, x;
  for (i = 0; i < L; i++) {
    x = spread * 1.7 * gw[i];
    if (amp) x += amp * 1.1 * Math.sin(TAU * (t + pp[i]));
    w[i] = Math.exp(x); sum += w[i];
  }
  for (i = 0; i < L; i++) { e[i * 4] = acc / sum; e[i * 4 + 1] = gp[i]; acc += w[i]; }
  e[L * 4] = 1; e[L * 4 + 1] = 0;
}
/* everything that moves, as a function of loop time t in [0,1); t = null is the still picture.
   Every term returns to its start at t = 1, so the loop closes without a seam. */
function effParams(S, t) {
  var TAU = Math.PI * 2, e = { R: S.radius, twist: S.twist, shift: 0, gz: 0, wave: 0, wphase: 0 };
  if (t != null) {
    var dir = S.twist < 0 ? -1 : 1;
    e.shift = dir * S.aSpeed * t / S.repeat;               // whirl turns, so rays slide into the centre
    e.R = S.radius * Math.exp(0.42 * S.aBreath * Math.sin(TAU * t));
    e.twist = S.twist * (1 + 0.28 * S.aBreath * Math.sin(TAU * t + 1.3));
    e.gz = S.aFlow * t;                                    // gradient streams inwards along the rays
    e.wave = S.aWaves; e.wphase = 2 * t;                   // two rings of shade fall into the well per loop
  }
  return e;
}
/* scale = scene px per output px, (ox, oy) = scene offset of the output's top-left corner */
function applyUniforms(gl, U, S, e, L, tw, th, scale, ox, oy, flip, ss, dither, img) {
  var W = 1920, H = 1080, cx = S.cx * W, cy = S.cy * H, none = S.gType === 'none';
  gl.uniform2f(U.uRes, tw, th);
  gl.uniform1f(U.uScale, scale);
  gl.uniform2f(U.uOffset, ox, oy);
  gl.uniform1f(U.uFlip, flip);
  gl.uniform1f(U.uDither, dither);
  gl.uniform1i(U.uSS, ss);
  gl.uniform1i(U.uCount, L);
  gl.uniform2f(U.uCenter, cx, cy);
  gl.uniform1f(U.uR, e.R);
  gl.uniform1f(U.uBend, S.bend);
  gl.uniform1f(U.uBendDir, S.bendDir * Math.PI / 180);
  gl.uniform1f(U.uTwist, e.twist);
  gl.uniform1f(U.uShift, e.shift);
  gl.uniform1f(U.uRepeat, S.repeat);
  var gx = S.gType === 'across' ? S.gFreq : S.gType === 'both' ? 1 : 0;
  var gy = S.gType === 'along' || S.gType === 'both' ? S.gFreq : 0;
  gl.uniform4f(U.uG, gx, gy, none ? 0 : e.gz, none ? 0 : S.gPhase);
  gl.uniform1f(U.uRho, 110);
  gl.uniform1f(U.uDepth, S.depth);
  gl.uniform1f(U.uDepthR, Math.max(60, e.R * 0.8));
  gl.uniform3f(U.uWave, e.wave, 0.85, e.wphase);
  gl.uniform1f(U.uImgOn, img ? 1 : 0);
  if (img) {
    var hw = S.imgW / 2, hh = hw * img.h / img.w, sz = Math.min(hw, hh);
    gl.uniform4f(U.uImg, cx, cy, hw, hh);
    gl.uniform1f(U.uImgRad, S.imgRad * sz);
    gl.uniform3f(U.uShadow, S.imgShadow * 0.75, sz * 0.07, Math.max(8, sz * 0.38));
  } else {
    gl.uniform4f(U.uImg, 0, 0, 1, 1); gl.uniform1f(U.uImgRad, 0); gl.uniform3f(U.uShadow, 0, 0, 1);
  }
}
function uploadEdges(tPulse) {
  const L = scene.L, amp = tPulse == null ? 0 : S.aPulse;
  const key = amp === 0 ? -2 : tPulse;
  if (key === scene.pulseKey) return;
  scene.pulseKey = key;
  fillEdges(scene.edges, L, scene.gw, scene.pp, scene.gp, S.spread, amp, tPulse || 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texEdges);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, L + 1, 1, 0, gl.RGBA, gl.FLOAT, scene.edges);
}

/* ───────────────────────── WebGL ───────────────────────── */
const VS = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
const float TAU = 6.283185307179586;
uniform vec2 uRes;
uniform float uScale, uFlip, uDither;
uniform vec2 uOffset;
uniform int uSS, uCount;
uniform vec2 uCenter;
uniform float uR, uBend, uBendDir, uTwist, uShift, uRepeat;
uniform vec4 uG;            // across, along, time phase, per-ray phase spread
uniform float uRho;
uniform float uDepth, uDepthR;
uniform vec3 uWave;         // amount, rings per e-fold, phase
uniform float uImgOn, uImgRad;
uniform vec4 uImg;          // centre xy, half size
uniform vec3 uShadow;       // strength, y offset, blur
uniform sampler2D uEdges, uGrad, uImgTex;
out vec4 outColor;

float sdRoundBox(vec2 q, vec2 b, float r){
  vec2 d = abs(q) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
float hash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 shade(vec2 p){
  vec2 d = p - uCenter;
  float r = max(length(d), 0.05);
  float th = atan(d.y, d.x);
  float k = r / uR;
  /* bend: rays lean towards one direction, like streamlines of a source in a current;
     twist: logarithmic whirl inside the radius, straight rays far outside it */
  float g = th + uBend * (k / (1.0 + 0.3 * k)) * sin(th - uBendDir) + uTwist * log(1.0 + 1.0 / k);
  float u = g / TAU - uShift;
  float f = fract(fract(u) * uRepeat);
  int lo = 0, hi = uCount;
  for (int it = 0; it < 10; it++){
    int mid = (lo + hi) / 2;
    float e = texelFetch(uEdges, ivec2(mid, 0), 0).r;
    if (f >= e) lo = mid; else hi = mid;
  }
  vec4 t0 = texelFetch(uEdges, ivec2(lo, 0), 0);
  float e1 = texelFetch(uEdges, ivec2(lo + 1, 0), 0).r;
  float v = clamp((f - t0.r) / max(e1 - t0.r, 1e-7), 0.0, 1.0);
  float rho = log(1.0 + r / uRho) / log(1.0 + ${DIAG.toFixed(1)} / uRho);
  float tc = uG.x * v + uG.y * rho + uG.z + uG.w * t0.g;
  vec3 col = texture(uGrad, vec2((float(lo) + 0.5) / float(uCount), tc)).rgb;

  float dk = r / uDepthR;
  float open = 1.0 - exp(-pow(dk, 1.6));
  if (uDepth > 0.0) col = pow(col, vec3(1.0 + 0.45 * uDepth * (1.0 - open))) * mix(1.0, open, uDepth);
  else col = mix(col, vec3(1.0), (1.0 - open) * -uDepth);
  if (uWave.x > 0.0){
    float w = 0.5 - 0.5 * cos(TAU * (uWave.y * log(1.0 + r / 36.0) + uWave.z));
    col *= 1.0 - uWave.x * 0.62 * w * w;
  }
  if (uImgOn > 0.5){
    vec2 q = p - uImg.xy;
    float ss = sdRoundBox(q - vec2(0.0, uShadow.y), uImg.zw, uImgRad);
    col *= 1.0 - uShadow.x * (1.0 - smoothstep(-uShadow.z * 0.35, uShadow.z, ss));
    if (sdRoundBox(q, uImg.zw, uImgRad) < 0.0){
      vec2 uv = q / (2.0 * uImg.zw) + 0.5;
      vec2 dd = vec2(uScale) / (2.0 * uImg.zw);
      vec4 im = textureGrad(uImgTex, uv, vec2(dd.x, 0.0), vec2(0.0, dd.y));
      col = mix(col, im.rgb, im.a);
    }
  }
  return col;
}
vec3 toSrgb(vec3 c){
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  if (uFlip > 0.5) fc.y = uRes.y - fc.y;
  vec3 acc = vec3(0.0);
  float n = float(uSS);
  for (int j = 0; j < uSS; j++){
    for (int i = 0; i < uSS; i++){
      vec2 o = (vec2(float(i), float(j)) + 0.5) / n - 0.5;
      o = vec2(o.x * 0.8944 - o.y * 0.4472, o.x * 0.4472 + o.y * 0.8944);   // rotated grid
      acc += shade((fc + o) * uScale + uOffset);
    }
  }
  vec3 c = toSrgb(acc / (n * n));
  c += (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 71.7) - 1.0) / 255.0 * uDither;
  outColor = vec4(c, 1.0);
}`;

const cv = $('#cv');
let gl = null, prog = null, U = {}, texEdges = null, texGrad = null, texImg = null;
let fbo = null, fboTex = null, fboW = 0, fboH = 0;

function initGL() {
  gl = cv.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) return false;
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  U = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(prog, i); U[info.name] = gl.getUniformLocation(prog, info.name); }
  gl.bindVertexArray(gl.createVertexArray());
  const tex = (unit, min, mag, ws, wt) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, ws); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wt);
    return t;
  };
  texEdges = tex(0, gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
  texGrad = tex(1, gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.REPEAT);
  texImg = tex(2, gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(U.uEdges, 0); gl.uniform1i(U.uGrad, 1); gl.uniform1i(U.uImgTex, 2);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  fbo = null; fboTex = null; fboW = fboH = 0;
  return true;
}

const effective = t => effParams(S, t);
function centerPx() { return [S.cx * W, S.cy * H]; }
function draw(t, ss, tw, th, toCanvas, dither) {
  uploadEdges(t);
  gl.viewport(0, 0, tw, th);
  applyUniforms(gl, U, S, effective(t), scene.L, tw, th, W / tw, 0, 0, toCanvas ? 1 : 0, ss, dither ? 1 : 0, image.on ? image : null);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function ensureFbo(w, h) {
  if (fbo && fboW === w && fboH === h) return;
  if (fboTex) gl.deleteTexture(fboTex);
  if (fbo) gl.deleteFramebuffer(fbo);
  gl.activeTexture(gl.TEXTURE3);
  fboTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  fboW = w; fboH = h;
}
/* render one frame off-screen and read it back, top row first */
function renderToPixels(t, w, h, ss, out) {
  ensureFbo(w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  draw(t, ss, w, h, false, false);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
}

/* ───────────────────────── preview loop ───────────────────────── */
let playing = false, playStart = 0, dirty = true, hqTimer = 0, busy = false, rafId = 0;
function loopT() { return ((performance.now() - playStart) / 1000 / LOOP_SEC) % 1; }
function tick() {
  rafId = 0;
  if (!gl || busy) return;
  if (playing) {
    draw(loopT(), 2, W, H, true, false);
    rafId = requestAnimationFrame(tick);
  } else if (dirty) {
    dirty = false;
    draw(null, 2, W, H, true, false);
    clearTimeout(hqTimer);
    hqTimer = setTimeout(() => { if (gl && !playing && !busy && !dirty) draw(null, 4, W, H, true, true); }, 160);
  }
}
function refresh() { dirty = true; if (!rafId) rafId = requestAnimationFrame(tick); }
function setPlaying(on) {
  playing = on;
  if (on) playStart = performance.now();
  const b = $('#btnPlay');
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  $('#btnPlayLabel').textContent = on ? 'Пауза' : 'Анимация';
  b.classList.toggle('on', on);
  refresh();
}

/* ───────────────────────── image: load, dominant colours, palette ───────────────────────── */
function kmeans(pts, k) {
  /* pts: Float32Array of OKLab triples */
  const n = pts.length / 3, rnd = mulberry32(4242), cen = [];
  cen.push([pts[0], pts[1], pts[2]]);
  const d2 = new Float32Array(n).fill(1e9);
  while (cen.length < k) {                              // k-means++ seeding
    const c = cen[cen.length - 1]; let sum = 0;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3] - c[0], dy = pts[i * 3 + 1] - c[1], dz = pts[i * 3 + 2] - c[2];
      d2[i] = Math.min(d2[i], dx * dx + dy * dy + dz * dz); sum += d2[i];
    }
    if (sum <= 1e-9) break;
    let x = rnd() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { x -= d2[i]; if (x <= 0) { pick = i; break; } }
    cen.push([pts[pick * 3], pts[pick * 3 + 1], pts[pick * 3 + 2]]);
  }
  const kk = cen.length, cnt = new Float64Array(kk);
  for (let it = 0; it < 14; it++) {
    const acc = new Float64Array(kk * 3); cnt.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = 1e9;
      for (let c = 0; c < kk; c++) {
        const dx = pts[i * 3] - cen[c][0], dy = pts[i * 3 + 1] - cen[c][1], dz = pts[i * 3 + 2] - cen[c][2], dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) { bd = dd; best = c; }
      }
      acc[best * 3] += pts[i * 3]; acc[best * 3 + 1] += pts[i * 3 + 1]; acc[best * 3 + 2] += pts[i * 3 + 2]; cnt[best]++;
    }
    for (let c = 0; c < kk; c++) if (cnt[c]) cen[c] = [acc[c * 3] / cnt[c], acc[c * 3 + 1] / cnt[c], acc[c * 3 + 2] / cnt[c]];
  }
  let out = cen.map((c, i) => ({ L: c[0], a: c[1], b: c[2], w: cnt[i] / n })).filter(c => c.w > 0.01).sort((p, q) => q.w - p.w);
  const merged = [];
  for (const c of out) {                                 // fold near-duplicates together
    const m = merged.find(o => Math.hypot(o.L - c.L, o.a - c.a, o.b - c.b) < 0.06);
    if (m) m.w += c.w; else merged.push(c);
  }
  return merged.map(c => ({ L: c.L, C: Math.hypot(c.a, c.b), h: (Math.atan2(c.b, c.a) * 180 / Math.PI + 360) % 360, w: c.w }));
}
function dominantColors(srcCanvas) {
  const n = 72, c = document.createElement('canvas'); c.width = n; c.height = n;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(srcCanvas, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data, pts = [];
  let transparent = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { transparent++; continue; }
    const lab = linToLab(s2l(d[i] / 255), s2l(d[i + 1] / 255), s2l(d[i + 2] / 255));
    pts.push(lab[0], lab[1], lab[2]);
  }
  image.alpha = transparent > n * n * 0.02;
  if (pts.length < 30) return [{ L: 0.6, C: 0.1, h: 20, w: 1 }];
  return kmeans(new Float32Array(pts), 6);
}
/* rays for an image: its main hues turned to the opposite side of the wheel (or split / kept),
   each as a tint, a body colour and a shade, plus tinted near-white and near-black */
function paletteFromImage(dom, mode) {
  let chroma = dom.filter(c => c.C > 0.035).sort((a, b) => b.w * b.C - a.w * a.C).slice(0, 4);
  if (!chroma.length) chroma = [{ L: 0.62, C: 0.12, h: 205, w: 1 }];   // grey image: borrow a calm accent
  const turn = i => (mode === 'tone' ? 0 : mode === 'split' ? (i % 2 ? 210 : 150) : 180);
  const out = [];
  const h0 = (chroma[0].h + turn(0)) % 360;
  out.push({ L: 0.965, C: 0.014, h: h0 });
  chroma.forEach((c, i) => {
    const h = (c.h + turn(i)) % 360, C = clamp(c.C * 1.25, 0.115, 0.21);
    out.push({ L: 0.89, C: C * 0.4, h });
    out.push({ L: clamp(c.L + 0.08, 0.62, 0.8), C, h });
    if (i < 3) out.push({ L: 0.33, C: C * 0.72, h });
  });
  out.push({ L: 0.17, C: 0.03, h: h0 });
  return out.map(lchToHex);
}
function applyImagePalette() {
  if (!image.on) return;
  IMAGE_PALETTE.colors = paletteFromImage(image.dom, S.imgMode);
  renderPaletteCards();
  if (S.palette === 'image') { rebuildScene(); refresh(); }
}
async function loadImageFile(file) {
  if (!file || !/^image\//.test(file.type || '') && !/\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(file.name || '')) {
    return note('Это не картинка. Подойдут PNG, JPG, WebP, SVG, GIF.', true);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    let iw = img.naturalWidth || 800, ih = img.naturalHeight || 800;
    const maxTex = Math.min(2048, gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 2048);
    const k = Math.min(1, maxTex / Math.max(iw, ih));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
    image.dom = dominantColors(c);
    image.w = c.width; image.h = c.height; image.canvas = c; image.name = file.name || 'картинка'; image.on = true;
    const tc = document.createElement('canvas'), ts = 96 / Math.max(c.width, c.height);
    tc.width = Math.max(1, Math.round(c.width * ts)); tc.height = Math.max(1, Math.round(c.height * ts));
    tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
    image.thumb = tc.toDataURL('image/png');
    if (gl) {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texImg);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    /* fit: about a third of the frame, never taller than 60 % of it */
    S.imgW = Math.round(clamp(Math.min(620, 0.6 * H * c.width / c.height), 120, 1400));
    S.imgShadow = image.alpha ? 0 : DEFAULTS.imgShadow;
    S.palette = 'image';
    IMAGE_PALETTE.colors = paletteFromImage(image.dom, S.imgMode);
    syncControls(); renderPaletteCards(); renderImagePane(); rebuildScene(); refresh();
    showTab('image');
    note('');
  } catch (err) {
    note('Не удалось открыть файл. Попробуйте PNG или JPG.', true);
  } finally {
    URL.revokeObjectURL(url);
  }
}
function removeImage() {
  image.on = false; image.dom = []; image.thumb = ''; image.canvas = null;
  if (S.palette === 'image') S.palette = DEFAULTS.palette;
  IMAGE_PALETTE.colors = [];
  renderPaletteCards(); renderImagePane(); rebuildScene(); refresh();
}

/* ───────────────────────── saving files ───────────────────────── */
async function saveFile(filename, blob) {
  if (window.claude && typeof window.claude.use === 'function') {
    let ns = null;
    try { ns = await window.claude.use('downloads'); } catch (e) { ns = null; }
    if (ns) {
      try { await ns.save({ filename, data: blob }); return 'saved'; }
      catch (e) {
        const code = e && e.code;
        if (code === 'declined') return 'declined';
        if (code === 'rate_limited') return 'busy';
        if (code === 'too_large') return 'too_large';
        return 'failed';
      }
    }
  }
  try {
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'saved';
  } catch (e) { return 'failed'; }
}
const SAVE_TEXT = {
  declined: 'Сохранение отменено. Файл готов, можно сохранить ещё раз.',
  busy: 'Окно сохранения уже открыто. Закройте его и нажмите «Сохранить» ещё раз.',
  too_large: 'Файл слишком большой для этого просмотра. Уменьшите размер или частоту кадров GIF.',
  failed: 'Здесь сохранить файл не получилось. Откройте страницу в браузере и попробуйте снова.',
};
function stamp() {
  const d = new Date(), p = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const fmtMb = b => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' КБ' : (b / 1048576 < 10 ? (b / 1048576).toFixed(1) : Math.round(b / 1048576)) + ' МБ');

function setBusy(on) {
  busy = on;
  $('.panel').inert = on;
  for (const id of ['btnPng', 'btnGif', 'btnLive', 'btnPlay', 'btnReset']) $('#' + id).disabled = on;
  $('#btnVid').disabled = on || !video.ok;
}
let lastFile = null;   // { name, blob } – kept so a declined save can be repeated without re-rendering
async function offer(name, blob, okText) {
  lastFile = { name, blob };
  const r = await saveFile(name, blob);
  if (r === 'saved') { status(okText, { done: true }); }
  else status(SAVE_TEXT[r] || SAVE_TEXT.failed, { retry: r !== 'too_large', warn: true });
}

async function exportPng() {
  if (!gl || busy) return;
  setBusy(true); clearTimeout(hqTimer);
  try {
    const t = playing ? loopT() : null;
    status('Готовлю PNG 1920 × 1080…', { spin: true });
    await nextFrame();
    draw(t, 5, W, H, true, true);                       // 25 samples per pixel
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('no blob');
    await offer(`buksirator-${S.palette}-${stamp()}.png`, blob, `PNG сохранён · 1920 × 1080 · ${fmtMb(blob.size)}`);
  } catch (e) {
    status('Не получилось собрать PNG. Попробуйте ещё раз.', { warn: true });
  } finally { setBusy(false); refresh(); }
}

let cancelGif = false;
function gifDims() { const [w, h] = S.gifSize.split('x').map(Number); return { w, h, frames: S.gifFps * LOOP_SEC, delay: 1000 / S.gifFps }; }
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const breathe = () => new Promise(r => setTimeout(r, 0));

function buildGifPalette(n) {
  /* one palette for the whole loop, taken from frames spread across it, so colours never flicker */
  const pw = 384, ph = 216, px = new Uint8Array(pw * ph * 4), all = new Uint8Array(pw * ph * 4 * n);
  for (let i = 0; i < n; i++) { renderToPixels(i / n, pw, ph, 2, px); all.set(px, i * px.length); }
  return GIFENC.quantize(all, 256, { format: 'rgb565' });
}
async function exportGif() {
  if (!gl || busy) return;
  const wasPlaying = playing;
  setBusy(true); cancelGif = false; clearTimeout(hqTimer);
  const { w, h, frames, delay } = gifDims();
  try {
    status('Подбираю цвета…', { progress: 0, cancel: true });
    await nextFrame();
    const palette = buildGifPalette(12);
    const enc = GIFENC.GIFEncoder({ initialCapacity: 1 << 22 });
    const px = new Uint8Array(w * h * 4);
    let last = performance.now();
    for (let f = 0; f < frames; f++) {
      if (cancelGif) break;
      renderToPixels(f / frames, w, h, 3, px);
      const idx = GIFENC.applyPalette(px, palette, 'rgb565');
      enc.writeFrame(idx, w, h, f === 0 ? { palette, delay, repeat: 0 } : { delay });
      if (performance.now() - last > 60 || f === frames - 1) {
        status(`Кадр ${f + 1} из ${frames}`, { progress: (f + 1) / frames, cancel: true });
        if (f % 4 === 0) gl.bindFramebuffer(gl.FRAMEBUFFER, null), draw(f / frames, 1, W, H, true, false);
        await breathe(); last = performance.now();
      }
    }
    if (cancelGif) { status('Экспорт GIF остановлен.', {}); return; }
    enc.finish();
    const blob = new Blob([enc.bytesView()], { type: 'image/gif' });
    await offer(`buksirator-${S.palette}-${stamp()}.gif`, blob, `GIF сохранён · ${w} × ${h} · ${LOOP_SEC} с · ${fmtMb(blob.size)}`);
  } catch (e) {
    status('Не хватило памяти или графики на такой GIF. Выберите размер поменьше.', { warn: true });
  } finally {
    setBusy(false); scene.pulseKey = -1;
    if (wasPlaying) playStart = performance.now();
    refresh();
  }
}
/* quick size forecast: encode one mid-loop frame and multiply */
let estTimer = 0;
function estimateGif() {
  clearTimeout(estTimer);
  const el = $('#gifInfo'); if (!el) return;
  const { w, h, frames } = gifDims();
  el.textContent = `${frames} кадров · ${w} × ${h} · считаю размер…`;
  estTimer = setTimeout(() => {
    if (!gl || busy) return;
    try {
      const px = renderToPixels(0.37, w, h, 2, new Uint8Array(w * h * 4));
      const pal = GIFENC.quantize(px, 256, { format: 'rgb565' });
      const enc = GIFENC.GIFEncoder({ initialCapacity: 1 << 20 });
      enc.writeFrame(GIFENC.applyPalette(px, pal, 'rgb565'), w, h, { palette: pal, delay: 50 });
      enc.finish();
      el.textContent = `${frames} кадров · ${w} × ${h} · примерно ${fmtMb(enc.bytesView().length * frames)}`;
    } catch (e) { el.textContent = `${frames} кадров · ${w} × ${h}`; }
    scene.pulseKey = -1; refresh();
  }, 450);
}

/* ───────────────────────── video (MP4 / WebM) ─────────────────────────
   Frames are rendered one by one and handed to the browser's own encoder (WebCodecs), so the
   file has exact timing and closes its loop; nothing is captured in real time. */
const video = { ok: false, mp4: false, webm: false, probed: false };
const VIDEO_BPP = { light: 0.06, high: 0.12, max: 0.24 };   // bits per pixel per frame at 30 fps, H.264
function vidDims() {
  const [w, h] = S.vidSize.split('x').map(Number), fps = S.vidFps;
  let bitrate = w * h * 30 * VIDEO_BPP[S.vidQ] * Math.pow(fps / 30, 0.6);
  if (S.vidFmt === 'webm') bitrate *= 0.7;                   // VP9 needs less for the same picture
  return { w, h, fps, frames: fps * LOOP_SEC, bitrate: Math.round(bitrate) };
}
function codecCandidates(fmt, w, h, fps) {
  if (fmt === 'webm') return h >= 1080 && fps > 30 ? ['vp09.00.41.08', 'vp09.00.40.08'] : ['vp09.00.40.08', 'vp09.00.41.08'];
  const level = h >= 1080 && fps > 30 ? '2A' : '28';         // H.264 level 4.2 for 1080p60, else 4.0
  return ['6400', '4D00', '42E0', '4200'].map(profile => 'avc1.' + profile + level);
}
async function pickCodec(fmt, w, h, fps, bitrate) {
  for (const codec of codecCandidates(fmt, w, h, fps)) {
    const cfg = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality', bitrateMode: 'variable' };
    if (fmt === 'mp4') cfg.avc = { format: 'avc' };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) { /* try the next one */ }
  }
  return null;
}
async function probeVideo() {
  if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
    video.mp4 = !!(await pickCodec('mp4', 1280, 720, 30, 4e6));
    video.webm = !!(await pickCodec('webm', 1280, 720, 30, 3e6));
  }
  video.ok = video.mp4 || video.webm; video.probed = true;
  if (video.ok && !video[S.vidFmt]) S.vidFmt = video.mp4 ? 'mp4' : 'webm';
  paintVideo();
}
function paintVideo() {
  for (const [id, key] of [['segVfmt', 'vidFmt'], ['segVsize', 'vidSize'], ['segVfps', 'vidFps'], ['segVq', 'vidQ']]) paintSeg(id, key);
  if (video.probed) for (const b of $('#segVfmt').children) b.disabled = !video[b.dataset.v];
  const { w, h, fps, frames, bitrate } = vidDims(), ext = S.vidFmt;
  $('#btnVidFmt').textContent = ext === 'mp4' ? 'MP4' : 'WebM';
  $('#btnVid').disabled = busy || !gl || (video.probed && !video.ok);
  $('#vidOpts').classList.toggle('off', video.probed && !video.ok);
  $('#vidInfo').textContent = video.probed && !video.ok
    ? 'Этот браузер не умеет кодировать видео. Откройте страницу в свежем Chrome, Edge или Safari.'
    : `${frames} кадров · ${w} × ${h} · ${(bitrate / 1e6).toFixed(1)} Мбит/с · примерно ${fmtMb(bitrate * LOOP_SEC / 8)}`;
  $('#vidTag').textContent = `<video src="buksirator.${ext}" autoplay loop muted playsinline></video>`;
}
async function exportVideo(testCodec) {
  if (!gl || busy || !video.ok) return;
  const wasPlaying = playing, fmt = S.vidFmt;
  const { w, h, fps, frames, bitrate } = vidDims();
  setBusy(true); cancelGif = false; clearTimeout(hqTimer);
  let enc = null;
  try {
    status('Готовлю кодировщик…', { progress: 0, cancel: true });
    await nextFrame();
    let cfg = await pickCodec(fmt, w, h, fps, bitrate);
    if (testCodec) cfg = { codec: testCodec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality', bitrateMode: 'variable' };
    if (!cfg) { status(`Браузер не кодирует ${fmt === 'mp4' ? 'MP4 (H.264)' : 'WebM (VP9)'} в размере ${w} × ${h} при ${fps} к/с. Выберите другой формат или размер.`, { warn: true }); return; }
    const kind = cfg.codec.startsWith('avc1') ? 'avc' : cfg.codec.startsWith('av01') ? 'av1' : 'vp9';
    const muxer = fmt === 'mp4'
      ? new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: kind, width: w, height: h, frameRate: fps }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' })
      : new WebMMuxer.Muxer({ target: new WebMMuxer.ArrayBufferTarget(), video: { codec: kind === 'av1' ? 'V_AV1' : 'V_VP9', width: w, height: h, frameRate: fps }, firstTimestampBehavior: 'offset' });
    let failed = null;
    enc = new VideoEncoder({
      output: (chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (e) { failed = failed || e; } },
      error: e => { failed = failed || e; },
    });
    enc.configure(cfg);
    const px = new Uint8Array(w * h * 4), dur = 1e6 / fps;
    let last = performance.now();
    for (let f = 0; f < frames; f++) {
      if (cancelGif || failed) break;
      renderToPixels(f / frames, w, h, 3, px);
      const vf = new VideoFrame(px, { format: 'RGBX', codedWidth: w, codedHeight: h, timestamp: Math.round(f * dur), duration: Math.round(dur) });
      enc.encode(vf, { keyFrame: f % (fps * 2) === 0 });      // a key frame every two seconds
      vf.close();
      while (enc.encodeQueueSize > 3 && !failed) await new Promise(r => setTimeout(r, 2));
      if (performance.now() - last > 60 || f === frames - 1) {
        status(`Видео: кадр ${f + 1} из ${frames}`, { progress: (f + 1) / frames, cancel: true });
        if (f % 4 === 0) draw(f / frames, 1, W, H, true, false);
        await breathe(); last = performance.now();
      }
    }
    if (failed) throw failed;
    if (cancelGif) { status('Экспорт видео остановлен.', {}); return; }
    await enc.flush();
    if (failed) throw failed;
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: fmt === 'mp4' ? 'video/mp4' : 'video/webm' });
    await offer(`buksirator-${S.palette}-${stamp()}.${fmt}`, blob, `Видео сохранено · ${fmt === 'mp4' ? 'MP4' : 'WebM'} · ${w} × ${h} · ${fps} к/с · ${fmtMb(blob.size)}`);
  } catch (e) {
    status('Кодировщик видео остановился с ошибкой. Попробуйте другой формат, 30 к/с или размер поменьше.', { warn: true });
  } finally {
    try { if (enc && enc.state !== 'closed') enc.close(); } catch (e) { /* already closed */ }
    setBusy(false); scene.pulseKey = -1;
    if (wasPlaying) playStart = performance.now();
    refresh();
  }
}

/* ───────────────────────── live background (HTML + WebGL) ─────────────────────────
   Not a recording: the exported page carries the shader and the scene and draws the loop on the
   viewer's GPU, so it is lossless at any size and weighs a few dozen kilobytes. */
function playerMain(C, VS, FS, effParams, fillEdges, applyUniforms) {
  var cv = document.getElementById('bx');
  var gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return;                                        // the page keeps its plain dark background
  function shader(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  var U = {}, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS), i;
  for (i = 0; i < n; i++) { var info = gl.getActiveUniform(prog, i); U[info.name] = gl.getUniformLocation(prog, info.name); }
  gl.bindVertexArray(gl.createVertexArray());
  function tex(unit, min, mag, ws, wt) {
    var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, ws); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wt);
    return t;
  }
  var S = C.S, L = C.seq.length, GH = C.gh, edges = new Float32Array((L + 1) * 4);
  var tEdges = tex(0, gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
  tex(1, gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.REPEAT);
  var raw = atob(C.cols), data = new Uint8Array(L * GH * 4), x, y, o, q;
  for (x = 0; x < L; x++) for (y = 0; y < GH; y++) {
    o = (y * L + x) * 4; q = (C.seq[x] * GH + y) * 3;
    data[o] = raw.charCodeAt(q); data[o + 1] = raw.charCodeAt(q + 1); data[o + 2] = raw.charCodeAt(q + 2); data[o + 3] = 255;
  }
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, L, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  tex(2, gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(U.uEdges, 0); gl.uniform1i(U.uGrad, 1); gl.uniform1i(U.uImgTex, 2);

  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var imgOn = false, raf = 0, shown = true, t0 = performance.now(), lastKey = null;
  var ss = 2, dprCap = 2, prev = 0, slow = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  if (C.img) {
    var im = new Image();
    im.onload = function () {
      gl.activeTexture(gl.TEXTURE2);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.generateMipmap(gl.TEXTURE_2D);
      imgOn = true; kick();
    };
    im.src = C.img.src;
  }
  function frame(now) {
    raf = 0;
    var d = Math.min(window.devicePixelRatio || 1, dprCap);
    var w = Math.max(1, Math.round(cv.clientWidth * d)), h = Math.max(1, Math.round(cv.clientHeight * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    var t = still ? null : ((now - t0) / 1000 / C.loop) % 1;
    var amp = t == null ? 0 : S.aPulse, key = amp ? t : -1;
    if (key !== lastKey) {
      lastKey = key;
      fillEdges(edges, L, C.gw, C.pp, C.gp, S.spread, amp, t || 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tEdges);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, L + 1, 1, 0, gl.RGBA, gl.FLOAT, edges);
    }
    /* the 1920 x 1080 scene covers the canvas; whatever is cropped, the centre of attraction
       keeps its relative place in the window */
    var sc = Math.min(1920 / w, 1080 / h);
    gl.viewport(0, 0, w, h);
    applyUniforms(gl, U, S, effParams(S, t), L, w, h, sc, (1920 - w * sc) * S.cx, (1080 - h * sc) * S.cy, 1, ss, 0, imgOn ? C.img : null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (still) return;
    /* a slow GPU first gives up supersampling, then the retina resolution */
    if (prev && now - prev > 34) slow++; else slow = Math.max(0, slow - 1);
    prev = now;
    if (slow > 24) { slow = 0; if (ss > 1) ss = 1; else dprCap = 1; }
    if (shown && !document.hidden) kick(); else prev = 0;
  }
  window.addEventListener('resize', kick);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  if (window.IntersectionObserver) new IntersectionObserver(function (es) { shown = es[es.length - 1].isIntersecting; if (shown) kick(); }).observe(cv);
  kick();
}
function liveHtml() {
  const json = v => JSON.stringify(v).replace(/</g, '\\u003c');
  const r4 = a => Array.from(a, v => Math.round(v * 1e4) / 1e4);
  let bin = '';
  for (const col of scene.cols) for (let i = 0; i < col.length; i++) bin += String.fromCharCode(col[i]);
  const keys = ['cx', 'cy', 'radius', 'bend', 'bendDir', 'twist', 'repeat', 'spread', 'depth', 'gType', 'gFreq', 'gPhase',
    'imgW', 'imgRad', 'imgShadow', 'aSpeed', 'aBreath', 'aPulse', 'aFlow', 'aWaves'];
  const cfg = {
    loop: LOOP_SEC, S: Object.fromEntries(keys.map(k => [k, S[k]])),
    seq: scene.seq, gw: r4(scene.gw), pp: r4(scene.pp), gp: r4(scene.gp), gh: scene.gradH, cols: btoa(bin),
    img: image.on && image.canvas ? { src: image.canvas.toDataURL(image.alpha ? 'image/png' : 'image/jpeg', 0.92), w: image.w, h: image.h } : null,
  };
  const dark = scene.lch.reduce((m, c) => (c.L < m.L ? c : m), scene.lch[0]);
  const lt = '<', open = lt + 'script>', close = lt + '/script>';
  const code = '(' + playerMain.toString() + ')(' +
    [json(cfg), json(VS), json(FS), effParams.toString(), fillEdges.toString(), applyUniforms.toString()].join(',\n') + ');';
  return lt + '!doctype html>\n' + lt + 'html lang="ru">\n' + lt + 'head>\n' + lt + 'meta charset="utf-8">\n' +
    lt + 'meta name="viewport" content="width=device-width,initial-scale=1">\n' + lt + 'title>Буксиратор · живой фон' + lt + '/title>\n' +
    lt + '!-- Живой фон из генератора «Буксиратор»: рисуется на видеокарте (WebGL 2), цикл ' + LOOP_SEC + ' секунд.\n' +
    '     На сайт: iframe src="этот-файл.html" style="border:0;width:100%;height:100%" aria-hidden="true" -' + '->\n' +
    lt + 'style>html,body{margin:0;height:100%;overflow:hidden;background:' + lchToHex(dark) + '}canvas{display:block;width:100%;height:100%}' + lt + '/style>\n' +
    lt + '/head>\n' + lt + 'body>\n' + lt + 'canvas id="bx" aria-hidden="true">' + lt + '/canvas>\n' + open + '\n' + code + '\n' + close + '\n' +
    lt + '/body>\n' + lt + '/html>\n';
}
async function exportLive() {
  if (!gl || busy) return;
  setBusy(true);
  try {
    const blob = new Blob([liveHtml()], { type: 'text/html' });
    await offer(`buksirator-${S.palette}-${stamp()}.html`, blob, `Живой фон сохранён · HTML · ${fmtMb(blob.size)}`);
  } catch (e) {
    status('Не получилось собрать живой фон. Попробуйте ещё раз.', { warn: true });
  } finally { setBusy(false); refresh(); }
}

/* ───────────────────────── status line ───────────────────────── */
function status(text, o = {}) {
  const box = $('#status');
  box.hidden = !text;
  $('#statusText').textContent = text || '';
  box.classList.toggle('warn', !!o.warn); box.classList.toggle('done', !!o.done);
  const bar = $('#statusBar');
  bar.hidden = o.progress == null;
  if (o.progress != null) $('#statusFill').style.width = (o.progress * 100).toFixed(1) + '%';
  $('#btnCancel').hidden = !o.cancel;
  $('#btnRetry').hidden = !o.retry;
}
function note(text, warn) {
  const n = $('#imgNote'); if (!n) return;
  n.textContent = text || ''; n.hidden = !text; n.classList.toggle('warn', !!warn);
}

/* ───────────────────────── controls ───────────────────────── */
const fmtPct = v => Math.round(v * 100) + ' %';
const SLIDERS = {
  count: { label: 'Количество лучей', min: 8, max: 400, step: 1, fmt: () => String(seqLength() * S.repeat), scene: true },
  repeat: { label: 'Повторы узора по кругу', min: 1, max: 8, step: 1, fmt: v => '×' + v, scene: true },
  spread: { label: 'Разброс ширины', min: 0, max: 1, step: 0.01, fmt: fmtPct, edges: true },
  radius: { label: 'Радиус скругления', min: 60, max: 2000, step: 10, fmt: v => v + ' px' },
  bend: { label: 'Изгиб', min: -1.2, max: 1.2, step: 0.01, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) + ' %' },
  bendDir: { label: 'Куда гнуть', min: 0, max: 360, step: 1, fmt: v => v + '°' },
  twist: { label: 'Закрутка', min: -3, max: 3, step: 0.01, fmt: v => (v > 0 ? '+' : '') + v.toFixed(2) },
  cx: { label: 'По горизонтали', min: 0, max: 1, step: 0.001, fmt: v => Math.round(v * W) + ' px' },
  cy: { label: 'По вертикали', min: 0, max: 1, step: 0.001, fmt: v => Math.round(v * H) + ' px' },
  depth: { label: 'Глубина центра', min: -1, max: 1, step: 0.01, fmt: v => (v === 0 ? 'нет' : v > 0 ? 'тень ' + Math.round(v * 100) + ' %' : 'свет ' + Math.round(-v * 100) + ' %') },
  gStops: { label: 'Сложность', min: 2, max: 5, step: 1, fmt: v => v + ' ' + (v < 5 ? 'цвета' : 'цветов'), grad: true },
  gFreq: { label: 'Частота', min: 0.25, max: 4, step: 0.05, fmt: v => '×' + (+v.toFixed(2)) },
  gPhase: { label: 'Разнобой между лучами', min: 0, max: 1, step: 0.01, fmt: fmtPct },
  imgW: { label: 'Ширина картинки', min: 80, max: 1800, step: 2, fmt: v => Math.round(v) + ' px' },
  imgRad: { label: 'Скругление углов', min: 0, max: 1, step: 0.01, fmt: fmtPct },
  imgShadow: { label: 'Тень', min: 0, max: 1, step: 0.01, fmt: fmtPct },
  aSpeed: { label: 'Втягивание', min: 0, max: 8, step: 1, fmt: v => (v ? v + ' ' + plural(v, 'шаг', 'шага', 'шагов') + ' узора' : 'выкл.') },
  aBreath: { label: 'Дыхание искривления', min: 0, max: 1, step: 0.01, fmt: fmtPct },
  aPulse: { label: 'Пульс ширины лучей', min: 0, max: 1, step: 0.01, fmt: fmtPct },
  aFlow: { label: 'Поток градиента к центру', min: 0, max: 6, step: 1, fmt: v => (v ? v + ' ' + plural(v, 'цикл', 'цикла', 'циклов') : 'выкл.') },
  aWaves: { label: 'Волны глубины', min: 0, max: 1, step: 0.01, fmt: fmtPct },
};
function plural(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }
const ANIM_KEYS = ['aSpeed', 'aBreath', 'aPulse', 'aFlow', 'aWaves'];

function slider(key) {
  const d = SLIDERS[key], row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label for="s-${key}">${d.label}</label><output id="o-${key}" for="s-${key}"></output>
    <input type="range" id="s-${key}" min="${d.min}" max="${d.max}" step="${d.step}">`;
  const inp = $('input', row);
  inp.addEventListener('input', () => {
    S[key] = parseFloat(inp.value);
    onChange(key);
  });
  return row;
}
function paint(key) {
  const d = SLIDERS[key], inp = $('#s-' + key); if (!inp) return;
  if (document.activeElement !== inp || parseFloat(inp.value) !== S[key]) inp.value = S[key];
  inp.style.setProperty('--p', ((S[key] - d.min) / (d.max - d.min) * 100).toFixed(2) + '%');
  $('#o-' + key).textContent = d.fmt(S[key]);
}
function onChange(key) {
  const d = SLIDERS[key] || {};
  paint(key);
  if (key === 'repeat') paint('count');
  if (d.scene) rebuildScene();
  else if (d.grad) buildGradient();
  else if (d.edges) scene.pulseKey = -1;
  if (key === 'cx' || key === 'cy' || key === 'imgW') placeOverlay();
  if (ANIM_KEYS.includes(key) && !playing) setPlaying(true); else refresh();
  if (ANIM_KEYS.includes(key)) estimateGif();
}
function segmented(id, key, options, after) {
  const box = $('#' + id);
  box.innerHTML = options.map(([v, text]) => `<button type="button" data-v="${v}" aria-pressed="false">${text}</button>`).join('');
  box.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    S[key] = isNaN(+b.dataset.v) || key === 'gifSize' ? b.dataset.v : +b.dataset.v;
    paintSeg(id, key); after && after();
  });
  paintSeg(id, key);
}
function paintSeg(id, key) {
  for (const b of $('#' + id).children) b.setAttribute('aria-pressed', String(b.dataset.v) === String(S[key]) ? 'true' : 'false');
}
function syncControls() {
  Object.keys(SLIDERS).forEach(paint);
  paintSeg('segGrad', 'gType'); paintSeg('segMode', 'imgMode'); paintSeg('segSize', 'gifSize'); paintSeg('segFps', 'gifFps');
  paintVideo();
  $('#gradOpts').classList.toggle('off', S.gType === 'none');
  placeOverlay();
}

/* palette cards: a small fan of the palette's own rays */
function fanCss(colors, flow, seed) {
  const n = 16, seq = buildSeq(colors.length, n, seed, flow), rnd = mulberry32(seed + 5);
  const w = seq.map(() => Math.exp(1.0 * (rnd() * 2 - 1))), sum = w.reduce((a, b) => a + b, 0);
  let acc = 0; const parts = [];
  seq.forEach((ci, i) => { const a0 = acc / sum * 100; acc += w[i]; parts.push(`${colors[ci]} ${a0.toFixed(2)}% ${(acc / sum * 100).toFixed(2)}%`); });
  return `conic-gradient(from 215deg at 18% 52%, ${parts.join(', ')})`;
}
function renderPaletteCards() {
  const mk = p => `<button type="button" class="pal" data-id="${p.id}" aria-pressed="${S.palette === p.id}">
      <span class="fan" style="background:${fanCss(p.colors, p.flow, 3)}"></span><span class="pname">${p.name}</span></button>`;
  $('#palBasic').innerHTML = PALETTES.filter(p => !p.flow).map(mk).join('') + (image.on && IMAGE_PALETTE.colors.length ? mk(IMAGE_PALETTE) : '');
  $('#palComplex').innerHTML = PALETTES.filter(p => p.flow).map(mk).join('');
}
function renderImagePane() {
  $('#imgEmpty').hidden = image.on; $('#imgLoaded').hidden = !image.on;
  if (!image.on) return;
  $('#imgThumb').src = image.thumb;
  $('#imgName').textContent = image.name;
  const sw = cols => cols.map(h => `<i style="background:${h}" title="${h.toUpperCase()}"></i>`).join('');
  $('#swImage').innerHTML = sw(image.dom.slice(0, 6).map(lchToHex));
  $('#swRays').innerHTML = sw(IMAGE_PALETTE.colors);
}
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'));
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== name; });
  $('.panes').scrollTop = 0;
  if (name === 'motion') estimateGif();
}

/* ───────────────────────── direct manipulation on the frame ───────────────────────── */
const frame = $('#frame');
function placeOverlay() {
  const pin = $('#pin'), box = $('#imgbox');
  pin.style.left = S.cx * 100 + '%'; pin.style.top = S.cy * 100 + '%';
  pin.hidden = image.on; box.hidden = !image.on;
  $('#hint').textContent = image.on ? 'Двигайте картинку по макету, угол меняет размер' : 'Тяните центр притяжения прямо по макету';
  if (image.on) {
    const hh = S.imgW * image.h / image.w;
    box.style.left = (S.cx - S.imgW / 2 / W) * 100 + '%'; box.style.top = (S.cy - hh / 2 / H) * 100 + '%';
    box.style.width = S.imgW / W * 100 + '%'; box.style.height = hh / H * 100 + '%';
  }
}
function toScene(ev) {
  const r = cv.getBoundingClientRect();
  return [(ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H];
}
let drag = null;
frame.addEventListener('pointerdown', ev => {
  if (!gl || busy || ev.button > 0) return;
  const p = toScene(ev), c = centerPx();
  if (ev.target.dataset && ev.target.dataset.h) {
    drag = { mode: 'size', d0: Math.max(20, Math.hypot(p[0] - c[0], p[1] - c[1])), w0: S.imgW };
  } else {
    let off = [0, 0];
    if (image.on) {
      const hw = S.imgW / 2, hh = hw * image.h / image.w;
      if (Math.abs(p[0] - c[0]) <= hw && Math.abs(p[1] - c[1]) <= hh) off = [c[0] - p[0], c[1] - p[1]];
    }
    drag = { mode: 'move', off };
    moveTo(p, off);
  }
  frame.setPointerCapture(ev.pointerId); frame.classList.add('dragging');
  ev.preventDefault();
});
function moveTo(p, off) {
  S.cx = clamp((p[0] + off[0]) / W, 0, 1); S.cy = clamp((p[1] + off[1]) / H, 0, 1);
  paint('cx'); paint('cy'); placeOverlay(); refresh();
}
frame.addEventListener('pointermove', ev => {
  if (!drag) return;
  const p = toScene(ev);
  if (drag.mode === 'move') moveTo(p, drag.off);
  else {
    const c = centerPx();
    S.imgW = clamp(drag.w0 * Math.hypot(p[0] - c[0], p[1] - c[1]) / drag.d0, SLIDERS.imgW.min, SLIDERS.imgW.max);
    paint('imgW'); placeOverlay(); refresh();
  }
});
const endDrag = () => { drag = null; frame.classList.remove('dragging'); };
frame.addEventListener('pointerup', endDrag); frame.addEventListener('pointercancel', endDrag);
frame.addEventListener('dragover', ev => { ev.preventDefault(); frame.classList.add('drop'); });
frame.addEventListener('dragleave', () => frame.classList.remove('drop'));
frame.addEventListener('drop', ev => {
  ev.preventDefault(); frame.classList.remove('drop');
  const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (f) loadImageFile(f);
});

/* ───────────────────────── boot ───────────────────────── */
function buildUi() {
  const put = (id, keys) => { const host = $('#' + id); keys.forEach(k => host.appendChild(slider(k))); };
  put('slRays', ['count', 'repeat', 'spread']);
  put('slCurve', ['radius', 'bend', 'bendDir', 'twist']);
  put('slCenter', ['cx', 'cy', 'depth']);
  put('slGrad', ['gStops', 'gFreq', 'gPhase']);
  put('slImage', ['imgW', 'imgRad', 'imgShadow']);
  put('slMotion', ANIM_KEYS);
  segmented('segGrad', 'gType', [['none', 'Нет'], ['along', 'Вдоль'], ['across', 'Поперёк'], ['both', 'Оба']], () => {
    $('#gradOpts').classList.toggle('off', S.gType === 'none'); buildGradient(); refresh();
  });
  segmented('segMode', 'imgMode', [['comp', 'Комплемент'], ['split', 'Сплит'], ['tone', 'В тон']], () => { applyImagePalette(); renderImagePane(); });
  segmented('segSize', 'gifSize', [['1920x1080', '1920 × 1080'], ['1280x720', '1280 × 720'], ['960x540', '960 × 540']], estimateGif);
  segmented('segFps', 'gifFps', [[10, '10 к/с'], [20, '20 к/с'], [25, '25 к/с']], estimateGif);
  segmented('segVfmt', 'vidFmt', [['mp4', 'MP4 · H.264'], ['webm', 'WebM · VP9']], paintVideo);
  segmented('segVsize', 'vidSize', [['1920x1080', '1920 × 1080'], ['1280x720', '1280 × 720']], paintVideo);
  segmented('segVfps', 'vidFps', [[30, '30 к/с'], [60, '60 к/с']], paintVideo);
  segmented('segVq', 'vidQ', [['light', 'Лёгкое'], ['high', 'Высокое'], ['max', 'Максимум']], paintVideo);

  for (const id of ['palBasic', 'palComplex']) {
    $('#' + id).addEventListener('click', ev => {
      const b = ev.target.closest('.pal'); if (!b) return;
      S.palette = b.dataset.id; renderPaletteCards(); rebuildScene(); refresh();
    });
  }
  $('#btnShuffle').addEventListener('click', () => { S.seed = (S.seed * 31 + 17) % 9973 + 1; rebuildScene(); refresh(); });
  $('.tabs').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) showTab(b.dataset.tab); });
  $('#btnPlay').addEventListener('click', () => setPlaying(!playing));
  $('#btnPng').addEventListener('click', exportPng);
  $('#btnGif').addEventListener('click', exportGif);
  $('#btnVid').addEventListener('click', () => exportVideo());
  $('#btnLive').addEventListener('click', exportLive);
  $('#btnCancel').addEventListener('click', () => { cancelGif = true; });
  $('#btnRetry').addEventListener('click', () => { if (lastFile) offer(lastFile.name, lastFile.blob, 'Файл сохранён.'); });
  $('#btnReset').addEventListener('click', () => {
    const keep = { palette: S.palette, imgW: S.imgW, imgRad: S.imgRad, imgShadow: S.imgShadow, imgMode: S.imgMode, gifSize: S.gifSize, gifFps: S.gifFps,
      vidFmt: S.vidFmt, vidSize: S.vidSize, vidFps: S.vidFps, vidQ: S.vidQ };
    Object.assign(S, DEFAULTS, keep);
    syncControls(); rebuildScene(); refresh();
  });
  const file = $('#file');
  file.addEventListener('change', () => { if (file.files[0]) loadImageFile(file.files[0]); file.value = ''; });
  $('#btnRemove').addEventListener('click', removeImage);
  const dz = $('#imgEmpty');
  dz.addEventListener('dragover', ev => { ev.preventDefault(); dz.classList.add('drop'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drop'));
  dz.addEventListener('drop', ev => { ev.preventDefault(); dz.classList.remove('drop'); const f = ev.dataTransfer.files[0]; if (f) loadImageFile(f); });
  window.addEventListener('paste', ev => {
    const it = [...(ev.clipboardData ? ev.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
    if (it) loadImageFile(it.getAsFile());
  });
}

function start() {
  buildUi(); renderPaletteCards(); renderImagePane(); syncControls(); showTab('color');
  let ok = false;
  try { ok = initGL(); } catch (e) { ok = false; console.error(e); }
  if (!ok) {
    $('#nogl').hidden = false;
    for (const id of ['btnPng', 'btnGif', 'btnVid', 'btnLive', 'btnPlay']) $('#' + id).disabled = true;
    return;
  }
  rebuildScene(); refresh();
  probeVideo();
  cv.addEventListener('webglcontextlost', ev => { ev.preventDefault(); gl = null; });
  cv.addEventListener('webglcontextrestored', () => { try { if (initGL()) { rebuildScene(); refresh(); } } catch (e) { /* stays blank */ } });
}
start();

/* hooks for automated checks */
window.__bx = { S, DEFAULTS, image, scene, sync: () => { syncControls(); renderPaletteCards(); rebuildScene(); refresh(); },
  still: ss => { rebuildScene(); draw(null, ss || 4, W, H, true, true); }, frameAt: (t, ss) => draw(t, ss || 3, W, H, true, false),
  pixels: (t, w, h, ss) => renderToPixels(t, w, h, ss || 3, new Uint8Array(w * h * 4)),
  loadImageFile, exportGif, exportPng, exportVideo, exportLive, liveHtml, video, setPlaying, get last() { return lastFile; }, get busy() { return busy; } };
})();
