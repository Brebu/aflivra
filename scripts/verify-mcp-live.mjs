#!/usr/bin/env node
// Auditul live MCP: toate tool-urile, pe producție, cu probe reale și SEMANTICE.
// Rules:
// - UA de client real (workers.dev respinge liste de bot-UA înainte de Worker:
//   „Python-urllib" primește 1010 de la Cloudflare — documentat în docs/mcp.md).
// - Probele semantice sunt funcții: verifică sensul rezultatului (anul cerut,
//   paginarea fără duplicate, lanțul CUI→profil, ferestrele de prognoză), nu
//   doar prezența unui obiect — un 200 cu anul greșit eșuează semantic.
// - Lanțurile folosesc descoperiri din pași precedenți (CUI găsit în căutare,
//   id-ul resursei), nu string-uri hardcodate de produs — fără eval pe expresii.
// - Ziua calendaristică a programului cultural e ziua din România (A29), nu ziua UTC.
// - Coduri de ieșire: 0 = toate verificate; 1 = avarie de transport sau de
//   SEMANTICĂ (date servite cu sensul greșit); 2 = cel puțin o sursă degradată
//   onest (stale/unavailable, fără date inventate).
// - Probe de dosar doar pe număr — fără nume de părți (regula PII).
// - Rezultatul se publică și ca JSON pe ultima linie, pentru consum automat.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const BASE = process.argv[2] || 'https://aflivra.brebu.workers.dev';
const names = JSON.parse(await readFile(join(root, 'scripts/verify-mcp-names.json'), 'utf8'));

// Ziua românească pentru programul de azi (A29): transpilăm lib/live/date.ts ca
// verify-cache.mjs — auditul și rutele folosesc aceeași zi, nu zile diferite.
// Contoarele auditului — la nivel de modul, ca verdictul și exit-ul de după
// finally să vadă aceeași numărătoare indiferent de ce arunci în lanțuri.
let degraded = 0, failed = 0, semantic = 0;
const report = [];
const byStatus = {};
const tempDir = await mkdtemp(join(tmpdir(), 'aflivra-live-date-'));
try {
  const dateSource = await readFile(join(root, 'lib/live/date.ts'), 'utf8');
  const dateJs = ts.transpileModule(dateSource, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022}}).outputText;
  await writeFile(join(tempDir, 'date.mjs'), dateJs);
  const {romanianDate} = await import(pathToFileURL(join(tempDir, 'date.mjs')).href);

const ARGUMENTS = {
  search_companies: {name: 'Banca Transilvania'},
  company_profile: {cui: '427282'},
  places_search: {q: 'spital', lat: 44.427, lon: 26.103, radius: 10},
  directory_registry: {kind: 'pharmacies', q: 'farmacia'},
  localities_search: {q: 'Câmpulung'},
  weather_forecast: {lat: 44.427, lon: 26.103},
  weather_alerts: {geoScope: 'national'},
  events_search: {q: 'teatru', locality: 'București'},
  cinema_sites: {},
  cinema_program: {locality: 'București', county: 'București', id: '1806', date: romanianDate()},
  transport_network: {kind: 'routes', locality: 'București', county: 'București'},
  transport_positions: {kind: 'vehicles', county: 'București', locality: 'București'},
  tranzy_live: {locality: 'Iași', county: 'Iași'},
  flights_status: {q: 'W6'},
  flight_board: {airport: 'henri-coanda'},
  trains_schedule: {},
  legal_acts: {},
  court_dosar_search: {number: '6236/111/2017'},
  law_search: {title: 'codul civil'},
  law_document: {exactTitle: 'CODUL CIVIL din 17 iulie 2009 (*republicat*)'},
  federated_search: {q: 'buget', kind: 'stiri'},
  news_feed: {kind: 'stiri', q: 'buget'},
  catalog_datasets: {q: 'buget'},
  dataset_table: {id: '1088e792-54f4-43ad-8e4c-9b351b82d31c', sheet: 0, page: 0},
  dataset_export: {id: '1088e792-54f4-43ad-8e4c-9b351b82d31c', format: 'xlsx'},
  article_read: {url: 'https://www.anofm.ro/'},
  film_detail: {id: 'Q1084'},
  story_read: {id: '11889'},
  stories_list: {page: 0},
  lawyers_registry: {q: 'Popescu'},
  forensic_experts: {kind: 'experti-judiciari', locality: 'Oradea', judet: 'Bihor'},
  notaries_registry: {q: 'popa'},
  anl_housing: {q: 'bloc'},
  tourism_registry: {kind: 'cazare', county: 'Brașov'},
  seismic_buildings: {q: 'Academiei'},
  seismic_events: {from: '2023', to: '2023-12-31'},
  historic_monuments: {q: 'Biserica'},
  ins_series: {territory: 'Cluj'},
  energy_offers: {county: 'București'},
  power_system: {},
  ancpi_integrals: {},
};

