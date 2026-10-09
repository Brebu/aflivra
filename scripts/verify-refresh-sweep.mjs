import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const map=JSON.parse(await readFile(join(root,'lib/live/refresh-groups.json'),'utf8'));
assert.equal(map.groups.length,5,'Cinci expresii cron acoperă cele cinci clase de prospețime — pulsa de 10 minute, viața de 20, fluxurile de 30, cercetarea orară și registrele cu urmărirea orară');
assert.ok(map.groups.length<=12,'planul plătit permite 250; poarta ține sub 12');
assert.deepEqual(map.groups.map(g=>g.name),['pulse','living','feeds','research','registers']);
assert.deepEqual(map.groups.map(g=>g.cron),['*/10 * * * *','*/20 * * * *','*/30 * * * *','7 * * * *','28 * * * *'],);
// Declanșatorul registers (oră cu 28) poartă tura de registre și tura de urmărire a
// „Urmăritelor” — notificările ajung la cel mult o oră de la schimbare. Planul plătit
// ($5/lună: 10M cereri și 30M CPU-ms incluse) acoperă cele ~312 invocații/zi de gigant
// invizibil: fiecare tură sare peste sursele proaspete (TTL-ul e ritmul), deci costul real
// e al aducerilor, nu al ticăitului.
assert.equal(new Set(map.groups.map(g=>g.cron)).size,5,'Each cron expression maps to exactly one group');
assert.equal(new Set(map.groups.map(g=>g.name)).size,5,'Each group maps to exactly one cron expression');
const expectedMembers={pulse:['weather.anm','weather.alerts','forecast.bucuresti','bnr'],living:['cinema.bucuresti.today','events.odeon','events.teatruldearta'],feeds:['feed.munca','feed.stiri','feed.sanatate','feed.educatie','feed.justitie'],research:['company.default','catalog.default','knowledge.company.default','law.search.default','law.search.codcivil','lawyers.default'],registers:['directory.schools.page0','catalog.category.bani','catalog.category.sanatate']};
for(const group of map.groups){assert.deepEqual(group.members,expectedMembers[group.name],'The frozen group membership is the deploy contract');assert.ok(group.estimatedSubrequests<=120,'planul plătit permite 1000 de subrequeste pe invocare; marja onestă rămâne sub 120');assert.ok(group.estimatedSubrequests>=group.members.length,'Every loader costs at least one subrequest')}
assert.equal(new Set(map.groups.flatMap(g=>g.members)).size,21);
for(const [list,label] of [[map.seedBacked,'seedBacked'],[map.onDemand,'onDemand'],[map.ghRelayed,'ghRelayed']]){assert.ok(Array.isArray(list)&&list.length>0,label+' families must be documented');for(const entry of list){assert.ok(entry.family&&entry.reason,label+' entries carry a family and a reason')}}
const relayed=map.ghRelayed.map(entry=>entry.family);
assert.deepEqual(relayed,['feed.agricultura','transport.flights','flights.bia'],'AFIR, the Romanian airspace flight states and the BIA airport board are relayed through the GitHub Actions tours: afir.ro rejects Workers egress, adsb.lol answers the Workers egress with 429/503, and the airport protects its board with a browser challenge that rejects every server');
for(const family of relayed)assert.ok(!map.groups.some(group=>group.members.includes(family)),'A relayed family is never also cron-swept: the relay is the single writer of its freshness');
const temp=await mkdtemp(join(tmpdir(),'aflivra-sweep-')),sqlite=new DatabaseSync(':memory:');
sqlite.exec(await readFile(join(root,'drizzle/0000_thin_demogoblin.sql'),'utf8'));
const db={prepare(sql){let args=[];const wrapper={bind(...values){for(const v of values)if(typeof v==='string'&&Buffer.byteLength(v)>2_000_000)throw Error('D1 row bound exceeded');args=values;return wrapper},async first(){return sqlite.prepare(sql).get(...args)||null},async run(){const result=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(result.changes)}}}};return wrapper}};
globalThis.__aflivraTestEnv={DB:db};
globalThis.__aflivraResourceCopies=JSON.parse(await readFile(join(root,'lib/live/resource-seed.json'),'utf8'));
globalThis.__aflivraTestSeeds={'directory:schools':JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8'))['directory:schools']};
try{
for(const name of ['court-history','court-query','location-context','geographic-scope','tabular-geography']){let source=await readFile(join(root,'lib',name+'.ts'),'utf8');for(const [binding,path] of [['countyLookup','public/data/locality-counties.json'],['urbanLocalities','public/data/geographic-localities.json']])source=source.replace('import '+binding+" from '@/"+path+"';",'const '+binding+'='+await readFile(join(root,path),'utf8')+';');source=source.replace("from './live/query'","from './query'").replace("import institutions from '@/public/courts/institutions.json';",'const institutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");await writeFile(join(temp,name+'.mjs'),js)}
for(const name of ['records','text','media','query','source-xml','source-html','catalog-categories','adapters','company-registries','feeds','request-context','resource-copy','cache','weather-gate','forecast','weather','legal-consolidation','legal-portal','legal-registry','court-references','legal-selection','legal','knowledge','lawyers','catalog-metadata','resources','directories','events','cinema']){let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');source=source.replace("from '../court-history'","from './court-history'").replace("from '../court-query'","from './court-query'").replace("from '../geographic-scope'","from './geographic-scope'").replace("from '../tabular-geography'","from './tabular-geography'").replace("from '../location-context'","from './location-context'").replace("import confirmed from '@/public/courts/confirmed-references.json';",'const confirmed='+await readFile(join(root,'public/courts/confirmed-references.json'),'utf8')+';').replace("import courtInstitutions from '@/public/courts/institutions.json';",'const courtInstitutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';').replace("import codes from '@/public/legal-snapshots/manifest.json';",'const codes='+await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8')+';').replace("import cinemaCatalog from '@/public/cinema/cinemas.json';",'const cinemaCatalog='+await readFile(join(root,'public/cinema/cinemas.json'),'utf8')+';').replace("import venuesCatalog from '@/public/events/venues.json';",'const venuesCatalog='+await readFile(join(root,'public/events/venues.json'),'utf8')+';').replace("import audit from '@/public/catalog/audit.json';",'const audit='+await readFile(join(root,'public/catalog/audit.json'),'utf8')+';').replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;').replace("import baseSeeds from './seed.json';",'const baseSeeds={};').replace("import {serverSeeds,catalogSeed} from './seed-snapshots';",'const serverSeeds=globalThis.__aflivraTestSeeds??{};const catalogSeed=[];').replace("import resourceCopies from './resource-seed.json';",'const resourceCopies=globalThis.__aflivraResourceCopies;');let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href);output=output.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");for(const pkg of ['xlsx','fflate'])output=output.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");await writeFile(join(temp,name+'.mjs'),output)}
const sweepSource=await readFile(join(root,'lib/live/refresh-sweep.ts'),'utf8');
const compileSweep=(file,inline)=>{let source=sweepSource.replace("import sweepMap from './refresh-groups.json';",'const sweepMap='+inline+';').replace("from '../location-context'","from './location-context'").replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;');let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href);output=output.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");return writeFile(join(temp,file),output)};
await compileSweep('refresh-sweep.mjs',JSON.stringify(map));
const mutated=structuredClone(map);mutated.groups[0].members[mutated.groups[0].members.indexOf('bnr')]='feed.muncaa';
await compileSweep('refresh-sweep-broken.mjs',JSON.stringify(mutated));
await assert.rejects(()=>import(pathToFileURL(join(temp,'refresh-sweep-broken.mjs'))),/necunoscut/i,'An unknown member token must fail loudly at import');
const sweep=await import(pathToFileURL(join(temp,'refresh-sweep.mjs')));
const pinned={'bnr':'bnr','weather.anm':'weather','company.default':'company:427282','catalog.default':'catalog:v2:::0','catalog.category.bani':'catalog:v2:bani::0','catalog.category.sanatate':'catalog:v2:sanatate::0','weather.alerts':'weather-alerts','forecast.bucuresti':'forecast:44.43:26.1','events.odeon':'events:odeon','events.teatruldearta':'events:teatruldearta','feed.munca':'feed:munca','feed.stiri':'feed:stiri','feed.sanatate':'feed:sanatate','feed.educatie':'feed:educatie','feed.justitie':'feed:justitie','law.search.default':'law:search.v5:{"title":"","text":"","number":"","year":"","page":0}','law.search.codcivil':'law:search.v5:{"title":"CODUL CIVIL din 17 iulie 2009","text":"","number":"","year":"","page":0}','lawyers.default':'lawyers:'+createHash('sha256').update(JSON.stringify({q:'',page:0,sort:'recent'})).digest('hex'),'knowledge.company.default':'knowledge-company:427282','directory.schools.page0':'directory:schools::0'};
const today=new Date().toISOString().slice(0,10);
for(const [member,key] of Object.entries(pinned)){const loader=sweep.memberLoader(member);assert.equal(typeof loader.load,'function','Every referenced loader exists in the transpiled modules');assert.equal(loader.key,key,'The registry derives each member key exactly as the app first load does')}
assert.equal(sweep.memberLoader('cinema.bucuresti.today').key,'cinema:1824:'+today);
assert.throws(()=>sweep.memberLoader('feed.muncaa'),/necunoscut/i);
assert.deepEqual(sweep.listGroups().map(g=>[g.name,g.cron,g.members]),map.groups.map(g=>[g.name,g.cron,g.members]));
for(const group of map.groups){assert.equal(sweep.groupForCron(group.cron).name,group.name);assert.equal(sweep.groupForCron(group.cron).name,group.name,'groupForCron is deterministic')}
assert.equal(sweep.groupForCron('3 0 * * *'),null);
assert.ok(sweep.listSeedBacked().every(s=>s.family&&s.reason));
assert.ok(sweep.listOnDemand().every(s=>s.family&&s.reason));
const originalFetch=globalThis.fetch,originalWarn=console.warn,warnings=[];
console.warn=(...args)=>{warnings.push(args.map(String).join(' '))};
const avertizari='<avertizari cod="ALBASTRU" tip="1"><avertizare fenomen="Vânt" intensitate="60-80 km/h" localitate="București - Ilfov" dataStart="2026-10-06" dataStop="2026-10-07"/></avertizari>';
const odeon='<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Spectacol de verificare","startDate":"2026-10-06T19:30:00","url":"https://teatrul-odeon.ro/spectacol/verificare","location":{"@type":"Place","name":"Sala Mare"}}</script>';
const teatruldearta='<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Fata din \u201eCurcubeu\u201d","startDate":"2026-10-09","url":"https://teatruldearta.ro/events/fata-din-curcubeu-689-414/","location":{"@type":"Place","name":"Teatrul de Artă București","address":"Str. Sfântul Ștefan nr. 21, sector 2, București"}}</script>';
const fetchCalls={openMeteo:0,alerts:0,odeon:0,teatruldearta:0,cinema:0,other:0};
try{
globalThis.fetch=async(url)=>{const href=String(url);if(href.startsWith('https://api.open-meteo.com/')){fetchCalls.openMeteo++;return new Response(null,{status:503})}if(href.startsWith('https://www.meteoromania.ro/avertizari')){fetchCalls.alerts++;return new Response(avertizari,{headers:{'content-type':'application/xml'}})}if(href.startsWith('https://teatrul-odeon.ro/')){fetchCalls.odeon++;return new Response(odeon,{headers:{'content-type':'text/html'}})}if(href.startsWith('https://teatruldearta.ro/')){fetchCalls.teatruldearta++;return new Response(teatruldearta,{headers:{'content-type':'text/html'}})}if(href.includes('/data-api-service/v1/quickbook/')){fetchCalls.cinema++;return Response.json({body:{films:[],events:[]}})}fetchCalls.other++;return new Response(null,{status:404})};
const first=await sweep.runGroup('pulse');
assert.equal(first.group,'pulse');assert.equal(first.cron,'*/10 * * * *');assert.equal(first.ok,1);assert.equal(first.failed,3);
assert.deepEqual(first.sources.map(s=>s.key),['weather','weather-alerts','forecast:44.43:26.1','bnr']);
assert.deepEqual(first.sources.map(s=>s.status),['unavailable','fresh','unavailable','unavailable'],'One failing source never blocks the others');
assert.ok(first.startedAt<=first.finishedAt);assert.ok(Date.parse(first.startedAt)>0);
assert.ok(String(first.sources[2].error).includes('503'));assert.equal(first.sources[2].lastSuccessAt,null);
assert.ok(String(first.sources[3].error).includes('404'),'bnr cade onest în mock (404), fără să blocheze grupul');
assert.equal(fetchCalls.openMeteo,3,'Three upstream 503 attempts, never multiplied by the sweep');
const row=(key)=>sqlite.prepare('SELECT * FROM source_cache WHERE key=?').get(key);
const alertsRow=row('weather-alerts');assert.ok(alertsRow.data&&JSON.parse(alertsRow.data).empty===false);assert.ok(alertsRow.expires_at>Date.now());
const forecastRow=row('forecast:44.43:26.1');assert.equal(forecastRow.data,null);assert.equal(forecastRow.failures,1);assert.ok(forecastRow.next_attempt_at>Date.now());assert.ok(String(forecastRow.error).includes('503'));
const living=await sweep.runGroup('living');
assert.equal(living.group,'living');assert.equal(living.cron,'*/20 * * * *');assert.equal(living.ok,3);assert.equal(living.failed,0);
assert.deepEqual(living.sources.map(s=>s.key),['cinema:1824:'+today,'events:odeon','events:teatruldearta']);
assert.deepEqual(living.sources.map(s=>s.status),['fresh','fresh','fresh']);
assert.ok(row('events:odeon').data);assert.ok(row('events:teatruldearta').data);assert.ok(row('cinema:1824:'+today).data);
const summary=row('sweep:group:pulse');assert.equal(summary.adapter_version,'sweep.groups.v1');assert.equal(summary.last_attempt_at,first.startedAt);assert.equal(summary.last_success_at,first.finishedAt);
const stored=JSON.parse(summary.data);assert.equal(stored.group,'pulse');assert.equal(stored.cron,'*/10 * * * *');assert.equal(stored.ok,1);assert.equal(stored.failed,3);
assert.deepEqual(stored.sources.map(s=>s.status),['unavailable','fresh','unavailable','unavailable']);
for(const source of stored.sources)assert.deepEqual(Object.keys(source).sort(),['error','key','lastSuccessAt','name','status']);
assert.equal(sqlite.prepare("SELECT used FROM source_budget WHERE key='open-meteo'").get().used,1);
assert.deepEqual(JSON.parse(JSON.stringify(first)),first);
sqlite.prepare('UPDATE source_cache SET next_attempt_at=0 WHERE key=?').run('forecast:44.43:26.1');
sqlite.prepare('INSERT OR REPLACE INTO source_budget (key,window_start,used) VALUES (?,?,?)').run('open-meteo',Math.floor(Date.now()/3600000)*3600000,400);
const second=await sweep.runSweep('*/10 * * * *');
assert.equal(second.ok,1);assert.equal(second.failed,3);
assert.equal(second.sources[1].status,'cached','The fresh alert copy stays cached across the next pulse');
assert.ok(String(second.sources[2].error).includes('Limita temporar'),'The hourly budget is enforced by readSource and caps further upstream calls');
assert.equal(fetchCalls.openMeteo,3);assert.equal(fetchCalls.alerts,1);assert.equal(fetchCalls.odeon,1);assert.equal(fetchCalls.cinema,1);
assert.ok(fetchCalls.other>=2,' weather.anm și bnr se reîncearcă sau rămân în backoff onest, fără să multiplic e sursa');
assert.equal(row('sweep:group:pulse').last_success_at,second.finishedAt);assert.ok(Date.parse(second.finishedAt)>=Date.parse(first.finishedAt));
const deferred=[];
const third=await sweep.refreshSweep({DB:db},{waitUntil:promise=>deferred.push(promise)},'pulse');
assert.equal(third.group,'pulse');assert.equal(deferred.length,0,'waitForRefresh sweep reads never defer');
const fourth=await sweep.refreshSweep({DB:db},null,'*/10 * * * *');
assert.equal(fourth.group,'pulse');assert.equal(fourth.cron,'*/10 * * * *');
assert.equal(await sweep.runSweep('0 1 * * *'),null);
assert.equal(await sweep.runGroup('nonexistent'),null);
assert.equal(await sweep.refreshSweep({DB:db},null,'feed.despre.fluturi'),null);
const events=warnings.map(text=>{try{return JSON.parse(text)}catch{return null}}).filter(Boolean);
for(const event of ['sweep_unknown_cron','sweep_unknown_group','sweep_unknown_trigger'])assert.ok(events.some(entry=>entry.event===event),'An unknown trigger no-ops with a structured warn event: '+event);
console.log('Mocked sweep verified: an isolated 503 source stays recorded without blocking its group, the open-meteo hourly budget caps further calls, and the sweep summary row lands in source_cache with per-source statuses.');
console.log(JSON.stringify({result:'ok',groups:map.groups.length,members:21,relayed:relayed.join(','),swept:'pulse,living',failing:'forecast:44.43:26.1',summaryRow:'sweep:group:pulse',adapterVersion:'sweep.groups.v1',message:'Verificare trecută: pulsa de 10 minute izolează sursele căzute, viața de 20 servește curtata cinema+evenimente, bugetul orar respectat; invocările (~312/zi) stau invizibil în planul plătit de 5 USD ($10M cereri inclus).'}));
console.log('Mocked sweep verified: an isolated 503 source stays recorded without blocking its group, the open-meteo hourly budget caps further calls, and the sweep summary row lands in source_cache with per-source statuses.');

}finally{globalThis.fetch=originalFetch;console.warn=originalWarn}
}finally{sqlite.close();delete globalThis.__aflivraTestEnv;delete globalThis.__aflivraResourceCopies;delete globalThis.__aflivraTestSeeds;await rm(temp,{recursive:true,force:true})}
