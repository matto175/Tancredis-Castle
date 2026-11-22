// Tancredi's Castle: the three castles of this world (all original designs)
// - the king's castle on the podium at the centre: white walls, azure cones, gold points, warm windows
// - the Ivory Rock on its mountain shelf to the north-west: a horned skull carved in pale stone, the sorceress's
//   two slender towers behind it, a floating orb of light
// - the Serpent Fortress on the dark plain to the north-east: black tapering towers, a great serpent coiled up the
//   keep, cobra-head spires, green light
// Colours of ROOF and GLOW come from the vertex parameters (ea, eb, ec = sqrt of linear rgb), so one mesh can carry
// several. Never give MARBLE ec = 255 (the shader would make it hover like the old podium crystals).
// heroic palette: grey granite, dark slate roofs, gold points; the sorceress's deep blue; the serpent lord's black, olive and ember red
const AZURE = [0.24, 0.27, 0.32], VIOLET = [0.2, 0.3, 0.52], WARM = [1, 0.74, 0.38], CYAN = [0.55, 0.95, 1], VENOM = [0.55, 1, 0.3], EMBER = [1, 0.32, 0.1];
const col = (mb, c) => { mb.ea = round(c[0] * 254); mb.eb = round(c[1] * 254); mb.ec = round(c[2] * 254); };
const nocol = (mb) => { mb.ea = mb.eb = mb.ec = 0; };
// ellipsoid at (cx, cy, cz) with radii rx, ry, rz (direct vertices, so it works under a frame `fr`)
function blob(mb, cx, cy, cz, rx, ry, rz, seg = 20) {
  const nr = seg / 2, id = [];
  for (let j = 0; j <= nr; j++) { const b = -PI / 2 + j / nr * PI; for (let i = 0; i <= seg; i++) {
    const a = i / seg * TAU, ex = cos(b) * cos(a), ey = sin(b), ez = cos(b) * sin(a);
    id.push(mb.v(cx + rx * ex, cy + ry * ey, cz + rz * ez, ex / rx, ey / ry, ez / rz));
  } }
  for (let j = 0; j < nr; j++) for (let i = 0; i < seg; i++) { const k = j * (seg + 1) + i; mb.quad(id[k], id[k + 1], id[k + seg + 2], id[k + seg + 1]); }
}
// round tower at (x, z) from y0, radius R, wall height H, crenellated top, cone of roofH in colour c, gold point;
// glowing windows wc (or none). Returns the height of its tip.
function tower(mb, x, z, y0, R, H, roofH, c, wc, opt = {}) {
  const wall = opt.wall === undefined ? M.ROCK : opt.wall, trim = opt.trim === undefined ? M.ROCK : opt.trim, seg = opt.seg || 20;
  nocol(mb);
  const yt = y0 + H, cr = R + 0.9;
  mb.lathe([[R * 1.12, y0 - 1, wall], [R * 1.12, y0 + 2, wall], [R, y0 + 3.2, wall], [R, yt, trim], [cr, yt + 1.1, trim], [cr, yt + 1.6, trim]], { seg, cx: x, cz: z });
  // merlons on the rim, then the cone set back on the walkway
  mb.mat = trim; const n = max(6, round(TAU * cr / 2.4));
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU, mx = x + (cr - 0.35) * cos(a), mz = z + (cr - 0.35) * sin(a); mb.box(mx - 0.4, yt + 1.6, mz - 0.4, mx + 0.4, yt + 2.9, mz + 0.4, 0.08); }
  if (roofH > 0) {
    col(mb, c); mb.lathe([[cr - 0.7, yt + 1.6, M.ROOF], [R * 0.98, yt + 1.6 + roofH * 0.14, M.ROOF], [R * 0.55, yt + 1.6 + roofH * 0.55, M.ROOF], [0.15, yt + 1.6 + roofH, M.ROOF]], { seg, cx: x, cz: z, crease: 30 });
    nocol(mb); mb.mat = opt.point === undefined ? M.GOLD : opt.point;
    const top = yt + 1.6 + roofH;
    mb.lathe([[0.45, top - 0.6], [0.6, top + 0.2], [0.2, top + 0.9], [0.5, top + 1.4], [0.06, top + roofH * 0.12 + 2]], { seg: 8, cx: x, cz: z });
  } else { nocol(mb); mb.mat = trim; mb.lathe([[cr - 0.7, yt + 1.6], [0, yt + 1.6]], { seg, cx: x, cz: z }); }
  // windows: narrow lit slits in a few rows, staggered
  if (wc) {
    col(mb, wc); mb.mat = M.GLOW;
    const rows = max(1, floor((H - 6) / 9));
    for (let j = 0; j < rows; j++) for (let i = 0; i < 4; i++) {
      const a = (i + (j % 2) * 0.5) / 4 * TAU + (opt.wa || 0), y = y0 + 6 + j * 9, wx = cos(a), wz = sin(a), px = x + wx * (R + 0.02), pz = z + wz * (R + 0.02), tx = -wz * 0.45, tz = wx * 0.45;
      const v = (s, h) => mb.v(px + tx * s, y + h, pz + tz * s, wx, 0, wz);
      mb.quad(v(-1, 0), v(1, 0), v(1, 2.6), v(-1, 2.6));
    }
  }
  nocol(mb);
  return yt + 1.6 + roofH;
}
// battlemented ring wall of radius R (outer face), thickness T, height H from y0, n sides (0: round)
function ringWall(mb, R, T, y0, H, mat, trim, n = 0) {
  nocol(mb);
  const o = n ? { seg: n, flat: true, a0: PI / n, a1: PI / n + TAU } : { seg: 96 };
  mb.lathe([[R + 0.6, y0 - 1, mat], [R + 0.6, y0 + 1.5, mat], [R, y0 + 2.4, mat], [R, y0 + H, trim], [R + 0.7, y0 + H + 0.7, trim], [R + 0.7, y0 + H + 1.4, trim], [R - T, y0 + H + 1.4, mat], [R - T, y0 - 1, mat]], o);
  mb.mat = trim; const m = round(TAU * R / 3.2);
  for (let i = 0; i < m; i++) { const a = (i + 0.5) / m * TAU, cx = (R + 0.25) * cos(a), cz = (R + 0.25) * sin(a), c = cos(a), s = sin(a); mb.box(cx - 0.6 * abs(s) - 0.35 * abs(c), y0 + H + 1.4, cz - 0.6 * abs(c) - 0.35 * abs(s), cx + 0.6 * abs(s) + 0.35 * abs(c), y0 + H + 3, cz + 0.6 * abs(c) + 0.35 * abs(s), 0.08); }
}

