// T1.4 probe — CKAN catalog: category shapes, dataset fields, seed pools, integrity proofs, raw-field leaks.
import zlib from 'node:zlib';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const repo = import.meta.dirname.split('/').slice(0, -6).join('/');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const failures = [];
const addFailure = (check, detail, samples, cls) => failures.push({ check, detail, count: samples.length, samples: samples.slice(0, 3), expectedClass: cls });
const stats = { inventoryItems: 0, datasetFiles: 0, seedEntries: 0, proofsVerified: 0, proofsFailed: 0, proofsMissingFile: 0 };
const validCategories = ['local', 'bani', 'firme', 'mediu', 'transport', 'sanatate', 'educatie', 'cultura', 'munca', 'justitie', 'energie', 'agricultura', 'filme', 'stiri'];
const catalogCategoryNames = { local: 'Localități', bani: 'Bani & economie', firme: 'Firme', mediu: 'Mediu & vreme', transport: 'Transport', sanatate: 'Sănătate', educatie: 'Educație', cultura: 'Cultură', munca: 'Muncă', justitie: 'Justiție', energie: 'Energie', agricultura: 'Agricultură', filme: 'Filme', stiri: 'Știri & instituții' };

// ---------- 1. every registered snapshot-transport proof ----------
const transport = JSON.parse(fs.readFileSync(repo + '/public/data/snapshot-transport.json', 'utf8'));
const diskWithoutProof = [];
for (const p of transport.items) {
  const path = repo + '/public' + p.file.replace('.json.gz', p.file.endsWith('.json.gz') ? '' : '');
  const physical = repo + '/public' + p.file;
  const logical = repo + '/public' + p.path;
  const stored = fs.existsSync(physical) ? physical : fs.existsSync(logical) ? logical : null;
  if (!stored) { stats.proofsMissingFile++; addFailure('proof-missing-file', p.path, [p.path], 'OUR-BUG'); continue; }
  const gz = fs.readFileSync(stored);
  stats.proofsVerified++;
  if (p.storedBytes !== undefined && (gz.length !== p.storedBytes || sha256(gz) !== p.storedSha256)) { stats.proofsFailed++; addFailure('proof-stored', p.file, [p.file], 'OUR-BUG'); continue; }
  const bytes = stored.endsWith('.gz') ? zlib.gunzipSync(gz) : gz;
  if (bytes.length !== p.bytes || sha256(bytes) !== p.sha256) { stats.proofsFailed++; addFailure('proof-content', p.path, [p.path], 'OUR-BUG'); }
}
// reverse: every dataset file on disk must have a proof
const datasetFiles = fs.readdirSync(repo + '/public/catalog/datasets');
for (const f of datasetFiles) {
  const path = '/catalog/datasets/' + f.replace('.gz', '');
  if (!transport.items.some(p => p.path === path)) diskWithoutProof.push(path);
}
if (diskWithoutProof.length) addFailure('proof-unregistered', diskWithoutProof.length + ' dataset files without a registered proof', diskWithoutProof, 'OUR-BUG');