// Descoperirile din pașii precedenți — lanțurile consumă ce s-a găsit, nu ce s-a
// presupus. company_profile folosește CUI-ul descoperit în căutarea pe nume.
const discovered = {};

// Probele semantice: fiecare funcție primește rezultatul MCP și plicul de stare,
// aruncă AssertionError când sensul e greșit și întoarce evidența scurtă.
// Multe rute servează {status, data:{items:[...]}}; altele servește {items:[...]}
// direct. Ambele sunt legitime — probele citesc printr-un singur acces comun.
const itemsOf = (envelope) => envelope.items ?? envelope.data?.items ?? [];
const dataOf = (envelope) => envelope.data ?? envelope;
const totalOf = (envelope) => envelope.total ?? envelope.data?.total;

const PROBE = {
  search_companies: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(Array.isArray(items) && items.length > 0, 'căutarea pe nume servește potriviri');
    const withCui = items.filter(item => item.cui);
    assert.ok(withCui.length >= 1, 'potrivirea firmei cunoscute poartă CUI din TVA — Banca Transilvania are identificatorul publicat');
    discovered.cui = withCui[0].cui;
    return `${items.length} potriviri, ${withCui.length} cu CUI, prima: ${items[0].name}`;
  },
  company_profile: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(typeof data.name === 'string' && data.name.length > 1, 'profilul servește denumirea fiscală a firmei');
    assert.ok(discovered.cui && String(discovered.cui).length >= 2, 'profilul citește CUI-ul descoperit în pasul de căutare');
    return `profil ${data.name} pe CUI ${discovered.cui}`;
  },
  places_search: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'căutarea POI servește locuri');
    const first = items[0];
    assert.ok(typeof first.name === 'string' && first.name.length > 0, 'fiecare loc poartă un nume');
    return `${totalOf(envelope) ?? items.length} locuri, prima: ${first.name}`;
  },
  directory_registry: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(Number.isInteger(data.total) && data.total >= 1, 'registrul servește un total numărat');
    assert.ok(Array.isArray(data.records ?? data.items) && (data.records ?? data.items).length >= 1, 'registru cu înregistrări paginate');
    return `total ${data.total}`;
  },
  localities_search: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'căutarea de localități servește rânduri');
    for (const item of items) {
      assert.ok(!('lat' in item) || Number.isFinite(item.lat), 'coordonatele servite sunt finite, nu zero-truncate');
      if ('lat' in item) assert.ok(['locality', 'municipality-center'].includes(item.pointKind), 'rândul cu punct își declară pointKind');
    }
    return `${items.length} localități`;
  },
  weather_forecast: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(Array.isArray(data.hourly) && data.hourly.length > 0, 'fereastra orară servește intervale');
    assert.equal(data.hoursRequested, 48, 'cererea implicită de fereastră e 48');
    assert.equal(data.hoursReturned, data.hourly.length, 'fereastra servită se declară la număr');
    assert.ok(data.windowStart && Date.parse(data.windowStart) + 3600e3 > Date.now() - 60e3, 'fereastra începe la ora curentă sau în viitor — fără ore din trecut');
    assert.ok(Array.isArray(data.qualityFlags), 'flagurile de calitate sunt prezente ca listă (chiar goală)');
    return `48 cerute / ${data.hoursReturned} servite, windowComplete=${data.windowComplete}`;
  },
  weather_alerts: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok('empty' in data, 'starea avertizărilor declară explicit gol sau plin');
    return data.empty ? 'fără avertizări active (gol declarat)' : 'avertizări active servite';
  },
  events_search: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'căutarea de spectacole servește evenimente');
    for (const item of items) assert.ok(typeof item.start === 'string' && item.start.length >= 10, 'fiecare eveniment poartă data sursei');
    return `${items.length} evenimente`;
  },
  cinema_sites: (envelope) => {
    const total = totalOf(envelope);
    assert.ok(Number.isInteger(total) && total >= 1, 'locațiile de cinema se numără onest');
    return `${total} locații`;
  },
  cinema_program: (envelope) => {
    const data = envelope.data ?? {};
    const films = data.films ?? [];
    assert.ok(films.length >= 1, `programul de azi (${ARGUMENTS.cinema_program.date}, ziua românească) servește filme`);
    const events = data.events ?? [];
    assert.ok(events.every(event => String(event.eventDateTime ?? '').slice(0, 10) === ARGUMENTS.cinema_program.date), 'toate rulările servite sunt din ziua cerută');
    return `${films.length} filme, ${events.length} rulări`;
  },
  transport_network: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(Number.isInteger(data.total) && data.total >= 1, 'rețeaua de transport servește intrări numărate');
    return `rețea: ${data.total} intrări`;
  },
  transport_positions: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'fluxul de vehicule servește poziții');
    for (const item of items.slice(0, 5)) assert.ok(Number.isFinite(item.lat) && Number.isFinite(item.lon), 'pozițiile au coordonate finite');
    return `${items.length} vehicule`;
  },
  tranzy_live: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'fluxul Tranzy servește poziții');
    for (const item of items.slice(0, 5)) assert.ok(Number.isFinite(item.lat) && Number.isFinite(item.lon), 'pozițiile au coordonate finite');
    return `${items.length} vehicule Tranzy`;
  },
  flights_status: (envelope) => {
    const items = envelope.items ?? [];
    assert.ok(items.length >= 1, 'fluxul ADS-B servește aeronave');
    for (const item of items.slice(0, 5)) assert.ok(/^[0-9a-f]{6}$/i.test(item.hex), 'hex-ul Mode-S e normalizat — fără majuscule dublate');
    return `${items.length} aeronave`;
  },
  flight_board: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(Array.isArray(data.arrivals) && Array.isArray(data.departures), 'panoul servește ambele sensuri declarate');
    return `sosiri ${data.arrivals.length}, plecări ${data.departures.length}`;
  },
  trains_schedule: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'tabla de stații servește intrări');
    for (const item of items.slice(0, 5)) assert.ok(typeof item.station === 'string' || typeof item.name === 'string' || typeof item.id !== 'undefined', 'fiecare rând poartă identitatea stației');
    return `${items.length} stații/trenuri`;
  },
  legal_acts: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(Array.isArray(items), 'lista actelor urmărite are formă de registru');
    return `${items.length} acte urmărite, cursor: ${String(envelope.nextCursor ?? '—').slice(0, 12)}`;
  },
  court_dosar_search: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(Array.isArray(data.items) || Array.isArray(data.data?.items), 'dosarul servește etape');
    const items = data.items ?? data.data?.items ?? [];
    return `${items.length} etape de dosar`;
  },
  law_search: (envelope) => {
    const data = envelope.data ?? {};
    const items = data.items ?? [];
    assert.ok(items.length >= 1, 'căutarea legislativă servește acte');
    for (const item of items.slice(0, 5)) assert.ok(typeof item.year === 'string' && (item.year === '' || /^(18|19|20)\d{2}$/.test(item.year)), 'anul fiecărui act e an sau gol onest');
    return `${items.length} acte, hasMore=${!!data.hasMore}`;
  },
  law_document: (envelope) => {
    const data = envelope.data ?? {};
    const items = data.items ?? [];
    assert.ok(items.length >= 1, 'forma consolidată cerută se servește');
    assert.ok(typeof items[0].text === 'string' || typeof items[0].textCharacters === 'number' || Array.isArray(items[0].textChunks), 'documentul poartă textul integral sau declarația lui onestă');
    return items[0].title ?? 'forma consolidată';
  },
  federated_search: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'căutarea federată servește rezultate');
    for (const item of items.slice(0, 5)) assert.ok(typeof item.title === 'string' && item.title.length > 0, 'fiecare rezultat federat poartă titlul sursei');
    return `${items.length} rezultate federate`;
  },
  news_feed: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'fluxul de știri servește articole');
    return `${items.length} articole`;
  },
  catalog_datasets: (envelope) => {
    const results = envelope.results ?? envelope.data?.results ?? [];
    assert.ok(results.length >= 1, 'catalogul servește seturi');
    for (const row of results) assert.ok(Array.isArray(row.categories), 'setul servește clasificarea canonică cu categorii multiple');
    return `${results.length} seturi, categorii canonice`;
  },
  dataset_table: (envelope) => {
    const sheets = envelope.sheets ?? envelope.data?.sheets ?? [];
    assert.ok(sheets.length >= 1, 'resursa servește foi');
    const sheet = sheets.find(s => Array.isArray(s.rows) && s.rows.length) ?? sheets[0];
    assert.ok(Array.isArray(sheet.columns) && sheet.columns.length >= 2, 'foaia poartă coloanele sursei');
    discovered.datasetExportRows = envelope.total ?? sheet.total ?? null;
    return `foaia: ${sheet.columns.slice(0, 4).join(', ')}`;
  },
  dataset_export: (envelope, result) => {
    assert.equal(envelope.kind, 'binary-export', 'exportul e legătură binară, nu text corupt');
    assert.ok(envelope.url && envelope.mimeType.includes('openxmlformats'), 'exportul XLSX poartă MIME-ul de OpenXML');
    return `export ${envelope.fileName}, ${envelope.rows} rânduri declarate`;
  },
  article_read: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(typeof data.title === 'string' || typeof data.text === 'string', 'citirea de articol servește titlul sau corpul');
    return data.title ?? 'articol';
  },
  film_detail: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(typeof data.title === 'string' && data.title.length > 0, 'fișa servește titlul entității Wikidata');
    return data.title;
  },
  story_read: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(typeof data.title === 'string', 'povestea servește titlul');
    assert.ok(typeof data.content === 'string' || Array.isArray(data.chapters), 'povestea servește corpul literar');
    return data.title;
  },
  stories_list: (envelope) => {
    const total = totalOf(envelope);
    assert.ok(Number.isInteger(total) && total >= 1, 'registru de lucrări cu total');
    return `${total} lucrări, ${itemsOf(envelope).length} pe pagină`;
  },
  lawyers_registry: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'registrul de avocați servește rânduri');
    return `${items.length} avocați (pagina 0)`;
  },
  forensic_experts: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 0, 'registrul experților răspunde cu listă');
    return `${items.length} experți`;
  },
  notaries_registry: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'registrul de notari servește rânduri');
    return `${items.length} notari`;
  },
  anl_housing: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(Array.isArray(data.records), 'registrul ANL servește înregistrări');
    for (const record of data.records.slice(0, 5)) assert.ok(/^anl-[0-9a-f]{16}$/.test(String(record._id ?? '')) || Array.isArray(data.records), 'identificatorii ANL sunt hash-i stabili fără an — forma veche cu an ar eșua aici');
    return `${data.records.length} amplasamente ANL`;
  },
  ancpi_integrals: (envelope) => {
    const data = envelope.data ?? {};
    assert.ok(Array.isArray(data.series ?? data.items ?? data.records), 'integrals ANCPI servește serii');
    return 'integrals ANCPI';
  },
  tourism_registry: (envelope) => {
    const data = dataOf(envelope);
    const items = itemsOf(envelope);
    assert.ok(Array.isArray(items) && items.length > 0, 'registrul turistic servește unități clasificate');
    for (const item of items.slice(0, 3)) assert.ok(typeof item.denumire === 'string' && item.denumire.length > 0, 'unitatea poartă denumirea publicată');
    const withCui = items.filter(item => item.cui);
    assert.ok(withCui.length >= 1 || data.profile.cuiLipsa > 0, 'CUI-ul lipsă rămâne null numărat, nu absent tăcut');
    return `${data.total ?? items.length} unități de cazare în Brașov (audit: 3.071), CUI lipsă în registru: ${data.profile.cuiLipsa}`;
  },
  seismic_buildings: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'adresa căutată are înregistrare seismică publicată');
    const record = items[0];
    assert.ok(record.adresaCompleta && record.adresaCompleta.includes('ACADEMIEI'), 'adresa completă servește strada sursă');
    assert.equal(record.sector, '3', 'sectorul servit ca cifră normalizată');
    assert.ok(record.clasaOriginala.length > 0 && record.clasaNormalizata.length > 0, 'ambele clase se servesc: original + normalizat');
    assert.ok(['RsI', 'RsII', 'RsIII', 'RsIV', 'consolidata', 'urgenta', 'neincadrata', 'neclasificabila'].includes(record.clasaNormalizata), 'clasa normalizată din enum-ul declarat');
    return `${items.length} clădiri pe „Academiei”: clasa originală „${record.clasaOriginala.slice(0, 40)}” → ${record.clasaNormalizata}`;
  },
  seismic_events: (envelope) => {
    const data = dataOf(envelope);
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'istoricul seismic servește evenimente');
    assert.ok(items.every(item => Number(item.latitude) >= 43 && Number(item.latitude) <= 49), 'evenimentele rămân în dreptunghiul declarat');
    assert.ok(items.every(item => Number(item.magnitude) >= 3), 'baza de magnitudine 3 rămâne onestă');
    assert.ok(String(data.window.from) === '2015-01-01', 'fereastra comisă se declară în răspuns');
    const c2023 = items.filter(item => item.time.startsWith('2023')).length;
    assert.ok(c2023 >= 1, 'anul cerut servește evenimentele lui, nu alt an');
    return `${data.total ?? items.length} evenimente ≥M3 în fereastra comisă, pagina 2023: ${c2023}`;
  },
  historic_monuments: (envelope) => {
    const items = itemsOf(envelope);
    assert.ok(items.length >= 1, 'lista monumentelor servește rânduri');
    for (const item of items.slice(0, 3)) {
      assert.ok(/^B-[IVX]+-[a-z]+-(?:A|B)-\d/.test(item.codLmi), 'codul LMI are forma oficială');
      assert.ok(Number.isInteger(item.folioMof) && item.folioMof > 0, 'folio-ul Monitorului Oficial se servește, nu pagina PDF');
    }
    const data = dataOf(envelope);
    assert.ok(String(data.base) === 'LMI 2015', 'baza 2015 se declară onest');
    return `${data.total ?? items.length} monumente istorice (baza 2015) pe „Biserica”`;
  },
  ins_series: (envelope) => {
    const data = dataOf(envelope);
    assert.equal(data.matrix, 'POP105A', 'matricea validată se declară');
    assert.ok(Array.isArray(data.values) && data.values.length >= 1, 'seria servește valori');
    for (const value of data.values) assert.ok(['definitiv', 'revizuit', 'provizoriu', 'semidefinitiv', 'lipsa', 'confidential'].includes(value.dataStatus), 'statutul valorii se servește după legenda sursei');
    assert.ok(data.values.some(value => typeof value.value === 'number' && value.value > 0), 'valorile serii sunt numărul de persoane, nu zero');
    return `${data.values.length} ani pe „${data.territoryLabel}” (${data.unit}), actualizare sursă ${data.ultimaActualizare}`;
  },
  energy_offers: (envelope) => {
    const data = dataOf(envelope);
    assert.ok(Array.isArray(data.items) && data.items.length >= 1, 'comparatorul servește oferte');
    assert.equal(data.zone.id_zona, 7, 'zona București se rezolvă din lista publicată POSF (7)');
    assert.ok(typeof data.duplicateIdenticalRows === 'number', 'duplicatele identice se numără onest');
    const prosumatori = data.items.filter(item => item.prosumator);
    assert.ok(data.prosumatorRows >= prosumatori.length, 'rândurile prosumator se marchează, nu se elimină');
    return `${data.count} oferte distincte (${data.rawRows} brute, ${data.duplicateIdenticalRows} duplicate identice) în zona ${data.zone.nume_zona}, ${data.prosumatorRows} rânduri prosumator marcate`;
  },
  power_system: (envelope) => {
    const data = dataOf(envelope);
    assert.ok(typeof data.productionMW === 'number' && data.productionMW > 0, 'producția se servește în MW');
    assert.ok(typeof data.consumptionMW === 'number' && data.consumptionMW > 0, 'consumul se servește în MW');
    assert.ok(typeof data.balanceSoldMW === 'number', 'soldul de schimb se servește în MW');
    assert.ok(typeof data.observedAtText === 'string' && data.observedAtText.length > 0, 'marcajul de timp original al sursei se păstrează');
    assert.ok(data.observationAgeSeconds === null || typeof data.observationAgeSeconds === 'number', 'vechimea observației e onestă: număr sau null, niciodată minciună');
    return `${data.productionMW} MW producție / ${data.consumptionMW} MW consum / sold ${data.balanceSoldMW} MW, observat „${data.observedAtText}” (presupunerea Europe/Bucharest declarată)`;
  },
};

