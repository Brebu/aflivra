// T1.4 probe — places corpus full offline walk (every object, every shard, every proof).
import zlib from 'node:zlib';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const root = import.meta.dirname.split('/').slice(0, -6).join('/') + '/public/places/';
const sha256 = b => createHash('sha256').update(b).digest('hex');
const readJsonGz = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const manifest = JSON.parse(fs.readFileSync(root + 'manifest.json', 'utf8'));
const failures = [];
const addFailure = (check, detail, samples, expectedClass) => failures.push({ check, detail, count: samples.length, samples: samples.slice(0, 3), expectedClass });
const changed = process.hrtime.bigint();
const stats = { records: 0, recordsChecked: 0, indexShards: 0, indexItems: 0, spatialItems: 0, proofsVerified: 0, proofsFailed: 0, orderViolations: 0 };

// ---------- 1. record chunks: full walk, shape + counts + proof ----------
const idToRecord = new Map(); // id -> {name, categories, types, lat, lon, ... , chunk, search} without tags
const catCounter = Object.fromEntries(Object.keys(manifest.categories || {}).map(c => [c, 0]));
const contactCounter = { address: 0, phone: 0, email: 0, website: 0, openingHours: 0 };
const chunkKeys = Object.keys(manifest.chunks);
const badShape = []; const badCoords = []; const badUpdatedAt = []; const badSourceUrl = []; const badCats = []; const badTypes = [];
const badLocApprox = []; const dupIds = []; const badTags = []; const badChunkRef = [];
const badSubcat = [];
const subcatLists = manifest.subcategories;
let prevSortKey = '';
const validCats = new Set(chunkKeys.length ? Object.keys(manifest.categories).filter(c => c !== 'local-all') : []);

for (const key of chunkKeys) {
  const path = root + 'records/' + key + '.json.gz';
  const raw = fs.readFileSync(path);
  let json;
  try { json = JSON.parse(zlib.gunzipSync(raw).toString('utf8')); } catch (e) { addFailure('chunk-decode', key + ': ' + e.message, [key], 'OUR-BUG'); continue; }
  const bytes = Buffer.from(zlib.gunzipSync(raw).toString('utf8'), 'utf8');
  const proof = manifest.chunks[key];
  stats.proofsVerified++;
  if (bytes.length !== proof.bytes || sha256(bytes) !== proof.sha256) { stats.proofsFailed++; addFailure('chunk-proof', key, [key], 'OUR-BUG'); }
  const items = json.items || [];
  if (!Array.isArray(items)) { addFailure('chunk-shape', key + ' missing items[]', [key], 'OUR-BUG'); continue; }
  for (const r of items) {
    stats.records++;
    const id = r.id, name = r.name;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim()) { badShape.push(id + '|' + name); continue; }
    if (idToRecord.has(id)) { dupIds.push(id); continue; }
    if (!Array.isArray(r.categories) || !r.categories.length || r.categories.some(c => !validCats.has(c))) badCats.push(id + ' [' + r.categories + ']');
    if (!Array.isArray(r.types) || r.types.some(t => !t || typeof t.category !== 'string' || typeof t.label !== 'string' || !t.category || !t.label)) badTypes.push(id);
    else {
      const cats = new Set(r.categories);
      for (const t of r.types) {
        if (!cats.has(t.category)) badTypes.push(id + ' type.cat=' + t.category + ' not in categories');
        const list = subcatLists[t.category];
        if (!list || !list.includes(t.label)) badSubcat.push(id + '|' + t.category + '|' + t.label);
      }
    }
    for (const c of r.categories) catCounter[c] = (catCounter[c] || 0) + 1;
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) badCoords.push(id + ' ' + r.lat + ',' + r.lon);
    else if (r.lat < 43 || r.lat > 49.4 || r.lon < 19.6 || r.lon > 31.2) badCoords.push(id + ' ' + r.lat + ',' + r.lon);
    if (typeof r.address !== 'string' || typeof r.city !== 'string' || typeof r.phone !== 'string' || typeof r.email !== 'string' || typeof r.website !== 'string' || typeof r.openingHours !== 'string') badShape.push(id + ' contact-field type');
    for (const k of Object.keys(contactCounter)) if (r[k]) contactCounter[k]++;
    if (typeof r.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(r.updatedAt) || !Number.isFinite(Date.parse(r.updatedAt.replace(' ', 'T')))) badUpdatedAt.push(id + ' ' + r.updatedAt);
    if (typeof r.sourceUrl !== 'string' || !/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(r.sourceUrl)) badSourceUrl.push(id + ' ' + r.sourceUrl);
    const typ = id[0];
    const approx = typ !== 'n';
    if (r.locationApproximate !== approx) badLocApprox.push(id + ' ' + r.locationApproximate + ' vs prefix ' + typ);
    if (!r.sourceUrl || !r.sourceUrl.endsWith(typ === 'n' ? 'node/' + id.slice(1) : typ === 'w' ? 'way/' + id.slice(1) : 'relation/' + id.slice(1))) badSourceUrl.push(id + ' id/sourceUrl mismatch');
    if (!r.tags || typeof r.tags !== 'object' || Array.isArray(r.tags) || Object.values(r.tags).some(v => typeof v !== 'string')) badTags.push(id);
    const sortKey = norm(name) + '\u0000' + id;
    if (sortKey < prevSortKey) { stats.orderViolations++; if (badShape.length < 100) badShape.push('ORDER ' + id); }
    else prevSortKey = sortKey;
    idToRecord.set(id, {
      name, categories: r.categories, types: r.types, lat: r.lat, lon: r.lon, address: r.address, city: r.city,
      phone: r.phone, email: r.email, website: r.website, openingHours: r.openingHours, updatedAt: r.updatedAt,
      sourceUrl: r.sourceUrl, chunk: key, search: norm(Object.values(r.tags || {}).join(' ') + ' ' + name + ' ' + (r.address || '')),
    });
    stats.recordsChecked++;
  }
}

