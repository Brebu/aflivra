import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const R='/Users/cbrebu/Projects/alfivra';
const temp=await mkdtemp(join(tmpdir(),'aflivra-tranzy-'));
const require=createRequire(import.meta.url);
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(await readFile(R+'/drizzle/0000_thin_demogoblin.sql','utf8'));
const db={prepare(sql){let args=[];const w={bind(...v){args=v;return w},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}}}};return w},async batch(sts){const out=[];for(const s of sts)out.push(await s.run());return out}};
const wipe=()=>{sqlite.prepare('DELETE FROM source_cache').run();sqlite.prepare('DELETE FROM source_budget').run()};
const httpRetry=pathToFileURL(R+'/lib/http-retry.mjs').href;
const compile=async(name,file)=>{
  let source=await readFile(R+'/'+file,'utf8');
  if(file.startsWith('app/'))source=source.replaceAll('@/lib/live/','./').replaceAll('@/lib/','./');
  source=source
   .replace("from './live/query'","from './query'")
   .replace("from '../geographic-scope'","from './geographic-scope'")
   .replace("from '../location-context'","from './location-context")
   .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;')
   .replace("import {serverSeeds,catalogSeed} from './seed-snapshots';",'const serverSeeds={};const catalogSeed=[];')
   .replace("import baseSeeds from './seed.json';",'const baseSeeds={};')
    .replace("import resourceCopies from './resource-seed.json';",'const resourceCopies=[];');
   if(file.startsWith('lib/geographic-scope')){source=source
   .replace("import countyLookup from '@/public/data/locality-counties.json';",'const countyLookup='+await readFile(R+'/public/data/locality-counties.json','utf8')+';')
   .replace("import urbanLocalities from '@/public/data/geographic-localities.json';",'const urbanLocalities='+await readFile(R+'/public/data/geographic-localities.json','utf8')+';');}
  let out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  out=out.replaceAll('@/lib/http-retry.mjs',httpRetry).replace(/from '\.\/([^'.][^']*)'/g,(_,p)=>"from './"+p+".mjs'");
  for(const pkg of ['xlsx','fflate','gtfs-realtime-bindings'])out=out.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");
  const f=join(temp,name+'.mjs');await writeFile(f,out);return f};
for(const name of ['location-context','geographic-scope'])await compile(name,'lib/'+name+'.ts');
for(const name of ['records','text','query','catalog-categories','adapters','request-context','resource-copy','cache','media','transit-realtime'])await compile(name,'lib/live/'+name+'.ts');
await compile('route-tranzy','app/api/tranzy-live/route.ts');
// The compiled modules capture the env object reference once at load, so the key
// is toggled per cell by mutating this one shared object.
globalThis.__aflivraTestEnv={DB:db};
const realtime=await import(pathToFileURL(join(temp,'transit-realtime.mjs')));
const route=await import(pathToFileURL(join(temp,'route-tranzy.mjs')));

// Tranzy publishes "YYYY-MM-DD HH:MM:SS" position stamps; the probe stamps stay real-time.
const stamp=(secondsAgo)=>new Date(Date.now()-secondsAgo*1000).toISOString().slice(0,19).replace('T',' ');
const agencies=()=>[
  {agency_id:1,agency_name:'CTP Cluj-Napoca SA',agency_timezone:'Europe/Bucharest',agency_url:'https://ctpcj.ro'},
  {agency_id:2,agency_name:'SC RATBV SA',agency_timezone:'Europe/Bucharest',agency_url:'https://ratbv.ro'},
  {agency_id:3,agency_name:'CT Buzău',agency_timezone:'Europe/Bucharest'}];
const vehicles=()=>[
  {id:'tz-1',label:'Tramvaiul 101',latitude:46.7712,longitude:23.6236,timestamp:stamp(8),vehicle_type:0,bike_accessible:'UNKNOWN',wheelchair_accessible:'WHEELCHAIR_ACCESSIBLE',speed:9.7,route_id:25,trip_id:'t25'},
  {id:'tz-spill',label:'Spillover',latitude:48.85,longitude:2.35,timestamp:stamp(8),vehicle_type:3,bike_accessible:'UNKNOWN',wheelchair_accessible:'UNKNOWN',speed:5,route_id:9},
  {id:'tz-future',label:'Viitor',latitude:46.77,longitude:23.62,timestamp:stamp(-600),vehicle_type:3,bike_accessible:'UNKNOWN',wheelchair_accessible:'UNKNOWN',speed:5,route_id:9},
  {id:'tz-stale',label:'Troleibuzul păstrat',latitude:46.77,longitude:23.62,timestamp:stamp(1800),vehicle_type:11,bike_accessible:'UNKNOWN',wheelchair_accessible:'UNKNOWN',speed:0,route_id:8,trip_id:'t8'},
  {id:'tz-nospeed',label:'Autobuzul fără viteză',latitude:46.76,longitude:23.61,timestamp:stamp(8),vehicle_type:3,bike_accessible:'UNKNOWN',wheelchair_accessible:'NO_VALUE'}];
