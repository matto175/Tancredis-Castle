// shaders 1/4: shared code, textures and tables baked at load, sky and atmosphere
// atmosphere (CPU side: the sun's colour at the ground)
// Rayleigh + Mie + ozone, same constants as the sky shader; metres
const ATM = { RG: 6360e3, RT: 6440e3, BR: [5.802e-6, 13.558e-6, 33.1e-6], BM: 0.85e-5, BME: 0.95e-5, BO: [0.65e-6, 1.881e-6, 0.085e-6], HR: 8000, HM: 1200 };
const E0 = 16; // sun illuminance above the atmosphere, scene units
// ground-to-sun transmittance, and the multiple-scattering factor PSI (Hillaire 2020) at the ground
const atmo = () => {
  const { RG, RT, BR, BM, BME, BO, HR, HM } = ATM, o = [0, RG + 30, 0];
  const dens = (p) => { const h = hypot(p[0], p[1], p[2]) - RG; return [exp(-h / HR), exp(-h / HM), max(0, 1 - abs(h - 25e3) / 15e3)]; };
  const far = (p, d, R) => { const b = p[0] * d[0] + p[1] * d[1] + p[2] * d[2], c = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - R * R, q = b * b - c; return q < 0 ? -1 : -b + sqrt(q); };
  const near = (p, d, R) => { const b = p[0] * d[0] + p[1] * d[1] + p[2] * d[2], c = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - R * R, q = b * b - c; return q < 0 || b > 0 ? -1 : -b - sqrt(q); };
  const trans = (p, d, n) => {
    const tm = far(p, d, RT), dt = tm / n, od = [0, 0, 0];
    for (let i = 0; i < n; i++) { const t = (i + 0.5) * dt, q = dens([p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t]); od[0] += q[0] * dt; od[1] += q[1] * dt; od[2] += q[2] * dt; }
    return [0, 1, 2].map((c) => exp(-(BR[c] * od[0] + BME * od[1] + BO[c] * od[2])));
  };
  const sd = [hypot(SUN[0], SUN[2]), SUN[1], 0], Ts = trans(o, sd, 64);
  const L2 = [0, 0, 0], fms = [0, 0, 0], NA = 8, NB = 16, NS = 24;
  for (let a = 0; a < NA; a++) for (let b = 0; b < NB; b++) {
    const ct = 1 - 2 * (a + 0.5) / NA, st = sqrt(1 - ct * ct), ph = (b + 0.5) / NB * TAU, d = [st * cos(ph), ct, st * sin(ph)];
    let tm = near(o, d, RG); if (tm < 0) tm = far(o, d, RT);
    const od = [0, 0, 0], dt = tm / NS;
    for (let i = 0; i < NS; i++) {
      const t = (i + 0.5) * dt, p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], q = dens(p), tsun = trans(p, sd, 10);
      od[0] += q[0] * dt; od[1] += q[1] * dt; od[2] += q[2] * dt;
      for (let c = 0; c < 3; c++) { const T = exp(-(BR[c] * od[0] + BME * od[1] + BO[c] * od[2])), ss = BR[c] * q[0] + BM * q[1]; L2[c] += T * ss * tsun[c] * dt / (NA * NB * 4 * PI) * 4 * PI / (4 * PI); fms[c] += T * ss * dt / (NA * NB); }
    }
  }
  return { Ts, PSI: [0, 1, 2].map((c) => L2[c] / (1 - min(fms[c], 0.9))) };
};

