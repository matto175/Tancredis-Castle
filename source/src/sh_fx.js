// shaders 4/4: water, light-liquid, crystal and glass (after the lit opaque scene, which they refract and mirror)
const W_FX = W_SCENE_VS + /*wgsl*/`
@group(1) @binding(0) var tScene: texture_2d<f32>; // lit scene behind (copy)
@group(1) @binding(1) var tDepth: texture_depth_2d; // its depth (copy)
@group(1) @binding(2) var tRefl: texture_2d<f32>; // the scene mirrored in the canals' water plane
@group(1) @binding(3) var tSky: texture_2d<f32>;
@group(1) @binding(4) var tEnv: texture_cube<f32>;
@group(1) @binding(5) var tSh0: texture_depth_2d;
@group(1) @binding(6) var tSh1: texture_depth_2d;
@group(1) @binding(7) var tSh2: texture_depth_2d;
@group(1) @binding(8) var tSh3: texture_depth_2d;
@group(1) @binding(9) var tWater: texture_2d<f32>;
@group(1) @binding(10) var sCmp: sampler_comparison;
` + W_SKY + W_SHADOWLIB + W_SHADE + /*wgsl*/`
fn viewZ(uv: vec2f) -> f32 { return view.fwd.w / max(textureLoad(tDepth, vec2i(clamp(uv, vec2f(0.), vec2f(.9999)) * view.res.xy), 0), 1e-7); }
fn worldAt(uv: vec2f, z: f32) -> vec3f { let ndc = uv * vec2f(2., -2.) + vec2f(-1., 1.) - view.jit.xy; return view.cam.xyz + (view.fwd.xyz + view.right.xyz * ndc.x * view.right.w + view.up.xyz * ndc.y * view.up.w) * z; }
fn toUV(p: vec3f) -> vec3f { let c = view.vp * vec4f(p, 1.); return vec3f(c.x / c.w * .5 + .5, .5 - c.y / c.w * .5, c.w); }
// SSR for water off the mirror plane (ring pool, sea): march in growing steps, refine, fade at screen edges
fn ssr(p: vec3f, r: vec3f, nz: f32) -> vec4f {
  var t = .4; var st = .5 + nz * .5; var hit = false; var q = vec3f(0.);
  for (var k = 0; k < ${SSRN}; k++) {
    t += st; q = toUV(p + r * t);
    if (q.z <= 0. || q.x < 0. || q.x > 1. || q.y < 0. || q.y > 1.) { return vec4f(0.); }
    let d = viewZ(q.xy);
    if (q.z > d + .02) { if (q.z - d < max(st * 2.5, 1.5)) { hit = true; } break; }
    st *= ${QL(1.28, 1.48, 1.48)};
  }
  if (!hit) { return vec4f(0.); }
  var lo = t - st; var hi = t;
  for (var k = 0; k < 5; k++) { let m = (lo + hi) * .5; q = toUV(p + r * m); if (q.z > viewZ(q.xy)) { hi = m; } else { lo = m; } }
  q = toUV(p + r * hi);
  let e = min(min(q.x, 1. - q.x), min(q.y, 1. - q.y));
  return vec4f(textureSampleLevel(tScene, sLin, q.xy, 0.).rgb, ss(0., .08, e));
}
struct FO { @location(0) c: vec4f }
`;
// polished stone: screen-space reflections
// full-screen pass: on smooth surfaces march the mirrored ray and replace the sky reflection with what is there
const W_POLISH = W_COMMON + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var sLin: sampler;
@group(0) @binding(2) var tScene: texture_2d<f32>;
@group(0) @binding(3) var tDepth: texture_depth_2d;
@group(0) @binding(4) var tG1: texture_2d<f32>;
@group(0) @binding(5) var tG2: texture_2d<f32>;
@group(0) @binding(6) var tEnv: texture_cube<f32>;
fn viewZ(uv: vec2f) -> f32 { return view.fwd.w / max(textureLoad(tDepth, vec2i(clamp(uv, vec2f(0.), vec2f(.9999)) * view.res.xy), 0), 1e-7); }
fn toUV(p: vec3f) -> vec3f { let c = view.vp * vec4f(p, 1.); return vec3f(c.x / c.w * .5 + .5, .5 - c.y / c.w * .5, c.w); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy); let g1 = textureLoad(tG1, px, 0); let dp = textureLoad(tDepth, px, 0);
  if (dp == 0. || g1.a > .32) { return vec4f(0.); }
  let g2 = textureLoad(tG2, px, 0); if (g2.b > 0. || g2.a > .5) { return vec4f(0.); } // not leaves, not window glass (it has its own)
  let ndc = fc.xy * view.res.zw * vec2f(2., -2.) + vec2f(-1., 1.) - view.jit.xy;
  let ray = view.fwd.xyz + view.right.xyz * ndc.x * view.right.w + view.up.xyz * ndc.y * view.up.w; let rd = normalize(ray);
  let z = view.fwd.w / dp; if (z > 400.) { return vec4f(0.); }
  let N = normalize(g1.xyz); let p = view.cam.xyz + ray * z + N * .02; let nv = max(dot(N, -rd), 1e-3);
  // ray spread by roughness; TAA turns it into blur
  let nz = ign(fc.xy + view.jit.z * 5.588); let nz2 = ign(fc.xy + 71. + view.jit.z * 3.17);
  let R = normalize(reflect(rd, N) + (vec3f(nz, nz2, fract(nz * 7.3 + nz2)) - .5) * g1.a * .5);
  var t = .1; var st = .2 + nz * .2; var hit = false; var q = vec3f(0.);
  for (var k = 0; k < ${SSRN}; k++) {
    t += st; q = toUV(p + R * t);
    if (q.z <= 0. || q.x < 0. || q.x > 1. || q.y < 0. || q.y > 1.) { return vec4f(0.); }
    let d = viewZ(q.xy);
    if (q.z > d + .03) { if (q.z - d < max(st * 2.5, 1.)) { hit = true; } break; }
    st *= ${QL(1.3, 1.5, 1.5)};
  }
  if (!hit) { return vec4f(0.); }
  var lo = t - st; var hi = t;
  for (var k = 0; k < 4; k++) { let m = (lo + hi) * .5; q = toUV(p + R * m); if (q.z > viewZ(q.xy)) { hi = m; } else { lo = m; } }
  q = toUV(p + R * hi);
  let e = min(min(q.x, 1. - q.x), min(q.y, 1. - q.y));
  let F = .06 + .94 * pow(1. - nv, 5.);
  let k = F * (1. - g1.a / .32) * ss(0., .08, e) * g2.r;
  return vec4f((min(textureSampleLevel(tScene, sLin, q.xy, 0.).rgb, vec3f(30.)) - textureSampleLevel(tEnv, sLin, R, g1.a * 5.).rgb) * k, 0.);
}
`;
const W_FX2 = /*wgsl*/`

