// shaders 3/4: ambient occlusion, deferred lighting, TAA, tone mapping
// sun shadows: a camera cascade and three baked maps (city, shelf, mountains)
const W_SHADOWLIB = /*wgsl*/`
// nine bilinear compares on a fixed grid e apart: a ~5-texel filter with no noise (random discs sizzle under foliage)
fn shTap(t: texture_depth_2d, m: mat4x4f, p: vec3f, e: f32) -> f32 {
  let s = m * vec4f(p, 1.); let uv = vec2f(s.x * .5 + .5, .5 - s.y * .5); var a = 0.;
  // Low: four compares, ~3 texels
  if (LV > 1) { for (var y = 0; y < 2; y++) { for (var x = 0; x < 2; x++) { a += textureSampleCompareLevel(t, sCmp, uv + (vec2f(f32(x), f32(y)) - .5) * e, s.z); } } return a / 4.; }
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) { a += textureSampleCompareLevel(t, sCmp, uv + vec2f(f32(x), f32(y)) * e, s.z); } }
  return a / 9.;
}
// 0 at the map box's centre, 1 at any face (depth included)
fn inMap(m: mat4x4f, p: vec3f) -> f32 { let s = m * vec4f(p, 1.); return max(max(abs(s.x), abs(s.y)), abs(s.z * 2. - 1.)); }
// map sizes vary per level (SHN); coarser maps get a proportionally larger normal offset
fn farShadow(p: vec3f, n: vec3f, so: f32) -> f32 {
  if (inMap(view.sm[1], p) < .985) { return shTap(tSh1, view.sm[1], p + n * ((.1 + .3 * so) * ${8192 / SHN[1]}.), 1.5 / ${SHN[1]}.); }
  if (inMap(view.sm[2], p) < .985) { return shTap(tSh2, view.sm[2], p + n * ((.5 + 1.5 * so) * ${4096 / SHN[2]}.), 1.3 / ${SHN[2]}.); }
  if (inMap(view.sm[3], p) < .985) { return shTap(tSh3, view.sm[3], p + n * ((4. + 8. * so) * ${2048 / SHN[3]}.), 1.2 / ${SHN[3]}.); }
  return 1.;
}
fn shadow(p: vec3f, n: vec3f) -> f32 {
  let so = 1. - sat(dot(n, view.sun.xyz));
  if (LV > 1) { return farShadow(p, n, so); } // Low: no cascade, baked maps only
  let e = inMap(view.sm[0], p);
  if (e >= .96) { return farShadow(p, n, so); }
  let s = shTap(tSh0, view.sm[0], p + n * (.03 + .08 * so), 1.6 / ${CASC || 2048}.);
  if (e > .84) { return mix(s, farShadow(p, n, so), (e - .84) / .12); }
  return s;
}
`;
// microfacet reflection, and haze
const W_SHADE = /*wgsl*/`
fn ggxD(nh: f32, a: f32) -> f32 { let d = nh * nh * (a * a - 1.) + 1.; return a * a / (PI * d * d); }
fn ggxV(nl: f32, nv: f32, a: f32) -> f32 { return .5 / (nl * sqrt(nv * nv * (1. - a * a) + a * a) + nv * sqrt(nl * nl * (1. - a * a) + a * a) + 1e-5); }
fn fres(f0: vec3f, vh: f32) -> vec3f { return f0 + (1. - f0) * pow(1. - vh, 5.); }
fn envBRDF(f0: vec3f, rough: f32, nv: f32) -> vec3f {
  let r = rough * vec4f(-1., -.0275, -.572, .022) + vec4f(1., .0425, 1.04, -.04);
  let a = min(r.x * r.x, exp2(-9.28 * nv)) * r.x + r.y; let ab = vec2f(-1.04, 1.04) * a + r.zw;
  return f0 * ab.x + ab.y;
}
// direct sun: energy-conserving diffuse plus GGX specular
fn sunBRDF(N: vec3f, V: vec3f, alb: vec3f, f0: vec3f, rough: f32) -> vec3f {
  let L = view.sun.xyz; let H = normalize(V + L); let nl = sat(dot(N, L)); let nv = max(dot(N, V), 1e-3);
  let a = max(rough * rough, .002); let F = fres(f0, sat(dot(V, H)));
  return (alb * (1. - F) / PI + F * min(ggxD(sat(dot(N, H)), a) * ggxV(nl, nv, a), 60.)) * nl;
}
// aerial perspective: humid haze thinning with height, lit by the horizon sky in that direction
fn hazeOD(ro: vec3f, rd: vec3f, d: f32) -> f32 {
  let k = rd.y / 650.; var od = d; if (abs(k * d) > 1e-3) { od = (1. - exp(-k * d)) / k; }
  return exp(-max(ro.y, 0.) / 650.) * od;
}
fn aerial(c: vec3f, ro: vec3f, rd: vec3f, d: f32) -> vec3f {
  let od = hazeOD(ro, rd, min(d, 150000.));
  let tr = exp(-od * vec3f(3.e-4, 3.4e-4, 4.e-4));
  // near haze is open-sky blue, far haze the horizon's colour, so distant sea and hills dissolve into the sky
  let ins = mix(skyLut(normalize(vec3f(rd.x, max(rd.y, 0.) + .035, rd.z))), skyLut(normalize(vec3f(-view.sun.z, .1, view.sun.x))) * vec3f(.9, 1., 1.12), .62 * exp(-od * 1.5e-4));
  return c * tr + ins * (1. - exp(-od * 3.3e-4));
}
// energy pulse: two rings (the second fainter) running out at 60 m/s, carried by gold inlay, lighting what they pass
fn pulseK(r: f32, x: f32) -> f32 { return exp(-sq((r - 22. - 60. * x) / 14.)) * ss(0., .35, x); }
fn pulseAt(r: f32) -> vec3f {
  let k = (pulseK(r, view.pulse.x) + .55 * pulseK(r, view.pulse.x - .75)) * exp(-r / 420.);
  return mix(vec3f(1., .88, .66), vec3f(.55, .35, 1.), sat(r / 340.)) * k;
}
`;

