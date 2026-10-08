import {readFile,readdir,stat,writeFile,mkdir} from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const root=resolve(import.meta.dirname,'..');
// Dead-data census (Wave A2, point 11) — REPORT-ONLY. It reads the offline
// corpora and the local dev D1 state, applies the D3 per-family recency policy
// table (pinned by scripts/verify-recency-policy.mjs) and emits
// docs/hygiene/dead-data-census.md with per-family counts, samples and a
// purge-or-label recommendation. It never deletes anything: purges happen only
// in the census→review→sanction flow, and every recommendation below the
// trivial bar is explicitly PENDING-REVIEW. "Dead" means no-content,
// expired-source or irreversible-stale-without-copy — never age alone, and age
// only where the policy table sets a horizon for that family.
const now=Date.now(),today=new Date().toISOString().slice(0,10);
const horizon3y=new Date(now-3*365.25*86400000).toISOString().slice(0,10);
const currentYear=new Date().getUTCFullYear();
const census=[];const row=(entry)=>census.push(entry);
const d1Path=join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite');
let d1Exists=false;try{await stat(d1Path);d1Exists=true}catch{d1Exists=false}
const decompress=async(path)=>JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
const serverSeed=JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8'));
const baseSeed=JSON.parse(await readFile(join(root,'lib/live/seed.json'),'utf8'));
const noContentRecords=(records,fields)=>records.filter(r=>fields.every(f=>[null,undefined,''].includes(r[f])));
const feedFamilyNames={'feed:munca':'feeds/munca','feed:stiri':'feeds/stiri','feed:sanatate':'feeds/sanatate','feed:educatie':'feeds/educatie','feed:justitie':'feeds/justitie','feed:energie':'feeds/energie-transport','feed:transport':'feeds/energie-transport','feed:agricultura':'feeds/agricultura'};
// ── News feeds: horizon = last 3 years (D3 row 1). The parser guarantees
// non-empty title+http link per item, so genuinely content-free items are
// impossible by construction; a stored feed whose whole window is beyond the
// horizon is an expired-source copy and goes to review, never auto-purged.
for(const [key,data] of Object.entries(serverSeed)){
 if(!key.startsWith('feed:'))continue;
 const items=data.data?.items||[];
 const noContent=items.filter(i=>!i.title&&!i.summary&&!i.content);
 const beyond=items.filter(i=>i.publishedAt&&String(i.publishedAt).slice(0,10)<horizon3y);
 row({family:feedFamilyNames[key]||key,policy:'last 3 years (D3: news feeds)',evidence:'lib/live/server-seed.json',rows:items.length,noContent:noContent.length,beyondHorizon:beyond.length,samples:[...beyond].slice(0,2).map(i=>({publishedAt:i.publishedAt,title:String(i.title).slice(0,60)})),recommendation:beyond.length||noContent.length?'pending-review':'none',note:'stored copy is the honest last-good fallback; the source feed itself carries the recency'});
}
// ── AFIR headlines row (same news-feeds row class).
{
 const items=serverSeed['feed:agricultura']?.data?.items||[];
 row({family:'feeds/agricultura (detaliu)',policy:'last 3 years (D3: news feeds)',evidence:'lib/live/server-seed.json',rows:items.length,noContent:items.filter(i=>!i.title&&!i.url).length,beyondHorizon:items.filter(i=>i.publishedAt&&String(i.publishedAt).slice(0,10)<horizon3y).length,samples:[],recommendation:'none',note:'AFIR rows are relayed copies; recency governed by the weekly relay'});
}
// ── ANAF company history: horizon = last 3 fiscal years (D3 row 3), the
// rolling merge at cache.ts:70 enforces it live; the census verifies the stored
// seed respects the same horizon (invariant check, expected 0).
{
 const company=baseSeed['company:427282']?.data||{};
 const history=company.history||[];
 const beyond=history.filter(h=>Number(h.year)<currentYear-3);
 row({family:'company/anaf (istoric bilanțuri)',policy:'last 3 fiscal years (D3: ANAF company history)',evidence:'lib/live/seed.json',rows:history.length,noContent:history.filter(h=>!h.entries?.length).length,beyondHorizon:beyond.length,samples:beyond.map(h=>({year:h.year})),recommendation:beyond.length?'pending-review':'none',note:'firm EXISTENCE is exempt (full identity regardless of year); only balance history rolls'});
}
// ── CNAS directories: horizon = latest edition within 3 years (D3 row 4),
// enforced by the loader picking the newest candidate within the window.
{
 for(const kind of ['health','pharmacies','hospitals']){
  const data=serverSeed['directory:'+kind]?.data||{};
  const records=data.records||[];
  const allNull=records.filter(r=>Object.values(r).every(v=>[null,undefined,''].includes(v)));
  const period=String(data.period||'');
  const m=period.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  const periodIso=m?`${m[3]}-${m[2]}-${m[1]}`:'';
  row({family:'directory/'+kind,policy:'latest edition within 3y (D3: CNAS editions)',evidence:'lib/live/server-seed.json',rows:records.length,noContent:allNull.length,beyondHorizon:periodIso&&periodIso<horizon3y?1:0,samples:allNull.slice(0,2).map(r=>Object.keys(r).slice(0,4)),recommendation:allNull.length?'pending-review':'none',note:'stored edition period '+(period||'n/a')+'; the loader re-picks the newest in-window edition at expiry'});
 }
 const schools=serverSeed['directory:schools']?.data||{};
 row({family:'directory/schools',policy:'edition-governed (D3: directory seed)',evidence:'lib/live/server-seed.json',rows:schools.records?.length??schools.total??0,noContent:0,beyondHorizon:0,samples:[],recommendation:'none',note:'paged datastore copy; records are re-verified per query, no age semantics on rows'});
}
// ── News/announcements catalog: horizon = modified >= 3y (D3 row 5), enforced
// dynamically at serve time by getSeed (cache.ts:15) — the stored snapshot is
// the frozen inventory the window serves from, so rows crossing the horizon
// exit service by themselves; the census counts them (rolling edge) and also
// records the honest nuance that LIVE catalog queries (catalog:v2/v3 rows)
// carry no age filter by design ("seturile încă valabile pot avea metadate
// mai vechi" is the registered disclosure).
{
 const snapshots=JSON.parse(await readFile(join(root,'lib/live/seed-snapshots.json'),'utf8'));
 const unpacked=JSON.parse(gunzipSync(Buffer.from(snapshots.server.gzipBase64,'base64')).toString('utf8'));
 const catalogSeed=JSON.parse(gunzipSync(Buffer.from(snapshots.catalog.gzipBase64,'base64')).toString('utf8'));
 const beyond=catalogSeed.filter(r=>r.modified&&r.modified<horizon3y);
 const noContent=catalogSeed.filter(r=>!r.title&&!r.notes&&!r.organization).length;
 row({family:'catalog/ckan (inventar stocat)',policy:'modified >= 3y la servire (D3: CKAN browsing; coded at cache.ts:15)',evidence:'lib/live/seed-snapshots.json (catalog gzip)',rows:catalogSeed.length,noContent,beyondHorizon:beyond.length,samples:beyond.slice(0,3).map(r=>({modified:String(r.modified).slice(0,10),title:String(r.title).slice(0,50)})),recommendation:'none',note:beyond.length+' rând pe muchia rulantă a ferestrei de 3 ani — fereastra se aplică dinamic la servire, rândurile ies singure; interogările live nu filtrează după an (disclosure-ul „metadate mai vechi" este cel înregistrat); serve-seed kit: '+Object.keys(unpacked).filter(k=>k.startsWith('catalog:')).length+' chei catalog în server seeds'});
}
// ── Events: future-facing at display (D3 row 2) — past events are NOT dead
// data; the full calendar stays available by design ("Întregul calendar
// publicat"). Census counts past events informationally.
{
 const events=serverSeed['events:odeon']?.data?.items||[];
 const past=events.filter(e=>String(e.start).slice(0,10)<today);
 row({family:'events/odeon (calendar stocat)',policy:'future-facing display (D3: events)',evidence:'lib/live/server-seed.json',rows:events.length,noContent:events.filter(e=>!e.title||!e.start).length,beyondHorizon:0,samples:past.slice(0,2).map(e=>({start:e.start,title:String(e.title).slice(0,50)})),recommendation:'none',note:countText(past.length,'eveniment trecut rămâne în calendar — filtru de afișare, nu date moarte',' evenimente trecute rămân în calendar — filtru de afișare, nu date moarte')+'; calendarul rotunjește la următoarea preluare'});
}
// ── Films: exempt (D3 row: cultural catalog, all years by design).
{
 const films=serverSeed['films']?.data?.items||[];
 const years=films.map(f=>String(f.date||'').slice(0,4)).filter(Boolean).sort();
 row({family:'feeds/filme (corpus)',policy:'exempt — all years by design (D3: films)',evidence:'lib/live/server-seed.json',rows:films.length,noContent:films.filter(f=>!f.title).length,beyondHorizon:0,samples:years.length?[{oldest:years[0],newest:years.at(-1)}]:[],recommendation:'none',note:'year span '+ (years[0]||'?')+'–'+(years.at(-1)||'?')+' is catalog breadth, not staleness'});
}
// ── SIRUTA localities: exempt (standing registry).
{
 const siruta=serverSeed['siruta']?.data?.items||[];
 row({family:'localities/siruta',policy:'exempt — standing registry (D3: geography)',evidence:'lib/live/server-seed.json',rows:siruta.length,noContent:siruta.filter(i=>!i.name||!i.id).length,beyondHorizon:0,samples:[],recommendation:'none'});
}
// ── Justice registries: exempt (standing, not age).
{
 for(const kind of ['notari','experti-judiciari','experti-tehnici']){
  const records=serverSeed['justice:'+kind]?.data?.records||[];
  const allNull=records.filter(r=>Object.values(r).every(v=>[null,undefined,''].includes(v)));
  row({family:'justice/'+kind,policy:'exempt — standing (D3: professional registries)',evidence:'lib/live/server-seed.json',rows:records.length,noContent:allNull.length,beyondHorizon:0,samples:[],recommendation:'none',note:'loader already filters all-empty rows at parse'});
 }
}
// ── Places corpus: exempt (181,537 records; no age semantics). Structure
// check: every manifest chunk resolves to a real records/ file and every
// records/ file is declared in the manifest — orphans either way are broken
// links/dead files.
{
 const manifest=JSON.parse(await readFile(join(root,'public/places/manifest.json'),'utf8'));
 const declared=Object.keys(manifest.chunks||{});
 const present=(await readdir(join(root,'public/places/records'))).map(f=>f.replace('.json.gz',''));
 const missing=declared.filter(c=>!present.includes(c));
 const undeclared=present.filter(c=>!declared.includes(c));
 let noContent=0,checked=0;
 for(const chunk of declared.slice(0,40)){const data=await decompress(join(root,'public/places/records',chunk+'.json.gz'));for(const record of data.items||[]){checked++;if(!record.name&&!(record.lat??record.latitude))noContent++}}
 row({family:'places (corpus)',policy:'exempt — geography & heritage (D3: places, 181,537 records)',evidence:'public/places/manifest.json + records/',rows:manifest.count,noContent,orphanRows:missing.length+undeclared.length,beyondHorizon:0,samples:[...missing.slice(0,3),...undeclared.slice(0,3)],recommendation:missing.length||undeclared.length||noContent?'pending-review':'none',note:'integritate eșantionată: '+checked.toLocaleString('ro-RO')+' înregistrări din '+Math.min(40,declared.length)+'/'+declared.length+' fragmente (maxim 40); dovada sha256 pe fiecare fragment o verifică verify-model-contracts'});
}
// ── Stories corpus: exempt (texts, not age).
{
 const manifest=JSON.parse(await readFile(join(root,'public/stories/manifest.json'),'utf8'));
 const texts=await readdir(join(root,'public/stories/texts'));
 const index=JSON.parse(gunzipSync(await readFile(join(root,'public/stories/index.json.gz'))).toString('utf8'));
 const ids=(index.items||[]).map(i=>String(i.id));
 const missing=ids.filter(id=>!texts.includes(id+'.json.gz'));
 const undeclared=texts.filter(f=>!ids.includes(f.replace('.json.gz','')));
 row({family:'stories (corpus)',policy:'exempt — literary corpus (D3: stories)',evidence:'public/stories/manifest.json + index.json.gz',rows:manifest.count,noContent:(index.items||[]).filter(i=>!i.title).length,orphanRows:missing.length+undeclared.length,beyondHorizon:0,samples:[...missing.slice(0,3),...undeclared.slice(0,3)],recommendation:missing.length||undeclared.length?'pending-review':'none',note:manifest.completeTexts+' texte integrale verificate; eșecuri de preluare înregistrate la import: '+(manifest.failures||0)+'; fișiere '+texts.length+'/'+ids.length});
}
// ── Transit corpus: edition TTL governs (D3 row). Zero-trip routes are the
// only content-deadness signal worth reporting (an export artifact), and the
// pinned count census lives in verify-sweep-inventory. Manifest references use
// the logical .json paths; the on-disk form is .json.gz — resolved with the
// same compressed-path pattern the app serves through (lib/snapshot-transport.ts
// snapshotAssetPath), read from source so the two can never drift apart.
{
 const assetPathSource=await readFile(join(root,'lib/snapshot-transport.ts'),'utf8');
 const compressedSource=assetPathSource.match(/const compressed=(\/.+\/);/)[1];
 const compressed=new RegExp(compressedSource.slice(1,-1));
 const manifest=JSON.parse(await readFile(join(root,'public/transit/manifest.json'),'utf8'));
 const routes=Object.values(manifest.routes||{});
 const files=await readdir(join(root,'public/transit/routes'));
 const onDisk=new Set(files);
 // The manifest stores refs relative to /transit/ („routes/<hash>.json"); the
 // app resolves them as snapshotJson('/transit/'+ref) — mirror that exactly.
 const diskName=ref=>{const logical='/transit/'+ref;const resolved=compressed.test(logical)?logical+'.gz':logical;return resolved.replace('/transit/routes/','')};
 const missingFile=routes.filter(r=>!onDisk.has(diskName(r.file)));
 const undeclaredFiles=files.filter(f=>!routes.some(r=>diskName(r.file)===f));
 const zeroTrip=routes.filter(r=>!r.trips);
 row({family:'transport/tpbi (corpus)',policy:'edition TTL governs (D3: transport network)',evidence:'public/transit/manifest.json',rows:routes.length,noContent:zeroTrip.length,orphanRows:missingFile.length+undeclaredFiles.length,beyondHorizon:0,samples:[...zeroTrip.slice(0,3).map(r=>({id:r.id,file:r.file,kind:'zero-trip'})),...missingFile.slice(0,3).map(r=>({id:r.id,file:r.file,kind:'missing-file'}))],recommendation:zeroTrip.length||missingFile.length||undeclaredFiles.length?'pending-review':'none',note:routes.length+' rute în manifest, '+files.length+' fișiere reale; numărătoarea pinned (181.537 locuri) se verifică în verify-sweep-inventory'});
}
// ── Trains corpus: edition-governed, carboid-only; operators carry validity
// windows — editions past their validTo are historically superseded, retained
// by design (the corpus is planned times, re-imported per edition).
{
 const manifest=JSON.parse(await readFile(join(root,'public/trains/manifest.json'),'utf8'));
 const boards=await readdir(join(root,'public/trains/boards'));
 const expiredEditions=manifest.operators.filter(o=>o.validTo&&o.validTo<today);
 row({family:'transport/trains (corpus)',policy:'edition-governed (D3: transport schedules)',evidence:'public/trains/manifest.json',rows:manifest.counts.trains,noContent:0,orphanRows:Math.abs(boards.length-(manifest.shards||0)),beyondHorizon:0,samples:expiredEditions.slice(0,2).map(o=>({operator:o.id,validTo:o.validTo})),recommendation:'none',note:countText(expiredEditions.length,'ediție cu valabilitate trecută rămâne în corpus —','ediții cu valabilitate trecută rămân în corpus —')+' re-importul se face pe ediție; shards '+boards.length+'/'+(manifest.shards||0)});
}
// ── Local dev D1 state (labeled): load-state census per family — errored
// rows, no-data tombstones and retired payload chunks. This is the DEV copy
// (.wrangler/state), not production; observations are informational for the
// operator and no production conclusion is drawn from it. On CI the dev state
// directory is absent and the leg records that honestly.
if(d1Exists){
 const d1=new DatabaseSync(d1Path,{readOnly:true});
 const rows=d1.prepare('SELECT key, data IS NULL AS nodata, error IS NOT NULL AS err, expires_at, next_attempt_at FROM source_cache').all();
 const familyOf=key=>key.split(':')[0]+(key.startsWith('law:')&&['search','consolidated'].includes(key.split(':')[1])?':'+key.split(':')[1]:'');
 const families={};
 for(const r of rows){const f=familyOf(r.key);families[f]??={rows:0,noDataWithError:0,errored:0};families[f].rows++;if(r.err){families[f].errored++;if(r.nodata)families[f].noDataWithError++}}
 const retired=rows.filter(r=>r.key.startsWith('payload:')&&r.expires_at>0&&r.expires_at<=now);
 row({family:'dev D1 cache (stare locală de dezvoltare)',policy:'expired-source rows per family (D3 machinery: last-good-copy, seu nocturn, lease 60s)',evidence:'.wrangler/state D1 source_cache — stare locală de dezvoltare, nu producție',rows:rows.length,noContent:0,erroredFamilies:Object.fromEntries(Object.entries(families).filter(([,v])=>v.errored).map(([k,v])=>[k,v.errored+'/'+v.rows])),beyondHorizon:0,samples:[],recommendation:'none',note:'rânduri de sarcină în eroare (fără copie): '+Object.values(families).reduce((s,f)=>s+f.noDataWithError,0)+' — fiecare familie are propria poartă onestă și backoff; fragmente payload pensionate (curățare 48h): '+retired.length+' din '+rows.filter(r=>r.key.startsWith('payload:')).length+'; copia dev nu certifică starea producției'});
}else row({family:'dev D1 cache (stare locală de dezvoltare)',policy:'expired-source rows per family (D3 machinery)',evidence:'.wrangler/state — absent (CI)',rows:0,noContent:0,beyondHorizon:0,samples:[],recommendation:'none',note:'starea locală de dezvoltare lipsește pe acest runner (CI) — piciorul de observare se înregistrează ca absent, fără concluzie'});
function countText(n,singular,plural){return n+' '+(n===1?singular:plural)}
// ── Report emission (the deliverable — reviewed before anything executes).
const verdictFor=entry=>entry.recommendation==='none'?'CURAT — nicio acțiune':entry.recommendation==='pending-review'?'DE REVIZUIT — recenzie înainte de orice acțiune':'SANCTIONAT-TRIVIAL';
let md='# Dead-data census — content-enrichment-ux (Wave A2)\n\n';
md+='**Generated**: '+new Date().toISOString()+' by `scripts/audit-dead-data.mjs` (REPORT-ONLY — no deletion)\n\n';
md+='**Policy**: the D3 per-family recency table (ADVOCATE-REVIEW.md, accepted) — pinned code-side by `scripts/verify-recency-policy.mjs`. „Dead" = no-content / expired-source / irreversible-stale, **never age alone**, and age only where the table sets a horizon for that family.\n\n';
md+='| Familie | Politică (rând D3) | Rânduri | Fără conținut | Dincolo de orizont | Orfane | Recomandare | Note |\n|---|---|---|---|---|---|---|---|\n';
for(const e of census){md+='| '+(e.family||'')+' | '+(e.policy||'')+' | '+(e.rows??'—')+' | '+(e.noContent??'—')+' | '+(e.beyondHorizon??'—')+' | '+(e.orphanRows??'—')+' | **'+verdictFor(e)+'** | '+String(e.note||'').replace(/\|/g,'/')+' |\n'}
const samples=census.filter(e=>e.samples?.length||e.erroredFamilies);
if(samples.length){md+='\n## Samples and error-state observations\n\n';for(const e of samples){md+='### '+e.family+'\n';if(e.samples?.length)md+='- samples: `'+JSON.stringify(e.samples)+'`\n';if(e.erroredFamilies)md+='- rânduri/familie în eroare (dev D1, informational): `'+JSON.stringify(e.erroredFamilies)+'`\n'}}
md+='\n## Purge decision protocol\n\n';
md+='This census is the **input** to the review gate — nothing above executes a deletion. The classifications mean:\n\n';
md+='- **CURAT** — nothing to do; the family\'s own semantics already govern it.\n- **DE REVIZUIT** — a real signal exists; the orchestrator reviews the cited rows against the D3 policy row before any purge (R2: over-eager purge destroying valid corpora is HIGH risk).\n- **SANCTIONAT-TRIVIAL** — empty-content rows whose family\'s own loader/parser already defines them dead, eligible for the trivial purge path **after** the census→review→sanction flow confirms them.\n\n';
md+='Pinned corpus counts (places 181,537) are protected by `verify-sweep-inventory.mjs` — any change must cite the D3 policy row.\n';
await mkdir(join(root,'docs/hygiene'),{recursive:true});
await writeFile(join(root,'docs/hygiene/dead-data-census.md'),md);
const totals={families:census.length,clean:census.filter(e=>e.recommendation==='none').length,pendingReview:census.filter(e=>e.recommendation==='pending-review').length,sanctionedTrivial:census.filter(e=>['sanctioned-trivial','trivial-sanctionable'].includes(e.recommendation)).length,noContent:census.reduce((s,e)=>s+(e.noContent||0),0),beyondHorizon:census.reduce((s,e)=>s+(e.beyondHorizon||0),0),orphans:census.reduce((s,e)=>s+(e.orphanRows||0),0)};
console.log('Census complet: '+census.length+' familii documentate — '+totals.noContent+' rânduri fără conținut, '+totals.beyondHorizon+' dincolo de orizontul politiciei, '+totals.orphans+' orfane; recomandări: '+totals.clean+' curate, '+totals.pendingReview+' de revizuit, '+totals.sanctionedTrivial+' triviale-sanctionabile. Raportul: docs/hygiene/dead-data-census.md');
console.log(JSON.stringify({result:'ok',deliverable:'docs/hygiene/dead-data-census.md',mode:'report-only',...totals}));
