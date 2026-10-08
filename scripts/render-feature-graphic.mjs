import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

// Randare twa/store-assets/feature-graphic.png (1024×500) — graficul de
// listing Play Console, din tokenii reali ai brandului: fotografia de hero
// atestată, gradienții vii din og-image, Inter Aflivra variabilă, marca
// busolei. Aceeași compoziție ca public/og-image.png, rescalată pe canvasul
// Play; re-rulează după schimbări de brand:
//   node scripts/render-feature-graphic.mjs
// Buget Play: 1 MB; peste, comprimă automat la PNG cu paletă prin sharp-ul
// fixat al pipeline-ului media (buget sănătos pentru un listing: fotograficul
// ~1.3 MB nu intră brut). Compoziția ține textul în stânga — zonele de
// decupaj ale Play-ului se ating de banda din dreapta.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'twa', 'store-assets', 'feature-graphic.png');
const BUDGET = 1024 * 1024;

const html = `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><style>
@font-face{font-family:'Inter Aflivra';src:url('file://${join(ROOT, 'public/fonts/InterVariable.woff2')}') format('woff2');font-weight:100 900;font-style:normal}
*{margin:0;box-sizing:border-box}
html,body{width:1024px;height:500px;overflow:hidden}
body{position:relative;background:#232d3b;font-family:'Inter Aflivra',sans-serif}
img.hero{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:59% center}
.shade{position:absolute;inset:0;background:linear-gradient(100deg,rgba(7,28,47,.94) 0%,rgba(7,28,47,.72) 52%,rgba(7,28,47,.14) 100%),linear-gradient(0deg,#101c2cbb,transparent 55%)}
.brand{position:absolute;left:56px;top:36px;display:flex;align-items:center;gap:8px;color:#fff;font-size:22px;font-weight:720;letter-spacing:-.075em;line-height:1}
.compass{width:20px;height:20px;border:1.6px solid #d5b875;border-radius:50%;position:relative;transform:rotate(-8deg)}
.compass:before{content:'';position:absolute;left:50%;top:50%;width:7px;height:1.6px;background:#d5b875;transform-origin:left center;transform:rotate(45deg) translate(-1px,-1px)}
.compass:after{content:'';position:absolute;left:41%;top:16%;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:8px solid #d5b875;transform:rotate(-15deg)}
.brand em{font-style:normal;color:#d5b875}
.content{position:absolute;left:56px;right:250px;top:108px;display:flex;flex-direction:column;align-items:flex-start}
.kicker{display:flex;align-items:center;gap:9px;color:#cfd9e7;font-size:14px;font-weight:600;letter-spacing:.12em}
.kicker i{width:7px;height:7px;border-radius:50%;background:#d5b875}
h1{color:#fff;font-size:47px;font-weight:650;letter-spacing:-.045em;line-height:1.08;margin:22px 0 18px;max-width:700px}
h1 em{font-style:normal;color:#adc6e9}
.lead{color:#d9dee4;font-size:16.5px;line-height:1.6;max-width:680px;font-weight:400}
.meta{position:absolute;left:56px;right:56px;bottom:30px;display:flex;justify-content:space-between;align-items:center;color:#acb6c3;font-size:14px;letter-spacing:.02em}
.meta .site{letter-spacing:.14em;text-transform:lowercase}
.meta .facts{color:#c3cdda;letter-spacing:.06em}
.meta .facts b{color:#d5b875;font-weight:600}
</style></head>
<body>
<img class="hero" src="file://${join(ROOT, 'public/media/hero-graphite-blue.webp')}" alt="">
<div class="shade"></div>
<div class="brand"><span class="compass"></span>aflivra<em>.</em></div>
<div class="content">
  <span class="kicker"><i></i>ROMÂNIA LA ÎNDEMÂNĂ</span>
  <h1>Date oficiale,<br/><em>verificări la vedere.</em></h1>
  <p class="lead">Explorează România prin dashboarduri, hărți și comparații — date din surse publice, cu perioada și ultima verificare vizibile.</p>
</div>
<div class="meta"><span class="site">aflivra.brebu.workers.dev</span><span class="facts"><b>fără cont</b> · fără plată · fără reclame</span></div>
</body></html>`;

const pagePath = join(tmpdir(), 'aflivra-feature-graphic.html');
fs.writeFileSync(pagePath, html);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.goto('file://' + pagePath);
await page.evaluate(async () => {
  await document.fonts.ready;
  for (const image of document.images) {
    if (!image.complete) await new Promise((resolve, reject) => { image.addEventListener('load', resolve); image.addEventListener('error', reject); });
  }
});
await page.waitForTimeout(250);
let png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1024, height: 500 } });
await context.close();
await browser.close();
fs.unlinkSync(pagePath);

let note = 'png direct';
if (png.length > BUDGET) {
  // Sharp-ul fixat al pipeline-ului media — directorul .pnpm e sufixat de
  // peer-deps, deci se descoperă veriunea locked la runtime.
  const pnpmDir = join(ROOT, 'node_modules', '.pnpm');
  const sharpDir = fs.readdirSync(pnpmDir).find(entry => /^sharp@/.test(entry));
  if (!sharpDir) throw new Error('sharp lipsește din node_modules/.pnpm — cannot comprima sub buget');
  const require = createRequire(resolve(join(pnpmDir, sharpDir, 'node_modules', 'sharp', 'package.json')));
  const sharp = require('sharp');
  let quality = 90;
  while (png.length > BUDGET && quality >= 40) {
    png = await sharp(png).png({ palette: true, quality, compressionLevel: 9 }).toBuffer();
    note = 'palette png (sharp, quality ' + quality + ')';
    if (png.length <= BUDGET) break;
    quality -= 10;
  }
}
if (png.length > BUDGET) throw new Error('feature-graphic.png cannot fit the 1 MB budget: ' + png.length + ' bytes');
fs.mkdirSync(dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, png);
console.log(`feature-graphic.png: ${png.length} bytes (${(png.length / 1024).toFixed(0)} KB), 1024×500, ${note} — scris în twa/store-assets/feature-graphic.png`);
