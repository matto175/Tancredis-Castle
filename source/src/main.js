// renderer, camera and input
const $ = (id) => document.getElementById(id);
const canvas = $('c'), info = $('i'), body = document.body;
let dead = false; // the graphics device was lost
const say = (m, to) => { if (!dead) $('s').textContent = m; $('b').style.transform = `scaleX(${to})`; return new Promise((r) => setTimeout(r, AUTO ? 0 : 40)); };
// the adapter was chosen in quality.js
if (!adapter.features.has('indirect-first-instance')) fail('This graphics adapter lacks a WebGPU feature the scene needs (indirect-first-instance).');
const hasTS = adapter.features.has('timestamp-query');
const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query', 'indirect-first-instance'] : ['indirect-first-instance'] });
window.__info = `${adapter.info.vendor} · ${adapter.info.architecture} · ${adapter.info.description}${adapter.info.isFallbackAdapter ? ' · FALLBACK (software)' : ''} · ${LVN[LV]}`;
device.addEventListener('uncapturederror', (e) => console.error('GPU: ' + e.error.message.slice(0, 900)));
// device lost (out of memory, driver reset): restart a level lower; on Low, say so. atlantisLost tells the next load
// why it may get no adapter (cleared once a load survives)
device.lost.then((l) => {
  if (l.reason === 'destroyed') return; // the page is closing
  console.error(`device lost while "${$('s').textContent}": ${l.message}`); keep('atlantisLost', 1);
  if (LV < 2 && !AUTO && !QP.has('lv')) { keep('atlantis', LV + 1); location.reload(); }
  dead = true; body.className = 'l e'; $('s').textContent = 'The graphics device was lost. Reload the page to try again, or restart the browser if that fails.';
});
const ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth32float';
const TU = GPUTextureUsage, BU = GPUBufferUsage, SS = GPUShaderStage, VF = SS.VERTEX | SS.FRAGMENT;
const RT = TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING;

// shader module; compile errors are logged with their line
const mod = (code, name) => {
  const m = device.createShaderModule({ code });
  m.getCompilationInfo().then((i) => { for (const e of i.messages) if (e.type === 'error') console.error(`WGSL ${name}:${e.lineNum}: ${e.message}\n  ${code.split('\n')[e.lineNum - 1]?.slice(max(0, e.linePos - 80), e.linePos + 80)}`); });
  return m;
};
const buf = (data, usage) => { const b = device.createBuffer({ size: max(16, (data.byteLength + 3) & ~3), usage: usage | BU.COPY_DST }); Q.writeBuffer(b, 0, data.buffer || data, data.byteOffset || 0, data.byteLength); return b; };
const tex = (w, h, format, usage, o = {}) => device.createTexture({ size: [w, h, o.layers || 1], format, usage, mipLevelCount: o.mips || 1 });
// bind group layout from binding kinds: u uniform, r/w storage, s sampler, c comparison sampler, t texture, d depth, k cube
const layout = (spec, visibility = VF) => device.createBindGroupLayout({ entries: [...spec].map((t, binding) => ({ binding, visibility,
  ...(t === 'u' ? { buffer: {} } : t === 'r' ? { buffer: { type: 'read-only-storage' } } : t === 'w' ? { buffer: { type: 'storage' } } : t === 's' ? { sampler: {} } : t === 'c' ? { sampler: { type: 'comparison' } }
    : t === 'd' ? { texture: { sampleType: 'depth' } } : t === 'k' ? { texture: { viewDimension: 'cube' } } : { texture: {} }) })) });
const group = (lay, res) => device.createBindGroup({ layout: lay, entries: res.map((r, binding) => ({ binding, resource: r instanceof GPUBuffer ? { buffer: r } : r instanceof GPUTexture ? r.createView() : r })) });
const plOf = (...l) => device.createPipelineLayout({ bindGroupLayouts: l });
const colorAtt = (view, clear) => ({ view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] });
const fsPipe = (m, lay, format, entry = 'fs', blend) => device.createRenderPipeline({ layout: plOf(lay), vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: entry, targets: [{ format, blend }] } });

// samplers, detail textures
const sRep = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: QL(8, 4, 1) });
const sLin = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: QL(4, 2, 1) }); // anisotropic for the leaf atlas
const sCmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
const lBlit = layout('ts', SS.FRAGMENT), mBlit = mod(W_BLIT, 'blit');
const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const blitPipe = (entry, format, blend) => fsPipe(mBlit, lBlit, format, entry, blend);
const pMip = { rgba8unorm: blitPipe('fsMip', 'rgba8unorm'), [HDR]: blitPipe('fsMip', HDR), r16float: blitPipe('fsMip', 'r16float') };
const pDown0 = blitPipe('fsDown0', HDR), pDown = blitPipe('fsDown', HDR), pUp = blitPipe('fsUp', HDR, ADD);
const blitBG = (view) => group(lBlit, [view, sLin]);
const mipView = (t, m) => t.createView({ baseMipLevel: m, mipLevelCount: 1 });
const genMips = (e, t) => { for (let i = 1; i < t.mipLevelCount; i++) { const r = e.beginRenderPass({ colorAttachments: [colorAtt(mipView(t, i), true)] }); r.setPipeline(pMip[t.format]); r.setBindGroup(0, blitBG(mipView(t, i - 1))); r.draw(3); r.end(); } };
// load checkpoint: wait for the GPU so work never piles up on a slow chip (?log prints timings)
const T0 = performance.now(), ck = async (m) => { await Q.onSubmittedWorkDone(); if (QP.has('log')) console.log(`${((performance.now() - T0) / 1000).toFixed(2)} s  ${m}`); };
await say('Mescolo il marmo…', 0.05);
const mipsOf = (n) => 32 - Math.clz32(n); // full mip chain length for size n
const tNoiseA = tex(NOISEPX, NOISEPX, 'rgba8unorm', RT, { mips: mipsOf(NOISEPX) }), tNoiseN = tex(NOISEPX, NOISEPX, 'rgba8unorm', RT, { mips: mipsOf(NOISEPX) }), tLeaf = tex(LEAFPX * 4, LEAFPX * 3, 'rgba8unorm', RT, { mips: mipsOf(LEAFPX) - 1 }); // leaf atlas: 4 x 3 tiles
{
  const m = mod(W_NOISE, 'noise');
  for (const [t, entry] of [[tNoiseA, 'fsA'], [tNoiseN, 'fsN'], [tLeaf, 'fsLeaf']]) {
    const p = device.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: entry, targets: [{ format: 'rgba8unorm' }] } });
    const e = device.createCommandEncoder(), r = e.beginRenderPass({ colorAttachments: [colorAtt(mipView(t, 0), true)] }); r.setPipeline(p); r.draw(3); r.end(); genMips(e, t);
    Q.submit([e.finish()]); await ck(entry);
  }
}
// animated water texture
const tWater = tex(WAVEPX, WAVEPX, HDR, RT, { mips: 6 });
const WT = new Float32Array(4), uboW = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST });
const lWaves = layout('u', SS.FRAGMENT), pWaves = fsPipe(mod(W_WAVES, 'waves'), lWaves, HDR), bgWaves = group(lWaves, [uboW]);
const waterBG = [0, 1, 2, 3, 4].map((m) => blitBG(mipView(tWater, m)));

