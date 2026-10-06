// T1.5-F2 probe — sources-registry user-facing prose must not leak internal ops
// language or raw program identifiers. Checks the fields SourcesRegistry renders
// in its summary card (name + note); endpoint/evidence stay in the deliberate
// full-metadata disclosure panel. RED before the content rewrite.
import fs from 'node:fs';
const opsTokens = [/datastore_search/i, /datastore_active/i, /OD_FIRME/i, /SIRUTA_s1/i, /numeParte/i, /numarDosar/i, /obiectDosar/i, /\bMVP\b/];
let hits = 0;
for (const file of ['public/catalog/sources.json', 'public/data/sources.json']) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const source of data.sources) {
    for (const field of ['name', 'note']) {
      for (const token of opsTokens) {
        if (token.test(String(source[field] || ''))) {
          console.log(`${file} ${source.id}.${field}: ${String(source[field]).slice(0, 90)}…`);
          hits++;
        }
      }
    }
  }
}
console.log(hits === 0 ? 'F2 GREEN: no ops language in user-facing source prose' : `F2 RED: ${hits} leaks`);
process.exit(hits === 0 ? 0 : 1);