// ---------- 2. inventory: shape + category distribution + unique ids ----------
const inventory = JSON.parse(zlib.gunzipSync(fs.readFileSync(repo + '/public/catalog/index.json.gz')).toString('utf8'));
const catDist = {}; const alte = [];
const badShape = []; const badCats = []; const badTitle = []; const noFormats = []; const dupIds = [];
const ids = new Set();
for (const r of inventory.items) {
  stats.inventoryItems++;
  if (typeof r.id !== 'string' || !r.id || ids.has(r.id)) { dupIds.push(r.id); continue; }
  ids.add(r.id);
  if (typeof r.title !== 'string' || !r.title.trim()) badTitle.push(r.id);
  if (typeof r.title === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.title.trim())) badTitle.push(r.id + ' title is a UUID');
  if (typeof r.organization !== 'string' || !r.organization) badShape.push(r.id + '.organization');
  if (typeof r.modified !== 'string' || !Number.isFinite(Date.parse(r.modified))) badShape.push(r.id + '.modified=' + r.modified);
  if (typeof r.license !== 'string' || !r.license) badShape.push(r.id + '.license');
  if (!Number.isInteger(r.resourceCount) || r.resourceCount < 1) badShape.push(r.id + '.resourceCount=' + r.resourceCount);
  if (!Array.isArray(r.formats) || !r.formats.length || r.formats.some(f => typeof f !== 'string' || !f)) noFormats.push(r.id);
  if (r.categories === undefined || !Array.isArray(r.categories)) badShape.push(r.id + '.categories-type');
  else {
    if (r.categories.some(c => !validCategories.includes(c))) badCats.push(r.id + ' [' + r.categories + ']');
    if (!r.categories.length) alte.push(r.id);
    for (const c of r.categories) catDist[c] = (catDist[c] || 0) + 1;
  }
  if (r.name !== undefined && typeof r.name !== 'string') badShape.push(r.id + '.name-type');
  if (r.notes !== undefined && typeof r.notes !== 'string') badShape.push(r.id + '.notes-type');
}
if (dupIds.length) addFailure('inventory-unique-ids', dupIds.length + ' duplicated/empty ids', dupIds, 'OUR-BUG');
if (badShape.length) addFailure('inventory-shape', badShape.length + ' malformed field values', badShape, 'OUR-BUG');
if (badTitle.length) addFailure('inventory-title', badTitle.length + ' empty/UUID titles', badTitle, 'data-gap');
if (noFormats.length) addFailure('inventory-formats', noFormats.length + ' items without formats', noFormats, 'data-gap');
if (badCats.length) addFailure('inventory-category-values', badCats.length + ' items with categories outside the 14 catalog ids', badCats, 'OUR-BUG');
for (const c of validCategories) if (!catDist[c]) addFailure('inventory-category-coverage', 'category ' + c + ' (' + catalogCategoryNames[c] + ') has ZERO inventory items', [c], 'data-gap');

// ---------- 3. every dataset detail file: openDataset contract ----------
const badFile = []; const badResources = []; const countMismatch = []; const formatNoise = {}; const rawFormatSamples = [];
for (const id of ids) {
  const path = repo + '/public/catalog/datasets/' + id + '.json.gz';
  if (!fs.existsSync(path)) { badFile.push(id); continue; }
  let d;
  try { d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path)).toString('utf8')); } catch (e) { badFile.push(id + ': ' + e.message); continue; }
  stats.datasetFiles++;
  if (d.id !== id) badFile.push(id + ' file echoes ' + d.id);
  if (typeof d.title !== 'string' || !d.title.trim()) badFile.push(id + '.title');
  if (typeof d.organization !== 'string' || !d.organization) badFile.push(id + '.organization');
  if (typeof d.metadata_modified !== 'string' || !Number.isFinite(Date.parse(d.metadata_modified))) badFile.push(id + '.metadata_modified=' + d.metadata_modified);
  if (typeof d.license_title !== 'string' || !d.license_title) badFile.push(id + '.license_title');
  if (typeof d.url !== 'string' || !/^https?:\/\//.test(d.url)) badFile.push(id + '.url');
  if (!Array.isArray(d.resources) || !d.resources.length) { badResources.push(id + ' no resources'); continue; }
  const inv = inventory.items.find(r => r.id === id);
  if (inv && inv.resourceCount !== d.resources.length) countMismatch.push(id + ' inventory ' + inv.resourceCount + ' vs file ' + d.resources.length);
  for (const r of d.resources) {
    if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name || typeof r.format !== 'string' || !r.format || typeof r.url !== 'string' || !/^https?:\/\//.test(r.url)) badResources.push(id + ' resource ' + (r.id || r.name));
    if (r.last_modified !== undefined && (typeof r.last_modified !== 'string' || !Number.isFinite(Date.parse(r.last_modified)))) badResources.push(id + ' resource.last_modified');
    const f = String(r.format || '');
    if (/^[.]/.test(f)) { formatNoise[f] = (formatNoise[f] || 0) + 1; if (rawFormatSamples.length < 3) rawFormatSamples.push(id + ' -> "' + f + '"'); }
  }
}
if (badFile.length) addFailure('dataset-file', badFile.length + ' missing/corrupt/invalid detail files', badFile, 'OUR-BUG');
if (badResources.length) addFailure('dataset-resources', badResources.length + ' malformed resources', badResources, 'OUR-BUG');
if (countMismatch.length) addFailure('dataset-resourceCount-parity', countMismatch.length + ' inventory/file resource count mismatches', countMismatch, 'OUR-BUG');
if (Object.keys(formatNoise).length) addFailure('dataset-format-noise', 'raw CKAN format values with leading dot render in resource chips', rawFormatSamples, 'source-side');