// the king's castle, on the podium's plaza (y = 40). Its great tower's point reaches y = 156.
const KING = { wall: 37.5, keep: 18 };
function meshKingCastle() {
  const mb = new MB(1 << 17), Y = 40;
  ringWall(mb, KING.wall, 3, Y, 15, M.ROCK, M.ROCK);
  // six gatehouses on the spokes: a gold door, two flanking towers
  for (let k = 0; k < 6; k++) {
    const a = SPOKES[k], c = cos(a), s = sin(a), tx = -s, tz = c, R = KING.wall + 1.2;
    mb.mat = M.ROCK; nocol(mb);
    const gx = R * c, gz = R * s, P = (u, w) => [gx + c * u + tx * w, gz + s * u + tz * w];
    // gatehouse block (axis-aligned boxes would not follow the spoke: build it as a quad prism)
    const prism = (u0, u1, w, y0, y1, mat) => {
      mb.mat = mat; const q = [P(u0, -w), P(u1, -w), P(u1, w), P(u0, w)];
      for (let i = 0; i < 4; i++) { const A = q[i], B = q[(i + 1) % 4], nx = B[1] - A[1], nz = A[0] - B[0], l = hypot(nx, nz); mb.quad(mb.v(A[0], y0, A[1], -nx / l, 0, -nz / l), mb.v(B[0], y0, B[1], -nx / l, 0, -nz / l), mb.v(B[0], y1, B[1], -nx / l, 0, -nz / l), mb.v(A[0], y1, A[1], -nx / l, 0, -nz / l)); }
      mb.poly(q.map((p) => [p[0], y1, p[1]]), [0, 1, 0]);
    };
    prism(-4.5, 3, 6, Y - 1, Y + 19, M.ROCK);
    col(mb, [0.55, 0.36, 0.2]); prism(3, 3.25, 3.2, Y, Y + 8.5, M.ROOF); nocol(mb); // the door: oak planks
    prism(3, 3.35, 3.8, Y + 8.5, Y + 9.3, M.ROCK);
    for (const w of [-7.2, 7.2]) { const p = P(0, w); tower(mb, p[0], p[1], Y, 3.6, 25, 12, AZURE, WARM, { wa: a }); }
  }
  // inner court: six towers between the gates
  for (let k = 0; k < 6; k++) { const a = SPOKES[k] + PI / 6; tower(mb, 27 * cos(a), 27 * sin(a), Y, 4, 36, 15, AZURE, WARM, { wa: a }); }
  // the keep: an octagonal hall, four corner towers, the great tower, its spire
  nocol(mb);
  mb.lathe([[KING.keep + 1, Y - 1, M.ROCK], [KING.keep + 1, Y + 2, M.ROCK], [KING.keep, Y + 3, M.ROCK], [KING.keep, Y + 30, M.ROCK], [KING.keep + 0.8, Y + 30.8, M.ROCK], [KING.keep + 0.8, Y + 31.6, M.ROCK], [KING.keep - 1, Y + 31.6, M.ROCK], [KING.keep - 1, Y + 32, M.ROCK]], { seg: 8, flat: true, a0: PI / 8, a1: PI / 8 + TAU });
  col(mb, AZURE); mb.lathe([[KING.keep - 1, Y + 32, M.ROOF], [9.5, Y + 40, M.ROOF], [8.5, Y + 40.5, M.ROOF]], { seg: 8, flat: true, a0: PI / 8, a1: PI / 8 + TAU }); nocol(mb);
  // tall arched windows of the hall
  col(mb, WARM); mb.mat = M.GLOW;
  for (let i = 0; i < 8; i++) {
    const a = PI / 8 + (i + 0.5) / 8 * TAU, ap = KING.keep * cos(PI / 8) + 0.03, wx = cos(a), wz = sin(a), tx = -wz, tz = wx;
    for (const y of [Y + 8, Y + 19]) { const v = (s, h) => mb.v(ap * wx + tx * s, y + h, ap * wz + tz * s, wx, 0, wz); mb.quad(v(-1.1, 0), v(1.1, 0), v(1.1, 7), v(-1.1, 7)); mb.tri(v(-1.1, 7), v(1.1, 7), v(0, 8.3)); }
  }
  nocol(mb);
  for (let k = 0; k < 4; k++) { const a = PI / 4 + k * PI / 2; tower(mb, (KING.keep + 1.5) * cos(a), (KING.keep + 1.5) * sin(a), Y, 4.6, 52, 20, AZURE, WARM, { wa: a }); }
  // great tower: gold bands, a gallery, the spire tower and its long cone
  tower(mb, 0, 0, Y + 32, 8.5, 52, 0, AZURE, WARM);
  mb.mat = M.GOLD; for (const y of [Y + 50, Y + 68]) mb.lathe([[8.55, y], [8.9, y + 0.3], [8.9, y + 1.1], [8.55, y + 1.4]], { seg: 32 });
  return { mesh: (tower(mb, 0, 0, Y + 85.6, 5.2, 9, 21, AZURE, WARM), mb.build()), top: Y + 85.6 + 9 + 1.6 + 21 };
}
// watchtower on a round island in a bay of the middle canal (replaces Atlantis's crystal towers)
function meshWatchTower(h) {
  const mb = new MB(1 << 13);
  mb.lathe([[10.5, FLOOR_Y.mid - 0.2, M.QUAY], [10.5, 7.6, M.TRIM], [10.42, 7.7, M.TRIM], [9.3, 7.7, M.QUAY], [9.3, 9.2, M.TRIM], [9.22, 9.3, M.TRIM], [7.6, 9.3, M.MARBLE], [7.6, 11.2, M.TRIM], [7.5, 11.3, M.PAVE], [5.2, 11.3, M.PAVE]], { seg: 40, ao: (r, y) => (y < 8 ? 0.62 + 0.38 * sstep(3, 7.5, y) : 1) });
  tower(mb, 0, 0, 11.3, 6, h, 15, AZURE, WARM);
  return mb.build();
}

