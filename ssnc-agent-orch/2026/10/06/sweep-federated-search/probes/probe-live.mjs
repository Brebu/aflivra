// T1.4 probe — weather / news(stiri) / films / siruta / directories / cinema / events / transport / lawyers / stories
// snapshot shapes vs. the fields the UI actually reads (app/live-data.tsx, weather-workspace.tsx,
// experience.tsx, record-workspace.tsx, cinema/events/transit/lawyers/stories workspaces). Offline.
import zlib from 'node:zlib';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = import.meta.dirname.split('/').slice(0, -6).join('/');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const readGz = p => zlib.gunzipSync(fs.readFileSync(p));
const failures = [];
const addFailure = (corpus, check, detail, samples, cls) => failures.push({ corpus, check, detail, count: samples.length, samples: samples.slice(0, 3), expectedClass: cls });
const validUrl = u => { try { const x = new URL(String(u)); return ['http:', 'https:'].includes(x.protocol) && !x.username && !x.password; } catch { return false; } };
const counts = {};

// ---------- seed corpora ----------
const seed = JSON.parse(fs.readFileSync(repo + '/lib/live/seed.json', 'utf8'));
const server = JSON.parse(fs.readFileSync(repo + '/lib/live/server-seed.json', 'utf8'));
const demo = JSON.parse(fs.readFileSync(repo + '/app/demo-data.json', 'utf8'));

// 1. weather ANM (seed {data:{...}} + demo flat {observedAt,sourceUrl,stations}):
// WeatherStations reads stations[].{lat,lon,name,temperature,humidity,sky,wind,observedAtText}; s.details is optional and guarded
for (const [name, payload] of [['seed:weather', seed.weather?.data], ['demo:weather', demo.weather]]) {
  const stations = payload?.stations || [];
  counts[name] = stations.length;
  const bad = [], badCoords = [], windMissing = []; let skyNull = 0;
  for (const s of stations) {
    if (typeof s.name !== 'string' || !s.name.trim()) bad.push('name:' + s.name);
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || s.lat < 43 || s.lat > 49.4 || s.lon < 19.6 || s.lon > 31.2) badCoords.push(s.name + ' ' + s.lat + ',' + s.lon);
    if (s.temperature !== null && s.temperature !== undefined && !Number.isFinite(s.temperature)) bad.push(s.name + '.temperature');
    if (s.humidity !== null && s.humidity !== undefined && !Number.isFinite(s.humidity)) bad.push(s.name + '.humidity');
    if (s.wind === null || s.wind === undefined) windMissing.push(s.name); else if (typeof s.wind !== 'string') bad.push(s.name + '.wind');
    if (s.sky === null || s.sky === undefined) skyNull++;
    if (typeof s.observedAtText !== 'string' || !s.observedAtText) bad.push(s.name + '.observedAtText');
  }
  if (!stations.length) addFailure(name, 'empty', 'no stations', ['stations'], 'OUR-BUG');
  if (bad.length) addFailure(name, 'station-shape', bad.length + ' field/type violations', bad, 'OUR-BUG');
  // demo-data.json weather is DORMANT: page.tsx reads only demo.bnr and demo.company from it —
  // the demo weather corpus carries no lat/lon by design; no component renders it
  const badDemoCoords = name === 'demo:weather' ? stations.filter(s => s.lat !== undefined && (!Number.isFinite(s.lat) || !Number.isFinite(s.lon))).map(s => s.name) : badCoords;
  if (badCoords.length && name !== 'demo:weather') addFailure(name, 'station-coords', badCoords.length + ' stations outside Romania bounds', badCoords, 'data-gap');
  if (badDemoCoords.length) addFailure(name, 'station-coords', badDemoCoords.length + ' demo stations with invalid coords', badDemoCoords, 'data-gap');
  if (name === 'demo:weather' && stations.length && stations.every(s => s.lat === undefined)) addFailure(name, 'dormant-corpus', 'demo weather stations unused by any component (page.tsx consumes only demo.bnr/demo.company); no coords by design', ['lat/lon absent'], 'data-gap');
  if (!payload?.observedAt || !payload?.sourceUrl || !Number.isFinite(Date.parse(payload?.observedAt))) addFailure(name, 'observation-meta', 'observedAt/sourceUrl shape', [payload?.observedAt], 'OUR-BUG');
  if (windMissing.length) addFailure(name, 'wind-null', windMissing.length + ' stations without wind text (ANM omission; renders blank)', windMissing, 'source-side');
  if (skyNull / Math.max(1, stations.length) > 0.5) addFailure(name, 'sky-coverage', Math.round(skyNull / stations.length * 100) + '% stations without sky text (informational)', ['sky'], 'source-side');
}