const body=(rows)=>Response.json(rows);
let calls=[];
const withMock=async(mode,run)=>{const original=globalThis.fetch;calls=[];
  globalThis.fetch=async(url,init={})=>{
    const href=String(url),path=href.replace('https://api.tranzy.ai/v1/opendata','');
    calls.push({path,headers:{...(init.headers||{})}});
    if(mode==='agency500'&&path==='/agency')return new Response(null,{status:500});
    if(mode==='vehicles500'&&path==='/vehicles')return new Response(null,{status:500});
    if(mode==='vehicles403'&&path==='/vehicles')return new Response(JSON.stringify({message:'Forbidden resource',error:'Forbidden',statusCode:403}),{status:403,headers:{'content-type':'application/json'}});
    if(mode==='malformed'&&path==='/vehicles')return new Response('<html>răspuns nevalid</html>',{headers:{'content-type':'text/html'}});
    if(mode==='noagency'&&path==='/agency')return body([]);
    if(path==='/agency')return body(agencies());
    if(path==='/vehicles')return body(vehicles());
    return new Response(null,{status:404})};
  try{return await run()}finally{if(process.env.TRANZY_PROBE_DEBUG)console.log('MOCK CALLS:',JSON.stringify(calls.map(call=>call.path)));globalThis.fetch=original}};
const key=mode=>{if(mode==='nokey')delete globalThis.__aflivraTestEnv.TRANZY_API_KEY;else globalThis.__aflivraTestEnv.TRANZY_API_KEY='stub-key-de-verificare'};
const callRoute=async(params)=>await (await route.GET(new Request('https://verify.test/api/tranzy-live?'+new URLSearchParams(params)))).json();
const count=path=>calls.filter(call=>call.path===path).length;

// Cell 1 — no key: the gated family is skipped honestly, with zero upstream calls.
await key('nokey');wipe();
let state=await withMock('agency',()=>callRoute({geoScope:'context',locality:'Cluj-Napoca',county:'Cluj',lat:'46.7712',lon:'23.6236'}));
assert.equal(state.status,'unavailable','[no-key] starea documentată');
assert.equal(state.data,null,'[no-key] fără date inventate');
assert.match(String(state.error||''),/cheia de acces TRANZY_API_KEY/,'[no-key] nota onestă de clasă blocată');
assert.equal(calls.length,0,'[no-key] sursa nu este interogată fără cheie');
await assert.rejects(realtime.tranzyAgenciesLoader.load(),/cheia de acces TRANZY_API_KEY/,'[no-key] loaderul operatorilor refuză onest');
await assert.rejects(realtime.tranzyVehiclesLoader(agencies()[0]).load(),/cheia de acces TRANZY_API_KEY/,'[no-key] loaderul vehiculelor refuză onest');
console.log('cell no-key: gated honestly, 0 upstream calls — PASS');

// Cell 2 — key present, healthy feed: the documented Vehicle rows map into the same
// shape the TPBI feed serves, bounds/future stamped rows are dropped, agency resolved.
await key('stub');wipe();
state=await withMock('agency',()=>callRoute({geoScope:'context',locality:'Cluj-Napoca',county:'Cluj',lat:'46.7712',lon:'23.6236'}));
assert.equal(state.status,'fresh','[success] stare proaspătă — primit: '+state.status+', eroare: '+state.error);
assert.equal(state.data.items.length,3,'[success] pozițiile utilizabile servite (valabil + păstrat + fără viteză)');
assert.equal(state.data.entityCount,5,'[success] numărul publicat de rânduri se păstrează');
assert.equal(state.data.agency,'CTP Cluj-Napoca SA','[success] operatorul localizat este numit');
assert.equal(state.data.isLive,true,'[success] fluxul marcat live');
const first=state.data.items.find(item=>item.id==='tz-1');
assert.equal(first.routeId,'25','[success] route_id numeric → linie text');
assert.equal(first.vehicleName,'Tramvaiul 101','[success] eticheta vehiculului');
assert.equal(first.bearing,null,'[success] Tranzy nu publică direcția — fără direcție inventată');
assert.equal(first.speed,9.7,'[success] viteza (m/s, convenția GTFS-RT) se păstrează');
assert.equal(first.occupancy,null,'[success] fără ocupare publicată');
assert.equal(first.occupancyPercentage,null,'[success] fără procent de ocupare inventat');
assert.equal(first.wheelchairAccessible,'WHEELCHAIR_ACCESSIBLE','[success] accesibilitatea publicată se păstrează');
assert.match(first.observedAt,/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,'[success] momentul poziției, UTC ISO');
assert.equal(first.details.label,'Tramvaiul 101','[success] detaliile publicate rămân la îndemână');
const kept=state.data.items.find(item=>item.id==='tz-stale');
assert.ok(kept,'[success] poziția mai veche se păstrează (isLive o marchează separat)');
assert.equal(count('/agency'),1,'[success] un singur acces la lista operatorilor');
assert.equal(count('/vehicles'),1,'[success] un singur acces la fluxul operatorului');
assert.equal(calls.every(call=>call.headers['X-API-KEY']==='stub-key-de-verificare'),true,'[success] cheia merge doar în antet, spre familia permisă');
assert.equal(calls.find(call=>call.path==='/vehicles').headers['X-Agency-Id'],'1','[success] antetul X-Agency-Id desemnează operatorul rezolvat');
console.log('cell success: same shape as TPBI (5 documented fields verified), 2 upstream calls — PASS');