// views
// main, mirror and shadow views each have a uniform block (struct View in sh_base.js)
const NU = 216, V_MAIN = 0, V_MIR = 1, V_SH = 2;
const UB = [0, 1, 2].map(() => new Float32Array(NU)), ubo = UB.map(() => device.createBuffer({ size: NU * 4, usage: BU.UNIFORM | BU.COPY_DST }));
const O_SM = 48, O_CAM = 112, O_RES = 116, O_JIT = 120, O_SUN = 124, O_SUNC = 128, O_RIGHT = 132, O_UP = 136, O_FWD = 140, O_PL = 144, O_PULSE = 168, O_MISC = 172, O_LODC = 176, O_LODB = 180, O_EV = 184;
const TANH = tan(30 * DEG), NEAR = 0.3, EXPO = EXPO_ORA;
// sun at the ground: atmospheric transmittance x 1.35 (keeps sunlit paving warm rather than grey)
const AT = atmo(), SUNC = AT.Ts.map((t, i) => t * E0 * 1.35 * SUNK * (NIGHT ? [0.7, 0.85, 1.25][i] : 1));
if (AUTO) console.log('sun at ground ' + SUNC.map((v) => v.toFixed(2)) + ' · psi ' + AT.PSI.map((v) => v.toFixed(4)));
for (const U of UB) { U.set(SUN, O_SUN); U.set(SUNC, O_SUNC); U[O_SUNC + 3] = EXPO; U[O_MISC + 2] = 1; U[O_LODC + 3] = 1; U.set([0, -1, -1, 0], O_EV); }
// camera matrices and frustum planes for a view at (cx, cy, cz), yaw / pitch
function setCam(U, cx, cy, cz, yaw, pitch, W, H, jx, jy) {
  const cp = cos(pitch), fy = sin(pitch), rx = cos(yaw), rz = sin(yaw), fx = cp * rz, fz = -cp * rx;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy, asp = W / H, tx = TANH * asp, sx = 1 / tx, sy = 1 / TANH;
  const tw = -(fx * cx + fy * cy + fz * cz), ox = -(rx * cx + rz * cz) * sx, oy = -(ux * cx + uy * cy + uz * cz) * sy;
  // reversed depth, far plane at infinity; (jx, jy): sub-pixel jitter
  U[0] = rx * sx + jx * fx; U[4] = jx * fy; U[8] = rz * sx + jx * fz; U[12] = ox + jx * tw;
  U[1] = ux * sy + jy * fx; U[5] = uy * sy + jy * fy; U[9] = uz * sy + jy * fz; U[13] = oy + jy * tw;
  U[2] = 0; U[6] = 0; U[10] = 0; U[14] = NEAR;
  U[3] = fx; U[7] = fy; U[11] = fz; U[15] = tw;
  U[O_CAM] = cx; U[O_CAM + 1] = cy; U[O_CAM + 2] = cz;
  U[O_RES] = W; U[O_RES + 1] = H; U[O_RES + 2] = 1 / W; U[O_RES + 3] = 1 / H; U[O_JIT] = jx; U[O_JIT + 1] = jy;
  U[O_RIGHT] = rx; U[O_RIGHT + 1] = 0; U[O_RIGHT + 2] = rz; U[O_RIGHT + 3] = tx;
  U[O_UP] = ux; U[O_UP + 1] = uy; U[O_UP + 2] = uz; U[O_UP + 3] = TANH;
  U[O_FWD] = fx; U[O_FWD + 1] = fy; U[O_FWD + 2] = fz; U[O_FWD + 3] = NEAR;
  const lx = 1 / sqrt(tx * tx + 1), ly = 1 / sqrt(TANH * TANH + 1);
  plane(U, 0, (fx * tx + rx) * lx, fy * tx * lx, (fz * tx + rz) * lx, cx, cy, cz, 0); plane(U, 1, (fx * tx - rx) * lx, fy * tx * lx, (fz * tx - rz) * lx, cx, cy, cz, 0);
  plane(U, 2, (fx * TANH + ux) * ly, (fy * TANH + uy) * ly, (fz * TANH + uz) * ly, cx, cy, cz, 0); plane(U, 3, (fx * TANH - ux) * ly, (fy * TANH - uy) * ly, (fz * TANH - uz) * ly, cx, cy, cz, 0);
  plane(U, 4, fx, fy, fz, cx, cy, cz, 0); plane(U, 5, 0, 0, 0, 0, 0, 0, 1e9);
}
function plane(U, k, nx, ny, nz, px, py, pz, w) { const o = O_PL + k * 4; U[o] = nx; U[o + 1] = ny; U[o + 2] = nz; U[o + 3] = w - (nx * px + ny * py + nz * pz); }
// sun shadow matrix: a box of half width R around (cx, cy, cz), written at float offset `at` of every view; with
// `cull` also the shadow view's own matrix and planes
const LR = vnorm([SUN[2], 0, -SUN[0]]), LU = vcross(SUN, LR);
function shadowMat(at, cx, cy, cz, R, d0, d1, size, cull) {
  // snap to whole texels so the map doesn't crawl
  const tx = 2 * R / size, px = round((LR[0] * cx + LR[1] * cy + LR[2] * cz) / tx) * tx, py = round((LU[0] * cx + LU[1] * cy + LU[2] * cz) / tx) * tx, pz = SUN[0] * cx + SUN[1] * cy + SUN[2] * cz, D = d1 - d0, m = UB[V_SH];
  for (let i = 0; i < 3; i++) { m[at + i * 4] = LR[i] / R; m[at + i * 4 + 1] = LU[i] / R; m[at + i * 4 + 2] = -SUN[i] / D; m[at + i * 4 + 3] = 0; }
  m[at + 12] = -px / R; m[at + 13] = -py / R; m[at + 14] = (d1 + pz) / D; m[at + 15] = 1;
  for (let i = 0; i < 16; i++) { UB[V_MAIN][at + i] = m[at + i]; UB[V_MIR][at + i] = m[at + i]; }
  if (cull) {
    for (let i = 0; i < 16; i++) m[i] = m[at + i];
    plane(m, 0, LR[0], LR[1], LR[2], 0, 0, 0, R - px); plane(m, 1, -LR[0], -LR[1], -LR[2], 0, 0, 0, R + px);
    plane(m, 2, LU[0], LU[1], LU[2], 0, 0, 0, R - py); plane(m, 3, -LU[0], -LU[1], -LU[2], 0, 0, 0, R + py);
    plane(m, 4, 0, 0, 0, 0, 0, 0, 1e9); plane(m, 5, 0, 0, 0, 0, 0, 0, 1e9);
  }
}

// sky table and environment light (baked once)
await say('Accendo il cielo…', 0.1);
const tSky = tex(256, 128, HDR, RT), tEnvRaw = tex(256, 256, HDR, RT, { layers: 6, mips: 9 }), tEnv = tex(256, 256, HDR, RT, { layers: 6, mips: 6 }), tIrr = tex(16, 16, HDR, RT, { layers: 6 });
const cubeView = (t, o = {}) => t.createView({ dimension: 'cube', ...o });
{
  const ms = mod(W_SKYLUT(AT), 'skylut');
  let e = device.createCommandEncoder();
  const flush = async (m) => { Q.submit([e.finish()]); await ck(m); e = device.createCommandEncoder(); };
  let r = e.beginRenderPass({ colorAttachments: [colorAtt(tSky.createView(), true)] });
  r.setPipeline(device.createRenderPipeline({ layout: 'auto', vertex: { module: ms, entryPoint: 'vs' }, fragment: { module: ms, entryPoint: 'fs', targets: [{ format: HDR }] } })); r.draw(3); r.end();
  Q.writeBuffer(ubo[V_MAIN], 0, UB[V_MAIN]); await flush('sky table');
  const lEnv = layout('ussttk', VF), me = mod(W_ENV, 'env');
  const pEnv = device.createRenderPipeline({ layout: plOf(lEnv), vertex: { module: me, entryPoint: 'vs' }, fragment: { module: me, entryPoint: 'fs', targets: [{ format: HDR }] } });
  const face = (t, f, m) => t.createView({ dimension: '2d', baseArrayLayer: f, arrayLayerCount: 1, baseMipLevel: m, mipLevelCount: 1 });
  const pass = (dst, f, m, mode, src) => { r = e.beginRenderPass({ colorAttachments: [colorAtt(face(dst, f, m), true)] }); r.setPipeline(pEnv); r.setBindGroup(0, group(lEnv, [ubo[V_MAIN], sRep, sLin, tSky, tNoiseA, src])); r.draw(3, 1, 0, f + 6 * mode); r.end(); };
  // raw sky into mip 0 (the bound source is a stand-in mode 0 never samples), then its mips
  for (let f = 0; f < 6; f++) pass(tEnvRaw, f, 0, 0, cubeView(tIrr));
  for (let m = 1; m < 9; m++) for (let f = 0; f < 6; f++) pass(tEnvRaw, f, m, 1, cubeView(tEnvRaw, { baseMipLevel: m - 1, mipLevelCount: 1 }));
  await flush('sky cube');
  for (let m = 0; m < 6; m++) { for (let f = 0; f < 6; f++) pass(tEnv, f, m, 2 + m, cubeView(tEnvRaw)); await flush('sky cube, roughness ' + m); }
  for (let f = 0; f < 6; f++) pass(tIrr, f, 0, 9, cubeView(tEnvRaw));
  Q.submit([e.finish()]); await ck('sky irradiance');
}

