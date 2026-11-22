// world layout: shared by the meshes, the planting and the shaders
// metres, +Y up, city centre at the origin, +Z south (harbour), -Z north (mountains); x = r cos t, z = r sin t
const WATER = 6.5, LAND = 10, POD_Y = 40, TIP_Y = 145;
const PULSE = 12; // seconds between beats of the city's energy pulse
const SEA_GROW = 1.034; // each sea ring this much wider than the last (meshSea, and the swell's fade in the shader)
// time of day (Tancredi's Castle): chosen in the menu or with O, kept in localStorage.tancrediOra, ?ora= for tests.
// Everything that depends on the sun is baked at load, so a change reloads the page. At night the "sun" is the moon:
// the same light scaled by SUNK and tinted blue (main.js, sh_base.js), with stars, and windows lit (sh_light.js).
const ORE = ['alba', 'giorno', 'tramonto', 'notte'], ORE_IT = ['Alba', 'Giorno', 'Tramonto', 'Notte'];
let ORA = 'tramonto'; try { ORA = localStorage.tancrediOra || ORA; } catch {}
if (QP.has('ora')) ORA = QP.get('ora'); if (!ORE.includes(ORA)) ORA = 'tramonto';
const NIGHT = ORA === 'notte' ? 1 : 0, SUNK = NIGHT ? 0.03 : 1;
// exposure per time of day: the high sun is brighter, the moonlit night much darker
const EXPO_ORA = { alba: 0.85, giorno: 0.42, tramonto: 0.8, notte: 1.4 }[ORA];
// towards the sun (or moon): dawn low in the east-south-east, day high in the south-west, sunset 6 degrees up in the
// west-north-west, the moon high in the south-east
const SUN = vnorm({ alba: [0.86, 0.13, 0.49], giorno: [-0.42, 0.78, 0.46], tramonto: [-0.93, 0.105, -0.35], notte: [0.45, 0.5, 0.74] }[ORA]);
const SPOKES = [0, 1, 2, 3, 4, 5].map((k) => PI / 2 + k * PI / 3); // south first
const TOWERS = [0, 1, 2, 3, 4, 5].map((k) => k * PI / 3); // east first
const TOWER_R = 190, SPOKE_W = 7; // tower distance from centre; half width of a spoke
const PT = [[58, 40], [70.5, 30], [85, 20]]; // podium tiers: outer radius, top height
const angd = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
const bump = (x) => (abs(x) < 1 ? cos(x * PI / 2) ** 2 : 0);
// mountains: an arc from north-north-west to east-north-east; the west stays open sea so no ridge hides the low sun
const northOf = (x, z) => { const az = atan2(x, -z) / DEG; return sstep(-70, -50, az) * (1 - sstep(70, 96, az)); };
// Tancredi's Castle: the Ivory Rock on a mountain shelf to the north-west, the Serpent Fortress on a dark plain to the
// north-east (centre x, z, flat radius, blend radius, level)
const ROCCA = [-1550, -1700, 120, 300, 260], SERPI = [1750, -1000, 380, 700, 34];
const flatAt = (x, z, h, F) => { const d = hypot(x - F[0], z - F[1]); return d < F[3] ? mix(h, F[4], sstep(F[3], F[2], d)) : h; };
// every ring radius wobbles by a few percent
const wob = (t) => 0.036 * sin(2 * t + 0.7) + 0.024 * sin(3 * t + 2.1) + 0.013 * sin(5 * t + 4.0) + 0.006 * sin(11 * t + 1.3);
// each tower on an island in a round bay of the middle canal; the east bay is a wide lagoon
const bays = (t) => { let b = 0; for (let k = 0; k < 6; k++) b = max(b, (k ? 46 + 5 * sin(k * 2.4) : 66) * bump(angd(t, TOWERS[k]) / ((k ? 10.5 : 17) * DEG)) ** (k ? 0.8 : 0.6)); return b; };
// garden channel through the garden quarter, opening into a basin on the south spoke
const chw = (t) => 9 + 3 * sin(7 * t + 1) + 2 * sin(13 * t + 2) + 25 * bump(angd(t, PI / 2) / (10 * DEG));
// ring boundaries, centre outwards
const RB = {
  moat: (t) => 125 * (1 + 0.5 * wob(t)), // moat | civic ring
  civ: (t) => 215 * (1 + wob(t)) - bays(t), // civic ring | middle canal
  mid: (t) => 250 * (1 + wob(t)) + 40 * bump(angd(t, 12 * DEG) / (21 * DEG)), // middle canal | garden quarter
  chi: (t) => 311 * (1 + 1.2 * wob(t)) - chw(t) / 2, // garden quarter | channel
  cho: (t) => 311 * (1 + 1.2 * wob(t)) + chw(t) / 2,
  gar: (t) => 380 * (1 + wob(t)) - 5 * sin(4 * t + 1), // garden quarter | outer canal
  out: (t) => 415 * (1 + wob(t)) + 7 * sin(3 * t + 2.5) + 5, // outer canal | outer shelf
};
// 0 podium, 1 moat, 2 civic ring, 3 middle canal, 4 garden (inner), 5 channel, 6 garden (outer), 7 outer canal, 8 beyond
const zoneOf = (x, z) => { const r = hypot(x, z), t = atan2(z, x); return r < 85 ? 0 : r < RB.moat(t) ? 1 : r < RB.civ(t) ? 2 : r < RB.mid(t) ? 3 : r < RB.chi(t) ? 4 : r < RB.cho(t) ? 5 : r < RB.gar(t) ? 6 : r < RB.out(t) ? 7 : 8; };
// distance to the nearest spoke's centre line
const spokeLat = (x, z) => { const r = hypot(x, z), t = atan2(z, x); let d = 1e9; for (const s of SPOKES) { const a = angd(t, s); if (abs(a) < PI / 2) d = min(d, abs(r * sin(a))); } return d; };
// distance to the nearest water edge in the city (negative on water)
const edgeDist = (x, z) => {
  const r = hypot(x, z), t = atan2(z, x);
  return min(RB.civ(t) - r, r - RB.moat(t)) > 0 ? min(RB.civ(t) - r, r - RB.moat(t))
    : min(RB.chi(t) - r, r - RB.mid(t)) > 0 ? min(RB.chi(t) - r, r - RB.mid(t))
      : min(RB.gar(t) - r, r - RB.cho(t)) > 0 ? min(RB.gar(t) - r, r - RB.cho(t)) : r > RB.out(t) ? r - RB.out(t) : -1;
};

