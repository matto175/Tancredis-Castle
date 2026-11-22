// generators: trees, shrubs, vines; walls with arched bays, villas, halls, glass domes
const rUnit = (rng) => { const z = rng() * 2 - 1, a = rng() * TAU, s = sqrt(1 - z * z); return [s * cos(a), z, s * sin(a)]; };
// leaf cards around c, facing out of the crown, shaded with the canopy normal (from `ctr`) and darker inside, so the
// crown reads as a volume. o: tile2 / frac2 (second tile for a share of cards), flat (pine)
function blob(mb, rng, c, rc, n, size, tile, ctr, R, o = {}) {
  for (let i = 0; i < n; i++) {
    const d = rUnit(rng), k = rc * pow(rng(), 0.4), p = [c[0] + d[0] * k, c[1] + d[1] * k * (o.flat || 1), c[2] + d[2] * k];
    const N = vnorm([p[0] - ctr[0], p[1] - ctr[1] + 0.35 * R, p[2] - ctr[2]]), j = rUnit(rng);
    const cn = vnorm([N[0] + j[0] * 0.8, N[1] + j[1] * 0.8, N[2] + j[2] * 0.8]);
    const rt = vnorm(vcross([0.01, 1, 0.02], cn)), up = vcross(cn, rt), s = size * (0.75 + 0.5 * rng()), dist = hypot(p[0] - ctr[0], p[1] - ctr[1], p[2] - ctr[2]) / R;
    mb.mat = M.LEAF + (o.tile2 !== undefined && rng() < o.frac2 ? o.tile2 : tile); mb.ec = rng() * 255 | 0;
    mb.card(p, [rt[0] * s, rt[1] * s, rt[2] * s], [up[0] * s, up[1] * s, up[2] * s], N, clamp(0.28 + 0.78 * sstep(0.15, 1, dist), 0, 1));
  }
}
// tree: leaning trunk, forking boughs, leaf clusters at twig ends; all LODs share one skeleton (same seed)
const SPECIES = {
  olive: { trunk: 2.2, r0: 0.36, lean: 0.5, boughs: 5, spread: 52, len: 3.9, twigs: 5, gnarl: 0.75, lift: 0.12, tile: LT.OLIVE, cards: 34, size: 0.5, clump: 1.35 },
  plane: { trunk: 4.0, r0: 0.42, lean: 0.2, boughs: 6, spread: 44, len: 5.6, twigs: 5, gnarl: 0.45, lift: 0.2, tile: LT.BROAD, cards: 34, size: 0.66, clump: 1.9 },
  pine: { trunk: 9, r0: 0.42, lean: 0.25, boughs: 7, spread: 66, len: 4.8, twigs: 4, gnarl: 0.35, lift: 0.3, tile: LT.PINE, cards: 32, size: 0.72, clump: 1.7, flat: 0.5 },
  bloom: { trunk: 1.7, r0: 0.3, lean: 0.6, boughs: 6, spread: 58, len: 3.6, twigs: 5, gnarl: 0.5, lift: 0.18, tile: LT.BLOSSOM, tile2: LT.BROAD, frac2: 0.25, cards: 30, size: 0.5, clump: 1.35 },
};
// LOD 4 (Low only, for forests on phones): every third cluster, one-segment trunk, ~20 triangles
function meshTree(seed, P, lod) {
  const mb = new MB(4096), rs = RNG(seed), tips = [], sides = [[8, 6, 4], [6, 4, 0], [5, 0, 0], [3, 0, 0], [3, 0, 0]][lod];
  const limb = (p, d, len, rad, lvl) => {
    const n = lvl ? 3 : 4, pts = [[p[0], p[1], p[2], rad]]; let q = p, dir = d;
    for (let i = 1; i <= n; i++) {
      dir = vnorm([dir[0] + (rs() - 0.5) * P.gnarl, dir[1] + (rs() - 0.5) * P.gnarl * 0.5 + (lvl ? P.lift : 0), dir[2] + (rs() - 0.5) * P.gnarl]);
      q = [q[0] + dir[0] * len / n, q[1] + dir[1] * len / n, q[2] + dir[2] * len / n]; pts.push([q[0], q[1], q[2], rad * (1 - 0.5 * i / n)]);
    }
    if (sides[lvl]) { mb.mat = M.BARK; mb.tube(lod > 3 ? [pts[0], pts[n]] : pts, sides[lvl], lod < 4); }
    return { q, dir, pts };
  };
  const tr = limb([0, -0.4, 0], vnorm([(rs() - 0.5) * P.lean, 1, (rs() - 0.5) * P.lean]), P.trunk + 0.4, P.r0, 0), a0 = rs() * TAU;
  for (let b = 0; b < P.boughs; b++) {
    const a = a0 + (b + rs() * 0.5) / P.boughs * TAU, sp = P.spread * (0.75 + 0.5 * rs()) * DEG;
    const d = vnorm([sin(sp) * cos(a) + tr.dir[0] * 0.3, cos(sp), sin(sp) * sin(a) + tr.dir[2] * 0.3]);
    const bo = limb(tr.pts[tr.pts.length - 1 - (b % 2)], d, P.len * (0.8 + 0.4 * rs()), P.r0 * 0.5, 1);
    for (let k = 0; k < P.twigs; k++) {
      const f = bo.pts[1 + (k % 3)], ta = rs() * TAU, td = vnorm([d[0] * 0.5 + cos(ta) * 0.8, 0.3 + rs() * 0.5, d[2] * 0.5 + sin(ta) * 0.8]);
      const tw = limb(f, td, P.len * 0.5 * (0.7 + 0.6 * rs()), P.r0 * 0.2, 2); tips.push(tw.q, tw.pts[2]);
    }
    tips.push(bo.q);
  }
  const ctr = [0, 0, 0]; for (const t of tips) { ctr[0] += t[0] / tips.length; ctr[1] += t[1] / tips.length; ctr[2] += t[2] / tips.length; }
  let R = 0; for (const t of tips) R = max(R, hypot(t[0] - ctr[0], t[1] - ctr[1], t[2] - ctr[2])); R += P.clump;
  // each cluster has its own seed, so coarser LODs keep the finer one's first cards, only larger: a level change thins
  // the crown instead of reshuffling it. Low: cards smaller (LEAFK); the material cuts leaves fatter to compensate.
  const nC = [P.cards, ceil(P.cards / 3), max(1, round(P.cards / 10)), 1, 1][lod], sz = P.size * [1, 1.6, 2.7, 4.6, 7.6][lod] * LEAFK;
  tips.forEach((t, ti) => { if (lod > 2 && ti % (lod > 3 ? 9 : 3)) return; blob(mb, RNG(seed * 7919 + ti * 131 + 17), t, P.clump, nC, sz, P.tile, ctr, R, P); });
  return mb.build();
}
// Italian cypress: dark core wrapped in upright sprays
function meshCypress(seed, lod) {
  const mb = new MB(4096), rng = RNG(seed), H = 15, R = 1.3, rr = (t) => R * pow(sin(PI * pow(t, 0.5)), 0.75) * (1 - 0.3 * t) + 0.05;
  mb.mat = M.BARK; if (lod < 4) mb.tube([[0, -0.4, 0, 0.2], [0, 1.2, 0, 0.17]], lod === 3 ? 3 : 5, false);
  mb.mat = M.CORE; const prof = [], np = lod > 3 ? 3 : lod === 3 ? 4 : 9; for (let i = 0; i <= np; i++) { const t = i / np; prof.push([rr(0.04 + t * 0.94) * 0.66, (lod > 3 && !i ? -0.4 : 0.7) + t * (H - 1.2)]); }
  mb.lathe(prof, { seg: lod > 3 ? 3 : lod === 3 ? 4 : lod ? 5 : 8, ao: () => 0.45 });
  // LOD 4 (Low): six tall sprays
  const n = [900, 260, 60, 18, 6][lod], w = 0.36 * [1, 1.7, 3.2, 5.5, 5.5][lod] * LEAFK, h = 0.52 * [1, 1.7, 3.2, 5.5, 10][lod] * LEAFK;
  for (let i = 0; i < n; i++) {
    const t = 0.03 + 0.95 * pow(rng(), 0.85), a = rng() * TAU, r = rr(t) * (0.78 + 0.2 * rng()), c = cos(a), s = sin(a), lean = 0.2 + 0.25 * rng();
    const up = vnorm([c * lean, 1, s * lean]), rt = [-s, 0, c], N = vnorm([c, 0.35, s]);
    mb.mat = M.LEAF + LT.CYPRESS; mb.ec = rng() * 255 | 0;
    mb.card([c * r, 0.5 + t * (H - 0.9), s * r], [rt[0] * w, 0, rt[2] * w], [up[0] * h, up[1] * h, up[2] * h], N, 0.5 + 0.5 * rng() * (0.5 + 0.5 * t));
  }
  return mb.build();
}
// shrub or flower mound: hollow low dome of cards (o.up: upright cards, the lavender's spikes)
function meshShrub(seed, R, H, tile, n, size, o = {}) {
  const mb = new MB(512), rng = RNG(seed);
  for (let i = 0; i < n; i++) {
    const d = rUnit(rng); d[1] = abs(d[1]); const k = 0.55 + 0.45 * rng(), p = [d[0] * R * k, 0.12 + d[1] * H * k, d[2] * R * k], N = vnorm([d[0], d[1] + 0.5, d[2]]), j = rUnit(rng);
    const cn = o.up ? vnorm([d[0] + j[0] * 0.4, 0.05, d[2] + j[2] * 0.4]) : vnorm([N[0] + j[0] * 0.7, N[1] + j[1] * 0.5, N[2] + j[2] * 0.7]);
    const rt = vnorm(vcross([0.01, 1, 0.02], cn)), up = vcross(cn, rt), s = size * (0.8 + 0.4 * rng());
    mb.mat = M.LEAF + (o.tile2 !== undefined && rng() < o.frac2 ? o.tile2 : tile); mb.ec = rng() * 255 | 0;
    mb.card(p, [rt[0] * s, rt[1] * s, rt[2] * s], [up[0] * s, up[1] * s, up[2] * s], N, 0.4 + 0.6 * k * (0.4 + 0.6 * d[1]));
  }
  return mb.build();
}
// vine: a mass lying on a wall (+z away from it), origin at the wall's top outer edge. Half the cards are a two-layer
// carpet on the face; a sixth each: flat on top, propped on top, trailing fringe below. The face is 4-10 cm behind
// z = 0 down to a cornice ~1 m below. Card i is the same at every LOD (coarser keeps the first n, `big` x larger).
// Cards are rolled and stretched (`roll`): same-way-up squares read as blocks.
const roll = (r, u, a, sr, su) => { const c = cos(a), s = sin(a); return [[(r[0] * c + u[0] * s) * sr, (r[1] * c + u[1] * s) * sr, (r[2] * c + u[2] * s) * sr], [(u[0] * c - r[0] * s) * su, (u[1] * c - r[1] * s) * su, (u[2] * c - r[2] * s) * su]]; };
function meshVine(seed, W, drop, n, flower, big = 1) {
  const mb = new MB(512), rng = RNG(seed), LEAF = M.LEAF + LT.VLEAF, BLOSSOM = M.LEAF + LT.VBLOSSOM;
  for (let i = 0; i < n; i++) {
    // evenly spread, not random: a carpet must have no holes
    const R = [rng(), rng(), rng(), rng(), rng(), rng(), rng()], u = i * 0.6180339 + R[0] * 0.12, x = (u - floor(u) - 0.5) * W, kind = i % 6;
    // how far down the mass reaches, varying along the wall
    const D = drop * (0.35 + 0.65 * (0.5 + 0.5 * sin(x * 2.3 + seed) * sin(x * 5.1 + seed * 2))), hs = 0.37 * big * (0.85 + 0.3 * R[2]);
    const zf = (y) => (y > -1.45 ? 0.1 : -0.04) + 0.05 * R[4];
    // card with plane normal nn, rolled by `a`
    const flat = (p, nn, a, hw, hh, N, ao) => { const rt = vnorm(vcross(abs(nn[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0], nn)), up = vcross(nn, rt), ax = roll(rt, up, a, hw, hh); mb.card(p, ax[0], ax[1], N, ao); };
    mb.ec = R[6] * 255 | 0;
    if (kind === 1) { // lying on the top, a little over its outer edge
      const a = R[3] * TAU, t = 0.12 + 0.22 * R[5];
      mb.mat = R[6] < flower ? BLOSSOM : LEAF;
      flat([x, 0.05 + 0.05 * R[1], -0.2 + 0.2 * (R[4] - 0.5)], vnorm([sin(a) * t, 1, cos(a) * t]), R[5] * TAU, hs, hs, [0, 1, 0.35], 1);
    } else if (kind === 5) { // propped on the top at a low angle (upright cards are paper-thin from above)
      const yaw = (R[3] - 0.5) * 2.4, th = 0.95 + 0.35 * R[5], c = cos(th);
      mb.mat = R[6] < min(1, flower * 2) ? BLOSSOM : LEAF;
      flat([x, 0.02 + hs * c * 0.75, -0.2 + 0.16 * (R[4] - 0.5)], [sin(yaw) * c, sin(th), cos(yaw) * c], R[1] * TAU, hs, hs, vnorm([sin(yaw) * 0.4, 1, 0.5]), 0.9);
    } else if (kind === 3) { // fringe: trailing stems below the carpet
      const hw = hs * 1.1, hh = hw * (1 + 0.5 * R[1]), yc = -(0.5 + 0.2 * R[5]) * D - hh * 0.35, yaw = (R[3] - 0.5) * 0.5;
      mb.mat = M.LEAF + LT.TRAIL;
      mb.card([x, yc, zf(yc) + 0.02], [hw * cos(yaw), 0, -hw * sin(yaw)], [0, hh, 0], vnorm([sin(yaw) * 0.5, 0.35, 1]), 0.6 + 0.4 * R[5]);
    } else { // carpet: shingled, top edge at the wall, lower edge out, for thickness
      const yc = 0.08 - hs * 0.7 - R[1] * max(0.7 * D - hs * 1.2, 0), yaw = (R[3] - 0.5) * 0.6, lean = 0.16 + 0.26 * R[6], cl = cos(lean);
      mb.mat = R[6] < flower * 1.3 ? BLOSSOM : LEAF;
      flat([x, yc, zf(yc) + hs * sin(lean) * 0.8], [sin(yaw) * cl, sin(lean), cos(yaw) * cl], R[5] * TAU, hs, hs, vnorm([sin(yaw) * 0.5, 0.35, 1]), (0.55 + 0.45 * R[5]) * (i % 4 ? 1 : 0.75));
    }
  }
  return mb.build();
}
// field hedge: bushes 6.2 m along x, cards over a dark body (card i the same at every LOD)
function meshHedge(seed, lod) {
  const mb = new MB(512), rng = RNG(seed * 13 + 5), L = 6.2, n = [84, 28, 8][lod], size = 0.44 * [1, 1.7, 3.3][lod];
  if (lod < 2) { mb.mat = M.CORE; mb.box(-L / 2 + 0.25, -0.3, -0.34, L / 2 - 0.25, 1.0, 0.34, 0.3, false); }
  for (let i = 0; i < n; i++) {
    const R = [rng(), rng(), rng(), rng(), rng(), rng()], u = i * 0.6180339 + R[0] * 0.1, x = (u - floor(u) - 0.5) * L, a = R[1] * PI, k = 0.62 + 0.38 * R[2];
    const hgt = 1.25 + 0.3 * sin(x * 1.7 + seed * 3) + 0.25 * R[3], d = [0, sin(a), cos(a)], p = [x, 0.1 + d[1] * hgt * k, d[2] * 0.66 * k], j = rUnit(rng);
    const N = vnorm([(R[4] - 0.5) * 0.7, d[1] + 0.45, d[2]]), cn = vnorm([N[0] + j[0] * 0.7, N[1] + j[1] * 0.5, N[2] + j[2] * 0.7]), rt = vnorm(vcross([0.01, 1, 0.02], cn)), up = vcross(cn, rt), s = size * (0.8 + 0.4 * R[5]);
    mb.mat = M.LEAF + LT.BROAD; mb.ec = rng() * 255 | 0;
    mb.card(p, [rt[0] * s, rt[1] * s, rt[2] * s], [up[0] * s, up[1] * s, up[2] * s], N, 0.4 + 0.6 * k * (0.4 + 0.6 * d[1]));
  }
  return mb.build();
}
// dry-stone field wall, 6.2 m along x, sunk 0.5 m to follow slopes
function meshFieldWall() { const mb = new MB(128); mb.mat = M.ROCK; if (LV > 1) { mb.box(-3.1, -0.5, -0.33, 3.1, 1.05, 0.33, 0, false); return mb.build(); } mb.box(-3.1, -0.5, -0.3, 3.1, 0.9, 0.3, 0.08, false); mb.box(-3.1, 0.9, -0.36, 3.1, 1.05, 0.36, 0.06); return mb.build(); }
// farmstead on a paved yard: house, barn with a wide door, often a round store with a cupola; plaster, flat roofs
function meshFarm(seed, lod) {
  const mb = new MB(4096), rng = RNG(seed * 77 + 3), blank = { t: 0 };
  mb.mat = M.TERRACE; mb.lathe([[11, -2], [11, 0.1], [10.9, 0.16], [0, 0.16]], { seg: lod ? 10 : 18 });
  const house = rrect(-2.6, -1.2, 3.6 + rng() * 1.4, 2.6 + rng() * 0.8, 0.5);
  volume(mb, house, 0.16, [3.3], 2.8, (fi, i, n) => (fi === 2 && i === (n >> 1) ? DOOR : h2(seed + fi, i) < 0.3 ? blank : { ...WIN, hs: 2.0, s: 0.9 }), { lod });
  const barn = rrect(5.2, 1.4, 2.5 + rng() * 0.8, 3.3 + rng() * 1.1, 0.4);
  volume(mb, barn, 0.16, [4.4], 3.2, (fi, i, n) => (fi === 4 && i === (n >> 1) ? { t: 3, m: 0.5, s: 0.02, hs: 2.6, d: 0.4 } : blank), { lod });
  if (rng() < 0.7) { const gx = -5 + rng() * 2, gz = 5.6, top = volume(mb, [fRound(gx, gz, 2.1, 0, TAU)], 0.16, [4.6], 1.1, () => blank, { lod }); cupola(mb, gx, top, gz, 1.1, lod); }
  return mb.build();
}
function meshPlanter(lod) {
  const mb = new MB(256); mb.mat = M.TRIM; mb.box(-1.2, 0, -0.42, 1.2, 0.62, 0.42, lod ? 0 : 0.05, false); mb.box(-1.26, 0.62, -0.48, 1.26, 0.74, 0.48, lod ? 0 : 0.04);
  mb.mat = M.CORE; mb.box(-1.1, 0.7, -0.34, 1.1, 0.78, 0.34, 0);
  return mb.build();
}
// water landing: steps from the coping down to the water between cheek walls (+z = water)
function meshLanding(lod) {
  const mb = new MB(1024), w = 2.6, n = 21, ze = 0.3 + n * 0.3, top = (z) => -max(z - 0.3, 0) * 0.6 + 0.3;
  mb.mat = M.TRIM; mb.box(-w - 0.4, -0.3, -0.9, w + 0.4, 0.04, 0.3, 0.03);
  mb.mat = M.STEP;
  // ramp from afar, as meshPodiumStair
  if (lod) { mb.eb = 255; mb.quad(mb.v(-w, 0, 0.3, 0, 1, 0, 0.85), mb.v(w, 0, 0.3, 0, 1, 0, 0.85), mb.v(w, -n * 0.18, ze, 0, 1, 0, 0.85), mb.v(-w, -n * 0.18, ze, 0, 1, 0, 0.85)); mb.eb = 0; }
  else for (let i = 0; i < n; i++) {
    const z = 0.3 + i * 0.3, y = -i * 0.18;
    mb.quad(mb.v(-w, y, z, 0, 1, 0, 0.8), mb.v(w, y, z, 0, 1, 0, 0.8), mb.v(w, y, z + 0.3, 0, 1, 0), mb.v(-w, y, z + 0.3, 0, 1, 0));
    mb.quad(mb.v(-w, y, z + 0.3, 0, 0, 1), mb.v(w, y, z + 0.3, 0, 0, 1), mb.v(w, y - 0.18, z + 0.3, 0, 0, 1, 0.7), mb.v(-w, y - 0.18, z + 0.3, 0, 0, 1, 0.7));
  }
  mb.mat = M.QUAY; mb.quad(mb.v(-w - 0.4, -n * 0.18, ze, 0, 0, 1), mb.v(w + 0.4, -n * 0.18, ze, 0, 0, 1), mb.v(w + 0.4, -7.4, ze, 0, 0, 1, 0.6), mb.v(-w - 0.4, -7.4, ze, 0, 0, 1, 0.6));
  for (const sd of [-1, 1]) {
    const xi = sd * w, xo = sd * (w + 0.4);
    for (let k = 0; k < 7; k++) {
      const za = mix(0.3, ze, k / 7), zb = mix(0.3, ze, (k + 1) / 7), ya = top(za), yb = top(zb);
      mb.mat = M.QUAY; mb.quad(mb.v(xo, ya, za, sd, 0, 0), mb.v(xo, yb, zb, sd, 0, 0), mb.v(xo, -7.4, zb, sd, 0, 0, 0.6), mb.v(xo, -7.4, za, sd, 0, 0, 0.6));
      mb.mat = M.TRIM; mb.quad(mb.v(xi, ya, za, -sd, 0, 0), mb.v(xi, yb, zb, -sd, 0, 0), mb.v(xi, yb - 0.5, zb, -sd, 0, 0, 0.7), mb.v(xi, ya - 0.5, za, -sd, 0, 0, 0.7));
      mb.quad(mb.v(xi, ya, za, -sd * 0.3, 1, 0.3), mb.v(xi, yb, zb, -sd * 0.3, 1, 0.3), mb.v(xo, yb, zb, sd * 0.3, 1, 0.3), mb.v(xo, ya, za, sd * 0.3, 1, 0.3));
    }
  }
  return mb.build();
}
function meshUrn() { const mb = new MB(256); mb.mat = M.TRIM; mb.lathe([[0.26, 0], [0.3, 0.05], [0.3, 0.1], [0.16, 0.2], [0.2, 0.34], [0.42, 0.62], [0.47, 0.84], [0.4, 0.98], [0.44, 1.04], [0.4, 1.08], [0.3, 1.02]], { seg: 12 }); return mb.build(); }
// shore boulder: a noise-pushed sphere (n rings; Low: 4)
function meshRock(seed, n = 9) {
  const mb = new MB(512), o = seed * 7.3; mb.mat = M.ROCK;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n * 2; j++) {
    const th = i / n * PI, ph = j / (n * 2) * TAU, d = [sin(th) * cos(ph), cos(th), sin(th) * sin(ph)];
    const r = 0.62 + 0.5 * fbm(d[0] * 1.3 + o, d[1] * 1.3 + d[2] * 1.7 + o, 3) + 0.12 * vnoise(d[0] * 5 + o, d[2] * 5 + d[1] * 4);
    mb.v(d[0] * r, d[1] * r * 0.7, d[2] * r, d[0], d[1] * 1.3, d[2], 0.55 + 0.45 * sstep(-0.6, 0.3, d[1]));
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n * 2; j++) { const a = i * (n * 2 + 1) + j; mb.quad(a, a + 1, a + n * 2 + 2, a + n * 2 + 1); }
  return mb.build();
}
// hovering craft: silver teardrop ~4.5 m long, nose +x
function meshCraft() {
  const mb = new MB(512), prof = []; mb.mat = M.ALLOY;
  for (let i = 0; i <= 14; i++) { const t = i / 14, r = 0.62 * pow(sin(PI * pow(t, 0.5)), 0.9) * (1 - 0.3 * t); prof.push([r, -2.2 + 4.5 * t]); }
  const lm = new MB(512); lm.mat = M.ALLOY; lm.lathe(prof, { seg: 16 }); const m = lm.build(), f = new Float32Array(m.vb), sb = new Int8Array(m.vb);
  // lay it on its side, slightly flattened
  for (let i = 0; i < m.nv; i++) { const o = i * 5, q = i * 20; mb.v(f[o + 1], f[o] * 0.85, f[o + 2], sb[q + 13], sb[q + 12] * 1.15, sb[q + 14]); }
  for (let i = 0; i < m.ib.length; i += 3) mb.tri(m.ib[i], m.ib[i + 1], m.ib[i + 2]);
  return mb.build();
}

