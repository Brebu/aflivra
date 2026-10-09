import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// MCP end to end: the protocol layer and every tool's route target are pinned
// offline (scripts/verify-mcp.mjs); this sweep proves the real wiring — every
// tool from tools/list called through /api/mcp on the dev server, each with a
// representative argument set. Network-bound routes are classified "envelope":
// the JSON-RPC contract is asserted (result, isError, content text, text↔structuredContent
// parity), never the upstream data — upstream flakiness carries its own fault matrix.
// File-backed routes are classified "seeded" and assert real data offline-deterministically.
// The coverage assertion equals tools/list exactly: a new tool cannot be silently
// untested — adding one means adding its classification row here, through the gate.

const SEED_CLASS = new Set(['stories_list', 'cinema_sites']);
const VALIDATION_CASES = new Set(['weather_forecast']);
// Exportul binar XLSX: prima componentă e resource_link, nu text; plicul poartă legătura.
const LINK_CLASS = new Set(['dataset_export']);

// Representative arguments per tool — the same shape the docs catalog documents.
const ARGUMENTS: Record<string, Record<string, unknown>> = {
  search_companies: {name: 'Banca Transilvania'},
  company_profile: {cui: '427282'},
  places_search: {q: 'spital', lat: 44.427, lon: 26.103},
  directory_registry: {kind: 'pharmacies', q: 'farmacia'},
  localities_search: {q: 'Câmpulung'},
  weather_forecast: {lat: 999, lon: 26},
  weather_alerts: {geoScope: 'national'},
  events_search: {q: 'teatru', locality: 'București'},
  cinema_sites: {},
  cinema_program: {locality: 'București', county: 'București', id: '1806', date: '2026-10-09'},
  transport_network: {kind: 'stops', locality: 'București', county: 'București'},
  transport_positions: {kind: 'vehicles', county: 'București', locality: 'București'},
  tranzy_live: {locality: 'Iași', county: 'Iași'},
  flights_status: {q: 'W6'},
  flight_board: {airport: 'henri-coanda'},
  trains_schedule: {q: 'IR'},
  legal_acts: {},
  court_dosar_search: {number: '6236/111/2017', institution: 'Curtea de Apel Oradea'},
  law_search: {title: 'codul civil'},
  law_document: {exactTitle: 'CODUL CIVIL din 17 iulie 2009 (*republicat*)'},
  federated_search: {q: 'buget', kind: 'stiri'},
  news_feed: {kind: 'stiri', q: 'buget'},
  catalog_datasets: {q: 'buget'},
  dataset_table: {id: '1088e792-54f4-43ad-8e4c-9b351b82d31c', sheet: 0, page: 0},
  dataset_export: {id: '1088e792-54f4-43ad-8e4c-9b351b82d31c', format: 'xlsx', sheet: 0},
  article_read: {url: 'https://www.anofm.ro/'},
  film_detail: {id: 'Q1084'},
  story_read: {id: '11889'},
  stories_list: {page: 0},
  lawyers_registry: {q: 'Popescu'},
  forensic_experts: {kind: 'experti-judiciari', locality: 'Oradea', judet: 'Bihor'},
  notaries_registry: {q: 'popa'},
  anl_housing: {q: 'bloc'},
  ancpi_integrals: {},
};

// The catalog is pinned by tools.ts itself — the sweep reads the registry order
// from the gate's pin so coverage cannot drift from the tool list.
const PINNED_NAMES: string[] = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'verify-mcp-names.json'), 'utf8'));