// 2. bnr (seed {data:{rates}} + demo flat {rates}): money view reads rates[].{currency,value,multiplier}, publishedAt
for (const [name, payload] of [['seed:bnr', seed.bnr?.data], ['demo:bnr', demo.bnr]]) {
  const rates = payload?.rates || [];
  counts[name] = rates.length;
  const bad = [];
  for (const r of rates) {
    if (typeof r.currency !== 'string' || !/^[A-Z]{3}$/.test(r.currency)) bad.push('currency:' + r.currency);
    if (!/^\d+(\.\d+)?$/.test(String(r.value ?? ''))) bad.push(r.currency + '.value=' + r.value);
    if (!['1', '100'].includes(String(r.multiplier))) bad.push(r.currency + '.multiplier=' + r.multiplier);
  }
  if (!rates.length) addFailure(name, 'empty', 'no rates', ['rates'], 'OUR-BUG');
  if (bad.length) addFailure(name, 'rate-shape', bad.length + ' violations', bad, 'OUR-BUG');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload?.publishedAt || ''))) addFailure(name, 'publishedAt', String(payload?.publishedAt), ['publishedAt'], 'OUR-BUG');
}

// 3. feeds (7 rss kinds + AFIR): FeedCards/ContentReader read id,title,url,publishedAt,summary,content,media
const feedKinds = ['munca', 'stiri', 'sanatate', 'educatie', 'justitie', 'energie', 'transport'];
for (const kind of feedKinds) {
  const f = server['feed:' + kind];
  counts['feed:' + kind] = f?.data?.items?.length ?? 0;
  if (!f || !Array.isArray(f.data.items) || !f.data.items.length) { addFailure('feed:' + kind, 'empty', 'no seeded items', ['items'], 'data-gap'); continue; }
  const bad = [], badMedia = [], dup = new Set(); let leanCopies = 0;
  for (const it of f.data.items) {
    if (typeof it.id !== 'string' || !it.id) bad.push('id');
    if (typeof it.title !== 'string' || !it.title.trim()) bad.push('title:' + it.id);
    if (!validUrl(it.url)) bad.push('url:' + String(it.url).slice(0, 60));
    if (it.publishedAt !== null && it.publishedAt !== undefined && (typeof it.publishedAt !== 'string' || !Number.isFinite(Date.parse(it.publishedAt)))) bad.push('publishedAt:' + it.publishedAt);
    // UI guards both ({item.summary&&...}, item.media?.find) — absence degrades honestly but the seed
    // copy then renders no summary/cover while the live parser would produce them
    if (it.summary === undefined && it.content === undefined && it.media === undefined) leanCopies++;
    else {
      if (typeof it.summary !== 'string') bad.push('summary:' + it.id);
      if (typeof it.content !== 'string') bad.push('content:' + it.id);
      for (const m of it.media || []) if (!validUrl(m.url)) badMedia.push(m.url?.slice(0, 60));
    }
    if (dup.has(it.id)) bad.push('dup:' + it.id); dup.add(it.id);
  }
  if (bad.length) addFailure('feed:' + kind, 'item-shape', bad.length + ' violations', bad, 'OUR-BUG');
  if (badMedia.length) addFailure('feed:' + kind, 'media-url', badMedia.length + ' invalid media urls', badMedia, 'OUR-BUG');
  if (leanCopies) addFailure('feed:' + kind, 'lean-seed-copy', leanCopies + ' of ' + f.data.items.length + ' seeded items lack summary/content/media (live parse produces them; UI guards render honest)', ['summary/content/media'], 'data-gap');
}
{
  const f = server['feed:agricultura'];
  counts['feed:agricultura'] = f?.data?.items?.length ?? 0;
  const bad = [];
  for (const it of f?.data?.items || []) {
    if (typeof it.title !== 'string' || !it.title.trim() || !validUrl(it.url) || typeof it.id !== 'string' || !it.id) bad.push(it.id || it.title);
    if (it.publishedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(it.publishedAt)) bad.push('publishedAt:' + it.publishedAt);
    if (it.summary !== undefined || it.content !== undefined) bad.push('AFIR item carries summary/content');
  }
  if (!f?.data?.items?.length) addFailure('feed:agricultura', 'empty', 'no seeded AFIR items', ['items'], 'data-gap');
  if (bad.length) addFailure('feed:agricultura', 'item-shape', bad.length + ' violations', bad, 'OUR-BUG');
}

