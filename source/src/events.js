// Tancredi's Castle: the actors of the events (keys G and V in main.js; the storm, T, is all shaders)
// - the dragon: red with a gold belly, bat wings, a long tail with a spade, fire from its mouth
// - the fleets: the king's three ships (timber, blue band, white sails with a blue stripe, gold flags) and the two
//   black ships (black hull, dark red sails), each with five guns a side, their flashes, smoke and the splashes
// Meshes are built at rest; sh_scene.js (dragonAt, shipAt) moves them. PAINT and FIRE vertices: ea = palette entry
// (PAL, FPAL in sh_scene.js), eb = role x 16 + part. Roles: 0 rigid, 1/2 right/left wing, 3 tail, 4 dragon fire,
// 5 gun flash, 6 gun smoke, 7 splash.

// half beam of a hull at z (mirrored by hull() in sh_scene.js)
const hull = (z) => (z >= 0 ? 5 * pow(max(1 - (z / 18.5) ** 2, 0), 0.6) : 5 * pow(max(1 - (z / 21) ** 2, 0), 0.4));
const evMat = (mb, mat, pal, role = 0, part = 0) => { mb.mat = mat; mb.ea = pal; mb.eb = role * 16 + part; };
// tube() writes ec itself; a double-sided flat polygon
const sheet = (mb, pts, n) => { mb.poly(pts, n); mb.poly(pts.map((p) => [p[0] - n[0] * 0.04, p[1] - n[1] * 0.04, p[2] - n[2] * 0.04]), [-n[0], -n[1], -n[2]]); };