// shared WGSL
const W_COMMON = /*wgsl*/`
const PI = 3.14159265;
const LV = ${LV}; // quality.js
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn sat3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.), vec3f(1.)); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = sat((x - a) / (b - a)); return t * t * (3. - 2. * t); }
fn sq(x: f32) -> f32 { return x * x; }
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(.2126, .7152, .0722)); }
// interleaved gradient noise: dither for stochastic effects, averaged out by TAA
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn h11(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn h21(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h22(p: vec2f) -> vec2f { var q = fract(vec3f(p.xyx) * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
fn qmul(a: vec4f, b: vec4f) -> vec4f { return vec4f(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); } // b first, then a
// one camera's view (main, mirror, shadow)
struct View {
  vp: mat4x4f, ivp: mat4x4f, pvp: mat4x4f,
  sm: array<mat4x4f, 4>, // camera cascade, then the three baked maps
  cam: vec4f, // position, time
  res: vec4f,   // width, height and their inverses
  jit: vec4f, // sub-pixel jitter (ndc), frame number, clip height (mirror)
  sun: vec4f,   // direction towards the sun
  sunc: vec4f, // sun illuminance at the ground, exposure
  right: vec4f, // right, tan(half fov x)
  up: vec4f, // up, tan(half fov y)
  fwd: vec4f, // forward, near plane
  planes: array<vec4f, 6>,
  pulse: vec4f, // seconds since the pulse left, breathing (0-1), flare at the beat, mirror weight
  misc: vec4f, // 1 = drop TAA history, view kind (0 main, 1 mirror, 2 shadow), lod scale, wind on/off
  lodc: vec4f, // LOD reference point; w: 1 / the level's distance scale
  lodb: vec4f, // x: minimum LOD distance (baked maps on Medium/Low: never the finest)
  ev: vec4f, // events (Tancredi's Castle): storm 0-1, seconds into the dragon's flight, seconds into the sea battle (< 0: off), the fleets' presence 0-1
}
`;
// full-screen triangle
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// leaf atlas foliage (helpers, tile numbers and other tiles: fsLeaf below)
// wall foliage (vines; tiles 6, 8, 9): dense carpets with a ragged outline short of the border, so overlapping cards merge
const W_LEAF_WALL = /*wgsl*/`
fn wallFoliage(tile: i32, p: vec2f) -> LA {
  var c = LA(1., .8, 0., .5);
  if (tile == 8) {
    c = carpet(c, p, 230, 1., .085, .03);
  } else if (tile == 9) { // blossom: the leaf carpet with five-petalled flowers
    c = carpet(c, p, 170, 4., .09, .03);
    for (var i = 0; i < 84; i++) {
      let r = h22(vec2f(f32(i), 61.)); let s = spread(i, 84, r.x * 3.); let a = s.x; let o = vec2f(.5) + rot2(a) * s.y * lobe(a, 4.) + (r - .5) * .04; let q = p - o;
      let R = .034 + .014 * h11(f32(i)); let d = length(q) - R * (.62 + .38 * abs(cos(2.5 * atan2(q.y, q.x) + r.x * 9.)));
      c = over(c, d, .75 + .5 * sat(length(q) / R) - .3 * ss(.25, 0., length(q) / R), 1., r.y);
    }
  } else if (tile == 6) { // lower edge of a wall mass: a dense band of downward leaves on top, trailing stems below
    for (var i = 0; i < 170; i++) {
      let r = h22(vec2f(f32(i), 83.)); let o = vec2f(.07 + .86 * fract(f32(i) * .6180339 + .1), .4 + .53 * fract(f32(i) * .7548777 + .3));
      if (o.y < .47 + .07 * sin(o.x * 11.) + .04 * sin(o.x * 23. + 1.)) { continue; }
      let h = rot2(-1.571 + (r.x - .5) * 2.) * (.034 + .014 * r.y);
      c = leaf(c, p, o - h, o + h, .029, (.55 + .45 * r.y) * (.75 + .5 * (o.y - .4)));
    }
    for (var k = 0; k < 9; k++) {
      let rk = h22(vec2f(f32(k), 80.)); let x0 = .08 + .84 * (f32(k) + .25 + .5 * rk.x) / 9.; let y0 = .52 + .07 * sin(x0 * 11.); let ln = .14 + .34 * rk.y; let x1 = x0 + (rk.x - .5) * .05;
      for (var i = 0; i < 8; i++) {
        let t = (f32(i) + .5) / 8.; let r = h22(vec2f(f32(i), f32(k) + 90.)); let sd = f32(i & 1) * 2. - 1.;
        let q = vec2f(mix(x0, x1, t), y0 - t * ln);
        c = leaf(c, p, q, q + rot2(-1.571 + sd * (.9 + .45 * r.x)) * (.06 + .025 * r.y), .028, .6 + .4 * r.x);
      }
      c = put(c, seg(p, vec2f(x0, y0), vec2f(x1, y0 - ln)) - .0035, .45, 0., .5);
    }
  }
  return c;
}
`;
// crown foliage (olive 0, broad 1, pine 2, blossom 4): a 2x2 or 3x3 mosaic of one sprig out to the border; many
// sparse overlapping cards read as a volume of small leaves with air in it
const W_LEAF_CROWN = /*wgsl*/`
fn sprigs(tile: i32, p0: vec2f) -> LA {
  var c = LA(1., .8, 0., .5); var p = p0;
  let few = tile == 0 || tile == 1 || tile == 4;
  let q0 = p * select(2., 3., few); let cl = floor(q0) % 2.; p = fract(q0); if (cl.x > .5) { p.x = 1. - p.x; } if (cl.y > .5) { p.y = 1. - p.y; }
  // each copy turned and shifted its own way, so sprigs never line up
  if (few) { let hc = h22(floor(q0) + f32(tile) * 7.); let an = hc.x * 6.283; let d = p - .5; p = vec2f(d.x * cos(an) - d.y * sin(an), d.x * sin(an) + d.y * cos(an)) * (.8 + .25 * hc.y) + .5; }
  p = p * .96 + .02;
  if (tile == 0) { // olive: narrow paired leaves along a twig
    for (var i = 0; i < 12; i++) {
      let y = .06 + f32(i) * .075; let o = vec2f(.5 + .05 * sin(y * 5.), y); let r = h22(vec2f(f32(i), 1.));
      c = leaf(c, p, o, o + rot2(.95 + r.x * .5) * (.2 + .07 * r.y), .028, .75 + .25 * r.x);
      c = leaf(c, p, o + vec2f(0., .03), o + vec2f(0., .03) + rot2(PI - .95 - r.y * .5) * (.2 + .07 * r.x), .028, .75 + .25 * r.y);
    }
    c = put(c, seg(p, vec2f(.5, 0.), vec2f(.5 + .05 * sin(4.7), .93)) - .008, .45, 0., .5);
  } else if (tile == 1) { // broad leaves: a loose cluster
    for (var i = 0; i < 15; i++) {
      let r = h22(vec2f(f32(i), 2.)); let r2 = h22(vec2f(f32(i), 5.)); let a = r.x * 6.283;
      let o = vec2f(.5) + rot2(a) * (.05 + .2 * r.y);
      c = leaf(c, p, o, o + rot2(a + (r2.x - .5) * 1.2) * (.2 + .1 * r2.y), .07 + .02 * r2.x, .65 + .35 * r2.y);
    }
  } else if (tile == 2) { // stone pine: fans of needles
    for (var k = 0; k < 7; k++) {
      let o = vec2f(.5) + (h22(vec2f(f32(k), 9.)) - .5) * .56; let ba = h21(vec2f(f32(k), 3.)) * 6.283;
      for (var i = 0; i < 15; i++) { let r = h22(vec2f(f32(i), f32(k) + 20.)); c = put(c, seg(p, o, o + rot2(ba + (f32(i) / 15. - .5) * 2.6) * (.16 + .1 * r.x)) - .0055, .6 + .4 * r.y, 0., .5); }
    }
  } else if (tile == 4) { // blossom: five-petalled flowers over a few leaves
    for (var i = 0; i < 6; i++) { let r = h22(vec2f(f32(i), 51.)); let a = r.x * 6.283; let o = vec2f(.5) + rot2(a) * .12; c = leaf(c, p, o, o + rot2(a) * (.26 + .08 * r.y), .06, .7); }
    for (var i = 0; i < 19; i++) {
      let r = h22(vec2f(f32(i), 61.)); let o = vec2f(.5) + rot2(r.x * 6.283) * sqrt(r.y) * .38; let q = p - o;
      let R = .062 + .02 * h11(f32(i)); let d = length(q) - R * (.62 + .38 * abs(cos(2.5 * atan2(q.y, q.x) + r.x * 9.)));
      c = put(c, d, .75 + .5 * sat(length(q) / R) - .3 * ss(.25, 0., length(q) / R), 1., .5);
    }
  }
  return c;
}
`;

