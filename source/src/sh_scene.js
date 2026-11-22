// shaders 2/4: instancing, GPU culling, materials (G-buffer) and shadow casters
// material ids, shared by mesh generators and shaders
const M = { MARBLE: 0, PAVE: 1, PLASTER: 2, GOLD: 3, QUAY: 4, FLOOR: 5, WINDOW: 6, BARK: 7, ALLOY: 8, TRIM: 9, TERRAIN: 10, CORE: 11, TERRACE: 12, GROUND: 13, STEP: 14, ROCK: 15, FALL: 16, SEA: 17, KID: 18, ROOF: 19, GLOW: 20, PAINT: 21, FIRE: 22, LEAF: 32 };
// leaf atlas tiles (material = M.LEAF + tile): crowns, then vines (TRAIL fringe, VLEAF / VBLOSSOM carpets)
const LT = { OLIVE: 0, BROAD: 1, PINE: 2, CYPRESS: 3, BLOSSOM: 4, HYDRANGEA: 5, TRAIL: 6, LAVENDER: 7, VLEAF: 8, VBLOSSOM: 9 };

// per view, a compute pass frustum-tests each instance, picks its LOD and appends it to that mesh's list, drawn with one
// indirect draw per mesh
const W_INST = /*wgsl*/`
struct Inst { p: vec4f, q: vec4f, tint: u32, ty: u32, rad: f32, sy: f32 }
`;
const W_CULL = W_COMMON + W_INST + /*wgsl*/`
struct MType { slot: vec4u, d: vec4f, e: vec4f } // slots of up to four LODs; d: two switch distances, far limit, thinning start; e.x: third switch distance
struct Args { ic: u32, n: atomic<u32>, fi: u32, bv: u32, first: u32 }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> inst: array<Inst>;
@group(0) @binding(2) var<storage, read> types: array<MType>;
@group(0) @binding(3) var<storage, read_write> args: array<Args>;
@group(0) @binding(4) var<storage, read_write> vis: array<u32>;
const NONE = 0xffffffffu;
fn emit(slot: u32, i: u32, f: f32, inv: u32) {
  if (slot == NONE || f <= 0.) { return; }
  let k = atomicAdd(&args[slot].n, 1u);
  vis[args[slot].first + k] = i | (u32(sat(f) * 127.) << 24u) | (inv << 31u);
}
@compute @workgroup_size(64) fn reset(@builtin(global_invocation_id) id: vec3u) { if (id.x < arrayLength(&args)) { atomicStore(&args[id.x].n, 0u); } }
@compute @workgroup_size(64) fn cull(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; if (i >= arrayLength(&inst)) { return; }
  let it = inst[i]; let mt = types[it.ty]; let c = it.p.xyz;
  for (var k = 0; k < 6; k++) { if (dot(view.planes[k].xyz, c) + view.planes[k].w < -it.rad) { return; } }
  let d = max(max(distance(view.lodc.xyz, c) - it.rad * .5, 0.) * view.misc.z, view.lodb.x);
  // gone beyond the far limit; lodc.w removes the level's LOD scale here, so far forests stay on Medium/Low
  var f = sat((mt.d.z - d * view.lodc.w) / (mt.d.z * .08));
  // small things thin out with distance, each by its own threshold (+1: whole until the density drops below it)
  if (mt.d.w > 0.) { let keep = 1. - .8 * sat((d - mt.d.w) / (mt.d.w * 2.5)); let h = fract(f32(i) * .6180339 + .37); f *= sat((keep - h) * 40. + 1.); }
  if (f <= 0.) { return; }
  // LOD and the next switch distance; each instance switches +-13% off, so changes never sweep a grove as one ring
  let dl = d * (.87 + .26 * fract(f32(i) * .7548777));
  var lv = 0; var edge = mt.d.x;
  if (dl >= mt.d.x && mt.slot.y != NONE) { lv = 1; edge = mt.d.y; if (dl >= mt.d.y && mt.slot.z != NONE) { lv = 2; edge = mt.e.x; if (dl >= mt.e.x && mt.slot.w != NONE) { lv = 3; } } }
  let cur = mt.slot[lv]; var nxt = NONE; if (lv < 3) { nxt = mt.slot[lv + 1]; }
  // cross-fade over the last 22% before each switch with complementary dithers (fixed dither in shadow views)
  if (nxt != NONE && dl > edge * .78) { let t = (dl - edge * .78) / (edge * .22); emit(cur, i, min(f, 1. - t), 0u); emit(nxt, i, min(f, t), 1u); }
  else { emit(cur, i, f, 0u); }
}
`;

