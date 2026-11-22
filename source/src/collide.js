// collision: what the camera cannot fly into
// solid: land, water, city ground and quays, podium, bridge decks and pier (passable under arches), harbour quays,
// west quay, crystal, towers, domes, halls, villas. Trees, bushes, rocks, lotus, farmsteads and piers are not.
// surfaceAt(x, z, y): the floor and ceiling (under a bridge) the camera must keep between. The heights mirror the
// numbers the meshes are built from (layout.js, meshes.js, city.js): change both together. Runs every frame; no allocation.
const CLEAR = 0.9, CLEAR_W = 0.55; // clearance above solid ground, and above water
const COL = new Float64Array(3); // last query: floor, ceiling, 1 where the floor is natural ground, 2 water
let landY = null; // set by main.js once the world is built
const TWX = new Float64Array(6), TWZ = new Float64Array(6); for (let k = 0; k < 6; k++) { TWX[k] = TOWER_R * cos(TOWERS[k]); TWZ[k] = TOWER_R * sin(TOWERS[k]); }
const WQA0 = 205 * DEG, WQA1 = 290 * DEG; // sector of the west quay's steps, seen from its centre
// great crystal: height over distance from its axis (profile in world.js, 0.7 m margin)
// the king's castle (castles.js): great tower, keep, the six inner towers, gatehouses, ring wall
const offS = (t, a0) => { const d = angd(t, a0); return d - round(d / (PI / 3)) * PI / 3; };
const kingY = (r, t) => {
  if (r < 9.5) return 160; if (r < 20) return 74;
  const o = offS(t, PI / 2 + PI / 6); if (hypot(r * cos(o) - 27, r * sin(o)) < 5.5) return 96;
  if (r > 33.5 && r < 43.8 && abs(offS(t, PI / 2)) * r < 11.5) return 82;
  return r > 33.5 && r < 39.2 ? 60 : 40;
};
const crystalY = (d) => { const q = max(d - 0.7, 0); return 44.4 + (q < 3.5 ? 95.5 + (3.5 - q) / 3.5 * 5.5 : q < 7.25 ? 84 + (7.25 - q) / 3.75 * 11.5 : (8.5 - q) / 1.25 * 84); };
// tower of height h on its stepped island (meshTowerTrim)
const towerY = (d, h) => { return d < 7.8 ? 11.3 + [40, 46, 36][h] + 20 : d < 4.3 ? 12.8 : d < 5.2 ? 12.2 : d < 7.6 ? 11.3 : d < 9.3 ? 9.3 : 7.7; };
// solid buildings, from `hard` in city.js (main.js passes them as flat arrays)
let HD = null, HH = null, HV = null, HS = null;
function setHard(h) { HD = new Float64Array(h.domes); HH = new Float64Array(h.halls); HV = new Float64Array(h.villas); HS = new Float64Array(h.shapes); }
const HALL_TOP = LAND + 7.4 + 3.3 + 0.95; // two storeys and parapet (`hall` in plants.js)
// dome of drum radius R: height over distance from its axis (meshDome)
const domeY = (d, R) => {
  const top = LAND + 0.9 + 8.5 + R * 0.12 + 0.5, q = max(d - 0.6, 0) / (R - 0.25);
  return q < 1 ? top + R * 0.92 * sqrt(1 - pow(q, 2 / 0.85)) : d < R + 1.1 ? top : d < R + 1.9 ? LAND + 0.9 : d < R + 3.3 ? LAND + 0.6 : LAND + 0.3;
};
// top of the building covering a place, or -1e9; r, t: polar coordinates
function builtY(x, z, r, t) {
  let y = -1e9;
  for (let i = 0; i < HD.length; i += 3) { const d = hypot(x - HD[i], z - HD[i + 1]); if (d < HD[i + 2] + 4.2) return domeY(d, HD[i + 2]); }
  for (let i = 0; i < HH.length; i += 4) if (abs(r - HH[i]) < HH[i + 3] / 2 + 0.7 && abs(angd(t, HH[i + 1])) < HH[i + 2] + 0.7 / HH[i]) return HALL_TOP;
  // villa: main volume (round or rectangular) and lower wing, in its own frame
  for (let i = 0; i < HV.length; i += 7) {
    const dx = x - HV[i], dz = z - HV[i + 2]; if (dx * dx + dz * dz > 250) continue;
    const s = HV[i + 5], lx = (dx * HV[i + 3] - dz * HV[i + 4]) / s, lz = (dx * HV[i + 4] + dz * HV[i + 3]) / s, o = HV[i + 6] * 9, m = 0.6 / s;
    if (HS[o] > 0 ? lx * lx + lz * lz < (HS[o] + m) * (HS[o] + m) : abs(lx) < HS[o + 1] + m && abs(lz) < HS[o + 2] + m) y = max(y, HV[i + 1] + HS[o + 3] * s);
    else if (abs(lx - HS[o + 4]) < HS[o + 6] + m && abs(lz - HS[o + 5]) < HS[o + 7] + m) y = max(y, HV[i + 1] + HS[o + 8] * s);
  }
  return y;
}
// deck over open arches: on it or under it, decided by last frame's height so a long step can't pass through.
// `under`: the surface below.
function deck(top, under, y0) { if (y0 >= top - 0.1) { COL[0] = top + CLEAR; COL[1] = 1e9; } else { COL[0] = under + CLEAR_W; COL[1] = top - 1.2; } COL[2] = 0; }
// canal between Rin and Rout: its water, or the spoke's bridge
function canal(r, lat, Rin, Rout, hump, y0) {
  if (lat < SPOKE_W) deck(10.31 + hump * sin(PI * clamp((r - Rin + 0.4) / (Rout - Rin + 0.8), 0, 1)), WATER, y0);
  else { COL[0] = WATER + CLEAR_W; COL[1] = 1e9; COL[2] = 2; }
}
function surfaceAt(x, z, y0) {
  const r = hypot(x, z), t = atan2(z, x);
  COL[1] = 1e9; COL[2] = 0;
  let lat = 1e9; for (let k = 0; k < 6; k++) { const a = angd(t, SPOKES[k]); if (abs(a) < PI / 2) { const l = abs(r * sin(a)); if (l < lat) lat = l; } }
  const ro = RB.out(t);
  if (r < ro + 0.66) {
    let f = LAND;
    if (r < 92 && r > 56.5 && lat < STAIR.hw + 0.6) f = stairY(r) + (lat > STAIR.hw ? 0.95 : 0); // stairway and its cheek walls
    else if (r < 58) f = kingY(r, t); // the king's castle on the plaza (castles.js)
    else if (r < 70.5) f = 30;
    else if (r < 85) f = 20;
    else {
      const m = RB.moat(t);
      if (r < m) {
        // moat: the spoke's bridge climbs from the quay to the stairway's foot
        if (lat < SPOKE_W) { deck(mix(14, 10.31, clamp((r - 92) / (m + 0.4 - 92), 0, 1)) + 0.5 * sin(PI * clamp((r - 92) / (m + 0.4 - 92), 0, 1)), WATER, y0); return; }
        COL[0] = WATER + CLEAR_W; COL[2] = 2; return;
      }
      const civ = RB.civ(t);
      if (r >= civ) {
        const mid = RB.mid(t);
        if (r < mid) {
          // middle canal, and the towers in its bays
          for (let k = 0; k < 6; k++) { const d = hypot(x - TWX[k], z - TWZ[k]); if (d < 10.5) { COL[0] = towerY(d, k % 3) + CLEAR; return; } }
          canal(r, lat, civ, mid, 1.15, y0); return;
        }
        const chi = RB.chi(t);
        if (r >= chi) {
          const cho = RB.cho(t);
          if (r < cho) { canal(r, lat, chi, cho, 0.75, y0); return; }
          const gar = RB.gar(t);
          if (r >= gar && r < ro) { canal(r, lat, gar, ro, 1.15, y0); return; }
          if (r >= ro) f = 10.3; // outer quay's coping
        }
      }
    }
    if (r > 100) { const b = builtY(x, z, r, t); if (b > f) f = b; }
    COL[0] = f + CLEAR; return;
  }
  // outside the city: land mesh, what is built on it, and the water over it
  let h = landY(x, z), nat = 1;
  const sa = abs(angd(t, PI / 2));
  if (sa < 0.9 && r < 660) {
    // harbour: stepped quays, south pier and its round head, breakwaters
    let q = -1e9;
    if (sa < QUAY_END && r > 444 && r < 487) q = quayY(r);
    else if (hypot(x, z - 608) < 16) q = 10.26;
    else if (r > 634 && r < 646 && sa > 8 * DEG && sa < 37 * DEG) q = 2.7;
    if (q > h) { h = q; nat = 0; }
    // the pier starts on the quays' top terrace: no way under it there
    if (abs(x) < SPOKE_W && z > 446 && z < 598) { if (h > 7.5) COL[0] = 10.3 + CLEAR; else deck(10.3, max(h, 0), y0); return; }
  } else if (x < -790 && x > -915) {
    // west quay: round terrace and the steps down to the sea
    const dx = x - WQ[0], dz = z - WQ[1], d = hypot(dx, dz);
    if (d < 52) {
      let q = -1e9;
      if (d < 24.4) q = 16.3;
      else { let a = atan2(dz, dx); if (a < 0) a += TAU; if (a > WQA0 && a < WQA1) q = max(16.3 - (d - 24) * 0.6, 1.54); }
      if (q > h) { h = q; nat = 0; }
    }
  }
  if (r < 900) { const b = builtY(x, z, r, t); if (b > h) { h = b; nat = 0; } }
  // sea, and the river in its valley
  let w = 0; if (z < RIV_Z0 && riverDist(x, z) < RIV_SHELF - 2) w = riverLevel(z);
  if (h < w) COL[0] = w + CLEAR_W; else COL[0] = h + CLEAR;
  COL[2] = h < w ? 2 : nat;
}
// move the camera from (px, py, pz) towards F[CX..CZ] (velocity F[VX..VZ]), correcting both in place. Natural ground
// lifts it; anything built higher than a stair step is a wall it slides along per axis. Long steps go in <= 2 m pieces.
function collide(px, py, pz) {
  if (!landY) return;
  const tx = F[CX], ty = F[CY], tz = F[CZ], n = min(16, ceil(hypot(tx - px, tz - pz) / 2));
  if (n < 2) { collide1(px, py, pz); return; }
  let cx = px, cy = py, cz = pz, dx = (tx - px) / n, dz = (tz - pz) / n; const dy = (ty - py) / n;
  for (let i = 0; i < n; i++) {
    F[CX] = cx + dx; F[CY] = cy + dy; F[CZ] = cz + dz; collide1(cx, cy, cz);
    if (F[CX] === cx) dx = 0; if (F[CZ] === cz) dz = 0; // an axis that hit a wall stays there
    cx = F[CX]; cy = F[CY]; cz = F[CZ];
  }
}
function collide1(px, py, pz) {
  let x = F[CX], y = F[CY], z = F[CZ];
  const lift = 0.5 + 1.5 * hypot(x - px, z - pz);
  surfaceAt(x, z, py);
  if (COL[2] < 0.5 && COL[0] - y > lift) {
    surfaceAt(x, pz, py);
    if (COL[2] > 0.5 || COL[0] - y <= lift) { z = pz; F[VZ] = 0; }
    else {
      surfaceAt(px, z, py);
      if (COL[2] > 0.5 || COL[0] - y <= lift) { x = px; F[VX] = 0; }
      else { x = px; z = pz; F[VX] = 0; F[VZ] = 0; surfaceAt(x, z, py); }
    }
  }
  if (y < COL[0]) { y = COL[0]; if (F[VY] < 0) F[VY] = 0; } else if (y > COL[1]) { y = COL[1]; if (F[VY] > 0) F[VY] = 0; }
  F[CX] = x; F[CY] = y; F[CZ] = z;
}
