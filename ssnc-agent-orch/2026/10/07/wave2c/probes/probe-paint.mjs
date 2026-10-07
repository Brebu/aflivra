// Visibility probe (Builder-3, wave2c): rasterizes the live map SVG to a canvas and
// samples pixels along the leader lines and at the displaced pin centres, proving
// the fan-out and leaders actually PAINT (not just exist in the DOM). The header
// screenshot (decluster-*.png) is the human-readable artifact; this is the pixel
// evidence, since the model cannot view images.
import {chromium} from '@playwright/test';

const BASE = process.env.AFLIVRA_BASE || 'http://127.0.0.1:5173';
const RASTER = 2; // raster pixels per root-viewBox unit (canvas 1280x980 for viewBox 640x490)

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto(BASE + '/#view=map');
await page.waitForSelector('.map-workspace .romap g.map-pin');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});

const result = await page.evaluate(async raster => {
  const svg = document.querySelector('.map-workspace .romap svg');
  const ctm = svg.getScreenCTM();
  const leaders = [...svg.querySelectorAll('g.map-leaders line')].map(l => ({
    x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
    x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'),
  }));
  const pinCentre = label => {
    const g = svg.querySelector(`g.map-pin[aria-label="Selectează ${label}"]`);
    const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
    const c = new DOMPoint(tx, ty).matrixTransform(ctm);
    return {label, css: [c.x, c.y]};
  };
  const pins = ['Castelul Peleș', 'Castelul Pelișor', 'Mănăstirea Sinaia', 'Ateneul Român', 'Muzeul Colecțiilor de Artă'].map(pinCentre);

  // Rasterize a detached clone: at zoom 1 & no pan the zoom g is identity, so root
  // viewBox coords == pin local coords. Stroke/fill live on the elements themselves.
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', String(640 * raster)); clone.setAttribute('height', String(490 * raster));
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = 640 * raster; canvas.height = 490 * raster;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const at = (rx, ry) => {
    const px = Math.round(rx), py = Math.round(ry);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;
    const o = (py * canvas.width + px) * 4;
    return [data[o], data[o + 1], data[o + 2]];
  };
  const isPaint = rgb => rgb && rgb[0] + rgb[1] + rgb[2] < 3 * 235; // darker than the white fill

  // css px -> raster px: CTM css coords carry the svg's viewport origin; the raster
  // holds only the viewBox, so subtract the svg box before scaling to raster units.
  const svgBox = svg.getBoundingClientRect();
  const svgW = svg.clientWidth || 640;
  const cssToRaster = (x, y) => [(x - svgBox.left) * (640 / svgW) * raster, (y - svgBox.top) * (640 / svgW) * raster];

  let paintedLeaders = 0;
  for (const l of leaders) {
    let hits = 0;
    for (let t = 0; t <= 1.001; t += 0.05) {
      const x = (l.x1 + (l.x2 - l.x1) * t) * raster, y = (l.y1 + (l.y2 - l.y1) * t) * raster;
      // hairline: sample a small cross around the point (the 0.5px line sits between pixels)
      if (isPaint(at(x, y)) || isPaint(at(x + 1, y)) || isPaint(at(x, y + 1)) || isPaint(at(x + 1, y + 1))) hits++;
    }
    if (hits >= 2) paintedLeaders++;
  }

  const pinPaint = pins.map(p => {
    const [rx, ry] = cssToRaster(p.css[0], p.css[1]);
    // the pin centre is the white r=3 dot by design; prove the dark r=11 disk
    // paints around each rendered position instead (8-point ring at r=6 local).
    let dark = 0;
    for (let a = 0; a < 8; a++) {
      const t = a * Math.PI / 4;
      if (isPaint(at(rx + 6 * raster * Math.cos(t), ry + 6 * raster * Math.sin(t)))) dark++;
    }
    return {label: p.label, darkRing: dark};
  });
  return {leaderCount: leaders.length, paintedLeaders, pinPaint};
}, RASTER);

console.log(JSON.stringify(result, null, 1));
await browser.close();