// terrain beyond the outer canal
// coast about 900 m out, with capes and coves; the harbour is a bay cut into the south side
const HARB_R = 452, WQ = [-852, 146]; // land's end at the harbour; centre of the west quay's bastion
const coastR = (t) => {
  const c = 900 + 90 * sin(3 * t + 1.9) + 60 * sin(5 * t + 0.4) + 40 * sin(9 * t + 2.2) + 22 * sin(17 * t + 5.1);
  const hb = sstep(64 * DEG, 42 * DEG, abs(angd(t, PI / 2)));
  return mix(c, HARB_R, hb) + 2600 * northOf(cos(t), sin(t));
};
// tabulated coastR, for the many lookups in coastD
const CTN = 4096, CTAB = new Float32Array(CTN + 1); for (let i = 0; i <= CTN; i++) CTAB[i] = coastR(i / CTN * TAU);
const coastT = (t) => { let u = t / TAU; u = (u - floor(u)) * CTN; const i = min(u | 0, CTN - 1); return CTAB[i] + (CTAB[i + 1] - CTAB[i]) * (u - i); };
const CD = [0.25, 0.5, 1, 1.75, 2.75, 4, 6, 9, 13, 18, 24].flatMap((d) => [d * DEG, -d * DEG]), CDC = CD.map((d) => cos(d));
// signed distance to the coast (positive on land) in any direction, so the land slopes down where the coast
// runs towards the centre instead of ending in a wall
const coastD = (r, t, rc) => {
  let d2 = (rc - r) ** 2;
  for (let i = 0; i < CD.length; i++) { const R = coastT(t + CD[i]), q = r * r + R * R - 2 * r * R * CDC[i]; if (q < d2) d2 = q; }
  return (rc > r ? 1 : -1) * sqrt(d2);
};
// the river: from the foothills to the outer canal, meeting it north-north-east
const riverX = (z) => 112 + sstep(-430, -620, z) * (150 * sin(z / 140) + 60 * sin(z / 53 + 1)) + (z + 400) * -0.12;
// land before the river and the sea shape it: shelf, terraced fields, mountains
const landH = (x, z, r, ro, rc, north, dC) => {
  const und = (fbm(x / 260 + 3, z / 260 + 7, 4) - 0.5) * 2;
  // the shelf: rolls gently, tilts down to the coast, rises towards the northern mountains
  const k = sstep(0, 1, (r - ro) / 240);
  let h = LAND + k * (und * 7 + 3.5 - 5.5 * sstep(0, 1, (r - ro) / (rc - ro)) * (1 - north)) + north * sstep(520, 1000, r) * 34 * sstep(20, 420, dC);
  // terraced fields along the contours of gentle slopes
  const terr = sstep(40, 120, r - ro) * (1 - sstep(700, 1000, r) * north);
  const st = h / 1.5, sf = st - floor(st); h = mix(h, (floor(st) + sstep(0.72, 0.96, sf)) * 1.5, terr * 0.85);
  // mountains: ridged limestone falling to the sea over a kilometre or more; crags only where a patchy noise allows
  const ms = sstep(40, 1300, dC), mk = north * sstep(1250, 2700, r) * (0.75 + 0.5 * fbm(x / 900 + 9, z / 900 + 2, 2)) * ms * (0.3 + 0.7 * ms);
  if (mk > 0) {
    let m = ridge(x / 720 + 5.2, z / 720 + 1.7, 7) * 620 + (ridge(x / 150 + 2, z / 150 + 9, 4) - 0.3) * 60 + fbm(x / 60, z / 60, 3) * 18;
    // limestone beds ~90 m apart weathered into face-bench-face steps; they dip across the range and show only in parts
    const cb = fbm(x / 340 + 3.3, z / 340 + 8.1, 2), dip = 150 * (fbm(x / 520 + 1.9, z / 520 + 6.4, 2) - 0.5) + 30 * (fbm(x / 95 + 4.4, z / 95 + 0.7, 2) - 0.5);
    const k = (m + dip) / 92, bench = (floor(k) + sstep(0.22, 0.6, k - floor(k))) * 92 - dip;
    m = mix(m, bench, 0.85 * sstep(0.4, 0.62, cb) * sstep(70, 170, m)) * 0.86;
    h += mk * m;
  }
  return flatAt(x, z, flatAt(x, z, h, ROCCA), SERPI);
};
const landRaw = (x, z) => { const r = hypot(x, z), t = atan2(z, x), rc = coastR(t); return landH(x, z, r, RB.out(t), rc, northOf(x, z), coastD(r, t, rc)); };
// river water level every 3 m north from z = -350 (inside the outer canal): traced up from the mouth to where the
// mountain steepens (the source), then back down, never rising, so the water always lies below its valley
const RIV_Z0 = -350, RIV_DZ = 3, RIV_N = 650;
let RIV = null;
const river = () => {
  if (RIV) return RIV;
  const y = new Float32Array(RIV_N + 1), b = new Float32Array(RIV_N + 1);
  for (let i = 0; i <= RIV_N; i++) { const z = RIV_Z0 - i * RIV_DZ, x = riverX(z); b[i] = min(landRaw(x - 9, z), landRaw(x, z), landRaw(x + 9, z)); }
  let head = 12, hi = -1e9;
  for (let i = 12; i <= RIV_N; i++) { if (b[i] > hi) { hi = b[i]; head = i; } if (b[i] < hi - 40 || b[i] > 150) break; }
  y[head] = b[head] - 0.8;
  for (let i = head - 1; i >= 0; i--) y[i] = max(WATER, min(y[i + 1], b[i] - 0.8, WATER + max(0, i * RIV_DZ - 100) * 0.06));
  for (let k = 0; k < 2; k++) { let p = y[0]; for (let i = 1; i < head; i++) { const c = y[i]; y[i] = (p + 2 * c + y[i + 1]) / 4; p = c; } }
  for (let i = head + 1; i <= RIV_N; i++) y[i] = y[head];
  return (RIV = { y, head, zh: RIV_Z0 - head * RIV_DZ });
};
const riverLevel = (z) => { const R = river(), u = clamp((RIV_Z0 - z) / RIV_DZ, 0, RIV_N - 1e-3), i = u | 0; return R.y[i] + (R.y[i + 1] - R.y[i]) * (u - i); };
// harbour quay section (city.js): top terrace, flight, landing, flight, lower landing
const QUAY_END = 43 * DEG + 3e-4; // half the angle the quays span around due south
const quayY = (r) => (r < 454 ? 10 : r < 461.2 ? mix(10, 5.68, (r - 454) / 7.2) : r < 472 ? 5.68 : r < 479.2 ? mix(5.68, 1.36, (r - 472) / 7.2) : 1.36);
// distance to the river's centre line (1e9 where there is none)
const riverDist = (x, z) => { if (z > RIV_Z0 || z < river().zh) return 1e9; const xr = riverX(z); return abs(x - xr) / hypot(riverX(z - 1) - xr, 1); };
// river mouth: its centre line on the outer canal's outer edge. The quay is open RIV_GAP m either side (meshCityGround),
// under a one-arched bridge (city.js). RIV_SHELF: how far the river's low banks reach from its centre line.
const RIV_GAP = 8.4, RIV_SHELF = 12;
const RIV_MOUTH = (() => { let a = -440, b = RIV_Z0; for (let i = 0; i < 40; i++) { const z = (a + b) / 2, x = riverX(z); if (hypot(x, z) > RB.out(atan2(z, x))) a = z; else b = z; } const x = riverX(a); return { x, z: a, t: atan2(a, x), r: hypot(x, a) }; })();
// height of the land (and sea bed) outside the outer canal
const terrainH = (x, z) => {
  const r = hypot(x, z), t = atan2(z, x), ro = RB.out(t), rc = coastR(t), north = northOf(x, z), d = coastD(r, t, rc);
  let h = landH(x, z, r, ro, rc, north, d);
  // river valley: a 9 m bed, a slope, a low shelf of gravel and grass, then a V cut into higher ground; a levee where
  // the land falls away. Banks wander a metre or two (not at the mouth, under the quay).
  const rd = riverDist(x, z);
  if (rd < 420) {
    const L = riverLevel(z), q = rd + (fbm(x / 23 + 7.7, z / 23 + 3.1, 2) - 0.5) * 3.2 * sstep(RIV_MOUTH.z - 4, RIV_MOUTH.z - 40, z);
    // over its last 30 m the bed sinks to the canal's floor, so the waters meet at one depth and colour
    const dp = mix(1.6, WATER - FLOOR_Y.out, sstep(RIV_MOUTH.z - 30, RIV_MOUTH.z - 2, z));
    const g = q < 4.5 ? L - dp : q < 8 ? L - dp + (q - 4.5) * (dp / 3.5) : q < RIV_SHELF ? L + (q - 8) * 0.14 : clamp(h, L + 0.56 - (q - RIV_SHELF) * 0.5, L + 0.56 + (q - RIV_SHELF) * 0.5);
    h = mix(h, g, sstep(RIV.zh, RIV.zh + 30, z));
  }
  // level ground under the harbour's quays and halls
  h = mix(h, LAND - 0.06 * sstep(439, 443, r), sstep(47 * DEG, 43 * DEG, abs(angd(t, PI / 2))) * (1 - sstep(452, 470, r)));
  // coast: cliffs or shelving beaches, then the sea bed
  const cw = 24 + 70 * sstep(0.35, 0.7, fbm(t * 6 + 4, 1.5, 2)), harbour = abs(angd(t, PI / 2)) < 41 * DEG;
  const sea = -1.2 - min(60, max(0, -d) * 0.035) - 4 * sstep(0, 60, -d) + (fbm(x / 23, z / 23, 3) - 0.5) * 2.2 * sstep(0, 30, -d);
  h = mix(sea, h, sstep(-cw * (harbour ? 0.05 : 0.5), cw * (harbour ? 0.2 : 0.5), d));
  // beside the quays' ends the ground takes their section and eases into the shore over ~60 m (outside only: this
  // coarse grid would poke through their landings)
  if (r > 440 && r < 487) { const a = abs(angd(t, PI / 2)), w = sstep(52 * DEG, 45 * DEG, a) * sstep(43.03 * DEG, 43.35 * DEG, a) * (1 - sstep(480, 487, r)); if (w > 0) h = mix(h, max(h, quayY(r) - 0.45), w); }
  // rocky headland under the west quay
  { const q = hypot(x - WQ[0] - 14, z - WQ[1] - 14); if (q < 95) h = max(h, mix(14, -8, sstep(30, 66, q)) + (fbm(x / 9, z / 9, 3) - 0.5) * 3 * sstep(24, 44, q)); }
  // low hazy islands far out
  for (const [ix, iz, ir, ih] of ISLES) { const q = hypot(x - ix, z - iz) / ir; if (q < 1) h = max(h, -6 + (ih + 6) * (1 - q * q) ** 2 * (0.6 + 0.8 * fbm(x / 300, z / 300, 3))); }
  return h;
};
// farmland on the shelf
// parcels: bands PB deep around the city, cut into sectors, slightly warped. parcelAt: band, sector, distance to the
// nearest boundary and coordinates u, v (whole numbers on boundaries); parcelPt is the inverse. Used by world.js and city.js.
const PB = 62, woodAt = (x, z) => fbm(x / 95 + 7, z / 95 + 3, 3); // woodAt > 0.62: wooded
const parcelW = (x, z) => [(fbm(x / 190 + 1.3, z / 190 + 5.1, 2) - 0.5) * 0.9, (fbm(x / 140 + 9.7, z / 140 + 2.2, 2) - 0.5) * 0.7];
const parcelN = (b) => { const rb = 440 + (b + 0.5) * PB; return max(6, round(TAU * rb / (70 + 50 * h2(b, 7)))); };
const parcelAt = (x, z) => {
  const r = hypot(x, z), t = atan2(z, x), w = parcelW(x, z), u = (r - RB.out(t) - 24) / PB + w[0], b = floor(u), n = parcelN(b);
  const v = (t / TAU + 1) * n + h2(b, 3) + w[1], s = floor(v);
  return { b, s: ((s % n) + n) % n, u, v, edge: min(min(u - b, 1 - u + b) * PB, min(v - s, 1 - v + s) * TAU * (440 + (b + 0.5) * PB) / n) };
};
const parcelPt = (u, v, b) => {
  const n = parcelN(b); let t = ((v - h2(b, 3)) / n - 1) * TAU, r = 440 + u * PB, x = r * cos(t), z = r * sin(t);
  for (let i = 0; i < 4; i++) { const w = parcelW(x, z); t = ((v - h2(b, 3) - w[1]) / n - 1) * TAU; r = RB.out(t) + 24 + (u - w[0]) * PB; x = r * cos(t); z = r * sin(t); }
  return [x, z];
};
// parcel use: 0 pasture, 1 wheat, 2 lavender, 3 vines, 4 orchard, 5 ploughed, 6 green crop, plus an id (0-1) for
// per-parcel variety. Land near the coast, river, canal or in the woods is pasture.
const PKIND = [1, 1, 2, 3, 3, 5, 6, 4, 4, 0], parcels = new Map();
const parcelUse = (b, s) => {
  const key = b * 4096 + s; let p = parcels.get(key);
  if (!p) {
    const [x, z] = parcelPt(b + 0.5, s + 0.5, b), r = hypot(x, z), t = atan2(z, x), id = h2(b * 31 + 5, s), d = coastT(t) - r;
    const farm = b >= 0 && d > 60 && abs(angd(t, PI / 2)) > 50 * DEG && riverDist(x, z) > 45 && woodAt(x, z) < 0.6 && fbm(x / 170 + 4, z / 170 + 8, 3) + 0.25 * (1 - sstep(500, 900, r)) > 0.4;
    parcels.set(key, p = { kind: farm ? PKIND[floor(h2(s * 17 + 3, b * 7 + 1) * 10)] : 0, id, x, z, farm });
  }
  return p;
};
const ISLES = [[-3900, 1150, 620, 95], [-4700, -900, 480, 70], [-3000, 2700, 380, 50], [3600, 2500, 700, 110], [900, 4700, 560, 80], [4800, -200, 520, 85]];
// mountain waterfalls beside the river's: the x of the north-south line each is searched along (city.js)
const FALL_X = [-430, 760];