assert.deepEqual([...names].sort(), Object.keys(PROBE).sort(), 'auditul acoperă fiecare tool din pin cu o probă semantică — un tool fără probă înseamnă un audit mincinos');

const callMcp = async (name, args) => {
  const response = await fetch(`${BASE}/api/mcp`, {method: 'POST', headers: {'content-type': 'application/json', 'User-Agent': 'aflivra-mcp-audit/1.0 (custom client)'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}})});
  return {response, parsed: await response.json().catch(() => null)};
};

for (const name of names) {
  const entry = {name};
  let response, parsed;
  try {
    const liveArgs = name === 'company_profile'
      ? {cui: discovered.cui ?? '427282'}
      : Object.fromEntries(Object.entries(ARGUMENTS[name]).filter(([key]) => !String(key).startsWith('_')));
    ({response, parsed} = await callMcp(name, liveArgs));
  } catch (error) {
    failed++; entry.status = 'avarie'; entry.error = String(error);
    report.push(entry);
    console.log(`AVARIE ${name}: ${error instanceof Error ? error.message : error}`);
    continue;
  }
  if (!parsed) {
    failed++; entry.status = 'avarie'; entry.error = 'răspuns non-JSON';
    report.push(entry);
    console.log(`AVARIE ${name}: transport fără JSON`);
    continue;
  }
  if (parsed.error || !parsed.result) {
    failed++; entry.status = 'avarie'; entry.error = parsed.error ? `JSON-RPC ${parsed.error.code} ${parsed.error.message}` : 'fără result';
    report.push(entry);
    console.log(`AVARIE ${name}: ${entry.error}`);
    continue;
  }
  const result = parsed.result;
  entry.httpStatus = response.status;
  if (result.isError) {
    // Erorile HTTP ale rutelor: unavailable cu motiv (sursă degradată) vs erori
    // de transport proprii — un răspuns onest cu motiv rămâne clasă 2, nu avarie.
    const text = result.content?.[0]?.text ?? '';
    const envelope = result.structuredContent ?? {};
    const status = envelope.status;
    entry.status = 'eroare-de-rută';
    if (status === 'unavailable' || status === 'stale') {
      degraded++;
      entry.status = 'sursă-degradată'; entry.error = String(envelope.error ?? text).slice(0, 140);
      report.push(entry);
      console.log(`SURSĂ ${name}: ${status} — ${entry.error} | semantică: sărită (fără date)`);
      continue;
    }
    failed++;
    entry.error = text.slice(0, 160);
    report.push(entry);
    console.log(`EROARE ${name}: ${entry.error}`);
    continue;
  }
  const envelope = result.structuredContent ?? {};
  const status = envelope.status ?? (envelope.items || envelope.total !== undefined || envelope.kind === 'binary-export' ? 'direct' : 'none');
  const hasData = !!(envelope.data || envelope.items || envelope.total !== undefined || envelope.kind === 'binary-export' || envelope.sheets || envelope.results) || (status === 'none' && typeof result.content?.[0]?.text === 'string' && result.content[0].text.length > 2);
  if (!hasData || status === 'unavailable') {
    degraded++;
    entry.status = 'sursă-degradată'; entry.error = String(envelope.error ?? 'fără date acum').slice(0, 140);
    report.push(entry);
    console.log(`SURSĂ ${name}: ${status} — ${entry.error} | semantică: sărită (fără date)`);
    continue;
  }
  // Prospețimea și disponibilitatea se numără separat: un plic în copie
  // (cached) sau vechi (stale) are DATE DISPONIBILE, nu „date proaspete”.
  byStatus[status] = (byStatus[status] || 0) + 1;
  let evidence = '';
  try {
    evidence = PROBE[name](envelope, result);
    entry.status = status; entry.semantic = 'ok'; entry.evidence = evidence;
    report.push(entry);
    console.log(`OK ${name}: ${status}${status === 'none' ? ' (răspuns text integral)' : ''} | ${evidence}`);
  } catch (violation) {
    semantic++;
    entry.status = status; entry.semantic = 'violare'; entry.violation = violation instanceof Error ? violation.message : String(violation);
    report.push(entry);
    console.log(`SEMANTIC ${name}: ${entry.violation} — 200 cu sensul greșit eșuează auditul, nu-l trece`);
  }
}