// tiling detail textures (baked once)
const W_NOISE =W_COMMON + W_FS + /*wgsl*/`
fn hp(p: vec2f, per: f32) -> f32 { return h21(p - per * floor(p / per) + per * 3.7); }
fn tn(p: vec2f, per: f32) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(hp(i, per), hp(i + vec2f(1., 0.), per), u.x), mix(hp(i + vec2f(0., 1.), per), hp(i + vec2f(1., 1.), per), u.x), u.y);
}
fn tf(uv: vec2f, per: f32, n: i32) -> f32 { var a = .5; var s = 0.; var pr = per; for (var i = 0; i < n; i++) { s += a * tn(uv * pr + f32(i) * 7.3, pr); pr *= 2.; a *= .5; } return s / (1. - 2. * a); }
fn tw(uv: vec2f, per: f32) -> vec2f {
  let p = uv * per; let i = floor(p); var d = vec2f(9.);
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let c = i + vec2f(f32(x), f32(y)); let w = c - per * floor(c / per);
    let q = c + h22(w + 17.) - p; let l = dot(q, q);
    if (l < d.x) { d.y = d.x; d.x = l; } else if (l < d.y) { d.y = l; }
  } }
  return sqrt(d);
}
// marble veins: thin dark ridges of warped noise
fn vein(uv: vec2f) -> f32 {
  let w = vec2f(tf(uv + .31, 4., 4), tf(uv + .77, 4., 4)) - .5;
  let a = 1. - abs(2. * tf(uv + w * .22, 3., 5) - 1.); let b = 1. - abs(2. * tf(uv + w * .3 + .5, 6., 4) - 1.);
  return sat(pow(a, 14.) + .5 * pow(b, 22.));
}
fn hFine(uv: vec2f) -> f32 { return tf(uv, 24., 5) + .35 * tf(uv, 128., 2); }
fn hRock(uv: vec2f) -> f32 { let r = 1. - abs(2. * tf(uv, 5., 6) - 1.); let c = tw(uv, 9.); return r * r * .7 + (c.y - c.x) * .5 + .25 * tf(uv, 40., 3); }
// A: r soft cloudy noise, g cells, b veins, a fine grain
@fragment fn fsA(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / ${NOISEPX}.;
  return vec4f(tf(uv, 4., 7), tw(uv, 16.).x, vein(uv), tf(uv, 96., 3));
}
// N: slopes of two height fields: rg fine grain and pores, ba fractured rock
@fragment fn fsN(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / ${NOISEPX}.; let e = 1. / 1024.;
  let a = hFine(uv); let b = hRock(uv);
  let da = vec2f(hFine(uv + vec2f(e, 0.)) - a, hFine(uv + vec2f(0., e)) - a) * 60.;
  let db = vec2f(hRock(uv + vec2f(e, 0.)) - b, hRock(uv + vec2f(0., e)) - b) * 40.;
  return vec4f(da * .5 + .5, db * .5 + .5);
}

// leaf atlas: 4 x 3 tiles. r shade, g petal (1) or leaf (0), b per-leaf random, a distance to the leaf edge (.5 on it,
// ramped, so a threshold thins or fattens leaves). Tiles (LT in sh_scene.js): 0 olive, 1 broad, 2 pine, 3 cypress,
// 4 blossom, 5 hydrangea, 7 lavender; vines: 6 trailing stems, 8 leaves, 9 blossom; 10, 11 empty.
struct LA { d: f32, sh: f32, fl: f32, id: f32 }
fn put(c: LA, d: f32, sh: f32, fl: f32, id: f32) -> LA { if (d < c.d) { return LA(d, sh, fl, id); } return c; }
// a shape on top of what is there: petals over leaves
fn over(c: LA, d: f32, sh: f32, fl: f32, id: f32) -> LA { if (d < 0.) { return LA(min(c.d, d), sh, fl, id); } return put(c, d, sh, fl, id); }
// carpet root distance from the tile centre in direction a: a rounded square with bays; s picks the shape
fn lobe(a: f32, s: f32) -> f32 {
  let cs = vec2f(cos(a), sin(a)); let q = cs * cs;
  return .44 * pow(dot(q, q), -.25) * (1. - .05 * (1. + sin(a * 3. + s)) - .03 * (1. + sin(a * 5. + s * 2.3)));
}
// point i of n spread evenly over a disc (sunflower spiral), nudged by j: (angle, share of radius)
fn spread(i: i32, n: i32, j: f32) -> vec2f { return vec2f(f32(i) * 2.39996 + j * .7, sqrt((f32(i) + .5) / f32(n))); }
// leaf from a to b, half width w: a pointed lens with a darker midrib
fn leaf(c: LA, p: vec2f, a: vec2f, b: vec2f, w: f32, sh: f32) -> LA {
  let ba = b - a; let l = length(ba); let dr = ba / l; let q = p - a;
  let t = dot(q, dr) / l; let s = dot(q, vec2f(-dr.y, dr.x));
  let wd = w * pow(sin(PI * pow(sat(t), .8)), .7);
  let d = max(abs(s) - wd, max(-t, t - 1.) * l);
  return put(c, d, sh * (.72 + .28 * ss(0., .35, abs(s) / w)) * (.85 + .3 * t), 0., h21(a * 53.7 + b * 17.3));
}
fn seg(p: vec2f, a: vec2f, b: vec2f) -> f32 { let pa = p - a; let ba = b - a; return length(pa - ba * sat(dot(pa, ba) / dot(ba, ba))); }
fn rot2(a: f32) -> vec2f { return vec2f(cos(a), sin(a)); }
// a carpet of n leaves (length ~ln, half width wd) on the spread, any way round; darker towards the middle
fn carpet(c0: LA, p: vec2f, n: i32, sd: f32, ln: f32, wd: f32) -> LA {
  var c = c0;
  for (var i = 0; i < n; i++) {
    let r = h22(vec2f(f32(i), sd)); let r2 = h22(vec2f(f32(i), sd + 3.)); let s = spread(i, n, r.x);
    let o = vec2f(.5) + rot2(s.x) * s.y * lobe(s.x, sd); let h = rot2(r.y * 6.283) * ln * (.4 + .2 * r2.x);
    c = leaf(c, p, o - h, o + h, wd * (.85 + .3 * r2.y), (.55 + .45 * r2.y) * (.8 + .2 * s.y));
  }
  return c;
}
@fragment fn fsLeaf(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let g = fc.xy / ${LEAFPX}.; let tile = i32(g.x) + 4 * i32(g.y); var p = fract(g); p.y = 1. - p.y;
  var c = LA(1., .8, 0., .5);
  // vine tiles have a softer edge ramp
  if (tile == 6 || tile >= 8) { c = wallFoliage(tile, p); return vec4f(c.sh, c.fl, c.id, sat(.5 - c.d * 60.)); }
  // cypress: upright sprays, four mirrored copies per tile, around a solid core
  if (tile == 3) { let q = p * 2.; let cl = floor(q) % 2.; p = fract(q); if (cl.x > .5) { p.x = 1. - p.x; } p = p * .96 + .02; }
  if (tile == 3) { // cypress: dense sprays of scale leaves
    for (var k = 0; k < 7; k++) {
      let r0 = h22(vec2f(f32(k), 31.)); let o = vec2f(.14 + .12 * f32(k), .02 + .1 * r0.x); let top = o + vec2f((r0.y - .5) * .16, .72 + .22 * r0.x);
      for (var i = 0; i < 11; i++) {
        let t = f32(i) / 11.; let q = mix(o, top, t); let r = h22(vec2f(f32(i), f32(k) + 40.)); let sd = f32(i & 1) * 2. - 1.;
        c = leaf(c, p, q, q + rot2(1.571 - sd * (.5 + .4 * r.x)) * (.13 + .06 * r.y) * (1.15 - t * .5), .034, .6 + .4 * r.x);
      }
      c = leaf(c, p, mix(o, top, .85), top + vec2f(0., .06), .03, .9);
    }
  } else if (tile == 5) { // hydrangea: round heads of florets
    for (var i = 0; i < 7; i++) { let r = h22(vec2f(f32(i), 71.)); let a = r.x * 6.283; let o = vec2f(.5) + rot2(a) * .1; c = leaf(c, p, o, o + rot2(a) * (.3 + .1 * r.y), .085, .7); }
    for (var k = 0; k < 4; k++) {
      let o = vec2f(.5) + (h22(vec2f(f32(k), 77.)) - .5) * .42; let q = p - o; let R = .2 + .05 * h11(f32(k) + 3.);
      let d = length(q) - R * (.92 + .08 * cos(11. * atan2(q.y, q.x)));
      let cell = tw(q + 3., 26.); c = put(c, d, (.72 + .4 * ss(.0, .5, cell.x)) * (1.08 - .35 * length(q) / R), 1., f32(k) * .25);
    }
  } else if (tile == 7) { // lavender: flower spikes over thin blades
    for (var k = 0; k < 11; k++) {
      let r = h22(vec2f(f32(k), 101.)); let o = vec2f(.3 + .4 * r.x, 0.); let top = vec2f(.08 + .084 * f32(k), .62 + .34 * r.y);
      c = put(c, seg(p, o, top) - .006, .55, 0., r.x);
      for (var i = 0; i < 9; i++) { let q = mix(o, top, .62 + .042 * f32(i)); c = put(c, length(p - q - vec2f(.012 * (f32(i & 1) * 2. - 1.), 0.)) - .017, .8 + .3 * h11(f32(i * 7 + k)), 1., r.y); }
      c = leaf(c, p, o, o + rot2(1.571 + (r.x - .5) * 1.4) * (.3 + .15 * r.y), .014, .7);
    }
  } else { c = sprigs(tile, p); }
  return vec4f(c.sh, c.fl, c.id, sat(.5 - c.d * 180.));
}
` + W_LEAF_CROWN + W_LEAF_WALL;