// 4. films: ContentReader films facts read title, url, date, media, directors/cast/genres/... (all optional)
{
  const f = server['films'];
  const items = f?.data?.items || [];
  counts['films'] = items.length;
  const bad = [], badMedia = [], badArrays = [];
  const arrayFields = ['directors', 'cast', 'genres', 'runtime', 'languages', 'countries', 'screenwriters', 'producers', 'production', 'cinematographers', 'composers', 'releaseDates'];
  for (const it of items) {
    if (typeof it.id !== 'string' || !it.id || typeof it.title !== 'string' || !it.title.trim()) bad.push(it.id || 'title');
    if (!validUrl(it.url)) bad.push('url:' + it.id);
    if (it.date !== null && !Number.isFinite(Date.parse(it.date))) bad.push('date:' + it.id);
    for (const m of it.media || []) if (!validUrl(m.url)) badMedia.push(it.id);
    for (const k of arrayFields) if (it[k] !== undefined && (!Array.isArray(it[k]) || it[k].some(v => typeof v !== 'string'))) badArrays.push(it.id + '.' + k);
  }
  if (bad.length) addFailure('films', 'item-shape', bad.length + ' violations', bad, 'OUR-BUG');
  if (badMedia.length) addFailure('films', 'media-url', badMedia.length + ' invalid media urls', badMedia, 'OUR-BUG');
  if (badArrays.length) addFailure('films', 'array-fields', badArrays.length + ' non-string-list fields', badArrays, 'OUR-BUG');
}

// 5. siruta: LocalitySearch reads id,name,county,parent,postal,environment; details optional (MetadataFields data={x.details||x})
{
  const s = server['siruta'];
  const items = s?.data?.items || [];
  counts['siruta'] = items.length;
  const bad = [], noCounty = []; let noDetails = 0;
  for (const x of items) {
    if (typeof x.id !== 'string' || !x.id || typeof x.name !== 'string' || !x.name.trim()) bad.push(x.id || 'name');
    if (!x.county) noCounty.push(x.name);
    if (x.parent !== undefined && typeof x.parent !== 'string') bad.push(x.name + '.parent');
    if (x.postal !== undefined && typeof x.postal !== 'string') bad.push(x.name + '.postal');
    if (x.environment !== 'Urban' && x.environment !== 'Rural') bad.push(x.name + '.environment=' + x.environment);
    if (x.details === undefined) noDetails++;
    else if (!x.details || typeof x.details !== 'object') bad.push(x.name + '.details');
  }
  if (bad.length) addFailure('siruta', 'item-shape', bad.length + ' violations', bad, 'OUR-BUG');
  if (noCounty.length) addFailure('siruta', 'county-coverage', noCounty.length + ' localities without county label', noCounty, 'data-gap');
  if (noDetails === items.length && items.length) addFailure('siruta', 'details-dropped', 'seed copy drops per-locality details (parseSiruta produces them; UI falls back to the row itself)', ['details'], 'data-gap');
  if (!s?.data?.period) addFailure('siruta', 'period', 'missing period', ['period'], 'OUR-BUG');
}

