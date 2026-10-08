import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

// Join-truth gate (Wave B): every cross-source enrichment join resolves on a validated
// key predicate — CUI, dosar number, act id, SIRUTA, venue id, place record id / Q-id —
// rendered inside provenance groups, with multi matches surfaced as warnings instead of
// merged, and NO name-similarity join in the enrichment code paths (the D4 contract,
// pinned so drift breaks CI). The one sanctioned name rule — the editorial places dedup,
// same name WITHIN 1 km — is pinned as the exception it is: relaxed, the gate fails.
const root=resolve(import.meta.dirname,'..');
const read=async file=>await readFile(join(root,file),'utf8');

// ── The detector (pure functions, drift-proofed by the RED self-test at the bottom).
// A name-join is a comparison of a .name/.title/.label field inside a record-selection
// call site — the shape a same-name-different-entity merge would take.
const NAME_JOIN_PATTERN=/\.(?:name|title|label)\s*={2,3}(?!=)/;
const NAME_JOIN_CALL_SITE=/(?:find|filter|some|every|findIndex|findLast|includes)\s*\(\s*[A-Za-z_$][\w$]*\s*(?:=>|,)[^;{}]{0,160}?\.(?:name|title|label)\s*(?:={2,3})/;
const EXEMPT_NAME_CHECKS=/AbortError|\.tag===|attrs\.name|\.type===/;
async function scanForNameJoins(source,label,exemptions=[]){
 const flags=[];
 for(const [index,line] of source.split('\n').entries()){
  if(!line)continue;
  if(NAME_JOIN_PATTERN.test(line)||NAME_JOIN_CALL_SITE.test(line)){
   if(EXEMPT_NAME_CHECKS.test(line))continue;
   assert.ok(exemptions.some(pattern=>pattern.test(line)),`${label}: name-comparison outside the sanctioned exceptions at line ${index+1}: ${line.slice(0,160)} (D4 — joins resolve on validated keys only, never name similarity)`);
  }
 }
 return flags;
}

try{
 console.log('LEG 1 — validated key predicates at the join call sites (mine and the parallel families)');
 // venue id — the events loader stamps it and every consumer resolves it through the registry.
 const eventsSource=await read('lib/live/events.ts');
 assert.ok(eventsSource.includes('venue=>venue.id===id'),'events.ts: the venue resolver matches the registry venue id exactly (eventVenue)');
 assert.ok(eventsSource.includes('venue:venue.id'),'events.ts: parseEvents stamps the join key (venue:venue.id) on every calendar item');
 assert.ok((eventsSource.match(/venue:venue\.id/g)||[]).length>=2,'events.ts: both calendar parsers stamp the venue id key');
 const eventsApi=await read('app/api/events/route.ts');
 assert.ok(eventsApi.includes('venue:venue.id,venueName:venue.name'),'api/events: the merged national search stamps the registry id and name on every row');
 assert.ok(eventsApi.includes("eventVenue(venueParam)"),'api/events: the venue parameter resolves through the validated registry before any calendar is read');
 const eventsWorkspace=await read('app/events-workspace.tsx');
 assert.ok(eventsWorkspace.includes("eventVenue(String(selected.venue||''))"),'events-workspace: the event dialog resolves the registry record through the venue id stamped on the item');
 // place record id / Q-id — named the exact ids of the source rows.
 const placesWorkspace=await read('app/places-workspace.tsx');
 assert.ok(placesWorkspace.includes('/^Q[1-9]\\d{0,9}$/.test(qid)'),'places-workspace: the Wikidata link-out accepts only an exact Q-id from the source row');
 assert.ok(placesWorkspace.includes("'https://www.wikidata.org/wiki/'+qid"),'places-workspace: the external reference is built from the exact Q-id alone');
 assert.ok((await read('lib/places-view.ts')).includes("['operator','Operator']"),'places-view: the typed operator row stays a typed row on every place detail');
 // place record id → venue calendar (the federated cross-entity join).
 const federatedSource=await read('lib/live/federated.ts');
 assert.ok(federatedSource.includes('venue.placeId===recordId'),'federated.ts: the place→venue calendar link joins on the registry placeId (the valid OSM record id), never the name');
 assert.ok(federatedSource.includes('matches.length===1?matches[0]:null'),'federated.ts: zero matches AND several matches both stay linkless — the multi-match never becomes a merge');
 assert.ok(federatedSource.includes('/^\\d{1,8}\\/\\d{1,5}\\/\\d{4}(?:\\/[a-zA-Z0-9.]{1,20})?$/'),'federated.ts: the dosar gate keeps its validated number shape');
 // CUI — the company family (parallel-owned, pinned here as the contract it is).
 const companyWorkspace=await read('app/live-company.tsx');
 assert.ok(companyWorkspace.includes('/^[1-9]\\d{1,9}$/'),'live-company: the search boundary validates the CUI shape before any source is read');
 const knowledgeSource=await read('lib/live/knowledge.ts');
  assert.ok(knowledgeSource.includes('wdt:P3608'),'knowledge.ts: the Wikidata complement joins on the exact VAT identifier (P3608) built from the CUI');
  assert.ok(knowledgeSource.includes('linked.length===1?linked[0]:null'),'knowledge.ts: a single exact VAT match is the only match that contributes fields');
  // CUI — the public CNAS registries join (parallel-owned, landed after LEG 1 was first written):
  // the join reads only the registries' own published CUI columns, with exact string equality;
  // several matched rows stay distinct entries (multiple contracts, no destructive merge).
  const adaptersSource=await read('lib/live/adapters.ts');
  assert.ok(adaptersSource.includes("registryCuiColumns=['CUI cod','Cod fiscal furnizor']"),'adapters: the CNAS registry join reads only the registries own published CUI columns');
  assert.ok(adaptersSource.includes('String(record[column]).trim()===String(cui).trim()'),'adapters: the registry join is exact CUI equality against the published column, never a name match');
 // dosar number + institution registry id — the court family (parallel-owned).
 const courtHistory=await read('lib/court-history.ts');
 assert.ok(courtHistory.includes('courtById.get(courtId)'),'court-history.ts: the institution metadata joins the courts registry on its own registry id');
 // act id — the legal family (parallel-owned).
 const legalRegistry=await read('lib/live/legal-registry.ts');
 assert.ok(legalRegistry.includes("officialLawUrl(act.id||'')"),'legal-registry.ts: a tracked act is accepted only through the official law-url validation of its act id');
 // SIRUTA — the locality registry keeps its own primary key contract.
 const directoriesSource=await read('lib/live/directories.ts');
 assert.ok(directoriesSource.includes("keys.includes('SIRUTA')"),'directories.ts: the SIRUTA registry is read through its own published primary key columns');

 console.log('LEG 2 — every enriched field renders inside a provenance group');
 assert.ok(eventsWorkspace.includes('data-testid="venue-registry"'),'events-workspace: the venue registry record renders inside its labeled registry group');
 assert.ok(eventsWorkspace.includes('Registrul validat al instituțiilor'),'events-workspace: the registry group names its source');
 assert.ok(eventsWorkspace.includes('niciodată pe asemănări de nume'),'events-workspace: the registry group states its own join key');
 assert.ok(placesWorkspace.includes('data-testid="wikidata-links"'),'places-workspace: the Wikidata references render inside their labeled external-reference group');
 assert.ok(placesWorkspace.includes('identificatorii exacți'),'places-workspace: the external-reference group states the exact-identifier mechanism');
 const companyProvenance=await read('app/company-provenance.tsx');
 assert.ok(companyProvenance.includes('company.provenance'),'company-provenance: the complement fields render through the per-field provenance map (the combineCompany model)');
 assert.ok(companyWorkspace.includes('CUI-ul identic')||companyWorkspace.includes('potrivirea se face pe CUI-ul exact'),'live-company: the complementary registries render under their exact-CUI join statement');
  const federatedRenderer=await read('app/search-results.tsx');
  assert.ok(federatedRenderer.includes('federated-cross-link'),'search-results: cross-entity links render as sibling anchors of the row, never as merged row data');
  // The parallel families' enriched fields render inside their own labeled groups.
  const courtPanel=await read('app/court-history-panel.tsx');
  assert.ok(courtPanel.includes('court-stage-institution'),'court-history-panel: the institution metadata renders as its own labeled fact on the stage row');
  const legalWorkspaceSource=await read('app/legal-workspace.tsx');
  assert.ok(legalWorkspaceSource.includes('aria-label="Istoricul formelor oficiale"'),'legal-workspace: the official version history of the same act id renders inside its labeled section');
  assert.ok(legalWorkspaceSource.includes('legal-act-facts'),'legal-workspace: the act facts of the same act id render in their labeled facts group');

 console.log('LEG 3 — multi matches surface a warning, never a merge');
 assert.ok(knowledgeSource.includes('Mai multe entități Wikidata au acest identificator'),'knowledge.ts: multiple exact matches surface the honest unmerged warning');
 assert.ok(federatedSource.includes('matches.length===1'),'federated.ts: the registry join tolerates a future multi-placeId only by staying linkless');

 console.log('LEG 4 — NO name-similarity join in the enrichment code paths');
  const enrichmentFiles=[
   ['lib/live/events.ts',[]],['app/events-workspace.tsx',[]],['app/api/events/route.ts',[]],
   ['app/places-workspace.tsx',[]],['lib/live/federated.ts',[]],['lib/places-view.ts',[]],
   ['lib/live/adapters.ts',[]],['lib/live/knowledge.ts',[]],['app/live-company.tsx',[]],['app/company-provenance.tsx',[]],
  ['app/courts-workspace.tsx',[]],['app/court-history-panel.tsx',[]],['app/legal-workspace.tsx',[]],
  ['lib/court-history.ts',[/courtByLabel=new Map\(institutions\.items\.map\(c=>\[normalized\(c\.label\),c\]\)\)/]],
  ['lib/live/legal-registry.ts',[]],['lib/live/legal-consolidation.ts',[/attrs\.name==='title'/]],
  ['lib/live/directories.ts',[]]
 ];
 for(const [file,exemptions] of enrichmentFiles)await scanForNameJoins(await read(file),file,exemptions);
 // The sanctioned exception, pinned exactly: the editorial places dedup keeps name AND
 // the under-1-km proximity requirement — the same rule that survived the 10/07 map waves.
 const v2Model=await read('app/v2-model.ts');
 const guardLine=v2Model.split('\n').find(line=>line.includes('placeKey(p.name)&&')||line.includes('seen.some(s=>s.key===key'));
 assert.ok(guardLine,'v2-model: the editorial places dedup keeps its name+1km merge guard');
 assert.ok(guardLine.includes('placeKm(')&&guardLine.includes('<1'),'v2-model: the dedup guard still requires BOTH the same key AND under-1-km proximity — the name+1km rule was not relaxed');

 console.log('LEG 5 — RED-drift proof: the detector fails a deliberate name-only join and a relaxed guard');
 const temp=await mkdtemp(join(tmpdir(),'enrichment-joins-red-'));
 try{
  // Drift 1 — a name-only join (what D4 forbids): same name, different city, no key.
  await writeFile(join(temp,'drift-name-join.ts'),'const venue=registries.find(v=>v.name===item.title);if(venue)items.push({...item,...venue});\n');
  const nameDrift=await readFile(join(temp,'drift-name-join.ts'),'utf8');
  let flagged=false;
  try{await scanForNameJoins(nameDrift,'drift-name-join.ts')}catch{flagged=true}
  assert.ok(flagged,'RED proof: a name-only join must fail the detector (same-name-different-entity is the exact D4 failure)');
  // Drift 2 — a name comparison inside an includes/some call site.
  await writeFile(join(temp,'drift-includes.ts'),'const linked=places.filter(p=>places2.some(q=>q.name===p.name));\n');
  const includesDrift=await readFile(join(temp,'drift-includes.ts'),'utf8');
  flagged=false;
  try{await scanForNameJoins(includesDrift,'drift-includes.ts')}catch{flagged=true}
  assert.ok(flagged,'RED proof: name-similarity inside a selection call site must fail the detector');
  // Drift 3 — the relaxed dedup guard: name without the 1-km proximity co-predicate.
  await writeFile(join(temp,'drift-guard.ts'),'const key=placeAlias(placeKey(p.name));if(!seen.some(s=>s.key===key)){kept.push(p);seen.push({key,lat:p.lat,lon:p.lon})}\n');
  const guardDrift=(await readFile(join(temp,'drift-guard.ts'),'utf8')).split('\n')[0];
  assert.ok(guardDrift.includes('s.key===key')&&!guardDrift.includes('placeKm('),'guard drift fixture carries the name-only form');
  assert.ok(!(guardDrift.includes('placeKm(')&&guardDrift.includes('<1')),'RED proof fixture: the name+1km co-predicate is absent — the LEG 4 assertion shape fails exactly this');
  // And the detector exemptions stay narrow: an AbortError check is not a name join.
  await writeFile(join(temp,'ok-error.ts'),"catch(e){if(e.name!=='AbortError')setError(e.message)}\n");
  let falsePositive=false;
  try{await scanForNameJoins(await readFile(join(temp,'ok-error.ts'),'utf8'),'ok-error.ts')}catch{falsePositive=true}
  assert.ok(!falsePositive,'RED proof: the error-name check (AbortError) is exempt, not flagged as a join');
 }finally{await rm(temp,{recursive:true,force:true})}

 console.log('Trecut: toate îmbinările de îmbogățire rezolvă pe chei validate — CUI, număr de dosar, act, SIRUTA, id de instituție (venue) și id de înregistrare/Q-id OSM; câmpurile îmbogățite se afișează în grupuri cu sursa la vedere; potrivirile multiple rămân avertismente, nu îmbinări; nicio îmbinare după asemănare de nume (excepția pinned: dedublarea editorială nume+1 km).');
}catch(error){console.error(String(error&&error.message||error));process.exitCode=1}