// the world: meshes, instances, levels of detail
await say('Costruisco la città…', 0.2);
keep('atlantisLoad', 1);
addEventListener('pagehide', () => keep('atlantisLoad', ''));
const Wd = buildWorld();
landY = Wd.ground; setHard(Wd.hard); // collision ground: the terrain as this level draws it near the camera; and the buildings
await say('Pianto i giardini…', 0.7);
let nV = 0, nIx = 0;
for (const m of Wd.meshes) { m.v0 = nV; m.i0 = nIx; m.ni = m.ib.length; nV += m.nv; nIx += m.ni; }
// upload each mesh separately and drop it, so geometry never sits in memory twice (phones)
const vbMesh = device.createBuffer({ size: max(16, nV * 20), usage: BU.VERTEX | BU.COPY_DST }), ibMesh = device.createBuffer({ size: max(16, nIx * 4), usage: BU.INDEX | BU.COPY_DST });
for (const m of Wd.meshes) { if (m.nv) Q.writeBuffer(vbMesh, m.v0 * 20, m.vb); if (m.ni) Q.writeBuffer(ibMesh, m.i0 * 4, m.ib); m.vb = m.ib = null; }
const bInst = buf(new Uint8Array(Wd.inst), BU.STORAGE);
await ck('geometry');
// ?types lists every mesh type: kind, instances, triangles per LOD, distances
if (AUTO && QP.has('types')) console.log(Wd.types.map((t, i) => ((i > 2 && i < 99) || (t.n < 6 && Wd.meshes[t.lods[0]].ni < 9000) || (QP.get('types') === 'big' && i < 135) ? '' : `${i}:k${t.kind} n${t.n} [${t.lods.map((l) => Wd.meshes[l].ni / 3).join('/')}] d${t.d.map((v) => (v > 1e8 ? '-' : v)).join(',')}  `)).join(''));
if (AUTO) console.log(`${Wd.meshes.length} meshes · ${(nV / 1e6).toFixed(2)} M vertices · ${(nIx / 3e6).toFixed(2)} M triangles · ${Wd.nI} instances · ${((nV * 20 + nIx * 4 + Wd.nI * 48) / 1048576).toFixed(0)} MB`);
// one slot per (mesh type, LOD): a range of the visible list and one indirect draw
const slots = [], NONE = 0xffffffff;
const tyData = new ArrayBuffer(Wd.types.length * 48), tyU = new Uint32Array(tyData), tyF = new Float32Array(tyData); // struct MType in sh_scene.js
let nVis = 0;
Wd.types.forEach((t, i) => {
  for (let l = 0; l < 4; l++) { if (l < t.lods.length) { tyU[i * 12 + l] = slots.length; slots.push({ mesh: Wd.meshes[t.lods[l]], kind: t.kind, flags: t.flags, first: nVis, n: t.n, lod: l }); nVis += t.n; } else tyU[i * 12 + l] = NONE; }
  tyF.set(t.d, i * 12 + 4); tyF[i * 12 + 8] = t.d23;
});
const argData = new Uint32Array(slots.length * 5);
slots.forEach((s, i) => argData.set([s.mesh.ni, 0, s.mesh.i0, s.mesh.v0, s.first], i * 5));
const bTypes = buf(new Uint8Array(tyData), BU.STORAGE);
const bArgs = [0, 1, 2].map(() => buf(argData, BU.STORAGE | BU.INDIRECT | BU.COPY_SRC)), bVis = [0, 1, 2].map(() => device.createBuffer({ size: max(16, nVis * 4), usage: BU.STORAGE }));
const lCull = layout('urrww', SS.COMPUTE), mCull = mod(W_CULL, 'cull');
const pReset = device.createComputePipeline({ layout: plOf(lCull), compute: { module: mCull, entryPoint: 'reset' } }), pCull = device.createComputePipeline({ layout: plOf(lCull), compute: { module: mCull, entryPoint: 'cull' } });
const bgCull = [0, 1, 2].map((v) => group(lCull, [ubo[v], bInst, bTypes, bArgs[v], bVis[v]]));
const NG_R = ceil(slots.length / 64), NG_C = ceil(Wd.nI / 64);
// slot lists per kind; `skip` leaves out types flagged against a view
const listOf = (kind, skip = 0, need = 0) => new Uint32Array(slots.map((s, i) => (s.kind === kind && !(s.flags & skip) && (s.flags & need) === need ? i : -1)).filter((i) => i >= 0));
// all / mir: main and mirror views without the ground; gnd / gndMir: the ground, drawn last so covered pixels
// are never shaded; near / cast: camera cascade and baked maps
const LS = [K.SOLID, K.LEAF, K.CRYSTAL, K.GLASS, K.WATER, K.CASCADE].map((k) => ({ all: listOf(k, DRAW_LAST), mir: listOf(k, NO_MIRROR | DRAW_LAST), gnd: listOf(k, 0, DRAW_LAST), gndMir: listOf(k, NO_MIRROR, DRAW_LAST), near: listOf(k, NO_NEAR | NO_SHADOW), cast: listOf(k, NO_SHADOW | NO_BAKE) }));
// main-view crystal in two steps: solid bodies, then the thin petals and panels
const lsSolidX = listOf(K.CRYSTAL, THIN), lsThinX = listOf(K.CRYSTAL, 0, THIN);
const tMap = tex(MAPPX, MAPPX, 'rgba8unorm', RT | TU.COPY_DST, { mips: 5 });
const tLand = tex(MAPPX, MAPPX, 'rgba8unorm', RT | TU.COPY_DST, { mips: 5 });
// ground maps are painted at 1 m/texel; Low uploads them at half size (mean of four)
const mapOf = (a) => {
  if (MAPPX === 2048) return a;
  const o = new Uint8Array(MAPPX * MAPPX * 4);
  for (let j = 0; j < 1024; j++) for (let i = 0; i < 1024; i++) for (let c = 0; c < 4; c++) { const s = (j * 4096 + i * 2) * 4 + c; o[(j * 1024 + i) * 4 + c] = (a[s] + a[s + 4] + a[s + 8192] + a[s + 8196] + 2) >> 2; }
  return o;
};
Q.writeTexture({ texture: tMap }, mapOf(Wd.MAP), { bytesPerRow: MAPPX * 4 }, [MAPPX, MAPPX]); Q.writeTexture({ texture: tLand }, mapOf(Wd.LANDMAP), { bytesPerRow: MAPPX * 4 }, [MAPPX, MAPPX]); Wd.MAP = Wd.LANDMAP = null;
{ const e = device.createCommandEncoder(); genMips(e, tMap); genMips(e, tLand); Q.submit([e.finish()]); }
await ck('ground maps');

// scene pipelines
const lScene = layout('ussrrttttt'), lFx = layout('tdttkddddtc', SS.FRAGMENT), plScene = plOf(lScene), plFx = plOf(lScene, lFx);
const bgScene = [0, 1, 2].map((v) => group(lScene, [ubo[v], sRep, sLin, bInst, bVis[v], tNoiseA, tNoiseN, tLeaf, tMap, tLand]));
const A = (shaderLocation, offset, format) => ({ shaderLocation, offset, format });
const vbLay = [{ arrayStride: 20, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'snorm8x4'), A(2, 16, 'unorm8x4')] }];
const mG = mod(LV > 1 ? W_GBUF_LOW : W_GBUF, 'gbuf'), mSh = mod(W_SHADOW, 'shadow'), mFx = mod(W_FX + W_FX2, 'fx');
// `eq`: draws leaf colour where their depth already is; `pre`: lays that depth (fsDepth in sh_scene.js).
// ?onepass: leaves in one step, for comparison
const gPipe = (cull, refl, eq, pre) => device.createRenderPipeline({ layout: plScene, vertex: { module: mG, entryPoint: 'vs', buffers: vbLay },
  fragment: { module: mG, entryPoint: pre ? 'fsDepth' : 'fs', targets: ['rgba8unorm', HDR, 'rgba8unorm'].map((format) => ({ format, writeMask: pre ? 0 : 15 })), constants: { REFL: refl } },
  primitive: { cullMode: cull }, depthStencil: { format: DEPTH, depthWriteEnabled: !eq, depthCompare: eq ? 'equal' : 'greater' } });
const TWO = LV < 2 && !QP.has('onepass');
const leafPipes = (refl) => [gPipe('back', refl), TWO ? gPipe('none', refl, true) : gPipe('none', refl), TWO && gPipe('none', refl, false, true)];
const pG = LV < 2 ? leafPipes(0) : [gPipe('back', 0)], pGm = MIRROR && leafPipes(1);
const drawLeaves = (r, v, P, list) => { if (TWO) { r.setPipeline(P[2]); drawList(r, v, list); } r.setPipeline(P[1]); drawList(r, v, list); };
// Low: leaf depth alone, cut out; then colour where the depth is theirs (W_GBUF_LOW)
const lowLeaf = (entry, write, compare, mask) => device.createRenderPipeline({ layout: plScene, vertex: { module: mG, entryPoint: 'vs', buffers: vbLay },
  fragment: { module: mG, entryPoint: entry, targets: ['rgba8unorm', HDR, 'rgba8unorm'].map((format) => ({ format, writeMask: mask })) },
  primitive: { cullMode: 'none' }, depthStencil: { format: DEPTH, depthWriteEnabled: write, depthCompare: compare } });
const pPre = LV > 1 && lowLeaf('fsPre', true, 'greater', 0), pLeafLow = LV > 1 && lowLeaf('fsLeafLow', false, 'equal', 15);
const shPipe = (format, entry, cull) => device.createRenderPipeline({ layout: plScene, vertex: { module: mSh, entryPoint: 'vs', buffers: vbLay },
  fragment: entry ? { module: mSh, entryPoint: entry, targets: [] } : undefined, primitive: { cullMode: cull },
  depthStencil: { format, depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.2 } });
const shPipes = (f) => [shPipe(f, null, 'back'), shPipe(f, 'fsLeaf', 'none'), shPipe(f, 'fsCrystal', 'none'), shPipe(f, 'fsGlass', 'none')];
const PREMUL = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
const fxPipe = (entry, cull, write, blend) => device.createRenderPipeline({ layout: plFx, vertex: { module: mFx, entryPoint: 'vs', buffers: vbLay },
  fragment: { module: mFx, entryPoint: entry, targets: [{ format: HDR, blend }] }, primitive: { cullMode: cull }, depthStencil: { format: DEPTH, depthWriteEnabled: write, depthCompare: 'greater' } });
const pCrystal = fxPipe('fsCrystal', 'back', true), pWater = fxPipe('fsWater', 'none', true), pGlassB = fxPipe('fsGlass', 'front', false, PREMUL), pGlassF = fxPipe('fsGlass', 'back', false, PREMUL), pCascade = fxPipe('fsCascade', 'none', false, PREMUL);

