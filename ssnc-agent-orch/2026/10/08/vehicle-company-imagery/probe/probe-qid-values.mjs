#!/usr/bin/env node
// Probe: list the exact Q-id values per class and tag with record examples,
// so the imagery mapping can be scoped honestly (entity photo vs brand photo
// vs operator photo — an operator's photo is not a photo of the place).
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..', '../..');
const recordsDir = path.join(root, 'public/places/records');
const QID = /^Q[1-9]\d{0,9}$/;
const classes = {
  park: {category: 'mediu', match: t => t.leisure === 'park'},
  school: {category: 'educatie', match: t => t.amenity === 'school'},
  pharmacy: {category: 'sanatate', match: t => t.amenity === 'pharmacy'},
  court: {category: 'justitie', match: t => t.amenity === 'courthouse'},
};
const out = {};
for (const file of fs.readdirSync(recordsDir).filter(f => f.endsWith('.json.gz')).sort()) {
  const items = JSON.parse(gunzipSync(fs.readFileSync(path.join(recordsDir, file)))).items;
  for (const item of items) {
    const tags = item.tags || {};
    for (const [name, cls] of Object.entries(classes)) {
      if (!item.categories.includes(cls.category) || !cls.match(tags)) continue;
      for (const tag of ['wikidata', 'brand:wikidata', 'operator:wikidata', 'network:wikidata']) {
        const value = String(tags[tag] || '').trim();
        if (!QID.test(value)) continue;
        (out[name] ??= {})[tag] ??= new Map();
        const map = out[name][tag];
        if (!map.has(value)) map.set(value, {qid: value, count: 0, example: item.id, name: item.name, city: tags['addr:city'] || ''});
        map.get(value).count++;
      }
    }
  }
}
const result = {};
for (const [cls, tags] of Object.entries(out)) {
  result[cls] = {};
  for (const [tag, map] of Object.entries(tags)) {
    result[cls][tag] = [...map.values()].sort((a, b) => b.count - a.count);
  }
}
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'probe-qid-values.json'), JSON.stringify(result, null, 1));
for (const [cls, tags] of Object.entries(result)) for (const [tag, rows] of Object.entries(tags)) {
  console.log('== ' + cls + ' / ' + tag + ' — ' + rows.length + ' distinct');
  for (const r of rows.slice(0, 8)) console.log('   ' + r.qid + ' ×' + r.count + ' · ' + r.name + ' (' + r.city + ')');
}
