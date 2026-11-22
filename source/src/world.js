// the world: which meshes exist and where every instance stands
const K = { SOLID: 0, LEAF: 1, CRYSTAL: 2, GLASS: 3, WATER: 4, CASCADE: 5 };
// flags: not in the camera cascade / mirror / any shadow map / baked shadows (moving things); never culled; drawn
// last (ground); thin crystal, drawn after the solid crystals so they show through
const NO_NEAR = 1, NO_MIRROR = 2, NO_SHADOW = 4, NO_BAKE = 8, ALWAYS = 16, DRAW_LAST = 32, THIN = 64;
const Q0 = [0, 0, 0, 1];
const rgb = (r, g, b, a = 1) => (round(clamp(a, 0, 1) * 255) << 24 | round(clamp(b, 0, 1) * 255) << 16 | round(clamp(g, 0, 1) * 255) << 8 | round(clamp(r, 0, 1) * 255)) >>> 0;

function buildWorld() {
  const meshes = [], types = [];
  let IB = new ArrayBuffer(48 << 14), IF = new Float32Array(IB), IU = new Uint32Array(IB), nI = 0;
  // up to four LODs switched at d01, d12, d23, gone beyond dmax; thin > 0: distance where instances start thinning out
  const type = (lods, kind, d01 = 1e9, d12 = 1e9, dmax = 1e9, thin = 0, flags = 0, d23 = 1e9) => { types.push({ lods: lods.map((m) => meshes.push(m) - 1), kind, d: [d01, d12, dmax, thin], d23, flags, n: 0 }); return types.length - 1; };
  const put = (ty, x, y, z, s = 1, q = Q0, tint = 0xffffffff, sy = 1) => {
    if ((nI + 1) * 48 > IB.byteLength) { const n = new ArrayBuffer(IB.byteLength * 2); new Uint8Array(n).set(new Uint8Array(IB)); IB = n; IF = new Float32Array(n); IU = new Uint32Array(n); }
    const o = nI++ * 12; IF[o] = x; IF[o + 1] = y; IF[o + 2] = z; IF[o + 3] = s; IF[o + 4] = q[0]; IF[o + 5] = q[1]; IF[o + 6] = q[2]; IF[o + 7] = q[3];
    IU[o + 8] = tint; IU[o + 9] = ty; IF[o + 10] = types[ty].flags & ALWAYS ? 1e6 : meshes[types[ty].lods[0]].rad * s * max(1, sy); IF[o + 11] = sy; types[ty].n++;
  };
  // ground masks, 1 m/texel over +-1024 m. City: r paved, g planting bed, b worn path. Farmed shelf: r track, g wide-row
  // crop, b parcel verge, a tilled field; LANDMAP there: crop colour (sqrt) and in alpha the earth between rows.
  // CROP per parcel kind: colour, earth between rows, wide rows.
  const MAP = new Uint8Array(2048 * 2048 * 4), LANDMAP = new Uint8Array(2048 * 2048 * 4);
  const CROP = [null, [0.4, 0.31, 0.12, 0.3, 0], [0.26, 0.2, 0.4, 0.85, 1], [0.1, 0.19, 0.055, 0.9, 1], null, [0.2, 0.145, 0.095, 0.5, 0], [0.085, 0.2, 0.06, 0.22, 0]];
  const paint = (x, z, rad, ch, val, soft = 1.5) => {
    const x0 = max(0, floor(x + 1024 - rad - soft)), x1 = min(2047, ceil(x + 1024 + rad + soft)), z0 = max(0, floor(z + 1024 - rad - soft)), z1 = min(2047, ceil(z + 1024 + rad + soft));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const d = hypot(i + 0.5 - 1024 - x, j + 0.5 - 1024 - z), k = clamp((rad + soft - d) / soft, 0, 1), o = (j * 2048 + i) * 4 + ch; MAP[o] = MAP[o] + (val - MAP[o]) * k; }
  };
  for (let j = 0; j < 2048; j++) for (let i = 0; i < 2048; i++) {
    const x = i + 0.5 - 1024, z = j + 0.5 - 1024, r = hypot(x, z), o = (j * 2048 + i) * 4;
    if (r < 420) { const zn = zoneOf(x, z), lat = spokeLat(x, z); MAP[o] = zn === 2 || lat < 8.5 ? 255 : 0; }
    else {
      LANDMAP[o] = 140; LANDMAP[o + 1] = 162; LANDMAP[o + 2] = 115; // grass, for a crop's edge to blend into
      // no fields at the canal, coast, river or under the woods
      const t = atan2(z, x), zone = r < 1250 ? sstep(20, 50, r - RB.out(t)) * sstep(25, 60, coastT(t) - r) * sstep(RIV_SHELF + 2, RIV_SHELF + 10, riverDist(x, z)) * (1 - sstep(0.57, 0.62, woodAt(x, z))) : 0;
      if (zone > 0) {
        const pa = parcelAt(x, z), use = parcelUse(pa.b, pa.s), C = CROP[use.kind], tone = 0.8 + 0.4 * use.id;
        if (use.farm) MAP[o + 2] = 255 * zone * (1 - sstep(1, 3.2, pa.edge));
        if (C) { MAP[o + 3] = 255 * zone * sstep(1.4, 3.4, pa.edge); MAP[o + 1] = 255 * C[4]; for (let k = 0; k < 3; k++) LANDMAP[o + k] = 255 * sqrt(min(1, C[k] * tone)); LANDMAP[o + 3] = 255 * C[3]; }
      }
    }
  }

  // ground, podium, terrain
  put(type([meshCityGround()], K.SOLID, 1e9, 1e9, 1e9, 0, DRAW_LAST), 0, 0, 0);
  put(type([meshPodium()], K.SOLID), 0, 0, 0);
  const tStair = type([meshPodiumStair(0), meshPodiumStair(1)], K.SOLID, 125, 1e9, 1e9);
  for (const a of SPOKES) put(tStair, STAIR_C[0] * cos(a), STAIR_C[1], STAIR_C[0] * sin(a), 1, qYaw(-a));
  const land = meshTerrain();
  // Medium/Low: three LODs per chunk, distances in LODK units. LOD distance is measured from the sphere's edge less half
  // its radius, so chunks count as twice their size: the one under the camera must be finest (collision follows it).
  for (const ch of land.chunks) { put(type(ch.lods, K.SOLID, QL(1e9, 650, 500), QL(1e9, 1950, 1500), 1e9, 0, NO_NEAR | DRAW_LAST), ch.c[0], ch.c[1], ch.c[2]); if (LV) IF[(nI - 1) * 12 + 10] *= 2; }

  // bridges and their balustrades
  const tPost = type([meshBalPost(0), meshBalPost(1)], K.SOLID, 130, 1e9, 700), tPanel = type([meshBalPanel(0), meshBalPanel(1)], K.CRYSTAL, 130, 1e9, 420, 0, NO_NEAR | THIN);
  // balustrade from a to b, posts at both ends
  const balRun = (a, b) => {
    const L = hypot(b[0] - a[0], b[2] - a[2]), n = max(1, round(L / BAL)), k = L / n / BAL, q = qYaw(-atan2(b[2] - a[2], b[0] - a[0]));
    for (let i = 0; i < n; i++) { const t = i / n, x = mix(a[0], b[0], t), y = mix(a[1], b[1], t), z = mix(a[2], b[2], t); put(tPost, x, y, z, k, q, 0xffffffff, 1 / k); put(tPanel, x, y, z, k, q, 0xffffffff, 1 / k); }
  };
  const balArc = (r, y, a0, a1) => { const n = max(1, round(abs(a1 - a0) * r / BAL)); for (let i = 0; i < n; i++) { const t0 = mix(a0, a1, i / n), t1 = mix(a0, a1, (i + 1) / n); balRun([r * cos(t0), y, r * sin(t0)], [r * cos(t1), y, r * sin(t1)]); } };
  const brm = new MB(1 << 15);
  for (let k = 0; k < 6; k++) {
    const t = SPOKES[k], c = cos(t), s = sin(t);
    const span = (r0, r1, ya, yb, hump, arches, floor) => {
      const b = bridge(brm, r0 * c, r0 * s, r1 * c, r1 * s, SPOKE_W, ya, yb, hump, arches, floor), S = max(2, round(b.L / 7.8));
      for (const sd of [-1, 1]) for (let i = 0; i < S; i++) {
        const u0 = b.L * i / S, u1 = b.L * (i + 1) / S, v = sd * (SPOKE_W - 0.19), P = (u) => [r0 * c + b.ux * u + b.vx * v, b.top(u) + 0.34, r0 * s + b.uz * u + b.vz * v];
        balRun(P(u0), P(u1));
      }
    };
    // decks 1 cm above the quays' copings, against z-fighting
    span(RB.moat(t) + 0.4, STAIR.r0, 10.31, STAIR.y0, 0.5, 3, FLOOR_Y.moat);
    span(RB.civ(t) - 0.4, RB.mid(t) + 0.4, 10.31, 10.31, 1.15, 3, FLOOR_Y.mid);
    span(RB.chi(t) - 0.4, RB.cho(t) + 0.4, 10.31, 10.31, k ? 0.5 : 1.0, k ? 1 : 3, FLOOR_Y.ch);
    span(RB.gar(t) - 0.4, RB.out(t) + 0.4, 10.31, 10.31, 1.15, 3, FLOOR_Y.out);
  }
  put(type([brm.build()], K.SOLID), 0, 0, 0);
  // podium balustrades: plaza edge and the two ledges, between the stairways
  for (let k = 0; k < 6; k++) for (const [R, y] of [[57.2, 40.46], [69.3, 30.46], [83.8, 20.46]]) { const c = asin((STAIR.hw + 1) / R); balArc(R, y, SPOKES[k] + c, SPOKES[k] + PI / 3 - c); }

  // the castles of Tancredi's world (castles.js) in place of the crystal, lotus, pylons and crystal towers
  placeCastles(type, put, land.heightAt);
  placeEvents(type, put); placeHero(type, put); // the dragon, the fleets and the hero (events.js)

  // water
  const wm = new MB(1 << 14);
  waterRing(wm, RB.civ, RB.mid, WATER, 0); waterRing(wm, RB.chi, RB.cho, WATER, 0); waterRing(wm, RB.gar, RB.out, WATER, 0);
  waterRing(wm, 85, RB.moat, WATER, 1); waterRing(wm, 58, 60.4, 29.9, 1, 192); waterRing(wm, 70.5, 72.9, 19.9, 1, 192);
  waterRing(wm, 57, 57.8, 39.84, 1, 192); waterRing(wm, 69.5, 70.3, 29.84, 1, 192); waterRing(wm, 84, 84.8, 19.84, 1, 192);
  put(type([wm.build()], K.WATER), 0, 0, 0);
  put(type([meshSea()], K.WATER), 0, 0, 0);
  put(type([meshCascades()], K.CASCADE), 0, 0, 0);

  const hard = { domes: [], halls: [], villas: [], shapes: [] };
  populate({ type, put, paint, MAP, balRun, gH: land.heightAt, hard });
  return { meshes, types, inst: IB.slice(0, nI * 48), nI, MAP, LANDMAP, ground: land.drawnAt, hard };
}