// shadow maps: three baked, one following the camera
await ck('scene pipelines');
await say('Disegno le ombre…', 0.8);
// sizes: SHN in quality.js; with no cascade one texel stands in
const D16 = 'depth16unorm', DFAR = SH32 ? DEPTH : D16;
const tSh = [tex(SHN[0] || 1, SHN[0] || 1, DEPTH, RT), tex(SHN[1], SHN[1], D16, RT), tex(SHN[2], SHN[2], DFAR, RT), tex(SHN[3], SHN[3], DFAR, RT)];
const pSh32 = CASC ? shPipes(DEPTH) : null, pSh16 = shPipes(D16), pShFar = SH32 ? pSh32 : pSh16, tTop = tex(TOPPX, TOPPX, 'r16float', RT, { mips: 8 });
const depthPass = (t, clear = true) => ({ colorAttachments: [], depthStencilAttachment: { view: t.createView(), depthClearValue: 1, depthLoadOp: clear ? 'clear' : 'load', depthStoreOp: 'store' } });
const drawList = (r, v, list) => { for (let i = 0; i < list.length; i++) r.drawIndexedIndirect(bArgs[v], list[i] * 20); };
const cullView = (c, v) => { c.setBindGroup(0, bgCull[v]); c.setPipeline(pReset); c.dispatchWorkgroups(NG_R); c.setPipeline(pCull); c.dispatchWorkgroups(NG_C); };
// draw every caster into a depth map with the shadow view's matrix. Baked maps (half width R) are drawn as BAKEN x BAKEN
// tiles, each waited for: phone GPUs bin a pass's triangles first and crash on millions. A, B: the map's world axes.
const BAKEN = QL(1, mob ? 4 : 1, 4); // a phone on Medium needs tiles too
const castInto = async (t, pipes, stat, R = 0, A = LR, B = LU) => {
  const n = R ? BAKEN : 1, U = UB[V_SH], sz = t.width / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (n > 1) {
      const a0 = R * (2 * i / n - 1), a1 = a0 + 2 * R / n, b0 = R * (2 * j / n - 1), b1 = b0 + 2 * R / n;
      plane(U, 0, A[0], A[1], A[2], 0, 0, 0, -a0); plane(U, 1, -A[0], -A[1], -A[2], 0, 0, 0, a1); plane(U, 2, B[0], B[1], B[2], 0, 0, 0, -b0); plane(U, 3, -B[0], -B[1], -B[2], 0, 0, 0, b1);
    }
    Q.writeBuffer(ubo[V_SH], 0, U);
    const e = device.createCommandEncoder(), c = e.beginComputePass(); cullView(c, V_SH); c.end();
    const r = e.beginRenderPass(depthPass(t, i + j === 0)); r.setBindGroup(0, bgScene[V_SH]); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    if (n > 1) r.setScissorRect(sz * i, sz * (n - 1 - j), sz, sz);
    r.setPipeline(pipes[0]); drawList(r, V_SH, LS[K.SOLID].cast); r.setPipeline(pipes[1]); drawList(r, V_SH, LS[K.LEAF].cast);
    if (stat) { r.setPipeline(pipes[2]); drawList(r, V_SH, LS[K.CRYSTAL].cast); r.setPipeline(pipes[3]); drawList(r, V_SH, LS[K.GLASS].cast); }
    r.end(); Q.submit([e.finish()]);
    if (n > 1) await ck(`bake ${t.width} tile ${i},${j}`);
  }
};
{
  const U = UB[V_SH]; U[O_MISC + 1] = 2; U[O_MISC + 2] = 0; U[O_MISC + 3] = 0; U[O_LODC] = 0; U[O_LODC + 1] = 0; U[O_LODC + 2] = 0;
  // each map draws only what lies inside its own box seen from the sun (planes set by shadowMat). Medium/Low never cast
  // at the finest LOD (lodb): a 23 cm texel can't tell them apart.
  U[O_LODB] = QL(0, mob ? 250 : 100, 250);
  shadowMat(O_SM + 16, 0, 0, 0, 480, -900, 900, SHN[1], true); await castInto(tSh[1], pSh16, true, 480); await Q.onSubmittedWorkDone();
  shadowMat(O_SM + 32, 0, 0, 0, 1400, -2600, 2600, SHN[2], true); U[O_MISC + 2] = 0.2; await castInto(tSh[2], pShFar, true, 1400); await Q.onSubmittedWorkDone();
  shadowMat(O_SM + 48, 0, 0, 0, 6800, -9000, 9000, SHN[3], true); U[O_MISC + 2] = 1; await castInto(tSh[3], pShFar, true, 6800); await Q.onSubmittedWorkDone();
  // top-down height map for sky visibility: +-512 m, heights -60 .. 200 m
  U.fill(0, 0, 16); U[0] = 1 / 512; U[9] = -1 / 512; U[6] = -1 / 260; U[14] = 200 / 260; U[15] = 1; U[O_MISC + 2] = 0;
  plane(U, 0, 1, 0, 0, 0, 0, 0, 512); plane(U, 1, -1, 0, 0, 0, 0, 0, 512); plane(U, 2, 0, 0, 1, 0, 0, 0, 512); plane(U, 3, 0, 0, -1, 0, 0, 0, 512);
  const tT = tex(TOPPX, TOPPX, CASC ? DEPTH : D16, RT); await castInto(tT, pSh32 || pSh16, true, 512, [1, 0, 0], [0, 0, -1]);
  const lT = layout('d', SS.FRAGMENT), mT = mod(W_FS + /*wgsl*/`@group(0) @binding(0) var t: texture_depth_2d; @fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f { return vec4f(200. - 260. * textureLoad(t, vec2i(fc.xy), 0), 0., 0., 1.); }`, 'top');
  const e = device.createCommandEncoder(), r = e.beginRenderPass({ colorAttachments: [colorAtt(mipView(tTop, 0), true)] }); r.setPipeline(fsPipe(mT, lT, 'r16float')); r.setBindGroup(0, group(lT, [tT])); r.draw(3); r.end(); genMips(e, tTop);
  Q.submit([e.finish()]);
  tT.destroy();
  U[O_MISC + 2] = 1; U[O_MISC + 3] = 1; U[O_LODB] = 0;
}
const passShadow = depthPass(tSh[0]);

// full-screen passes
// passes a level leaves out are never compiled
const lLight = layout('usscttt' + 'dttkk' + 'dddd' + 'tttt', SS.FRAGMENT), lAO = layout('udtt', SS.FRAGMENT), lPolish = layout('ustdttk', SS.FRAGMENT), pPolish = POLISH && fsPipe(mod(W_POLISH, 'polish'), lPolish, HDR, 'fs', ADD), lVol = layout('ucddd', SS.FRAGMENT), pVol = SHAFTS && fsPipe(mod(W_VOL, 'vol'), lVol, 'rg16float'), lTAA = layout('ustt' + 'd', SS.FRAGMENT), lPost = layout('ustt', SS.FRAGMENT);
const pLight = fsPipe(mod(W_LIGHT, 'light'), lLight, HDR), pAO = SSAO && fsPipe(mod(W_AO, 'ao'), lAO, 'rg16float'), pTAA = fsPipe(mod(W_TAA, 'taa'), lTAA, HDR), pPost = fsPipe(mod(W_POST, 'post'), lPost, FMT);
// history stretched into a new resolution
const pFit = device.createRenderPipeline({ layout: plOf(lBlit), vertex: { module: mBlit, entryPoint: 'vsFit' }, fragment: { module: mBlit, entryPoint: 'fsFit', targets: [{ format: HDR }] } });
const tWhite = tex(1, 1, 'rg16float', RT | TU.COPY_DST), tDummyD = tex(1, 1, DEPTH, RT), tDummyC = tex(1, 1, HDR, RT);
Q.writeTexture({ texture: tWhite }, new Uint16Array([0x3c00, 0x3c00]), {}, [1, 1]);

// timing (GPU timestamp queries, one pair per stage)
const PASSES = ['waves', 'cull', 'shadow', 'mirror', 'gbuffer', 'ao', 'light', 'transp', 'taa', 'bloom', 'post'], NP = PASSES.length;
const gpuMs = new Float64Array(NP + 1); // per stage, then the whole frame
let qs = null, qResolve = null; const qRead = [];
if (hasTS) {
  qs = device.createQuerySet({ type: 'timestamp', count: NP * 2 });
  qResolve = device.createBuffer({ size: NP * 16, usage: BU.QUERY_RESOLVE | BU.COPY_SRC });
  for (let i = 0; i < 6; i++) {
    const b = device.createBuffer({ size: NP * 16, usage: BU.MAP_READ | BU.COPY_DST }), o = { b, busy: false, done: null };
    o.done = () => {
      // ns timestamps as pairs of 32-bit words (BigInt would allocate every frame)
      const a = new Uint32Array(b.getMappedRange()), T = (i) => a[i * 2 + 1] * 4294967296 + a[i * 2];
      for (let k = 0; k < NP; k++) gpuMs[k] = (T(k * 2 + 1) - T(k * 2)) / 1e6;
      const t = (T(NP * 2 - 1) - T(0)) / 1e6; if (t > 0 && t < 1e3) { gpuMs[NP] = t; gpuN++; dynG += t; dynGN++; }
      b.unmap(); o.busy = false;
    };
    qRead.push(o);
  }
}
let gpuN = 0, tsOn = false; // read back only while shown (stats overlay, benchmark)
// timestamp writes for the first / last / only pass of stage k
const tsB = (k) => (hasTS ? { querySet: qs, beginningOfPassWriteIndex: k * 2 } : undefined), tsE = (k) => (hasTS ? { querySet: qs, endOfPassWriteIndex: k * 2 + 1 } : undefined);
const tsBE = (k) => (hasTS ? { querySet: qs, beginningOfPassWriteIndex: k * 2, endOfPassWriteIndex: k * 2 + 1 } : undefined);
const passWaves = [0, 1, 2, 3, 4, 5].map((m) => ({ colorAttachments: [colorAtt(mipView(tWater, m), true)], timestampWrites: m === 0 ? tsB(0) : m === 5 ? tsE(0) : undefined }));
const passCull = { timestampWrites: tsBE(1) };
const passMirOff = { colorAttachments: [colorAtt(tDummyC.createView(), false)], timestampWrites: tsBE(3) }; // empty pass keeping the mirror stage's timing when the mirror is skipped
passShadow.timestampWrites = tsBE(2);