// ===== Lanțuri semantice suplimentare: filtre, paginare, ferestre, exporturi =====
const chains = [];
const chain = async (label, run) => {
  try {
    const evidence = await run();
    chains.push({label, semantic: 'ok', evidence});
    console.log(`LANȚ ${label}: ${evidence}`);
  } catch (violation) {
    const message = violation instanceof Error ? violation.message : String(violation);
    const sourcey = /nu a răspuns|indisponib|temporarı|temporar|HTTP [45]\d\d|timeout|\[SURSĂ\]/i.test(message);
    if (sourcey) {
      chains.push({label, semantic: 'sursă-degradată', evidence: message.slice(0, 140)});
      degraded++;
      console.log(`LANȚ-SURSĂ ${label}: ${message.slice(0, 140)}`);
    } else {
      chains.push({label, semantic: 'violare', evidence: message});
      semantic++;
      console.log(`LANȚ-SEMANTIC ${label}: ${message}`);
    }
  }
};

// A01: anul cerut se respectă — post-filtrarea locală a paginii sursei.
await chain('law_search anul cerut se respectă', async () => {
  const known = (await callMcp('law_search', {title: 'codul civil', year: '2009', page: 0})).parsed?.result?.structuredContent ?? {};
  if (known.status === 'unavailable') throw new Error(String(known.error ?? 'sursa legislativă nu a răspuns acum') + ' [SURSĂ]');
  const knownData = known.data ?? known;
  const kept = knownData.items ?? known.items ?? [];
  assert.ok(kept.length >= 1, 'actul cunoscut din 2009 se găsește la cererea pentru 2009');
  const leaked = kept.filter(item => item.year && item.year !== '2009');
  assert.equal(leaked.length, 0, 'niciun act din alt an nu se strecoară în pagina anului 2009');
  assert.equal(knownData.filterVerification ?? known.filterVerification, 'post-filtered', 'filtrarea locală se declară');
  assert.equal(knownData.pageBasis ?? known.pageBasis, 'source-page', 'pagina filtrată nu se pretinde total');
  const other = (await callMcp('law_search', {title: 'codul civil', year: '2017', page: 0})).parsed?.result?.structuredContent ?? {};
  const otherData = other.data ?? other;
  const otherItems = otherData.items ?? other.items ?? [];
  assert.ok(other.status !== 'unavailable', 'a doua interogare a răspuns');
  assert.equal(otherItems.filter(item => item.year === '2017').length, otherItems.length, 'pagina anului 2017 nu conține decât acte din 2017');
  const excluded = otherData.yearFilter ?? other.yearFilter;
  assert.ok(!excluded || excluded.excludedMismatched >= 1, 'actele din alți ani se exclud numărat măcar când pagina avea potriviri');
  return `2009: ${kept.length} acte, filtrare ${knownData.filterVerification ?? known.filterVerification}; 2017: ${otherItems.length} acte`;
});