// the Ivory Rock, facing +x; local y = 0 is the shelf it stands on. Three meshes: bone (ROCK, ivory tint), dark parts
// (ROCK, near black tint), and the sorceress's towers with the eyes' and orb's light (own materials).
function meshIvoryRock() {
  const bone = new MB(1 << 16), dark = new MB(1 << 14), mag = new MB(1 << 15);
  bone.mat = M.ROCK; dark.mat = M.ROCK;
  // cranium, angry brow ridges, sharp cheekbones, upper and lower jaw with their teeth
  blob(bone, 0, 70, 0, 40, 46, 42, 32);
  for (const z of [-1, 1]) {
    bone.tube([[42, 66, z * 3, 5.5], [41, 71, z * 14, 6.5], [37, 77, z * 26, 5.5], [28, 79, z * 36, 3]], 10);
    bone.tube([[40, 49, z * 15, 5], [33, 50, z * 29, 5.5], [18, 54, z * 39, 4]], 10);
  }
  blob(bone, 25, 43, 0, 19, 11, 27, 20);
  blob(bone, 14, 19, 0, 25, 13, 24, 20);
  bone.box(-32, -2, -44, 32, 12, 44, 3); // the shelf's carved footing
  for (let i = -4; i <= 4; i++) { const z = i * 4.3, x = 41.5 - i * i * 0.35; bone.box(x - 2.4, 31, z - 1.7, x + 2.4, 39, z + 1.7, 0.6); bone.box(x - 4.4, 23, z - 1.7, x + 0.4, 30.4, z + 1.7, 0.6); }
  // dark: deep eye sockets, the nose, the mouth behind the teeth
  for (const z of [-1, 1]) { blob(dark, 37.5, 62, z * 15, 6.5, 9.5, 10, 16); blob(dark, 39, 66.5, z * 10.5, 4.5, 5, 6, 12); }
  for (const z of [-1, 1]) blob(dark, 43, 49.5, z * 2.6, 3, 5.5, 2.6, 12);
  dark.box(33, 22, -17, 40, 39, 17, 0.5);
  // horns: out to the sides, then up and forwards like a bull's (own mesh, darker ivory)
  const horn = new MB(1 << 13); horn.mat = M.ROCK;
  for (const z of [-1, 1]) { const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([2 + 30 * t * t * t, 86 + 62 * pow(t, 2.2), z * (34 + 50 * sin(t * 1.35)), 10.5 * pow(1 - t, 0.8) + 0.4]); } horn.tube(pts, 12); }
  // magic: glowing pupils, an orb over the crown, two slender violet-roofed towers behind
  mag.mat = M.GLOW; col(mag, CYAN);
  for (const s of [-1, 1]) blob(mag, 42.5, 62, s * 15, 2.2, 2.8, 2.8, 12);
  blob(mag, 0, 132, 0, 5, 5, 5, 16);
  col(mag, VIOLET); mag.box(39.5, 24, -6, 40.4, 37, 6, 0.3); // light from inside the mouth
  for (const s of [-1, 1]) tower(mag, -42, s * 34, 0, 4.2, 96, 26, VIOLET, CYAN, { seg: 16 });
  tower(mag, -60, 0, 0, 3.4, 70, 20, VIOLET, CYAN, { seg: 16 });
  return { bone: bone.build(), dark: dark.build(), mag: mag.build(), horn: horn.build() };
}

