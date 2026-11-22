// detail level, chosen before anything is built
// LV: 0 High, 1 Medium, 2 Low: the same world, built and drawn with less detail (see README.md). QL(high, medium, low).
// localStorage.atlantis = "level,pixels" (pixels: the resolution frame() settled on). atlantisLoad still set on the next
// visit means that load crashed the tab or driver, so start a level lower. ?lv=0..2 picks a level without storing it.
const QP = new URLSearchParams(location.search), AUTO = QP.has('auto');
const mob = matchMedia('(pointer:coarse)').matches, mem = navigator.deviceMemory;
const keep = (k, v) => { if (!AUTO && !QP.has('lv')) try { localStorage[k] = v; } catch {} };
const fail = (m) => { throw new Error(m, { cause: 1 }); };
let lost; try { lost = localStorage.atlantisLost; } catch {}

// the graphics adapter comes first, because it decides the level of a first visit. The dedicated card first; when the
// browser gives none for that, ask without a preference, then for the integrated one. ?gpu=low: the integrated adapter
if (!navigator.gpu) fail('This scene needs WebGPU. Try a current Chrome or Edge.');
let adapter = null;
for (const p of QP.get('gpu') === 'low' ? ['low-power'] : ['high-performance', '', 'low-power'])
  adapter ||= await navigator.gpu.requestAdapter(p ? { powerPreference: p } : {}).catch(() => null);
// no adapter after this page lost its device: Chromium turns WebGPU off for the session after a few GPU resets
if (!adapter) fail(lost ? 'The graphics driver reset, and the browser has turned WebGPU off until it restarts. Close every browser window, open it again, and the city will load on a lower detail level.'
  : 'Your browser has WebGPU but offers no graphics card for it. Restart the browser, turn on hardware acceleration in its settings, update the graphics driver, or try Chrome or Edge.');
// Intel graphics built into the processor (the discrete Arc cards are the "hp" architectures): a long bake at load can
// outlast the driver's timeout there, so a first visit starts on Low
const IGPU = adapter.info.vendor === 'intel' && !/hp/.test(adapter.info.architecture);

let SV = [], LV = 0;
if (QP.has('lv')) LV = clamp(+QP.get('lv') | 0, 0, 2);
else if (!AUTO) {
  let bad; try { SV = (localStorage.atlantis || '').split(','); bad = localStorage.atlantisLoad; } catch {}
  // first visit: phones Low (Medium with 8 GB), computers High (Low with <= 4 GB or Intel integrated graphics)
  LV = SV[0] ? clamp(+SV[0] | 0, 0, 2) : mob ? (mem > 7 ? 1 : 2) : mem <= 4 || IGPU ? 2 : 0;
  if (bad && LV < 2) { SV = [++LV]; keep('atlantis', LV); }
}
const QL = (h, m, l) => (LV > 1 ? l : LV ? m : h), LVN = ['High', 'Medium', 'Low'];
// sun shadow map sizes: the camera cascade (0: none), then the baked city, shelf and mountain maps. 32-bit depth
// where shafts march through them (16-bit gave bright rings around the low sun)
const SHN = QL([2048, 8192, 4096, 2048], [1024, 4096, 2048, 1024], [0, 4096, 2048, 1024]), SH32 = LV < 2, CASC = SHN[0];
// LODs switch this much sooner (far limits stay: see `cull` in sh_scene.js)
const LODK = QL(1, 1.3, 2);
// tree leaf cards: this much smaller (plants.js), and how much more of a card counts as leaf (fs in sh_scene.js)
const LEAFK = QL(1, 1, 0.74), LEAFT = QL(0, 0, 0.1);
// Low draws leaves in two steps that must agree on depth exactly (W_GBUF_LOW in sh_scene.js)
const INV = LV > 1 ? '@invariant ' : '';
// the sea's mesh: this many times coarser (meshSea, and the swell's fade in the vertex shader)
const SEAK = QL(1, 1, 2);
// textures baked at load: leaf atlas tile, noise tiles, ground maps, sky-visibility map, wave tile
const LEAFPX = QL(512, 512, 256), NOISEPX = QL(1024, 1024, 512), MAPPX = QL(2048, 2048, 1024), TOPPX = QL(2048, 1024, 1024), WAVEPX = QL(512, 512, 128);
const TOPL = Math.log2(2048 / TOPPX); // mip levels the sky-visibility map is short of full size
// per-frame passes: canal mirror, SSAO, light shafts, polished-stone reflections, bloom depth
const MIRROR = LV < 2, SSAO = LV < 2, SHAFTS = LV < 2, POLISH = LV < 2, NBLOOM = QL(6, 6, 4);
// screen-space reflection march steps (Medium takes fewer, longer ones)
const SSRN = QL(22, 14, 14);
