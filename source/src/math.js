// maths, random numbers, noise and the mesh builder
const { sin, cos, tan, atan2, sqrt, abs, min, max, floor, ceil, round, PI, hypot, exp, pow, asin } = Math;
const TAU = PI * 2, DEG = PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// seeded RNG (mulberry32): fixed seeds, so every run builds the same city
const RNG = (s) => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const h2 = (x, y) => { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
const vnoise = (x, y) => {
  const xi = floor(x), yi = floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return mix(mix(h2(xi, yi), h2(xi + 1, yi), a), mix(h2(xi, yi + 1), h2(xi + 1, yi + 1), a), b);
};
const fbm = (x, y, o) => { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); const t = x * 1.6 + y * 1.2 + 17.1; y = y * 1.6 - x * 1.2 + 9.7; x = t; a *= 0.5; } return s / (1 - a * 2); };
// ridged noise for mountains: sharp crests, smooth valleys
const ridge = (x, y, o) => { let s = 0, a = 0.5, w = 1; for (let i = 0; i < o; i++) { let n = 1 - abs(2 * vnoise(x, y) - 1); n *= n * w; w = clamp(n * 2, 0, 1); s += a * n; const t = x * 1.6 + y * 1.2 + 31.7; y = y * 1.6 - x * 1.2 + 5.3; x = t; a *= 0.5; } return s; };