if (badShape.length) addFailure('record-shape', badShape.length + ' malformed/order-marker records', badShape, 'OUR-BUG');
if (badCoords.length) addFailure('record-coords', badCoords.length + ' coords outside Romania bounds or non-finite', badCoords, 'data-gap');
if (badCats.length) addFailure('record-categories', badCats.length + ' invalid/unknown category values', badCats, 'OUR-BUG');
if (badTypes.length) addFailure('record-types', badTypes.length + ' malformed or category-inconsistent types', badTypes, 'OUR-BUG');
if (badSubcat.length) addFailure('record-subcategory', badSubcat.length + ' type labels missing from manifest.subcategories', badSubcat, 'OUR-BUG');
if (badUpdatedAt.length) addFailure('record-updatedAt', badUpdatedAt.length + ' unparseable updatedAt', badUpdatedAt, 'OUR-BUG');
if (badSourceUrl.length) addFailure('record-sourceUrl', badSourceUrl.length + ' invalid sourceUrl links', badSourceUrl, 'OUR-BUG');
if (badLocApprox.length) addFailure('record-locationApproximate', badLocApprox.length + ' locationApproximate vs id-prefix mismatches', badLocApprox, 'OUR-BUG');
if (badTags.length) addFailure('record-tags', badTags.length + ' tags not a string map', badTags, 'OUR-BUG');
if (dupIds.length) addFailure('record-duplicate-id', dupIds.length + ' duplicated ids across chunks', dupIds, 'OUR-BUG');

// manifest cross-counts
if (manifest.count !== stats.records) addFailure('manifest-count', `manifest.count=${manifest.count} vs walked=${stats.records}`, [manifest.count + '!=' + stats.records], 'OUR-BUG');
for (const c of Object.keys(manifest.categories)) {
  if (c === 'local-all') continue;
  if (manifest.categories[c] !== (catCounter[c] || 0)) addFailure('manifest-category-count', c + ': manifest ' + manifest.categories[c] + ' vs walked ' + (catCounter[c] || 0), [c], 'OUR-BUG');
}
if (manifest.categories['local-all'] !== stats.records) addFailure('manifest-local-all', 'local-all ' + manifest.categories['local-all'] + ' vs ' + stats.records, ['local-all'], 'OUR-BUG');
for (const k of Object.keys(contactCounter)) if (manifest.contacts[k] !== contactCounter[k]) addFailure('manifest-contacts', k + ': manifest ' + manifest.contacts[k] + ' vs walked ' + contactCounter[k], [k], 'OUR-BUG');
if (stats.records !== 178868) addFailure('expected-total', 'expected 178868 objects per PLAN, walked ' + stats.records, [String(stats.records)], 'data-gap');