// the Serpent Fortress; local y = 0 is the plain. Dark stone (ROCK, tinted), the serpent (ROCK, green tint), light
// and fangs in the third mesh.
function meshSerpentFortress() {
  const st = new MB(1 << 17), sn = new MB(1 << 16), lt = new MB(1 << 15);
  st.mat = M.ROCK; sn.mat = M.ROCK;
  // the keep: a tapering black tower, ribbed
  const keepR = (y) => mix(21, 8, pow(y / 150, 0.8));
  const prof = []; for (let i = 0; i <= 15; i++) { const y = i * 10; prof.push([keepR(y) + (i % 3 === 0 ? 1.4 : 0), y]); } prof.push([3, 170], [0, 186]);
  st.lathe(prof, { seg: 12, flat: true, crease: 20 });
  // walls: an octagon of black stone with sharp merlons, four towers with cobra-head spires
  ringWall(st, 92, 4, 0, 18, M.ROCK, M.ROCK, 8);
  const heads = [];
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + k * PI / 2, x = 62 * cos(a), z = 62 * sin(a);
    st.mat = M.ROCK; st.lathe([[9.5, -1], [9.5, 4], [7.5, 8], [6, 62], [7.5, 64], [7.5, 68], [4, 70], [0, 92]], { seg: 10, flat: true, cx: x, cz: z, crease: 20 });
    // cobra head over each spire: a neck rising and bending outwards
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([x + cos(a) * 9 * t * t, 66 + 26 * sin(t * 1.4), z + sin(a) * 9 * t * t, 2.6 - 0.6 * t]); }
    sn.tube(pts, 10, false); heads.push([pts[10][0], pts[10][1], pts[10][2], a, 1]);
    for (let j = 0; j < 3; j++) { const ya = 18 + j * 15, wa = a + PI + (j - 1) * 0.5; col(lt, EMBER); lt.mat = M.GLOW; const wx = cos(wa), wz = sin(wa), r = mix(7.5, 6, (ya - 8) / 54) + 0.1, px = x + wx * r, pz = z + wz * r; const v = (s, h) => lt.v(px - wz * s * 0.5, ya + h, pz + wx * s * 0.5, wx, 0, wz); lt.quad(v(-1, 0), v(1, 0), v(1, 3), v(-1, 3)); }
  }
  // the great serpent: coils up the keep and rears over it, looking towards the city (+x)
  const body = [], turns = 3.25, N = 160;
  for (let i = 0; i <= N; i++) { const t = i / N, y = 2 + t * 128, a = t * turns * TAU + PI, r = keepR(y) + 4.2; body.push([r * cos(a), y, r * sin(a), 5.5 - 2 * t]); }
  const e = body[N]; for (let i = 1; i <= 12; i++) { const t = i / 12; body.push([mix(e[0], 26, t), e[1] + 46 * sin(t * PI * 0.6), mix(e[2], 0, t), 3.5 + 1.2 * sin(t * PI)]); }
  sn.tube(body, 14, false);
  const hd = body[body.length - 1]; heads.push([hd[0], hd[1], hd[2], 0, 2.4]);
  // heads: hood, skull, jaws, fangs, green eyes
  for (const [x, y, z, a, k] of heads) {
    const c = cos(a), s = sin(a), F = (u, h, w) => [x + (c * u - s * w) * k, y + h * k, z + (s * u + c * w) * k];
    sn.mat = M.ROCK; nocol(sn);
    sn.fr = [x, y, z, c, -s, k]; // frame: local u along +x of the head
    blob(sn, 0, 0.5, 0, 2.6, 2, 4.8, 14); // hood
    blob(sn, 2.6, 0.4, 0, 3.6, 1.6, 2.2, 14); // skull
    blob(sn, 3.2, -1.4, 0, 3, 0.8, 1.9, 12); // open jaw
    sn.fr = null;
    lt.fr = [x, y, z, c, -s, k]; lt.mat = M.TRIM; nocol(lt);
    for (const w of [-0.9, 0.9]) lt.tube([[5.2, -0.1, w, 0.35], [5.4, -1.2, w, 0.25], [5.5, -1.9, w, 0.05]], 6);
    lt.mat = M.GLOW; col(lt, EMBER); for (const w of [-1.1, 1.1]) blob(lt, 4.2, 1.2, w, 0.55, 0.45, 0.45, 10);
    lt.fr = null; nocol(lt);
  }
  // green bands of light round the keep, windows
  lt.mat = M.GLOW; col(lt, EMBER);
  for (const y of [40, 80, 118]) { const r = keepR(y) + 0.08; lt.lathe([[r + 0.05, y], [r + 0.05, y + 1.1]], { seg: 12, flat: true }); }
  nocol(lt);
  // a gate of glowing teeth towards the swamp and the city
  st.mat = M.ROCK; st.box(86, 0, -9, 98, 24, 9, 1);
  lt.mat = M.GLOW; col(lt, EMBER); lt.box(97.9, 0, -4.5, 98.4, 11, 4.5, 0.1); nocol(lt);
  lt.mat = M.TRIM; for (let i = -3; i <= 3; i++) lt.lathe([[0.7, 0], [0, -3]], { seg: 6, cx: 98.6, cy: 12, cz: i * 1.3 });
  return { stone: st.build(), snake: sn.build(), light: lt.build() };
}
// glowing swamp: a flat irregular disc
function meshSwamp(R) {
  const mb = new MB(1 << 12); mb.mat = M.GLOW; col(mb, [0.07, 0.16, 0.05]);
  const c = mb.v(0, 0, 0, 0, 1, 0), n = 64, ring = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, r = R * (1 + 0.18 * sin(3 * a + 1) + 0.1 * sin(7 * a + 2)); ring.push(mb.v(r * cos(a) * 1.6, 0, r * sin(a), 0, 1, 0)); }
  for (let i = 0; i < n; i++) mb.tri(c, ring[i], ring[(i + 1) % n]);
  nocol(mb); return mb.build();
}