// render targets (rebuilt on resize)
// drawn at up to `pix` pixels and stretched over the window; frame() adapts pix to hold 60 fps, starting where
// the last visit left it. PIXTOP: a level's maximum.
let W = 0, H = 0, MW = 0, MH = 0, DW = 0, DH = 0, targets = [], hist = null;
let passG, passG2, passGm, passAO, passVol, bgVol, passPolish, bgPolish, passLight, passLightM, passX1, passX1b, passXm, passWater, passX2, passTAA = [], passPost, bloomPass = [], bloomBG = [];
let bgLight, bgLightM, bgAO, bgFx, bgFxM, bgTAA = [], bgPost = [], cpA, cpB, cpD, cpDc, cpSize;
const NB = NBLOOM, FIXW = +QP.get('w') || 0, FIXH = +QP.get('h') || 0;
const PIXTOP = QL(1e9, 2560 * 1440, 1280 * 720), PIXMIN = mob ? 25e4 : 4e5;
let pix = +QP.get('pix') || (FIXW ? 1e9 : +SV[1] || (mob && LV > 1 ? 41e4 : 1e9));
// what frame() measures between decisions
let dynN = 0, dynT = 0, dynMax = 0, dynG = 0, dynGN = 0, dynBad = 0, dynOk = 0, dynWait = 3, dynOn = false;
// ?slow=N draws every frame N times (simulates a slower GPU)
const DYN = !FIXW || QP.has('dyn'), SLOW = max(1, +QP.get('slow') | 0);
function resize() {
  DW = FIXW || max(2, round(canvas.clientWidth * devicePixelRatio)); DH = FIXH || max(2, round(canvas.clientHeight * devicePixelRatio));
  const sc = min(1, sqrt(min(pix, PIXTOP) / (DW * DH))), w = max(2, round(DW * sc) & ~1), h = max(2, round(DH * sc) & ~1);
  if (w === W && h === H) return;
  // the last frame's history survives briefly, to be stretched into the new one
  const old = hist && hist[(F[FRAME] + 1) & 1];
  W = w; H = h; MW = W >> 1; MH = H >> 1; canvas.width = W; canvas.height = H;
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  for (const t of targets) if (t !== old) t.destroy(); targets = [];
  const T = (w, h, f, u = RT) => { const t = tex(w, h, f, u); targets.push(t); return t; };
  const gset = (w, h) => [T(w, h, 'rgba8unorm'), T(w, h, HDR), T(w, h, 'rgba8unorm'), T(w, h, DEPTH, RT | TU.COPY_SRC)];
  const g = gset(W, H), gm = MIRROR ? gset(MW, MH) : null;
  const tA = T(W, H, HDR, RT | TU.COPY_SRC), tB = T(W, H, HDR, TU.TEXTURE_BINDING | TU.COPY_DST), tDc = T(W, H, DEPTH, TU.TEXTURE_BINDING | TU.COPY_DST);
  const tMA = MIRROR ? T(MW, MH, HDR) : tDummyC, tAO = SSAO ? T(W >> 1, H >> 1, 'rg16float') : tWhite; hist = [T(W, H, HDR), T(W, H, HDR)];
  const gPass = (g, ts) => ({ colorAttachments: [colorAtt(g[0].createView(), true), colorAtt(g[1].createView(), true), colorAtt(g[2].createView(), true)],
    depthStencilAttachment: { view: g[3].createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' }, timestampWrites: ts });
  const cPass = (c, d, ts) => ({ colorAttachments: [colorAtt(c.createView(), false)], depthStencilAttachment: { view: d.createView(), depthLoadOp: 'load', depthStoreOp: 'store' }, timestampWrites: ts });
  passG = gPass(g, LV > 1 ? tsB(4) : tsBE(4)); if (MIRROR) passGm = gPass(gm, tsB(3));
  // Low: the G-buffer's second pass, loading what the first left (render())
  passG2 = { colorAttachments: [0, 1, 2].map((i) => colorAtt(g[i].createView(), false)), depthStencilAttachment: { view: g[3].createView(), depthLoadOp: 'load', depthStoreOp: 'store' }, timestampWrites: tsE(4) };
  const tVol = SHAFTS ? T(W >> 2, H >> 2, 'rg16float') : tWhite;
  if (SSAO) { passAO = { colorAttachments: [colorAtt(tAO.createView(), true)], timestampWrites: SHAFTS ? tsB(5) : tsBE(5) }; bgAO = group(lAO, [ubo[V_MAIN], g[3], g[1], g[2]]); }
  if (SHAFTS) { passVol = { colorAttachments: [colorAtt(tVol.createView(), true)], timestampWrites: SSAO ? tsE(5) : tsBE(5) }; bgVol = group(lVol, [ubo[V_MAIN], sCmp, g[3], tSh[1], tSh[2]]); }
  passLight = { colorAttachments: [colorAtt(tA.createView(), true)], timestampWrites: tsBE(6) }; if (MIRROR) passLightM = { colorAttachments: [colorAtt(tMA.createView(), true)] };
  if (POLISH) { passPolish = { colorAttachments: [colorAtt(tA.createView(), false)], timestampWrites: tsB(7) }; bgPolish = group(lPolish, [ubo[V_MAIN], sLin, tB, tDc, g[1], g[2], cubeView(tEnv)]); }
  passX1 = cPass(tA, g[3], POLISH ? undefined : tsB(7)); passX1b = cPass(tA, g[3]); passWater = cPass(tA, g[3]); passX2 = cPass(tA, g[3], tsE(7)); if (MIRROR) passXm = cPass(tMA, gm[3], tsE(3));
  const lightBG = (u, g, ao, vol) => group(lLight, [u, sLin, sRep, sCmp, g[0], g[1], g[2], g[3], ao, tSky, cubeView(tEnv), cubeView(tIrr), tSh[0], tSh[1], tSh[2], tSh[3], tWater, tNoiseA, tTop, vol]);
  bgLight = lightBG(ubo[V_MAIN], g, tAO, tVol); if (MIRROR) bgLightM = lightBG(ubo[V_MIR], gm, tWhite, tWhite);
  const fxBG = (sc, d, rf) => group(lFx, [sc, d, rf, tSky, cubeView(tEnv), tSh[0], tSh[1], tSh[2], tSh[3], tWater, sCmp]);
  bgFx = fxBG(tB, tDc, tMA); if (MIRROR) bgFxM = fxBG(tDummyC, tDummyD, tDummyC);
  passTAA = [0, 1].map((i) => ({ colorAttachments: [colorAtt(hist[i].createView(), true)], timestampWrites: tsBE(8) }));
  bgTAA = [0, 1].map((i) => group(lTAA, [ubo[V_MAIN], sLin, tA, hist[1 - i], g[3]]));
  const bl = []; for (let i = 0; i < NB; i++) bl.push(T(max(1, W >> (i + 1)), max(1, H >> (i + 1)), HDR));
  // bloom: down hist -> b0 .. b5, then up additively to b0; one chain per history buffer
  bloomPass = []; bloomBG = [[], []];
  for (let i = 0; i < NB; i++) { bloomPass.push({ colorAttachments: [colorAtt(bl[i].createView(), true)], timestampWrites: i === 0 ? tsB(9) : undefined }); for (const k of [0, 1]) bloomBG[k].push(blitBG(i ? bl[i - 1].createView() : hist[k].createView())); }
  for (let i = NB - 1; i > 0; i--) { bloomPass.push({ colorAttachments: [colorAtt(bl[i - 1].createView(), false)], timestampWrites: i === 1 ? tsE(9) : undefined }); for (const k of [0, 1]) bloomBG[k].push(blitBG(bl[i].createView())); }
  passPost = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }], timestampWrites: tsBE(10) };
  bgPost = [0, 1].map((i) => group(lPost, [ubo[V_MAIN], sLin, hist[i], bl[0]]));
  cpA = { texture: tA }; cpB = { texture: tB }; cpD = { texture: g[3] }; cpDc = { texture: tDc }; cpSize = [W, H];
  // start a new size from the old picture: with no history every resolution change would flash
  if (old) {
    const e = device.createCommandEncoder(), bg = blitBG(old.createView());
    for (const t of hist) { const r = e.beginRenderPass({ colorAttachments: [colorAtt(t.createView(), true)] }); r.setPipeline(pFit); r.setBindGroup(0, bg); r.draw(3); r.end(); }
    Q.submit([e.finish()]); old.destroy();
  } else F[RESET] = 1;
  dynN = dynG = dynGN = dynMax = 0; dynT = -300; // let the new size settle before measuring
}