// walls
// a frame maps (u along, v up, w out) to the world, so one bay builder makes straight walls and round drums.
// Perimeters run with rising angle; outward normal on the right.
const fStraight = (x0, z0, x1, z1) => {
  const L = hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L, nx = tz, nz = -tx;
  return { L, P: (u, v, w) => [x0 + tx * u + nx * w, v, z0 + tz * u + nz * w], N: (u, a, b, c) => [tx * a + nx * c, b, tz * a + nz * c] };
};
// arc around (cx, cz) from a0 to a1; inward faces the centre
const fRound = (cx, cz, R, a0, a1, inward = false) => {
  const sg = inward ? -1 : 1, A = (u) => (inward ? a1 - u / R : a0 + u / R);
  return { L: abs(a1 - a0) * R, curved: true, P: (u, v, w) => { const a = A(u), r = R + sg * w; return [cx + r * cos(a), v, cz + r * sin(a)]; },
    N: (u, a, b, c) => { const an = A(u), co = cos(an), si = sin(an); return [-si * sg * a + co * sg * c, b, co * sg * a + si * sg * c]; } };
};
const rrect = (cx, cz, hx, hz, r) => [
  fStraight(cx + hx, cz - hz + r, cx + hx, cz + hz - r), fRound(cx + hx - r, cz + hz - r, r, 0, PI / 2), fStraight(cx + hx - r, cz + hz, cx - hx + r, cz + hz), fRound(cx - hx + r, cz + hz - r, r, PI / 2, PI),
  fStraight(cx - hx, cz + hz - r, cx - hx, cz - hz + r), fRound(cx - hx + r, cz - hz + r, r, PI, PI * 1.5), fStraight(cx - hx + r, cz - hz, cx + hx - r, cz - hz), fRound(cx + hx - r, cz - hz + r, r, PI * 1.5, TAU)];