// placing everything (world.js). gH: the land mesh's height. Faces: towards the city centre.
function placeCastles(type, put, gH) {
  const king = meshKingCastle();
  put(type([king.mesh], K.SOLID), 0, 0, 0, 1, Q0, rgb(0.64, 0.64, 0.63));
  const tw = [40, 46, 36].map((h) => type([meshWatchTower(h)], K.SOLID));
  for (let k = 0; k < 6; k++) put(tw[k % 3], TOWER_R * cos(TOWERS[k]), 0, TOWER_R * sin(TOWERS[k]), 1, qYaw(k * 0.4), rgb(0.64, 0.64, 0.63));
  const face = (F) => qYaw(-atan2(-F[1], -F[0]));
  const rk = meshIvoryRock(), yR = ROCCA[4] - 1.5, qR = face(ROCCA);
  put(type([rk.bone], K.SOLID), ROCCA[0], yR, ROCCA[1], 1, qR, rgb(0.86, 0.84, 0.76));
  put(type([rk.dark], K.SOLID), ROCCA[0], yR, ROCCA[1], 1, qR, rgb(0.12, 0.1, 0.13));
  put(type([rk.mag], K.SOLID), ROCCA[0], yR, ROCCA[1], 1, qR);
  put(type([rk.horn], K.SOLID), ROCCA[0], yR, ROCCA[1], 1, qR, rgb(0.5, 0.36, 0.22));
  const sf = meshSerpentFortress(), yS = SERPI[4] - 0.8, qS = face(SERPI);
  put(type([sf.stone], K.SOLID), SERPI[0], yS, SERPI[1], 1, qS, rgb(0.07, 0.08, 0.12));
  put(type([sf.snake], K.SOLID), SERPI[0], yS, SERPI[1], 1, qS, rgb(0.15, 0.3, 0.12));
  put(type([sf.light], K.SOLID), SERPI[0], yS, SERPI[1], 1, qS);
  const sw = [SERPI[0] - 200, SERPI[1] + 250];
  put(type([meshSwamp(60)], K.SOLID), sw[0], SERPI[4] + 0.35, sw[1], 1, qYaw(0.5));
  return king.top;
}
