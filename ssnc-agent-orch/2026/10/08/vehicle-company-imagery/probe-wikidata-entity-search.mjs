// T2 probe: the index-backed EntitySearch form of the name query — the WDQS service
// that the docs recommend for label search instead of a full CONTAINS scan (the scan
// form timed out at the loader's 18 s upstream budget on cold queries).
const term = process.argv[2] || 'petrom';
const quoted = term.replace(/["\\]/g, '');
const query = `SELECT ?item ?itemLabel ?vat ?website WHERE { SERVICE wikibase:mwapi { bd:serviceParam wikibase:api "EntitySearch"; wikibase:endpoint "www.wikidata.org"; mwapi:search "${quoted}"; mwapi:language "ro"; mwapi:limit "50". ?item wikibase:apiOutputItem mwapi:item. } ?item wdt:P3608 ?vat. OPTIONAL { ?item wdt:P856 ?website. } SERVICE wikibase:label { bd:serviceParam wikibase:language "ro,en". } }`;
const at = Date.now();
const r = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({query, format: 'json'}), {headers: {Accept: 'application/sparql-results+json', 'User-Agent': 'Aflivra/1.0 public-data-source-check'}, signal: AbortSignal.timeout(45000)});
const ms = Date.now() - at;
const t = await r.text();
try {
  const d = JSON.parse(t); const b = d.results?.bindings || [];
  console.log(term, '→ HTTP', r.status, 'in', ms + 'ms,', b.length, 'bindings');
  for (const x of b.slice(0, 8)) console.log('-', x.item.value.split('/').at(-1), '|', x.itemLabel?.value, '|', x.vat?.value, '|', x.website?.value || '(fără site)');
} catch { console.log('raw:', t.slice(0, 500)); }