// 6. directory CNAS x3 (object records; RecordBrowser title chain) + schools (compact arrays)
for (const kind of ['health', 'pharmacies', 'hospitals']) {
  const d = server['directory:' + kind]?.data;
  counts['directory:' + kind] = d?.records?.length ?? 0;
  const bad = [], genericTitles = [];
  for (const r of d?.records || []) {
    if (typeof r !== 'object' || Array.isArray(r)) { bad.push('array-record'); continue; }
    const title = r['Nume furnizor'] || r['Denumire lunga unitate'] || r['Denumire PJ'] || Object.entries(r).find(([k]) => /denum|furnizor/i.test(k))?.[1];
    if (!title || !String(title).trim()) genericTitles.push(JSON.stringify(r).slice(0, 80));
  }
  if (!d?.records?.length) addFailure('directory:' + kind, 'empty', 'no records', ['records'], 'data-gap');
  if (bad.length) addFailure('directory:' + kind, 'record-type', bad.length + ' non-object records', bad, 'OUR-BUG');
  if (genericTitles.length) addFailure('directory:' + kind, 'title-fallback', genericTitles.length + ' records resolve no title (render "Înregistrare publică")', genericTitles, 'data-gap');
  if (!d?.fields?.length || !d.title || !d.period || !d.note || !Number.isInteger(d.total) || d.total !== d.records.length) addFailure('directory:' + kind, 'envelope', 'title/period/note/fields/total envelope', [d?.total + ' vs ' + d?.records?.length], 'OUR-BUG');
  for (const k of d?.fields || []) if (typeof k !== 'string' || !k.trim()) addFailure('directory:' + kind, 'fields', 'empty field name', [k], 'OUR-BUG');
  if (d && !d.records.every(r => Object.keys(r).every(k => d.fields.includes(k)))) addFailure('directory:' + kind, 'fields-parity', 'records carry keys outside the published fields list', ['fields'], 'OUR-BUG');
}
{
  const d = server['directory:schools']?.data;
  counts['directory:schools'] = d?.records?.length ?? 0;
  const badLen = [], noTitle = [], badCounty = [], numericTyped = {};
  for (const r of d?.records || []) {
    if (!Array.isArray(r)) { badLen.push('non-array'); continue; }
    if (r.length > d.fields.length) badLen.push('len ' + r.length + '>' + d.fields.length);
    const obj = Object.fromEntries(d.fields.slice(0, r.length).map((f, i) => [f, r[i]]));
    if (!obj['Denumire lunga unitate'] || !String(obj['Denumire lunga unitate']).trim()) noTitle.push(String(obj['Judet PJ']) || r.slice(0, 2).join('/'));
    if (!obj['Judet PJ'] || !obj['Localitate unitate']) badCounty.push(obj['Denumire lunga unitate']?.slice(0, 40));
    for (const f of ['Telefon', 'Cod postal', 'Numar']) { const v = obj[f]; if (typeof v === 'number') numericTyped[f] = (numericTyped[f] || 0) + 1; }
  }
  if (d?.compact !== true) addFailure('directory:schools', 'compact-flag', 'seed schools must be compact', [String(d?.compact)], 'OUR-BUG');
  if (badLen.length) addFailure('directory:schools', 'record-length', badLen.length + ' rows longer than fields', badLen, 'OUR-BUG');
  if (noTitle.length) addFailure('directory:schools', 'title-fallback', noTitle.length + ' schools without denumire', noTitle, 'data-gap');
  if (badCounty.length) addFailure('directory:schools', 'geo-fields', badCounty.length + ' schools missing Judet PJ / Localitate unitate', badCounty, 'data-gap');
  const numericKeys = Object.keys(numericTyped);
  if (numericKeys.length) addFailure('directory:schools', 'xlsx-typed-numbers', 'source XLSX types phone/postal/street-number as numbers (leading zeros lost: ' + numericKeys.map(k => k + '=' + numericTyped[k]).join(', ') + ')', numericKeys, 'source-side');
}

