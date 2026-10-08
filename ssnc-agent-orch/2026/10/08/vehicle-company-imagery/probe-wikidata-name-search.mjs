// T2 debug: the exact SPARQL the loader builds, against the live endpoint (probe
// ledger entry; wikidata host, spaced after the earlier verify request).
const term = 'MONITORUL OFICIAL';
const quoted = term.replace(/["\\]/g, '');
const query = `SELECT ?item ?itemLabel ?vat ?website WHERE { ?item wdt:P3608 ?vat. ?item rdfs:label ?label. FILTER(CONTAINS(LCASE(STR(?label)), LCASE("${quoted}"))). OPTIONAL { ?item wdt:P856 ?website. } SERVICE wikibase:label { bd:serviceParam wikibase:language "ro,en". } } LIMIT 50`;
console.log('QUERY:\n' + query + '\n---');
const r = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({query, format: 'json'}), {headers: {Accept: 'application/sparql-results+json', 'User-Agent': 'Aflivra/1.0 public-data-source-check'}, signal: AbortSignal.timeout(30000)});
const t = await r.text();
try {
  const d = JSON.parse(t); const b = d.results?.bindings || [];
  console.log('HTTP', r.status, 'bindings:', b.length);
  for (const x of b.slice(0, 8)) console.log('-', x.item.value, '|', x.itemLabel?.value, '|', x.vat?.value, '|', x.website?.value || '(fără site)');
} catch { console.log('raw:', t.slice(0, 600)); }
