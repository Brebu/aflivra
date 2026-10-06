// T1.5-P1 proof — the shipped lib/live/query.ts normalizeSearch must reproduce
// every precomputed index `search` value of all 178.868 places rows (the corpus
// was built by scripts/finalize-places.py, which strips exactly the characters
// with a nonzero canonical combining class). RED before the fix: 56 mismatches.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../../../../../../');
const transpiled = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/live/query.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
fs.writeFileSync('/tmp/p1-query-test.mjs', transpiled);
const { normalizeSearch } = await import(pathToFileURL('/tmp/p1-query-test.mjs'));

const read = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/places/manifest.json'), 'utf8'));
const records = new Map();
for (const key of Object.keys(manifest.chunks)) {
  for (const r of read(path.join(root, 'public/places/records', key + '.json.gz')).items) {
    records.set(r.id, r);
  }
}
const searchable = r => Object.values(r.tags || {}).join(' ') + ' ' + r.name + ' ' + (r.address || '');

let rows = 0;
const mismatch = [];
for (const part of manifest.indices['local-all'].name) {
  for (const row of read(path.join(root, 'public/places', part.file + '.gz')).items) {
    rows++;
    const expected = normalizeSearch(searchable(records.get(row.id)));
    if (expected !== row.search) mismatch.push(row.id);
  }
}
const bran = [...records.values()].find(r => (Object.values(r.tags).join(' ') || '').includes('\u0d3e'));
const malayalam = String(Object.values(bran.tags).find(v => String(v).includes('\u0d3e')));
const katakanaId = [...records.values()].find(r => r.name.includes('\u3094') || (Object.values(r.tags).join(' ') || '').includes('\u3099'));
const hebrewId = [...records.values()].find(r => (Object.values(r.tags).join(' ') || '').includes('\u05b8'));

const typedRoundTrip = (label, id, typed) => {
  const r = records.get(id);
  const stored = normalizeSearch(searchable(r));
  const ok = stored.includes(normalizeSearch(typed)) && normalizeSearch(typed).length > 0;
  console.log(label + ': ' + (ok ? 'match' : 'NO MATCH') + ' (typed norm ' + JSON.stringify(normalizeSearch(typed).slice(0, 40)) + ')');
  return ok;
};

console.log('rows=' + rows + ' records=' + records.size + ' mismatches=' + mismatch.length);
console.log('sample mismatches: ' + mismatch.slice(0, 5).join(', '));
let ok = mismatch.length === 0;
if (katakanaId) ok = typedRoundTrip('katakana-voiced typed-with-mark', katakanaId.id, katakanaId.name) && ok;
if (hebrewId) ok = typedRoundTrip('hebrew-niqqud typed-with-mark', hebrewId.id, hebrewId.name) && ok;
if (bran) ok = typedRoundTrip('malayalam ccc=0 marks kept (Castelul Bran name:ha)', bran.id, malayalam) && ok;
console.log(ok ? 'P1 GREEN: normalizeSearch reproduces every index row; typed-mark round-trips pass.' : 'P1 RED');
process.exit(ok ? 0 : 1);