// 7. cinema sites (server-seed cinema:<code>:<date> + public/cinema/cinemas.json registry)
{
  const cinemas = JSON.parse(fs.readFileSync(repo + '/public/cinema/cinemas.json', 'utf8'));
  counts['cinemas-registry'] = cinemas.items.length;
  const badRegistry = cinemas.items.filter(c => !c.externalCode || typeof c.name !== 'string' || !c.name || !c.address || Number.isFinite(c.latitude) === false || Number.isFinite(c.longitude) === false);
  if (badRegistry.length) addFailure('cinema', 'registry-shape', badRegistry.length + ' malformed cinema registry entries', badRegistry.map(c => c.name), 'OUR-BUG');
  const keys = Object.keys(server).filter(k => k.startsWith('cinema:'));
  counts['cinema-sites'] = keys.length;
  const bad = [], registry = new Map(cinemas.items.map(c => [String(c.externalCode), c]));
  for (const k of keys) {
    const d = server[k].data;
    if (!d || !Array.isArray(d.films) || !Number.isInteger(d.filmCount) || !Number.isInteger(d.eventCount) || !d.cinema || !d.date) bad.push(k);
    else {
      if (d.filmCount !== d.films.length) bad.push(k + ' filmCount ' + d.filmCount + ' vs ' + d.films.length);
      for (const f of d.films) if (typeof f.id !== 'string' || !f.id || typeof f.title !== 'string' || !f.title) bad.push(k + ' film ' + f.id);
      const code = k.split(':')[1];
      if (!registry.has(code)) bad.push(k + ' code ' + code + ' not in registry');
    }
  }
  if (keys.length !== cinemas.items.length) addFailure('cinema', 'seed-vs-registry-count', 'seeded sites ' + keys.length + ' vs registry ' + cinemas.items.length, [keys.length + '/' + cinemas.items.length], 'data-gap');
  if (bad.length) addFailure('cinema', 'site-shape', bad.length + ' violations', bad, 'OUR-BUG');
}

// 8. events:odeon — parsed shape (id,title,content,start,end,url,media,sourceName), start-sorted
{
  const d = server['events:odeon']?.data;
  const items = d?.items || [];
  counts['events:odeon'] = items.length;
  const bad = [];
  for (const it of items) {
    if (typeof it.id !== 'string' || !it.id || typeof it.title !== 'string' || !it.title.trim()) bad.push(it.id || 'title');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(it.start || ''))) bad.push('start:' + it.id + '=' + it.start);
    if (it.end !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(it.end || ''))) bad.push('end:' + it.id);
    if (!validUrl(it.url)) bad.push('url:' + it.id);
    if (!Array.isArray(it.media)) bad.push('media:' + it.id);
    if (typeof it.content !== 'string') bad.push('content:' + it.id);
  }
  if (bad.length) addFailure('events:odeon', 'item-shape', bad.length + ' violations', bad, 'OUR-BUG');
  if (!items.every((x, i) => !i || String(items[i - 1].start) <= String(x.start))) addFailure('events:odeon', 'start-sorted', 'items out of start order', ['ordered'], 'OUR-BUG');
}