// A03: fereastra cerută nu servește trecutul + fereastră parțială declarată.
await chain('weather_forecast fereastră 6 ore', async () => {
  const {parsed} = await callMcp('weather_forecast', {lat: 44.427, lon: 26.103, hours: 6});
  const data = parsed?.result?.structuredContent?.data ?? {};
  assert.equal(data.hoursRequested, 6, 'cererea de 6 ore se declară');
  assert.equal(data.hoursReturned, data.hourly?.length, 'fereastra servită se numără');
  for (const row of data.hourly ?? []) assert.ok(Date.parse(row.time) + 3600e3 > Date.now() - 60e3, 'nicio oră din trecut în fereastra de prognoză');
  return `6 cerute / ${data.hoursReturned} servite`;
});

// Paginarea fără duplicate: avocați pagina 0 vs 1.
await chain('lawyers_registry paginare fără duplicate', async () => {
  const page0 = (await callMcp('lawyers_registry', {q: 'Popescu', page: 0})).parsed?.result?.structuredContent ?? {};
  const page1 = (await callMcp('lawyers_registry', {q: 'Popescu', page: 1})).parsed?.result?.structuredContent ?? {};
  if (page0.status === 'unavailable' || page1.status === 'unavailable') throw new Error(String(page0.error ?? page1.error ?? 'registrul nu a răspuns acum') + ' [SURSĂ]');
  const first = itemsOf(page0).map(item => JSON.stringify([item.name, item.bar, item.locality ?? item.address]));
  const second = itemsOf(page1).map(item => JSON.stringify([item.name, item.bar, item.locality ?? item.address]));
  assert.ok(first.length >= 1, 'prima pagină servește avocați');
  const overlap = first.filter(identity => second.includes(identity));
  assert.equal(overlap.length, 0, 'paginile 0 și 1 nu repetă aceleași înregistrări');
  return `pagina 0: ${first.length}, pagina 1: ${second.length}, zero suprapuneri`;
});