// one bay from u0, w wide, y0 to y1. o.t: 0 blank, 1 arched window, 2 open arch, 3 door; m pier width, s sill,
// hs springing height, d reveal depth (wall thickness for an arcade)
function bay(mb, F, u0, w, y0, y1, o) {
  const V = (u, v, ww, a, b, c, ao) => { const p = F.P(u, v, ww), n = F.N(u, a, b, c); return mb.v(p[0], p[1], p[2], n[0], n[1], n[2], ao); };
  const Q = (p, n, ao) => mb.quad(V(p[0][0], p[0][1], p[0][2], n[0], n[1], n[2], ao), V(p[1][0], p[1][1], p[1][2], n[0], n[1], n[2], ao), V(p[2][0], p[2][1], p[2][2], n[0], n[1], n[2], ao), V(p[3][0], p[3][1], p[3][2], n[0], n[1], n[2], ao));
  const wall = mb.mat, lod = o.lod || 0, foot = (y) => (o.foot ? 0.55 + 0.45 * sstep(0, 1.4, y - y0) : 1); // walls darken at the ground
  const rect = (ua, ub, va, vb, ww, n, ao) => { const i = [V(ua, va, ww, n[0], n[1], n[2], ao * foot(va)), V(ub, va, ww, n[0], n[1], n[2], ao * foot(va)), V(ub, vb, ww, n[0], n[1], n[2], ao), V(ua, vb, ww, n[0], n[1], n[2], ao)]; mb.quad(i[0], i[1], i[2], i[3]); };
  // LOD 2 (Low, far villas): the wall one quad, a window a pointed pane just in front of it (5 triangles, not 40)
  if (lod > 1) {
    rect(u0, u0 + w, y0, y1, 0, [0, 0, 1], 1); if (!o.t) return;
    const a = u0 + o.m, b = u0 + w - o.m, ys = y0 + o.s, yh = y0 + o.hs, ra = (b - a) / 2;
    if (o.t === 2) { mb.mat = M.CORE; rect(a, b, ys, yh + ra * 0.7, 0.04, [0, 0, 1], 0.5); mb.mat = wall; return; } // arcade opening: a dark panel
    mb.mat = M.WINDOW; mb.ec = 1 + floor(h2(round(u0 * 9 + F.L * 31), round(y0 * 9 + w * 57)) * 254);
    const G = (u, v) => { mb.ea = round((u - a) / (b - a) * 255); mb.eb = round((v - ys) / (yh + ra - ys) * 255); return V(u, v, 0.04, 0, 0, 1, 0.8); };
    const p0 = G(a, yh), p1 = G(b, yh); mb.quad(G(a, ys), G(b, ys), p1, p0); mb.tri(p0, p1, G((a + b) / 2, yh + ra));
    mb.ea = mb.eb = mb.ec = 0; mb.mat = wall; return;
  }
  if (!o.t) { if (o.foot) { rect(u0, u0 + w, y0, y0 + 1.4, 0, [0, 0, 1], 1); const i = [V(u0, y0 + 1.4, 0, 0, 0, 1, 1), V(u0 + w, y0 + 1.4, 0, 0, 0, 1, 1), V(u0 + w, y1, 0, 0, 0, 1, 1), V(u0, y1, 0, 0, 0, 1, 1)]; mb.quad(i[0], i[1], i[2], i[3]); } else rect(u0, u0 + w, y0, y1, 0, [0, 0, 1], 1); return; }
  const a = u0 + o.m, b = u0 + w - o.m, uc = (a + b) / 2, ra = (b - a) / 2, ys = y0 + o.s, yh = y0 + o.hs, n = lod ? 5 : 10, d = o.d, arc = [];
  for (let i = 0; i <= n; i++) { const th = PI * (1 - i / n); arc.push([uc + ra * cos(th), yh + ra * sin(th), cos(th), sin(th)]); }
  const faces = o.t === 2 ? [[0, 1], [-d, -1]] : [[0, 1]];
  for (const [ww, sg] of faces) {
    rect(u0, a, y0, y1, ww, [0, 0, sg], 1); rect(b, u0 + w, y0, y1, ww, [0, 0, sg], 1); if (o.s > 0) rect(a, b, y0, ys, ww, [0, 0, sg], 1);
    for (let i = 0; i < n; i++) Q([[arc[i][0], arc[i][1], ww], [arc[i + 1][0], arc[i + 1][1], ww], [arc[i + 1][0], y1, ww], [arc[i][0], y1, ww]], [0, 0, sg], 1);
  }
  // reveal: jambs, sill and soffit, darker inside
  const ai = o.t === 2 ? 0.6 : 0.5;
  Q([[a, ys, 0], [a, yh, 0], [a, yh, -d], [a, ys, -d]], [1, 0, 0], ai); Q([[b, ys, 0], [b, yh, 0], [b, yh, -d], [b, ys, -d]], [-1, 0, 0], ai);
  if (o.s > 0) Q([[a, ys, 0], [b, ys, 0], [b, ys, -d], [a, ys, -d]], [0, 1, 0], ai);
  for (let i = 0; i < n; i++) { const p = arc[i], q = arc[i + 1]; mb.quad(V(p[0], p[1], 0, -p[2], -p[3], 0, ai + 0.2), V(q[0], q[1], 0, -q[2], -q[3], 0, ai + 0.2), V(q[0], q[1], -d, -q[2], -q[3], 0, ai), V(p[0], p[1], -d, -p[2], -p[3], 0, ai)); }
  if (o.t !== 2) {
    // glass set back in a gold frame with mullion and transom. Each vertex carries its 0-1 place in the pane and the pane
    // a per-pane random (the same at every LOD), from which the material builds a room behind the glass
    mb.mat = M.WINDOW; mb.ec = 1 + floor(h2(round(u0 * 9 + F.L * 31), round(y0 * 9 + w * 57)) * 254);
    const G = (u, v, ao) => { mb.ea = round((u - a) / (b - a) * 255); mb.eb = round((v - ys) / (yh + ra - ys) * 255); return V(u, v, -d, 0, 0, 1, ao); };
    mb.quad(G(a, ys, 0.8 * foot(ys)), G(b, ys, 0.8 * foot(ys)), G(b, yh, 0.8), G(a, yh, 0.8));
    const c = G(uc, yh, 0.8); for (let i = 0; i < n; i++) mb.tri(c, G(arc[i][0], arc[i][1], 0.75), G(arc[i + 1][0], arc[i + 1][1], 0.75));
    mb.ea = mb.eb = mb.ec = 0;
    if (!lod) {
      mb.mat = M.GOLD; const fw = min(0.14, ra * 0.16), z = -d + 0.04, g = [0, 0, 1];
      rect(a, a + fw, ys, yh, z, g, 0.9); rect(b - fw, b, ys, yh, z, g, 0.9); rect(a, b, ys, ys + fw, z, g, 0.9); rect(a, b, yh - 0.03, yh + 0.03, z, g, 0.9); rect(uc - 0.03, uc + 0.03, ys, yh + ra - fw, z, g, 0.9);
      for (let i = 0; i < n; i++) { const p = arc[i], q = arc[i + 1], k = 1 - fw / ra; Q([[p[0], p[1], z], [q[0], q[1], z], [uc + (q[0] - uc) * k, yh + (q[1] - yh) * k, z], [uc + (p[0] - uc) * k, yh + (p[1] - yh) * k, z]], g, 0.9); }
    }
  }
  if (!lod && o.t === 1) {
    // stone sill proud of the wall
    mb.mat = M.TRIM; const s0 = a - 0.14, s1 = b + 0.14, yt = ys + 0.03, yb = ys - 0.11, pw = 0.1;
    Q([[s0, yt, pw], [s1, yt, pw], [s1, yt, -d + 0.02], [s0, yt, -d + 0.02]], [0, 1, 0], 1); Q([[s0, yb, pw], [s1, yb, pw], [s1, yt, pw], [s0, yt, pw]], [0, 0, 1], 1);
    Q([[s0, yb, 0], [s1, yb, 0], [s1, yb, pw], [s0, yb, pw]], [0, -1, 0], 0.6);
    Q([[s0, yb, 0], [s0, yb, pw], [s0, yt, pw], [s0, yt, 0]], [-1, 0, 0], 0.9); Q([[s1, yb, 0], [s1, yb, pw], [s1, yt, pw], [s1, yt, 0]], [1, 0, 0], 0.9);
  }
  if (!lod) {
    // archivolt: a raised band around the arch
    mb.mat = M.TRIM; const k0 = 1 + 0.03 / ra, k1 = 1 + 0.24 / ra;
    for (let i = 0; i < n; i++) { const p = arc[i], q = arc[i + 1]; mb.quad(V(uc + (p[0] - uc) * k0, yh + (p[1] - yh) * k0, 0.045, -p[2] * 0.6, -p[3] * 0.6, 0.8, 1), V(uc + (q[0] - uc) * k0, yh + (q[1] - yh) * k0, 0.045, -q[2] * 0.6, -q[3] * 0.6, 0.8, 1), V(uc + (q[0] - uc) * k1, yh + (q[1] - yh) * k1, 0.045, q[2] * 0.6, q[3] * 0.6, 0.8, 1), V(uc + (p[0] - uc) * k1, yh + (p[1] - yh) * k1, 0.045, p[2] * 0.6, p[3] * 0.6, 0.8, 1)); }
  }
  mb.mat = wall;
}
// profile [[w, v, mat?], ...] swept along a frame from u0 to u1 (up the inside, over, down the outside)
function mould(mb, F, u0, u1, prof, steps = 1) {
  const pn = profNormals(prof), V = (u, p, n) => { const q = F.P(u, p[1], p[0]), m = F.N(u, 0, n[1], n[0]); return mb.v(q[0], q[1], q[2], m[0], m[1], m[2]); };
  for (let s = 0; s < steps; s++) { const ua = mix(u0, u1, s / steps), ub = mix(u0, u1, (s + 1) / steps);
    for (let i = 0; i < prof.length - 1; i++) { if (prof[i][2] !== undefined) mb.mat = prof[i][2]; mb.quad(V(ua, prof[i], pn[i][0]), V(ub, prof[i], pn[i][0]), V(ub, prof[i + 1], pn[i][1]), V(ua, prof[i + 1], pn[i][1])); } }
}
const fSteps = (F, lod) => (F.curved ? max(2, ceil(F.L / (lod > 1 ? 3.2 : 1.3))) : 1);
// storeyed volume on frames: bays from style(frame, bay, count, storey), string courses, cornice, parapet, terrace
// roof; returns the roof height
function volume(mb, frames, y0, heights, bayW, style, o = {}) {
  let y = y0; const lod = o.lod || 0, wallMat = o.mat === undefined ? M.PLASTER : o.mat;
  heights.forEach((h, s) => {
    frames.forEach((F, fi) => {
      mb.mat = wallMat;
      const n = F.curved && F.L < 4 ? fSteps(F, lod) : max(1, round(F.L / bayW)), w = F.L / n;
      for (let i = 0; i < n; i++) {
        const st = F.curved && F.L < 4 ? { t: 0, foot: !s, lod } : { ...style(fi, i, n, s), lod, foot: !s }; bay(mb, F, i * w, w, y, y + h, st);
        // plinth course (on the piers only where a door or arch opens to the ground)
        if (!s && !lod) for (const [ua, ub] of st.t > 1 ? [[i * w, i * w + st.m], [(i + 1) * w - st.m, (i + 1) * w]] : [[i * w, (i + 1) * w]]) mould(mb, F, ua, ub, [[0, y + 0.52, M.TRIM], [0.07, y + 0.45], [0.07, y - 0.3]], F.curved ? max(1, ceil((ub - ua) / 1.3)) : 1);
        mb.mat = wallMat;
      }
      if (!lod && s < heights.length - 1) mould(mb, F, 0, F.L, [[0, y + h + 0.1, M.TRIM], [0.06, y + h + 0.07], [0.06, y + h - 0.07], [0, y + h - 0.1]], fSteps(F));
    });
    y += h;
  });
  // parapet with coping, cornice under it
  const P = lod > 1 ? [[-0.3, y, M.TRIM], [-0.3, y + 0.95], [0.14, y + 0.95], [0.14, y - 0.12], [0, y - 0.3]]
    : lod ? [[-0.3, y, M.TRIM], [-0.3, y + 0.95], [0.12, y + 0.95], [0.12, y + 0.8], [0.02, y + 0.74, wallMat], [0.02, y + 0.1, M.TRIM], [0.24, y], [0.24, y - 0.12], [0, y - 0.3]]
    : [[-0.3, y, M.TRIM], [-0.3, y + 0.9], [-0.26, y + 0.95], [0.08, y + 0.95], [0.12, y + 0.9], [0.12, y + 0.8], [0.02, y + 0.74, wallMat], [0.02, y + 0.12, M.TRIM], [0.2, y + 0.06], [0.24, y], [0.24, y - 0.12], [0.1, y - 0.22], [0, y - 0.3]];
  const rim = [];
  for (const F of frames) { const st = fSteps(F, lod); mould(mb, F, 0, F.L, P, st); for (let i = 0; i < st; i++) rim.push(F.P(F.L * i / st, y, -0.3)); }
  mb.mat = M.TERRACE; let cx = 0, cz = 0; for (const p of rim) { cx += p[0] / rim.length; cz += p[2] / rim.length; }
  const c = mb.v(cx, y, cz, 0, 1, 0), ids = rim.map((p) => mb.v(p[0], y, p[2], 0, 1, 0, 0.8)); for (let i = 0; i < ids.length; i++) mb.tri(c, ids[i], ids[(i + 1) % ids.length]);
  return y;
}
// small cupola: marble ring, glass panes between gold ribs, finial
function cupola(mb, cx, y, cz, R, lod) {
  const seg = lod > 1 ? 6 : lod ? 8 : 12, H = R * 0.95, prof = [], np = lod > 1 ? 3 : 6;
  mb.lathe(lod > 1 ? [[R + 0.25, y, M.TRIM], [R + 0.25, y + 0.58], [R, y + 0.58]] : [[R + 0.25, y, M.TRIM], [R + 0.25, y + 0.5], [R + 0.18, y + 0.58], [R, y + 0.58]], { seg, cx, cz });
  for (let i = 0; i <= np; i++) { const t = i / np * PI / 2; prof.push([R * cos(t) + 0.02, y + 0.58 + H * sin(t), M.WINDOW]); }
  mb.lathe(prof, { seg, cx, cz, flat: true });
  mb.mat = M.GOLD;
  if (!lod) for (let k = 0; k < seg; k++) { const a = k / seg * TAU, rib = prof.map((p) => [cx + (p[0] + 0.03) * cos(a), p[1] + 0.02, cz + (p[0] + 0.03) * sin(a), 0.05]); mb.tube(rib, 4, false); }
  mb.lathe(lod > 1 ? [[0.35, y + 0.5 + H, M.GOLD], [0.12, y + 0.9 + H], [0, y + 1.7 + H]] : [[0.35, y + 0.5 + H, M.GOLD], [0.35, y + 0.75 + H], [0.12, y + 0.9 + H], [0.08, y + 1.5 + H], [0, y + 1.7 + H]], { seg: lod > 1 ? 4 : 6, cx, cz });
}
const WIN = { t: 1, m: 0.55, s: 0.95, hs: 2.0, d: 0.28 }, DOOR = { t: 3, m: 0.6, s: 0.02, hs: 2.25, d: 0.34 };
// garden villa: one or two rounded volumes of 2-3 storeys, arched windows, roof terraces, maybe a cupola. Returns
// the mesh and anchors [x, y, z, yaw, kind] (0 vine over a parapet, 1 roof shrub, 2 planter). Built twice: the first pass
// finds the wing (`wr` = [cx, cz, hx, hz]) so the second leaves the walls blank where the volumes meet.
function meshVilla(seed, lod, wr) {
  if (wr === undefined) wr = meshVilla(seed, lod, null).wr;
  const mb = new MB(8192), rng = RNG(seed * 131 + 7), anchors = [], circ = rng() < 0.28; let wOut = null, wTop = 0;
  const mid = (F, i, n) => F.P((i + 0.5) * F.L / n, 0, 0);
  const st = rng() < 0.45 ? 3 : 2, hs = [3.9, 3.2, 3.1].slice(0, st);
  const hx = circ ? 0 : 4.6 + rng() * 2.6, hz = circ ? 0 : 3.6 + rng() * 1.6, R = 4.5 + rng() * 1.6;
  const main = circ ? [fRound(0, 0, R, 0, TAU)] : rrect(0, 0, hx, hz, 0.9), ex = circ ? R : hx, ez = circ ? R : hz;
  // terrace slab with a step
  mb.mat = M.TERRACE; mb.lathe([[ex + ez + 0.4, -0.5], [ex + ez + 0.4, 0.14], [ex + ez + 0.34, 0.2], [0, 0.2]].map((p) => [p[0] * 0.62 + 2.2, p[1]]), { seg: lod > 1 ? 8 : lod ? 12 : 20 });
  // half a window opening plus a hand
  const GAP = 1.15, atWing = (fi, i, n) => { if (!wr) return false; const p = mid(main[fi], i, n); return abs(p[0] - wr[0]) < wr[2] + GAP && abs(p[2] - wr[1]) < wr[3] + GAP; };
  const inMain = (F, i, n) => { const p = mid(F, i, n); return circ ? hypot(p[0], p[2]) < R + GAP : abs(p[0]) < hx + GAP && abs(p[2]) < hz + GAP; };
  const style = (fi, i, n, s) => (s === 0 && fi === 0 && i === (n >> 1) ? DOOR : (atWing(fi, i, n) || h2(seed * 7 + fi * 13 + s, i) < 0.16 ? { t: 0 } : s === 0 ? { ...WIN, hs: 2.3, s: 0.8 } : WIN));
  const top = volume(mb, main, 0.2, hs, circ ? 2.6 : 3.0, style, { lod });
  const perim = (frames, y) => { for (const F of frames) { const n = max(1, round(F.L / 2.7)); for (let i = 0; i < n; i++) { const u = (i + 0.5) * F.L / n, p = F.P(u, y, 0.16), nn = F.N(u, 0, 0, 1); anchors.push([p[0], y, p[2], atan2(nn[0], nn[2]), 0]); } } };
  perim(main, top + 0.95);
  anchors.push([ex * 0.4 * (rng() - 0.5), top, ez * 0.4 * (rng() - 0.5), rng() * 6, 1], [ex + 1.2, 0.2, 1.9, PI / 2, 2], [ex + 1.2, 0.2, -1.9, PI / 2, 2]);
  if (rng() < 0.62) { // lower wing
    const wx = 3.2 + rng() * 1.6, wz = 2.8 + rng() * 1.4, sd = rng() < 0.5 ? 1 : -1, cx = (rng() - 0.5) * ex * 0.6, cz = sd * (ez + wz - 0.8);
    wOut = [cx, cz, wx, wz];
    const wing = rrect(cx, cz, wx, wz, 0.8), wt = volume(mb, wing, 0.2, hs.slice(0, st - 1), 3.0, (fi, i, n, s) => (inMain(wing[fi], i, n) || h2(seed * 3 + fi, i + s * 5) < 0.2 ? { t: 0 } : WIN), { lod });
    wTop = wt + 0.95;
    perim(wing, wt + 0.95); anchors.push([cx, wt, cz, rng() * 6, 1], [cx + 1.2, wt, cz - 0.5, rng() * 6, 1]);
    if (rng() < 0.4) cupola(mb, cx, wt, cz, 1.5 + rng() * 0.5, lod);
  }
  if (rng() < 0.5) cupola(mb, 0, top, 0, 1.7 + rng() * 0.9, lod);
  // collision shape: main radius if round, half sizes, parapet top; wing centre, half sizes (-1 if none), top
  return { mesh: mb.build(), anchors, wr: wOut, shape: [circ ? R : 0, hx, hz, top + 0.95, wOut ? wOut[0] : 0, wOut ? wOut[1] : 0, wOut ? wOut[2] : -1, wOut ? wOut[3] : -1, wTop] };
}