// the dragon, nose towards +z, about 58 m from snout to tail and 54 m across the wings
function meshDragon() {
  const mb = new MB(1 << 14);
  // body and neck
  evMat(mb, M.PAINT, 0);
  mb.tube([[0, 0, -8, 2.2], [0, 0.3, -3, 3.2], [0, 0.6, 2, 3.4], [0, 0.8, 6, 2.8], [0, 1.6, 9, 1.9], [0, 3, 12, 1.4], [0, 4, 15, 1.3], [0, 4.3, 17, 1.5]], 14);
  evMat(mb, M.PAINT, 1); blob(mb, 0, -1.2, 0.5, 2.3, 1.9, 6.5, 16);
  // head: skull, snout, jaw, brows; horns; burning eyes
  evMat(mb, M.PAINT, 0);
  blob(mb, 0, 4.5, 18.6, 1.8, 1.5, 2.6, 16); blob(mb, 0, 4, 21.2, 1.15, 0.9, 1.9, 14);
  for (const s of [-1, 1]) mb.tube([[s * 0.5, 5.6, 18, 0.35], [s * 1.1, 5.7, 19.8, 0.3], [s * 0.6, 5.2, 21.5, 0.15]], 6);
  evMat(mb, M.PAINT, 1); blob(mb, 0, 3.2, 20.5, 1, 0.5, 1.9, 12);
  evMat(mb, M.PAINT, 3);
  for (const s of [-1, 1]) {
    mb.tube([[s * 0.8, 5.4, 17.6, 0.38], [s * 1.4, 6.5, 16.2, 0.24], [s * 1.6, 7.1, 14.6, 0.06]], 8);
    for (let k = 0; k < 4; k++) mb.tube([[s * 0.45, 3.3, 20.4 + k * 0.6, 0.12], [s * 0.45, 2.75, 20.5 + k * 0.6, 0.02]], 4); // fangs
  }
  evMat(mb, M.FIRE, 2); for (const s of [-1, 1]) blob(mb, s * 1.05, 4.9, 19.7, 0.34, 0.28, 0.36, 8);
  // spikes along the back (the tail's move with the tail)
  evMat(mb, M.PAINT, 3);
  for (let z = 14; z >= -28; z -= 3) {
    const tail = z < -8, y = z > 9 ? 1.6 + (z - 9) * 0.45 + 1.2 : tail ? 1.6 - (-8 - z) * 0.05 : 3.3 - abs(z - 1) * 0.05, h = tail ? max(0.5, 1.6 + (z + 8) * 0.05) : 1.8;
    if (tail) mb.eb = 3 * 16;
    mb.tube([[0, y - 0.3, z, 0.55], [0, y + h, z - 0.9, 0.05]], 5);
    mb.eb = 0;
  }
  // tail and its spade
  evMat(mb, M.PAINT, 0, 3);
  mb.tube([[0, 0, -7.5, 2.1], [0, -0.2, -13, 1.6], [0, -0.4, -19, 1.05], [0, -0.4, -25, 0.6], [0, -0.3, -31, 0.25]], 10);
  evMat(mb, M.PAINT, 2, 3); sheet(mb, [[0, -0.3, -30.5], [1.6, -0.3, -32.5], [0, -0.3, -36], [-1.6, -0.3, -32.5]], [0, 1, 0]);
  // legs tucked under
  evMat(mb, M.PAINT, 0);
  for (const s of [-1, 1]) {
    mb.tube([[s * 2.1, -1, -4, 1.1], [s * 2.4, -2.6, -6, 0.75], [s * 2.4, -3, -8.5, 0.4]], 8);
    mb.tube([[s * 1.9, -0.6, 5, 0.85], [s * 2.1, -2, 6.5, 0.55], [s * 2.1, -2.6, 8, 0.35]], 8);
  }
  // wings: arm and fingers in scale colour, the membrane between them
  for (const s of [1, -1]) {
    const role = s > 0 ? 1 : 2, S = [s * 2.4, 1.6, 3], E = [s * 11, 3.4, 1.5], W = [s * 19, 2.6, -1], T = [[s * 28, 0.6, -6], [s * 24, 0.2, -11.5], [s * 17, 0.4, -13.5]], R = [s * 2.4, 1.2, -6.5];
    evMat(mb, M.PAINT, 0, role);
    mb.tube([[...S, 0.75], [...E, 0.55], [...W, 0.4]], 8);
    for (const t of T) mb.tube([[...W, 0.3], [...t, 0.08]], 5);
    evMat(mb, M.PAINT, 2, role);
    // the trailing edge sags a little between the finger tips
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.3, (a[2] + b[2]) / 2 + 1.6];
    sheet(mb, [S, E, W], [0, 1, 0]); sheet(mb, [E, T[0], W], [0, 1, 0]);
    sheet(mb, [W, T[0], mid(T[0], T[1]), T[1]], [0, 1, 0]); sheet(mb, [W, T[1], mid(T[1], T[2]), T[2]], [0, 1, 0]);
    sheet(mb, [W, T[2], mid(T[2], R), R, S], [0, 1, 0]);
  }
  // fire: a flame with a brighter core, from the mouth along +z (scaled from nothing by the shader)
  evMat(mb, M.FIRE, 0, 4);
  mb.tube([[0, 3.6, 22.5, 0.3], [0, 3.6, 25, 1.5], [0, 3.7, 30, 2.9], [0, 3.9, 36, 3.7], [0, 4.1, 42, 3.3], [0, 4.2, 46, 1.7], [0, 4.2, 48, 0.3]], 12);
  evMat(mb, M.FIRE, 1, 4);
  mb.tube([[0, 3.6, 22.8, 0.2], [0, 3.6, 25, 0.9], [0, 3.7, 30, 1.7], [0, 3.85, 35, 1.9], [0, 4, 40, 1.1], [0, 4, 42.5, 0.2]], 10);
  nocol(mb); mb.mat = 0;
  return mb.build();
}