// camera state
// per-frame numbers in one preallocated array: the frame loop allocates nothing
const F = new Float64Array(16), P6 = new Float64Array(6);
const CX = 0, CY = 1, CZ = 2, YAW = 3, PIT = 4, VX = 5, VY = 6, VZ = 7, TIME = 8, FLT = 9, LAST = 10, HUDT = 11, SPL = 12, RESET = 13, FRAME = 14, DT = 15;
function aim() {
  const dx = P6[3] - P6[0], dy = P6[4] - P6[1], dz = P6[5] - P6[2];
  F[CX] = P6[0]; F[CY] = P6[1]; F[CZ] = P6[2]; F[YAW] = atan2(dx, -dz); F[PIT] = atan2(dy, sqrt(dx * dx + dz * dz));
}
const lookAt = (x, y, z, tx, ty, tz) => { P6[0] = x; P6[1] = y; P6[2] = z; P6[3] = tx; P6[4] = ty; P6[5] = tz; aim(); F[RESET] = 1; };
// Catmull-Rom over position + look-at at F[SPL]
const FLYN = FLY.length / 6, FLYT = 60;
function flyRaw() {
  const s = F[SPL]; let i = floor(s) | 0; if (i > FLYN - 2) i = FLYN - 2;
  const u = s - i, i0 = (i > 0 ? i - 1 : 0) * 6, i1 = i * 6, i2 = (i + 1) * 6, i3 = (i + 2 < FLYN ? i + 2 : FLYN - 1) * 6;
  for (let o = 0; o < 6; o++) { const a = FLY[i0 + o], b = FLY[i1 + o], c = FLY[i2 + o], d = FLY[i3 + o]; P6[o] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u); }
  aim();
}
// camera on the path at F[FLT] (control points evenly spaced in time)
function flyAt() { let s = F[FLT] / FLYT; s = s < 0 ? 0 : s > 1 ? 1 : s; F[SPL] = s * (FLYN - 1); flyRaw(); }
resize();
addEventListener('resize', resize);

// frame
const JIT = new Float32Array(32); // Halton (2, 3) sub-pixel offsets
for (let i = 0; i < 16; i++) { const h = (n, b) => { let f = 1, r = 0; while (n > 0) { f /= b; r += f * (n % b); n = floor(n / b); } return r; }; JIT[i * 2] = h(i + 1, 2) - 0.5; JIT[i * 2 + 1] = h(i + 1, 3) - 0.5; }
const PVP = new Float32Array(16), submitList = [null];
// events (Tancredi's Castle): T storm over the castle (on/off, fades in and out), G the dragon's flight (DRAG_T s, again
// from the start on a second press), V the sea battle (on/off; the fleets sail in, and fight in a BATTLE_T s loop).
// Starting one jumps to the viewpoint that shows it best (EV_POSES in layout.js).
// sounds (music.js fills SFX.f): thunder after each stroke on the castle, a roar and the fire's rush, each broadside
const SFX = { f: null }, evSound = (k, d = 0) => SFX.f && SFX.f(k, d);
const fr1 = (x) => x - floor(x), h11 = (x) => fr1(sin(x * 127.1) * 43758.5453);
const EV = { storm: 0, stormOn: 0, dragT: -1e9, warT: -1e9, warOn: 0, warW: 0, last: 0 }, EVU = new Float32Array(4);
const evTick = (t) => {
  const dt = clamp(t - EV.last, 0, 0.1); EV.last = t;
  EV.storm = clamp(EV.storm + (EV.stormOn ? dt : -dt) / 5, 0, 1); EV.warW = clamp(EV.warW + (EV.warOn ? dt / 14 : -dt / 6), 0, 1);
  const dg = t - EV.dragT;
  // thunder for the castle's strokes (sh_base.js flashK), a broadside's boom, the dragon's roar and fire
  const k = floor(t / 2.6), kp = floor((t - dt) / 2.6);
  if (k !== kp && EV.storm > 0.3 && h11(k * 3.1 + 0.7) >= 0.2) evSound('K', 0.25 + 0.6 * Math.random());
  if (EV.warW > 0.98) { const a = (t - EV.warT) % 8, b = (t - dt - EV.warT) % 8; for (let i = 0; i < FLEET.length; i++) { const z = i * 1.6; if (a >= z && (b < z || b > a)) evSound('C', 0.3); } }
  if (dg >= 0 && dg < DRAG_T) { for (const w of DRAG_FIRE) if (dg >= w[0] && dg - dt < w[0]) evSound('F'); if (dg >= 1.5 && dg - dt < 1.5) evSound('G'); }
  EVU[0] = EV.storm; EVU[1] = dg >= 0 && dg < DRAG_T ? dg : -1; EVU[2] = EV.warW > 0 ? (t - EV.warT) % BATTLE_T : -1; EVU[3] = EV.warW;
};
const evKey = (k) => {
  const t = F[TIME], go = (i) => { lookAt(...EV_POSES[i]); F[VX] = F[VY] = F[VZ] = 0; };
  if (k === 'T') { EV.stormOn = !EV.stormOn; if (EV.stormOn) go(0); }
  else if (k === 'G') { EV.dragT = t; go(1); }
  else { EV.warOn = !EV.warOn; if (EV.warOn) { if (EV.warW === 0) EV.warT = t; go(2); } }
  if (k === 'V' && EV.warOn) evSound('V');
};
let hud = false;
function render() {
  const U = UB[V_MAIN], M = UB[V_MIR], S = UB[V_SH], fr = F[FRAME], t = F[TIME], par = fr & 1;
  const cx = F[CX], cy = F[CY], cz = F[CZ], j = (fr & 15) * 2;
  // unjittered first: that matrix is next frame's reprojection target
  setCam(U, cx, cy, cz, F[YAW], F[PIT], W, H, 0, 0);
  for (let i = 0; i < 16; i++) { U[32 + i] = PVP[i]; PVP[i] = U[i]; }
  setCam(U, cx, cy, cz, F[YAW], F[PIT], W, H, JIT[j] * 2 / W, JIT[j + 1] * 2 / H);
  U[O_CAM + 3] = t; U[O_JIT + 2] = fr; U[O_JIT + 3] = -1e9;
  // heartbeat: x = seconds since the last pulse, y = slow crystal breathing, z = flare as each pulse leaves
  const tp = t % PULSE, tq = (tp < PULSE / 2 ? tp : tp - PULSE) / 0.7;
  U[O_PULSE] = tp; U[O_PULSE + 1] = 0.5 + 0.5 * sin(t * TAU / 7); U[O_PULSE + 2] = exp(-tq * tq);
  U[O_MISC] = F[RESET]; U[O_MISC + 1] = 0; U[O_MISC + 2] = LODK; U[O_MISC + 3] = 1; U[O_LODC] = cx; U[O_LODC + 1] = cy; U[O_LODC + 2] = cz; U[O_LODC + 3] = 1 / LODK;
  // canal mirror only when canal water is in view and the camera is low enough (fades 170-235 m)
  let mir = MIRROR ? 1 - sstep(170, 235, cy) : 0;
  for (let k = 0; k < 5; k++) { const o = O_PL + k * 4; if (U[o + 1] * WATER + U[o + 3] < -445) mir = 0; }
  U[O_PULSE + 3] = mir;
  evTick(t); for (const B of UB) B.set(EVU, O_EV);
  if (CASC) {
    // cascade: a 92 m box around the point 36 m ahead of the camera
    shadowMat(O_SM, cx + U[O_FWD] * 36, cy + U[O_FWD + 1] * 36, cz + U[O_FWD + 2] * 36, 46, -420, 700, CASC, true);
    // casters switch LODs only a little sooner, or shadows pop on their own
    S[O_CAM + 3] = t; S[O_MISC + 1] = 2; S[O_MISC + 2] = 1.85 * LODK; S[O_MISC + 3] = 1; S[O_LODC] = cx; S[O_LODC + 1] = cy; S[O_LODC + 2] = cz;
    Q.writeBuffer(ubo[V_SH], 0, S);
  }
  if (MIRROR) {
    // mirror camera: below the water plane, looking up
    setCam(M, cx, 2 * WATER - cy, cz, F[YAW], -F[PIT], MW, MH, 0, 0);
    M[O_CAM + 3] = t; M[O_JIT + 2] = fr; M[O_JIT + 3] = WATER - 0.05; for (let i = 0; i < 4; i++) M[O_PULSE + i] = U[O_PULSE + i];
    // the rippled mirror gets by with lower LODs
    M[O_MISC + 1] = 1; M[O_MISC + 2] = 3 * LODK; M[O_MISC + 3] = 1; M[O_LODC] = cx; M[O_LODC + 1] = cy; M[O_LODC + 2] = cz;
    Q.writeBuffer(ubo[V_MIR], 0, M);
  }
  Q.writeBuffer(ubo[V_MAIN], 0, U);
  WT[0] = t; Q.writeBuffer(uboW, 0, WT);

  const e = device.createCommandEncoder();
  let slot = null;
  // GPU timings: while shown, and every 8th frame while tuning resolution
  if (tsOn || (dynOn && (fr & 7) === 0)) for (let i = 0; i < qRead.length; i++) if (!qRead[i].busy) { slot = qRead[i]; break; }
  let r = e.beginRenderPass(passWaves[0]); r.setPipeline(pWaves); r.setBindGroup(0, bgWaves); r.draw(3); r.end();
  for (let i = 1; i < 6; i++) { r = e.beginRenderPass(passWaves[i]); r.setPipeline(pMip[HDR]); r.setBindGroup(0, waterBG[i - 1]); r.draw(3); r.end(); }
  // visibility and LOD for the three views
  const c = e.beginComputePass(passCull); cullView(c, V_MAIN); if (mir > 0) cullView(c, V_MIR); if (CASC) cullView(c, V_SH); c.end();
  if (CASC) {
    r = e.beginRenderPass(passShadow); r.setBindGroup(0, bgScene[V_SH]); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    r.setPipeline(pSh32[0]); drawList(r, V_SH, LS[K.SOLID].near); r.setPipeline(pSh32[1]); drawList(r, V_SH, LS[K.LEAF].near); r.end();
  }
  // mirror view: G-buffer, lighting, crystal and glass
  if (mir > 0) {
    r = e.beginRenderPass(passGm); r.setBindGroup(0, bgScene[V_MIR]); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    r.setPipeline(pGm[0]); drawList(r, V_MIR, LS[K.SOLID].mir); drawLeaves(r, V_MIR, pGm, LS[K.LEAF].mir); r.setPipeline(pGm[0]); drawList(r, V_MIR, LS[K.SOLID].gndMir); r.end();
    r = e.beginRenderPass(passLightM); r.setPipeline(pLight); r.setBindGroup(0, bgLightM); r.draw(3); r.end();
    r = e.beginRenderPass(passXm); r.setBindGroup(0, bgScene[V_MIR]); r.setBindGroup(1, bgFxM); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    r.setPipeline(pCrystal); drawList(r, V_MIR, LS[K.CRYSTAL].mir); r.setPipeline(pCascade); drawList(r, V_MIR, LS[K.CASCADE].mir);
    r.setPipeline(pGlassB); drawList(r, V_MIR, LS[K.GLASS].mir); r.setPipeline(pGlassF); drawList(r, V_MIR, LS[K.GLASS].mir); r.end();
  } else if (tsOn) { r = e.beginRenderPass(passMirOff); r.end(); }
  // main view G-buffer: buildings and plants first, the ground they hide last
  r = e.beginRenderPass(passG); r.setBindGroup(0, bgScene[V_MAIN]); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  r.setPipeline(pG[0]); drawList(r, V_MAIN, LS[K.SOLID].all);
  if (LV < 2) drawLeaves(r, V_MAIN, pG, LS[K.LEAF].all);
  else {
    // Low: leaf depth ends the first pass; colour and ground go in a second from the finished depth, so a phone GPU
    // can reject hidden fragments early (Galaxy A16 garden: 44 ms -> 16 ms)
    r.setPipeline(pPre); drawList(r, V_MAIN, LS[K.LEAF].all);
    r.end(); r = e.beginRenderPass(passG2); r.setBindGroup(0, bgScene[V_MAIN]); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    r.setPipeline(pLeafLow); drawList(r, V_MAIN, LS[K.LEAF].all);
  }
  r.setPipeline(pG[0]); drawList(r, V_MAIN, LS[K.SOLID].gnd); r.end();
  if (SSAO) { r = e.beginRenderPass(passAO); r.setPipeline(pAO); r.setBindGroup(0, bgAO); r.draw(3); r.end(); }
  if (SHAFTS) { r = e.beginRenderPass(passVol); r.setPipeline(pVol); r.setBindGroup(0, bgVol); r.draw(3); r.end(); }
  r = e.beginRenderPass(passLight); r.setPipeline(pLight); r.setBindGroup(0, bgLight); r.draw(3); r.end();
  // crystal refracts the lit scene; thin crystal refracts scene + crystal (the great crystal shows through the lotus);
  // water mirrors and refracts that; glass and cascades blend on top. Each step reads a copy of the picture so far.
  e.copyTextureToTexture(cpA, cpB, cpSize); e.copyTextureToTexture(cpD, cpDc, cpSize);
  if (POLISH) { r = e.beginRenderPass(passPolish); r.setPipeline(pPolish); r.setBindGroup(0, bgPolish); r.draw(3); r.end(); }
  r = e.beginRenderPass(passX1); r.setBindGroup(0, bgScene[V_MAIN]); r.setBindGroup(1, bgFx); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  r.setPipeline(pCrystal); drawList(r, V_MAIN, lsSolidX); r.end();
  if (LV < 2) {
    e.copyTextureToTexture(cpA, cpB, cpSize); e.copyTextureToTexture(cpD, cpDc, cpSize);
    r = e.beginRenderPass(passX1b); r.setBindGroup(0, bgScene[V_MAIN]); r.setBindGroup(1, bgFx); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    r.setPipeline(pCrystal); drawList(r, V_MAIN, lsThinX); r.end();
    e.copyTextureToTexture(cpA, cpB, cpSize); e.copyTextureToTexture(cpD, cpDc, cpSize);
    r = e.beginRenderPass(passWater); r.setBindGroup(0, bgScene[V_MAIN]); r.setBindGroup(1, bgFx); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    r.setPipeline(pWater); drawList(r, V_MAIN, LS[K.WATER].all); r.end();
    r = e.beginRenderPass(passX2); r.setBindGroup(0, bgScene[V_MAIN]); r.setBindGroup(1, bgFx); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  } else {
    // Low: one more copy (so the lotus shows the crystal), then the rest in one pass; on a phone every reload of the
    // picture costs as much as drawing it
    e.copyTextureToTexture(cpA, cpB, cpSize);
    r = e.beginRenderPass(passX2); r.setBindGroup(0, bgScene[V_MAIN]); r.setBindGroup(1, bgFx); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    r.setPipeline(pCrystal); drawList(r, V_MAIN, lsThinX); r.setPipeline(pWater); drawList(r, V_MAIN, LS[K.WATER].all);
  }
  r.setPipeline(pCascade); drawList(r, V_MAIN, LS[K.CASCADE].all);
  r.setPipeline(pGlassB); drawList(r, V_MAIN, LS[K.GLASS].all); r.setPipeline(pGlassF); drawList(r, V_MAIN, LS[K.GLASS].all); r.end();
  // TAA into this frame's history, bloom from it, then tone mapping
  r = e.beginRenderPass(passTAA[par]); r.setPipeline(pTAA); r.setBindGroup(0, bgTAA[par]); r.draw(3); r.end();
  for (let i = 0; i < bloomPass.length; i++) { r = e.beginRenderPass(bloomPass[i]); r.setPipeline(i === 0 ? pDown0 : i < NB ? pDown : pUp); r.setBindGroup(0, bloomBG[par][i]); r.draw(3); r.end(); }
  passPost.colorAttachments[0].view = ctx.getCurrentTexture().createView();
  r = e.beginRenderPass(passPost); r.setPipeline(pPost); r.setBindGroup(0, bgPost[par]); r.draw(3); r.end();
  if (slot) { e.resolveQuerySet(qs, 0, NP * 2, qResolve, 0); e.copyBufferToBuffer(qResolve, 0, slot.b, 0, NP * 16); }
  submitList[0] = e.finish(); Q.submit(submitList);
  if (slot) { slot.busy = true; slot.b.mapAsync(GPUMapMode.READ).then(slot.done); }
  F[FRAME] = fr + 1; F[RESET] = 0;
}

