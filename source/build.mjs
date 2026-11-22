// Bundles src/*.js into the single self-contained ../index.html
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
// concatenation order matters
const FILES = ['math.js', 'quality.js', 'layout.js', 'sh_base.js', 'sh_scene.js', 'sh_light.js', 'sh_fx.js', 'meshes.js', 'plants.js', 'city.js', 'castles.js', 'events.js', 'world.js', 'collide.js', 'main.js', 'music.js'];
const dev = process.argv.includes('--dev'), readable = dev || process.argv.includes('--readable'), unpacked = process.argv.includes('--unpacked');
const out = dev ? 'dev.html' : 'index.html';
if (dev) FILES.push('dev.js');

let js = FILES.map((f) => readFileSync(path.join(here, 'src', f), 'utf8')).join('\n');
const tpl = readFileSync(path.join(here, 'template.html'), 'utf8');
// everything runs inside one async function; startup errors are shown on screen
const wrap = (body) => `(async()=>{${body}\n})().catch(e=>{console.error(e);window.__err=e.message;document.body.className='l e';document.getElementById('s').textContent=(e.cause?'':'Failed to start: ')+e.message});`;

// The minified script is deflated and stored 7 bits a character in a template literal; a small loader rebuilds the
// bytes, inflates them with the browser's DecompressionStream and runs the result as a script. The 6 values that
// cannot stand raw there (NUL, CR, $, <, backslash, backtick) are written as U+0100 + value: 2 bytes in UTF-8, and
// the loader keeps only the low 7 bits of every character. About 1.2 bytes of page per deflated byte, against 1.33
// for base64. The page's markup and CSS stay as they are, so the menu shows while the script unpacks.
function pack(code) {
  const z = deflateRawSync(Buffer.from(code), { level: 9, memLevel: 9 }), BAD = [0, 13, 36, 60, 92, 96];
  let s = '', a = 0, k = 0;
  const put = (v) => { s += String.fromCharCode(BAD.includes(v) ? 256 + v : v); };
  for (const b of z) { a = (a << 8) | b; k += 8; while (k >= 7) { k -= 7; put((a >> k) & 127); } a &= (1 << k) - 1; }
  if (k) put((a << (7 - k)) & 127);
  return `(async()=>{const s=\`${s}\`,n=${z.length},b=new Uint8Array(n);for(let i=0,j=0,a=0,k=0;j<n;i++){a=a<<7|s.charCodeAt(i)&127;k+=7;if(k>7){k-=8;b[j++]=a>>k;a&=(1<<k)-1}}` +
    `const e=document.createElement("script");e.text=await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();document.body.append(e)})()` +
    `.catch(e=>{document.body.className="l e";document.getElementById("s").textContent="Failed to start: "+e.message})`;
}

let html;
if (readable) {
  html = tpl.replace('/*SCRIPT*/', () => wrap(js));
} else {
  // shrink the WGSL inside /*wgsl*/ template literals, then minify the JS and the page's CSS
  const minWgsl = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').replace(/ ?([{}()\[\];,:=+\-*\/<>&|!%@]) ?/g, '$1').trim();
  js = js.replace(/\/\*wgsl\*\/`([^`]*)`/g, (_, w) => '`' + minWgsl(w) + '`');
  let code = transformSync(wrap(js), { minify: true, target: 'es2022', legalComments: 'none' }).code.trim();
  if (!unpacked) code = pack(code);
  const css = (_, s) => '<style>' + transformSync(s, { loader: 'css', minify: true }).code.trim();
  html = tpl.replace(/<style>([^]*?)(?=<\/style>)/, css).replace(/>\s+</g, '><').replace('/*SCRIPT*/', () => code).replace(/<script>\s+/, '<script>').replace(/\s+<\/script>/, '</script>');
}
writeFileSync(path.join(here, '..', out), html);
const bytes = Buffer.byteLength(html), gz = gzipSync(Buffer.from(html), { level: 9 }).length;
console.log(`${out}: ${bytes.toLocaleString('en')} bytes (${(bytes / 1000).toFixed(1)} kB)${readable ? ' (readable)' : unpacked ? ' (minified, not packed)' : ' (packed)'}, ${(gz / 1000).toFixed(1)} kB gzipped`);