// sky table (baked once: the sun never moves)
// clear-sky radiance per unit sun illuminance: u = azimuth from the sun, v = elevation (denser near the horizon).
// Single scattering marched, multiple from PSI.
const W_SKYLUT = (a) => W_COMMON + W_FS + /*wgsl*/`
const RG = ${ATM.RG}.; const RT = ${ATM.RT}.; const BR = vec3f(${ATM.BR}); const BM = ${ATM.BM}; const BME = ${ATM.BME}; const BO = vec3f(${ATM.BO});
const PSI = vec3f(${a.PSI}); const SE = ${asin(SUN[1])};
fn dens(p: vec3f) -> vec3f { let h = length(p) - RG; return vec3f(exp(-h / ${ATM.HR}.), exp(-h / ${ATM.HM}.), max(0., 1. - abs(h - 25000.) / 15000.)); }
fn ext(d: vec3f) -> vec3f { return BR * d.x + vec3f(BME * d.y) + BO * d.z; }
fn hit(p: vec3f, d: vec3f, r: f32, nearSide: bool) -> f32 { let b = dot(p, d); let q = b * b - dot(p, p) + r * r; if (q < 0.) { return -1.; } if (nearSide) { if (b > 0.) { return -1.; } return -b - sqrt(q); } return -b + sqrt(q); }
fn odSun(p: vec3f, sd: vec3f) -> vec3f { let tm = hit(p, sd, RT, false); let dt = tm / 10.; var od = vec3f(0.); for (var i = 0; i < 10; i++) { od += dens(p + sd * (f32(i) + .5) * dt) * dt; } return od; }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(256., 128.);
  let az = (uv.x - .5) * 2. * PI; let v = uv.y * 2. - 1.; let el = sign(v) * v * v * PI * .5;
  let rd = vec3f(cos(el) * cos(az), sin(el), cos(el) * sin(az)); let sd = vec3f(cos(SE), sin(SE), 0.);
  let ro = vec3f(0., RG + 30., 0.);
  var tm = hit(ro, rd, RG, true); if (tm < 0.) { tm = hit(ro, rd, RT, false); }
  let mu = dot(rd, sd); let pr = 3. / (16. * PI) * (1. + mu * mu);
  let g = .8; let pm = 3. / (8. * PI) * (1. - g * g) * (1. + mu * mu) / ((2. + g * g) * pow(1. + g * g - 2. * g * mu, 1.5));
  var od = vec3f(0.); var L = vec3f(0.); const N = 48.;
  for (var i = 0.; i < N; i += 1.) {
    let t0 = tm * sq(i / N); let t1 = tm * sq((i + 1.) / N); let dt = t1 - t0; let p = ro + rd * (t0 + t1) * .5; let d = dens(p);
    od += d * dt * .5; let ts = exp(-ext(odSun(p, sd)));
    L += exp(-ext(od)) * ((BR * d.x * pr + BM * d.y * pm) * ts + (BR * d.x + BM * d.y) * PSI) * dt;
    od += d * dt * .5;
  }
  return vec4f(L, 1.);
}
`;
// the sky as seen: table, sun disc, drifting clouds. Needs tSky, tNoiseA, sRep, view.
const W_SKY = /*wgsl*/`
const E0 = ${E0}.;
fn skyLut(d: vec3f) -> vec3f {
  let az = atan2(d.z, d.x) - atan2(view.sun.z, view.sun.x); let el = asin(clamp(d.y, -1., 1.));
  let uv = vec2f(az / (2. * PI) + .5, clamp(.5 + .5 * sign(el) * sqrt(abs(el) / (PI * .5)), .004, .996));
  // lifted towards the zenith (single scattering alone is too dark overhead)
  var c = textureSampleLevel(tSky, sRep, uv, 0.).rgb * E0 * ${SUNK} * select(vec3f(1.), vec3f(.55, .75, 1.3), ${NIGHT} == 1) * mix(1., 1.8, sat(d.y * 1.4) * (1. - ss(.5, .97, dot(d, view.sun.xyz))));
  // pearl just above the horizon, warming to cream and gold (and higher) towards the low sun
  let ts = ss(-.35, .95, dot(d.xz / max(length(d.xz), 1e-4), normalize(view.sun.xz)));
  let l = lum(c); c = mix(c, vec3f(l) * mix(vec3f(1.03, 1., .99), vec3f(1.2, 1., .72), ts) * 1.12, mix(.8, .9, ts) * (1. - ss(0., mix(.16, .3, ts), abs(d.y))));
  // Tancredi's sky: stormy steel blue overhead and away from the sun, a burning orange band towards it
  let up = sat(d.y * 1.8);
  c *= mix(vec3f(1.), vec3f(.82, .86, 1.02), up * (.45 + .55 * (1. - ts)));
  c *= mix(vec3f(1.), vec3f(1.3, .82, .5), ts * ts * (1. - ss(0., .3, abs(d.y))));
  // at night no warm band: moonlit blue all round, a little paler at the horizon
  if (${NIGHT} == 1) { c = lum(c) * mix(vec3f(.4, .6, 1.5), vec3f(.62, .75, 1.2), 1. - ss(0., .25, abs(d.y))); }
  return c;
}
// small cumulus on a flat layer 1.7 km up; lit sunward, grey-blue below
fn clouds(rd: vec3f, base: vec3f) -> vec3f {
  if (rd.y < .012) { return base; }
  let t = 1700. / (rd.y + .09); let p = rd.xz * t + view.cam.xz + vec2f(9., 4.) * view.cam.w;
  let q = p / 3400.;
  let sh = textureSampleLevel(tNoiseA, sRep, q * .23 + .21, 0.).r;
  let n = textureSampleLevel(tNoiseA, sRep, q, 0.).r * .62 + textureSampleLevel(tNoiseA, sRep, q * 3.1 + .4, 0.).r * .38;
  let st = view.ev.x; let cov = .56 - .12 * ss(.4, .62, sh) - .42 * st;
  // puffs: a firm edge eaten by finer noise
  let dn = ss(cov, cov + .07, n - .05 * textureSampleLevel(tNoiseA, sRep, q * 9.7, 0.).a);
  if (dn <= 0.) { return base; }
  let sdir = normalize(view.sun.xz) * .016;
  let n2 = textureSampleLevel(tNoiseA, sRep, q + sdir, 0.).r * .62 + textureSampleLevel(tNoiseA, sRep, (q + sdir) * 3.1 + .4, 0.).r * .38;
  let lit = sat(.45 + (n - n2) * 14.) * (1. - .4 * dn) + .3;
  let mu = dot(rd, view.sun.xyz);
  let warm = view.sunc.rgb * (.13 + .5 * pow(sat(mu), 6.));
  let cool = skyLut(vec3f(-view.sun.x, .9, -view.sun.z)) * 1.5;
  var col = mix(cool, warm + cool * .6, lit);
  // storm: low slate-grey clouds over the castle, lit from inside by the lightning
  if (st > 0.) { col = mix(col, vec3f(lum(col)) * vec3f(.3, .32, .38), st) + vec3f(.75, .75, 1.) * flashK() * st * ${(E0*0.03).toFixed(3)} * (1.2 - lit); }
  let far = exp(-t / 26000.);
  return mix(base, col, dn * .93 * far * ss(.012, .05, rd.y));
}
// lightning over the Serpent Fortress (layout.js SERPI): a few strokes every few seconds, 0 at t = 0 (the
// environment cube is baked then)
const SERPI_XZ = vec2f(${SERPI[0]}., ${SERPI[1]}.);
fn flash() -> f32 {
  let t = view.cam.w; let k = floor(t / 5.3); let f = t - k * 5.3;
  if (h11(k * 1.7 + .3) < .45 || t < 1.) { return 0.; }
  return exp(-f * 9.) + .8 * exp(-abs(f - .22) * 28.) + .5 * exp(-abs(f - .41) * 30.);
}
// storm over the king's castle (key T, view.ev.x): strokes every 2.6 s, most of them striking the great tower's
// spire, the others the towers around it. Mirrored by stormBolt() in main.js for the thunder.
fn flashK() -> f32 {
  let t = view.cam.w; let k = floor(t / 2.6); let f = t - k * 2.6;
  if (view.ev.x < .3 || h11(k * 3.1 + .7) < .2) { return 0.; }
  return (exp(-f * 8.) + .7 * exp(-abs(f - .18) * 26.) + .4 * exp(-abs(f - .37) * 30.)) * ss(.3, .7, view.ev.x);
}
fn boltK(rd: vec3f) -> vec3f {
  let fl = flashK(); if (fl < .01) { return vec3f(0.); }
  let k = floor(view.cam.w / 2.6); let a = h11(k * 7.7 + .2) * 6.2832; let tw = h11(k * 2.3 + .9) < .55;
  let tx = select(vec2f(cos(a), sin(a)) * 33., vec2f(0.), tw);
  let to = tx - view.cam.xz; let dist = max(length(to), 30.); let fd = to / dist; let h = normalize(rd.xz);
  let ang = atan2(fd.x * h.y - fd.y * h.x, dot(fd, h)); let el = rd.y * inverseSqrt(max(1. - rd.y * rd.y, 1e-4));
  let base = (select(95., 157., tw) - view.cam.y) / dist; let top = (1100. - view.cam.y) / dist;
  let u = (el - base) / (top - base);
  let jag = (sin(u * 19. + k * 7.) * .4 + sin(u * 61. + k) * .15) * (1. - u * .6);
  let off = jag * 22. / dist; let w = 1.4 / dist + .0006;
  let s = select(0., exp(-sq((ang - off) / w)), u > 0. && u < 1.);
  let glow = vec3f(.75, .75, 1.) * fl * 3.5 * exp(-ang * ang * 30.) * ss(base - .2, base + .8, el);
  return (glow + vec3f(.9, .88, 1.) * fl * 1100. * s) * ${NIGHT ? 0.6 : 1};
}
fn bolts(rd: vec3f) -> vec3f {
  let fl = flash(); if (fl < .01) { return vec3f(0.); }
  let to = SERPI_XZ - view.cam.xz; let dist = length(to); let fd = to / dist; let h = normalize(rd.xz);
  let ang = atan2(fd.x * h.y - fd.y * h.x, dot(fd, h)); let el = rd.y * inverseSqrt(max(1. - rd.y * rd.y, 1e-4));
  let base = (225. - view.cam.y) / dist; let top = (1400. - view.cam.y) / dist; let k = floor(view.cam.w / 5.3);
  let glow = vec3f(.75, .7, 1.) * fl * 14. * exp(-ang * ang * 30.) * ss(base - .3, base + .6, el);
  // the stroke: a jagged line from the cloud base down to the towers
  let u = (el - base) / (top - base);
  let jag = (sin(u * 23. + k * 7.) * .35 + sin(u * 57. + k) * .15) * (1. - u * .5);
  let off = .022 * (h11(k * 5.3) - .5) + jag * 18. / dist;
  let w = 1.2 / dist + .0006;
  let s = select(0., exp(-sq((ang - off) / w)), u > 0. && u < 1.);
  return (glow + vec3f(.9, .85, 1.) * fl * 900. * s) * ${NIGHT ? 0.6 : 1};
}
// stars at night: a hashed grid of directions, fading near the horizon
fn stars(rd: vec3f) -> vec3f {
  if (${NIGHT} == 0 || rd.y < .02) { return vec3f(0.); }
  let g = floor(rd * 700.); let h = h21(vec2f(g.x + g.z * 61.7, g.y + g.z * 3.3));
  let k = ss(.9965, 1., h); return vec3f(.85, .9, 1.) * k * k * ${(E0 * 0.05).toFixed(4)} * ss(.02, .2, rd.y);
}
fn sky(rd: vec3f, disc: bool) -> vec3f {
  var c = (skyLut(rd) + stars(rd)) * (1. - .75 * view.ev.x) + bolts(rd);
  if (disc) {
    // disc and a soft round glare, no rays
    let mu = sat(dot(rd, view.sun.xyz));
    c += min(view.sunc.rgb * 900., vec3f(260.)) * ss(.99996, .999975, mu) + view.sunc.rgb * (pow(mu, 9000.) * 2.5 + pow(mu, 1800.) * .25 + pow(mu, 250.) * .02);
  }
  if (${NIGHT} == 1) {
    // the moon: a large pale disc with soft grey seas, and a faint halo
    let mu = sat(dot(rd, view.sun.xyz)); let mo = ss(.99974, .9998, mu);
    let sea = .84 + .16 * sin(rd.x * 520. + 1.) * sin(rd.z * 430. + rd.y * 300.);
    c += vec3f(.9, .93, 1.) * ${(E0 * 0.35).toFixed(4)} * mo * sea + vec3f(.5, .6, .9) * ${(E0 * 0.004).toFixed(4)} * pow(mu, 600.);
  }
  return clouds(rd, c) + boltK(rd);
}
`;