// water
// uv.x: 0 canal water, 1 indigo light-liquid, 2 sea, 3 cascade sheet
@fragment fn fsWater(i: VO) -> FO {
  let kind = u32(i.uv.x * 255. + .5); let p = i.wp; let fc = i.clip.xy; let suv = fc * view.res.zw;
  let dx = dpdx(p.xz); let dy = dpdy(p.xz); let fw = max(length(dx), length(dy));
  let toC = view.cam.xyz - p; let dist = length(toC); let V = toC / dist; let rd = -V;
  let nz = ign(fc + view.jit.z * 5.588); let r = length(p.xz); let L = view.sun.xyz;
  let pl = lum(pulseAt(r));
  // surface slope from the wave texture at two or three scales
  var sl = vec2f(0.); var rough2 = .0006;
  if (kind == 2u) {
    let dx = dx * 3.; let dy = dy * 3.; // softer than one pixel: the open sea must never sizzle
    // three chop layers, turned and scaled so tiles never align, on a long swell
    let r1 = mat2x2f(.8, .6, -.6, .8); let r2 = mat2x2f(.34, -.94, .94, .34); let tm = view.cam.w;
    // large drifting noise tile; lost fine waves become roughness below
    let a = textureSampleGrad(tNoiseN, sRep, p.xz / 173. + vec2f(.0031, .0017) * tm, dx / 173., dy / 173.).ba - .5;
    let b = r1 * (textureSampleGrad(tNoiseN, sRep, (p.xz * r1) / 67. - vec2f(.004, .0022) * tm, (dx * r1) / 67., (dy * r1) / 67.).rg - .5);
    let c = r2 * (textureSampleGrad(tNoiseN, sRep, (p.xz * r2) / 23. + vec2f(.009, -.005) * tm, (dx * r2) / 23., (dy * r2) / 23.).rg - .5);
    let d = textureSampleGrad(tNoiseN, sRep, p.zx / 7.3 + vec2f(-.017, .02) * tm, dx.yx / 7.3, dy.yx / 7.3).gr - .5;
    // the swell (the same trains that move the mesh), each until finer than a pixel
    let sw = seaWave(p.xz, vec4f(1.) / (vec4f(1.) + sq(fw * 1.3) * vec4f(.034, .09, .233, .616)));
    sl = a * .28 + b * .5 + c * .45 + d * .3 + sw.yz;
    // sub-pixel waves become roughness: far water is a silky sheen, not glitter
    rough2 = .004 + .05 * sat(fw / 3.) + .05 * sat(fw / 14.) + .05 * sat(fw / 60.);
  } else {
    let k = select(1., .45, kind == 1u);
    // three wave-tile layers at unrelated scales and angles, pushed by slow noise into calmer and livelier patches
    let n1 = textureSampleGrad(tNoiseA, sRep, p.xz / 71., dx / 71., dy / 71.).r; let n2 = textureSampleGrad(tNoiseA, sRep, p.zx / 53. + .37, dx.yx / 53., dy.yx / 53.).r;
    let q = p.xz + (vec2f(n1, n2) - .5) * 9.;
    let r1 = mat2x2f(.8, .6, -.6, .8); let r2 = mat2x2f(.34, -.94, .94, .34);
    let a = textureSampleGrad(tWater, sRep, q / 11.3, dx / 11.3, dy / 11.3).rg;
    let b = r1 * textureSampleGrad(tWater, sRep, (q * r1) / 5.9 + .31, (dx * r1) / 5.9, (dy * r1) / 5.9).rg;
    let c = r2 * textureSampleGrad(tWater, sRep, (q * r2) / 3.1 + .7, (dx * r2) / 3.1, (dy * r2) / 3.1).rg;
    sl = (a * .5 + b * .34 + c * .2) * k * (.6 + .9 * n2);
    // the pulse sends a soft ring across the water
    let rw = 22. + 60. * view.pulse.x; sl += normalize(p.xz) * sin((r - rw) * .9) * exp(-sq((r - rw) / 9.)) * .05 * exp(-r / 300.);
    rough2 = .0004 + (.006 * sat(fw / .9) + .004 * sat(fw / 2.5)) * k * k;
  }
  let N = normalize(vec3f(-sl.x, 1., -sl.y)); let nv = max(dot(N, V), 1e-3);
  let F = .02 + .98 * pow(1. - nv, 5.);
  // under the surface: the scene behind, bent and coloured by the water depth
  let zs = viewZ(suv); let zw = 1. / i.clip.w; let thick0 = max(zs - zw, 0.); // fragment w is 1 / view depth
  var uv2 = suv + N.xz * vec2f(1., -1.) * .035 * sat(thick0 * .6) / (1. + dist * .02);
  var z2 = viewZ(uv2); if (z2 < zw) { uv2 = suv; z2 = zs; }
  let bed = worldAt(uv2, z2); let path = max(z2 - zw, 0.) * dist / zw; let depth = max(p.y - bed.y, 0.);
  var under = textureSampleLevel(tScene, sLin, uv2, 0.).rgb; var sig: vec3f; var scat: vec3f; var sA = .2;
  let amb = skyLut(vec3f(0., 1., 0.)) * 1.6 + view.sunc.rgb * .12;
  let shw = shadow(p, vec3f(0., 1., 0.));
  if (kind == 0u) { sig = vec3f(.26, .045, .04); scat = vec3f(.0, .035, .04) * amb; sA = .05; }
  else if (kind == 1u) { sig = vec3f(2.4, 3., 1.3); scat = vec3f(.011, .006, .12) * (.35 + .65 * shw); sA = 2.5; }
  else { sig = vec3f(.4, .08, .06); scat = vec3f(.001, .012, .028) * amb * (1. + 1.4 * sat(p.y * 2. + .15)); sA = .1; } // crests let more light through
  under = under * exp(-sig * (path + depth * .6)) + scat * (1. - exp(-sA * path));
  // what it mirrors
  let R = reflect(rd, N); var refl: vec3f;
  let Rs = normalize(vec3f(R.x, abs(R.y) + .003, R.z));
  if (kind < 2u && abs(p.y - ${WATER}) < .05 && view.misc.y < .5 && view.pulse.w > 0.) {
    let ruv = vec2f(suv.x, 1. - suv.y) + N.xz * vec2f(1., 1.) * (.05 / (1. + dist * .015)) * vec2f(view.res.y / view.res.x, 1.) * 2.;
    refl = textureSampleLevel(tRefl, sLin, ruv, 0.).rgb;
    // pulse.w fades the mirror into the sky's reflection on the way up
    if (view.pulse.w < 1.) { refl = mix(textureSampleLevel(tEnv, sLin, Rs, 1.).rgb, refl, view.pulse.w); }
  } else {
    // sky blurred by sub-pixel waves: far water a calm sheen
    refl = textureSampleLevel(tEnv, sLin, Rs, clamp(sqrt(rough2) * 9., 0., 3.5)).rgb;
    if (LV < 2 && view.misc.y < .5 && fw < 1.5) { let h = ssr(p, Rs, nz); refl = mix(refl, h.rgb, h.a * (1. - ss(.7, 1.5, fw))); }
  }
  if (kind == 1u) { refl *= vec3f(.2, .17, .5); } // dark mirror, violet cast
  var col = mix(under, refl, select(F, min(F, .55), kind == 1u));
  // dark line where water meets stone
  if (kind < 2u) { col *= mix(.5, 1., ss(0., .35, thick0)); }
  // sun glitter
  let sh = shw;
  let H = normalize(V + L); let a = max(rough2 * 2., .0008);
  col += view.sunc.rgb * sh * min(ggxD(sat(dot(N, H)), sqrt(a)) * ggxV(sat(dot(N, L)), nv, sqrt(a)), select(90., 30., kind == 2u)) * sat(dot(N, L)) * (.02 + .98 * pow(1. - sat(dot(V, H)), 5.));
  if (kind == 1u) {
    // light-liquid: three layers of violet and rose filaments drifting round the ring at their own speeds, stirred by a
    // swirl, with brightness waves and breathing. Whole-number texture turns around the ring avoid a seam where the angle wraps.
    let nt = select(select(select(82., 56., r < 80.), 46., r < 65.), 25., r < 50.); let an = atan2(p.z, p.x) / (2. * PI); let rv = r / 8.;
    let fdx = vec2f(fw / 30., 0.); let fdy = vec2f(0., fw / 30.); let tm = view.cam.w; let fl = tm * .03;
    let sw = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(nt * .07), rv * .11) + vec2f(fl * .5, tm * .011), fdx, fdy).rg - .5;
    let f1 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(nt * .13), rv * .27) + vec2f(fl, tm * .004) + sw * .14 + sl * .05, fdx, fdy).b;
    let f2 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(nt * .21), rv * .43) + vec2f(fl * 1.7, .3 - tm * .009) - sw * .11 - sl * .04, fdx, fdy).b;
    let f3 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(nt * .47), rv * .93) + vec2f(fl * 2.8, tm * .017) + sw * .2, fdx * 2., fdy * 2.).b;
    let wave = .72 + .28 * sin(r * .22 - tm * 1.5 + sw.x * 5.);
    let glow = (f1 * .9 + f2 * .7 + f3 * .4) * wave * (.4 + 1.6 * exp(-r / 45.) + .35 * view.pulse.y + .8 * view.pulse.z) * (1. + 4. * pl) + pl * 1.2;
    col += mix(vec3f(.5, .28, 1.), vec3f(1., .4, .62), sat(f2 * 1.4)) * glow * .6 * (1. - F);
  } else if (kind == 2u) {
    // thin foam at the shore
    let f = textureSampleGrad(tNoiseA, sRep, p.xz / 5. + vec2f(view.cam.w * .02), dx / 5., dy / 5.);
    let edge = ss(.55, .0, depth + (f.r - .5) * .5 + .12 * sin(view.cam.w * .7 + f.a * 6.)) * ss(.25, .6, f.g + f.a * .5);
    col = mix(col, amb * .55 + view.sunc.rgb * sh * .22, edge * .8);
  } else { col += vec3f(.4, .9, .85) * pl * .25; }
  return FO(vec4f(aerial(col, view.cam.xyz, rd, dist), 1.));
}
// podium falls: sheet, foam, mist (uv.x = 3, 4, 5; see meshCascades)
@fragment fn fsCascade(i: VO) -> FO {
  let kind = u32(i.uv.x * 255. + .5); let p = i.wp; let fc = i.clip.xy; let toC = view.cam.xyz - p; let dist = length(toC); let V = toC / dist; let r = length(p.xz);
  // whole-number texture turns around the tier: no seam where the angle wraps
  let an = atan2(p.z, p.x) / (2. * PI); let cir = 2. * PI * round(r); let t = view.cam.w;
  let dq = vec2f(length(dpdx(p)), length(dpdy(p)));
  var N = normalize(i.n); if (dot(N, V) < 0.) { N = -N; }
  let sh = shadow(p, N); let pl = lum(pulseAt(r)); let live = .4 + 1.6 * exp(-r / 45.) + .35 * view.pulse.y + .8 * view.pulse.z;
  // froth and mist: droplets, pale lilac in sky and sun light, with a little of the liquid's glow
  let froth = vec3f(.5, .45, .8) * (skyLut(vec3f(0., 1., 0.)) * .8 + view.sunc.rgb * (.02 + .07 * sh)) + vec3f(.42, .25, 1.) * (.1 + .1 * live) * (1. + 3. * pl);
  var col: vec3f; var al: f32;
  if (kind == 3u) {
    let h = i.uv.z * 16.; let hb = i.uv.y * 16.; // metres fallen from the lip, metres left to the pool
    // falling liquid speeds up: patterns laid out in (angle, tau = sqrt(h)) slide along tau, fine and slow at the lip,
    // long and fast at the foot
    let tau = sqrt(h + .06); let gv = dq.y * .5 / tau;
    let a = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / 3.3), tau * .21 - t * .13), vec2f(dq.x / 3.3, 0.), vec2f(0., gv * .21));
    let b = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / .8), tau * .5 - t * .3), vec2f(dq.x / .8, 0.), vec2f(0., gv * .5));
    // strands the sheet gathers into, fixed across the fall
    let s1 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / 1.7), tau * .035 - t * .02), vec2f(dq.x / 1.7, 0.), vec2f(0., gv * .035));
    // the moat's filaments, drawn out and sliding down
    let f1 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / 16.), tau * .07 - t * .045), vec2f(dq.x / 16., 0.), vec2f(0., gv * .07)).b;
    let f2 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / 9.5) + .3, tau * .12 - t * .08), vec2f(dq.x / 9.5, 0.), vec2f(0., gv * .12)).b;
    // a smooth dark film at the lip; falling, it breaks into glowing frothy ropes with thin dark film between
    let grow = ss(.15, 3.5, h); let rope = ss(.42, .7, s1.r + (b.r - .5) * .35) * grow; let thin = ss(.55, .3, s1.r + (a.r - .5) * .3) * grow;
    let tg = normalize(vec3f(-N.z, 0., N.x)); N = normalize(N + tg * ((a.r - .5) * .3 + (b.a - .5) * (.12 + .75 * grow)) + vec3f(0., (b.r - .5) * .25 * grow, 0.));
    let nv = max(dot(N, V), 1e-3); let F = .03 + .97 * pow(1. - nv, 5.);
    // the same liquid as the moat: indigo body, glowing filaments, violet-cast mirror, only a narrow sun glint
    col = vec3f(.011, .006, .12) * (.35 + .65 * sh) * (.75 + .5 * a.r) * (1. - .5 * thin);
    // filaments show little in the squeezed film at the lip
    let glow = (f1 * .9 + f2 * .7) * live * (1. + 4. * pl) * mix(.25, 1., ss(.2, 2.5, h)) + pl * 1.2;
    col += mix(vec3f(.5, .28, 1.), vec3f(1., .4, .62), sat(f2 * 1.4)) * glow * .45 * (.55 + .7 * rope);
    col += vec3f(.4, .25, 1.) * rope * (.07 + .16 * b.r) * (.8 + .5 * view.pulse.y);
    col = col * (1. - F) + sky(reflect(-V, N), false) * vec3f(.2, .17, .5) * min(F, .55) * (1. - .6 * rope);
    col += view.sunc.rgb * sh * sunBRDF(N, V, vec3f(.01, .005, .05), vec3f(.03), mix(.1, .32, rope)) * .2;
    // the last stretch before the pool churns to froth
    let foot = ss(min(2.4, .28 * (h + hb)) * (.55 + .9 * a.r), 0., hb) * (.72 + .2 * rope + .28 * b.a);
    col = mix(col, froth * (.7 + .5 * b.r), sat(foot));
    // one continuous sheet hiding the marble (a tenth of sunlit marble showing turns it pale); clear only at the slot
    al = min(.95 + .05 * a.r, 1.) * mix(.7, 1., ss(0., .12, h));
  } else if (kind == 4u) {
    // foam: thick where the sheet lands, torn into patches further out
    let tv = i.uv.z; let gr = dq.x / 4.;
    let n1 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / 1.9), tv * .7 - t * .09), vec2f(dq.x / 1.9, 0.), vec2f(0., gr * .7));
    let n2 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / .6) + .3, tv * 2.2 - t * .23), vec2f(dq.x / .6, 0.), vec2f(0., gr * 2.2));
    let dens = sq(1. - tv); let cov = n1.r * .65 + n2.a * .45 + .12 * sin(t * 1.7 + n1.a * 9.) * dens;
    al = ss(.66 - .6 * dens, .8 - .45 * dens, cov) * ss(1., .8, tv) * (.55 + .45 * i.uv.y) * .9;
    col = froth * (.75 + .5 * n2.r) * (.8 + .3 * dens);
  } else {
    // mist: billows rising and thinning; soft against stone, gone where a shell is seen edge-on
    let tv = i.uv.z;
    let m1 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / 6.), tv * .5 - t * .05), vec2f(dq.x / 6., 0.), vec2f(0., dq.y * .12)).r;
    let m2 = textureSampleGrad(tNoiseA, sRep, vec2f(an * round(cir / 2.3) + .4, tv * 1.1 - t * .11), vec2f(dq.x / 2.3, 0.), vec2f(0., dq.y * .3)).r;
    var soft = 1.; if (view.misc.y < .5) { soft = sat((viewZ(fc * view.res.zw) - 1. / i.clip.w) / .8); }
    al = ss(.2 + .75 * tv, .7 + .55 * tv, m1 * .75 + m2 * .65 + .1) * (1. - tv * tv) * ss(.08, .5, abs(dot(N, V))) * soft * (.3 + .3 * i.uv.y);
    col = froth * (.8 + .4 * m2);
  }
  return FO(vec4f(aerial(col, view.cam.xyz, -V, dist) * al, al));
}