const render0 = render; // dev.js wraps `render`
let kf = 0, kb = 0, kl = 0, kr = 0, ku = 0, kd = 0, ks = 0, mdx = 0, mdy = 0, lkx = 0, lky = 0, l2x = 0, l2y = 0, hN = 0, hMax = 0, menu = true;
let solid = !QP.has('noclip'); // key C
let tId = -1, tN = 0, tx = 0, ty = 0, tx0 = 0, ty0 = 0; // touch: steering finger id, fingers down, its position and where it went down
// flying speed: wheel scales it ~15% a step (0.25-50 m/s, Shift x8 too); middle button resets to 12.5 m/s
let spd = clamp(+QP.get('spd') || 1, 0.02, 4);
addEventListener('wheel', (e) => { if (!menu) spd = clamp(spd * exp(-(e.deltaMode ? e.deltaY * 33 : e.deltaY) * 0.0014), 0.02, 4); }, { passive: true });
addEventListener('mousedown', (e) => { if (!menu && e.button === 1) { e.preventDefault(); spd = 1; } });
const FPS = +QP.get('fps') || 0; // optional fps cap (development)
// dynamic resolution, decided every second (0.4 s behind the menu). Nothing runs or allocates on a machine that
// keeps up at full resolution.
function tune() {
  const top = min(PIXTOP, DW * DH), was = pix > top ? top : pix;
  // the one longest frame is left out: a single hitch changes nothing
  const a = dynN > 1 ? (dynT - dynMax) / (dynN - 1) : dynT, g = dynGN ? dynG / dynGN * SLOW : 0;
  let k = 1;
  // with GPU time keep it in 9.8-13.6 ms; otherwise (or if frames are late anyway) frame intervals decide
  if (g > 13.6) k = 11.7 / g;
  // slow twice in a row: fewer pixels, and wait twice as long to go back up
  else if (a > 17.6) { dynOk = 0; if (++dynBad > 1) { k = 15 / a; dynBad = 0; dynWait = min(dynWait * 2, 60); } }
  else {
    dynBad = 0;
    if (was < top) { if (g) { if (g < 9.8) k = 11.7 / g; } else if (a < 12.5) k = 15 / a; else if (++dynOk > dynWait) { k = 1.17; dynOk = 0; } } // at the display's rate room is unknown: try a little more now and then
  }
  k = k < 0.5 ? 0.5 : k > 1.7 ? 1.7 : k; if (k > 0.96 && k < 1.04) k = 1;
  let to = was * k; to = to < PIXMIN ? min(PIXMIN, top) : to > top ? top : to;
  pix = to < top ? to : 1e9; // no limit at full resolution, so a larger window is followed
  dynOn = hasTS && (to < top || a > 17.6);
  dynN = dynT = dynMax = dynG = dynGN = 0;
  if (to !== was) { keep('atlantis', [LV, to < top ? to | 0 : '']); resize(); }
}
function frame(now) {
  requestAnimationFrame(frame);
  if (dead || document.hidden) return;
  const dtr = now - F[LAST];
  if (FPS && dtr < 1000 / FPS - 1) return;
  F[LAST] = now;
  let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;
  if (DYN && !FPS && dtr < 1e3 && (dynT += dtr) > 0) { dynN++; if (dtr > dynMax) dynMax = dtr; if (dynT > (menu ? 400 : 1000)) tune(); }
  F[TIME] += dt; F[DT] = dt;
  // touch: the finger's offset from where it went down steers like a joystick
  if (tId >= 0) {
    const tr = 4 / min(innerWidth, innerHeight); let jx = (tx - tx0) * tr, jy = (ty - ty0) * tr;
    jx = jx > 1 ? 1 : jx < -1 ? -1 : jx; jy = jy > 1 ? 1 : jy < -1 ? -1 : jy;
    lkx += jx * 1.5 * dt; lky += jy * dt;
  }
  // mouse look through two cascaded low-pass stages; velocity eases towards the keys
  const kq = 1 - exp(-dt * 30); lkx += mdx * 0.0022; lky += mdy * 0.0022; mdx = 0; mdy = 0;
  const ax = lkx * kq, ay = lky * kq; lkx -= ax; lky -= ay; l2x += ax; l2y += ay;
  const dyw = l2x * kq, dpt = l2y * kq; l2x -= dyw; l2y -= dpt;
  const yaw = F[YAW] + dyw; let pitch = F[PIT] - dpt; pitch = pitch < -1.55 ? -1.55 : pitch > 1.55 ? 1.55 : pitch;
  // one finger flies forward, a second flies fast
  const sp = (ks || tN > 1 ? 100 : 12.5) * spd, k = 1 - exp(-dt * 5), mf = kf - kb + (tN > 0 ? 1 : 0), mr = kr - kl, mu = ku - kd, cp = cos(pitch), sy = sin(yaw), cw = cos(yaw);
  const vx = F[VX] + ((sy * cp * mf + cw * mr) * sp - F[VX]) * k, vy = F[VY] + ((sin(pitch) * mf + mu) * sp - F[VY]) * k, vz = F[VZ] + ((-cw * cp * mf + sy * mr) * sp - F[VZ]) * k;
  let x = F[CX] + vx * dt, y = F[CY] + vy * dt, z = F[CZ] + vz * dt;
  const rad = sqrt(x * x + z * z); if (rad > 6000) { x *= 6000 / rad; z *= 6000 / rad; }
  y = y < 0.6 ? 0.6 : y > 2500 ? 2500 : y;
  const px = F[CX], py = F[CY], pz = F[CZ];
  F[YAW] = yaw; F[PIT] = pitch; F[VX] = vx; F[VY] = vy; F[VZ] = vz; F[CX] = x; F[CY] = y; F[CZ] = z;
  // collision (collide.js); key C disables it
  if (solid) { collide(px, py, pz); x = F[CX]; y = F[CY]; z = F[CZ]; }
  for (let i = 1; i < SLOW; i++) render0(); // ?slow: extra frames drawn and discarded
  render();
  if (hud) {
    hN++; if (dtr > hMax) hMax = dtr; F[HUDT] += dtr / 1000;
    if (F[HUDT] > 0.5) { let s = `${(hN / F[HUDT]).toFixed(0)} fps · worst frame ${hMax.toFixed(1)} ms · GPU ${(gpuMs[NP] * SLOW).toFixed(2)} ms · ${W}x${H}${W < DW ? ` (${(100 * W / DW).toFixed(0)}% of ${DW}x${DH})` : ''} · ${LVN[LV]}\n`; for (let i = 0; i < NP; i++) s += `${PASSES[i]} ${gpuMs[i].toFixed(2)}  `; info.textContent = s + `\n${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)} · yaw ${(((yaw / DEG) % 360 + 360) % 360).toFixed(0)}° pitch ${(pitch / DEG).toFixed(0)}° · speed ${(12.5 * spd).toFixed(spd < 0.8 ? 2 : 1)} m/s${solid ? '' : ' · collision off (C)'}`; F[HUDT] = 0; hN = 0; hMax = 0; }
  }
}