// environment cube for image-based lighting
// draw(3, 1, 0, face + 6 * mode): 0 sky (plus a lit ground below the horizon), 1 2x2 mip copy,
// 2-7 prefilter for roughness (mode - 2) / 5, 9 diffuse irradiance
const W_ENV = W_COMMON + /*wgsl*/`
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var sRep: sampler;
@group(0) @binding(2) var sLin: sampler;
@group(0) @binding(3) var tSky: texture_2d<f32>;
@group(0) @binding(4) var tNoiseA: texture_2d<f32>;
@group(0) @binding(5) var tSrc: texture_cube<f32>;
` + W_SKY + /*wgsl*/`
struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) k: u32 }
@vertex fn vs(@builtin(vertex_index) i: u32, @builtin(instance_index) k: u32) -> VO {
  let q = vec2f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
  return VO(vec4f(q, 0., 1.), q, k);
}
fn faceDir(f: u32, uv: vec2f) -> vec3f {
  let u = uv.x; let v = uv.y;
  switch f { case 0u { return vec3f(1., v, -u); } case 1u { return vec3f(-1., v, u); } case 2u { return vec3f(u, 1., -v); }
    case 3u { return vec3f(u, -1., v); } case 4u { return vec3f(u, v, 1.); } default { return vec3f(-u, v, -1.); } }
}
fn ham(i: u32, n: u32) -> vec2f { return vec2f(f32(i) / f32(n), f32(reverseBits(i)) * 2.3283064365386963e-10); }
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let face = i.k % 6u; let mode = i.k / 6u; let N = normalize(faceDir(face, i.uv));
  if (mode == 0u) {
    // below the horizon: sunlit stone, gardens and water, so undersides get a warm-aqua bounce
    let up = skyLut(vec3f(0., 1., 0.)) + skyLut(normalize(vec3f(-view.sun.z, .5, view.sun.x)));
    let gnd = vec3f(.36, .40, .37) * (view.sunc.rgb * view.sun.y + up * PI * .5) / PI;
    let s = sky(vec3f(N.x, max(N.y, .0), N.z), false);
    return vec4f(mix(gnd, s, ss(-.06, .01, N.y)), 1.);
  }
  if (mode == 1u) { return textureSampleLevel(tSrc, sLin, N, 0.); }
  var up = vec3f(0., 1., 0.); if (abs(N.y) > .99) { up = vec3f(1., 0., 0.); }
  let tx = normalize(cross(up, N)); let ty = cross(N, tx);
  var acc = vec3f(0.); var ws = 0.;
  if (mode == 9u) {
    for (var k = 0u; k < 256u; k++) { let h = ham(k, 256u); let ct = sqrt(1. - h.y); let st = sqrt(h.y); let ph = 2. * PI * h.x;
      acc += textureSampleLevel(tSrc, sLin, tx * st * cos(ph) + ty * st * sin(ph) + N * ct, 3.).rgb; }
    return vec4f(acc / 256., 1.);
  }
  let rough = f32(mode - 2u) / 5.; let a = rough * rough;
  for (var k = 0u; k < 96u; k++) {
    let h = ham(k, 96u); let ct = sqrt((1. - h.y) / (1. + (a * a - 1.) * h.y)); let st = sqrt(1. - ct * ct); let ph = 2. * PI * h.x;
    let H = tx * st * cos(ph) + ty * st * sin(ph) + N * ct; let L = 2. * dot(N, H) * H - N; let nl = dot(N, L);
    if (nl > 0.) {
      let d = a * a / (PI * sq(ct * ct * (a * a - 1.) + 1.)); let pdf = d / 4. + 1e-4;
      let lod = max(.5 * log2(6. * 256. * 256. / (96. * pdf * 4. * PI)) + 1., 0.);
      acc += min(textureSampleLevel(tSrc, sLin, L, lod).rgb, vec3f(60.)) * nl; ws += nl;
    }
  }
  return vec4f(acc / max(ws, 1e-4), 1.);
}
`;