// events (main.js keys T, G, V): where each is watched from (position + look-at), the dragon's flight and the fleets
const EV_POSES = [
  [0, 42, 440, 0, 98, 0], // T: the storm, from the south avenue
  [290, 105, 330, 0, 150, 0], // G: the dragon, from above the upper town
  [0, 62, 500, 0, 4, 800], // V: the sea battle, from above the harbour mouth
];
// the dragon: in from the north-west, one and a half turns round the great tower (radius 150 m), then away climbing
// to the west. Control points of one Catmull-Rom spline, DRAG_STEP s apart (sh_scene.js dragonAt)
const DRAG_STEP = 2.5, DRAG_PATH = (() => {
  const P = [], R = 150, th0 = -0.896, d = [0.781, 0.625], E = [R * cos(th0), R * sin(th0)];
  for (let i = 6; i >= 1; i--) P.push([E[0] - d[0] * 112 * i, 175 + 22 * i, E[1] - d[1] * 112 * i]);
  const n = 13, sweep = 1.5 * TAU;
  for (let i = 0; i < n; i++) { const a = th0 + sweep * i / n; P.push([R * cos(a), 178 + 20 * sin(i * 0.9), R * sin(a)]); }
  const a1 = th0 + sweep, t1 = [-sin(a1), cos(a1)];
  for (let i = 0; i < 7; i++) { const a = a1 + 0.25 * i / 6; P.push([R * cos(a) + t1[0] * 110 * i, 178 + 30 * i, R * sin(a) + t1[1] * 110 * i]); }
  return P;
})();
const DRAG_T = (DRAG_PATH.length - 3) * DRAG_STEP;
// breathing fire, in seconds of the flight (fades in and out over 0.4 s)
const DRAG_FIRE = [[19, 22.5], [31, 34.5]];
// the sea battle in the harbour bay: the king's three ships head east nearer the city, the two black ships west
// further out; each ship fires a broadside every 8 s (BATTLE_T is a multiple of it)
const FLEET = [[-170, 690, 1], [0, 700, 1], [170, 690, 1], [-90, 865, -1], [90, 870, -1]];
const BATTLE_T = 64;