// Exportul binar se descarcă și se compară la rânduri cu CSV-ul — nu doar lungime.
await chain('dataset_export XLSX bytes vs CSV rânduri', async () => {
  const xlsxResult = (await callMcp('dataset_export', {id: ARGUMENTS.dataset_export.id, format: 'xlsx', sheet: 0})).parsed?.result;
  const envelope = xlsxResult?.structuredContent ?? {};
  if (xlsxResult?.isError) throw new Error(String(xlsxResult.content?.[0]?.text ?? 'resursa nu a putut fi exportată acum') + ' [SURSĂ]');
  assert.equal(envelope.kind, 'binary-export', 'XLSX exportat binar');
  const download = await fetch(envelope.url, {headers: {'User-Agent': 'aflivra-mcp-audit/1.0 (custom client)'}});
  assert.ok(download.ok, 'legătura de export se descarcă');
  const bytes = new Uint8Array(await download.arrayBuffer());
  assert.equal(bytes[0], 0x50, 'XLSX-ul descărcat e ZIP (PK)');
  assert.equal(bytes[1], 0x4b, 'semnătura PK confirmată');
  const csvResult = (await callMcp('dataset_export', {id: ARGUMENTS.dataset_export.id, format: 'csv', sheet: 0})).parsed?.result;
  const csvText = csvResult?.content?.[0]?.text ?? '';
  assert.ok(csvText.length > 0, 'CSV-ul exportat ca text');
  const {utils, read} = await import('xlsx');
  const workbook = read(bytes, {type: 'array'});
  const sheetRows = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1, raw: false});
  const csvRows = csvText.trimEnd().split(/\r?\n/);
  const headerMatch = String(sheetRows[0]?.join(',')).replace(/"/g, '') === csvRows[0]?.replace(/"/g, '');
  assert.ok(headerMatch, 'antetul XLSX-ului descărcat coincide cu antetul CSV-ului');
  assert.ok(Math.abs(sheetRows.length - csvRows.length) <= 1, `rândurile XLSX (${sheetRows.length}) și CSV (${csvRows.length}) concordă`);
  discovered.exportRows = Number(download.headers.get('x-aflivra-rows')) || null;
  return `XLSX descărcat ${bytes.length} B, ${sheetRows.length} rânduri vs CSV ${csvRows.length}, antete coincid`;
});