// vertex stage shared by all instanced geometry
const W_SCENE_VS = W_COMMON + W_INST + /*wgsl*/`
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var sRep: sampler;
@group(0) @binding(2) var sLin: sampler;
@group(0) @binding(3) var<storage, read> inst: array<Inst>;
@group(0) @binding(4) var<storage, read> vis: array<u32>;
@group(0) @binding(5) var tNoiseA: texture_2d<f32>;
@group(0) @binding(6) var tNoiseN: texture_2d<f32>;
@group(0) @binding(7) var tLeaf: texture_2d<f32>;
@group(0) @binding(8) var tMap: texture_2d<f32>;
@group(0) @binding(9) var tLand: texture_2d<f32>;
struct VI { @location(0) pos: vec3f, @location(1) nrm: vec4f, @location(2) ext: vec4f, @builtin(instance_index) ii: u32 }
struct VO {
  ${INV}@builtin(position) clip: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec3f, @location(3) ao: f32,
  @location(4) tint: vec4f, @location(5) @interpolate(flat) mi: vec2u, @location(6) lp: vec3f, @location(7) @interpolate(flat) q: vec4f, @location(8) @interpolate(flat) sc: vec4f,
}
// gentle west breeze: plants lean in slow waves that travel across the city
fn sway(wp: vec3f, h: f32, ph: f32, leaf: bool) -> vec3f {
  let t = view.cam.w; let g = dot(wp.xz, vec2f(.05, .021)) - t * .55;
  let b = sq(min(abs(h), 22.) / 13.) * (.16 + .13 * sin(g) + .06 * sin(g * 2.3 + 1.7));
  var o = vec3f(b * .94, -b * b * .04, b * .34);
  if (leaf) { let f = sin(t * 2.6 + ph * 43. + wp.x * .9 + wp.z * .7) * .022 * sat(abs(h) * .4); o += vec3f(f, f * .6, -f * .7); }
  return o * view.misc.w;
}
// sea swell: four trains from the south-west (xy wave vector, z height, w angular speed), each faded where the mesh
// (vertex) or pixel (fragment) can't resolve it. Returns height and slope.
const SEAW = array<vec4f, 4>(vec4f(.159, -.092, .2, 1.34), vec4f(.15, -.26, .12, 1.72), vec4f(.473, .082, .065, 2.17), vec4f(.157, -.77, .035, 2.77));
fn seaWave(p: vec2f, fade: vec4f) -> vec3f {
  var o = vec3f(0.); let t = view.cam.w; let calm = mix(.4, 1., ss(480., 950., length(p))); // sheltered near the city
  for (var k = 0; k < 4; k++) { let w = SEAW[k]; let ph = dot(w.xy, p) - w.w * t; let a = w.z * fade[k] * calm; o += vec3f(a * sin(ph), w.xy * (a * cos(ph))); }
  return o;
}
// bambine e bambini (aggiunta): limbs swing about shoulders and hips in each child's own frame, then the ring turns.
// Mirrors meshKids()/KID_R in plants.js. mode 0 girotondo: side steps holding hands, every 14 s "tutti giu per terra"
// (they sit down, then stand up); mode 1 rincorsa: running round a wider ring
struct KP { p: vec3f, n: vec3f }
fn rotX(p: vec3f, a: f32) -> vec3f { let c = cos(a); let s = sin(a); return vec3f(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
fn rotZ(p: vec3f, a: f32) -> vec3f { let c = cos(a); let s = sin(a); return vec3f(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
fn kidPose(pos: vec3f, nrm: vec3f, ext: vec4f, sd: f32) -> KP {
  let code = u32(ext.w * 255. + .5); let run = (code >> 7u) == 1u; let N = f32((code >> 4u) & 7u); let ki = f32(code & 7u);
  let limb = u32(ext.z * 255. + .5);
  let a = ki / N * 6.2831853; let R = select(.55 / sin(PI / N), 3.2, run);
  let cc = R * vec2f(cos(a), sin(a)); let psi = select(atan2(-cos(a), -sin(a)), -a, run); let cs = cos(psi); let sn = sin(psi);
  let d = pos.xz - cc;
  var kp = vec3f(d.x * cs - d.y * sn, pos.y, d.x * sn + d.y * cs); var kn = vec3f(nrm.x * cs - nrm.z * sn, nrm.y, nrm.x * sn + nrm.z * cs);
  let T = view.cam.w * view.misc.w + sd * 50.;
  // girotondo clock: turning for 10.5 s of every 14, then down and up again
  let cyc = floor(T / 14.); let f = T - cyc * 14.; let te = select(cyc * 10.5 + min(f, 10.5), T, run);
  let down = select(ss(10.5, 11.2, f) * (1. - ss(12.8, 13.7, f)), 0., run);
  let ph = te * select(5.5, 10.5, run) + ki * 1.9 + sd * 30.;
  if (limb > 0u) {
    let arm = limb < 3u; let sx = select(-1., 1., (limb & 1u) == 1u); let pv = vec3f(sx * select(.075, .165, arm), select(.64, .98, arm), 0.);
    var ang = 0.; var r = kp - pv; var rn = kn;
    if (run) {
      ang = select(.75, -.85, arm) * sx * sin(ph); r = rotX(r, ang); rn = rotX(rn, ang);
      if (arm) { r = rotZ(r, sx * .18); rn = rotZ(rn, sx * .18); }
    } else if (arm) {
      let up = sx * (1.12 - .5 * down); r = rotX(rotZ(r, up), -.25 - .6 * down); rn = rotX(rotZ(rn, up), -.25 - .6 * down);
    } else {
      let st = sx * .16 * sin(ph) * (1. - down); r = rotZ(r, st); rn = rotZ(rn, st);
      r = rotX(r, -1.45 * down); rn = rotX(rn, -1.45 * down);
    }
    kp = pv + r; kn = rn;
  }
  // running: lean in and bounce; girotondo: a little bob, then sit down
  if (run) { kp = rotX(kp, .14); kn = rotX(kn, .14); kp.y += abs(sin(ph)) * .07; } else { kp.y += abs(sin(ph)) * .025 * (1. - down) - .56 * down; }
  var o = vec2f(kp.x * cs + kp.z * sn, -kp.x * sn + kp.z * cs) + cc; var on = vec2f(kn.x * cs + kn.z * sn, -kn.x * sn + kn.z * cs);
  // the ring turns: running at ~3 m/s, the girotondo at a walk
  let th = te * select(.75, 3. / R, run); let c = cos(th); let s = sin(th);
  o = vec2f(o.x * c - o.y * s, o.x * s + o.y * c); on = vec2f(on.x * c - on.y * s, on.x * s + on.y * c);
  return KP(vec3f(o.x, kp.y, o.y), vec3f(on.x, kn.y, on.y));
}
// events (Tancredi's Castle; layout.js, events.js): the dragon and the two fleets are ordinary instances, moved here.
// Their PAINT and FIRE vertices carry a palette entry in ea and role x 16 + part in eb; the instance's tint alpha
// says which (240 the dragon, 241-245 the ships, in FLEET order). Off-stage they collapse far below the ground.
const DPATH = array<vec3f, ${DRAG_PATH.length}>(${DRAG_PATH.map((p) => `vec3f(${p.map((v) => v.toFixed(1)).join(', ')})`).join(', ')});
const FLEETS = array<vec4f, 5>(${FLEET.map((f) => `vec4f(${f[0]}., ${f[1]}., ${f[2]}., 0.)`).join(', ')});
struct EvP { p: vec3f, n: vec3f }
fn hull(z: f32) -> f32 { return select(5. * pow(max(1. - sq(z / 21.), 0.), .4), 5. * pow(max(1. - sq(z / 18.5), 0.), .6), z >= 0.); }
fn dragonFire(t: f32) -> f32 {
  var b = 0.;
  ${DRAG_FIRE.map((w) => `b = max(b, ss(${w[0]}., ${w[0] + 0.4}, t) * (1. - ss(${w[1] - 0.4}, ${w[1]}, t)));`).join(' ')}
  return b;
}
fn dragonAt(lp: vec3f, ln: vec3f, role: u32) -> EvP {
  let t = view.ev.y; if (t < 0.) { return EvP(vec3f(0., -1e5, 0.), ln); }
  let T = view.cam.w; var p = lp; var n = ln;
  // wings beat about the shoulders, the outer part further; the body bobs against them
  let fl = sin(T * 3.9);
  if (role == 1u || role == 2u) {
    let sx = select(-1., 1., role == 1u); let hg = vec3f(2.4 * sx, 1.6, 0.); let r = p - hg;
    let ang = sx * (.55 * fl + .12) * (1. + .6 * sat(abs(r.x) / 22.));
    p = hg + rotZ(r, ang); n = rotZ(n, ang);
  }
  if (role == 3u) { let k = sat((-p.z - 7.) / 25.); p.x += sin(T * 2.3 + p.z * .13) * 3.2 * k * k; }
  if (role == 4u) {
    // fire from the mouth, flickering
    let b = dragonFire(t); let m = vec3f(0., 3.6, 22.5); let f = .85 + .15 * sin(T * 31. + p.z);
    p = m + (p - m) * vec3f(b * f, b * f, b * (1. + .12 * sin(T * 23.)));
  }
  p.y -= .7 * fl;
  // along the spline: position, heading and the turn's sideways pull (for the bank)
  let s = t / ${DRAG_STEP} + 1.; let i = min(i32(s), ${DRAG_PATH.length - 3}); let u = s - f32(i);
  let a = DPATH[i - 1]; let b = DPATH[i]; let c = DPATH[i + 1]; let d = DPATH[i + 2];
  let k2 = 2. * a - 5. * b + 4. * c - d; let k3 = -a + 3. * b - 3. * c + d;
  let pos = .5 * (2. * b + (c - a) * u + k2 * u * u + k3 * u * u * u);
  let vel = .5 * ((c - a) + 2. * k2 * u + 3. * k3 * u * u); let acc = (k2 + 3. * k3 * u) / ${DRAG_STEP * DRAG_STEP};
  let f = normalize(vel); let rt = normalize(cross(vec3f(0., 1., 0.), f)); let up = cross(f, rt);
  let lat = dot(acc, rt); let ph = clamp(atan(lat / 9.8) * .8, -.7, .7);
  let r2 = rt * cos(ph) - up * sin(ph); let u2 = up * cos(ph) + rt * sin(ph);
  return EvP(pos + r2 * p.x + u2 * p.y + f * p.z, normalize(r2 * n.x + u2 * n.y + f * n.z));
}
fn shipAt(lp: vec3f, ln: vec3f, role: u32, part: u32, q: vec4f, id: u32) -> EvP {
  let w = view.ev.w; if (w <= 0.) { return EvP(vec3f(0., -1e5, 0.), ln); }
  let F = FLEETS[id]; let hd = F.z; let king = hd > 0.; let T = view.cam.w; let tb = view.ev.z; let fi = f32(id);
  // sailing in from beyond the bay's mouth, then drifting to and fro
  let e = 1. - w; let base = vec3f(F.x - hd * e * e * 700. + hd * 35. * sin(T * .06 + fi * 1.3), 0., F.y);
  var p = lp; var n = ln;
  // guns: part = gun (0-4) + 8 on the +x side; a broadside every 8 s, ship by ship, gun by gun; only the side facing
  // the enemy fires (king's ships at the smaller z)
  let sx = select(-1., 1., part >= 8u); let g = f32(part & 7u); let zg = -9. + g * 4.5;
  let side = qrot(q, vec3f(sx, 0., 0.)).z * select(-1., 1., king);
  var tau = 99.; if (tb >= 0. && side > 0. && w > .98) { tau = tb - fi * 1.6 - g * .13; tau = tau - floor(tau / 8.) * 8.; }
  if (role == 5u) { let c = vec3f(sx * (hull(zg) + 1.6), 2., zg); let k = exp(-tau * 7.) * step(tau, 1.); p = c + (p - c) * k; }
  if (role == 6u) {
    let c = vec3f(sx * (hull(zg) + 3.5), 2.4, zg); let k = ss(0., .35, tau) * (1. + tau * .6) * (1. - ss(3.5, 5.5, tau));
    p = c + (p - c) * k + vec3f(sx * tau * 2.5, tau * 1.8, 0.);
  }
  if (role == 7u) {
    // splashes where the shot falls, short of the enemy line; not rocking with the ship
    let c = vec3f(sx * (140. + 12. * g), 0., zg * 2.5); let ts = tau - 1.1; let h = ss(0., .15, ts) * (1. - ss(.5, 1.7, ts)) * step(ts, 2.);
    p = c + (p - c) * vec3f(.6 + ts * .5, 1., .6 + ts * .5) * vec3f(step(.01, h), h, step(.01, h));
    return EvP(base + qrot(q, p), qrot(q, n));
  }
  // rolling and pitching on the swell
  let rl = .045 * sin(T * 1.1 + fi * 2.1); let pt = .022 * sin(T * .8 + fi);
  p = rotX(rotZ(p, rl), pt); n = rotX(rotZ(n, rl), pt);
  let sw = seaWave(base.xz, vec4f(1.)).x;
  return EvP(base + vec3f(0., sw - .3, 0.) + qrot(q, p), qrot(q, n));
}
// the hero (hero.js, events.js meshHero): walking, swinging the sword, raising it to the lightning, sparks and the wave
fn heroAt(lp: vec3f, ln: vec3f, role: u32, part: u32) -> EvP {
  let H = view.hero; let H2 = view.hero2; let H3 = view.hero3;
  if (H2.w < .5) { return EvP(vec3f(0., -1e5, 0.), ln); }
  let T = view.cam.w; let pw = H3.x; let tr = H3.y; let air = H3.z; let sp = H2.y;
  var p = lp; var n = ln;
  let sw = sin(H2.x); let a = min(sp * 1.6, 1.) * mix(.5, .85, sp) * (1. - air);
  // raised sword while transforming: the right arm goes straight up (rest 0 = down, the blade forward)
  let up = select(0., ss(0., .3, tr) * (1. - ss(1.3, 1.6, tr)), tr >= 0.);
  if (role == 1u && part == 2u) { let c = vec3f(.32, .92, p.z); p = c + (p - c) * pw * (1. + .15 * sin(T * 30. + p.z * 9.)); }
  // the wrist turns the blade up along the arm as he raises it (and over the shoulder in the wind-up)
  if (role == 1u && part >= 1u) { let c = vec3f(.32, .92, .08); let wr = 1.5708 * up; p = c + rotX(p - c, wr); n = rotX(n, wr); }
  if (role == 3u || role == 4u) {
    let s = select(-1., 1., role == 3u); let hip = vec3f(s * .115, .95, 0.);
    let ang = s * sw * a + air * select(-.5, .35, role == 3u); p = hip + rotX(p - hip, ang); n = rotX(n, ang);
  }
  if (role == 1u || role == 2u) {
    let s = select(-1., 1., role == 1u); let sh = vec3f(s * .25, 1.47, 0.);
    var ang = -s * sw * a * .7 - air * .5;
    if (role == 1u) {
      // the swing: wind up over the head, cut down and forward, back to guard
      let w = H2.z;
      if (w >= 0.) { ang = select(mix(-.3, -2.9, ss(0., .3, w)), select(mix(-2.9, .1, ss(.3, .5, w)), mix(.1, -.3, ss(.55, 1., w)), w > .5), w > .3); }
      else { ang = mix(ang * .6 - .3, -2.95, up); }
    }
    p = sh + rotX(p - sh, ang); n = rotX(n, ang);
    // the swing also turns the arm across the body
    if (role == 1u && H2.z >= 0.) { let tw = sin(PI * sat(H2.z * 1.6)) * .5; p = rotZ(p - sh, -tw * .3) + sh; }
  }
  if (role == 5u) {
    let ang = .1 + sp * 1.1 + air * .6 + .06 * sin(T * 6. + p.y * 4. + p.x * 3.) * (.3 + sp) + .3 * pw * (.5 + .5 * sin(T * 9. + p.x * 5.));
    let c = vec3f(0., 1.5, -.13); p = c + rotX(p - c, ang * sat((1.5 - lp.y) * 1.4)); n = rotX(n, ang);
  }
  if (role == 6u) {
    // sparks circling him, rising
    let fi = f32(part); let ag = T * (3. + fi * .3) + fi * .63; let hgt = fract(T * .5 + fi * .137) * 2.;
    p = vec3f(cos(ag) * .65, .1 + hgt, sin(ag) * .65) + (lp - vec3f(0., 1., 0.)) * pw * (1. + h11(fi + floor(T * 8.)) * 1.5);
  }
  if (role == 7u) { let w = H3.w; let k = select(0., 1., w >= 0. && w < .7); let g = 1. + w * 14.; p = vec3f(p.x * g, p.y * (1. - w), p.z * g) * k; }
  if (role == 8u) { let k = select(0., 1., tr > .25 && tr < 1.) * step(.25, fract(T * 13.)); let b = vec3f(.31, 3.05, .05); p = b + (p - b) * k; }
  // he grows when transformed, bobs as he walks
  let s = 1. + .3 * pw; p *= s; p.y += abs(sin(H2.x)) * .05 * sp * (1. - air);
  let c = cos(H.w); let sn = sin(H.w); let rt = vec3f(c, 0., sn); let fw = vec3f(sn, 0., -c);
  return EvP(H.xyz + rt * p.x + vec3f(0., p.y, 0.) + fw * p.z, normalize(rt * n.x + vec3f(0., n.y, 0.) + fw * n.z));
}
fn transform(v: VI) -> VO {
  let e = vis[v.ii]; let it = inst[e & 0xffffffu];
  let mat = u32(v.ext.x * 255. + .5);
  let s = vec3f(it.p.w, it.p.w * it.sy, it.p.w);
  var vp = v.pos; var vn = v.nrm.xyz;
  if (mat == 18u) { let k = kidPose(vp, vn, v.ext, f32(it.tint >> 24u) / 255.); vp = k.p; vn = k.n; }
  let lp = vp * s;
  var q = it.q; var org = it.p.xyz;
  if (mat == 0u && v.ext.w > .99) {
    // podium crystals hover and turn on their own slow clocks (misc.w = 0 while baking shadows: middle height)
    let ph = org.x * .37 + org.z * .61; let t = view.cam.w * view.misc.w; let h = (t * .11 + ph) * .5;
    org.y += .85 + .5 * sin(t * .8 + ph) * view.misc.w; q = qmul(q, vec4f(0., sin(h), 0., cos(h)));
  }
  var wp = org + qrot(q, lp);
  if (mat == 17u) {
    // the sea's rings follow the camera; each train fades where the rings get too coarse
    wp = vec3f(lp.x + view.lodc.x, 0., lp.z + view.lodc.z);
    wp.y = seaWave(wp.xz, clamp(vec4f(2.) - length(lp.xz) * ${((SEA_GROW - 1) * SEAK).toFixed(4)} * vec4f(.1765, .2857, .4615, .75), vec4f(0.), vec4f(1.))).x;
  }
  if (mat == 7u || mat == 11u || mat >= 32u) { wp += sway(wp, lp.y, v.ext.w, mat >= 32u); }
  var n = qrot(q, vn / s);
  if (mat == 8u) {
    // hovering craft loop around the rings; moored ones only bob
    let sd = f32(it.tint >> 24u) / 255.; let r = length(it.p.xz); let t = view.cam.w;
    if (r < 450.) { let a = t * (5. + 5. * sd) / r * (1. + .3 * sin(t * .05 + sd * 20.)) * view.misc.w; let c = cos(a); let sn = sin(a); wp = vec3f(wp.x * c - wp.z * sn, wp.y, wp.x * sn + wp.z * c); n = vec3f(n.x * c - n.z * sn, n.y, n.x * sn + n.z * c); }
    wp.y += sin(t * .7 + sd * 40.) * .22 * view.misc.w;
  }
  let evc = it.tint >> 24u;
  if ((mat == 21u || mat == 22u) && evc >= 240u && evc < 250u) {
    let rp = u32(v.ext.z * 255. + .5); var a: EvP;
    if (evc == 240u) { a = dragonAt(lp, vn, rp / 16u); } else if (evc == 246u) { a = heroAt(lp, vn, rp / 16u, rp & 15u); } else { a = shipAt(lp, vn, rp / 16u, rp & 15u, q, evc - 241u); }
    wp = a.p; n = a.n;
  }
  var o: VO;
  o.clip = view.vp * vec4f(wp, 1.); o.wp = wp; o.n = n; o.uv = v.ext.yzw; o.ao = v.nrm.w;
  o.tint = unpack4x8unorm(it.tint); o.mi = vec2u(mat, e >> 24u); o.lp = v.pos; o.q = q; o.sc = vec4f(s, it.rad);
  // Low: LODs swap at mid-fade instead of dissolving; the hidden one collapses to a point here, so no fragment shader
  // needs a discard (phone GPUs only reject hidden fragments early for shaders that never discard)
  if (LV > 1) { if (((e >> 24u) & 127u) < 64u) { o.clip = vec4f(2., 2., 2., 1.); } o.mi.y = 127u; }
  return o;
}
@vertex fn vs(v: VI) -> VO { return transform(v); }
// is this a vine tile (foliage lying on a surface)?
fn onWall(tile: u32) -> bool { return tile == 6u || tile >= 8u; }
// how much of a leaf card counts at uv: crowns fade over the outer quarter, vines all but a thin margin
fn cardRim(uv: vec2f, tile: u32) -> f32 { let q = abs(uv - .5) * 2.; return 1. - ss(select(.72, .95, onWall(tile)), 1., max(q.x, q.y)); }
// card uv in the atlas (4 x 3 tiles with a thin margin)
fn atlasUV(tile: u32, uv: vec2f) -> vec2f { return (vec2f(f32(tile % 4u), f32(tile / 4u)) + uv * .98 + .01) / vec2f(4., 3.); }
`;