// ---------- 2. index shards (name + recent) + spatial: proofs, shape, order, exact id/field parity ----------
const checkIndex = (kind, cat, label, parts, ids, order) => {
  let total = 0, cursor = 0;
  const seenIds = new Set();
  const badIdxShape = []; const badOrder = []; const badParity = []; const badChunk = []; const proofFails = [];
  for (const part of parts) {
    const path = root + part.file + '.gz';
    const raw = fs.readFileSync(path);
    let json;
    try { json = JSON.parse(zlib.gunzipSync(raw).toString('utf8')); } catch (e) { addFailure('index-decode', part.file + ': ' + e.message, [part.file], 'OUR-BUG'); continue; }
    const bytes = zlib.gunzipSync(raw);
    stats.proofsVerified++;
    if (bytes.length !== part.bytes || sha256(bytes) !== part.sha256) { stats.proofsFailed++; proofFails.push(part.file); }
    const items = json.items;
    if (!Array.isArray(items)) { addFailure('index-shape', part.file + ' missing items[]', [part.file], 'OUR-BUG'); continue; }
    if (part.start !== cursor || (part.count ?? items.length) !== items.length) addFailure('index-continuity', kind + '/' + cat + '/' + label + ' ' + part.file + ' start/count mismatch', [part.file + ' start=' + part.start + ' cursor=' + cursor + ' count=' + part.count + ' items=' + items.length], 'OUR-BUG');
    cursor += items.length;
    let prev = null;
    for (const it of items) {
      stats.indexItems++;
      total++;
      if (typeof it.id !== 'string' || typeof it.name !== 'string' || typeof it.search !== 'string' || typeof it.chunk !== 'string' || !Number.isFinite(it.lat) || !Number.isFinite(it.lon) || !Array.isArray(it.categories) || !Array.isArray(it.types)) { badIdxShape.push(it.id || part.file); continue; }
      for (const f of ['address', 'city', 'phone', 'email', 'website', 'openingHours', 'sourceUrl', 'updatedAt']) if (typeof it[f] !== 'string') { badIdxShape.push(it.id + '.' + f); break; }
      if (!manifest.chunks[it.chunk]) badChunk.push(it.id + '->' + it.chunk);
      if (!ids.has(it.id)) { badParity.push(it.id + ' not in records'); continue; }
      if (seenIds.has(it.id)) { badParity.push(it.id + ' duplicate in index'); continue; }
      seenIds.add(it.id);
      const rec = idToRecord.get(it.id);
      if (rec) {
        if (rec.chunk !== it.chunk) badParity.push(it.id + ' chunk ' + it.chunk + ' vs record ' + rec.chunk);
        else {
          // the index entry must equal the record's exported fields exactly
          const same = it.name === rec.name && it.lat === rec.lat && it.lon === rec.lon && it.address === rec.address && it.city === rec.city && it.phone === rec.phone && it.email === rec.email && it.website === rec.website && it.openingHours === rec.openingHours && it.updatedAt === rec.updatedAt && it.sourceUrl === rec.sourceUrl && it.search === rec.search && it.categories.join(',') === rec.categories.join(',') && JSON.stringify(it.types) === JSON.stringify(rec.types);
          if (!same) badParity.push(it.id + ' field mismatch vs record');
        }
      }
      if (prev) {
        const ok = order === 'name' ? (norm(it.name) + '\u0000' + it.id) >= (norm(prev.name) + '\u0000' + prev.id) : String(it.updatedAt) <= String(prev.updatedAt);
        if (!ok) badOrder.push(cat + '/' + label + ' ' + prev.id + ' < ' + it.id);
      }
      prev = it;
    }
    stats.indexShards++;
  }
  if (proofFails.length) addFailure('index-proof', proofFails.length + ' shards failing sha256/bytes proof', proofFails, 'OUR-BUG');
  if (badIdxShape.length) addFailure('index-shape[' + kind + '/' + cat + '/' + label + ']', badIdxShape.length + ' malformed index entries', badIdxShape, 'OUR-BUG');
  if (badChunk.length) addFailure('index-chunk[' + cat + ']', badChunk.length + ' chunk refs missing from manifest.chunks', badChunk, 'OUR-BUG');
  if (badOrder.length) addFailure('index-order[' + cat + '/' + label + ']', badOrder.length + ' ordering violations', badOrder, 'OUR-BUG');
  if (badParity.length) addFailure('index-parity[' + cat + '/' + label + ']', badParity.length + ' id/field mismatches vs records', badParity, 'OUR-BUG');
  if (total !== ids.size) addFailure('index-total[' + cat + '/' + label + ']', kind + ' total ' + total + ' vs distinct record ids ' + ids.size, [total + '!=' + ids.size], 'OUR-BUG');
};

