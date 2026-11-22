// populating the world: domes, halls, villas, trees, flowers, vines, rocks, craft
// gH: land mesh height. hard (for collide.js): domes [x, z, R], halls [radius, mid angle, half angle, depth],
// villas [x, y, z, cos, sin, scale, variant], and each variant's shape
function populate({ type, put, paint, MAP, balRun, gH, hard }) {
  const bare = (x, z) => hypot(x - ROCCA[0], z - ROCCA[1]) < ROCCA[2] + 40 || hypot(x - SERPI[0], z - SERPI[1]) < SERPI[2] + 220;
  // farmland and wild land draw from their own stream, so changes there move nothing in the city
  const rngA = RNG(20261), rngB = RNG(90210); let rng = rngA; const rr = (a, b) => a + (b - a) * rng();
  // plant types
  // leaf tints are square roots (the shader squares them); alpha seeds the flower colour
  const TINT = { olive: [0.55, 0.59, 0.47], plane: [0.38, 0.49, 0.28], pine: [0.32, 0.42, 0.27], bloom: [0.4, 0.49, 0.3], cypress: [0.26, 0.34, 0.22], shrub: [0.36, 0.47, 0.28] };
  // no two crowns the same green
  const tintOf = (k, seed) => { const c = TINT[k], v = 0.78 + 0.34 * rng(), w = rng(); return rgb(c[0] * v * (0.92 + 0.22 * w), c[1] * v * (0.94 + 0.1 * rng()), c[2] * v * (1.12 - 0.25 * w), (seed & 255) / 255); };
  // trees: two variants per kind, four LODs. CROWN: each variant's crown reach at scale 1, the planting spacing. Fixed,
  // not measured: re-measuring would move every tree; a new kind needs its own entry.
  const CROWN = { olive: [5.091632558262888, 6.610734612997041], plane: [6.196414964566972, 7.050782126253885], pine: [6.66909194238408, 6.577589764967548], bloom: [4.719842778853082, 5.045086544746204], cypress: [1.3475943214130373, 1.3544764400252955] };
  const trees = {}, crowns = {};
  // Low: one level coarser, a fifth level from 250 m, forest thinning to a fifth beyond 750 m. Medium: the fifth level
  // replaces the fourth beyond 330 m. Distances in LODK units.
  const low = LV > 1, TL = QL([0, 1, 2, 3], [0, 1, 2, 4], [1, 2, 3, 4]);
  const treeType = (k, v, gen, ...d) => { const t = type(TL.map(gen), K.LEAF, ...d); crowns[t] = CROWN[k][v]; return t; };
  for (const k of ['olive', 'plane', 'pine', 'bloom']) trees[k] = [0, 1].map((v) => treeType(k, v, (l) => meshTree(k.length * 97 + v * 31 + 5, SPECIES[k], l), ...QL([85, 215, 3400, 0, 0, 330], [110, 280, 3400, 0, 0, 430], [90, 220, 3400, 1500, 0, 500])));
  trees.cypress = [0, 1].map((v) => treeType('cypress', v, (l) => meshCypress(41 + v, l), ...QL([90, 225, 3400, 0, 0, 340], [117, 292, 3400, 0, 0, 442], [95, 230, 3400, 1500, 0, 520])));
  // crowns may overlap by `lap` of their radii at most, so leaves don't cross leaves (a third cheaper to draw); rows
  // planted first (spoke cypresses) have right of way
  const CELL = 12, planted = new Map(); let nTree = 0, nCut = 0;
  const roomFor = (x, z, r, lap) => {
    const cx = floor(x / CELL), cz = floor(z / CELL), n = ceil((r + 14) * lap / CELL);
    for (let i = cx - n; i <= cx + n; i++) for (let j = cz - n; j <= cz + n; j++) { const c = planted.get(i * 8192 + j); if (c) for (let q = 0; q < c.length; q += 3) if ((x - c[q]) ** 2 + (z - c[q + 1]) ** 2 < ((r + c[q + 2]) * lap) ** 2) return false; }
    const key = cx * 8192 + cz, c = planted.get(key); if (c) c.push(x, z, r); else planted.set(key, [x, z, r]);
    return true;
  };
  // all random numbers are drawn before deciding, so a skipped tree moves nothing else. `walls`: keep the crown off buildings
  const tree = (k, x, y, z, s = 1, seed = (rng() * 256) | 0, lap = 0.69, walls = false) => {
    const ty = trees[k][seed & 1], sc = s * rr(0.85, 1.2), q = qYaw(rng() * TAU), tint = tintOf(k, seed), sy = rr(0.9, 1.15);
    if (bare(x, z)) { nCut++; return false; } // nothing grows on the Ivory Rock's shelf or the Serpent Fortress's plain
    if ((walls && !free(x, z, crowns[ty] * sc * 0.45 - 1.2)) || !roomFor(x, z, crowns[ty] * sc, lap)) { nCut++; return false; }
    put(ty, x, y, z, sc, q, tint, sy); nTree++; return true;
  };
  const shrubDef = [[0.9, 0.8, LT.HYDRANGEA, 40, 0.34, { tile2: LT.BROAD, frac2: 0.5 }], [0.6, 0.55, LT.LAVENDER, 30, 0.34, { up: 1 }], [1.1, 0.9, LT.BLOSSOM, 44, 0.36, { tile2: LT.BROAD, frac2: 0.5 }], [1.0, 1.1, LT.BROAD, 30, 0.46, {}], [0.8, 0.5, LT.BLOSSOM, 30, 0.32, { tile2: LT.LAVENDER, frac2: 0.5 }]];
  const shrubs = shrubDef.map((d, i) => type([meshShrub(11 + i, d[0], d[1], d[2], d[3], d[4] * LEAFK, d[5]), meshShrub(11 + i, d[0], d[1], d[2], ceil(d[3] / 3), d[4] * 1.7 * LEAFK, d[5]), meshShrub(11 + i, d[0], d[1], d[2], 4, d[4] * 3.1 * LEAFK, d[5])], K.LEAF, 120, 290, 1400, 420));
  // flower seeds per kind: hydrangea blue / white / rose, lavender lilac, bougainvillea magenta, mixed
  const SEEDS = [[3, 3, 4, 1], [2, 6], [0, 5, 5, 1], [4], [1, 4, 7, 0]];
  const shrub = (k, x, y, z, s = 1) => put(shrubs[k], x, y, z, s * rr(0.8, 1.3), qYaw(rng() * TAU), tintOf('shrub', SEEDS[k][(rng() * SEEDS[k].length) | 0]), rr(0.85, 1.2));
  // width, drop, cards, blossom share
  const vines = [[2.8, 2.3, 36, 0.0], [2.8, 2.6, 40, 0.55], [2.6, 1.6, 30, 0.3]].map((d, i) => type([meshVine(71 + i, d[0], d[1], d[2], d[3]), meshVine(71 + i, d[0], d[1], ceil(d[2] / 3), d[3], 1.7), meshVine(71 + i, d[0], d[1], 7, d[3], 3.4)], K.LEAF, 140, 300, 1200, 400));
  const vine = (x, y, z, yaw, k = (rng() * 3) | 0) => put(vines[k], x, y, z, rr(0.9, 1.25), qYaw(yaw), tintOf('shrub', [0, 5, 1, 0, 2][(rng() * 5) | 0]), rr(0.8, 1.3));
  const tPlanter = type([meshPlanter(0), meshPlanter(1)], K.SOLID, 100, 1e9, 420), tUrn = type([meshUrn()], K.SOLID, 1e9, 1e9, 200);
  const planter = (x, y, z, yaw) => { put(tPlanter, x, y, z, 1, qYaw(yaw)); const c = cos(yaw), s = sin(yaw), k = (rng() * 5) | 0; for (const o of [-0.65, 0.65]) shrub(k, x + c * o, y + 0.7, z - s * o, 0.62); };
  // [x, z, radius] claimed by buildings
  const occ = [], free = (x, z, r) => { for (const o of occ) if ((x - o[0]) ** 2 + (z - o[1]) ** 2 < (r + o[2]) ** 2) return false; return true; };

  // civic ring: domes, halls, plazas
  const domes = [15, 18.5, 22].map((R) => { const a = meshDome(R, 0), b = meshDome(R, 1); return { R, solid: type([a.solid, b.solid], K.SOLID, 260, 1e9, 1e9), glass: type([a.glass, b.glass], K.GLASS, 260, 1e9, 1e9, 0, NO_NEAR) }; });
  const hm = new MB(1 << 16), hallAnchors = [];
  for (let k = 0; k < 6; k++) {
    const A = TOWERS[k];
    for (const sd of [-1, 1]) {
      let a = A + sd * rr(15.5, 18.5) * DEG, r = rr(170, 178), d = domes[(k * 2 + (sd > 0 ? 1 : 0)) % 3], tries = 0;
      // keep clear of bays and canal edges: step inwards, then try a smaller dome
      while (edgeDist(r * cos(a), r * sin(a)) < d.R + 9.5 && tries++ < 40) { if (tries % 4 === 0 && d.R > 15) d = domes[domes.indexOf(d) - 1]; else { r -= 2.5; a += sd * 0.6 * DEG; } }
      if (AUTO && edgeDist(r * cos(a), r * sin(a)) < d.R + 5) console.log(`dome ${k}/${sd} overhangs its quay`);
      const x = r * cos(a), z = r * sin(a);
      put(d.solid, x, LAND, z, 1, qYaw(rng() * 6)); put(d.glass, x, LAND, z); occ.push([x, z, d.R + 5.5]); hard.domes.push(x, z, d.R); paint(x, z, d.R + 9, 0, 255, 2);
      // a garden under the glass
      for (let i = 0; i < 9; i++) { const b = rng() * TAU, q = i ? rr(3, d.R - 6) : 0; tree(i ? ['olive', 'bloom', 'olive'][i % 3] : 'plane', x + q * cos(b), LAND + 0.9, z + q * sin(b), (i ? 0.95 : 1) * d.R / 18); }
      for (let i = 0; i < 26; i++) { const b = rng() * TAU, q = rr(1, d.R - 2.5); shrub((rng() * 5) | 0, x + q * cos(b), LAND + 0.9, z + q * sin(b)); }
      // beds and cypress around the steps, only on dry ground
      const dry = (X, Z, m) => zoneOf(X, Z) === 2 && edgeDist(X, Z) > m;
      for (let i = 0; i < 20; i++) {
        const b = i / 20 * TAU + rng() * 0.1, q = d.R + 6.6, X = x + q * cos(b), Z = z + q * sin(b), X2 = x + (q + 1.5) * cos(b), Z2 = z + (q + 1.5) * sin(b); if (i % 5 === 0) continue;
        if (dry(X, Z, 1.6)) shrub((k + i * 3) % 5, X, LAND, Z); if (i % 5 === 2 && dry(X2, Z2, 2)) tree('cypress', X2, LAND, Z2, 0.8);
      }
    }
    // arcaded hall along the moat, facing the sanctuary
    const a0 = A - 20.5 * DEG, a1 = A + 20.5 * DEG; let rm = 0; for (let t = a0; t <= a1; t += 0.02) rm = max(rm, RB.moat(t));
    const rc = rm + 10.5; hall(hm, rc, a0, a1, 11, -1, k, hallAnchors); hard.halls.push(rc, (a0 + a1) / 2, (a1 - a0) / 2, 11);
    for (let t = a0; t <= a1; t += 0.03) occ.push([rc * cos(t), rc * sin(t), 7]);
  }
  put(type([hm.build()], K.SOLID), 0, 0, 0);
  for (const a of hallAnchors) { if (a[4] === 0) { if (rng() < 0.5) vine(a[0], a[1], a[2], a[3]); } else shrub((rng() * 5) | 0, a[0], a[1], a[2], 1.1); }
  // towers stand clear
  for (let k = 0; k < 6; k++) occ.push([TOWER_R * cos(TOWERS[k]), TOWER_R * sin(TOWERS[k]), 12]);

  // garden quarter: villas
  const NV = 14, villas = [];
  // Low: one level coarser (far level: windows laid on plain walls, see `bay`)
  for (let v = 0; v < NV; v++) { const a = meshVilla(v + 1, low ? 1 : 0), b = meshVilla(v + 1, low ? 2 : 1); villas.push({ ty: type([a.mesh, b.mesh], K.SOLID, 330, 1e9, 3000), anchors: a.anchors }); hard.shapes.push(...a.shape); }
  const PLASTER = [[0.92, 0.85, 0.72], [0.9, 0.86, 0.78], [0.84, 0.84, 0.82], [0.72, 0.86, 0.84], [0.93, 0.74, 0.7], [0.93, 0.9, 0.84], [0.9, 0.8, 0.62]];
  let nVilla = 0;
  const villa = (x, y, z, yaw) => {
    const vi = (rng() * NV) | 0, v = villas[vi], s = rr(0.92, 1.1), c = PLASTER[(rng() * PLASTER.length) | 0], co = cos(yaw), si = sin(yaw);
    put(v.ty, x, y, z, s, qYaw(yaw), rgb(c[0], c[1], c[2])); occ.push([x, z, 8.2 * s]); nVilla++; hard.villas.push(x, y, z, co, si, s, vi);
    if (hypot(x, z) < 420) { paint(x, z, 9.5, 2, 200, 2.5); paint(x, z, 7, 1, 230, 2); }
    for (const a of v.anchors) {
      const X = x + (a[0] * co + a[2] * si) * s, Z = z + (-a[0] * si + a[2] * co) * s, Y = y + a[1] * s;
      if (a[4] === 0) { if (rng() < 0.7) vine(X, Y, Z, a[3] + yaw, rng() < 0.6 ? 1 : (rng() * 3) | 0); } else if (a[4] === 1) { shrub((rng() * 5) | 0, X, Y, Z, 1.1); if (rng() < 0.5) put(tUrn, X + 1, Y, Z + 0.6, 1.2); } else if (rng() < 0.8) planter(X, Y, Z, a[3] + yaw);
    }
  };
  for (const [fi, fo] of [[RB.mid, RB.chi], [RB.cho, RB.gar]]) for (let r = 262; r < 372; r += 21.5) {
    const n = floor(TAU * r / 25);
    for (let i = 0; i < n; i++) {
      const t = (i + rr(0.15, 0.85)) / n * TAU, q = r + rr(-6, 6), x = q * cos(t), z = q * sin(t);
      if (q < fi(t) + 12 || q > fo(t) - 12 || spokeLat(x, z) < 18 || !free(x, z, 9)) continue;
      villa(x, LAND, z, t + (rng() < 0.5 ? 0 : PI) + rr(-0.5, 0.5));
    }
  }

  // bambine e bambini che giocano (aggiunta): un girotondo su ogni viale dell'anello civico, una rincorsa sui viali del
  // quartiere dei giardini. Fixed yaws, no rng() calls, so the rest of the city is built exactly as before.
  // Moving geometry: not baked into the static shadows.
  const tKids = [0, 1].map((m) => [0, 1, 2].map((v) => type([meshKids(m, m ? 4 : 6, 900 + m * 10 + v)], K.SOLID, 1e9, 1e9, 450, 0, NO_BAKE)));
  for (let k = 0; k < 6; k++) for (const [m, r] of [[0, 162], [1, 282]]) {
    const s = SPOKES[k], x = r * cos(s), z = r * sin(s);
    if (zoneOf(x, z) !== (m ? 4 : 2) || edgeDist(x, z) < (m ? 6 : 4)) continue;
    put(tKids[m][(k + m) % 3], x, LAND, z, 1, qYaw(k * 1.7 + m), rgb(1, 1, 1, (k * 2 + m + 1) / 13));
    if (AUTO) console.log(`bambini ${m ? 'rincorsa' : 'girotondo'} spoke ${k} at ${x.toFixed(1)},${z.toFixed(1)}`);
  }
  // trees and flowers in the city
  // spoke cypress rows: the city's vertical rhythm
  for (const s of SPOKES) for (let r = 128; r < 640; r += 8.5) for (const sd of [-1, 1]) {
    const x = r * cos(s) - sd * 10.6 * sin(s), z = r * sin(s) + sd * 10.6 * cos(s), zn = zoneOf(x, z);
    if (r < 420 ? (zn === 4 || zn === 6) && edgeDist(x, z) > 13 && free(x, z, 1.5) : abs(angd(s, PI / 2)) > 0.1 && coastR(s) - r > 30 && rng() < 0.7) tree('cypress', x, r < 420 ? LAND : gH(x, z), z);
    // planters along the paved edge
    if (r < 420 && (zn === 2 || zn === 4 || zn === 6) && edgeDist(x, z) > 4) { const px = (r + 4.2) * cos(s) - sd * 8.4 * sin(s), pz = (r + 4.2) * sin(s) + sd * 8.4 * cos(s); if (zoneOf(px, pz) === zn && edgeDist(px, pz) > 3) planter(px, LAND, pz, -s); }
  }
  const pick = (x, z) => { const h = rng(), n = fbm(x / 60 + 5, z / 60 + 2, 2); return h < 0.17 ? 'cypress' : h < 0.17 + 0.28 * (1.3 - n) ? 'olive' : h < 0.56 ? 'plane' : h < 0.65 ? 'pine' : 'bloom'; };
  for (let gx = -420; gx < 420; gx += 6.3) for (let gz = -420; gz < 420; gz += 6.3) {
    const x = gx + rr(0, 5.8), z = gz + rr(0, 5.8), zn = zoneOf(x, z);
    if (zn !== 2 && zn !== 4 && zn !== 6) continue;
    const ed = edgeDist(x, z); if (ed < 2.6 || spokeLat(x, z) < 12.5 || !free(x, z, zn === 2 ? 2 : -1.2)) continue;
    if (rng() > (zn === 2 ? 0.42 : 0.86)) continue;
    const k = pick(x, z); tree(k, x, LAND, z, zn === 2 ? 0.9 : 1, undefined, undefined, zn !== 2); if (zn !== 2) paint(x, z, 1.4, 1, 180, 1.5); else { paint(x, z, 1.2, 0, 0, 0.8); paint(x, z, 1.2, 1, 255, 0.8); shrub(3, x + 0.5, LAND, z + 0.3, 0.6); shrub((rng() * 5) | 0, x - 0.4, LAND, z - 0.5, 0.6); }
  }
  // flower beds: drifts of one kind, thickest by villas and paths
  for (let gx = -420; gx < 420; gx += 2.5) for (let gz = -420; gz < 420; gz += 2.5) {
    const x = gx + rr(0, 2.3), z = gz + rr(0, 2.3), zn = zoneOf(x, z);
    if (zn !== 4 && zn !== 6 && zn !== 2) continue;
    const n = fbm(x / 23 + 9, z / 23 + 1, 3), ed = edgeDist(x, z);
    if (ed < 1.4 || spokeLat(x, z) < 8.3 || !free(x, z, 0.3)) continue;
    const bed = zn === 2 ? (n > 0.64 && MAP[((floor(z + 1024) * 2048 + floor(x + 1024)) * 4)] < 128) : n > 0.43 || ed < 5 && n > 0.3;
    if (!bed || rng() < 0.2) continue;
    shrub(floor(fbm(x / 41 + 3, z / 41 + 7, 2) * 9) % 5, x, LAND, z); paint(x, z, 1.3, 1, 255, 1);
  }
  // civic plazas: beds cut into the paving
  for (let i = 0; i < 2600; i++) {
    const t = rng() * TAU, r = rr(130, 214), x = r * cos(t), z = r * sin(t);
    if (zoneOf(x, z) !== 2 || edgeDist(x, z) < 3.2 || spokeLat(x, z) < 9 || !free(x, z, 1.2) || fbm(x / 19 + 2, z / 19 + 6, 2) < 0.52) continue;
    shrub(floor(fbm(x / 37 + 13, z / 37 + 1, 2) * 9) % 5, x, LAND, z); paint(x, z, 1.5, 0, 0, 1.2); paint(x, z, 1.5, 1, 255, 1.2);
  }
  // vines over the quay walls; here and there steps down to the water
  const tLanding = type([meshLanding(0), meshLanding(1)], K.SOLID, 75, 1e9, 1500);
  for (const [f, land] of [[RB.moat, 1], [RB.civ, -1], [RB.mid, 1], [RB.chi, -1], [RB.cho, 1], [RB.gar, -1], [RB.out, 1]]) {
    let next = rr(10, 50);
    for (let t = 0; t < TAU;) {
      const R = f(t), x = R * cos(t), z = R * sin(t), dR = (f(t + 1e-3) - f(t - 1e-3)) / 2e-3, tx = dR * cos(t) - R * sin(t), tz = dR * sin(t) + R * cos(t), l = hypot(tx, tz);
      // outward boundary normal; the vine faces the water
      const nx = tz / l * -land, nz = -tx / l * -land;
      next -= 2.7;
      if (f === RB.out && abs(angd(t, RIV_MOUTH.t)) * R < 16) { t += 2.7 / l; continue; } // river mouth: see below
      if (next < 0 && f !== RB.moat && f !== RB.chi && f !== RB.cho && spokeLat(x, z) > 18) { put(tLanding, x + nx * 0.25, 10.3, z + nz * 0.25, 1, qYaw(atan2(nx, nz))); next = rr(45, 85); t += 6 / l; continue; }
      if (spokeLat(x, z) > 9 && fbm(t * R / 26 + R, 3.3, 2) > (f === RB.moat ? 0.6 : 0.47) && rng() < 0.8) vine(x + nx * 0.1, 10.28, z + nz * 0.1, atan2(nx, nz));
      t += 2.7 / l;
    }
  }

  // outer shelf: villas, woods, shore rocks
  const inWood = (x, z) => woodAt(x, z) > 0.62;
  const onMap = (x, z, ch) => (abs(x) < 1023 && abs(z) < 1023 ? MAP[(floor(z + 1024) * 2048 + floor(x + 1024)) * 4 + ch] : 0);
  for (let i = 0, n = 0; i < 900 && n < 46; i++) {
    const t = rng() * TAU, r = rr(455, 800), x = r * cos(t), z = r * sin(t);
    if (coastR(t) - r < 45 || spokeLat(x, z) < 20 || !free(x, z, 22) || abs(angd(t, PI / 2)) < 0.85 || riverDist(x, z) < 45) continue;
    const h = gH(x, z); if (abs(gH(x + 6, z) - h) + abs(gH(x, z + 6) - h) > 1.3 || h < 6) continue;
    villa(x, h - 0.1, z, rng() * TAU); n++; paint(x, z, 15, 3, 0, 6);
    for (let k = 0; k < 9; k++) { const b = rng() * TAU, q = rr(10, 20), X = x + q * cos(b), Z = z + q * sin(b); tree(k < 3 ? 'cypress' : pick(X, Z), X, gH(X, Z), Z); }
    for (let k = 0; k < 14; k++) { const b = rng() * TAU, q = rr(8.5, 13), X = x + q * cos(b), Z = z + q * sin(b); shrub((rng() * 5) | 0, X, gH(X, Z), Z); }
  }
  for (let gx = -1000; gx < 1000; gx += 8) for (let gz = -1000; gz < 1000; gz += 8) {
    const x0 = gx + 4, z0 = gz + 4, r = hypot(x0, z0), t = atan2(z0, x0); if (r < RB.out(t) + 14 || coastR(t) - r < 12 || r > 1050) continue;
    if (spokeLat(x0, z0) < 9 || !free(x0, z0, 6) || riverDist(x0, z0) < 19) continue;
    if (inWood(x0, z0)) { const x = gx + rr(0, 8), z = gz + rr(0, 8); tree(pick(x, z), x, gH(x, z), z, 1.1, undefined, 0.6); } // woods: a closed canopy, crowns may meet
    else if (rng() < 0.05 && onMap(x0, z0, 3) < 80) { const x = gx + rr(0, 8), z = gz + rr(0, 8); tree(rng() < 0.5 ? 'cypress' : 'olive', x, gH(x, z), z); } // a lone tree, not in a tilled field
  }
  // Medium: coarse level from 150 m; Low: only a coarse one
  const rocks = [1, 2, 3].map((s) => type(QL([meshRock(s)], [meshRock(s), meshRock(s, 4)], [meshRock(s, 3)]), K.SOLID, LV === 1 ? 150 : 1e9, 1e9, 1500));
  for (let t = 0; t < TAU; t += 0.004) {
    if (abs(angd(t, PI / 2)) < 0.8 || rng() < 0.35) continue;
    const r = coastR(t) + rr(-16, 26), x = r * cos(t), z = r * sin(t), h = gH(x, z); if (h > 3.5 || h < -3) continue;
    put(rocks[(rng() * 3) | 0], x, h - 0.2, z, rr(0.8, 4.2), qMul(qYaw(rng() * 6), qAxis(1, 0, 0.3, rr(-0.5, 0.5))), 0xffffffff, rr(0.6, 1.1));
  }
  // forest on the lower mountain slopes, thinning with height
  for (let gx = -2900; gx < 3100; gx += 15) for (let gz = -3300; gz < -430; gz += 15) {
    const x = gx + rr(0, 15), z = gz + rr(0, 15), r = hypot(x, z); if (r < 700 || northOf(x, z) < 0.25) continue;
    const h = gH(x, z); if (h < 12 || h > 330 + 130 * fbm(x / 300, z / 300, 2)) continue;
    if (abs(gH(x + 8, z) - h) + abs(gH(x, z + 8) - h) > 9 || fbm(x / 210 + 1, z / 210 + 5, 3) < 0.36 + h / 1400 || riverDist(x, z) < 15) continue;
    tree(rng() < 0.55 ? 'pine' : rng() < 0.6 ? 'plane' : 'cypress', x, h, z, rr(1.2, 1.9), undefined, 0.55);
  }

  // farmland: lanes, farms, orchards, hedges and walls
  // what stands on the parcels (painted in world.js); the wild land below uses the second random stream
  rng = rngB;
  // clear of canal, coast, river, spoke roads, harbour and buildings
  const open = (x, z, m = 3) => { const r = hypot(x, z), t = atan2(z, x); return r - RB.out(t) > 26 && coastT(t) - r > 28 && riverDist(x, z) > RIV_SHELF + 6 && spokeLat(x, z) > 8.5 && abs(angd(t, PI / 2)) > 48 * DEG && free(x, z, m); };
  // is a circle clear of the trees planted so far?
  const noTree = (x, z, r) => { const cx = floor(x / CELL), cz = floor(z / CELL), n = ceil((r + 8) / CELL); for (let i = cx - n; i <= cx + n; i++) for (let j = cz - n; j <= cz + n; j++) { const c = planted.get(i * 8192 + j); if (c) for (let q = 0; q < c.length; q += 3) if ((x - c[q]) ** 2 + (z - c[q + 1]) ** 2 < (r + c[q + 2] * 0.5) ** 2) return false; } return true; };
  const tHedge = [0, 1].map((v) => type([0, 1, 2].map((l) => meshHedge(v, l)), K.LEAF, 110, 260, 1500, 500)), tWall = type([meshFieldWall()], K.SOLID, 1e9, 1e9, 1300);
  const tFarm = [0, 1, 2].map((v) => type([meshFarm(v, 0), meshFarm(v, 1)], K.SOLID, 300, 1e9, 3000));
  const FIELDSTONE = rgb(0.74, 0.69, 0.62); // darker than the shore rocks
  const NBAND = 11, LANES = [2, 5], secLen = (b) => TAU * (440 + (b + 0.5) * PB) / parcelN(b);
  // lanes: a track along two rings of boundaries, all the way round
  for (const b of LANES) { const n = parcelN(b); for (let v = 0; v < n; v += 1.5 / secLen(b)) { const [x, z] = parcelPt(b, v, b); if (open(x, z, 4)) { paint(x, z, 1.5, 0, 255, 1.3); paint(x, z, 2.4, 3, 0, 1.5); paint(x, z, 1.4, 2, 0, 1.5); } } }
  let nFarm = 0, nEdge = 0;
  for (let b = 0; b < NBAND; b++) for (let s = 0, n = parcelN(b); s < n; s++) {
    const use = parcelUse(b, s); if (!use.farm) continue;
    // a farmstead with trees in the corner of every other parcel with level ground
    if (h2(b * 3 + 1, s * 11 + 5) < 0.5) {
      const [x, z] = parcelPt(b + 0.24, s + 0.26, b), h = gH(x, z);
      if (open(x, z, 15) && noTree(x, z, 11) && h > 6 && abs(gH(x + 8, z) - h) + abs(gH(x, z + 8) - h) < 1.1) {
        const c = PLASTER[(rng() * PLASTER.length) | 0], yaw = -atan2(z, x) + (rng() < 0.5 ? 0 : PI) + rr(-0.3, 0.3);
        put(tFarm[nFarm++ % 3], x, h - 0.12, z, rr(0.95, 1.1), qYaw(yaw), rgb(c[0], c[1], c[2])); occ.push([x, z, 11.5]); paint(x, z, 13, 3, 0, 4); paint(x, z, 12, 2, 0, 3); paint(x, z, 9.5, 0, 255, 3);
        for (let k = 0; k < 5; k++) { const a = rng() * TAU, q = rr(12.5, 17), X = x + q * cos(a), Z = z + q * sin(a); tree(k < 2 ? 'cypress' : k < 4 ? 'olive' : 'plane', X, gH(X, Z), Z); }
        for (let k = 0; k < 6; k++) { const a = rng() * TAU, q = rr(11.5, 14), X = x + q * cos(a), Z = z + q * sin(a); shrub((rng() * 5) | 0, X, gH(X, Z), Z); }
      }
    }
    // orchard rows following the parcel
    if (use.kind === 4) for (let fu = 0.1; fu < 0.92; fu += 7.6 / PB) for (let fv = 0.08; fv < 0.94; fv += 7.6 / secLen(b)) {
      const [x, z] = parcelPt(b + fu, s + fv, b); if (open(x, z, 5)) tree(use.id < 0.5 ? 'olive' : 'bloom', x, gH(x, z), z, 0.62, undefined, 0.6);
    }
  }
  // a boundary from one parcel corner to the next: nothing, hedge, dry-stone wall or tree row; pts ~6 m apart
  const edgeRun = (pts, pick01) => {
    const kind = pick01 < 0.26 ? 0 : pick01 < 0.62 ? 1 : pick01 < 0.8 ? 2 : 3, sort = ['cypress', 'olive', 'plane'][floor(pick01 * 97) % 3]; if (!kind) return;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], c = pts[i + 1], x = (a[0] + c[0]) / 2, z = (a[1] + c[1]) / 2, L = hypot(c[0] - a[0], c[1] - a[1]), y = gH(x, z); if (L < 2 || y < 3 || !open(x, z) || onMap(x, z, 0) > 60) continue;
      const q = qYaw(-atan2(c[1] - a[1], c[0] - a[0])), k = L / 6.2; nEdge++;
      if (kind === 1) put(tHedge[i & 1], x, y - 0.1, z, k, q, tintOf('shrub', 0), rr(0.85, 1.25) / k);
      else if (kind === 2) put(tWall, x, y, z, k, q, FIELDSTONE, 1 / k);
      else if (i % 2 === 0) tree(sort, x, y, z, 0.85, undefined, 0.6);
    }
  };
  const line = (n, f) => { const p = []; for (let i = 0; i <= n; i++) p.push(f(i / n)); return p; };
  for (let b = 0; b < NBAND; b++) for (let s = 0, n = parcelN(b), sl = secLen(b); s < n; s++) {
    const use = parcelUse(b, s), m = parcelPt(b - 0.1, s + 0.5, b), pin = parcelAt(m[0], m[1]), lane = LANES.includes(b);
    // inner edge (a lane has one each side), then the edge towards the next sector
    if (use.farm || parcelUse(pin.b, pin.s).farm) for (const off of lane ? [-3.3, 3.3] : [0]) edgeRun(line(max(1, round(sl / 6.2)), (f) => parcelPt(b + off / PB, s + f, b)), h2(b * 13 + 7 + (off > 0 ? 50 : 0), s * 5 + 2) * (lane ? 0.74 : 1) + (lane ? 0.26 : 0));
    if (use.farm || parcelUse(b, (s + 1) % n).farm) edgeRun(line(10, (f) => parcelPt(b + f, s + 1, b)), h2(b * 13 + 1, s * 5 + 2));
  }
  if (AUTO) console.log(`farms ${nFarm} · boundary segments ${nEdge}`);

  // wild land: bushes, flower drifts, boulders
  // wherever nothing else stands, on the shelf and the open foothills
  const wild = (x, z, hill) => {
    if (bare(x, z)) return;
    const dn = fbm(x / 75 + 2.2, z / 75 + 9.1, 2), q = rng();
    if (q < 0.12 + 0.5 * sstep(0.4, 0.7, dn)) { // bushes, alone or a few
      for (let i = 0, n = 1 + ((rng() * 3) | 0); i < n; i++) { const X = x + rr(-3.5, 3.5), Z = z + rr(-3.5, 3.5); put(shrubs[3], X, gH(X, Z) - 0.1, Z, rr(1.3, 2.7), qYaw(rng() * TAU), tintOf(rng() < 0.4 ? 'olive' : 'shrub', 4), rr(0.7, 1.1)); }
    } else if (q < 0.75 && fbm(x / 38 + 6.1, z / 38 + 1.7, 2) > 0.58) { // a drift of one flower
      const k = [1, 4, 0, 2][floor(fbm(x / 160 + 3, z / 160 + 8, 2) * 8) & 3]; for (let i = 0; i < 4; i++) { const X = x + rr(-5, 5), Z = z + rr(-5, 5); shrub(k, X, gH(X, Z), Z, 0.8); }
    } else if (q > (hill ? 0.8 : 0.9)) { // boulders, half sunk
      for (let i = 0, n = 1 + ((rng() * 3) | 0); i < n; i++) { const X = x + rr(-4, 4), Z = z + rr(-4, 4), s = rr(0.5, hill ? 3.2 : 1.9); put(rocks[(rng() * 3) | 0], X, gH(X, Z) - 0.3 * s, Z, s, qMul(qYaw(rng() * 6), qAxis(1, 0, 0.3, rr(-0.4, 0.4))), FIELDSTONE, rr(0.6, 1.1)); }
    }
  };
  for (let gx = -1160; gx < 1160; gx += 13) for (let gz = -1160; gz < 1160; gz += 13) {
    const x = gx + rr(0, 13), z = gz + rr(0, 13), r = hypot(x, z), t = atan2(z, x);
    if (r < RB.out(t) + 16 || r > 1160 || coastT(t) - r < 8 || abs(angd(t, PI / 2)) < 45 * DEG || onMap(x, z, 3) > 80 || onMap(x, z, 0) > 80 || spokeLat(x, z) < 7 || riverDist(x, z) < RIV_SHELF || !free(x, z, 2) || gH(x, z) < 2.5) continue;
    wild(x, z, false);
  }
  for (let gx = -2900; gx < 3100; gx += 16) for (let gz = -3400; gz < -500; gz += 16) {
    const x = gx + rr(0, 16), z = gz + rr(0, 16), r = hypot(x, z); if (r <= 1160 || northOf(x, z) < 0.15 || riverDist(x, z) < RIV_SHELF) continue;
    const h = gH(x, z); if (h < 2.5 || h > 520 || abs(gH(x + 8, z) - h) + abs(gH(x, z + 8) - h) > 11) continue;
    wild(x, z, true);
  }
  rng = rngA;

  // moored craft stay put; flying ones are moved by the vertex shader, so never culled and not baked into shadows
  const tCraftIdle = type([meshCraft()], K.SOLID, 1e9, 1e9, 2500), tCraft = type([meshCraft()], K.SOLID, 1e9, 1e9, 1e9, 0, ALWAYS | NO_BAKE);
  // harbour: stepped quays, south pier, breakwaters
  const xm = new MB(1 << 15), S90 = PI / 2;
  // steps rising 0.18 m up and in from (r, y)
  const steps = (r, y, n) => { const p = []; for (let i = 0; i < n; i++) { p.push([r, y + 0.18, M.STEP]); r -= 0.3; y += 0.18; p.push([r, y, M.STEP]); } return p; };
  // occlusion for flights [r, y, n]: the back of each tread is darker, so a stair reads as steps from any side
  const stepAO = (...fl) => (r, y) => { for (const [r0, y0, n] of fl) if (r <= r0 + 0.01 && r >= r0 - n * 0.3 - 0.01 && y >= y0 - 0.01) return (r0 - r) / 0.3 - (y - y0) / 0.18 > -0.5 ? 0.5 : 1; return y < 1 ? 0.6 + 0.4 * sstep(-6, 1, y) : 1; };
  // quays: ten sectors of one mesh, each with its own LOD (a ramp beyond ~130 m, see meshPodiumStair)
  const QC = 466, QS = 8.6 * DEG;
  const quay = (far) => { const m = new MB(1 << 13), st = (r, y, n) => (far ? [] : steps(r, y, n)), fl = (r) => (r < 479.3 && r > 471.9) || (r < 461.3 && r > 453.9); m.ea = 255;
    m.lathe([[487, -7, M.QUAY], [487, 1.26, M.TRIM], [486.9, 1.36, M.TERRACE], [479.2, 1.36, M.STEP], ...st(479.2, 1.36, 24), [472, 5.68, M.TERRACE], [461.2, 5.68, M.STEP], ...st(461.2, 5.68, 24), [454, 10, M.TERRACE], [444, 10, M.TRIM], [444, 9.6]],
      { seg: 11, cx: -QC, a0: -QS / 2 - 3e-4, a1: QS / 2 + 3e-4, up: far ? M.STEP : undefined, ao: far ? (r, y) => (y < 1 ? 0.6 + 0.4 * sstep(-6, 1, y) : fl(r) ? 0.8 : 1) : stepAO([479.2, 1.36, 24], [461.2, 5.68, 24]) }); return m.build(); };
  const tQuay = type([quay(0), quay(1)], K.SOLID, 105, 1e9, 1e9);
  for (let k = 0; k < 10; k++) { const a = S90 + (k - 4.5) * QS; put(tQuay, QC * cos(a), 0, QC * sin(a), 1, qYaw(-a)); }
  // quay ends: a closing wall and a kerb; the terrain beside takes the same section (quayY)
  for (const sd of [-1, 1]) {
    const a = S90 + sd * QUAY_END, c = cos(a), s = sin(a), tx = -s * sd, tz = c * sd; // t: away from the quays
    const Wp = (r, y, w) => [r * c + tx * w, y, r * s + tz * w], sec = [[444, 10], [454, 10], [461.2, 5.68], [472, 5.68], [479.2, 1.36], [487, 1.36]];
    const Qd = (p, n, ao = 1) => xm.quad(...p.map((q) => xm.v(q[0], q[1], q[2], n[0], n[1], n[2], ao)));
    xm.mat = M.QUAY; xm.ea = 255; xm.poly([[444, -7], ...sec, [487, -7]].map((p) => Wp(p[0], p[1], 0)), [tx, 0, tz], 0.85); xm.ea = 0;
    xm.mat = M.TRIM;
    for (let i = 0; i < sec.length - 1; i++) {
      const [r0, y0] = sec[i], [r1, y1] = sec[i + 1], sl = (y1 - y0) / (r1 - r0), T = 0.4, B = 0.6;
      Qd([Wp(r0, y0 + T, 0), Wp(r1, y1 + T, 0), Wp(r1, y1 + T, B), Wp(r0, y0 + T, B)], [-sl * c, 1, -sl * s]);
      Qd([Wp(r0, y0 + T, B), Wp(r1, y1 + T, B), Wp(r1, y1 - 1.4, B), Wp(r0, y0 - 1.4, B)], [tx, 0, tz]);
      Qd([Wp(r0, y0 + T, 0), Wp(r1, y1 + T, 0), Wp(r1, y1 - 0.25, 0), Wp(r0, y0 - 0.25, 0)], [-tx, 0, -tz]);
    }
    Qd([Wp(487, 1.76, 0), Wp(487, 1.76, 0.6), Wp(487, -7, 0.6), Wp(487, -7, 0)], [c, 0, s], 0.9);
    Qd([Wp(444, 10.4, 0), Wp(444, 10.4, 0.6), Wp(444, 8.6, 0.6), Wp(444, 8.6, 0)], [-c, 0, -s]);
  }
  xm.ea = 255;
  for (const sd of [-1, 1]) {
    const a0 = S90 + sd * 8 * DEG, a1 = S90 + sd * 37 * DEG;
    xm.lathe([[646, -7, M.QUAY], [646, 2.6, M.TRIM], [645.9, 2.7, M.PAVE], [634.1, 2.7, M.TRIM], [634, 2.6, M.QUAY], [634, -7]], { seg: 50, a0: min(a0, a1), a1: max(a0, a1) });
    // round heads a step above the arm, against z-fighting
    xm.lathe([[9, -7, M.QUAY], [9, 2.72, M.TRIM], [8.9, 2.82, M.PAVE], [5, 2.82, M.TRIM], [5, 3.6], [4.9, 3.7, M.PAVE], [0, 3.7]], { seg: 20, cx: 640 * cos(a0), cz: 640 * sin(a0) });
    cupola(xm, 640 * cos(a0), 3.7, 640 * sin(a0), 2.6, 0);
    xm.lathe([[7.6, -7, M.QUAY], [7.6, 2.72, M.TRIM], [7.5, 2.82, M.PAVE], [0, 2.82]], { seg: 16, cx: 640 * cos(a1), cz: 640 * sin(a1) });
  }
  xm.ea = 0;
  const pier = bridge(xm, 0, 446, 0, 598, SPOKE_W, 10.3, 10.3, 0, 9, -7, 1);
  for (const sd of [-1, 1]) for (let i = 0; i < 19; i++) balRun([sd * (SPOKE_W - 0.19), 10.64, 446 + i * 8], [sd * (SPOKE_W - 0.19), 10.64, 454 + i * 8]);
  // pier deck lies on the round head (a little lower, same reason)
  xm.ea = 255; xm.lathe([[16, -7, M.QUAY], [16, 9.96, M.TRIM], [15.9, 10.26, M.PAVE], [0, 10.26]], { seg: 32, cz: 608, ao: (r, y) => 0.6 + 0.4 * sstep(0, 4, y) }); xm.ea = 0;
  cupola(xm, 0, 10.26, 608, 4.2, 0);
  for (let i = 3; i < 21; i++) { const a = i / 24 * TAU - S90 + PI / 24, b = (i + 1) / 24 * TAU - S90 + PI / 24; balRun([15.4 * cos(a), 10.26, 608 + 15.4 * sin(a)], [15.4 * cos(b), 10.26, 608 + 15.4 * sin(b)]); }

  // finger piers with moored craft, pavilions on the middle terrace
  xm.ea = 255;
  for (let k = -5; k <= 5; k++) {
    if (!k) continue; const a = S90 + k * 6.6 * DEG, c = cos(a), s = sin(a);
    xm.fr = [487 * c, 0, 487 * s, cos(-a), sin(-a), 1]; xm.mat = M.QUAY; xm.box(-0.5, -7, -1.6, 26, 1.1, 1.6, 0.06); xm.mat = M.TERRACE; xm.box(-0.5, 1.1, -1.7, 26.1, 1.36, 1.7, 0.05); xm.fr = null;
    put(tCraftIdle, 505 * c - 3.6 * s, 1.5, 505 * s + 3.6 * c, 1, qYaw(-a), rgb(1, 1, 1, (k + 6) / 12));
    if (k % 2) cupola(xm, 466.5 * c, 5.68, 466.5 * s, 2.4, 0);
  }
  xm.ea = 0;
  // harbour terraces: planters and trees, two halls above, moored craft below
  for (let a = S90 - 40 * DEG; a < S90 + 40 * DEG; a += 8.6 / 460) {
    if (abs(a - S90) < 0.03) continue; const c = cos(a), s = sin(a), i = round(a * 460 / 8.6);
    planter(450.5 * c, 10, 450.5 * s, -a + S90); planter(470.6 * c, 5.68, 470.6 * s, -a + S90);
    if (i % 3 === 0) { tree('cypress', 447 * c, 10, 447 * s, 0.9); tree(i % 2 ? 'bloom' : 'olive', 465 * c, 5.68, 465 * s, 0.9); put(tUrn, 484.5 * c, 1.36, 484.5 * s, 1.5); }
    if (i % 5 === 2) put(tCraftIdle, 491.5 * c, 1.5, 491.5 * s, 1, qYaw(-a + (i % 2 ? 0.3 : 2.8)), rgb(1, 1, 1, (i * 37 % 255) / 255));
  }
  { const hm2 = new MB(1 << 15), an = []; for (const sd of [-1, 1]) { hall(hm2, 433, S90 + min(sd * 4.5, sd * 23) * DEG, S90 + max(sd * 4.5, sd * 23) * DEG, 9, 1, 9 + sd, an); hard.halls.push(433, S90 + sd * 13.75 * DEG, 9.25 * DEG, 9); }
    put(type([hm2.build()], K.SOLID), 0, 0, 0); for (const a of an) { if (a[4] === 0) { if (rng() < 0.5) vine(a[0], a[1], a[2], a[3]); } else shrub((rng() * 5) | 0, a[0], a[1], a[2], 1.1); } }

  // west quay: a bastion on a headland, steps down to the sea
  {
    const [cx, cz] = WQ, a0 = 205 * DEG, a1 = 290 * DEG, top = 16.3, n = 82, re = 24 + n * 0.3 + 3.4;
    // the steps: own mesh around the sector's middle, a ramp from afar
    { const am = (a0 + a1) / 2, ox = 38 * cos(am), oz = 38 * sin(am);
      const fl = (far) => { const m = new MB(1 << 14); m.ea = 255;
        m.lathe([[re, -6, M.QUAY], [re, 1.44, M.TRIM], [re - 0.1, 1.54, M.PAVE], [24 + n * 0.3, 1.54, M.STEP], ...(far ? [] : steps(24 + n * 0.3, 1.54, n)), [24, top, M.PAVE], [22, top, M.PAVE]],
          { seg: 44, cx: -ox, cz: -oz, a0, a1, up: far ? M.STEP : undefined, ao: far ? (r, y) => (y < 1 ? 0.6 + 0.4 * sstep(-6, 1, y) : r > 24.1 && r < 24 + n * 0.3 ? 0.8 : 1) : stepAO([24 + n * 0.3, 1.54, n]) }); return m.build(); };
      put(type([fl(0), fl(1)], K.SOLID, 105, 1e9, 1e9), cx + ox, 0, cz + oz); }
    xm.ea = 255;
    xm.lathe([[24.4, 2, M.QUAY], [24.4, top - 0.3, M.TRIM], [24.3, top, M.PAVE], [0, top]], { seg: 64, cx, cz, a0: a1, a1: a0 + TAU }); xm.lathe([[22, top, M.PAVE], [0, top]], { seg: 24, cx, cz, a0, a1 });
    // side walls of the stepped sector
    for (const [a, sg] of [[a0, -1], [a1, 1]]) { const c = cos(a), s = sin(a); xm.mat = M.QUAY; xm.quad(xm.v(cx + 24 * c, top, cz + 24 * s, -s * sg, 0, c * sg), xm.v(cx + re * c, 1.5, cz + re * s, -s * sg, 0, c * sg), xm.v(cx + re * c, -6, cz + re * s, -s * sg, 0, c * sg), xm.v(cx + 24 * c, -6, cz + 24 * s, -s * sg, 0, c * sg)); }
    xm.ea = 0;
    // balustrades around the terrace
    const m = 42; for (let i = 0; i < m; i++) { const a = mix(a1, a0 + TAU, i / m), b = mix(a1, a0 + TAU, (i + 1) / m); balRun([cx + 23.7 * cos(a), top, cz + 23.7 * sin(a)], [cx + 23.7 * cos(b), top, cz + 23.7 * sin(b)]); }
    // the steps run between sloping cheek walls (a level balustrade can't follow a flight)
    for (const [a, sg] of [[a0, 1], [a1, -1]]) {
      const c = cos(a), s = sin(a), nx = -s * sg, nz = c * sg, r0 = 24, r1 = 24 + n * 0.3, W = 0.55, yy = (r) => top - (r - 24) * 0.6 + 0.95;
      const P = (r, y, w, n0, n1, n2, ao = 1) => xm.v(cx + r * c + nx * w, y, cz + r * s + nz * w, n0, n1, n2, ao);
      xm.mat = M.TRIM;
      xm.quad(P(r0, yy(r0), W, nx, 0, nz), P(r1, yy(r1), W, nx, 0, nz), P(r1, yy(r1) - 1.3, W, nx, 0, nz, 0.6), P(r0, yy(r0) - 1.3, W, nx, 0, nz, 0.6));
      xm.quad(P(r0, yy(r0), 0, -nx, 0, -nz), P(r1, yy(r1), 0, -nx, 0, -nz), P(r1, yy(r1) - 1, 0, -nx, 0, -nz), P(r0, yy(r0) - 1, 0, -nx, 0, -nz));
      xm.quad(P(r0, yy(r0), 0, 0.6 * c, 1, 0.6 * s), P(r1, yy(r1), 0, 0.6 * c, 1, 0.6 * s), P(r1, yy(r1), W, 0.6 * c, 1, 0.6 * s), P(r0, yy(r0), W, 0.6 * c, 1, 0.6 * s));
      xm.quad(P(r1, yy(r1), 0, c, 0, s), P(r1, yy(r1), W, c, 0, s), P(r1, yy(r1) - 1.3, W, c, 0, s), P(r1, yy(r1) - 1.3, 0, c, 0, s));
      xm.quad(P(r0, yy(r0), 0, -c, 0, -s), P(r0, yy(r0), W, -c, 0, -s), P(r0, top, W, -c, 0, -s), P(r0, top, 0, -c, 0, -s));
    }
    // terrace planting, a villa behind
    for (let i = 0; i < 12; i++) { const a = a1 + 0.2 + i * 0.2, r = 20.5; planter(cx + r * cos(a), top, cz + r * sin(a), -a + PI / 2); if (i % 3 === 1) tree('cypress', cx + (r - 2.5) * cos(a), top, cz + (r - 2.5) * sin(a)); }
    // by the head of the steps (shot P6)
    for (let i = 0; i < 5; i++) { const a = a0 + 0.12 + i * 0.13, r = 20.8; planter(cx + r * cos(a), top, cz + r * sin(a), -a + PI / 2); }
    tree('cypress', cx + 17 * cos(a0 + 0.3), top, cz + 17 * sin(a0 + 0.3), 1.1); tree('bloom', cx + 15 * cos(a0 + 0.75), top, cz + 15 * sin(a0 + 0.75));
    for (let i = 0; i < 40; i++) { const a = a1 + 0.3 + rng() * 2.2, r = rr(13, 19.5); shrub((rng() * 5) | 0, cx + r * cos(a), top, cz + r * sin(a)); }
    tree('olive', cx + 9, top, cz - 12); tree('pine', cx + 15, top, cz + 3); villa(cx + 40, gH(cx + 40, cz + 16) - 0.2, cz + 16, 2.9);
    for (let i = 0; i < 110; i++) { const a = rng() * TAU, r = rr(30, 95), x = cx + 14 + r * cos(a), z = cz + 14 + r * sin(a), h = gH(x, z); if (h < 5 && h > -3.5 && hypot(x - cx, z - cz) > re + 2) put(rocks[(rng() * 3) | 0], x, h - 0.3, z, rr(1, 4.5), qMul(qYaw(rng() * 6), qAxis(1, 0, 0.3, rr(-0.5, 0.5))), 0xffffffff, rr(0.6, 1.1)); }
  }
  put(type([xm.build()], K.SOLID), 0, 0, 0);

  // the river and the mountain waterfalls
  // river: a ribbon at the level layout.js found, white where its bed drops, a fall above its source. At the mouth it
  // runs a few metres into the canal, just under its surface (against z-fighting). FALL params: a across, b bed steepness.
  const rv = new MB(4096), fm = new MB(1 << 14), RV = river(), tops = []; rv.mat = 0; rv.ea = 0; fm.mat = M.FALL;
  { let pa = -1, pb = -1, qa = -1, qb = -1, py = WATER;
    for (let z = RIV_MOUTH.z + 4; z > RV.zh + 34; z -= 3) {
      const x = riverX(z), y = riverLevel(z) - (z > RIV_MOUTH.z - 2 ? 0.012 : 0), dx = riverX(z - 1) - x, l = hypot(dx, 1), w = RIV_SHELF - 2, v = 5;
      const A = rv.v(x - w / l, y, z - w * dx / l, 0, 1, 0), B = rv.v(x + w / l, y, z + w * dx / l, 0, 1, 0); if (pa >= 0) rv.quad(pa, A, B, pb); pa = A; pb = B;
      const sl = (y - py) / (3 * l); fm.eb = round(clamp(sl * 2.5, 0, 1) * 255);
      fm.ea = 0; const C = fm.v(x - v / l, y + 0.1, z - v * dx / l, 0, 1, 0.3); fm.ea = 255; const D = fm.v(x + v / l, y + 0.1, z + v * dx / l, 0, 1, 0.3); if (qa >= 0 && sl > 0.16) fm.quad(qa, C, D, qb); qa = C; qb = D; py = y;
    } }
  put(type([rv.build()], K.WATER), 0, 0, 0);
  // a one-arched bridge carries the quay over the mouth, between abutments closing the quay wall
  { const cm = new MB(2048), t = RIV_MOUTH.t, R = RB.out(t) + 0.33, tx = -sin(t), tz = cos(t), cx = R * cos(t), cz = R * sin(t), L = RIV_GAP + 1.2;
    bridge(cm, cx - tx * L, cz - tz * L, cx + tx * L, cz + tz * L, 2.4, 10.31, 10.31, 0.3, 1, FLOOR_Y.out);
    for (const sd of [-1, 1]) { cm.fr = [cx + tx * sd * (L + 0.9), 0, cz + tz * sd * (L + 0.9), tx, -tz, 1]; cm.mat = M.QUAY; cm.box(-1.7, FLOOR_Y.out - 0.2, -2.9, 1.7, 10.2, 2.9, 0.08, false); cm.mat = M.TRIM; cm.box(-1.8, 10.2, -3, 1.8, 10.4, 3, 0.05); cm.fr = null; }
    put(type([cm.build()], K.SOLID), 0, 0, 0); occ.push([cx, cz, 14]); }
  const grad = (x, z) => [(gH(x + 4, z) - gH(x - 4, z)) / 8, (gH(x, z + 4) - gH(x, z - 4)) / 8];
  // walk the fall line a step at a time; keeps its heading across the mountains' level benches. Returns the points
  const fallLine = (x, z, sg, step, n, stop) => {
    const pts = []; let dx = 0, dz = -sg, flat = 0;
    for (let i = 0; i < n; i++) {
      const [gx, gz] = grad(x, z), g = hypot(gx, gz), k = min(1, g / 0.12); flat = g < 0.05 ? flat + 1 : 0;
      if (g > 1e-3) { dx = dx * (1 - k) + sg * gx / g * k; dz = dz * (1 - k) + sg * gz / g * k; const l = hypot(dx, dz) || 1; dx /= l; dz /= l; }
      pts.push([x, z, g, dx, dz]); if (flat * step > 60 || stop(x, z)) break;
      x += dx * step; z += dz * step;
    }
    return pts;
  };
  // the river's fall: the way up the face from the source, reversed
  tops.push(fallLine(riverX(RV.zh + 40), RV.zh + 40, 1, 1.6, 280, (x, z) => gH(x, z) > 330).reverse());
  for (const fx of FALL_X) {
    // the others start above the steepest place on their line and find their own way down
    let z = -1300, best = 0;
    for (let q = -1250; q > -2700; q -= 12) { const h = gH(fx, q), g = abs(gH(fx, q - 6) - gH(fx, q + 6)) / 12; if (h > 110 && h < 420 && g > best) { best = g; z = q; } }
    const up = fallLine(fx, z, 1, 4, 16, () => false), p = up[up.length - 1]; tops.push(fallLine(p[0], p[1], -1, 1.6, 420, (x, z) => riverDist(x, z) < 4));
  }
  // each lies on the rock: five points across on the mesh (gH), a hand above it, 1.6 m steps; narrow where steep
  for (const path of tops) {
    let prev = null, d = 0; const x0 = path[0][0];
    for (const [x, z, g, dx, dz] of path) {
      const wd = mix(7, 3.6, sstep(0.3, 0.9, g)) * (0.75 + 0.5 * fbm((d += 1.6) * 0.07 + x0, 3.3, 2)), row = [], [gx, gz] = grad(x, z);
      fm.eb = round(sstep(0.15, 0.7, g) * 255);
      for (let k = -2; k <= 2; k++) { const px = x - dz * wd * k / 2, pz = z + dx * wd * k / 2; fm.ea = round((k + 2) / 4 * 255); row.push(fm.v(px, gH(px, pz) + 0.12 + 0.2 * (1 - abs(k) / 2), pz, -gx, 1, -gz)); }
      if (prev) for (let k = 0; k < 4; k++) fm.quad(prev[k], row[k], row[k + 1], prev[k + 1]);
      prev = row;
    }
  }
  if (AUTO) console.log('falls from ' + tops.map((p) => `${p[0][0].toFixed(0)},${gH(p[0][0], p[0][1]).toFixed(0)},${p[0][1].toFixed(0)} (${p.length} steps)`).join(' · '));
  fm.ea = fm.eb = 0;
  put(type([fm.build()], K.SOLID, 1e9, 1e9, 1e9, 0, NO_NEAR), 0, 0, 0);

  // hovering craft (moved by the shader, see sh_scene.js)
  for (let i = 0; i < 13; i++) { const t = rr(0, TAU), r = [232, 232, 398, 398, 105, 300, 232, 398, 232, 398, 105, 232, 300][i]; put(tCraft, r * cos(t), rr(9, 26), r * sin(t), 1, qYaw(-t - PI / 2), rgb(1, 1, 1, i / 13)); }
  if (AUTO) console.log(`villas ${nVilla} · trees ${nTree} (${nCut} left out for room)`);
}