// Cell 3 — the documented keyless/invalid-key gate: HTTP 403 surfaces honestly.
await key('stub');wipe();
state=await withMock('vehicles403',()=>callRoute({geoScope:'context',locality:'Cluj-Napoca',county:'Cluj'}));
assert.equal(state.status,'unavailable','[403] starea documentată');
assert.equal(state.data,null,'[403] fără poziții inventate');
assert.match(String(state.error||''),/HTTP 403/,'[403] codul sursei păstrat în plicul de eroare');
assert.equal(count('/vehicles'),1,'[403] un singur acces — fără furtună de reîncercări');
assert(Date.parse(state.nextAttemptAt)>Date.now(),'[403] pauza de reîncercare este programată');
console.log('cell key-403: surfaced in-band, single attempt, backoff scheduled — PASS');

// Cell 4 — HTTP 500: the three GET attempts exhaust, the last valid copy serves.
await key('stub');wipe();
await withMock('agency',()=>callRoute({geoScope:'context',locality:'Cluj-Napoca',county:'Cluj'}));
sqlite.prepare('UPDATE source_cache SET expires_at=0 WHERE key=?').run('transport:tranzy:vehicles:1');
state=await withMock('vehicles500',()=>callRoute({geoScope:'context',locality:'Cluj-Napoca',county:'Cluj'}));
assert.equal(state.status,'stale','[warm-500] copia validă servește sub 500');
assert.match(String(state.error||''),/HTTP 500/,'[warm-500] codul sursei în plicul de eroare');
assert.equal(state.data.items.length,3,'[warm-500] pozițiile din copia validă se păstrează');
assert.equal(count('/vehicles'),3,'[warm-500] cele trei încercări se epuizează');
console.log('cell warm-http500: keep-valid-copy semantics over the Tranzy feed — PASS');

// Cell 5 — agency metadata failing: the family degrades honestly, nothing is invented.
await key('stub');wipe();
state=await withMock('agency500',()=>callRoute({geoScope:'context',locality:'Cluj-Napoca',county:'Cluj'}));
assert.equal(state.status,'unavailable','[agency-500] starea documentată');
assert.equal(state.data,null,'[agency-500] fără operatori inventați');
assert.match(String(state.error||''),/HTTP 500/,'[agency-500] codul sursei păstrat');
console.log('cell agency-http500: degrade in-band — PASS');

// Cell 6 — locality without a matching operator: the honest no-operator note, and
// the vehicles feed of a *different* city is never asked.
await key('stub');wipe();
state=await withMock('agency',()=>callRoute({geoScope:'context',locality:'Zărnești',county:'Brașov'}));
assert.equal(state.status,'unavailable','[unmatched] starea documentată');
assert.equal(state.data,null,'[unmatched] fără poziții inventate');
assert.match(String(state.error||''),/operator Tranzy.*Zărnești/i,'[unmatched] nota onestă: operator neidentificat');
assert.equal(count('/vehicles'),0,'[unmatched] fluxul altui oraș nu este interogat');
console.log('cell unmatched-locality: honest note, no cross-city fetch — PASS');

// Cell 7 — non-JSON body: rejected as invalid structure, no partial data.
await key('stub');wipe();
state=await withMock('malformed',()=>callRoute({geoScope:'context',locality:'Cluj-Napoca',county:'Cluj'}));
assert.equal(state.status,'unavailable','[malformed] starea documentată');
assert.equal(state.data,null,'[malformed] fără date parțial inventate');
assert.match(String(state.error||''),/Fluxul Tranzy nu poate fi decodat|Sursa nu a putut fi verificată/,'[malformed] plicul de eroare în română');
console.log('cell malformed: rejected honestly — PASS');

// Cell 8 — invalid query parameters degrade with the documented 400.
await key('nokey');wipe();
const raw=await route.GET(new Request('https://verify.test/api/tranzy-live?q='+('x'.repeat(201))));
assert.equal(raw.status,400,'[invalid] filtrele invalide respinse fără interogarea sursei');
console.log('cell invalid-params: 400 in-band — PASS');

await rm(temp,{recursive:true,force:true});
console.log('Tranzy cells: toate cele 8 legs de verificare au trecut (PASS)');