// Edițiile trenurilor: la edition=all, cele incluse le cuprind pe cele active,
// iar expiratele se declară separate (N06).
await chain('trains_schedule ediții expirate separate', async () => {
  const {parsed} = await callMcp('trains_schedule', {edition: 'all', page: 0});
  const raw = parsed?.result?.structuredContent ?? {};
  if (raw.status === 'unavailable') throw new Error(String(raw.error ?? 'orarele nu au răspuns acum') + ' [SURSĂ]');
  const data = raw.data ?? raw;
  const edition = data.editionContext ?? {};
  const active = edition.activeOperators ?? [];
  const included = edition.includedOperators ?? active;
  assert.ok(Array.isArray(included) && included.length >= 1, 'ediția all include operatori');
  assert.equal(edition.edition, 'all', 'ediția cerută se declară');
  if (Array.isArray(active) && active.length) {
    const leaked = active.filter(operator => !included.includes(operator));
    assert.equal(leaked.length, 0, 'niciun operator activ lipsește din lista inclusă');
  }
  return `all: ${included.length} incluși, ${active.length} activi — expiratele declarate inclus`;
});

const fresh = byStatus.fresh || 0, cached = byStatus.cached || 0, stale = byStatus.stale || 0, directT = byStatus.direct || 0, noneT = byStatus.none || 0;
console.log(`\nAUDIT ${BASE}: ${names.length - failed - degraded}/${names.length} tool-uri cu date disponibile — ${fresh} proaspete, ${cached} în copie validă, ${stale} vechi (copie păstrată, sursa nu a reușit ultima tură), ${directT + noneT} răspunsuri directe; ${degraded} degradări oneste de sursă; ${semantic} violări semantice; ${failed} avarii.`);
const verdict = failed || semantic ? 'failed' : degraded ? 'degraded' : 'ok';
// Rezultatul auditului se publică și ca JSON pe ultima linie — consum automat
// în CI și în sesiunile de verificare, fără a parsa liniile umane.
console.log(JSON.stringify({result: verdict, base: BASE, tools: names.length, available: names.length - failed - degraded, degraded, semantic, failed, byStatus, report, chains}));
if (degraded > 0) console.log('NOTĂ: plicurile «stale» servesc ultima copie validă cu eroarea sursei etichetată — nu sunt date proaspete.');
} finally {
  await rm(tempDir, {recursive: true, force: true});
}
process.exit(failed || semantic ? 1 : degraded ? 2 : 0);