// crystal
// clear quartz: refracted in, across and out (or mirrored inside), so each facet shows a shifted piece of the
// world behind. uv.x: 0 prism, 1 petal or panel.
const HEXN = array<vec2f, 6>(vec2f(1., 0.), vec2f(.5, .866), vec2f(-.5, .866), vec2f(-1., 0.), vec2f(-.5, -.866), vec2f(.5, -.866));
fn behind(pe: vec3f, d: vec3f, zf: f32, disp: f32, far: f32) -> vec3f {
  let env = textureSampleLevel(tEnv, sLin, d, 0.).rgb;
  if (view.misc.y > .5) { return env; }
  let q = toUV(pe + d * far); let s0 = toUV(pe);
  if (q.z <= 0.) { return env; }
  let e = min(min(q.x, 1. - q.x), min(q.y, 1. - q.y)); if (e <= 0.) { return env; }
  if (viewZ(q.xy) < zf - .5) { return env; }
  // red and blue leave at slightly different angles: spectral fringes
  var o = q.xy - s0.xy; o = o / max(length(o), 1e-4) * min(length(o), .05) * disp;
  let c = vec3f(textureSampleLevel(tScene, sLin, q.xy - o, 0.).r, textureSampleLevel(tScene, sLin, q.xy, 0.).g, textureSampleLevel(tScene, sLin, q.xy + o, 0.).b);
  return mix(env, c, ss(0., .06, e));
}
@fragment fn fsCrystal(i: VO) -> FO {
  let p = i.wp; let fc = i.clip.xy; let toC = view.cam.xyz - p; let dist = length(toC); let V = toC / dist; let rd = -V;
  var N = normalize(i.n); let slab = i.uv.x > .002; if (dot(N, V) < 0.) { N = -N; }
  let fwp = max(length(dpdx(p)), length(dpdy(p)));
  let qc = vec4f(-i.q.xyz, i.q.w); let size = i.sc.w; let s = clamp(size / 100., .08, 1.4);
  let nz = ign(fc + view.jit.z * 5.588);
  // LOD cross-fade, the G-buffer's dither
  let fb = i.mi.y;
  if ((fb & 127u) != 127u) { let f = f32(fb & 127u) / 127.; if ((fb & 128u) != 0u) { if (nz < 1. - f) { discard; } } else if (nz >= f) { discard; } }
  let nv = max(dot(N, V), 1e-3); let F = .045 + .955 * pow(1. - nv, 5.);
  let R = reflect(rd, N);
  var col = textureSampleLevel(tEnv, sLin, R, .6).rgb * F;
  let sh = shadow(p, N); let L = view.sun.xyz; let H = normalize(V + L);
  col += view.sunc.rgb * sh * (min(ggxD(sat(dot(N, H)), .01), 300.) + min(ggxD(sat(dot(N, H)), .3), 8.)) * .25 * sat(dot(N, L)) * F;
  // into the crystal
  let d1 = refract(rd, N, 1. / 1.52); let o = i.lp * i.sc.xyz; let dl = qrot(qc, d1); let nl = qrot(qc, N);
  var tex = 1.; var ne = -nl;
  if (!slab) {
    let ap = max(dot(o.xz, normalize(nl.xz + 1e-5)), .3); tex = 1e9;
    for (var k = 0; k < 6; k++) { let dn = dot(dl.xz, HEXN[k]); if (dn > 1e-4) { let t = (ap * 1.02 - dot(o.xz, HEXN[k])) / dn; if (t < tex) { tex = t; ne = vec3f(HEXN[k].x, .05, HEXN[k].y); } } }
    tex = min(tex, ap * 6.);
  } else {
    // petals exit through their far face's mirrored facet; thin panels through a nearly flat back
    ne = normalize(vec3f(nl.x * .45, nl.y * .45, -nl.z)); if (size < 6.) { ne = normalize(vec3f(nl.x * .25, nl.y * .25, -sign(nl.z))); }
    tex = i.uv.y * i.sc.x / max(abs(dl.z), .25);
  }
  let oe = o + dl * tex; let pe = p + d1 * tex; let nw = qrot(i.q, normalize(ne));
  var d2 = refract(d1, -nw, 1.52); var inner = 0.;
  if (dot(d2, d2) < .5) { d2 = reflect(d1, -nw); inner = 1.; } // total internal reflection
  // a tone per facet from its normal (offsets keep floor() off exact zeros, which made facets sizzle)
  let facet = h21(floor(nw.xz * 3.1 + nw.y * 1.7 + .23) + floor(nl.xz * 2.3 + .37));
  // the crystals breathe with the city and flash as the pulse passes
  let live = .55 + .45 * view.pulse.y + 1.2 * view.pulse.z; let pu = pulseAt(length(p.xz));
  let tint = mix(vec3f(.86, 1., .99), vec3f(.95, .9, 1.03), facet) * exp(-tex * vec3f(.012, .003, .004));
  var bg: vec3f;
  if (slab && size < 6. && view.misc.y < .5) {
    // thin panels: the scene behind nudged by facet tilt, a hint of dispersion
    let q = fc * view.res.zw + vec2f(nl.x, -nl.y) * .045 / (1. + dist * .08); let e = vec2f(nl.x, -nl.y) * .0012;
    bg = vec3f(textureSampleLevel(tScene, sLin, q - e, 0.).r, textureSampleLevel(tScene, sLin, q, 0.).g, textureSampleLevel(tScene, sLin, q + e, 0.).b) * tint;
  } else { bg = behind(pe, d2, 1. / i.clip.w, select(.012 + .06 * sq(1. - nv), .012, slab), select(90., 3.5, slab)) * tint * mix(1., .8, inner); }
  // fracture veils: planes of trapped light, each catching the sky at its own angle
  var veil = 0.;
  for (var k = 0; k < 2; k++) {
    let pn = normalize(select(vec3f(.62, .55, .56), vec3f(-.5, .7, .51), k == 1)); let sp = select(17., 11., k == 1) * (.4 + s * 1.2);
    let a0 = dot(o, pn) / sp; let a1 = dot(oe, pn) / sp;
    if (floor(a0) != floor(a1)) {
      let pk = max(floor(a0), floor(a1)); let t = (pk * sp - dot(o, pn)) / dot(dl, pn); let hp = o + dl * t;
      let m = textureSampleLevel(tNoiseA, sRep, (hp.xy + hp.zz * vec2f(.6, -.4)) / (9. * (.4 + s)) + pk * .37 + view.cam.w * vec2f(.004, .011), 1.5); // veils drift slowly upwards
      let v = ss(.5, .72, m.r) * (.5 + .5 * m.b) + .25 * ss(.6, .9, m.g);
      veil += v * (.35 + .65 * pow(1. - abs(dot(dl, pn)), 2.));
      bg += textureSampleLevel(tEnv, sLin, qrot(i.q, reflect(dl, pn)), 1.5).rgb * v * .3;
    }
  }
  // core: a soft white glow along the axis, strongest low, breathing
  if (!slab) {
    let dxz = max(dot(dl.xz, dl.xz), 1e-4); let tc = clamp(-dot(o.xz, dl.xz) / dxz, 0., tex); let pc = o + dl * tc;
    let ap = max(dot(o.xz, normalize(nl.xz + 1e-5)), .3);
    // light climbs the axis in slow waves
    let g = exp(-dot(pc.xz, pc.xz) / sq(ap * .3)) * (.2 + .8 * exp(-max(pc.y / size, 0.) * 2.6)) * live * (.72 + .28 * sin(pc.y * .16 - view.cam.w * 1.1));
    bg += vec3f(.88, .97, 1.) * g * view.sunc.g * .3;
  }
  // the great crystal answers each pulse: clear most of the cycle, a white glow builds in the whole body over the last
  // seconds, then one bright flash gone in half a second as the ring leaves. Added light, never a tint.
  var memit = vec3f(0.);
  if (!slab && dot(p.xz, p.xz) < 100.) {
    let tp = view.pulse.x; let amt = select(pow(ss(${PULSE - 4.5}, ${PULSE}., tp), 1.6), 2.3 * exp(-tp / .2), tp < ${PULSE / 2}.);
    // brighter veils drift up through it, so the glow is alive
    let pm = o + dl * tex * .4; let fa = atan2(pm.z, pm.x) / (2. * PI); let tm = view.cam.w;
    let f1 = textureSampleLevel(tNoiseA, sRep, vec2f(fa * 2. + pm.y * .004, pm.y * .011 - tm * .035), 1.).b;
    let f2 = textureSampleLevel(tNoiseA, sRep, vec2f(fa * 3. + .4 - pm.y * .006, pm.y * .019 - tm * .06), 1.).b;
    // added below, once the rest of the body is in place
    memit = vec3f(.92, .97, 1.) * amt * (.42 + .5 * f1 + .35 * f2 + .5 * veil) * view.sunc.g * .17;
  }
  // light caught in the body: quartz is never dark; grows with distance as inner planes average out
  bg += (view.sunc.rgb * (.03 + .06 * sh) + skyLut(vec3f(0., 1., 0.)) * .04) * vec3f(.92, .98, 1.) * (.5 + 1.5 * veil) * select(1., .4, slab) * (1. + min(dist / 300., 1.5)) * (.55 + .6 * live);
  bg += pu * vec3f(.9, .95, 1.) * (.8 + 2. * veil) * select(1., .5, slab && size < 6.);
  // internal planes on two lattices: some cells mirror another part of the world (horizon, zenith, ground), giving
  // depth; a rare one flashes with the sun
  {
    let pm = o + dl * tex * .45; let Ls = clamp(size * .05, .35, 5.);
    for (var k = 0; k < 2; k++) {
      // long axial planes, lit, dark or clear, each fading across its width like a mirror turning away
      let a1 = HEXN[k * 2]; let u = vec2f(dot(pm.xz, a1) + pm.y * .22, pm.y * .3 - dot(pm.xz, vec2f(-a1.y, a1.x)) * .4) / (Ls * (1. + f32(k) * .7)) + f32(k) * 7.3 + dot(dl.xz, a1) * 1.5;
      let id = floor(u) + f32(k) * 17.; let hs = h22(id); let fu = fract(u); let kind = h21(id + 9.);
      // each plane brightens and dims on its own slow clock
      let ramp = mix(fu.x, 1. - fu.x, step(.5, hs.y)) * ss(0., .08, min(fu.y, 1. - fu.y)) * (.72 + .28 * sin(view.cam.w * (.5 + hs.x) + hs.y * 40.)); let on = select(1., 0., slab);
      bg = mix(bg, bg * vec3f(.3, .36, .46), ss(.72, .8, kind) * ramp * .8 * on);
      bg += (view.sunc.rgb * (.05 + .16 * sh) + skyLut(vec3f(view.sun.x, .3, view.sun.z)) * .12) * ss(.3, .22, kind) * ramp * (.5 + hs.x) * on;
    }
  }
  bg += memit;
  // sun-side facets bright, the others deep
  let ft =.55 + .8 * sat(dot(N, normalize(vec3f(L.x, .25, L.z))) * .5 + .5) + select(0., .5 * (facet - .5), slab);
  bg *= ft; col *= .7 + .5 * ft;
  // spectral fringes at grazing angles; facet sparkle on small panels
  col += (.5 + .5 * cos(6.283 * (dot(p, vec3f(.21, .13, .17)) + vec3f(0., .33, .67)))) * pow(1. - nv, 4.) * lum(textureSampleLevel(tEnv, sLin, R, 1.).rgb) * .22;
  if (slab && size < 6.) { col += textureSampleLevel(tEnv, sLin, R, 0.).rgb * (.08 + .5 * facet * facet); }
  // slightly rounded long edges catch the brightest sky
  if (!slab) {
    let ap = max(dot(o.xz, normalize(nl.xz + 1e-5)), .3); let an = atan2(o.z, o.x) / (PI / 3.); let ed = (.5 - abs(fract(an) - .5)) * (PI / 3.) * ap * 1.15;
    col += (textureSampleLevel(tEnv, sLin, normalize(vec3f(view.sun.x, .25, view.sun.z) + N), 1.).rgb * .55 + view.sunc.rgb * .05 * sh) * sat((min(ed + fwp * .5, .07) - max(ed - fwp * .5, -.07)) / fwp);
  }
  // forward scattering when standing against the sun
  bg += view.sunc.rgb * (.03 + .1 * veil) * pow(sat(dot(rd, L)), 5.) * (.4 + .6 * sh);
  col += bg * (1. - F);
  return FO(vec4f(aerial(col, view.cam.xyz, rd, dist), 1.));
}
// thin glass (domes): mirror at grazing angles, clear face-on
@fragment fn fsGlass(i: VO) -> FO {
  let p = i.wp; let toC = view.cam.xyz - p; let dist = length(toC); let V = toC / dist;
  var N = normalize(i.n); if (dot(N, V) < 0.) { N = -N; }
  let nv = max(dot(N, V), 1e-3); let F = .13 + .87 * pow(1. - nv, 4.);
  let R = reflect(-V, N);
  var refl = textureSampleLevel(tEnv, sLin, R, .3).rgb * (.8 + .5 * h21(floor(i.lp.xz * .7) + floor(i.lp.yy * .5)));
  // faint thin-film colour
  refl *= 1. + .07 * cos(7. * nv + vec3f(0., 2.1, 4.2));
  let sh = shadow(p, N); let H = normalize(V + view.sun.xyz);
  var col = refl * F + view.sunc.rgb * sh * min(ggxD(sat(dot(N, H)), .012), 200.) * .25 * sat(dot(N, view.sun.xyz)) * F;
  col += vec3f(.55, .8, .78) * .02 * view.sunc.g;
  let al = sat(F + .1); let fa = f32(i.mi.y & 127u) / 127.; // fa: this LOD's share during a cross-fade
  return FO(vec4f(aerial(col / al, view.cam.xyz, -V, dist) * al, al) * fa);
}
`;