test.describe('MCP endpoint', () => {
  test('initialize → notifications → tools/list, protocol-honest', async ({request}) => {
    const init = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}}});
    expect(init.status()).toBe(200);
    const initialized = await init.json();
    expect(initialized.result.protocolVersion).toBe('2025-06-18');
    expect(initialized.result.serverInfo.name).toBe('aflivra');

    const notification = await request.post('/api/mcp', {data: {jsonrpc: '2.0', method: 'notifications/initialized'}});
    expect(notification.status()).toBe(202);

    const list = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 2, method: 'tools/list'}});
    const tools = (await list.json()).result.tools as Array<{name: string}>;
    expect(tools.length).toBe(PINNED_NAMES.length);
    expect(tools.map(tool => tool.name)).toEqual(PINNED_NAMES);
    expect((await request.get('/api/mcp')).status()).toBe(405);
    expect((await request.post('/api/mcp', {data: 'not json', headers: {'content-type': 'application/json'}})).status()).toBe(400);
  });

  test('every tool answers through the endpoint — seeded with data, validation with the route\'s own error, the rest with the contract envelope', async ({request}) => {
    expect(Object.keys(ARGUMENTS).sort()).toEqual([...PINNED_NAMES].sort());
    for (const name of PINNED_NAMES) {
      const response = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 3, method: 'tools/call', params: {name, arguments: ARGUMENTS[name]}}});
      expect(response.status(), `${name}: transport`).toBe(200);
      const body = await response.json();
      const result = body.result;
      expect(typeof result.isError, `${name}: isError declarat`).toBe('boolean');
      if (LINK_CLASS.has(name) && !result.isError) {
        expect(result.content[0].type, `${name}: exportul binar deschide cu legătura de resursă`).toBe('resource_link');
        const link = new URL(result.content[0].uri);
        expect(link.protocol, `${name}: legătura e absolută, utilizabilă direct`).toBe('https:');
        expect(link.pathname, `${name}: legătura țintește ruta exportului`).toBe('/api/resource-file');
        expect(result.content[0].mimeType, `${name}: MIME-ul XLSX real`).toContain('spreadsheetml');
        expect(result.structuredContent.kind, `${name}: plic binar`).toBe('binary-export');
        expect(result.structuredContent.rows, `${name}: rândurile călătoresc în plic`).toBeGreaterThan(0);
        const note = result.content[1].text;
        expect(note, `${name}: nota conține legătura`).toContain(result.structuredContent.url);
        expect(note, `${name}: fără caractere de substituție`).not.toContain('\uFFFD');
        const download = await request.get(result.structuredContent.url);
        expect(download.status(), `${name}: legătura se descarcă`).toBe(200);
        const bytes = await download.body();
        expect([bytes[0], bytes[1]], `${name}: descărcarea e un ZIP XLSX real`).toEqual([0x50, 0x4b]);
      } else {
        expect(result.content[0].type, `${name}: conținut text`).toBe('text');
        expect(result.content[0].text.length, `${name}: text neciudat`).toBeGreaterThan(2);
      }
      if (name === 'weather_forecast' && !result.isError && !Number.isFinite(ARGUMENTS[name].hours)) {
        const forecast = result.structuredContent.data;
        test.info().annotations.push({type: 'note', description: 'weather default window'});
        expect((forecast.hourly as unknown[]).length, `${name}: implicit hours=48, nu 168`).toBe(48);
        expect(forecast.hoursApplied, `${name}: fereastra aplicată se declară`).toBe(48);
        expect(forecast.windowStart, `${name}: fereastra publică ora de început`).toBeTruthy();
        expect(Date.parse(forecast.hourly[0].time) + 3600e3, `${name}: fereastra începe la ora curentă, nu la miezul nopții`).toBeGreaterThan(Date.now());
      }
      if (SEED_CLASS.has(name) && !result.isError) {
        expect(result.structuredContent.total ?? result.structuredContent.data.total, `${name}: registru seed cu total`).toBeGreaterThan(0);
      }
      if (VALIDATION_CASES.has(name)) {
        expect(result.isError, `${name}: eroarea rutei se servește onest`).toBe(true);
        expect(JSON.stringify(result.content), `${name}: mesajul rutei păstrat`).toContain('coordonate');
      }
      if (!result.isError && result.structuredContent && !LINK_CLASS.has(name)) {
        expect(JSON.parse(result.content[0].text), `${name}: textul și structuredContent poartă același răspuns`).toEqual(result.structuredContent);
      }
    }
  });

  test('boundary validation at the JSON-RPC layer', async ({request}) => {
    const unknownTool = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'not_a_tool', arguments: {}}}});
    expect((await unknownTool.json()).error.code).toBe(-32602);
    const missing = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 5, method: 'tools/call', params: {name: 'company_profile', arguments: {}}}});
    expect((await missing.json()).error.code).toBe(-32602);
    const tooLong = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 6, method: 'tools/call', params: {name: 'search_companies', arguments: {name: 'x'.repeat(501)}}}});
    expect((await tooLong.json()).error.code).toBe(-32602);
    const urlOk = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 7, method: 'tools/call', params: {name: 'article_read', arguments: {url: 'https://www.anofm.ro/' + 'a'.repeat(1900)}}}});
    const urlBody = await urlOk.json();
    expect(urlBody.error ? urlBody.error.code : urlBody.result.isError).not.toBe(-32602);
    const noArgs = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 8, method: 'tools/call', params: {name: 'company_profile'}}});
    expect((await noArgs.json()).error.code).toBe(-32602);
    const nullArgs = await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 9, method: 'tools/call', params: {name: 'company_profile', arguments: null}}});
    expect((await nullArgs.json()).error.code).toBe(-32602);
    const silent = await request.post('/api/mcp', {data: {jsonrpc: '2.0', method: 'tools/call', params: {name: 'localities_search', arguments: {q: 'București'}}}});
    expect(silent.status()).toBe(202);
    expect(await silent.text()).toBe('');
    const companyBoundary = await request.get('/api/company');
    expect(companyBoundary.status(), 'fără parametri, ruta firmei refuză: fără CUI implicit').toBe(400);
    const legalNull = await request.post('/api/legal', {data: null, headers: {'content-type': 'application/json'}});
    expect(legalNull.status(), 'JSON null la rută: 400, nu 500').toBe(400);
    const legalScalar = await request.post('/api/legal', {data: 5, headers: {'content-type': 'application/json'}});
    expect(legalScalar.status(), 'scalar la rută: 400').toBe(400);
    const legalArray = await request.post('/api/legal', {data: [], headers: {'content-type': 'application/json'}});
    expect(legalArray.status(), 'array la rută: 400').toBe(400);
    const badSheet = await request.get('/api/resource-file', {params: {id: '1088e792-54f4-43ad-8e4c-9b351b82d31c', format: 'xlsx', sheet: '999'}});
    expect(badSheet.status(), 'foaia inexistentă la export: 400, nu workbook al altor foi').toBe(400);
  });
});

