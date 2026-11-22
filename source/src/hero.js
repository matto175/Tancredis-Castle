// Tancredi il Prode: the hero you play (key P switches between him and free flight)
// He walks, runs and jumps on what collide.js calls the floor: steps up to STEP m, no water, no walls; the camera
// follows behind him. Click (or the sword button) swings the sword; F (or the lightning button) raises the Sword of
// Thunder: a stroke of lightning, a shout, gold armour and a fiery cape, and for POWER_T s he runs, jumps and strikes
// far harder (a wave of light with each blow). Then a short rest before the next time.
// State lives in HERO; heroStep() runs each frame instead of the flight (main.js), heroU() fills the shader's
// uniforms (View.hero*, read by heroAt() in sh_scene.js).
const STEP = 0.95, GRAV = 24, POWER_T = 30, POWER_REST = 6, TRANSFORM_T = 1.6, SWING_T = 0.5;
const HERO_START = [0, 0, 236, 0]; // on the south avenue, facing the castle (x, -, z, yaw)
const HERO = {
  on: 1, x: HERO_START[0], y: 20, z: HERO_START[2], yaw: HERO_START[3], vx: 0, vz: 0, vy: 0, ground: 0, ph: 0, sp: 0,
  swing: -1, swingQ: 0, jumpQ: 0, powerQ: 0, pT: -1e9, wave: -1, camYaw: 0, camPitch: -0.1, camD: 4.4, ready: 0,
};
const HU = new Float32Array(12);
// the floor at (x, z) for someone standing at y: height, and whether it is water
const heroFloor = (x, z, y) => { surfaceAt(x, z, y + 0.5); return COL[2] > 1.5 ? -1e9 : COL[0] - CLEAR; };
const heroPower = (t) => { const d = t - HERO.pT; return d >= 0 && d < POWER_T + 1 ? clamp(min((d - 0.6) / 0.4, (POWER_T + 1 - d) / 1), 0, 1) : 0; };
// start the transformation (if rested)
function heroRaise(t) {
  if (t - HERO.pT < POWER_T + POWER_REST) return;
  HERO.pT = t; evSound('K', 0.3); evSound('P');
  heroSay('Spada del Tuono, dammi la forza!');
}
function heroPlace(x, z, yaw) {
  HERO.x = x; HERO.z = z; HERO.yaw = yaw; HERO.vx = HERO.vz = HERO.vy = 0;
  let y = 300; surfaceAt(x, z, y); HERO.y = COL[0] - CLEAR; HERO.ground = 1; HERO.camYaw = yaw; HERO.ready = 1;
}
// one frame: dyw, dpt the mouse's turn; mf, mr forward and right (-1..1), run; returns the camera
function heroStep(dt, t, dyw, dpt, mf, mr, run) {
  const H = HERO;
  if (!H.ready) heroPlace(H.x, H.z, H.yaw);
  const pw = heroPower(t), tr = t - H.pT, still = tr >= 0 && tr < TRANSFORM_T;
  if (H.powerQ) { H.powerQ = 0; heroRaise(t); }
  // camera turn; it also drifts round behind him while he walks
  H.camYaw += dyw; H.camPitch = clamp(H.camPitch - dpt, -0.75, 0.6);
  // movement relative to the camera, eased; he turns to face where he goes
  let dx = sin(H.camYaw) * mf + cos(H.camYaw) * mr, dz = -cos(H.camYaw) * mf + sin(H.camYaw) * mr;
  const m = hypot(dx, dz); if (m > 1) { dx /= m; dz /= m; }
  const top = (run ? 7.5 : 3.4) * (1 + 1.6 * pw) * (still ? 0 : 1), k = 1 - exp(-dt * (H.ground ? 10 : 2.5));
  H.vx += (dx * top - H.vx) * k; H.vz += (dz * top - H.vz) * k;
  const sp = hypot(H.vx, H.vz);
  if (sp > 0.3) { let a = atan2(H.vx, -H.vz) - H.yaw; a -= round(a / TAU) * TAU; H.yaw += a * (1 - exp(-dt * 12)); }
  if (m > 0.1 && !dyw) { let a = H.yaw - H.camYaw; a -= round(a / TAU) * TAU; H.camYaw += a * (1 - exp(-dt * 0.8)) * min(sp / 3, 1); }
  // jump, gravity
  if (H.jumpQ) { H.jumpQ = 0; if (H.ground && !still) { H.vy = 7.2 + 9 * pw; H.ground = 0; evSound('J'); } }
  H.vy -= GRAV * dt;
  // walls: a step higher than STEP (or water) stops him, one axis at a time
  let nx = H.x + H.vx * dt, nz = H.z + H.vz * dt;
  const ok = (x, z) => { const f = heroFloor(x, z, H.y); return f > -1e8 && f - H.y <= STEP; };
  if (!ok(nx, nz)) { if (ok(nx, H.z)) { nz = H.z; H.vz = 0; } else if (ok(H.x, nz)) { nx = H.x; H.vx = 0; } else { nx = H.x; nz = H.z; H.vx = H.vz = 0; } }
  const r = hypot(nx, nz); if (r > 5000) { nx *= 5000 / r; nz *= 5000 / r; }
  H.x = nx; H.z = nz;
  const f = heroFloor(H.x, H.z, H.y);
  H.y += H.vy * dt;
  if (H.y <= f) { if (!H.ground && H.vy < -14) evSound('L'); H.y = f; H.vy = 0; H.ground = 1; }
  else if (H.y > f + 0.25 || H.vy > 0) H.ground = 0;
  else { H.y = f; H.vy = 0; }
  // walking clock (two steps a cycle, about 0.75 m a step), the sword
  H.sp = min(sp / 7.5, 1); H.ph += sp * dt * (TAU / 1.5) / (1 + 0.3 * pw);
  if (H.swingQ) { H.swingQ = 0; if (H.swing < 0 && !still) { H.swing = 0; evSound('S'); } }
  if (H.swing >= 0) { const was = H.swing; H.swing += dt / SWING_T; if (pw > 0.5 && was < 0.45 && H.swing >= 0.45) { H.wave = 0; evSound('W'); } if (H.swing >= 1) H.swing = -1; }
  if (H.wave >= 0) { H.wave += dt; if (H.wave > 0.8) H.wave = -1; }
  // camera behind and above his head; kept out of the ground
  const s = 1 + 0.3 * pw, D = H.camD * s, cp = cos(H.camPitch), hx = H.x, hy = H.y + 1.6 * s, hz = H.z;
  let cx = hx - sin(H.camYaw) * cp * D, cy = hy - sin(H.camPitch) * D + 0.4, cz = hz + cos(H.camYaw) * cp * D;
  surfaceAt(cx, cz, cy); if (cy < COL[0] - CLEAR + 0.4) cy = COL[0] - CLEAR + 0.4;
  const lx = hx - cx, ly = hy + 0.2 - cy, lz = hz - cz;
  return [cx, cy, cz, atan2(lx, -lz), atan2(ly, hypot(lx, lz))];
}
// uniforms: hero (x, y, z, yaw), hero2 (walk clock, speed 0-1, swing 0-1 or -1, shown), hero3 (power 0-1, seconds into
// the transformation or -1, in the air, seconds into the wave or -1)
function heroU(t) {
  const H = HERO, tr = t - H.pT;
  HU[0] = H.x; HU[1] = H.y; HU[2] = H.z; HU[3] = H.yaw;
  HU[4] = H.ph; HU[5] = H.sp; HU[6] = H.swing; HU[7] = H.on;
  HU[8] = heroPower(t); HU[9] = tr >= 0 && tr < TRANSFORM_T + 0.5 ? tr : -1; HU[10] = H.ground ? 0 : 1; HU[11] = H.wave;
  return HU;
}
// the shout: big gold letters for a moment, and read aloud (Italian voice) unless the sound is off
let sayT = 0;
function heroSay(s) {
  const e = $('y'); if (e) { e.textContent = s; e.className = 'on'; clearTimeout(sayT); sayT = setTimeout(() => { e.className = ''; }, 2600); }
  try { if (!AUTO && !(localStorage.atlantisMute === '1') && window.speechSynthesis) { const u = new SpeechSynthesisUtterance(s); u.lang = 'it-IT'; u.rate = 1.05; u.pitch = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); } } catch {}
}
