#!/usr/bin/env node
// Auditul live MCP: toate tool-urile, pe producție, cu probe reale. Rules:
// - UA de client real (workers.dev respinge liste de bot-UA înainte de Worker:
//   „Python-urllib" primește 1010 de la Cloudflare — documentat în docs/mcp.md).
// - Acceptanța onestă: isError=false = verde; stările stale/unavailable de sursă se
//   raportează ca clasă 2 (informațional) — ultima succesiune contează, nu doar 200.
// - Coduri de ieșire: 0 = toate au răspuns; 1 = avarie de transport de-a noastră
//   (JSON-RPC invalid, endpoint mort); 2 = cel puțin o sursă degradată onest.
// - Probe de dosar doar pe număr — fără nume de părți (regula PII a probei judecătorești).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const BASE = process.argv[2] || 'https://aflivra.brebu.workers.dev';
const names = JSON.parse(await readFile(join(root, 'scripts/verify-mcp-names.json'), 'utf8'));
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
  cinema_program: {locality: 'București', county: 'București', id: '1806', date: new Date().toISOString().slice(0, 10)},
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

const PROBE = {
  search_companies: 'items[0].name + „ CUI=" + items[0].cui',
  company_profile: 'data.name',
  places_search: 'items.length + „ locuri"',
  directory_registry: 'data.total + „ înregistrări"',
  localities_search: 'items[0].name + „ / " + items[0].county',
  weather_forecast: 'data.current.temperature_2m + „ °C"',
  weather_alerts: 'starea ANM (gol = fără avertizări active)',
  events_search: 'items.length + „ evenimente"',
  cinema_sites: 'data.total + „ locații"',
  cinema_program: 'data.films?.length + „ filme"',
  transport_network: 'data.total + „ intrări de rețea"',
  transport_positions: 'items.length + „ vehicule live"',
  tranzy_live: 'items.length + „ vehicule live"',
  flights_status: 'items.length + „ aeronave"',
  flight_board: 'starea panoului',
  trains_schedule: 'items.length + „ stații/trenuri"',
  legal_acts: 'items.length + „ acte urmărite"',
  court_dosar_search: 'items.length + „ etape de dosar"',
  law_search: 'starea căutării legislative',
  law_document: 'forma consolidată cerută',
  federated_search: 'items.length + „ rezultate federate"',
  news_feed: 'items.length + „ articole"',
  catalog_datasets: 'results?.length + „ seturi"',
  dataset_table: 'sheets[0].columns.slice(0,4).join(",")',
  dataset_export: 'content lungime (CSV text)',
  article_read: 'starea citirii articolului',
  film_detail: 'data.label',
  story_read: 'data.title',
  stories_list: 'data.total + „ lucrări"',
  lawyers_registry: 'items.length + „ avocați"',
  forensic_experts: 'items.length + „ experți"',
  notaries_registry: 'items.length + „ notari"',
  anl_housing: 'starea registrului ANL',
  ancpi_integrals: 'registrul ANCPI (integrals)',
};

assert.deepEqual([...names].sort(), Object.keys(ARGUMENTS).sort(), 'auditul acoperă fiecare tool din pin — un tool fără probe însemnând un audit mincinos');

let degraded = 0, failed = 0;
const byStatus = {};
for (const name of names) {
  const body = JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: ARGUMENTS[name]}});
  let response, parsed;
  try {
    response = await fetch(`${BASE}/api/mcp`, {method: 'POST', headers: {'content-type': 'application/json', 'User-Agent': 'aflivra-mcp-audit/1.0 (custom client)'}, body});
    parsed = await response.json();
  } catch (error) {
    failed++;
    console.log(`AVARIE ${name}: ${error instanceof Error ? error.message : error}`);
    continue;
  }
  if (parsed.error) {
    failed++;
    console.log(`AVARIE ${name}: JSON-RPC ${parsed.error.code} ${parsed.error.message}`);
    continue;
  }
  const result = parsed.result;
  if (result.isError) {
    failed++;
    console.log(`EROARE ${name}: ${result.content[0].text.slice(0, 120)}`);
    continue;
  }
  const envelope=result.structuredContent||{};
  const status = envelope.status ?? (envelope.items||envelope.total!==undefined?'direct':'none');
  const servedText = !result.isError && (result.content[0]?.type==='resource_link' || typeof result.content[0]?.text==='string' && result.content[0].text.length>2);
  const hasData = !!(envelope.data||envelope.items||envelope.total!==undefined||envelope.kind==='binary-export')||(status==='none'&&servedText);
  if (!hasData || status === 'unavailable') {
    degraded++;
    console.log(`SURSĂ ${name}: ${status} — ${String(result.structuredContent?.error || 'fără date acum').slice(0, 100)} | probe: ${PROBE[name]}`);
    continue;
  }
  // Prospețimea și disponibilitatea se numără separat: un plic în copie
  // (cached) sau vechi (stale) are DATE DISPONIBILE, nu „date proaspete”.
  byStatus[status==='none'?'direct':status]=(byStatus[status==='none'?'direct':status]||0)+1;
  console.log(`OK ${name}: ${status}${status==='none'?' (răspuns text integral)':''} | probe: ${PROBE[name]}`);
}
const fresh=byStatus.fresh||0,cached=byStatus.cached||0,stale=byStatus.stale||0,directT=byStatus.direct||0;
console.log(`\nAUDIT ${BASE}: ${names.length - failed - degraded}/${names.length} tool-uri cu date disponibile — ${fresh} proaspete, ${cached} în copie validă, ${stale} vechi (copie păstrată, sursa nu a reușit ultima tură), ${directT} răspunsuri directe; ${degraded} degradări oneste de sursă; ${failed} avarii.`);
if(stale>0)console.log('NOTĂ: plicurile «stale» servesc ultima copie validă cu eroarea sursei etichetată — nu sunt date proaspete.');
process.exit(failed ? 1 : degraded ? 2 : 0);