// ambient occlusion (half resolution, GTAO)
const W_AO = W_COMMON + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var tD: texture_depth_2d;
@group(0) @binding(2) var tG1: texture_2d<f32>;
@group(0) @binding(3) var tG2: texture_2d<f32>;
fn vpos(px: vec2i) -> vec3f {
  let z = view.fwd.w / max(textureLoad(tD, px, 0), 1e-6);
  let ndc = (vec2f(px) + .5) * view.res.zw * vec2f(2., -2.) + vec2f(-1., 1.) - view.jit.xy;
  return vec3f(ndc.x * view.right.w * z, ndc.y * view.up.w * z, z);
}
// foliage neither casts nor takes AO (loose cards make grain no filter removes); leaves have baked AO and the sky map
fn leafy(px: vec2i) -> bool { return textureLoad(tG2, px, 0).b > .35; }
const BAYER = array<u32, 16>(0u, 8u, 2u, 10u, 12u, 4u, 14u, 6u, 3u, 11u, 1u, 9u, 15u, 7u, 13u, 5u);
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy) * 2; let P = vpos(px);
  if (P.z > 2500. || leafy(px)) { return vec4f(1., P.z, 0., 1.); }
  let nw = textureLoad(tG1, px, 0).xyz; let n = normalize(vec3f(dot(nw, view.right.xyz), dot(nw, view.up.xyz), dot(nw, view.fwd.xyz)));
  let V = normalize(-P); let R = clamp(P.z * .07, 1.1, 5.);
  let rpx = clamp(R * view.res.y * .5 / (view.up.w * P.z), 5., 150.);
  // samples spread by a fixed 4 x 4 pattern (32 directions, 16 offsets); the lighting pass's 4 x 4 box holds each phase
  // once, so the result has no noise in space or time
  let hp = vec2u(fc.xy); let bi = BAYER[(hp.x & 3u) + 4u * (hp.y & 3u)];
  let nz = (f32(bi) + .5) / 16.; let nz2 = (f32((bi * 7u + 5u) & 15u) + .5) / 16.; let mx = vec2i(view.res.xy) - 1;
  var vis = 0.;
  for (var s = 0; s < 3; s++) {
    let phi = (f32(s) + nz) * PI / 3.; let dir = vec2f(cos(phi), sin(phi)); let dv = vec3f(dir, 0.);
    let ortho = dv - dot(dv, V) * V; let axis = normalize(cross(ortho, V));
    let pn = n - axis * dot(n, axis); let pl = length(pn);
    let cn = sat(dot(pn, V) / max(pl, 1e-4)); let ng = sign(dot(ortho, pn)) * acos(cn);
    let low0 = cos(ng + PI * .5); let low1 = cos(ng - PI * .5); var c0 = low0; var c1 = low1;
    for (var j = 0; j < 4; j++) {
      let t = sq((f32(j) + nz2) / 4.) * rpx + 1.5; let so = vec2i(round(vec2f(dir.x, -dir.y) * t));
      let q0 = clamp(px + so, vec2i(0), mx); let q1 = clamp(px - so, vec2i(0), mx);
      let d0 = vpos(q0) - P; let d1 = vpos(q1) - P;
      let l0 = length(d0); let l1 = length(d1);
      // nearby occluders (< 0.2 m) count little, or every moulding gets a dark halo; real corners are found farther out
      if (!leafy(q0)) { c0 = max(c0, mix(low0, dot(d0 / l0, V), sat((R - l0) / (R * .45)) * sat(l0 / .2))); }
      if (!leafy(q1)) { c1 = max(c1, mix(low1, dot(d1 / l1, V), sat((R - l1) / (R * .45)) * sat(l1 / .2))); }
    }
    let h0 = ng + clamp(-acos(clamp(c1, -1., 1.)) - ng, -PI * .5, PI * .5); let h1 = ng + clamp(acos(clamp(c0, -1., 1.)) - ng, -PI * .5, PI * .5);
    vis += pl * ((cn + 2. * h0 * sin(ng) - cos(2. * h0 - ng)) + (cn + 2. * h1 * sin(ng) - cos(2. * h1 - ng))) * .25;
  }
  return vec4f(sat(vis / 3.), P.z, 0., 1.);
}
`;

// light shafts (quarter resolution)
// how much of the haze along each ray is sunlit (baked maps); the lighting pass adds forward scattering for it
const W_VOL = W_COMMON + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var sCmp: sampler_comparison;
@group(0) @binding(2) var tD: texture_depth_2d;
@group(0) @binding(3) var tSh1: texture_depth_2d;
@group(0) @binding(4) var tSh2: texture_depth_2d;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = min(vec2i(fc.xy) * 4 + 1, vec2i(view.res.xy) - 1); let dp = textureLoad(tD, px, 0);
  let ndc = (vec2f(px) + .5) * view.res.zw * vec2f(2., -2.) + vec2f(-1., 1.) - view.jit.xy;
  let ray = view.fwd.xyz + view.right.xyz * ndc.x * view.right.w + view.up.xyz * ndc.y * view.up.w; let rl = length(ray);
  let z = view.fwd.w / max(dp, 1e-7); let far = min(z * rl, 800.); let rd = ray / rl;
  let nz = ign(fc.xy + view.jit.z * 7.13); var acc = 0.; const N = 24.;
  for (var i = 0.; i < N; i += 1.) {
    let t = far * (i + nz) / N; let p = view.cam.xyz + rd * t;
    let s1 = view.sm[1] * vec4f(p, 1.); var lit = 1.;
    if (max(abs(s1.x), abs(s1.y)) < .985) { lit = textureSampleCompareLevel(tSh1, sCmp, vec2f(s1.x * .5 + .5, .5 - s1.y * .5), s1.z); }
    else { let s2 = view.sm[2] * vec4f(p, 1.); if (max(abs(s2.x), abs(s2.y)) < .985) { lit = textureSampleCompareLevel(tSh2, sCmp, vec2f(s2.x * .5 + .5, .5 - s2.y * .5), s2.z); } }
    acc += lit * exp(-max(p.y, 0.) / 650.);
  }
  return vec4f(acc / N * far / 800., z, 0., 1.);
}
`;

