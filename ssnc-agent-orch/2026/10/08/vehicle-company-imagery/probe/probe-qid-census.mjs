#!/usr/bin/env node
// Probe: census of the committed OSM corpus for the imagery classes —
// park (mediu · leisure=park), school (educatie · amenity=school),
// pharmacy (sanatate · amenity=pharmacy), court (justitie · amenity=court) —
// keeping only records whose tags carry at least one exact, single-valued
// Wikidata Q-id (wikidata / brand:wikidata / operator:wikidata / network:wikidata),
// the same exact-id rule the app's link-out builder applies (D4).
// Offline: reads only committed snapshot bytes, no network.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..', '../..');
const recordsDir = path.join(root, 'public/places/records');
const QID = /^Q[1-9]\d{0,9}$/;
const TAGS = ['wikidata', 'brand:wikidata', 'operator:wikidata', 'network:wikidata'];

const classes = {
  park: {category: 'mediu', match: tags => tags.leisure === 'park'},
  school: {category: 'educatie', match: tags => tags.amenity === 'school'},
  pharmacy: {category: 'sanatate', match: tags => tags.amenity === 'pharmacy'},
  court: {category: 'justitie', match: tags => tags.amenity === 'courthouse' || tags.amenity === 'court'},
};

const qids = new Map(); // qid -> {count, classes:Set, firstSeen}
const census = {};
for (const [name, cls] of Object.entries(classes)) {
  census[name] = {rows: 0, withQid: 0, qids: new Set(), byTag: {}};
}

for (const file of fs.readdirSync(recordsDir).filter(f => f.endsWith('.json.gz')).sort()) {
  const items = JSON.parse(gunzipSync(fs.readFileSync(path.join(recordsDir, file)))).items;
  for (const item of items) {
    const tags = item.tags || {};
    for (const [name, cls] of Object.entries(classes)) {
      if (!item.categories.includes(cls.category) || !cls.match(tags)) continue;
      const c = census[name];
      c.rows++;
      for (const tag of TAGS) {
        const value = String(tags[tag] || '').trim();
        if (!QID.test(value)) continue; // exact id only: multi-valued/malformed stays out
        c.withQid++;
        c.qids.add(value);
        c.byTag[tag] = (c.byTag[tag] || 0) + 1;
        let entry = qids.get(value);
        if (!entry) qids.set(value, entry = {count: 0, classes: new Set(), example: item.id + ' ' + item.name});
        entry.count++;
        entry.classes.add(name);
        break; // one Q-id class per record is enough for the census
      }
    }
  }
}

const result = {};
for (const [name, c] of Object.entries(census)) {
  result[name] = {records: c.rows, recordsWithExactQid: c.withQid, distinctQids: c.qids.size, byTag: c.byTag,
    sampleQids: [...c.qids].slice(0, 12).map(q => q + ' (' + qids.get(q).example + ')')};
}
result.totals = {distinctQids: qids.size};
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'probe-qid-census.json'), JSON.stringify(result, null, 1));
console.log('Q-id census of the committed corpus (exact single-valued Q-ids only):');
for (const [name, r] of Object.entries(result)) if (name !== 'totals')
  console.log('  ' + name.padEnd(9) + String(r.records).padStart(7) + ' records · ' + String(r.recordsWithExactQid).padStart(6) + ' with exact Q-id · ' + String(r.distinctQids).padStart(5) + ' distinct Q-ids · tags ' + JSON.stringify(r.byTag));
console.log('  TOTAL distinct Q-ids: ' + result.totals.distinctQids);
