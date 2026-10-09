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
  dataset_export: {id: '1088e792-54f4-43ad-8e4c-9b351b82d31c'},
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
      expect(result.content[0].type, `${name}: conținut text`).toBe('text');
      expect(result.content[0].text.length, `${name}: text neciudat`).toBeGreaterThan(2);
      if (SEED_CLASS.has(name) && !result.isError) {
        expect(result.structuredContent.total ?? result.structuredContent.data.total, `${name}: registru seed cu total`).toBeGreaterThan(0);
      }
      if (VALIDATION_CASES.has(name)) {
        expect(result.isError, `${name}: eroarea rutei se servește onest`).toBe(true);
        expect(JSON.stringify(result.content), `${name}: mesajul rutei păstrat`).toContain('coordonate');
      }
      if (!result.isError && result.structuredContent) {
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
  });
});