// 9. transport (GTFS seed): stops {id,name,description?,lat,lon}; routes {id,name,longName,operator,type};
// per-route details/file are optional (parseTransport produces them; MetadataFields guards absence)
{
  const d = server['transport']?.data;
  const stops = d?.stops || [], routes = d?.routes || [];
  counts['transport-stops'] = stops.length; counts['transport-routes'] = routes.length;
  const bad = [], badCoords = [];
  for (const s of stops) {
    if (typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || !s.name) bad.push(s.id || 'stop');
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || s.lat <= 40 || s.lat >= 50 || s.lon <= 20 || s.lon >= 31) badCoords.push(s.id);
    if (s.details !== undefined && typeof s.details !== 'object') bad.push(s.id + '.details');
    if (s.description !== undefined && typeof s.description !== 'string') bad.push(s.id + '.description');
  }
  const leanRoutes = routes.filter(r => !r.details && !r.file).length;
  for (const r of routes) if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name) bad.push(r.id || 'route');
  if (bad.length) addFailure('transport', 'shape', bad.length + ' violations', bad, 'OUR-BUG');
  if (badCoords.length) addFailure('transport', 'coords', badCoords.length + ' stops outside bounds', badCoords, 'OUR-BUG');
  if (stops.length < 10 || routes.length < 10) addFailure('transport', 'coverage', 'GTFS below parse minimums', [stops.length + '/' + routes.length], 'data-gap');
  if (leanRoutes === routes.length && routes.length) addFailure('transport', 'lean-seed-copy', 'seed copy drops route details/file (parseTransport produces them)', ['details/file'], 'data-gap');
  const manifest = JSON.parse(fs.readFileSync(repo + '/public/transit/manifest.json', 'utf8'));
  const zip = fs.readFileSync(repo + '/public/transit/TPBI_GTFS.zip');
  if (zip.length !== manifest.bytes || sha256(zip) !== manifest.sha256) addFailure('transport', 'zip-proof', 'GTFS zip proof mismatch', ['TPBI_GTFS.zip'], 'OUR-BUG');
  const manifestRoutes = manifest.routes && typeof manifest.routes === 'object' ? Object.entries(manifest.routes) : [];
  const routeProofFails = [], routeFileMissing = [];
  for (const [routeId, proof] of manifestRoutes) {
    const p = repo + '/public/transit/' + proof.file + '.gz';
    if (!fs.existsSync(p)) { routeFileMissing.push(routeId); continue; }
    const bytes = readGz(p);
    if (bytes.length !== proof.bytes || sha256(bytes) !== proof.sha256) routeProofFails.push(routeId);
  }
  const netIds = new Set(routes.map(r => r.id));
  const manifestIds = new Set(manifestRoutes.map(([id]) => id));
  const netNotInManifest = routes.filter(r => !manifestIds.has(r.id)).map(r => r.id);
  const manifestNotInNet = routes.length === 0 ? [] : [...manifestIds].filter(id => !netIds.has(id));
  if (routeFileMissing.length) addFailure('transport', 'route-file-missing', routeFileMissing.length + ' manifest route files missing', routeFileMissing, 'OUR-BUG');
  if (routeProofFails.length) addFailure('transport', 'route-file-proof', routeProofFails.length + ' route file proof failures', routeProofFails, 'OUR-BUG');
  if (netNotInManifest.length) addFailure('transport', 'seed-extra-routes', netNotInManifest.length + ' seeded routes absent from manifest proofs', netNotInManifest, 'OUR-BUG');
  if (manifestNotInNet.length) addFailure('transport', 'manifest-extra-routes', manifestNotInNet.length + ' manifest routes absent from the seeded network', manifestNotInNet, 'OUR-BUG');
}

// 10. lawyers: route normalizes paragraphs always; seed may carry raw HTML (sanitized server-side)
{
  const k = Object.keys(server).find(k => k.startsWith('lawyers:'));
  const d = server[k]?.data;
  const items = d?.items || [];
  counts['lawyers'] = items.length;
  const bad = [];
  for (const it of items) {
    if (typeof it.id !== 'string' || !it.id || typeof it.name !== 'string' || !it.name.trim() || typeof it.title !== 'string') bad.push(it.id || 'name');
    if (!validUrl(it.url)) bad.push('url:' + it.id);
    if (!Array.isArray(it.paragraphs)) bad.push('paragraphs:' + it.id);
    else if (it.paragraphs.some(p => typeof p !== 'string')) bad.push(it.id + '.paragraphs-type');
  }
  if (!Number.isInteger(d?.total) || d.total < items.length || !Number.isInteger(d?.page) || !Number.isInteger(d?.pages)) bad.push('envelope total/page/pages');
  if (bad.length) addFailure('lawyers', 'item-shape', bad.length + ' violations', bad, 'OUR-BUG');
}