// raw programmatic keys present in detail files (must appear only inside the deliberate full-metadata dump)
const knownDetailKeys = new Set(['id', 'name', 'title', 'organization', 'organization_slug', 'license', 'license_title', 'license_url', 'metadata_modified', 'notes', 'url', 'resources']);
const rawKeySamples = [];
for (const id of [...ids].slice(0, 800)) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(repo + '/public/catalog/datasets/' + id + '.json.gz')).toString('utf8'));
  for (const k of Object.keys(d)) if (!knownDetailKeys.has(k)) rawKeySamples.push(id + '.' + k);
}
if (rawKeySamples.length) addFailure('dataset-unexpected-keys', rawKeySamples.length + ' keys beyond the mapped contract in the checked sample', rawKeySamples, 'OUR-BUG');

// ---------- 4. catalog-seed pool (server API-mode fallback) ----------
const seed = JSON.parse(fs.readFileSync(repo + '/lib/live/catalog-seed.json', 'utf8'));
const badSeed = []; const seedCats = {}; const recentCutoff = new Date(Date.now() - 3 * 365.25 * 86400000).toISOString().slice(0, 10);
let seedRecent = 0;
const remap = { energie: 'mediu', agricultura: 'mediu', filme: 'cultura', stiri: 'justitie' };
for (const e of seed) {
  stats.seedEntries++;
  if (typeof e.id !== 'string' || !e.id || typeof e.title !== 'string' || !e.title || typeof e.organization !== 'string' || !e.organization || !Array.isArray(e.formats) || !Array.isArray(e.resources) || !Number.isInteger(e.resourceCount)) badSeed.push(e.id || '(no id)');
  else if (e.resourceCount !== e.resources.length) badSeed.push(e.id + ' resourceCount parity');
  if (typeof e.category !== 'string' || !validCategories.includes(e.category)) badSeed.push(e.id + '.category=' + e.category);
  else seedCats[e.category] = (seedCats[e.category] || 0) + 1;
  if (typeof e.modified !== 'string' || !Number.isFinite(Date.parse(e.modified))) badSeed.push(e.id + '.modified');
  else if (e.modified >= recentCutoff) seedRecent++;
}
if (badSeed.length) addFailure('catalog-seed-shape', badSeed.length + ' malformed seed entries', badSeed, 'OUR-BUG');
for (const c of validCategories) {
  const effective = remap[c] || c;
  if (!seedCats[effective]) addFailure('catalog-seed-category-coverage', 'category ' + c + ' (effective ' + effective + ') has ZERO fallback pool entries', [c + '->' + effective], 'data-gap');
}
if (seedRecent === 0) addFailure('catalog-seed-recency', 'all ' + seed.length + ' entries filtered out by the 3-year recency cutoff', [recentCutoff], 'data-gap');

// ---------- 5. client seed page-0 (api-mode shape consumed by LiveCatalog) ----------
const clientSeed = JSON.parse(fs.readFileSync(repo + '/lib/live/seed.json', 'utf8'))['catalog:::0'];
const badClient = [];
if (!clientSeed?.data || !Number.isInteger(clientSeed.data.count) || !Array.isArray(clientSeed.data.results) || clientSeed.data.results.length !== Math.min(24, clientSeed.data.count)) badClient.push('page-0 pagination shape');
for (const r of clientSeed?.data?.results || []) {
  if (typeof r.title !== 'string' || !r.title || typeof r.organization !== 'string' || !Array.isArray(r.formats) || typeof r.modified !== 'string') badClient.push(r.id || r.title);
}
if (badClient.length) addFailure('client-catalog-seed', badClient.join('; '), badClient, 'OUR-BUG');

console.log(JSON.stringify({
  probe: 'catalog',
  inventoryItems: stats.inventoryItems, datasetFiles: stats.datasetFiles, seedEntries: stats.seedEntries,
  proofsVerified: stats.proofsVerified, proofsFailed: stats.proofsFailed, proofsMissingFile: stats.proofsMissingFile,
  categoryDistribution: catDist, alte: alte.length, seedCategories: seedCats, seedRecent,
  clientCount: clientSeed?.data?.count,
  failures,
}, null, 1));