// a ship, bow towards +z, 36 m long and 10 m in the beam. king: the king's colours, else the serpent lord's
function meshShip(king) {
  const mb = new MB(1 << 14), DECK = 3.2, KEEL = -2.6, band = king ? 6 : 8, timber = king ? 4 : 8, sail = king ? 5 : 9, stripe = king ? 6 : 8, flag = king ? 7 : 9;
  // hull: elliptical sections from the stern (z -17) to the bow (z 18); a coloured band below the deck
  const Z = []; for (let z = -17; z <= 18.01; z += 1.75) Z.push(z);
  const loft = (a0, a1, pal, na) => {
    evMat(mb, M.PAINT, pal); let prev = null;
    for (const z of Z) {
      const hw = max(hull(z), 0.25), dep = DECK - KEEL - (z > 12 ? (z - 12) * 0.25 : 0), row = [];
      for (let k = 0; k <= na; k++) {
        const a = a0 + (a1 - a0) * k / na, x = hw * cos(a), y = DECK - dep * sin(a), nx = dep * cos(a), ny = -hw * sin(a), l = hypot(nx, ny);
        row.push(mb.v(x, y, z, nx / l, ny / l, 0));
      }
      if (prev) for (let k = 0; k < na; k++) mb.quad(prev[k], prev[k + 1], row[k + 1], row[k]);
      prev = row;
    }
  };
  loft(0, 0.32, band, 2); loft(0.32, PI - 0.32, timber, 10); loft(PI - 0.32, PI, band, 2);
  // transom, deck
  evMat(mb, M.PAINT, timber);
  const sec = (z) => { const hw = hull(z), dep = DECK - KEEL, p = []; for (let k = 0; k <= 12; k++) { const a = PI * k / 12; p.push([hw * cos(a), DECK - dep * sin(a), z]); } return p; };
  mb.poly(sec(-17), [0, 0, -1]);
  evMat(mb, M.PAINT, 4);
  const deck = []; for (const z of Z) deck.push([hull(z), DECK, z]); for (let i = Z.length - 1; i >= 0; i--) deck.push([-hull(Z[i]), DECK, Z[i]]);
  mb.poly([[0, DECK, 0], ...deck, deck[0]], [0, 1, 0]);
  // stern castle with a lantern, forecastle, rails
  evMat(mb, M.PAINT, band); mb.box(-3.6, DECK, -17, 3.6, 7.6, -9.5, 0.15); mb.box(-2.6, 4, 11, 2.6, 5.6, 15.5, 0.15);
  evMat(mb, M.PAINT, timber); mb.box(-3.9, 7.6, -17.3, 3.9, 8.1, -9.2, 0.1);
  evMat(mb, M.FIRE, 4); blob(mb, 0, 9, -17.6, 0.45, 0.6, 0.45, 8); blob(mb, -2.9, 6, -17.4, 0.3, 0.4, 0.3, 6); blob(mb, 2.9, 6, -17.4, 0.3, 0.4, 0.3, 6);
  // gun ports, barrels, and per gun its flash, smoke and splash (moved by the shader)
  for (const s of [-1, 1]) for (let g = 0; g < 5; g++) {
    const zg = -9 + g * 4.5, hw = hull(zg), part = g + (s > 0 ? 8 : 0);
    evMat(mb, M.PAINT, 8); mb.box(s > 0 ? hw - 0.3 : -hw - 0.15, 1.5, zg - 0.6, s > 0 ? hw + 0.15 : -hw + 0.3, 2.5, zg + 0.6, 0.05);
    mb.tube([[s * (hw - 0.2), 2, zg, 0.28], [s * (hw + 0.9), 2, zg, 0.22]], 6);
    evMat(mb, M.FIRE, 3, 5, part); blob(mb, s * (hw + 1.6), 2, zg, 2.6, 1.5, 1.5, 10);
    // smoke: a clump of puffs round the point the shader grows it from
    evMat(mb, M.PAINT, 10, 6, part);
    for (const [dx, dy, dz, r] of [[0, 0, 0, 2], [1.4, 0.9, 1.2, 1.5], [0.6, 1.4, -1.3, 1.4], [-0.8, -0.5, 0.9, 1.2]]) blob(mb, s * (hw + 3.5 + dx), 2.4 + dy, zg + dz, r, r * 0.85, r, 8);
    evMat(mb, M.PAINT, 11, 7, part); mb.lathe([[2.4, -0.5], [2, 0.6], [1.1, 4.5], [0.35, 9], [0, 10]], { seg: 10, cx: s * (140 + 12 * g), cz: zg * 2.5 });
  }
  // masts, yards and sails (bellied forward), flags
  for (const [mz, mh, sw] of [[-4, 26, 13], [8, 21, 11], [-12.5, 17, 8]]) {
    evMat(mb, M.PAINT, 4); mb.tube([[0, DECK, mz, 0.38], [0, DECK + mh, mz, 0.22]], 8, false);
    const y0 = DECK + 4, y1 = DECK + mh - 2.5;
    for (const y of [y0 + 0.4, y1]) mb.tube([[-sw / 2 - 0.4, y, mz + 0.3, 0.16], [sw / 2 + 0.4, y, mz + 0.3, 0.16]], 6, false);
    const nx = 6, ny = 6, rows = [];
    for (let j = 0; j <= ny; j++) {
      const v = j / ny, y = y1 - (y1 - y0) * v, w = sw * (0.82 + 0.18 * v), row = [];
      for (let i = 0; i <= nx; i++) { const u = i / nx, x = (u - 0.5) * w, z = mz + 0.6 + 2.2 * sin(PI * u) * sin(PI * (0.15 + 0.7 * v)); row.push([x, y, z]); }
      rows.push(row);
    }
    for (let j = 0; j < ny; j++) {
      evMat(mb, M.PAINT, j === 2 || j === 3 ? stripe : sail);
      for (let i = 0; i < nx; i++) {
        const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i + 1], d = rows[j + 1][i];
        sheet(mb, [a, b, c, d], [0, 0, 1]);
      }
    }
    evMat(mb, M.PAINT, flag); sheet(mb, [[0, DECK + mh, mz], [0, DECK + mh - 1.6, mz], [0.2, DECK + mh - 0.8, mz - 3.2]], [1, 0, 0]);
  }
  // bowsprit
  evMat(mb, M.PAINT, 4); mb.tube([[0, DECK + 1, 15], [0, DECK + 3.2, 24]].map((p) => [...p, 0.25]), 6);
  nocol(mb); mb.mat = 0;
  return mb.build();
}