// 11. stories corpus: full walk (233 index items + every text file proof + parseStory contract)
{
  const idx = JSON.parse(readGz(repo + '/public/stories/index.json.gz').toString('utf8'));
  counts['stories-index'] = idx.items.length;
  const bad = [], missingFile = [], proofFails = [];
  for (const it of idx.items) {
    if (typeof it.id !== 'string' || !it.id || typeof it.title !== 'string' || !it.title.trim()) bad.push(it.id || it.title);
    if (!validUrl(it.url)) bad.push('url:' + it.id);
    if (!Number.isInteger(it.characters) || it.characters <= 40) bad.push('characters:' + it.id);
    if (!it.file) { missingFile.push(it.id); continue; }
    const p = repo + '/public/stories/' + it.file + '.gz';
    if (!fs.existsSync(p)) { missingFile.push(it.id + ' ' + it.file); continue; }
    const raw = fs.readFileSync(p);
    const bytes = readGz(p);
    if (it.proof && (bytes.length !== it.proof.bytes || sha256(bytes) !== it.proof.sha256)) proofFails.push(it.id);
  }
  if (bad.length) addFailure('stories', 'index-shape', bad.length + ' malformed index items', bad, 'OUR-BUG');
  if (missingFile.length) addFailure('stories', 'text-file', missingFile.length + ' missing story texts', missingFile, 'OUR-BUG');
  if (proofFails.length) addFailure('stories', 'text-proof', proofFails.length + ' sha256/bytes proof failures', proofFails, 'OUR-BUG');
}

// 12. forecast: every variable the API requests must have a Romanian label in weather-workspace (raw-key leak check)
{
  const temp = mkdtempSync(join(tmpdir(), 'aflivra-t14-forecast-'));
  const load = async (name, path, transform = s => s) => {
    const js = ts.transpileModule(transform(fs.readFileSync(join(repo, path), 'utf8')), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
      .outputText.replace(/from '(\.\/[^']+)'/g, (_, p) => "from '" + p + ".mjs'")
      .replace(/from '(@\/lib\/http-retry\.mjs)'/, (_, p) => "from '" + join(repo, 'lib/http-retry.mjs') + "'");
    writeFileSync(join(temp, name + '.mjs'), js);
    return import(pathToFileURL(join(temp, name + '.mjs')));
  };
  const forecast = await load('forecast', 'lib/live/forecast.ts');
  const workspaceSrc = fs.readFileSync(join(repo, 'app/weather-workspace.tsx'), 'utf8');
  const labelKeys = new Set([...workspaceSrc.matchAll(/([a-z_0-9]+):'[^']+'/g)].map(m => m[1]));
  const all = [...forecast.currentVariables, ...forecast.hourlyVariables, ...forecast.dailyVariables];
  const unlabeled = all.filter(k => !labelKeys.has(k));
  if (unlabeled.length) addFailure('forecast', 'raw-label-leak', 'Open-Meteo variables rendered with the raw key (no Romanian label): ' + unlabeled.join(', '), unlabeled, 'OUR-BUG');
  // parseForecast round-trip: requested variables -> every produced key is labeled for the UI table
  const payload = { latitude: 44.42, longitude: 26.1, elevation: 90, timezone: 'Europe/Bucharest', current_units: {}, hourly_units: { temperature_2m: '°C' }, daily_units: { weather_code: 'wmo' }, current: { time: 1759706400, interval: 900 }, hourly: { time: [1759706400] }, daily: { time: [1759706400] } };
  for (const k of forecast.currentVariables) payload.current[k] = 1;
  for (const k of forecast.hourlyVariables) payload.hourly[k] = forecast.hourlyVariables.includes(k) ? [1] : [1];
  for (const k of forecast.dailyVariables) payload.daily[k] = forecast.dailyVariables.includes(k) ? [1] : [1];
  payload.hourly.sunrise = [1759706400]; payload.daily.sunrise = [1759800000]; payload.daily.sunset = [1759843200];
  const parsed = forecast.parseForecast(JSON.stringify(payload));
  const d = parsed.data;
  const problems = [];
  if (!d.current || !d.hourly.length || !d.daily.length || !d.hourlyUnits || !d.dailyUnits || d.timezone !== 'Europe/Bucharest') problems.push('envelope');
  if (Object.keys(d.hourly[0]).some(k => k !== 'time' && !forecast.hourlyVariables.includes(k))) problems.push('hourly extra keys');
  if (Object.keys(d.daily[0]).some(k => k !== 'time' && !forecast.dailyVariables.includes(k))) problems.push('daily extra keys');
  if (problems.length) addFailure('forecast', 'parse-contract', problems.join(','), problems, 'OUR-BUG');
}

console.log(JSON.stringify({ probe: 'live-shapes', counts, failures }, null, 1));