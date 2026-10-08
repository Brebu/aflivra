#!/usr/bin/env node
// Probe: one batched Wikidata wbgetentities call for the imagery-class Q-ids
// (claims only) and one batched Commons imageinfo call (extmetadata) for the
// P18/P158 titles found — validating the API shapes the relay will depend on.
// Politeness: this script makes exactly 2 API calls, spaced, UA per policy.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const UA = 'Aflivra/1.0 (contact: contactretetesecrete@gmail.com)';
const dir = path.dirname(fileURLToPath(import.meta.url));
const values = JSON.parse(fs.readFileSync(path.join(dir, 'probe-qid-values.json'), 'utf8'));
const entityQids = [...new Set([
  ...Object.values(values.park.wikidata || {}).map(r => r.qid),
  ...Object.values(values.school.wikidata || {}).map(r => r.qid),
  ...Object.values(values.pharmacy.wikidata || {}).map(r => r.qid),
  ...Object.values(values.court.wikidata || {}).map(r => r.qid),
])];
const brandQids = [...new Set(Object.values(values.pharmacy['brand:wikidata'] || {}).map(r => r.qid))];
const qids = [...entityQids.slice(0, 34), ...brandQids.slice(0, 15)]; // probe sample: 49 ids, one batch
const wait = ms => new Promise(r => { setTimeout(r, ms) });

async function call(url) {
  const response = await fetch(url, {headers: {'User-Agent': UA, Accept: 'application/json'}});
  console.log('[probe] ' + decodeURIComponent(url).slice(0, 140) + '… → HTTP ' + response.status);
  if (!response.ok) { console.error(await response.text()); throw Error('HTTP ' + response.status); }
  return response.json();
}

console.log('[probe] entity Q-ids: ' + entityQids.length + ' · brand Q-ids: ' + brandQids.length + ' · probing ' + qids.length);
const params = new URLSearchParams({
  action: 'wbgetentities', ids: qids.join('|'), props: 'claims|labels', languages: 'ro|en', format: 'json',
});
const entities = await call('https://www.wikidata.org/w/api.php?' + params.toString());
const withImage = [];
for (const [qid, entity] of Object.entries(entities.entities || {})) {
  const claims = entity.claims || {};
  const p18 = claims.P18?.[0]?.mainsnak?.datavalue?.value;
  const p158 = claims.P158?.[0]?.mainsnak?.datavalue?.value;
  const label = entity.labels?.ro?.value || entity.labels?.en?.value || '';
  if (p18 || p158) withImage.push({qid, label, p18: p18 || null, p158: p158 || null});
}
console.log('[probe] Q-ids with P18/P158: ' + withImage.length + ' of ' + qids.length);
console.log(withImage.slice(0, 20).map(x => '   ' + x.qid + ' ' + x.label + ' · P18=' + x.p18 + (x.p158 ? ' · P158=' + x.p158 : '')).join('\n'));
await wait(2000);

// Commons imageinfo with extmetadata for the found titles (batch, 1 call).
const titles = [...new Set(withImage.map(x => x.p18 || x.p158).filter(Boolean))].slice(0, 25);
const infoParams = new URLSearchParams({
  action: 'query', prop: 'imageinfo', iiprop: 'url|size|extmetadata|sha1', iiurlwidth: '800',
  titles: titles.map(t => 'File:' + t).join('|'), format: 'json',
});
const info = await call('https://commons.wikimedia.org/w/api.php?' + infoParams.toString());
const pages = info.query?.pages || {};
const shape = [];
for (const page of Object.values(pages)) {
  const i = (page.imageinfo || [])[0];
  if (!i) { shape.push({title: page.title, missing: 'no imageinfo (deleted/redirect)'}); continue; }
  const ext = i.extmetadata || {};
  shape.push({
    title: page.title,
    thumburl: i.thumburl, thumbwidth: i.thumbwidth, width: i.width, height: i.height, size: i.size,
    sha1: i.sha1?.slice(0, 12),
    license: ext.LicenseShortName?.value, licenseUrl: ext.LicenseUrl?.value,
    artist: (ext.Artist?.value || '').replace(/<[^>]*>/g, '').trim().slice(0, 60),
    credit: (ext.Credit?.value || '').replace(/<[^>]*>/g, '').trim().slice(0, 40),
    objectName: (ext.ObjectName?.value || '').slice(0, 60),
  });
}
console.log('[probe] Commons imageinfo extmetadata shape (' + shape.length + ' pages):');
console.log(JSON.stringify(shape.slice(0, 10), null, 1));
fs.writeFileSync(path.join(dir, 'probe-wikidata-imagery.json'), JSON.stringify({probed: qids.length, withImage, commons: shape}, null, 1));
console.log('[probe] wrote probe-wikidata-imagery.json · API calls used: 2');