// arcaded hall along a ring
// built in place, a0 to a1 at radius rc, `dep` deep: arcade and loggia on the `front` side (+1 outer, -1 inner),
// windows on the other, attic storey, terrace roof with cupolas. No LODs; Low builds it at level 1.
function hall(mb, rc, a0, a1, dep, front, seed, anchors) {
  const lod = LV > 1 ? 1 : 0;
  const Ro = rc + dep / 2, Ri = rc - dep / 2, H1 = 7.4, H2 = 3.3, arc = { t: 2, m: 0.75, s: 0, hs: 4.5, d: 0.9 }, win = { t: 1, m: 0.9, s: 1.3, hs: 3.6, d: 0.3 }, att = { t: 1, m: 0.95, s: 0.7, hs: 1.5, d: 0.26 };
  const end = (a, flip) => { const p = [Ro * cos(a), Ro * sin(a)], q = [Ri * cos(a), Ri * sin(a)]; return flip ? fStraight(q[0], q[1], p[0], p[1]) : fStraight(p[0], p[1], q[0], q[1]); };
  const Fo = fRound(0, 0, Ro, a0, a1), Fi = fRound(0, 0, Ri, a0, a1, true), frames = [Fo, end(a1, false), Fi, end(a0, true)];
  const fa = front > 0 ? 0 : 2;
  const top = volume(mb, frames, LAND, [H1, H2], 4.4, (fi, i, n, s) => (s ? (fi % 2 ? { t: 0 } : att) : fi === fa ? arc : fi % 2 ? (i === (n >> 1) ? { ...DOOR, hs: 3.4, m: 1.2 } : { t: 0 }) : win), { mat: M.MARBLE, lod });
  // loggia: back wall 3.4 m behind the arcade, and a ceiling over the walk
  const Rb = front > 0 ? Ro - 3.4 : Ri + 3.4, Fb = fRound(0, 0, Rb, a0, a1, front < 0), n = max(1, round(Fb.L / 4.4));
  mb.mat = M.MARBLE; for (let i = 0; i < n; i++) bay(mb, Fb, i * Fb.L / n, Fb.L / n, LAND, LAND + H1 - 0.5, i % 3 === 1 ? { ...DOOR, hs: 3.1, m: 1.1, lod } : { ...win, s: 1.1, hs: 3.1, lod });
  const S = max(2, ceil((a1 - a0) * rc / 2)), Rf = front > 0 ? Ro - 0.9 : Ri + 0.9;
  for (let i = 0; i < S; i++) {
    const A = mix(a0, a1, i / S), B = mix(a0, a1, (i + 1) / S), y = LAND + H1 - 0.5;
    mb.mat = M.TRIM; mb.quad(mb.v(Rf * cos(A), y, Rf * sin(A), 0, -1, 0, 0.45), mb.v(Rf * cos(B), y, Rf * sin(B), 0, -1, 0, 0.45), mb.v(Rb * cos(B), y, Rb * sin(B), 0, -1, 0, 0.35), mb.v(Rb * cos(A), y, Rb * sin(A), 0, -1, 0, 0.35));
    mb.mat = M.PAVE; mb.quad(mb.v(Rf * cos(A), LAND + 0.04, Rf * sin(A), 0, 1, 0, 0.7), mb.v(Rf * cos(B), LAND + 0.04, Rf * sin(B), 0, 1, 0, 0.7), mb.v(Rb * cos(B), LAND + 0.04, Rb * sin(B), 0, 1, 0, 0.55), mb.v(Rb * cos(A), LAND + 0.04, Rb * sin(A), 0, 1, 0, 0.55));
  }
  // roof: cupolas along the middle, vines over the parapets
  const nc = max(1, round((a1 - a0) * rc / 19));
  for (let i = 0; i < nc; i++) { const a = mix(a0, a1, (i + 0.5) / nc); cupola(mb, rc * cos(a), top, rc * sin(a), 2.3 + 0.8 * h2(seed, i), lod); }
  for (const [F, sg] of [[Fo, 1], [Fi, -1]]) { const m = max(1, round(F.L / 2.7)); for (let i = 0; i < m; i++) { const u = (i + 0.5) * F.L / m, p = F.P(u, top + 0.95, 0.16), nn = F.N(u, 0, 0, 1); anchors.push([p[0], top + 0.95, p[2], atan2(nn[0], nn[2]), 0]); if (i % 3 === 0) { const q = F.P(u, top, -1.6); anchors.push([q[0], top, q[2], 0, 1]); } } }
}