// input and menu
const key = (e, v) => {
  switch (e.code) {
    case 'KeyW': kf = v; break; case 'KeyS': kb = v; break; case 'KeyA': kl = v; break; case 'KeyD': kr = v; break;
    case 'KeyE': ku = v; break; case 'KeyQ': kd = v; break; case 'ShiftLeft': case 'ShiftRight': ks = v; break;
    default: if (v && !e.repeat) {
      if (e.code === 'KeyH') { hud = !hud; tsOn = hud && hasTS; info.textContent = ''; }
      else if (e.code === 'KeyC') solid = !solid;
      else if (e.code === 'KeyO') setOra(ORE[(ORE.indexOf(ORA) + 1) % 4]);
      else if (e.code === 'KeyT' || e.code === 'KeyG' || e.code === 'KeyV') evKey(e.code[3]);
      else if (e.code >= 'Digit1' && e.code <= 'Digit9') { lookAt(...POSES[e.code.charCodeAt(5) - 49]); F[VX] = F[VY] = F[VZ] = 0; }
    }
  }
};
addEventListener('keydown', (e) => { if (!menu || e.code === 'KeyH') key(e, 1); });
addEventListener('keyup', (e) => key(e, 0));
const release = () => { kf = kb = kl = kr = ku = kd = ks = 0; tId = -1; tN = 0; };
addEventListener('blur', release);
const capture = () => { if (mob) return; const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => canvas.requestPointerLock()).catch(() => 0); };
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });
// touch: hold to fly forward, slide to steer, second finger fast. Portrait phones show the page rotated
// (template.html), so the touch axes turn too.
const rot = matchMedia('(orientation:portrait) and (pointer:coarse)');
const touch = (e) => {
  e.preventDefault(); if (menu) return; tN = e.touches.length;
  let f = null, first = false; for (let i = 0; i < tN; i++) if (e.touches[i].identifier === tId) f = e.touches[i];
  if (!f) { tId = -1; if (tN) { f = e.touches[0]; tId = f.identifier; first = true; } }
  if (f) {
    const x = rot.matches ? f.clientY : f.clientX, y = rot.matches ? -f.clientX : f.clientY, s = 1100 / min(innerWidth, innerHeight);
    if (first) { tx0 = x; ty0 = y; } else { mdx += (x - tx) * s; mdy += (y - ty) * s; } // the view follows the finger at once
    tx = x; ty = y;
  }
};
for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, touch, { passive: false });

// the scene keeps rendering, blurred, behind the menu
const ui = (m) => { if (dead) return; menu = m; body.className = m ? 'm' : document.pointerLockElement ? 'g p' : 'g'; if (m) release(); };
$('d').onclick = () => {
  ui(false); $('d').textContent = 'Riprendi';
  // phones: full screen and landscape; if refused the style sheet still rotates the page
  if (mob) document.documentElement.requestFullscreen?.()?.then(() => screen.orientation.lock('landscape')).catch(() => 0); else capture();
};
$('o').onclick = () => ui(true);
canvas.addEventListener('click', capture);
document.addEventListener('pointerlockchange', () => { if (!mob) ui(!document.pointerLockElement); });
// detail buttons: the current level is lit, the others reload with theirs
// time of day: the menu's row and O; a change is baked at load, so it reloads the page (layout.js)
const setOra = (o) => { try { localStorage.tancrediOra = o; } catch {} location.href = location.href.replace(/[?&]ora=\w+/, ''); };
$('t').querySelectorAll('button').forEach((b, i) => { if (ORE[i] === ORA) b.className = 'on'; else b.onclick = () => setOra(ORE[i]); });
// events from the menu too (phones have no keys): start it and play
$('e').querySelectorAll('button').forEach((b, i) => { b.onclick = () => { evKey('TGV'[i]); $('d').click(); }; });
$('q').querySelectorAll('button').forEach((b, i) => { if (i === 2 - LV) b.className = 'on'; else b.onclick = () => { try { localStorage.atlantis = 2 - i; } catch {} location.href = location.href.replace(/[?&]lv=\d/, ''); }; });

// draw the first frames and wait for the GPU (pipelines compile on first use) before revealing
lookAt(...POSES[4]); // the scene opens on viewpoint 5: the garden quarter, the king's castle against the sun
await say('Faccio entrare la luce…', 1);
render(); await Q.onSubmittedWorkDone();
setTimeout(() => { keep('atlantisLoad', ''); keep('atlantisLost', ''); }, 15e3); // the load counts as survived after 15 s
if (!AUTO) { ui(true); requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); }); } else { body.className = 'g'; window.__ready = true; }