// camera: review shots and the scripted fly-through
// position + look-at; keys 1-6
const POSES = [
  [90, 262, 770, 0, 20, 0],
  [0, 15, 258, 0, 48, 0],
  [241, 8.5, 42, 164, 14, 76],
  [0, 41.8, 56.5, 0, 62.5, 0],
  [215, 34, 285, 0, 22, 0],
  [-1330, 300, -1450, -1550, 315, -1700], // 6: la Rocca d'Avorio
  [1500, 75, -760, 1750, 120, -1000], // 7: la Fortezza delle Serpi
  [4.5, 11.9, 169.5, 0, 10.7, 162], // 8: il girotondo sul viale sud (Virginia Bay)
  [-869.4, 18.3, 139.7, -1092.4, -22, -61], // 9: the west quay towards the sun (Atlantis's P6)
];
// 60 s path: position + look-at every 2.5 s on one Catmull-Rom spline (<= 150 m and ~80 degrees between points)
const FLY = new Float32Array([
  0, 6, 1300, 0, 40, 0, //      0 s  low over the sea
  0, 12, 1150, 0, 44, 0,
  0, 26, 1000, 0, 50, 0,
  0, 44, 850, 0, 58, 0,
  0, 60, 700, 0, 64, 0, //     10 s  harbour, rings and crystal revealed
  0, 50, 545, 0, 68, 0,
  0, 34, 405, 0, 72, 0,
  0, 22, 285, 0, 76, 0,
  0, 20, 185, 0, 80, 0, //     20 s  up the south spoke
  8, 30, 110, 0, 88, 0,
  29, 66, 34, 0, 92, 0, //     25 s  around the crystal, 45 m out
  44, 84, -8, 0, 96, 0,
  15, 100, -42, 0, 98, 0,
  -29, 112, -34, 0, 96, 0, //  32.5 s  half way round
  -30, 84, -110, 60, 50, -80,
  10, 50, -190, 120, 14, -290,
  116, 32, -288, 200, 9, -330, // 40 s  low over the gardens (the heaviest views)
  205, 26, -335, 230, 14, -400,
  215, 26, -400, 190, 60, -700,
  215, 45, -540, 150, 150, -1100,
  195, 100, -690, 112, 230, -1330, // 50 s  climbing towards the waterfalls
  160, 165, -830, -60, 230, -1250,
  105, 230, -950, -200, 150, -900,
  45, 285, -1040, -40, 60, -500,
  0, 330, -1090, 0, 30, 0, //  60 s  the whole city, seen from over the foothills
]);