// shadow casters (depth only)
const W_SHADOW = W_SCENE_VS + /*wgsl*/`
// foliage casts by coverage: the atlas is read near the mip matching the shadow texel, so the cutout becomes the
// sprig's soft shape and doesn't crawl in the wind
@fragment fn fsLeaf(i: VO) {
  let tile = max(i.mi.x, 32u) - 32u;
  // mip chosen by hand for one trilinear tap (the shared sampler is anisotropic, wasted here)
  let lv = max(log2(max(length(dpdx(i.uv.xy)), length(dpdy(i.uv.xy))) * ${502 * LEAFPX / 512}.) - .7, 0.);
  let a = textureSampleLevel(tLeaf, sLin, atlasUV(tile, i.uv.xy), lv).a * cardRim(i.uv.xy, tile);
  if (i.mi.x >= 32u && a < select(.27, .36, onWall(tile))) { discard; }
  // LOD cross-fade with the G-buffer's dither, fixed to map texels so the filter blends it
  let fb = i.mi.y;
  if ((fb & 127u) != 127u) { let f = f32(fb & 127u) / 127.; let d = fract(dot(floor(i.clip.xy), vec2f(.7548777, .5698403))); if ((fb & 128u) != 0u) { if (d < 1. - f) { discard; } } else if (d >= f) { discard; } }
}
// crystal and glass cast a checkerboard the soft filter turns into a pale shadow
@fragment fn fsCrystal(i: VO) { let p = vec2u(i.clip.xy); if (((p.x + p.y) & 1u) == 0u) { discard; } }
@fragment fn fsGlass(i: VO) { let p = vec2u(i.clip.xy); if ((p.x & 1u) + (p.y & 1u) != 0u) { discard; } }
`;