// deferred lighting
const W_LIGHT = W_COMMON + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var sLin: sampler;
@group(0) @binding(2) var sRep: sampler;
@group(0) @binding(3) var sCmp: sampler_comparison;
@group(0) @binding(4) var tG0: texture_2d<f32>;
@group(0) @binding(5) var tG1: texture_2d<f32>;
@group(0) @binding(6) var tG2: texture_2d<f32>;
@group(0) @binding(7) var tD: texture_depth_2d;
@group(0) @binding(8) var tAO: texture_2d<f32>;
@group(0) @binding(9) var tSky: texture_2d<f32>;
@group(0) @binding(10) var tEnv: texture_cube<f32>;
@group(0) @binding(11) var tIrr: texture_cube<f32>;
@group(0) @binding(12) var tSh0: texture_depth_2d;
@group(0) @binding(13) var tSh1: texture_depth_2d;
@group(0) @binding(14) var tSh2: texture_depth_2d;
@group(0) @binding(15) var tSh3: texture_depth_2d;
@group(0) @binding(16) var tWater: texture_2d<f32>;
@group(0) @binding(17) var tNoiseA: texture_2d<f32>;
@group(0) @binding(18) var tTop: texture_2d<f32>;
@group(0) @binding(19) var tVol: texture_2d<f32>;
` + W_SKY + W_SHADOWLIB + W_SHADE + /*wgsl*/`
// SSAO over a 4 x 4 half-res box (one full pattern period, so it cancels), depth-weighted against bleeding
fn ssao(fc: vec2f, z: f32) -> f32 {
  let b = vec2i(floor(fc * .5 - .5)); let mx = vec2i(textureDimensions(tAO)) - 1; var acc = 0.; var ws = 0.;
  for (var y = -1; y <= 2; y++) { for (var x = -1; x <= 2; x++) {
    let r = textureLoad(tAO, clamp(b + vec2i(x, y), vec2i(0), mx), 0).rg;
    let w = 1. / (.02 + abs(r.g - z) / z);
    acc += r.r * w; ws += w;
  } }
  return acc / ws;
}
// sky seen past roofs and crowns, from the top-down height map: darker ambient in streets and under trees
fn skyVis(p: vec3f, n: vec3f) -> f32 {
  let q = p + n * 1.3; let uv = q.xz / 1024. + .5;
  if (max(abs(uv.x - .5), abs(uv.y - .5)) > .495) { return 1.; }
  let o1 = sat((textureSampleLevel(tTop, sLin, uv, ${2 - TOPL}.).r - q.y - .4) / 5.);
  let o2 = sat((textureSampleLevel(tTop, sLin, uv, ${4 - TOPL}.).r - q.y - .8) / 10.);
  let o3 = sat((textureSampleLevel(tTop, sLin, uv, ${5.5 - TOPL}).r - q.y - 1.5) / 22.);
  return (1. - .42 * o1) * (1. - .32 * o2) * (1. - .22 * o3);
}
// what a window mirrors below the sky (the env cube holds only sky): a soft skyline of trees and pale stone over
// paving and lawn, by direction, shifted a little across the city
fn surround(R: vec3f, env: vec3f, wp: vec3f) -> vec3f {
  let az = atan2(R.z, R.x) / (2. * PI); let off = dot(wp.xz, vec2f(.0021, .0013));
  let n = textureSampleLevel(tNoiseA, sRep, vec2f(az * 3. + off, .31 + off), 0.); let m = textureSampleLevel(tNoiseA, sRep, vec2f(az * 11. + off, .67), 0.);
  let top = .2 * n.r + .1 * m.r - .08; let k = 1. - ss(top - .012, top + .012, R.y);
  if (k <= 0.) { return env; }
  let E = textureSampleLevel(tIrr, sLin, vec3f(0., 1., 0.), 0.).rgb + view.sunc.rgb * .1;
  var c = mix(vec3f(.04, .07, .028), vec3f(.5, .46, .39), ss(.5, .56, m.r + .25 * (n.a - .5)) * ss(top - .1, top - .03, R.y) * .8);
  c = mix(c, mix(vec3f(.07, .1, .04), vec3f(.46, .43, .37), ss(.4, .6, n.b + m.a * .5)), ss(-.06, -.3, R.y));
  return mix(env, c * E, k);
}
// sunlit haze in front of the pixel: shaft texture, depth-weighted upsample, times forward scattering
fn shafts(fc: vec2f, z: f32, rd: vec3f) -> vec3f {
  if (view.misc.y > .5) { return vec3f(0.); }
  let mu = dot(rd, view.sun.xyz); let g = .78; let hg = (1. - g * g) / (4. * PI * pow(1. + g * g - 2. * g * mu, 1.5));
  // Low: no shaft texture, haze taken as fully sunlit
  if (LV > 1) { return view.sunc.rgb * (min(hg, .8) * 1.2e-5 + 1e-6) * min(z / max(dot(rd, view.fwd.xyz), 1e-3), 800.) * exp(-max(view.cam.y, 0.) / 650.) * .85; }
  let h = fc * .25 - .5; let b = floor(h); let f = h - b; let mx = vec2i(textureDimensions(tVol)) - 1; var acc = 0.; var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1); let r = textureLoad(tVol, clamp(vec2i(b) + o, vec2i(0), mx), 0).rg;
    let w = (mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y)) + .03) / (.03 + abs(min(r.g, 800.) - min(z, 800.)) / min(z, 800.));
    acc += r.r * w; ws += w;
  }
  return view.sunc.rgb * (min(hg, .8) * 1.2e-5 + 1e-6) * acc / ws * 800.;
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy); let dp = textureLoad(tD, px, 0);
  let ndc = fc.xy * view.res.zw * vec2f(2., -2.) + vec2f(-1., 1.) - view.jit.xy;
  let ray = view.fwd.xyz + view.right.xyz * ndc.x * view.right.w + view.up.xyz * ndc.y * view.up.w; let rd = normalize(ray);
  if (dp == 0.) {
    // nothing drawn below the horizon: the sea beyond its 95 km mesh, long dissolved into haze, so show the haze
    if (rd.y < 0.) { return vec4f(aerial(vec3f(0.), view.cam.xyz, rd, view.cam.y / max(0. - rd.y, 1e-5)) + shafts(fc.xy, 1e6, rd), 1.); }
    return vec4f(sky(rd, true) + shafts(fc.xy, 1e6, rd), 1.);
  }
  let z = view.fwd.w / dp; let wp = view.cam.xyz + ray * z; let dist = z * length(ray);
  let g0 = textureLoad(tG0, px, 0); let g1 = textureLoad(tG1, px, 0); let g2 = textureLoad(tG2, px, 0);
  let alb = g0.rgb * g0.rgb; let N = normalize(g1.xyz); let rough = g1.a; let metal = g2.g; let trans = g2.b;
  let V = -rd; let L = view.sun.xyz;
  let sh = shadow(wp, N);
  var ao = g2.r;
  if (LV < 2 && view.misc.y < .5) { ao *= pow(ssao(fc.xy, z), 2.3); }
  let sv = skyVis(wp, N);
  // window glass (g2.a): a bit more mirror than real glass, to read face-on
  let glass = g2.a > .5; let glow = g2.a > .2 && g2.a < .45; let f0 = select(mix(vec3f(.04), alb, metal), vec3f(.085), glass); let dc = alb * (1. - metal);
  let stm = view.ev.x; var sun = view.sunc.rgb * sh * (1. - .85 * stm); // storm clouds hide the sun
  // under water: moving caustics from the surface, dimmed with depth
  let r = length(wp.xz); let wl = select(0., ${WATER}, r < 432.); let dep = wl - wp.y;
  var cz = 0.; let pu = pulseAt(r);
  if (dep > -2.6 && (r < 432. || wp.y < 2.2)) {
    // two caustic layers at unrelated scales and angles, warped so they never repeat; mip by pixel size against sizzle
    let q0 = wp.xz + L.xz * dep * 1.1; let wv = textureSampleLevel(tNoiseA, sRep, q0 / 83., 0.).rg - .5; let q = q0 + wv * 7.;
    let cl = max(log2(max(dist * view.up.w * view.res.w * 150., 1.)) - ${Math.log2(512 / WAVEPX)}., 0.); // minus a smaller wave tile's missing levels
    let c1 = textureSampleLevel(tWater, sRep, q / 9.7, cl).b; let c2 = textureSampleLevel(tWater, sRep, vec2f(q.x * .6 + q.y * .8, q.y * .6 - q.x * .8) / 5.3 + .37, cl + .9).b;
    cz = (c1 * .6 + c2 * .5) * (.8 + .9 * wv.x) + .35 * lum(pu) * 6.;
    // refracted sun is steeper than the maps know: ease shadows
    if (dep > 0.) { sun = view.sunc.rgb * mix(sh, 1., .7) * (.3 + 1.5 * cz) * exp(-dep * vec3f(.14, .035, .03)); }
  }
  var col = sunBRDF(N, V, dc, f0, rough) * sun;
  // under water light comes through the whole surface: floors glow with caustics even in the wall's shade
  if (dep > 0.) { col += dc * (textureSampleLevel(tIrr, sLin, vec3f(0., 1., 0.), 0.).rgb * (.5 + 1.6 * cz) + view.sunc.rgb * .05 * (.4 + cz)) * sat(N.y + .45) * g2.r; }
  // light bounced off the water onto the quay walls
  if (dep <= 0. && dep > -2.6 && cz > 0.) {
    let q = vec2f(wp.x + wp.z, wp.y * 1.6 + view.cam.w * .1); let cw = textureSampleLevel(tWater, sRep, q / 6., 0.).b;
    col += dc * view.sunc.rgb * (.03 + .1 * cw * (.5 + cz)) * ss(-2.6, -.1, dep) * (1. - abs(N.y)) * (.35 + .65 * sh) * vec3f(.75, 1., .95);
  }
  // leaves: transmitted light, kept below the reflected level (deep yellow-green, not chalk)
  if (trans > 0.) {
    let back = .25 + .75 * pow(sat(dot(rd, L)), 3.);
    col += dc * vec3f(.95, 1.1, .38) * sun * trans * (sat(-dot(N, L)) * .7 + .3) * back * .3;
    col += dc / PI * sun * trans * sat(dot(N, L) * .5 + .5) * .25;
  }
  // sky and bounce light, multi-bounce AO keeps bright stone's colour
  let aoA = ao * sv; let aa = 2.04 * dc - .33; let bb = -4.8 * dc + .64; let cc = 2.75 * dc + .69;
  let aoc = max(vec3f(aoA), ((aoA * aa + bb) * aoA + cc) * aoA);
  let nv = max(dot(N, V), 1e-3);
  col += dc * textureSampleLevel(tIrr, sLin, N, 0.).rgb * aoc * (1. - .55 * stm);
  let R = reflect(rd, N); var so = sat(pow(nv + aoA, exp2(-16. * rough - 1.)) - 1. + aoA) * mix(sv, 1., .3);
  var env = textureSampleLevel(tEnv, sLin, R, rough * 5.).rgb;
  // a recessed pane still mirrors what's in front: the reveal dims it only a little
  if (glass) { env = surround(R, env, wp); so = mix(so, 1., .6); }
  col += env * envBRDF(f0, rough, nv) * so * (1. - .6 * stm);
  // the crystal's own light, close by: breathing and flaring with the pulse
  let lc = vec3f(0., 60., 0.) - wp; let dl = dot(lc, lc);
  col += dc * vec3f(1., .82, .55) * (.5 + .5 * view.pulse.y + 1.6 * view.pulse.z) * 28. / (dl + 90.) * sat(dot(N, lc) * inverseSqrt(dl) * .7 + .3) * ao;
  // the pulse runs along gold inlay and sweeps a ring of light near the ground
  col += pu * g0.a * 9. + dc * pu * .55 * exp(-max(wp.y - 12., 0.) / 40.) * (.4 + .6 * ao);
  // lit windows, eyes and magic light shine by themselves
  let gk = lum(view.sunc.rgb) / ${SUNK} * select(1., 1.4, ${NIGHT} == 1);
  if (glow) { col += alb * gk * .55; }
  // at night many windows of the city are lit, warm and a little different each
  if (${NIGHT} == 1 && glass) { let hw = h21(floor(wp.xz * .55) + floor(wp.y * .4) * 7.13); if (hw > .35) { col += vec3f(1., .68, .36) * gk * (.25 + .35 * hw); } }
  // lightning lights the Serpent Fortress's plain
  let fz = flash(); if (fz > .01) { col += dc * vec3f(.7, .7, 1.) * fz * gk * .5 * exp(-length(wp.xz - SERPI_XZ) / 450.) * sat(N.y * .5 + .6); }
  // storm: each stroke on the castle lights up the city around it, walls facing the castle and the sky most
  // the hero's lightning lights up everything round him for a moment
  if (view.hero3.y > .25 && view.hero3.y < 1.) { let hf = (1. - ss(.25, 1., view.hero3.y)) * (.6 + .4 * step(.25, fract(view.cam.w * 13.))); col += dc * vec3f(.7, .82, 1.) * hf * gk * .35 * exp(-distance(wp, view.hero.xyz) / 20.); }
  let fk = flashK(); if (fk > .01) { let tc = normalize(vec3f(0., 160., 0.) - wp); col += dc * vec3f(.75, .78, 1.) * fk * gk * .9 * exp(-length(wp.xz) / 650.) * (sat(dot(N, tc)) * .6 + sat(N.y) * .4 + .1); }
  return vec4f(aerial(col, view.cam.xyz, rd, dist) * (1. - .25 * stm) + shafts(fc.xy, z, rd) * (1. - stm), 1.);
}
`;

// temporal anti-aliasing
// jittered frames blended into a history reprojected through depth and clamped to the neighbourhood
const W_TAA = W_COMMON + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var sLin: sampler;
@group(0) @binding(2) var tC: texture_2d<f32>;
@group(0) @binding(3) var tH: texture_2d<f32>;
@group(0) @binding(4) var tD: texture_depth_2d;
fn tm(c: vec3f) -> vec3f { return c / (1. + lum(c)); }
fn itm(c: vec3f) -> vec3f { return c / max(1. - lum(c), 1e-3); }
fn hist(uv: vec2f) -> vec3f { // Catmull-Rom in five taps
  let sz = view.res.xy; let sp = uv * sz; let tc = floor(sp - .5) + .5; let f = sp - tc;
  let w0 = f * (-.5 + f * (1. - .5 * f)); let w1 = 1. + f * f * (-2.5 + 1.5 * f); let w2 = f * (.5 + f * (2. - 1.5 * f)); let w3 = f * f * (-.5 + .5 * f);
  let w12 = w1 + w2; let t0 = (tc - 1.) / sz; let t3 = (tc + 2.) / sz; let t12 = (tc + w2 / w12) / sz;
  var c = textureSampleLevel(tH, sLin, vec2f(t12.x, t0.y), 0.).rgb * w12.x * w0.y + textureSampleLevel(tH, sLin, vec2f(t0.x, t12.y), 0.).rgb * w0.x * w12.y
        + textureSampleLevel(tH, sLin, t12, 0.).rgb * w12.x * w12.y + textureSampleLevel(tH, sLin, vec2f(t3.x, t12.y), 0.).rgb * w3.x * w12.y
        + textureSampleLevel(tH, sLin, vec2f(t12.x, t3.y), 0.).rgb * w12.x * w3.y;
  return max(c / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y), vec3f(0.));
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy); let mx = vec2i(view.res.xy) - 1; let uv = fc.xy * view.res.zw;
  // nearest depth decides motion, so thin foreground edges keep their history
  var dm = 0.; var om = vec2i(0); var m1 = vec3f(0.); var m2 = vec3f(0.); var cc = vec3f(0.); var mn = vec3f(1e9); var mxc = vec3f(0.);
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let q = clamp(px + vec2i(x, y), vec2i(0), mx); let d = textureLoad(tD, q, 0); if (d > dm) { dm = d; om = vec2i(x, y); }
    let c = tm(min(textureLoad(tC, q, 0).rgb, vec3f(4000.))); m1 += c; m2 += c * c; mn = min(mn, c); mxc = max(mxc, c);
    if (x == 0 && y == 0) { cc = c; }
  } }
  let ndc = (fc.xy + vec2f(om)) * view.res.zw * vec2f(2., -2.) + vec2f(-1., 1.) - view.jit.xy;
  let z = view.fwd.w / max(dm, 2e-7);
  let wp = view.cam.xyz + (view.fwd.xyz + view.right.xyz * ndc.x * view.right.w + view.up.xyz * ndc.y * view.up.w) * z;
  let pc = view.pvp * vec4f(wp, 1.); let pn = pc.xy / pc.w;
  let huv = uv + (vec2f(pn.x * .5 + .5, .5 - pn.y * .5) - (vec2f(ndc.x, -ndc.y) * .5 + .5));
  if (view.misc.x > .5 || pc.w <= 0. || any(huv < vec2f(0.)) || any(huv > vec2f(1.))) { return vec4f(itm(cc), 1.); }
  let mu = m1 / 9.; let sg = sqrt(max(m2 / 9. - mu * mu, vec3f(0.)));
  let lo = max(mn, mu - sg * 1.25); let hi = min(mxc, mu + sg * 1.25);
  var h = tm(hist(huv));
  // clip the history into the neighbourhood's range
  let ctr = (lo + hi) * .5; let ext = (hi - lo) * .5 + 1e-5; let v = h - ctr; let u = abs(v / ext); let m = max(u.x, max(u.y, u.z));
  if (m > 1.) { h = ctr + v / m; }
  let sp = length((huv - uv) * view.res.xy);
  return vec4f(itm(mix(h, cc, mix(.08, .2, sat(sp * .2)))), 1.);
}
`;