// Regresiile semantice per-defect: fiecare apel dovedește comportamentul promis,
// nu doar plicul — sortarea reală, filtrele geografice, rezoluția numelor.
test.describe('semantic regressions', () => {
  test('dataset_table asc vs desc produce ordine inversă', async ({request}) => {
    const readRows = async (params: Record<string, string>) => {
      const response = await request.get('/api/resource', {params: {id: '1088e792-54f4-43ad-8e4c-9b351b82d31c', ...params}});
      const body = await response.json();
      return (body.data?.sheets?.[0]?.rows ?? body.data?.rows ?? []) as unknown[][];
    };
    const rows = await readRows({sheet: '0', page: '0'});
    test.skip(!Array.isArray(rows) || rows.length < 2, 'fără tabel semănat');
    const numeric = (value: unknown) => typeof value === 'string' && /^-?[\d.]+$/.test(value.trim()) && value.trim() !== '' ? Number(value) : null;
    const usableColumn = rows[0].findIndex((_, index) => rows.every(row => numeric(row[index]) !== null));
    test.skip(usableColumn < 0, 'fără coloană numerică în seed');
    const ascRows = await readRows({sheet: '0', page: '0', sort: String(usableColumn)});
    const descRows = await readRows({sheet: '0', page: '0', sort: String(usableColumn), desc: '1'});
    expect(descRows.length, 'desc: același număr de rânduri').toBe(ascRows.length);
    expect(Number(descRows[0][usableColumn]), 'desc: prima valoare e maximă').toBeGreaterThanOrEqual(Number(ascRows[0][usableColumn]));
    expect(String(descRows[0][usableColumn]), 'desc: primul rând diferă de asc').not.toBe(String(ascRows[0][usableColumn]));
  });

  test('events_search aplică text, localitate și sală împreună', async ({request}) => {
    const call = async (args: Record<string, unknown>) => (await (await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 50, method: 'tools/call', params: {name: 'events_search', arguments: args}}})).json()).result;
    const cluj = await call({q: 'Opera', locality: 'Cluj-Napoca', county: 'Cluj'});
    if (!cluj.isError) {
      const items = cluj.structuredContent.data?.items ?? [];
      for (const item of items) expect(item.city, 'zona Cluj exclude alte orașe').not.toBe('București');
    } else {
      expect(cluj.structuredContent?.error ?? '', 'zonă validă: fără eroare de parametri').not.toContain('Locație');
    }
    const odeon = await call({q: 'teatru', venue: 'Teatrul Odeon', locality: 'București', county: 'București'});
    expect(odeon.isError, 'sala cerută prin denumirea uzuală se rezolvă').toBe(false);
    if (!odeon.isError) for (const item of odeon.structuredContent.data?.items ?? []) expect(item.venue, 'venue: doar Odeon').toBe('odeon');
    const zero = await call({q: 'zzzz_aflivra_audit_20261009', locality: 'Cluj-Napoca', county: 'Cluj'});
    expect(zero.isError, 'zero potriviri NU e eroare').toBe(false);
    expect(zero.structuredContent.data?.total ?? 0, 'total onest zero').toBe(0);
    expect(zero.structuredContent.status, 'starea descrie sursele, nu cardinalitatea').not.toBe('unavailable');
  });

  test('județul și camera se cer cu orice ortografie normală', async ({request}) => {
    const call = async (name: string, args: Record<string, unknown>) => (await (await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 51, method: 'tools/call', params: {name, arguments: args}}})).json()).result;
    const spellings = ['București', 'Bucureşti', 'BUCURESTI'];
    let total: number | null = null;
    for (const judet of spellings) {
      const r = await call('forensic_experts', {kind: 'experti-judiciari', locality: 'București', judet});
      const t = r.isError ? -1 : (r.structuredContent.data?.total ?? -1);
      if (total === null) total = t;
      expect(t, 'aceeași zonă, aceleași totaluri').toBe(total);
    }
    expect(total ?? 0, 'registroanele seedy au experți în București').toBeGreaterThan(0);
    const a = await call('notaries_registry', {q: 'popa', chamber: 'București'});
    const b = await call('notaries_registry', {q: 'popa', chamber: 'BUCUREŞTI'});
    expect(b.isError ? -1 : (b.structuredContent.data?.total ?? -1), 'camera notarială: ortografiile rezolvă la fel').toBe(a.isError ? -1 : (a.structuredContent.data?.total ?? -1));
    expect(b.isError ? 0 : (b.structuredContent.data?.total ?? 0), 'camera București are notari').toBeGreaterThan(0);
  });

  test('trains_schedule: numărul filtrează panoul, edițiile expirate nu intră în curent', async ({request}) => {
    const call = async (args: Record<string, string>) => (await (await request.get('/api/trains', {params: args})).json()).data;
    const d = await call({station: '10017'});
    test.skip(!d?.departures?.length, 'fără corpus de trenuri semănat local');
    for (const row of d.departures as Array<{d: string}>) {
      expect(row.d, 'destinația plecării nu e gara înseși').not.toBe(d.station.name);
    }
    const ghost = await call({station: '10017', q: '99999999'});
    expect((ghost.departures as unknown[]).length, 'numărul inexistent întoarce panou gol, nu tot panoul').toBe(0);
    const all = await call({station: '10017', edition: 'all'});
    expect((all.departures as unknown[]).length, 'arhiva completă cuprinde cel puțin edițiile curente').toBeGreaterThanOrEqual((d.departures as unknown[]).length);
    expect((all.editionContext.activeOperators as string[]).length, 'activeOperators rămân valabile la dată și în arhivă').toBe((d.editionContext.activeOperators as string[]).length);
    expect((all.editionContext.includedOperators as string[]).length, 'includedOperators descriu arhiva întreagă').toBeGreaterThan((all.editionContext.activeOperators as string[]).length);
    const archiveExpired = (all.operators as Array<{expired?: boolean}>).filter(operator => operator.expired);
    expect(archiveExpired.length, 'edițiile istorice rămân expired în arhivă').toBeGreaterThan(0);
    const expired = (d.operators as Array<{expired?: boolean}>).filter(operator => operator.expired);
    expect(expired.length, 'edițiile expirate se semnalează distinct în sumar').toBeGreaterThan(0);
    for (const row of d.arrivals as Array<{f: string}>) {
      expect(row.f, 'sosirile nu includ trenuri care își încep ruta în gara panoului').not.toBe(d.station.name);
    }
  });

  test('weather: fereastra orară curentă la hours explicit', async ({request}) => {
    const one = await request.get('/api/weather', {params: {lat: '44.427', lon: '26.103', hours: '1'}});
    const body = await one.json();
    test.skip(!body.data?.hourly?.length, 'fără copie meteo local');
    expect((body.data.hourly as unknown[]).length, 'hours=1: un singur rând').toBe(1);
    expect(body.data.windowStart, 'windowStart publicat').toBeTruthy();
    expect(Date.parse(body.data.hourly[0].time) + 3600e3, 'bucketul servit e cel în curs/viitor, nu trecut').toBeGreaterThan(Date.now() - 3600e3);
  });

  test('localities: localitățile urbane poartă coordonatele cartografiate', async ({request}) => {
    const response = await request.get('/api/localities', {params: {q: 'Brașov'}});
    const body = await response.json();
    const items = body.data?.items ?? [];
    test.skip(!items.length, 'fără registru SIRUTA local');
    const city = items.find((item: {name: string}) => item.name.toUpperCase().startsWith('BRA')) as {lat?: number; lon?: number};
    expect(Number.isFinite(city?.lat) && Number.isFinite(city?.lon), 'BRAȘOV urben are lat/lon').toBe(true);
  });

  test('court_dosar_search: instanța se cere prin denumire sau id', async ({request}) => {
    const invalid = await (await request.post('/api/mcp', {data: {jsonrpc: '2.0', id: 52, method: 'tools/call', params: {name: 'court_dosar_search', arguments: {number: '6236/111/2017', institution: 'Sky Net SRL', numberScope: 'filtered'}}}})).json();
    expect(invalid.result.isError, 'instanța invalidă e onest respinsă').toBe(true);
    expect(invalid.result.content[0].text, 'mesajul numește instanța, nu numărul').toContain('instan');
  });
});