// quaternions (x, y, z, w); load time only
const qAxis = (x, y, z, a) => { const s = sin(a / 2) / hypot(x, y, z); return [x * s, y * s, z * s, cos(a / 2)]; };
const qYaw = (a) => [0, sin(a / 2), 0, cos(a / 2)];
const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
// quaternion turning the unit axes into the orthonormal right-handed basis x, y, z
const qBasis = (x, y, z) => {
  const t = x[0] + y[1] + z[2];
  if (t > 0) { const s = sqrt(t + 1) * 2; return [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]; }
  if (x[0] > y[1] && x[0] > z[2]) { const s = sqrt(1 + x[0] - y[1] - z[2]) * 2; return [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  if (y[1] > z[2]) { const s = sqrt(1 + y[1] - x[0] - z[2]) * 2; return [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  const s = sqrt(1 + z[2] - x[0] - y[1]) * 2; return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s];
};
const vnorm = (v) => { const l = hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// mesh builder
// vertex, 20 bytes: position (3 floats), normal + baked occlusion (4 snorm8), material id + 3 params (4 unorm8).
// build() winds triangles to match their vertex normals.
class MB {
  constructor(cap = 4096) {
    this.vb = new ArrayBuffer(cap * 20); this.f = new Float32Array(this.vb); this.b = new Uint8Array(this.vb); this.sb = new Int8Array(this.vb);
    this.ib = new Uint32Array(cap * 3); this.nv = 0; this.ni = 0;
    this.mat = 0; this.ao = 1; this.ea = 0; this.eb = 0; this.ec = 0; // material, occlusion, parameters
    this.fr = null; // optional frame [ox, oy, oz, yaw-cos, yaw-sin, scale] applied to everything added
  }
  v(x, y, z, nx, ny, nz, ao = this.ao) {
    if (this.nv * 20 >= this.vb.byteLength) { const n = new ArrayBuffer(this.vb.byteLength * 2); new Uint8Array(n).set(this.b); this.vb = n; this.f = new Float32Array(n); this.b = new Uint8Array(n); this.sb = new Int8Array(n); }
    const fr = this.fr;
    if (fr) { const c = fr[3], s = fr[4], k = fr[5], X = x * k, Z = z * k; x = fr[0] + X * c + Z * s; y = fr[1] + y * k; z = fr[2] - X * s + Z * c; const NX = nx; nx = NX * c + nz * s; nz = -NX * s + nz * c; }
    const i = this.nv++, o = i * 5, q = i * 20, l = 127 / (hypot(nx, ny, nz) || 1);
    this.f[o] = x; this.f[o + 1] = y; this.f[o + 2] = z;
    this.sb[q + 12] = round(nx * l); this.sb[q + 13] = round(ny * l); this.sb[q + 14] = round(nz * l); this.sb[q + 15] = round(clamp(ao, 0, 1) * 127);
    this.b[q + 16] = this.mat; this.b[q + 17] = this.ea; this.b[q + 18] = this.eb; this.b[q + 19] = this.ec;
    return i;
  }
  tri(a, b, c) {
    if (this.ni + 3 > this.ib.length) { const n = new Uint32Array(this.ib.length * 2); n.set(this.ib); this.ib = n; }
    this.ib[this.ni++] = a; this.ib[this.ni++] = b; this.ib[this.ni++] = c;
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  // flat polygon fan (convex or star-shaped around its first point) with normal n
  poly(pts, n, ao) { const i0 = this.nv; for (const p of pts) this.v(p[0], p[1], p[2], n[0], n[1], n[2], ao); for (let i = 1; i < pts.length - 1; i++) this.tri(i0, i0 + i, i0 + i + 1); }
  // surface of revolution around y at (cx, cz). prof = [[r, y, mat?], ...] runs up the outside; corners sharper than
  // `crease` stay sharp. o: seg, a0, a1 (angles, or functions of r), flat (facets), ao(r, y), cx, cy, cz, crease (degrees)
  lathe(prof, o = {}) {
    const seg = o.seg || 24, cx = o.cx || 0, cy = o.cy || 0, cz = o.cz || 0, cr = cos((o.crease || 50) * DEG), n = prof.length;
    const A0 = typeof o.a0 === 'function' ? o.a0 : () => o.a0 || 0, A1 = typeof o.a1 === 'function' ? o.a1 : () => (o.a1 === undefined ? TAU : o.a1);
    const sn = []; // segment normals in the (r, y) plane
    for (let i = 0; i < n - 1; i++) { const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1], l = hypot(dr, dy) || 1; sn.push([dy / l, -dr / l]); }
    const m0 = this.mat;
    for (let i = 0; i < n - 1; i++) {
      if (prof[i][0] === prof[i + 1][0] && prof[i][1] === prof[i + 1][1]) continue;
      if (prof[i][2] !== undefined) this.mat = prof[i][2];
      const en = (j, k) => { const a = sn[i], b = sn[k]; if (k < 0 || k >= n - 1 || a[0] * b[0] + a[1] * b[1] < cr) return a; const x = a[0] + b[0], y = a[1] + b[1], l = hypot(x, y) || 1; return [x / l, y / l]; };
      // o.up: segments of that material are steps drawn as ramps, shaded as level treads and marked for the shader
      const up = o.up === this.mat, n0 = up ? [0, 1] : en(i, i - 1), n1 = up ? [0, 1] : en(i + 1, i + 1), p0 = prof[i], p1 = prof[i + 1], eb0 = this.eb;
      if (up) this.eb = 255;
      const ring = (p, nn, s, flatA) => {
        const a0 = A0(p[0]), a1 = A1(p[0]), a = a0 + (a1 - a0) * s / seg, c = cos(a), sa = sin(a), fa = flatA === undefined ? a : flatA, fc = cos(fa), fs = sin(fa);
        return this.v(cx + p[0] * c, cy + p[1], cz + p[0] * sa, nn[0] * fc, nn[1], nn[0] * fs, o.ao ? o.ao(p[0], p[1]) : this.ao);
      };
      if (o.flat) {
        for (let s = 0; s < seg; s++) {
          const am = A0(p0[0]) + (A1(p0[0]) - A0(p0[0])) * (s + 0.5) / seg, k = cos(PI / seg), f0 = [sn[i][0], sn[i][1] * k], l = hypot(f0[0], f0[1]), fn = [f0[0] / l, f0[1] / l];
          this.quad(ring(p0, fn, s, am), ring(p0, fn, s + 1, am), ring(p1, fn, s + 1, am), ring(p1, fn, s, am));
        }
      } else {
        let a = ring(p0, n0, 0), b = ring(p1, n1, 0);
        for (let s = 1; s <= seg; s++) { const c = ring(p0, n0, s), d = ring(p1, n1, s); this.quad(a, c, d, b); a = c; b = d; }
      }
      this.eb = eb0;
    }
    this.mat = m0;
  }
  // box with chamfered edges (bv) that shade round; bot=false leaves out the bottom
  box(x0, y0, z0, x1, y1, z1, bv = 0, bot = true) {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], id = [];
    bv = min(bv, h[0] * 0.49, h[1] * 0.49, h[2] * 0.49);
    // 24 vertices: each face's four corners pulled in by the chamfer
    for (let a = 0; a < 3; a++) for (let s = -1; s <= 1; s += 2) for (let u = -1; u <= 1; u += 2) for (let w = -1; w <= 1; w += 2) {
      const p = [0, 0, 0], n = [0, 0, 0], b = (a + 1) % 3, d = (a + 2) % 3;
      p[a] = c[a] + s * h[a]; p[b] = c[b] + u * (h[b] - bv); p[d] = c[d] + w * (h[d] - bv); n[a] = s;
      id.push(this.v(p[0], p[1], p[2], n[0], n[1], n[2]));
    }
    const F = (a, s, u, w) => id[a * 8 + (s > 0 ? 4 : 0) + (u > 0 ? 2 : 0) + (w > 0 ? 1 : 0)];
    for (let a = 0; a < 3; a++) for (let s = -1; s <= 1; s += 2) { if (a === 1 && s < 0 && !bot) continue; this.quad(F(a, s, -1, -1), F(a, s, 1, -1), F(a, s, 1, 1), F(a, s, -1, 1)); }
    if (bv > 0) {
      // edges between faces (a, s) and (b, t)
      for (let a = 0; a < 3; a++) { const b = (a + 1) % 3; for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
        this.quad(F(a, s, t, -1), F(a, s, t, 1), F(b, t, 1, s), F(b, t, -1, s));
      } }
      for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) for (let r = -1; r <= 1; r += 2) this.tri(F(0, s, t, r), F(1, t, r, s), F(2, r, s, t));
    }
  }
  // tube along [[x,y,z,radius], ...] (trunks, branches, rails), capped with a cone
  tube(pts, sides, capEnd = true) {
    let up = [0.13, 0.97, 0.2], prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[max(i - 1, 0)], b = pts[min(i + 1, pts.length - 1)], t = vnorm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const x = vnorm(vcross(up, t)), y = vcross(t, x), ring = this.nv; up = y;
      for (let s = 0; s <= sides; s++) { const an = s / sides * TAU, c = cos(an), sn = sin(an), nx = x[0] * c + y[0] * sn, ny = x[1] * c + y[1] * sn, nz = x[2] * c + y[2] * sn; this.ec = round(s / sides * 255); this.v(p[0] + nx * p[3], p[1] + ny * p[3], p[2] + nz * p[3], nx, ny, nz); }
      if (prev !== null) for (let s = 0; s < sides; s++) this.quad(prev + s, prev + s + 1, ring + s + 1, ring + s);
      prev = ring;
    }
    if (capEnd) { const p = pts[pts.length - 1], a = pts[pts.length - 2], t = vnorm([p[0] - a[0], p[1] - a[1], p[2] - a[2]]), tip = this.v(p[0] + t[0] * p[3], p[1] + t[1] * p[3], p[2] + t[2] * p[3], t[0], t[1], t[2]); for (let s = 0; s < sides; s++) this.tri(prev + s, prev + s + 1, tip); }
    this.ec = 0;
  }
  // leaf card at c spanned by half-axes r and u; n is the canopy's shading normal
  card(c, r, u, n, ao) {
    const m = this.eb, w = this.ec;
    const P = (sx, sy, a, b) => { this.ea = a; this.eb = b; return this.v(c[0] + r[0] * sx + u[0] * sy, c[1] + r[1] * sx + u[1] * sy, c[2] + r[2] * sx + u[2] * sy, n[0], n[1], n[2], ao); };
    this.ec = w; const a = P(-1, -1, 0, 255), b = P(1, -1, 255, 255), d = P(1, 1, 255, 0), e = P(-1, 1, 0, 0);
    this.ea = 0; this.eb = m; this.quad(a, b, d, e);
  }
  // append mesh m placed by [x, y, z, yaw, scale]
  add(m, x = 0, y = 0, z = 0, yaw = 0, k = 1) {
    const c = cos(yaw), s = sin(yaw), i0 = this.nv, f = new Float32Array(m.vb), sb = new Int8Array(m.vb), b = new Uint8Array(m.vb), sm = this.mat, sa = this.ea, sB = this.eb, sc = this.ec, fr = this.fr; this.fr = null;
    for (let i = 0; i < m.nv; i++) {
      const o = i * 5, q = i * 20, X = f[o] * k, Z = f[o + 2] * k, nx = sb[q + 12], nz = sb[q + 14];
      this.mat = b[q + 16]; this.ea = b[q + 17]; this.eb = b[q + 18]; this.ec = b[q + 19];
      this.v(x + X * c + Z * s, y + f[o + 1] * k, z - X * s + Z * c, nx * c + nz * s, sb[q + 13], -nx * s + nz * c, sb[q + 15] / 127);
    }
    for (let i = 0; i < m.ib.length; i += 3) this.tri(i0 + m.ib[i], i0 + m.ib[i + 1], i0 + m.ib[i + 2]);
    this.mat = sm; this.ea = sa; this.eb = sB; this.ec = sc; this.fr = fr;
  }
  // finished mesh { vb, ib, nv, rad }: triangles facing against their normals are flipped; rad = bounding radius
  build() {
    const f = this.f, sb = this.sb, ib = this.ib.slice(0, this.ni); let rad = 0;
    for (let i = 0; i < this.ni; i += 3) {
      const a = ib[i] * 5, b = ib[i + 1] * 5, c = ib[i + 2] * 5;
      const ux = f[b] - f[a], uy = f[b + 1] - f[a + 1], uz = f[b + 2] - f[a + 2], vx = f[c] - f[a], vy = f[c + 1] - f[a + 1], vz = f[c + 2] - f[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, A = a * 4 + 12, B = b * 4 + 12, C = c * 4 + 12;
      if (nx * (sb[A] + sb[B] + sb[C]) + ny * (sb[A + 1] + sb[B + 1] + sb[C + 1]) + nz * (sb[A + 2] + sb[B + 2] + sb[C + 2]) < 0) { const t = ib[i + 1]; ib[i + 1] = ib[i + 2]; ib[i + 2] = t; }
    }
    for (let i = 0; i < this.nv * 5; i += 5) rad = max(rad, f[i] * f[i] + f[i + 1] * f[i + 1] + f[i + 2] * f[i + 2]);
    return { vb: this.vb.slice(0, this.nv * 20), ib, nv: this.nv, rad: sqrt(rad) };
  }
}