// blits: mips and the bloom chain
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn uvOf(fc: vec4f, k: f32) -> vec2f { return fc.xy * k / vec2f(textureDimensions(t)); }
// stretch a texture over any target (history on resolution change)
struct Fit { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vsFit(@builtin(vertex_index) i: u32) -> Fit { let q = vec2f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1)); return Fit(vec4f(q, 0., 1.), vec2f(q.x * .5 + .5, .5 - q.y * .5)); }
@fragment fn fsFit(i: Fit) -> @location(0) vec4f { return textureSampleLevel(t, s, i.uv, 0.); }
@fragment fn fsMip(@builtin(position) fc: vec4f) -> @location(0) vec4f { return textureSampleLevel(t, s, uvOf(fc, 2.), 0.); }
// first bloom step: taps weighted down by brightness, so one hot pixel can't flicker
fn kar(c: vec3f) -> vec4f { let w = 1. / (1. + max(c.r, max(c.g, c.b))); return vec4f(c * w, w); }
@fragment fn fsDown0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  let m = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.).rgb, vec3f(64.))) + kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.).rgb, vec3f(64.)))
        + kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.).rgb, vec3f(64.))) + kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.).rgb, vec3f(64.)));
  return vec4f(m.rgb / m.a, 1.);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, .5); let e = .75 / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