// placing them (world.js): one dragon, five ships; never culled (they travel), only the camera's shadows
function placeEvents(type, put) {
  const fl = ALWAYS | NO_BAKE | NO_MIRROR;
  put(type([meshDragon()], K.SOLID, 1e9, 1e9, 1e9, 0, fl), 0, 150, 0, 1, Q0, rgb(1, 1, 1, 240 / 255));
  const tKing = type([meshShip(true)], K.SOLID, 1e9, 1e9, 1e9, 0, fl), tDark = type([meshShip(false)], K.SOLID, 1e9, 1e9, 1e9, 0, fl);
  FLEET.forEach((f, i) => put(f[2] > 0 ? tKing : tDark, f[0], 0, f[1], 1, qYaw(f[2] * PI / 2), rgb(1, 1, 1, (241 + i) / 255)));
}

// Tancredi il Prode (hero.js), 1.85 m, feet at 0, facing +z, sword in the right hand (+x). Roles: 0 body, 1/2 right/left
// arm (1 with the sword: part 1 the sword, 2 the blade's glow), 3/4 right/left leg, 5 cape, 6 sparks (part = which), 7 wave of light,
// 8 the lightning of the transformation. Armour silver (gold when transformed, sh_scene.js), blue tunic, red cape.
function meshHero() {
  const mb = new MB(1 << 13), S = 1.47, HIP = 0.95;
  // legs: trousers, boots, feet
  for (const s of [1, -1]) {
    const role = s > 0 ? 3 : 4, x = s * 0.115;
    evMat(mb, M.PAINT, 18, role); mb.tube([[x, HIP, 0, 0.085], [x, 0.55, 0.02, 0.075], [x, 0.42, 0.01, 0.07]], 8, false);
    evMat(mb, M.PAINT, 17, role); mb.tube([[x, 0.46, 0.01, 0.085], [x, 0.1, 0, 0.075]], 8, false); mb.box(x - 0.055, 0, -0.07, x + 0.055, 0.1, 0.16, 0.03);
    evMat(mb, M.PAINT, 7, role); mb.tube([[x, 0.47, 0.01, 0.09], [x, 0.43, 0.01, 0.09]], 8, false);
  }
  // tunic (with its skirt), belt, chest armour, shoulder guards, collar
  evMat(mb, M.PAINT, 14);
  blob(mb, 0, 1.22, 0, 0.19, 0.3, 0.125, 14);
  mb.lathe([[0, 0.68], [0.235, 0.68], [0.2, 0.86], [0.17, 1.0]], { seg: 14 });
  evMat(mb, M.PAINT, 17); mb.lathe([[0, 0.93], [0.185, 0.93], [0.18, 1.0]], { seg: 14 }); evMat(mb, M.PAINT, 7); mb.box(-0.045, 0.92, 0.15, 0.045, 1.01, 0.2, 0.01);
  evMat(mb, M.PAINT, 15);
  blob(mb, 0, 1.3, 0.025, 0.24, 0.21, 0.16, 14);
  for (const s of [1, -1]) blob(mb, s * 0.25, 1.47, 0, 0.13, 0.09, 0.12, 10);
  evMat(mb, M.PAINT, 7); blob(mb, 0, 1.33, 0.155, 0.06, 0.06, 0.02, 8); // gold boss on the chest
  // neck, head, hair, a short beard line, eyes
  evMat(mb, M.PAINT, 12); mb.tube([[0, 1.47, 0, 0.055], [0, 1.58, 0.01, 0.05]], 8, false); blob(mb, 0, 1.68, 0.01, 0.105, 0.125, 0.115, 12);
  blob(mb, 0, 1.665, 0.11, 0.018, 0.025, 0.02, 6); // nose
  evMat(mb, M.PAINT, 13); blob(mb, 0, 1.745, -0.01, 0.12, 0.085, 0.125, 12); blob(mb, 0, 1.67, -0.07, 0.112, 0.1, 0.07, 10); blob(mb, 0, 1.765, 0.075, 0.1, 0.035, 0.05, 10);
  evMat(mb, M.PAINT, 8); for (const s of [1, -1]) blob(mb, s * 0.04, 1.69, 0.107, 0.011, 0.011, 0.006, 6);
  // arms: sleeve, silver bracer, hand; the sword in the right hand pointing forward (cross-guard gold, blade silver)
  for (const s of [1, -1]) {
    const role = s > 0 ? 1 : 2, x0 = s * 0.25, x1 = s * 0.3, x2 = s * 0.32;
    evMat(mb, M.PAINT, 14, role); mb.tube([[x0, S, 0, 0.06], [x1, 1.19, 0.02, 0.052]], 8, false);
    evMat(mb, M.PAINT, 15, role); mb.tube([[x1, 1.2, 0.02, 0.055], [x2, 0.95, 0.07, 0.05]], 8, false);
    evMat(mb, M.PAINT, 12, role); blob(mb, x2, 0.92, 0.08, 0.045, 0.05, 0.05, 8);
  }
  const hx = 0.32, hy = 0.92, hz = 0.08;
  evMat(mb, M.PAINT, 17, 1, 1); mb.tube([[hx, hy, hz - 0.1, 0.022], [hx, hy, hz + 0.08, 0.022]], 6); evMat(mb, M.PAINT, 7, 1, 1); blob(mb, hx, hy, hz - 0.12, 0.03, 0.03, 0.03, 6);
  mb.box(hx - 0.13, hy - 0.02, hz + 0.08, hx + 0.13, hy + 0.02, hz + 0.12, 0.01);
  evMat(mb, M.PAINT, 15, 1, 1);
  const blade = (x, w, t) => { const z0 = hz + 0.12, z1 = hz + 1.02; sheet(mb, [[x - w, hy, z0], [x + w, hy, z0], [x + w * 0.7, hy, z1 - 0.1], [x, hy, z1], [x - w * 0.7, hy, z1 - 0.1]], [0, 1, 0]); mb.tube([[x, hy, z0, t], [x, hy, z1 - 0.05, t * 0.5]], 4); };
  blade(hx, 0.035, 0.012);
  // the glow round the blade (part 2): from nothing to a blue-white sheath with the power
  evMat(mb, M.FIRE, 5, 1, 2); mb.tube([[hx, hy, hz + 0.13, 0.09], [hx, hy, hz + 0.6, 0.11], [hx, hy, hz + 1.06, 0.04]], 8);
  // cape from the shoulders
  evMat(mb, M.PAINT, 16, 5);
  const rows = [];
  for (let j = 0; j <= 4; j++) { const v = j / 4, y = 1.5 - v * 1.0, w = 0.22 + 0.14 * v, z = -0.13 - 0.06 * v, row = []; for (let i = 0; i <= 4; i++) { const u = i / 4; row.push([(u - 0.5) * 2 * w, y, z - 0.04 * sin(PI * u)]); } rows.push(row); }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) sheet(mb, [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]], [0, 0, -1]);
  // sparks round him while transformed (each placed by the shader)
  for (let i = 0; i < 10; i++) { evMat(mb, M.FIRE, 5, 6, i); blob(mb, 0, 1, 0, 0.05, 0.05, 0.05, 6); }
  // wave of light from a blow: a flat ring at his feet, grown by the shader
  evMat(mb, M.FIRE, 5, 7); mb.lathe([[1.05, 0.12], [1, 0.3], [0.9, 0.12]], { seg: 32 });
  // the lightning: a jagged stroke from the clouds down to the raised sword's tip (about 3.05 m up)
  evMat(mb, M.FIRE, 5, 8);
  const pts = []; let bx = 0.31, bz = 0.05; for (let k = 0; k <= 14; k++) { const y = 3.05 + k * k * 0.45; pts.push([bx, y, bz, 0.06 + k * 0.012]); bx += (h2(k, 3) - 0.5) * (1 + k * 0.4); bz += (h2(k, 7) - 0.5) * (1 + k * 0.4); }
  mb.tube(pts, 5);
  nocol(mb); mb.mat = 0;
  return mb.build();
}
function placeHero(type, put) { put(type([meshHero()], K.SOLID, 1e9, 1e9, 1e9, 0, ALWAYS | NO_BAKE | NO_MIRROR), 0, 0, 0, 1, Q0, rgb(1, 1, 1, 246 / 255)); }