// final image: bloom, exposure, tone curve, dither
const W_POST = W_COMMON + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var sLin: sampler;
@group(0) @binding(2) var tC: texture_2d<f32>;
@group(0) @binding(3) var tB: texture_2d<f32>;
// AgX: rolls bright colours off to white instead of clipping hue
fn agxCurve(x: vec3f) -> vec3f { let x2 = x * x; let x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + .4298 * x2 + .1191 * x - .00232; }
fn agx(c: vec3f) -> vec3f {
  let m = mat3x3f(.842479062253094, .0423282422610123, .0423756549057051, .0784335999999992, .878468636469772, .0784336, .0792237451477643, .0791661274605434, .879142973793104);
  let mi = mat3x3f(1.19687900512017, -.0528968517574562, -.0529716355144438, -.0980208811401368, 1.15190312990417, -.0980434501171241, -.0990297440797205, -.0989611768448433, 1.15107367264116);
  var v = agxCurve((clamp(log2(max(m * c, vec3f(1e-10))), vec3f(-12.47393), vec3f(4.026069)) + 12.47393) / 16.5);
  // look: a little more contrast and saturation
  let l = lum(v); v = pow(max(v, vec3f(0.)), vec3f(1.14)); v = l + 1.3 * (v - l) + (pow(l, 1.14) - l);
  return sat3(mi * v);
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy); let mx = vec2i(textureDimensions(tC)) - 1; let uv = fc.xy / vec2f(textureDimensions(tC));
  var c = textureLoad(tC, px, 0).rgb;
  // mild sharpening against TAA softness
  let nb = (textureLoad(tC, clamp(px + vec2i(1, 0), vec2i(0), mx), 0).rgb + textureLoad(tC, clamp(px - vec2i(1, 0), vec2i(0), mx), 0).rgb
          + textureLoad(tC, clamp(px + vec2i(0, 1), vec2i(0), mx), 0).rgb + textureLoad(tC, clamp(px - vec2i(0, 1), vec2i(0), mx), 0).rgb) * .25;
  let k = 1. / (1. + lum(c)); let kn = 1. / (1. + lum(nb));
  c = max(c + (c * k - nb * kn) * .3 / k, vec3f(0.));
  let bl = textureSampleLevel(tB, sLin, uv, 0.).rgb;
  c = mix(c, bl, .04);
  // exposure, soft vignette, white balance for the warm low sun
  let q = uv - .5; c *= (1. - dot(q, q) * .3) * view.sunc.w * vec3f(1.07, 1., .9);
  // storm: rain falling in slanted streaks, two layers, over everything
  if (view.ev.x > 0.) {
    let rs = vec2f(textureDimensions(tC)); let p = fc.xy / rs.y; let t = view.cam.w;
    var rn = 0.;
    for (var l = 0; l < 2; l++) {
      let fl = f32(l); let sc = vec2f(90., 3.5) * (1. + fl * .8); let sp = 2.2 + fl * .9;
      let g = vec2f(p.x + p.y * .18, p.y) * sc + vec2f(0., t * sp * sc.y);
      let id = floor(g); let fr = fract(g); let h = h21(id + fl * 17.);
      let on = step(.72, h); let streak = ss(.0, .25, fr.y) * (1. - ss(.25, .55, fr.y)) * (1. - ss(.08, .32, abs(fr.x - .5 + (h - .5) * .5)));
      rn += on * streak * (.6 - fl * .25);
    }
    c = c * (1. - .1 * view.ev.x) + vec3f(.55, .6, .7) * rn * view.ev.x * .22 * (lum(c) + .08);
  }
  c = agx(c);
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;
