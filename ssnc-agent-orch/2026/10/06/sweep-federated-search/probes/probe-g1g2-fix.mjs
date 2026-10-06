// G1/G2 spec-review fixes — RED→GREEN regression probe.
// G1: every animation ident referenced from an `animation:` shorthand in
// app/workspaces.css must have a matching @keyframes rule (definitions collected
// across every shipped app css file) — the dead-rule class the spec reviewer
// found on aflivra-weather-sky at workspaces.css:57.
// G2: the public sources registries must carry no ops language in user-facing
// fields — extends the F2 probe's token class with "Nu importa" and scans the
// personal[] section it never covered.
import fs from 'node:fs';
import path from 'node:path';

const failures = [];

// G1 — referenced animations vs defined keyframes
const defined = new Set();
for (const file of fs.readdirSync('app').filter(f => f.endsWith('.css'))) {
  for (const m of fs.readFileSync(path.join('app', file), 'utf8').matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)) defined.add(m[1]);
}
const referenced = new Set();
for (const m of fs.readFileSync('app/workspaces.css', 'utf8').matchAll(/(?:^|[;{])animation:([^;}]+)/g)) {
  // Split the animation list on commas outside parens (cubic-bezier() commas are not list separators).
  let depth = 0, current = '';
  for (const ch of m[1] + ',') {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      const ident = current.trim().split(/\s+/)[0];
      if (ident) referenced.add(ident);
      current = '';
    } else current += ch;
  }
}
const missing = [...referenced].filter(ident => !defined.has(ident));
for (const ident of missing) failures.push(`G1 app/workspaces.css: animation '${ident}' is referenced with no @keyframes rule in any shipped css file`);
console.log(`G1: ${referenced.size - missing.length}/${referenced.size} referenced animation idents have @keyframes rules — ${[...referenced].sort().join(', ')}`);

// G2 — ops language in user-facing registry fields (summary-card fields + personal[])
const opsTokens = [/datastore_search/i, /datastore_active/i, /OD_FIRME/i, /SIRUTA_s1/i, /numeParte/i, /numarDosar/i, /obiectDosar/i, /\bMVP\b/, /Nu importa/i];
for (const file of ['public/catalog/sources.json', 'public/data/sources.json']) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const source of data.sources) {
    for (const field of ['name', 'note']) {
      for (const token of opsTokens) {
        if (token.test(String(source[field] || ''))) failures.push(`G2 ${file} ${source.id}.${field}: ${String(source[field]).slice(0, 90)}…`);
      }
    }
  }
  for (const [index, entry] of (data.personal || []).entries()) {
    for (const [element, value] of entry.entries()) {
      for (const token of opsTokens) {
        if (token.test(String(value || ''))) failures.push(`G2 ${file} personal[${index}][${element}]: ${String(value).slice(0, 90)}…`);
      }
    }
  }
}

console.log(failures.length === 0 ? 'G1+G2 GREEN' : `RED (${failures.length}):\n${failures.map(f => `  FAIL ${f}`).join('\n')}`);
process.exit(failures.length === 0 ? 0 : 1);