// great glass dome on a marble drum
// { solid, glass }: drum with windows, floor and ribs; faceted glass shell
function meshDome(R, lod) {
  const mb = new MB(1 << 14), gl = new MB(4096), HD = 8.5 + R * 0.12, nb = round(TAU * R / (lod ? 9 : 4.6)) & ~1;
  mb.lathe([[R + 4.2, -0.6, M.TRIM], [R + 4.2, 0.22], [R + 4.1, 0.3, M.STEP], [R + 2.8, 0.3, M.TRIM], [R + 2.8, 0.52], [R + 2.7, 0.6, M.STEP], [R + 1.4, 0.6, M.TRIM], [R + 1.4, 0.82], [R + 1.3, 0.9, M.PAVE], [R - 1, 0.9]], { seg: lod ? 24 : 48 });
  const F = fRound(0, 0, R, 0, TAU), w = F.L / nb;
  mb.mat = M.MARBLE;
  for (let i = 0; i < nb; i++) bay(mb, F, i * w, w, 0.9, 0.9 + HD, i % (nb >> 2) === 0 ? { t: 3, m: w * 0.2, s: 0.02, hs: 4.6, d: 0.8, lod, foot: 1 } : { t: 1, m: w * 0.21, s: 1.5, hs: 5, d: 0.7, lod, foot: 1 });
  const y = 0.9 + HD;
  mould(mb, F, 0, F.L, [[-0.5, y, M.TRIM], [-0.5, y + 0.5], [0.3, y + 0.5], [0.36, y + 0.42], [0.36, y + 0.25], [0.1, y + 0.05], [0.1, y - 0.3], [0, y - 0.4]], lod ? 24 : 48);
  // inside: drum's inner face and floor, seen through the glass
  mb.lathe([[R - 0.5, y + 0.5, M.MARBLE], [R - 0.5, 0.9, M.GROUND], [0, 0.9]], { seg: lod ? 24 : 48, ao: (r, yy) => (yy < y ? 0.75 : 1) });
  // glass shell: slightly pointed dome of flat panes between ribs and rings
  const NR = lod ? 4 : 7, Rg = R - 0.25, prof = [], hgt = R * 0.92;
  for (let i = 0; i <= NR; i++) { const t = i / NR * PI / 2 * 0.985; prof.push([Rg * pow(cos(t), 0.85) + 0.3 * (1 - i / NR), y + 0.5 + hgt * sin(t)]); }
  const nm = lod ? nb : nb * 2;
  gl.mat = 0; gl.lathe(prof, { seg: nm, flat: true });
  mb.mat = M.GOLD;
  for (let k = 0; k < nm; k += lod ? 2 : 1) { const a = k / nm * TAU; mb.tube(prof.map((p) => [(p[0] + 0.04) * cos(a), p[1] + 0.03, (p[0] + 0.04) * sin(a), k % 2 ? 0.055 : 0.1]), lod ? 3 : 4, false); }
  for (let i = 1; i < NR; i++) { const ring = []; for (let k = 0; k <= nm; k++) { const a = k / nm * TAU; ring.push([(prof[i][0] + 0.04) * cos(a), prof[i][1] + 0.03, (prof[i][0] + 0.04) * sin(a), 0.07]); } mb.tube(ring, lod ? 3 : 4, false); }
  const ty = prof[NR][1], tr = prof[NR][0];
  mb.lathe([[tr + 0.4, ty - 0.3, M.GOLD], [tr + 0.4, ty + 0.3], [tr * 0.7, ty + 0.6], [tr * 0.7, ty + 2.2], [tr * 0.9, ty + 2.4], [0.3, ty + 3.6], [0.12, ty + 3.8], [0.1, ty + 5.4], [0, ty + 5.6]], { seg: lod ? 8 : 12 });
  return { solid: mb.build(), glass: gl.build(), top: ty };
}