// materials: fills the G-buffer
const W_GBUF =W_SCENE_VS + /*wgsl*/`
override REFL = false; // the mirror view drops everything below the water
struct GO { @location(0) a: vec4f, @location(1) n: vec4f, @location(2) m: vec4f }
struct Mt { alb: vec3f, rough: f32, metal: f32, inlay: f32, nb: vec3f, trans: f32 }
// triplanar noise: seamless on any wall, detail fades with the mips
fn triW(n: vec3f) -> vec3f { var w = pow(abs(n), vec3f(6.)); return w / (w.x + w.y + w.z); }
fn tri(t: texture_2d<f32>, p: vec3f, dx: vec3f, dy: vec3f, w: vec3f, s: f32) -> vec4f {
  var c = vec4f(0.);
  if (w.x > .02) { c += w.x * textureSampleGrad(t, sRep, p.zy * s, dx.zy * s, dy.zy * s); }
  if (w.y > .02) { c += w.y * textureSampleGrad(t, sRep, p.xz * s, dx.xz * s, dy.xz * s); }
  if (w.z > .02) { c += w.z * textureSampleGrad(t, sRep, p.xy * s, dx.xy * s, dy.xy * s); }
  return c;
}
// bump from the slope texture (rg or ba) as a world-space tilt
fn triN(p: vec3f, dx: vec3f, dy: vec3f, w: vec3f, s: f32, rock: bool) -> vec3f {
  var o = vec3f(0.);
  if (w.x > .02) { let c = textureSampleGrad(tNoiseN, sRep, p.zy * s, dx.zy * s, dy.zy * s); let g = select(c.rg, c.ba, rock) - .5; o += w.x * vec3f(0., g.y, g.x); }
  if (w.y > .02) { let c = textureSampleGrad(tNoiseN, sRep, p.xz * s, dx.xz * s, dy.xz * s); let g = select(c.rg, c.ba, rock) - .5; o += w.y * vec3f(g.x, 0., g.y); }
  if (w.z > .02) { let c = textureSampleGrad(tNoiseN, sRep, p.xy * s, dx.xy * s, dy.xy * s); let g = select(c.rg, c.ba, rock) - .5; o += w.z * vec3f(g.x, g.y, 0.); }
  return o;
}
// coverage of a line (half width hw, distance d) for a pixel fw wide: thin lines fade instead of aliasing
fn line(d: f32, hw: f32, fw: f32) -> f32 { return sat((min(d + fw * .5, hw) - max(d - fw * .5, -hw)) / fw); }
const MARB = vec3f(.82, .79, .735);
var<private> gVein: f32; // how veined the last marble() sample was
fn marble(p: vec3f, dx: vec3f, dy: vec3f, w: vec3f, off: vec3f) -> vec4f { // rgb colour factor, a grain
  let A = tri(tNoiseA, p + off, dx, dy, w, .21); let B = tri(tNoiseA, p, dx, dy, w, 1.9); let C = tri(tNoiseA, p + off.zxy, dx, dy, w, .047);
  let v = A.b * .85 + .15 * ss(.5, .75, B.b); gVein = v;
  var c = vec3f(1. - .07 * (C.r - .5) - .05 * (A.r - .5) - .03 * (B.a - .5));
  c = mix(c, vec3f(.62, .65, .7), v * .4);
  c *= mix(vec3f(1.), vec3f(1.03, 1., .95), ss(.4, .65, C.r)); // warm and cool drifts
  return vec4f(c, B.a);
}
// polished paving, 2 m modules: rings and radials near the centre, a grid further out; gold inlay lines
fn pave(p: vec3f, dx: vec3f, dy: vec3f, fw: f32, n: vec3f) -> Mt {
  let r = length(p.xz); let th = atan2(p.z, p.x);
  var jd: f32; var cell: vec2f;
  if (r < 432.) {
    let ri = floor(r / 2.); let nt = max(6., round(PI * (2. * ri + 1.))); let a = th / (2. * PI) * nt + .5 * (ri % 2.);
    jd = min(min(fract(r / 2.), 1. - fract(r / 2.)) * 2., min(fract(a), 1. - fract(a)) * 2. * PI * r / nt); cell = vec2f(ri, floor(a));
  } else { let g = p.xz / 2.; let f = min(fract(g), 1. - fract(g)) * 2.; jd = min(f.x, f.y); cell = floor(g); }
  let hs = h22(cell + 3.);
  let w = triW(n); let m = marble(p, dx, dy, w, vec3f(hs.x, 0., hs.y) * 40.);
  var o: Mt; o.alb = vec3f(.79, .76, .705) * m.rgb * (.93 + .14 * hs.x); o.rough = .13 + .12 * m.a + .08 * hs.y; o.metal = 0.; o.trans = 0.;
  o.nb = triN(p, dx, dy, w, 2.3, false) * .035;
  o.alb = mix(o.alb, o.alb * vec3f(.56, .6, .68), gVein * .55); // polished slabs show grey veins clearly
  let j = line(jd, .005, fw); o.alb *= 1. - .5 * j; o.rough = mix(o.rough, .7, j);
  // inlay: 12 radials and rings on the podium, lines along the six spokes
  let a12 = (fract(th / (PI / 6.) + .5) - .5) * (PI / 6.); let a6 = (fract((th - PI * .5) / (PI / 3.) + .5) - .5) * (PI / 3.);
  let lat = abs(r * sin(a6)); var il = 0.;
  if (r < 58.5 && r > 40.5) { il = max(il, line(abs(r * sin(a12)), .07, fw)); il = max(il, line(min(min(abs(r - 43.), abs(r - 50.5)), abs(r - 56.5)), .09, fw)); }
  if (r > 58.5 && r < 86.) { il = max(il, line(min(abs(r - 64.2), abs(r - 77.7)), .08, fw)); }
  if (r > 60. && lat < 6.9 && cos(a6) > 0.) { il = max(il, line(min(abs(lat - 2.4), abs(lat - 5.6)), .055, fw)); if (abs(th - PI * .5) < .5) { il = max(il, line(lat, .09, fw)); } }
  o.inlay = il; o.alb = mix(o.alb, vec3f(.95, .68, .25), il); o.metal = il * .45; o.rough = mix(o.rough, .34, il);
  return o;
}
// city ground: paving where the map says, else lawn, beds and flagstone paths
fn ground(p: vec3f, dx: vec3f, dy: vec3f, fw: f32, n: vec3f) -> Mt {
  let muv = p.xz / 2048. + .5; let mp = textureSampleGrad(tMap, sLin, muv, dx.xz / 2048., dy.xz / 2048.);
  let w = vec3f(0., 1., 0.);
  let A = tri(tNoiseA, p, dx, dy, w, .45); let B = tri(tNoiseA, p, dx, dy, w, 2.7);
  let edge = (A.r - .5) * .5 + (B.a - .5) * .25;
  if (mp.r + edge * .3 > .5) { return pave(p, dx, dy, fw, n); }
  var o: Mt; o.metal = 0.; o.inlay = 0.; o.trans = 0.;
  let C = tri(tNoiseA, p, dx, dy, w, .06);
  o.alb = mix(vec3f(.07, .115, .035), vec3f(.15, .18, .06), ss(.3, .7, C.r + (A.g - .3) * .4)) * (.7 + .6 * B.a) * (.85 + .3 * A.a); o.rough = .85;
  o.nb = triN(p, dx, dy, w, 1.4, true) * .5;
  // planting beds: dark soil
  let bed = ss(.42, .58, mp.g + edge); o.alb = mix(o.alb, mix(vec3f(.15, .11, .075), vec3f(.07, .11, .04), ss(.4, .6, A.r)) * (.6 + .8 * B.a), bed);
  // paths: pale flagstones, grass in the gaps
  let path = ss(.3, .7, mp.b + edge * 1.1);
  if (path > 0.) {
    let cl = tri(tNoiseA, p, dx, dy, w, .9).g; let st = ss(.035, .09, cl) ; let m = marble(p, dx, dy, w, vec3f(0.));
    let stone = vec3f(.7, .66, .58) * m.rgb * (.85 + .3 * A.r);
    o.alb = mix(o.alb, mix(o.alb * .8, stone, st), path); o.rough = mix(o.rough, mix(.9, .5, st), path); o.nb = mix(o.nb, o.nb * .3, path * st);
  }
  return o;
}
// land beyond the canals: pasture, fields, tracks, limestone, forest floor, river banks, beaches, sea bed.
// tv (meshTerrain): steepness, river proximity, hollow or crest.
fn terrain(p: vec3f, dx: vec3f, dy: vec3f, fw: f32, n: vec3f, tv: vec3f) -> Mt {
  var o: Mt; o.metal = 0.; o.inlay = 0.; o.trans = 0.;
  let w = triW(n); let r = length(p.xz); let th = atan2(p.z, p.x); let h = p.y; let up = vec3f(0., 1., 0.);
  // noise at five scales: R 80 m, L 20 m, M 5 m, A 1 m, B grain
  let R = tri(tNoiseA, p, dx, dy, up, .0031); let L = tri(tNoiseA, p, dx, dy, up, .011); let M = tri(tNoiseA, p, dx, dy, up, .047);
  let A = tri(tNoiseA, p, dx, dy, w, .19); let B = tri(tNoiseA, p, dx, dy, w, 1.6);
  let az = atan2(p.x, -p.z) * 57.2958; let north = ss(-70., -50., az) * (1. - ss(70., 96., az));
  let steep = tv.x * .64; let wet = tv.y; let hollow = tv.z * 2. - 1.;
  // limestone: pale, bedded (broad layers far, finer close), cracked, water-stained, ochre in places
  let st = mix(.5, sin(h * .23 + A.r * 5. + L.r * 14.) * .5 + .5, sat(1. - fw / 2.5) * .7);
  let beds = sin(h * .085 + L.r * 7. + L.g * 3.) * .5 + .5; let bed2 = ss(.35, .65, sin(h * .31 + L.r * 11. + A.r * 2.) * .5 + .5);
  let sq3 = vec3f(1., .13, 1.); let stain = tri(tNoiseA, p * sq3, dx * sq3, dy * sq3, w, .21).r;
  var rock = vec3f(.6, .585, .55) * (.72 + .08 * st + .16 * beds + .06 * bed2 + .2 * (A.b - .3)) * (.85 + .3 * B.a);
  rock = mix(rock, vec3f(.3, .27, .23), .32 * ss(.5, .72, stain + (M.r - .5) * .3) * ss(.25, .45, 1. - n.y) * ss(.35, .6, L.r + R.g * .4));
  rock = mix(rock, vec3f(.5, .4, .29), .14 * ss(.5, .8, L.g + R.r * .5));
  rock *= 1. - .35 * ss(.5, .8, A.b) * sat(1. - fw / 1.5);
  // finer bedding: ledges ~1 m apart with shade lines (and their tilt, below)
  let ledge = h * .9 + L.r * 9. + A.r * 1.2; let lk = sat(1. - fw / 2.5); rock *= 1. - .12 * ss(.55, .95, sin(ledge) * .5 + .5) * lk;
  // relief from three sizes of fractured rock (up to 14 m) and the ledges: a face's crags
  let rn = triN(p, dx, dy, w, .07, true) * 1.7 + triN(p, dx, dy, w, .33, true) * 1.6 + triN(p, dx, dy, w, 2.1, true) * .5 + vec3f(0., cos(ledge) * .4 * lk, 0.);
  // grass: lush in hollows and by the river, dry gold on crests, tussock patches, worn earth, flowers up close
  let dry = sat(.5 + (R.r - .5) * 1.8 + (L.r - .5) * .9 + (M.r - .5) * .35 - hollow * .5 - wet * .7);
  var grass = mix(vec3f(.055, .115, .03), vec3f(.21, .2, .075), dry);
  grass = mix(grass, vec3f(.04, .085, .028), ss(.38, .8, M.r + (L.g - .35) * .6 + (A.r - .5) * .4) * .4);
  grass *= (.7 + .6 * A.a) * (.72 + .56 * B.a);
  grass = mix(grass, vec3f(.21, .16, .105) * (.7 + .6 * B.a), ss(.66, .82, M.b + (A.r - .5) * .35) * (.2 + .5 * dry));
  grass = mix(grass, mix(vec3f(.72, .7, .62), vec3f(.75, .58, .12), step(.5, B.r)), ss(.15, .08, A.g) * ss(.5, .68, M.r + (L.g - .3) * .5) * sat(1. - fw / .05));
  grass = mix(grass, vec3f(.26, .25, .13), ss(240., 520., h + L.r * 200.) * .7);
  // farmland from the load-time maps (world.js): tMap r track, g wide rows, b verge, a tilled; tLand rgb crop colour,
  // a earth between rows. Rows follow the rings; far away they average out.
  let muv = p.xz / 2048. + .5; var mp = vec4f(0.); var crop = vec4f(.3, .4, .2, 0.);
  if (max(abs(muv.x - .5), abs(muv.y - .5)) < .5) { mp = textureSampleGrad(tMap, sLin, muv, dx.xz / 2048., dy.xz / 2048.); crop = textureSampleGrad(tLand, sLin, muv, dx.xz / 2048., dy.xz / 2048.); }
  let field = ss(.35, .6, mp.a + (A.r - .5) * .25) * (1. - ss(.1, .2, steep));
  let wob = L.r * 2.5 + (A.r - .5) * .35;
  let row = mix(mix(.5, ss(.3, .7, sin(r * 4.488 + wob) * .5 + .5 + (B.r - .5) * .5), sat(1. - fw / .45)), mix(.5, ss(.3, .7, sin(r * 2.244 + wob) * .5 + .5 + (B.r - .5) * .4), sat(1. - fw / .9)), mp.g);
  let earth = vec3f(.24, .175, .115) * (.72 + .56 * B.a) * (.85 + .3 * A.a);
  let plant = crop.rgb * crop.rgb * (.74 + .52 * A.a) * (.8 + .4 * B.a) * (.9 + .2 * M.r);
  o.alb = mix(grass, mix(plant, earth, crop.a * (1. - row)), field); o.rough = .88; o.nb = triN(p, dx, dy, w, 1.4, true) * .5;
  // verge: rank darker grass; track: pale trodden earth
  o.alb = mix(o.alb, grass * vec3f(.66, .78, .62), mp.b * .8);
  let track = ss(.35, .6, mp.r + (A.r - .5) * .4 + (M.r - .5) * .2);
  o.alb = mix(o.alb, mix(vec3f(.43, .37, .28), vec3f(.52, .49, .43), ss(.2, .1, B.g)) * (.72 + .5 * B.a) * (.85 + .3 * A.a), track * .9);
  // forest floor under the mountain woods
  let wood = north * ss(25., 60., h) * (1. - ss(260., 430., h + L.r * 160.)) * ss(.3, .5, L.r + A.r * .3);
  o.alb = mix(o.alb, vec3f(.035, .07, .028) * (.6 + .8 * B.a), wood * .9);
  // gravel and pebbles by and in the river
  o.alb = mix(o.alb, mix(vec3f(.5, .47, .4), vec3f(.3, .28, .25), ss(.34, .14, A.g)) * (.7 + .5 * B.a), ss(.6, .82, wet + (A.r - .5) * .35 + (M.r - .5) * .25));
  // rock where steep or above the grass line, with an edge ragged at every scale (a soft gradient reads as haze)
  let mtn = ss(60., 200., h); let edge = mix(.2, .3, mtn);
  let rq = steep + (A.r - .5) * .15 + (M.r - .5) * .2 + (L.r - .5) * .22 * mtn + (B.a - .5) * .05 - hollow * .04;
  let rk = max(ss(edge - .02, edge + .02, rq), ss(360., 600., h + L.r * 220.) * .8);
  // scree on nearly-steep slopes
  let scree = ss(edge - .09, edge - .03, rq) * (1. - rk) * ss(.4, .2, A.g) * mtn;
  o.alb = mix(o.alb, vec3f(.5, .47, .41) * (.7 + .5 * B.a), scree * .8);
  o.alb = mix(o.alb, rock, rk); o.rough = mix(o.rough, .8, rk); o.nb = mix(o.nb, rn, rk);
  // roads: the spokes continue as pale stone ways
  let a6 = (fract((th - PI * .5) / (PI / 3.) + .5) - .5) * (PI / 3.); let lat = abs(r * sin(a6));
  let road = (1. - ss(4.6, 5.4, lat + (B.a - .5) * .6)) * ss(-3., 1., h) * (1. - ss(760., 900., r)) * step(0., cos(a6));
  if (road > 0.) { let m = marble(p, dx, dy, w, vec3f(0.)); let g = p.xz / 1.6; let f = min(fract(g), 1. - fract(g)) * 1.6; o.alb = mix(o.alb, vec3f(.72, .69, .62) * m.rgb * (1. - .4 * line(min(f.x, f.y), .012, fw)), road); o.rough = mix(o.rough, .5, road); o.nb *= 1. - road * .8; }
  // shore: wet rock and sand, then the sea bed with weed
  let sand = vec3f(.6, .56, .46) * (.8 + .4 * B.a);
  let shore = 1. - ss(.3, 2.2, h + (A.r - .5) * 1.5);
  o.alb = mix(o.alb, mix(sand, rock * .8, ss(.4, .62, A.g + L.r * .6 + rk)), shore * (1. - wet));
  // the Serpent Fortress's plain: burnt, near-black earth with violet glints of stone
  let dS = length(p.xz - vec2f(${SERPI[0]}., ${SERPI[1]}.));
  if (dS < 760.) { let dk = (1. - ss(430., 760., dS + (L.r - .5) * 160.)) * .92; o.alb = mix(o.alb, vec3f(.05, .045, .07) * (.7 + .6 * B.a) * (.75 + .5 * M.r), dk); o.rough = mix(o.rough, .92, dk); }
  if (h < .3) { let dk = ss(.3, -.4, h); o.alb *= mix(1., .62, dk); o.rough = mix(o.rough, .3, dk * ss(-.5, .3, h)); o.alb = mix(o.alb, vec3f(.05, .09, .05), ss(.5, .75, L.g * .5 + A.r) * ss(-.5, -3., h) * .8); }
  return o;
}
// bambini: skin, hair, bright clothes, trousers (linear albedo)
// event palettes (events.js): 0 dragon red, 1 dragon gold, 2 wing, 3 horn, 4 timber, 5 sail, 6 king's blue, 7 gold,
// 8 black hull, 9 dark red sail, 10 smoke, 11 spray; the hero: 12 skin, 13 hair, 14 tunic, 15 armour, 16 cape, 17 leather,
// 18 trousers. Fire: 0 flame, 1 core, 2 eye, 3 cannon flash, 4 lantern, 5 lightning
const PAL = array<vec3f, 19>(vec3f(.34, .05, .03), vec3f(.55, .38, .1), vec3f(.2, .05, .04), vec3f(.66, .6, .46), vec3f(.24, .14, .07), vec3f(.74, .72, .66), vec3f(.06, .14, .38), vec3f(.66, .47, .14), vec3f(.035, .035, .045), vec3f(.26, .035, .03), vec3f(.3, .3, .31), vec3f(.82, .87, .9),
  vec3f(.7, .46, .32), vec3f(.16, .09, .04), vec3f(.06, .13, .42), vec3f(.62, .64, .68), vec3f(.42, .03, .025), vec3f(.2, .11, .05), vec3f(.1, .09, .08));
const FPAL = array<vec3f, 6>(vec3f(1., .38, .06), vec3f(1., .85, .45), vec3f(1., .8, .1), vec3f(1., .75, .35), vec3f(1., .62, .25), vec3f(.62, .85, 1.));
const KSKIN = array<vec3f, 4>(vec3f(.86, .6, .46), vec3f(.7, .44, .3), vec3f(.42, .23, .13), vec3f(.22, .11, .06));
const KHAIR = array<vec3f, 5>(vec3f(.05, .035, .025), vec3f(.16, .08, .035), vec3f(.55, .38, .16), vec3f(.32, .11, .04), vec3f(.025, .02, .018));
const KCLOTH = array<vec3f, 8>(vec3f(.75, .05, .04), vec3f(.85, .62, .04), vec3f(.1, .35, .78), vec3f(.12, .5, .1), vec3f(.85, .25, .45), vec3f(.9, .3, .03), vec3f(.35, .12, .65), vec3f(.8, .8, .76));
const KPANTS = array<vec3f, 4>(vec3f(.06, .12, .28), vec3f(.025, .04, .1), vec3f(.4, .33, .2), vec3f(.15, .15, .17));
const FLOWERS = array<vec3f, 8>(vec3f(.52, .08, .24), vec3f(.8, .36, .5), vec3f(.42, .3, .66), vec3f(.26, .32, .66), vec3f(.7, .68, .62), vec3f(.6, .12, .34), vec3f(.52, .4, .72), vec3f(.84, .5, .58));
@fragment fn fs(i: VO) -> GO {
  // all derivatives first, while control flow is uniform
  let p = i.wp; let dx = dpdx(p); let dy = dpdy(p); let fw = max(length(dx), length(dy));
  var N = normalize(i.n); let mat = i.mi.x; let w = triW(N);
  let dnx = dpdx(N); let dny = dpdy(N);
  let tile = max(mat, 32u) - 32u; let luv = atlasUV(tile, i.uv.xy);
  // lux, luy: card uv per pixel in quarter tiles; lg converts to the atlas (three tiles high); lq keeps the cutout
  // distance rule tuned for a 2:1 atlas
  let uvx = dpdx(i.uv.xy); let uvy = dpdy(i.uv.xy);
  let lux = uvx * .245; let luy = uvy * .245; let lq = vec2f(1., 2.); let lg = vec2f(1., 4. / 3.);
  let px = i.clip.xy; let fb = i.mi.y; let nz = ign(px + view.jit.z * 5.588);
  if ((fb & 127u) != 127u) { let f = f32(fb & 127u) / 127.; if ((fb & 128u) != 0u) { if (nz < 1. - f) { discard; } } else if (nz >= f) { discard; } }
  if (REFL && i.wp.y < view.jit.w) { discard; }
  var o: Mt; o.metal = 0.; o.inlay = 0.; o.trans = 0.; o.nb = vec3f(0.); o.rough = .5; o.alb = vec3f(.8);
  var ao = i.ao; var glass = 0.;
  if (mat >= 32u) {
    // leaves: crisp atlas cutout (TAA smooths the edges), threshold dropping with distance so far crowns keep density.
    // Nothing may depend on view angle: edge-on fades made whole sprays vanish.
    let c = textureSampleGrad(tLeaf, sLin, luv, lux * lg, luy * lg);
    let v = i.uv.z; let tn = i.tint.rgb * i.tint.rgb; var petal: vec3f;
    if (onWall(tile)) {
      // vine; the distance rule takes the finer screen direction (a slanted card is not a far one)
      let lod = max(0., .5 * log2(min(dot(lux * lq, lux * lq), dot(luy * lq, luy * lq)) * 4194304.));
      if (c.a * cardRim(i.uv.xy, tile) < .5 - .05 * min(lod, 4.)) { discard; }
      // tone and tilt per leaf (atlas b), not per card, or dense cards show as flat plates
      o.alb = tn * (.4 + .9 * c.r) * mix(vec3f(1.16, 1.05, .78), vec3f(.8, .94, 1.03), c.b) * (.92 + .16 * fract(v * 7.31));
      petal = FLOWERS[u32(i.tint.a * 255. + .5) & 7u] * (.75 + .6 * c.r) * (.82 + .36 * c.b); o.rough = .42;
      // the plant's normal gives volume; each leaf tips out of the card plane its own way, so sun and sheen pick out leaves
      let gl = cross(dx, dy); var gn = gl * inverseSqrt(max(dot(gl, gl), 1e-24)); if (dot(gn, N) < 0.) { gn = -gn; }
      let t1 = normalize(cross(gn, vec3f(.31, .9, .29)) + vec3f(1e-4, 0., 0.)); let t2 = cross(gn, t1); let la = c.b * 25.;
      o.nb = -(.2 * gn + .34 * (t1 * cos(la) + t2 * sin(la)));
    } else {
      // crown: one tone per card, shaded with the crown's normal
      let lod = max(0., .5 * log2(max(dot(lux * lq, lux * lq), dot(luy * lq, luy * lq)) * 4194304.));
      if (c.a * cardRim(i.uv.xy, tile) < .5 - .05 * min(lod, 4.) - ${LEAFT}) { discard; }
      o.alb = tn * (.55 + .75 * c.r) * mix(vec3f(1.12, 1.03, .85), vec3f(.85, .97, 1.02), v);
      petal = FLOWERS[u32(i.tint.a * 255. + .5) & 7u] * (.75 + .6 * c.r) * (.85 + .3 * v); o.rough = .5;
    }
    if (c.g > .5) { o.alb = petal; o.trans = .4; } else { o.trans = .75; }
  } else if (mat == 0u || mat == 4u || mat == 9u) {
    // marble: honed walls in courses, smooth trim, quay walls with a waterline
    let m = marble(p, dx, dy, w, vec3f(0.));
    o.alb = MARB * m.rgb; o.rough = select(.47, .3, mat == 9u) + .12 * (m.a - .5); o.nb = triN(p, dx, dy, w, 2.3, false) * .06;
    if (mat != 9u) {
      let wall = 1. - abs(N.y); let cy = p.y / .62; let j = line(min(fract(cy), 1. - fract(cy)) * .62, .004, fw) * wall;
      let ax = select(p.x, p.z, w.x > w.z) / 1.3 + h11(floor(cy)) * 7.; let vj = line(min(fract(ax), 1. - fract(ax)) * 1.3, .004, fw) * wall * ss(.6, .9, max(w.x, w.z));
      o.alb *= (1. - .32 * max(j, vj)) * (.975 + .05 * h21(vec2f(floor(cy), floor(ax))));
    }
    if (mat == 4u) {
      let d = p.y - select(${WATER}, 0., i.uv.x > .5); let B = tri(tNoiseA, p, dx, dy, w, .8);
      let wet = 1. - ss(.02, .3 + .25 * B.r, d);
      let moss = ss(.5, .0, d - B.r * .5) * ss(.35, .6, B.r * .7 + B.a * .4 + .12 * ss(.3, -.3, d));
      o.alb = mix(o.alb, o.alb * vec3f(.5, .56, .5), wet); o.rough = mix(o.rough, .2, wet);
      o.alb = mix(o.alb, vec3f(.07, .1, .03) * (.6 + .8 * B.a), moss * .85); o.rough = mix(o.rough, .7, moss);
      o.alb = mix(o.alb, vec3f(.2, .25, .19), ss(-.2, -2.5, d) * .6);
    }
  } else if (mat == 1u || mat == 14u) {
    o = pave(p, dx, dy, fw, N);
    if (mat == 14u) {
      o.inlay = 0.;
      // a flight drawn as a ramp (uv.y): a faint line per step, fading below a pixel
      if (i.uv.y > .5) { let sy = p.y / .18; o.alb *= 1. - .3 * line(min(fract(sy), 1. - fract(sy)) * .18, .014, fw * .6); o.rough = max(o.rough, .34); }
    }
  }
  else if (mat == 13u) { o = ground(p, dx, dy, fw, N); }
  else if (mat == 10u) { o = terrain(p, dx, dy, fw, N, i.uv); }
  else if (mat == 2u) {
    let A = tri(tNoiseA, p, dx, dy, w, .33); let B = tri(tNoiseA, p, dx, dy, w, 3.1);
    o.alb = mix(vec3f(.79, .76, .7), i.tint.rgb, .55) * (1. - .08 * (A.r - .5) - .05 * (B.a - .5)); o.rough = .78; o.nb = triN(p, dx, dy, w, 3.3, false) * .2;
  } else if (mat == 3u) { o.alb = vec3f(.86, .6, .22); o.metal = 1.; o.rough = .33; o.inlay = .14; } // gold answers the pulse a little
  else if (mat == 5u) {
    let g = p.xz / 1.5; let f = min(fract(g), 1. - fract(g)) * 1.5; let A = tri(tNoiseA, p, dx, dy, w, .31); let B = tri(tNoiseA, p, dx, dy, w, 1.7);
    // canal floor slabs barely differ, or their grid shows through the water
    o.alb = mix(vec3f(.66, .64, .57), vec3f(.74, .7, .58), A.r) * (.82 + .3 * B.a) * (1. - .16 * line(min(f.x, f.y), .015, fw)) * (.98 + .04 * h21(floor(g))); o.rough = .6; o.nb = triN(p, dx, dy, w, 1.1, true) * .35;
  } else if (mat == 6u) {
    // window glass: the dim warm room behind; the lighting pass adds the Fresnel reflection (last G-buffer channel = glass)
    glass = 1.; o.rough = .05; o.alb = vec3f(.05, .046, .042);
    if (i.uv.z > .002) {
      // a wall window's pane has its own uv (0-1) and random (uv.z); the room is a box behind it, ray-traced in the
      // pane's frame, so it shifts with the camera
      let u = i.uv.xy; let T = normalize(cross(vec3f(0., 1., 0.), N) + vec3f(1e-5, 0., 0.));
      let sg = sign(dot(dx, T) * uvx.x + dot(dy, T) * uvy.x + 1e-12); // which way u runs along the wall
      let E = normalize(p - view.cam.xyz); let ez = max(-dot(E, N), .2);
      let sl = vec2f(dot(E, T) * sg * 1.4, E.y * 1.1) / ez; // ray drift across the room, in pane sizes (the room is deeper than wide)
      var t = 1.; var side = 0; // 0 back wall, 1 side wall, 2 floor or ceiling
      if (abs(sl.x) > 1e-4) { let ts = (select(-.6, 1.6, sl.x > 0.) - u.x) / sl.x; if (ts < t) { t = ts; side = 1; } }
      if (abs(sl.y) > 1e-4) { let tf = (select(-.45, 1.25, sl.y > 0.) - u.y) / sl.y; if (tf < t) { t = tf; side = 2; } }
      let q = u + sl * t; let r = h21(vec2f(floor(i.uv.z * 255. + .5), dot(i.q, vec4f(13.1, 71.7, 31.3, 47.9)))); // rounded: interpolation leaves the number slightly off
      // warm grey walls, darker up and in the corners; a paler floor
      var room = vec3f(.17, .15, .125) * (.55 + .45 * sat(1. - q.y)) * mix(.8, 1.15, r);
      if (side == 1) { room *= .7; } else if (side == 2) { room = select(vec3f(.065, .06, .054), vec3f(.27, .22, .16) * (1.3 - t), sl.y < 0.); }
      else {
        // back wall: a doorway or a picture, by the window's number
        let dq = abs(q - vec2f(.2 + .6 * fract(r * 5.3), .1)); if (r < .45 && dq.x < .16 && dq.y < .62) { room *= .35; }
        let pq = abs(q - vec2f(.25 + .5 * fract(r * 9.1), .62)); if (r > .6 && pq.x < .17 && pq.y < .13) { room = vec3f(.2, .16, .1) * (.6 + .8 * fract(r * 31.)); }
      }
      o.alb = room * (1. - .45 * t);
      // some windows have a half-drawn curtain (folds fade before aliasing)
      let fu = max(abs(uvx.x), abs(uvy.x));
      if (r > .42) {
        let cu = select(u.x, 1. - u.x, fract(r * 3.7) > .5); let cw = (.2 + .22 * fract(r * 13.3)) * (1. + .05 * sin(u.y * 7. + r * 20.) * u.y);
        let fold = .5 + .5 * sin(cu / cw * 16. + r * 40.);
        let cur = vec3f(.5, .46, .4) * mix(vec3f(1.), vec3f(.85, .92, 1.05), fract(r * 23.)) * mix(.8, .62 + .36 * fold, sat(1. - fu / (cw * .12)));
        o.alb = mix(o.alb, cur, 1. - ss(cw - fu, cw + fu, cu));
      }
    }
  } else if (mat == 7u) {
    let s = vec3f(1., .22, 1.); let A = tri(tNoiseA, i.lp * s, dx * s, dy * s, w, 1.3); let B = tri(tNoiseA, p, dx, dy, w, 4.);
    o.alb = mix(vec3f(.13, .1, .075), vec3f(.3, .27, .22), A.r * A.r * 1.6) * (.6 + .7 * B.a) * (.5 + .5 * i.tint.g); o.rough = .9; o.nb = triN(i.lp * s, dx * s, dy * s, w, 2.2, true) * 1.4;
  } else if (mat == 8u) { o.alb = vec3f(.84, .86, .88); o.metal = 1.; o.rough = .2; }
  else if (mat == 18u) {
    // bambini: colours picked per child (group seed in tint.a, child in uv.z); slot in uv.x
    let slot = u32(i.uv.x * 255. + .5) / 40u; let kid = floor(i.uv.z * 255. + .5); let r = h21(vec2f(kid * 3.7 + 1., i.tint.a * 255. + 11.));
    let pick = u32(r * 1024.); let A = tri(tNoiseA, p, dx, dy, w, 6.);
    if (slot == 0u) { o.alb = KSKIN[pick & 3u]; o.rough = .55; }
    else if (slot == 1u) { o.alb = KHAIR[(pick >> 2u) % 5u] * (.85 + .3 * A.r); o.rough = .45; }
    else if (slot == 2u) { o.alb = KCLOTH[(pick >> 5u) & 7u] * (.9 + .15 * A.r); o.rough = .85; }
    else if (slot == 3u) { o.alb = KPANTS[(pick >> 8u) & 3u] * (.9 + .15 * A.r); o.rough = .8; }
    else if (slot == 5u) { o.alb = KCLOTH[((pick >> 5u) + 3u) & 7u] * (.9 + .15 * A.r); o.rough = .8; }
    else { o.alb = select(vec3f(.06, .05, .05), vec3f(.78, .78, .76), (pick & 64u) != 0u); o.rough = .5; }
  }
  else if (mat == 11u) { o.alb = i.tint.rgb * i.tint.rgb * .22; o.rough = .9; o.trans = .2; } // cypress core, planter soil
  else if (mat == 12u) {
    let g = p.xz / .9; let f = min(fract(g), 1. - fract(g)) * .9; let m = marble(p, dx, dy, w, vec3f(0.));
    o.alb = vec3f(.76, .72, .64) * m.rgb * (.95 + .1 * h21(floor(g))) * (1. - .4 * line(min(f.x, f.y), .006, fw)); o.rough = .42; o.nb = triN(p, dx, dy, w, 2.3, false) * .05;
  } else if (mat == 19u) {
    // glazed roof tiles in courses (colour in uv, square-rooted); each tile a little different
    let c = i.uv * i.uv; let cy = p.y / .42;
    let row = floor(cy); let fy = fract(cy); let cell = floor((p.x + p.z) / .6 + row * .5);
    o.alb = c * (.78 + .3 * h21(vec2f(row, cell))) * (1. - .45 * line(min(fy, 1. - fy) * .42, .02, fw)); o.rough = .32; o.nb = triN(p, dx, dy, w, 2.1, false) * .08;
  } else if (mat == 21u) {
    // painted: dragon scales, ship timbers and sails, smoke, spray (palette entry in uv.x)
    let k = min(u32(i.uv.x * 255. + .5), 18u); let A = tri(tNoiseA, p, dx, dy, w, 1.4);
    o.alb = PAL[k] * (.82 + .36 * A.r); o.rough = select(.75, .38, k <= 1u || k == 11u);
    // the hero's armour: polished silver, gold when transformed; his cape burns brighter
    if (abs(i.tint.a * 255. - 246.) < .5) {
      let pw = view.hero3.x; o.alb = PAL[k] * (.92 + .16 * A.r);
      if (k == 15u || k == 7u) { let g = select(0., pw, k == 15u); o.alb = mix(PAL[k], vec3f(1., .58, .08), g); o.metal = mix(1., .2, g); o.rough = mix(.42, .45, g); }
      if (k == 16u) { o.alb = mix(PAL[16], vec3f(.8, .12, .02), pw); }
      if (k == 14u) { o.alb = mix(PAL[14], vec3f(.04, .1, .5), pw); }
    }
  } else if (mat == 22u) {
    // fire, cannon flash, eyes and lanterns: shine like GLOW
    o.alb = FPAL[min(u32(i.uv.x * 255. + .5), 5u)]; o.rough = .6; glass = .3;
  } else if (mat == 20u) {
    // light: windows, eyes, magic (colour in uv); flagged for the lighting pass through the glass channel
    o.alb = i.uv * i.uv; o.rough = .6; glass = .3;
  } else if (mat == 15u) {
    let A = tri(tNoiseA, p, dx, dy, w, .5); let B = tri(tNoiseA, p, dx, dy, w, 2.4);
    o.alb = vec3f(.6, .57, .51) * i.tint.rgb * (.7 + .5 * A.r) * (.8 + .4 * B.a); o.rough = .8; o.nb = triN(p, dx, dy, w, .6, true) * 1.5 + triN(p, dx, dy, w, 3., true) * .5;
    let d = p.y; let wet = 1. - ss(.0, .5, d); o.alb = mix(o.alb, o.alb * .5, wet); o.rough = mix(o.rough, .25, wet); o.alb = mix(o.alb, vec3f(.06, .09, .04), ss(.5, .7, A.g + B.a * .4) * ss(.9, -.2, d));
  } else {
    // mountain stream and fall (uv.x across, uv.y bed steepness): white and streaked when falling, glassy with threads
    // when running; ragged edges move with the flow
    let ac = abs(i.uv.x * 2. - 1.); let stp = i.uv.y; let tm = view.cam.w;
    let A = tri(tNoiseA, vec3f(p.x, p.y * .2 + tm * (.35 + .9 * stp), p.z), dx, dy, w, .4); let B = tri(tNoiseA, vec3f(p.x, p.y * .45 + tm * (.8 + 1.6 * stp), p.z), dx, dy, w, 1.5);
    if (ac + (A.r - .5) * .55 + (B.a - .5) * .3 > .84) { discard; }
    let foam = ss(.3, .62, stp * 1.2 + (A.r - .5) * .9 + (B.r - .5) * .4 + ss(.45, .9, ac) * .35);
    o.alb = mix(vec3f(.1, .2, .19), mix(vec3f(.4, .5, .53), vec3f(.88, .9, .92), ss(.3, .72, A.r * .7 + B.a * .6)), foam); o.rough = mix(.1, .6, foam);
  }
  N = normalize(N - o.nb);
  // specular AA: in-pixel curvature widens the highlight instead of sparkling
  let kr = min(2. * (dot(dnx, dnx) + dot(dny, dny)) * .25, .18);
  let rough = sqrt(sat(sq(o.rough) + kr));
  var g: GO; g.a = vec4f(sqrt(sat3(o.alb)), o.inlay); g.n = vec4f(N, max(rough, .045)); g.m = vec4f(ao, o.metal, o.trans, glass);
  return g;
}
// depth-only pass for plants (High/Medium), then fs runs with depth "equal", so the material is shaded once per
// pixel, not per card layer. EVERY discard in fs reachable by a plant must be mirrored here exactly (LOD dither, mirror
// clip, leaf cutout), or there are holes.
@fragment fn fsDepth(i: VO) {
  let mat = i.mi.x; let tile = max(mat, 32u) - 32u; let luv = atlasUV(tile, i.uv.xy);
  let uvx = dpdx(i.uv.xy); let uvy = dpdy(i.uv.xy);
  let lux = uvx * .245; let luy = uvy * .245; let lq = vec2f(1., 2.); let lg = vec2f(1., 4. / 3.);
  let px = i.clip.xy; let fb = i.mi.y; let nz = ign(px + view.jit.z * 5.588);
  if ((fb & 127u) != 127u) { let f = f32(fb & 127u) / 127.; if ((fb & 128u) != 0u) { if (nz < 1. - f) { discard; } } else if (nz >= f) { discard; } }
  if (REFL && i.wp.y < view.jit.w) { discard; }
  if (mat >= 32u) {
    let c = textureSampleGrad(tLeaf, sLin, luv, lux * lg, luy * lg);
    if (onWall(tile)) {
      let lod = max(0., .5 * log2(min(dot(lux * lq, lux * lq), dot(luy * lq, luy * lq)) * 4194304.));
      if (c.a * cardRim(i.uv.xy, tile) < .5 - .05 * min(lod, 4.)) { discard; }
    } else {
      let lod = max(0., .5 * log2(max(dot(lux * lq, lux * lq), dot(luy * lq, luy * lq)) * 4194304.));
      if (c.a * cardRim(i.uv.xy, tile) < .5 - .05 * min(lod, 4.) - ${LEAFT}) { discard; }
    }
  }
}
`;
// Low (phones): tile GPUs only skip hidden fragments for shaders without discard. So all discards are stripped (LODs
// hard-switch in the vertex stage, streams lose ragged edges, no mirror), and leaves are drawn twice: depth cut out by
// fsPre, then colour where the depth is theirs by fsLeafLow (plainer, never discards). Both must agree on depth exactly:
// the invariant position (INV in quality.js).
const W_GBUF_LOW = W_GBUF.replace(/discard;/g, '') + /*wgsl*/`
@fragment fn fsPre(i: VO) {
  let tile = max(i.mi.x, 32u) - 32u; let uvx = dpdx(i.uv.xy) * .245; let uvy = dpdy(i.uv.xy) * .245; let lq = vec2f(1., 2.);
  let c = textureSample(tLeaf, sLin, atlasUV(tile, i.uv.xy));
  if (i.mi.x >= 32u) {
    let wall = onWall(tile); let ex = dot(uvx * lq, uvx * lq); let ey = dot(uvy * lq, uvy * lq);
    let lod = max(0., .5 * log2(select(max(ex, ey), min(ex, ey), wall) * 4194304.));
    if (c.a * cardRim(i.uv.xy, tile) < .5 - .05 * min(lod, 4.) - select(${LEAFT}, 0., wall)) { discard; }
  }
}
@fragment fn fsLeafLow(i: VO) -> GO {
  let mat = i.mi.x; let tile = max(mat, 32u) - 32u; let c = textureSample(tLeaf, sLin, atlasUV(tile, i.uv.xy));
  let tn = i.tint.rgb * i.tint.rgb; let v = i.uv.z; var alb = tn * .22; var rough = .9; var trans = .2;
  if (mat == 7u) { alb = vec3f(.19, .16, .125) * (.5 + .5 * i.tint.g); trans = 0.; }
  else if (mat >= 32u) {
    var petal: vec3f; trans = .75;
    if (onWall(tile)) { alb = tn * (.4 + .9 * c.r) * mix(vec3f(1.16, 1.05, .78), vec3f(.8, .94, 1.03), c.b) * (.92 + .16 * fract(v * 7.31)); petal = FLOWERS[u32(i.tint.a * 255. + .5) & 7u] * (.75 + .6 * c.r) * (.82 + .36 * c.b); rough = .42; }
    else { alb = tn * (.55 + .75 * c.r) * mix(vec3f(1.12, 1.03, .85), vec3f(.85, .97, 1.02), v); petal = FLOWERS[u32(i.tint.a * 255. + .5) & 7u] * (.75 + .6 * c.r) * (.85 + .3 * v); rough = .5; }
    if (c.g > .5) { alb = petal; trans = .4; }
  }
  var g: GO; g.a = vec4f(sqrt(sat3(alb)), 0.); g.n = vec4f(normalize(i.n), rough); g.m = vec4f(i.ao, 0., trans, 0.);
  return g;
}
`;
