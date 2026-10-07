// Reconstruct the #view=map pin list (merged editorial+OSM order, post-dedup) as the
// app feeds it, so the declutter algorithm can be reproduced and debugged offline.
import {chromium} from '@playwright/test';
import fs from 'node:fs';

const expl = JSON.parse(fs.readFileSync('public/places/exploration.json', 'utf8'));
const items = Array.isArray(expl) ? expl : (expl.places || expl);
const byName = new Map(items.map(it => [it.name, it]));
const editorial = [
  {id: 'peles', name: 'Castelul Peleș', lat: 45.359828, lon: 25.54302},
  {id: 'bran', name: 'Castelul Bran', lat: 45.51502, lon: 25.36726},
  {id: 'turda', name: 'Salina Turda', lat: 46.588833, lon: 23.787632},
  {id: 'delta', name: 'Delta Dunării', lat: 45.08333, lon: 29.5},
  {id: 'ateneu', name: 'Ateneul Român', lat: 44.4413, lon: 26.0972},
  {id: 'brasov', name: 'Piața Sfatului', lat: 45.642, lon: 25.589},
];

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto('http://127.0.0.1:5173/#view=map');
await page.waitForSelector('.map-workspace .romap g.map-pin');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});
const labels = await page.evaluate(() =>
  [...document.querySelectorAll('.map-workspace .romap g.map-pin')].map(g => (g.getAttribute('aria-label') || '').replace('Selectează ', '')));
await browser.close();

const pins = labels.map(name => {
  const ed = editorial.find(e => e.name === name);
  if (ed) return ed;
  const e = byName.get(name);
  if (!e) throw new Error('no source entry for ' + name);
  return {id: e.id, name, lat: e.lat, lon: e.lon};
});
fs.writeFileSync('/tmp/alfivra-pins.json', JSON.stringify(pins));
console.log('saved', pins.length, 'pins; Muzeul Colecțiilor:', JSON.stringify(pins.find(x => x.name === 'Muzeul Colecțiilor de Artă')));