// bambine e bambini (aggiunta per la città di Virginia): a group of N children around a centre, built standing with
// arms down, facing +z in their own frame. mode 0: girotondo (facing the centre, holding hands); mode 1: rincorsa
// (running round a wider ring). The vertex shader (mat KID) swings the limbs and turns the ring, so the layout here must
// match kidRing() in sh_scene.js. Vertex params: ea = colour slot x 40 (0 skin, 1 hair, 2 shirt, 3 trousers,
// 4 shoes, 5 skirt), eb = limb (0 body, 1/2 arm +x/-x, 3/4 leg +x/-x), ec = mode x 128 + N x 16 + child index.
const KID_R = (mode, n) => (mode ? 3.2 : 0.55 / sin(PI / n));
function meshKids(mode, n, seed) {
  const mb = new MB(1 << 13), rng = RNG(seed), R = KID_R(mode, n);
  mb.mat = M.KID;
  const part = (slot, limb, prof, o) => { mb.ea = slot * 40; mb.eb = limb; mb.lathe(prof, o); };
  const ball = (cy, r, k = 8, from = -90, to = 90) => { const p = []; for (let j = 0; j <= k; j++) { const a = (from + (to - from) * j / k) * DEG; p.push([max(0, r * cos(a)), cy + r * sin(a)]); } return p; };
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, cx = R * cos(a), cz = R * sin(a), psi = mode ? -a : atan2(-cos(a), -sin(a));
    mb.fr = [cx, 0, cz, cos(psi), sin(psi), 1]; mb.ec = mode * 128 + n * 16 + i;
    const girl = rng() < 0.5, hair = girl ? (rng() < 0.55 ? 2 : 3) : 1;
    for (const sx of [1, -1]) {
      const lx = sx * 0.075, ax = sx * 0.165, leg = sx > 0 ? 3 : 4, arm = sx > 0 ? 1 : 2;
      part(4, leg, [[0.001, 0], [0.058, 0], [0.062, 0.035], [0.05, 0.075], [0, 0.08]], { seg: 8, cx: lx, cz: 0.02 });
      part(3, leg, [[0.046, 0.06], [0.05, 0.33], [0.062, 0.6], [0.04, 0.68], [0, 0.69]], { seg: 8, cx: lx });
      part(2, arm, [[0.043, 0.8], [0.047, 0.95], [0.03, 1.0], [0, 1.01]], { seg: 8, cx: ax });
      part(0, arm, [[0.03, 0.55], [0.034, 0.6], [0.036, 0.82]], { seg: 7, cx: ax });
      part(0, arm, ball(0.54, 0.038, 4), { seg: 7, cx: ax });
    }
    part(2, 0, [[0.07, 0.6], [0.118, 0.62], [0.126, 0.76], [0.132, 0.9], [0.118, 0.99], [0.06, 1.03], [0, 1.035]], { seg: 12 });
    if (girl) part(5, 0, [[0.001, 0.5], [0.2, 0.5], [0.185, 0.54], [0.14, 0.7], [0.124, 0.8], [0, 0.81]], { seg: 14 });
    else part(3, 0, [[0.001, 0.56], [0.128, 0.56], [0.126, 0.7], [0, 0.71]], { seg: 12 });
    part(0, 0, [[0.042, 1.0], [0.042, 1.09], [0, 1.1]], { seg: 8 });
    part(0, 0, ball(1.17, 0.1, 9), { seg: 14 });
    // hair: a cap over the crown and the back of the head; long hair falls down the back, a ponytail sticks out
    part(1, 0, ball(1.172, 0.108, 6, 18, 90), { seg: 14 });
    part(1, 0, ball(1.172, 0.108, 5, -40, 22), { seg: 10, a0: PI * 1.02, a1: PI * 1.98 });
    if (hair === 2) part(1, 0, [[0.112, 0.86], [0.124, 0.95], [0.12, 1.1], [0.11, 1.18]], { seg: 9, a0: PI * 1.05, a1: PI * 1.95 });
    if (hair === 3) part(1, 0, ball(1.12, 0.045, 5).map(([r, y]) => [r * 0.9, y + (y - 1.12) * 1.2]), { seg: 8, cz: -0.13 });
  }
  mb.fr = null; mb.ec = 0; mb.ea = 0; mb.eb = 0;
  return mb.build();
}