`;

// animated water texture (every frame, tiling)
// rg slope, b caustics, a filaments for the light-liquid; mipped so far water turns roughness, not sparkle
const W_WAVES = W_COMMON + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> u: vec4f;
fn hsh(p: vec2f) -> vec2f { var q = fract(vec3f(p.xyx) * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
// sum of small waves; integer wave vectors keep the tile seamless
fn hgt(p: vec2f, t: f32) -> f32 {
  var h = 0.;
  for (var i = 0; i < 9; i++) {
    let r = hsh(vec2f(f32(i), 7.)); let a = r.x * 6.283; let f = 2. + f32(i) * 1.6; let k = round(vec2f(cos(a), sin(a)) * f);
    let ph = dot(k, p) * 6.283 + t * (1.1 + .5 * sqrt(length(k))) + r.y * 40.;
    h += (sin(ph) + .35 * sin(2. * ph + 1.3)) / (1.5 + length(k) * 1.2);
  }
  return h;
}
fn caus(p: vec2f, t: f32) -> f32 {
  var q = p * 6.283; var c = 0.;
  for (var i = 1; i <= 3; i++) {
    let f = f32(i); let w = vec2f(sin(q.y * f + t * (.5 + .12 * f)) + sin(q.x * 2. * f - t * .4), cos(q.x * f - t * (.45 + .1 * f)) + cos(q.y * 2. * f + t * .35));
    q += w * .5 / f; c += 1. / length(vec2f(sin(q.x * (f + 1.)), cos(q.y * (f + 1.))) * 2.2 + vec2f(.001));
  }
  return c / 3.;
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy / ${WAVEPX}.; let t = u.x; let e = 1. / 512.;
  let h = hgt(p, t); let sl = vec2f(hgt(p + vec2f(e, 0.), t) - h, hgt(p + vec2f(0., e), t) - h) / e * .012;
  let c = pow(sat(caus(p, t * 1.4) * .32), 1.7) * 2.6;
  // filaments: thin bright threads drifting along +x
  let q = vec2f(p.x - t * .03, p.y); var f = 0.;
  for (var i = 1; i <= 3; i++) { let fi = f32(i); let y = q.y * 6.283 * fi * 2. + 1.7 * sin(q.x * 6.283 * fi + fi * 2.1 + .5 * sin(t * .21 + fi)) + .6 * sin(q.x * 6.283 * 3. * fi + t * .13); f += pow(sat(1. - abs(sin(y)) * 3.5), 3.) * (.5 + .5 * sin(q.x * 6.283 * (fi + 1.) + fi)) / fi; }
  return vec4f(sl, c, f);
}
`;