for (const cat of Object.keys(manifest.indices)) {
  const ids = new Set();
  for (const [id, rec] of idToRecord) if (cat === 'local-all' || rec.categories.includes(cat)) ids.add(id);
  checkIndex('name', cat, 'name', manifest.indices[cat].name, ids, 'name');
  checkIndex('recent', cat, 'recent', manifest.indices[cat].recent, ids, 'recent');
}

// spatial: every object exactly once across all cells
{
  const seen = new Set(); const badSpatial = []; const proofFails = [];
  for (const cell of manifest.spatial) {
    for (const part of cell.parts) {
      const path = root + part.file + '.gz';
      const raw = fs.readFileSync(path);
      let json;
      try { json = JSON.parse(zlib.gunzipSync(raw).toString('utf8')); } catch (e) { addFailure('spatial-decode', part.file, [part.file], 'OUR-BUG'); continue; }
      const bytes = zlib.gunzipSync(raw);
      stats.proofsVerified++;
      if (bytes.length !== part.bytes || sha256(bytes) !== part.sha256) { stats.proofsFailed++; proofFails.push(part.file); }
      for (const it of json.items || []) {
        stats.spatialItems++;
        if (!idToRecord.has(it.id) || seen.has(it.id)) badSpatial.push(it.id);
        else {
          seen.add(it.id);
          const rec = idToRecord.get(it.id);
          if (Math.floor(rec.lat) !== cell.lat || Math.floor(rec.lon) !== cell.lon) badSpatial.push(it.id + ' wrong cell ' + cell.lat + '_' + cell.lon + ' vs ' + rec.lat + ',' + rec.lon);
        }
      }
    }
  }
  if (proofFails.length) addFailure('spatial-proof', proofFails.length + ' cells failing proof', proofFails, 'OUR-BUG');
  if (badSpatial.length) addFailure('spatial-parity', badSpatial.length + ' unknown/duplicated/misplaced ids', badSpatial, 'OUR-BUG');
  if (seen.size !== idToRecord.size) addFailure('spatial-coverage', 'spatial covers ' + seen.size + ' of ' + idToRecord.size, [seen.size + '/' + idToRecord.size], 'OUR-BUG');
}

// ---------- 3. cities.json ----------
{
  const raw = fs.readFileSync(root + 'cities.json');
  const json = JSON.parse(raw.toString('utf8'));
  const badCities = json.items.filter(c => typeof c.name !== 'string' || !c.name || !Number.isFinite(c.lat) || !Number.isFinite(c.lon) || typeof c.type !== 'string' || typeof c.county !== 'string' || typeof c.sourceUrl !== 'string');
  const bytes = Buffer.from(raw);
  stats.proofsVerified++;
  if (bytes.length !== manifest.cities.bytes || sha256(bytes) !== manifest.cities.sha256) { stats.proofsFailed++; addFailure('cities-proof', 'cities.json proof mismatch', ['cities.json'], 'OUR-BUG'); }
  if (badCities.length) addFailure('cities-shape', badCities.length + ' malformed city entries', badCities.map(c => c.name), 'OUR-BUG');
}

const ms = Number(process.hrtime.bigint() - changed) / 1e6;
console.log(JSON.stringify({
  probe: 'places-full-walk',
  objects: stats.records, checked: stats.recordsChecked,
  indexShards: stats.indexShards, indexItems: stats.indexItems, spatialItems: stats.spatialItems,
  proofsVerified: stats.proofsVerified, proofsFailed: stats.proofsFailed,
  orderViolations: stats.orderViolations,
  elapsedMs: Math.round(ms),
  failures,
}, null, 1));
