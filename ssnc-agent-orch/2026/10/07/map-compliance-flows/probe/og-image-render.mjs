import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Renders public/og-image.png (1200×630) once: the branded hero composition
// in the app's own aesthetic — the attested editorial hero photo, the live
// hero gradient from app/v2.css + app/modern.css, Inter Aflivra variable,
// the hero kicker/h1 typography, honest copy. Attribution stays internal:
// the hero photo's author/license remain registered in media/category-manifest.json
// (editorial-hero) — the share image carries the brand, not the credit line.
// Re-run after brand/hero changes: `node ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/og-image-render.mjs`
// The plain screenshot is a photographic PNG (~1.5 MB); when it exceeds the
// 300 KB budget the render compresses to a palette PNG with the media
// pipeline's sharp (the same pinned build-media-variants.mjs require path).
const ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const OUT = join(ROOT, 'public', 'og-image.png');
const BUDGET = 300 * 1024;

const html = `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><style>
@font-face{font-family:'Inter Aflivra';src:url('file://${join(ROOT, 'public/fonts/InterVariable.woff2')}') format('woff2');font-weight:100 900;font-style:normal}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{position:relative;background:#232d3b;font-family:'Inter Aflivra',sans-serif}
img.hero{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:59% center}
.shade{position:absolute;inset:0;background:linear-gradient(100deg,rgba(7,28,47,.93) 0%,rgba(7,28,47,.69) 56%,rgba(7,28,47,.12) 100%),linear-gradient(0deg,#101c2cbb,transparent 55%)}
.brand{position:absolute;left:90px;top:64px;display:flex;align-items:center;gap:10px;color:#fff;font-size:30px;font-weight:720;letter-spacing:-.075em;line-height:1}
.compass{width:27px;height:27px;border:2.2px solid #d5b875;border-radius:50%;position:relative;transform:rotate(-8deg)}
.compass:before{content:'';position:absolute;left:50%;top:50%;width:9px;height:2.2px;background:#d5b875;transform-origin:left center;transform:rotate(45deg) translate(-1px,-1px)}
.compass:after{content:'';position:absolute;left:41%;top:16%;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid #d5b875;transform:rotate(-15deg)}
.brand em{font-style:normal;color:#d5b875}
.content{position:absolute;left:90px;right:120px;top:172px;display:flex;flex-direction:column;align-items:flex-start}
.kicker{display:flex;align-items:center;gap:12px;color:#cfd9e7;font-size:21px;font-weight:600;letter-spacing:.12em}
.kicker i{width:9px;height:9px;border-radius:50%;background:#d5b875}
h1{color:#fff;font-size:88px;font-weight:650;letter-spacing:-.045em;line-height:1.06;margin:34px 0 30px;max-width:1000px}
h1 em{font-style:normal;color:#adc6e9}
.lead{color:#d9dee4;font-size:24px;line-height:1.7;max-width:920px;font-weight:400}
.meta{position:absolute;left:90px;right:90px;bottom:54px;display:flex;justify-content:space-between;align-items:center;color:#acb6c3;font-size:19px;letter-spacing:.02em}
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
  <p class="lead">Explorează România prin dashboarduri, hărți, galerii și comparații — date din surse publice, cu perioada și ultima verificare vizibile.</p>
</div>
<div class="meta"><span class="site">aflivra.brebu.workers.dev</span><span class="facts"><b>fără cont</b> · fără plată · fără reclame</span></div>
</body></html>`;

const pagePath = join(tmpdir(), 'aflivra-og-composition.html');
fs.writeFileSync(pagePath, html);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.goto('file://' + pagePath);
await page.evaluate(async () => {
  await document.fonts.ready;
  for (const image of document.images) {
    if (!image.complete) await new Promise((resolve, reject) => { image.addEventListener('load', resolve); image.addEventListener('error', reject); });
  }
});
await page.waitForTimeout(250);
let png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await context.close();
await browser.close();
fs.unlinkSync(pagePath);

let note = 'png direct';
if (png.length > BUDGET) {
  // Palette PNG through the pinned media-pipeline sharp (build-media-variants.mjs path).
  const require = createRequire(fileURLToPath(new URL(ROOT + 'node_modules/.pnpm/sharp@0.35.4_@types+node@22.19.19/node_modules/sharp/package.json', 'file://' + ROOT)));
  const sharp = require('sharp');
  let quality = 90;
  while (png.length > BUDGET && quality >= 40) {
    png = await sharp(png, { palette: true, quality }).png({ palette: true, quality, compressionLevel: 9 }).toBuffer();
    note = 'palette png (sharp, quality ' + quality + ')';
    if (png.length <= BUDGET) break;
    quality -= 10;
  }
}
if (png.length > BUDGET) throw new Error('og-image.png cannot fit the 300 KB budget: ' + png.length + ' bytes');
fs.writeFileSync(OUT, png);
console.log(`og-image.png: ${png.length} bytes (${(png.length / 1024).toFixed(0)} KB), 1200×630, ${note} — scris în public/og-image.png`);
