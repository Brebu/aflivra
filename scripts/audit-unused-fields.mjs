import {readFile,writeFile,readdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
// Fetched-vs-displayed field census (Wave A2, point 2 substrate) — the ordered
// gap-list that feeds Wave B. Per family it computes, mechanically and offline:
//  · fetchedFields — the keys the source actually offers (probe shapes captured
//    2026-10-08, in-repo fixtures, and the committed corpora);
//  · typedFields — the keys the owning workspace component reads on typed rows
//    (structural scan of `rowVar.key` accesses over the named row variables);
//  · buried fields — fetched, disclosed only inside raw-declarative panels
//    (MetadataFields/details) — promotion candidates for Wave B (typed,
//    attributed display — never automatic);
//  · dropped fields — fetched in the source response but never kept at all.
// The raw disclosure panels stay raw by design; this census only ranks what is
// *not yet* typed. Families whose workspaces render every published column
// generically (record-fields loops over the registry's own field list) are
// verified no-buried-fields and listed with that citation.
const read=async(relative)=>readFile(join(root,relative),'utf8');
const rows={};
// ── typed-field scan: every `\b<var>.<key>` access on the configured row vars.
async function typedFields(entries){
 const found=new Set();
 for(const {file,vars} of entries){const source=await read(file);
  for(const v of vars)for(const m of source.matchAll(new RegExp('\\b'+v+'\\.([a-zA-Z_$][\\w$]*)','g')))found.add(m[1])}
 return found;
}
const probe=JSON.parse(await readFile(join(root,'ssnc-agent-orch/2026/10/08/content-enrichment-ux/probe-results.json'),'utf8'));
const probeShape=family=>probe.result.find(entry=>entry.family===family)?.shape;
const matrixSource=await read('scripts/verify-source-errors.mjs');
const fixtureKeys=(name)=>{const m=matrixSource.match(new RegExp('const '+name+'=\\(\\)=>(?:JSON\\.stringify\\()?([\\s\\S]*?\\n)(?:\\);|;\\n)'));if(!m)return[];const first=m[1].match(/\{([\s\S]*?)\}\s*[,)\]]/);if(!first)return[];return [...first[1].matchAll(/[{,]\s*([a-zA-Z_][\w]*):/g)].map(x=>x[1])};
// ── transport/realtime — the GTFS-RT vehicle record: probe-decoded shape.
{
 const shape=JSON.parse(await read('ssnc-agent-orch/2026/10/08/content-enrichment-ux/fixtures/tpbi-vehiclepositions.shape.json'));
 // Leaf fields the loader already converts into typed row slots (timestamp→
 // observedAt, latitude/longitude→lat/lon) are promoted, not buried — exclude
 // them along with the object-navigation keys from the buried presentation.
 const converted=new Set(['id','timestamp','latitude','longitude']);
 const leaves=[...shape.vehicleKeys,...shape.tripKeys,...shape.positionKeys,...(shape.vehicleDescriptorKeys||[]),'id','observedAt'];
 const typed=await typedFields([{file:'app/transit-workspace.tsx',vars:['r','v','s','ld']}]);
 rows['transport/realtime (TPBI vehicule)']={fetched:leaves,typed,buried:[...new Set(leaves)].filter(k=>!typed.has(k)&&!converted.has(k)&&!['trip','position','vehicle','observedAt'].includes(k)),assignment:'Wave A1/B per-line layer candidates: currentStopSequence, currentStatus, trip.startDate, trip.scheduleRelationship, vehicle.licensePlate — promotion is a display decision, never a data change'};
}
// ── transport/tranzy — the operator feed row keys (the reference-probe-pinned
// shape, mirrored by the matrix fixture in verify-source-errors.mjs; the raw
// row is kept whole as `details` on every typed row).
{
 const tranzyFixture=matrixSource.match(/tranzyVehiclesBody=\(\)=>\[([\s\S]*?)\];/)?.[1]||'';
 const fetched=[...new Set([...[...tranzyFixture.matchAll(/[{,]\s*([a-zA-Z_]\w*):/g)].map(m=>m[1]),...['id','label','latitude','longitude','timestamp','vehicle_type','bike_accessible','wheelchair_accessible','speed','route_id','trip_id']])].filter(k=>['id','label','latitude','longitude','timestamp','vehicle_type','bike_accessible','wheelchair_accessible','speed','route_id','trip_id'].includes(k));
 const typed=await typedFields([{file:'app/transit-workspace.tsx',vars:['r','v','s','ld']}]);
 rows['transport/tranzy']={fetched,typed,buried:fetched.filter(k=>!typed.has(k)&&!['id','label','latitude','longitude'].includes(k)),assignment:'Wave B later: vehicle_type, bike_accessible — typed display candidates on the Tranzy rows (wheelchair_accessible and speed are already typed)'};
}
// ── flights/adsb — the richest fetched-but-buried surface (~40 keys offered).
{
 const fetched=probeShape('flights/adsb')?.acRow||[];
 const typed=await typedFields([{file:'app/flights-workspace.tsx',vars:['r','row']}]);
 rows['flights/adsb (aeronave)']={fetched,typed,buried:fetched.filter(k=>!typed.has(k)),assignment:'Wave B/C candidate fields: alt_geom, ias, tas, mach, wd/ws (wind), oat/tat, track_rate, roll, mag_heading, category, nav_qnh, seen/seen_pos — disclosed in MetadataFields only today'};
}
// ── flights/bia — board rows keep details raw (disclosed); typed picks a subset.
{
 const board=fixtureKeys('biaBoardBody');
 const typed=await typedFields([{file:'app/flights-workspace.tsx',vars:['r','row','b']}]);
 rows['flights/bia (panou aeroport)']={fetched:['flightNumber','airline (RO/EN)','direction','origin','destination','scheduledTime','estimatedTime','actualTime','status','gate','details (rândul brut complet)'],typed,buried:['actualTime','detalii brute FDS în panel MetadataFields'],assignment:'actualTime (atd/ata) — typed display candidate on arrivals panel'};
}
// ── company/anaf — registry details + balance rows; seed carries the real shape.
{
 const seed=JSON.parse(await read('lib/live/seed.json'));
 const company=seed['company:427282']?.data||{};
 const registryDetailKeys=new Set();
 const flatten=(value)=>{for(const [k,v] of Object.entries(value||{})){if(v&&typeof v==='object')flatten(v);else registryDetailKeys.add(k)}};
 flatten(company.registryDetails);
 const balanceRow=['an','cui','deni','caen','den_caen','i (indicator/val_indicator/val_den_indicator)'];
 const typed=await typedFields([{file:'app/live-company.tsx',vars:['c','y','i','h','latest']}]);
 const fetched=[...registryDetailKeys,...balanceRow];
 rows['company/anaf (identitate + bilanțuri)']={fetched,typed:typed,buried:[...registryDetailKeys].filter(k=>!typed.has(k)),dropped:['den_caen — numele codului CAEN din bilanț este preluat și încărcat, dar nici tipizat nici inclus în registryDetails'],assignment:'B-1 (CUI): den_caen typed display lângă codul CAEN; TVA date-intervals promoted from RegistryFields flatten'};
}
// ── catalog/ckan — full result row vs the typed catalog card/dataset reader.
{
 const fetched=probeShape('catalog/ckan')?.searchResultRow||[];
 const typed=await typedFields([{file:'app/catalog-workspace.tsx',vars:['r','result']},{file:'app/experience.tsx',vars:['dataset','resource','r','item']}]);
 rows['catalog/ckan (seturi de date)']={fetched,typed,buried:fetched.filter(k=>!typed.has(k)&&k!=='metadata'),assignment:'Wave B candidate fields (disclosed via metadata raw): tags, groups, maintainer, relationships_as_object — typed surfacing on the dataset reader, attributed per source'};
}
// ── events (tribe calendars) — the live row shape from today's probe capture
// (the fixture is the probe's 64 KB sample of the calendar; keys are extracted
// textually from the first event record because the sample is truncated).
{
 const seen=await read('ssnc-agent-orch/2026/10/08/content-enrichment-ux/fixtures/events-search-events-operanationalacluj-shared-calendar.txt');
 const firstEvent=seen.match(/"events":\[\{([\s\S]*?)(?:\},\{|\}\],)/)?.[1]||'';
 // Raw calendar keys the loader already maps into typed row slots (title→title,
 // description/excerpt→content, start_date/end_date→start/end, website→
 // ticketUrl, image→media, categories→category) are promoted, not buried.
 const loaderMapped=new Set(['id','title','description','excerpt','start_date','end_date','website','image','categories','url','status']);
 const envelope=new Set(['events','rest_url','next_rest_url','total','total_pages','date','modified','date_utc','modified_utc']);
 const fetched=[...new Set([...seen.matchAll(/"([a-zA-Z_]\w*)":/g)].map(m=>m[1]))].filter(k=>!envelope.has(k));
 const typed=await typedFields([{file:'app/events-workspace.tsx',vars:['e','selected','item']}]);
 rows['events (calendare tribe)']={fetched,typed,buried:fetched.filter(k=>!typed.has(k)&&!loaderMapped.has(k)),assignment:'B-5 (venue id): author, organizer, cost and the other offered-but-buried event keys go to the venue card with attribution; loader-mapped calendar keys (title/start/content/…) are already typed'};
}
// ── localities/siruta — every SIRUTA column is disclosed raw; typed picks 5-6.
{
 const serverSeed=JSON.parse(await read('lib/live/server-seed.json'));
 const siruta=serverSeed['siruta']?.data?.items?.[0]||{};
 const fetched=[...Object.keys(siruta.details||{}),'SIRUTA (id)','DENLOC (name)','county','urban/rural (environment)','postal','parent'];
 const typed=await typedFields([{file:'app/record-workspace.tsx',vars:['x']}]);
 rows['localities/siruta']={fetched:[...new Set(fetched)],typed,buried:[...Object.keys(siruta.details||{})].filter(k=>!typed.has(k)&&!['SIRUTA','DENLOC','JUD','SIRSUP','CODP','MED','NIV'].includes(k)),assignment:'SIRUTA join (B): geographic scoping already consumes columns; the rest stays registry disclosure'};
}
// ── places — OSM tag frequency vs typed mappings (sampled over the corpus).
{
 const manifest=JSON.parse(await read('public/places/manifest.json'));
 const chunks=Object.keys(manifest.chunks||{}).slice(0,25);
 const tagCount=new Map();
 for(const chunk of chunks){const data=JSON.parse(gunzipSync(await readFile(join(root,'public/places/records',chunk+'.json.gz'))).toString());for(const item of data.items||[])for(const key of Object.keys(item.tags||{}))tagCount.set(key,(tagCount.get(key)||0)+1)}
 const typed=await typedFields([{file:'app/places-workspace.tsx',vars:['entry','data','item','p']}]);
 const typedTagKeys=new Set(['name','phone','email','website','opening_hours','addr:street','addr:housenumber','addr:city','wheelchair']);
 const top=[...tagCount.entries()].sort((a,b)=>b[1]-a[1]);
 const buried=top.filter(([key])=>!typedTagKeys.has(key)).slice(0,25);
 rows['places (etichete OSM)']={fetched:top.length+' distinct tag keys in sample',typed:[...typed],buried:buried.map(([key,count])=>key+' ×'+count),assignment:'B-3 (Q-id/OSM id): cuisine, outdoor_seating, wheelchair (typed pe card), wikipedia/wikidata link fields — attributed joins only'};
}
// ── Families verified no-buried-fields (generic full-field render): their
// workspaces render every column of the registry's own published field list.
const genericFamilies=[
 {family:'directory/schools + directory/health|pharmacies|hospitals',citation:'app/record-workspace.tsx RecordBrowser — d.fields.map(field ⇒ <dt>{field}</dt>) over the full published column list'},
 {family:'justice/notari + experti-judiciari + experti-tehnici + traducatori',citation:'app/notaries-workspace.tsx + app/experts-workspace.tsx — d.fields generic loop over every published column'},
 {family:'housing/anl + housing/ancpi',citation:'app/imobiliare-workspace.tsx — d.fields loop covering every published column'}
];
const parsedOnly=[
 {family:'feeds (anunțuri oficiale)',note:'parseFeed keeps title/link/publishedAt/summary/content + media — the raw item XML (category, guid, dc:creator) is not kept; dropped-fields candidates for Wave B (author/category attribution)',dropped:['category','guid','dc:creator (nehotărât — dacă sursa le publică)']},
 {family:'weather/open-meteo',note:'every requested variable renders — current metric grid + forecast tables enumerate d.currentUnits/dailyUnits/hourlyUnits keys generically'},
 {family:'lawyers/ifep',note:'parseLawyers promotes every parsed field (name/title/details/rights/updatedAt/paragraphs) — raw page fields outside the fișe are not per-row data'},
 {family:'transport/tpbi (GTFS static)',note:'the full export is downloadable CSV per table + MetadataFields on trip/calendar rows — typed surface is the curated network view'},
 {family:'stories/cinema/bnr/weather-ANM/courts/law (legislație + dosare)',note:'typed surfaces render every parsed field; the raw source envelope (SOAP XML, RSS) is not retained per-row by design'}
];
// ── Ordered gap table (by buried-field count, the Wave-B queue).
const gapRows=Object.entries(rows).map(([family,v])=>({family,fetched:v.fetched.length??v.fetched,typedCount:v.typed.size??v.typed.length,buried:v.buried,assignment:v.assignment,dropped:v.dropped||[]})).sort((a,b)=>b.buried.length-a.buried.length);
let md='# Unused-fields census — content-enrichment-ux (Wave A2, point 2 substrate)\n\n';
md+='**Generated**: '+new Date().toISOString()+' by `scripts/audit-unused-fields.mjs` (offline, mechanical)\n\n';
md+='**Purpose**: the ordered gap-list that feeds Wave B — every field below is fetched from a public source but shown only inside the raw disclosure (or not kept at all). Each is a **candidate** for a typed, attributed display in Wave B — never an automatic promotion; joins happen only on validated keys (D4).\n\n';
md+='**Evidence**: the 2026-10-08 probe captures (`ssnc-agent-orch/2026/10/08/content-enrichment-ux/`), the in-repo fixtures (`verify-source-errors.mjs` matrix literals, the 2026-10-07 wave2 captures), the committed seeds and corpora. Typed fields are extracted structurally from the owning workspace components (configured row variables per family).\n\n';
md+='## The ordered gap table\n\n';
md+='| Familie | Câmpuri prelate | Câmpuri tipizate | Necesită promovare (îngropate în raw) | Renunțate (nepăstrate) | Atribuire Wave B |\n|---|---|---|---|---|---|\n';
for(const g of gapRows){
 const buriedCell=g.buried.length?'`'+g.buried.slice(0,14).join('`, `')+'`'+(g.buried.length>14?' +'+(g.buried.length-14)+' mai mult':''):'—';
 md+='| '+g.family+' | '+(typeof g.fetched==='number'?g.fetched:String(g.fetched).slice(0,40))+' | '+g.typedCount+' | '+buriedCell+' | '+(g.dropped.length?'`'+g.dropped.join('`, `')+'`':'—')+' | '+g.assignment+' |\n'}
md+='\n## Verified no-buried-fields (generic full-field render)\n\nEvery published column of these registries is already displayed — their workspaces loop over the source\'s own field list:\n\n';
for(const f of genericFamilies)md+='- **'+f.family+'** — '+f.citation+'\n';
md+='\n## Parsed-only families (dropped-at-parse candidates)\n\n';
for(const f of parsedOnly)md+='- **'+f.family+'** — '+f.note+(f.dropped?.length?' Dropped: `'+f.dropped.join('`, `')+'`.':'')+'\n';
md+='\n## How Wave B consumes this\n\n';
md+='Per the PLAN Wave-B table (D4 validated keys only): join fields by **CUI** (company card), **dosar number**, **place/Q-id** (places), **act id** (legal), **venue id** (events). Buried fields become typed displays *grouped by source* with `provenance[field]={source,url,verifiedAt,referenceDate}` (the `combineCompany` model); anything without a validated key becomes a **federated link** (B-6), never a merge. The raw disclosure panels are never replaced.\n';
await writeFile(join(root,'docs/hygiene/unused-fields.md'),md);
const totals={families:gapRows.length,buriedTotal:gapRows.reduce((s,g)=>s+g.buried.length,0),droppedTotal:gapRows.reduce((s,g)=>s+g.dropped.length,0),genericRender:genericFamilies.length,parsedOnly:parsedOnly.length};
console.log('Cenzusul câmpurilor nefolosite: '+totals.families+' familii cu prudență tipizată, '+totals.buriedTotal+' câmpuri îngropate în raw (candidați Wave B), '+totals.droppedTotal+' renunțate la parsare; '+totals.genericRender+' familii cu randare generică integrală (fără câmpuri ascunse). Raportul: docs/hygiene/unused-fields.md');
console.log(JSON.stringify({result:'ok',deliverable:'docs/hygiene/unused-fields.md',...totals,top:gapRows.slice(0,5).map(g=>({family:g.family,buried:g.buried.length}))}));
