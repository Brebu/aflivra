import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import ts from 'typescript';

// Ruta de relay /api/seed/afir preia prin doi pași pagina AFIR și comunicatele ei integrale
// de la un runner extern (sursa blochează egress-ul Workers) și le publică prin exact setterul
// și predicatele de prospețime pe care cititorul le folosește — fără nicio reinterogare a sursei.
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const routePath=join(root,'app/api/seed/afir/route.ts');
let routeSource=null;
try{routeSource=await readFile(routePath,'utf8')}catch{console.error('RED: app/api/seed/afir/route.ts nu există încă — implementează ruta de relay ca să devină verde acest ham.');process.exit(1)}
const temp=await mkdtemp(join(tmpdir(),'aflivra-afir-relay-')),sqlite=new DatabaseSync(':memory:');
sqlite.exec(await readFile(join(root,'drizzle/0000_thin_demogoblin.sql'),'utf8'));
const db={prepare(sql){let args=[];const wrapper={bind(...values){for(const v of values)if(typeof v==='string'&&Buffer.byteLength(v)>2_000_000)throw Error('D1 row bound exceeded');args=values;return wrapper},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(result.changes)}}}};return wrapper},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results}};
globalThis.__aflivraTestEnv={DB:db,REFRESH_TOKEN:'token-relay-de-verificare'};
globalThis.__aflivraResourceCopies=JSON.parse(await readFile(join(root,'lib/live/resource-seed.json'),'utf8'));
const escapes=[];const recordEscape=reason=>escapes.push(String(reason&&reason.stack||reason));
process.on('unhandledRejection',recordEscape);process.on('uncaughtExceptionMonitor',recordEscape);
try{
const httpRetry=pathToFileURL(join(root,'lib/http-retry.mjs')).href,fflateUrl=pathToFileURL(require.resolve('fflate')).href;
for(const name of ['court-history','court-query','location-context','geographic-scope','tabular-geography','transit-location','weather-location','snapshot-transport']){
 let source=await readFile(join(root,'lib',name+'.ts'),'utf8');
 for(const [binding,path] of [['countyLookup','public/data/locality-counties.json'],['urbanLocalities','public/data/geographic-localities.json'],['institutions','public/courts/institutions.json'],['coverage','public/transit/coverage.json']])source=source.replace('import '+binding+" from '@/"+path+"';",'const '+binding+'='+await readFile(join(root,path),'utf8')+';');
 source=source.replace(/from '\.\/live\//g,"from './");
 let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replace("from 'fflate'","from '"+fflateUrl+"'").replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
 await writeFile(join(temp,name+'.mjs'),output);
}
const liveSeeds=await readFile(join(root,'lib/live/seed.json'),'utf8');
for(const name of ['records','text','media','query','source-xml','source-html','catalog-categories','catalog-metadata','adapters','feeds','request-context','resource-copy','cache','content','weather-gate','forecast','weather','transport','transit-realtime','legal-consolidation','legal-portal','legal-registry','court-references','legal-selection','legal','knowledge','lawyers','directories','resources','events','cinema','stories']){
 let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
 source=source
  .replace("from '../court-history'","from './court-history'").replace("from '../court-query'","from './court-query'")
  .replace("from '../geographic-scope'","from './geographic-scope'").replace("from '../tabular-geography'","from './tabular-geography'")
  .replace("from '../location-context'","from './location-context'")
  .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;')
  .replace("import baseSeeds from './seed.json';",'const baseSeeds='+liveSeeds+';')
  .replace("import {serverSeeds,catalogSeed} from './seed-snapshots';",'const serverSeeds={};const catalogSeed=[];')
  .replace("import resourceCopies from './resource-seed.json';",'const resourceCopies=globalThis.__aflivraResourceCopies;')
  .replace("import confirmed from '@/public/courts/confirmed-references.json';",'const confirmed='+await readFile(join(root,'public/courts/confirmed-references.json'),'utf8')+';')
  .replace("import courtInstitutions from '@/public/courts/institutions.json';",'const courtInstitutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';')
  .replace("import codes from '@/public/legal-snapshots/manifest.json';",'const codes='+await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8')+';')
  .replace("import cinemaCatalog from '@/public/cinema/cinemas.json';",'const cinemaCatalog='+await readFile(join(root,'public/cinema/cinemas.json'),'utf8')+';')
  .replace("import audit from '@/public/catalog/audit.json';",'const audit='+await readFile(join(root,'public/catalog/audit.json'),'utf8')+';');
 let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace("from 'fflate'","from '"+fflateUrl+"'");output=output.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");for(const pkg of ['xlsx','gtfs-realtime-bindings'])output=output.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");
 await writeFile(join(temp,name+'.mjs'),output);
}
let route=routeSource;
route=route
 .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;')
 .replaceAll('@/lib/live/','./');
let routeOutput=ts.transpileModule(route,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
routeOutput=routeOutput.replaceAll('@/lib/http-retry.mjs',httpRetry).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
await writeFile(join(temp,'route-seed-afir.mjs'),routeOutput);
const relay=await import(pathToFileURL(join(temp,'route-seed-afir.mjs')));
const cacheModule=await import(pathToFileURL(join(temp,'cache.mjs')));
const feedsModule=await import(pathToFileURL(join(temp,'feeds.mjs')));
const contentModule=await import(pathToFileURL(join(temp,'content.mjs')));
const seedEntry=JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8'))['feed:agricultura'];
const seedItems=seedEntry.data.items;
assert(Array.isArray(seedItems)&&seedItems.length>=8,'semnul de rezervă AFIR trebuie să conțină comunicatele reale');
const months=['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];
const feedHtml=items=>'<html><body>'+items.map(item=>{const [y,m,d]=String(item.publishedAt||'').split('-');const href=item.url.replace('https://www.afir.ro','');return '<div class="card-body news-content"><h4><a href="'+href+'">'+item.title+'</a></h4><p class="item-date">'+d+' '+months[Number(m)-1]+' '+y+'</p></div><div class="news-border"></div>'}).join('')+'</body></html>';
const articleHtml=item=>'<!doctype html><html><head><meta property="article:published_time" content="'+(item.publishedAt||'2026-10-01')+'T10:30:00+03:00"></head><body><h1>'+item.title+'</h1><div class="entry-content"><p>Primul paragraf integral al comunicatului de verificare.</p><p>Al doilea paragraf cu detalii despre finanțare.</p><a href="https://www.afir.ro/documente/anexa-verificare.pdf">Anexa comunicatului</a></div></body></html>';
const invalidArticleHtml='<p>nu este o pagină de comunicat</p>';
const token=globalThis.__aflivraTestEnv.REFRESH_TOKEN;
const call=async(payload,headers={})=>relay.POST(new Request('https://verify.test/api/seed/afir',{method:'POST',headers:{'content-type':'application/json',...headers},body:payload===undefined?undefined:JSON.stringify(payload)}));
const authorized=payload=>call(payload,{authorization:'Bearer '+token});
const body=async response=>{assert(response.headers.get('cache-control')==='no-store','fiecare răspuns al rutei rămâne nesalvat în cache');return response.json()};
const parseAfir=feedsModule.parseAfir,articleLoader=contentModule.articleLoader,afirLoader=feedsModule.afirLoader,readSource=cacheModule.readSource;
assert.deepEqual(parseAfir(feedHtml(seedItems)).data.items,seedItems,'fixturesle reconstruite din semnul de rezervă trebuie să reproducă exact comunicatele AFIR');

console.log('Leg 1 — poarta de acces (token Bearer, fail-closed):');
{
 const missing=await call({phase:'feed',body:'<html></html>'});
 assert.equal(missing.status,401,'fără token se respinge cu 401');assert.deepEqual(await missing.json(),{error:'Acces interzis.'},'mesajul 401 este generic');
 const wrong=await call({phase:'feed',body:'<html></html>'},{authorization:'Bearer token-gresit'});
 assert.equal(wrong.status,401,'tokenul greșit se respunde cu 401');assert.deepEqual(await wrong.json(),{error:'Acces interzis.'});
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM source_cache').first()).n,0,'401 nu atinge starea persistentă');
 const savedToken=globalThis.__aflivraTestEnv.REFRESH_TOKEN;
 delete globalThis.__aflivraTestEnv.REFRESH_TOKEN;
 const unset=await call({phase:'feed',body:'<html></html>'},{authorization:'Bearer '+savedToken});
 assert.equal(unset.status,401,'lipsa tokenului din mediu rămâne fail-closed');
 globalThis.__aflivraTestEnv.REFRESH_TOKEN=savedToken;
}
console.log('  acord: 401 generic fără token, cu token greșit și fără variabila de mediu.');

console.log('Leg 2 — validarea la graniță (faze, forme și limite):');
{
 const malformed=await authorized(undefined);
 assert.equal(malformed.status,400,'json invalid respins');
 const unknownPhase=await authorized({phase:'cosa-nostra',body:{}});
 assert.equal(unknownPhase.status,400);assert.match((await unknownPhase.json()).error,/Faze valide: feed, articles\./);
 const noPhase=await authorized({body:'x'});
 assert.equal(noPhase.status,400);
 for(const [label,payload] of [['corp lipsă',{phase:'feed'}],['corp negăsit',{phase:'feed',body:7}],['corp gol',{phase:'feed',body:''}],['corp prea mare',{phase:'feed',body:'<html>'+('x'.repeat(5_000_001))+'</html>'}]]){
  const response=await authorized(payload);assert.equal(response.status,400,label+' respins la graniță');
 }
 for(const [label,items] of [['lista goală',[]],[' Unsprezece articole',Array.from({length:11},(_,i)=>({url:seedItems[0].url,html:articleHtml(seedItems[0])+String(i)}))],['articol fără adresă',[{html:articleHtml(seedItems[0])}]],['articol fără pagină',[{url:seedItems[0].url}]]]){
  const response=await authorized({phase:'articles',items});assert.equal(response.status,400,label+' respins la graniță');
 }
 const badHost=await authorized({phase:'articles',items:[{url:'https://www.edu.ro/anunt',html:articleHtml(seedItems[0])}]});
 assert.equal(badHost.status,400,'doar comunicatele AFIR sunt acceptate');
 const badScheme=await authorized({phase:'articles',items:[{url:'http://www.afir.ro/comunicate/x/',html:articleHtml(seedItems[0])}]});
 assert.equal(badScheme.status,400,'doar adresele https sunt acceptate');
 const longUrl=await authorized({phase:'articles',items:[{url:'https://www.afir.ro/comunicate/'+'x'.repeat(2000)+'/',html:articleHtml(seedItems[0])}]});
 assert.equal(longUrl.status,400,'adresa peste 2000 de caractere se respinge');
 const emptyHtml=await authorized({phase:'articles',items:[{url:seedItems[0].url,html:''}]});
 assert.equal(emptyHtml.status,400,'pagina goală se respinge');
 const hugeHtml=await authorized({phase:'articles',items:[{url:seedItems[0].url,html:'<html>'+('x'.repeat(8_000_001))+'</html>'}]});
 assert.equal(hugeHtml.status,400,'pagina peste limită se respinge');
 const brokenFeed=await authorized({phase:'feed',body:'<html><body>homepage fără comunicate</body></html>'});
 assert.equal(brokenFeed.status,400);assert.equal((await brokenFeed.json()).error,'Structura comunicatelor AFIR s-a schimbat.');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM source_cache').first()).n,0,'nicio cerere deformărilor nu a scris în starea persistentă');
}
console.log('  acord: fază necunoscută, forme invalide, limite și gazde străine respinse cu 400; structura AFIR schimbată raportată în română.');

console.log('Leg 3 — prospețimea cititorului decide lista want (lipsă, expirată, cu eroare, cu versiune veche):');
{
 const loaderFor=item=>articleLoader(item.url);
 const insert=(key,data,extra)=>sqlite.prepare('INSERT INTO source_cache (key,data,published_at,last_success_at,expires_at,next_attempt_at,failures,lock_until,error,adapter_version) VALUES (?,?,?,?,?,?,?,?,?,?)').run(key,data,'2026-09-01',new Date(Date.now()-60000).toISOString(),Date.now()+3500000,0,0,0,(extra&&extra.error)||null,(extra&&extra.version)||loaderFor(seedItems[0]).version);
 const freshKey=loaderFor(seedItems[0]).key;
 insert(freshKey,JSON.stringify({content:'Copie de verificare.',textComplete:true,url:seedItems[0].url}));
 insert(loaderFor(seedItems[1]).key,JSON.stringify({content:'Copie veche.',textComplete:true,url:seedItems[1].url}),null);
 sqlite.prepare('UPDATE source_cache SET expires_at=? WHERE key=?').run(Date.now()-1000,loaderFor(seedItems[1]).key);
 insert(loaderFor(seedItems[2]).key,JSON.stringify({content:'Copie cu eroare.',textComplete:true,url:seedItems[2].url}),{error:'Sursa a răspuns cu HTTP 500.'});
 insert(loaderFor(seedItems[3]).key,JSON.stringify({content:'Copie cu versiune veche.',textComplete:true,url:seedItems[3].url}),{version:'official.article-body.v0'});
 const response=await authorized({phase:'feed',body:feedHtml(seedItems)});
 assert.equal(response.status,200,'faza feed degradează onest în bandă');
 const payload=await body(response);
 assert.equal(payload.result,'ok');assert.equal(payload.phase,'feed');assert.equal(payload.items,seedItems.length);
 assert.deepEqual(payload.want,seedItems.slice(1).map(item=>item.url),'want = comunicatele fără copie proaspătă, în ordinea fluxului');
 assert.equal(payload.feedStored,true,'copie de flux publicată');
 assert.equal(typeof payload.servedAt,'string');
 const feedRow=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(afirLoader.key).first();
 assert(feedRow,'rândul de flux există la cheia cititorului');
 assert.deepEqual(JSON.parse(feedRow.data),parseAfir(feedHtml(seedItems)).data,'rândul de flux păstrează exact rezultatul parserului AFIR');
 assert.equal(feedRow.adapter_version,afirLoader.version);assert.equal(feedRow.error,null);
 assert.equal(feedRow.published_at,seedEntry.publishedAt);
 assert(feedRow.last_success_at&&Date.parse(feedRow.last_success_at)>Date.now()-120000,'ultima preluare validă = momentul relay-ului');
 assert(feedRow.expires_at>Date.now()&&feedRow.expires_at<=Date.now()+afirLoader.ttl*1000+5000,'fereastra de valabilitate urmează ttl-ul sursei');
 assert.equal(feedRow.failures,0);assert.equal(feedRow.next_attempt_at,0);assert.equal(feedRow.lock_until,0);
}
console.log('  acord: want exclude doar copia validă; rândul de flux aterizează la cheia feed:agricultura cu rezultatul parserului.');

console.log('Leg 4 — faza articles publică textul integral exact pe lanul cititorului:');
{
 const target=seedItems.slice(4);
 const response=await authorized({phase:'articles',items:target.map(item=>({url:item.url,html:articleHtml(item)}))});
 assert.equal(response.status,200);
 const payload=await body(response);
 assert.equal(payload.result,'ok');assert.equal(payload.phase,'articles');
 assert.deepEqual(payload.stored,target.map(item=>item.url));assert.deepEqual(payload.failed,[]);
 for(const item of target){
  const loader=articleLoader(item.url),expected=contentModule.parseArticlePage(articleHtml(item),loader.url);
  const row=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first();
  assert(row,'articolul aterizează la exact cheia cititorului '+loader.key);
  assert.deepEqual(JSON.parse(row.data),expected.data,'rândul poartă exact rezultatul lanțului de parsare al cititorului');
  assert.equal(row.published_at,expected.publishedAt);assert.equal(row.adapter_version,loader.version);
  assert.equal(row.error,null);assert.equal(row.failures,0);assert.equal(row.next_attempt_at,0);assert.equal(row.lock_until,0);
  assert(row.last_success_at&&Date.parse(row.last_success_at)>Date.now()-120000,'ultima preluare validă = momentul relay-ului');
  assert(row.expires_at>Date.now()&&row.expires_at<=Date.now()+loader.ttl*1000+5000);
 }
 const again=await authorized({phase:'articles',items:target.map(item=>({url:item.url,html:articleHtml(item)}))});
 const republished=await body(again);
 assert.equal(republished.result,'ok');assert.deepEqual(republished.stored,target.map(item=>item.url),'re-relay-ul rămâne idempotent');
 for(const item of target){const row=await db.prepare('SELECT data FROM source_cache WHERE key=?').bind(articleLoader(item.url).key).first();assert.deepEqual(JSON.parse(row.data),contentModule.parseArticlePage(articleHtml(item),articleLoader(item.url).url).data)}
}
console.log('  acord: parseArticlePage + publishLoaded auterizează textul integral, titlul din h1 și anexele pe cheia article:<sha256>; re-relay idempotent.');

console.log('Leg 5 — eșecul per articol rămâne onest în bandă, fără să blocheze restul:');
{
 const response=await authorized({phase:'articles',items:[{url:seedItems[2].url,html:invalidArticleHtml},{url:seedItems[1].url,html:articleHtml(seedItems[1])}]});
 assert.equal(response.status,200);
 const payload=await body(response);
 assert.equal(payload.result,'partial');
 assert.deepEqual(payload.stored,[seedItems[1].url]);
 assert.deepEqual(payload.failed,[{url:seedItems[2].url,error:'Publicația nu a furnizat o pagină validă.'}]);
 assert((await db.prepare('SELECT error FROM source_cache WHERE key=?').bind(articleLoader(seedItems[1].url).key).first()).error===null,'articolul valid rămâne publicat');
}
console.log('  acord: pagina invalidă se raportează per articol; articolul bun se publică.');

console.log('Leg 6 — ciclul complet se închide: want devine gol după ce toate comunicatele au text integral:');
{
 const before=await body(await authorized({phase:'feed',body:feedHtml(seedItems)}));
 assert.deepEqual(before.want,[seedItems[2].url,seedItems[3].url],'comunicatele ratat și cu versiune veche rămân de preluat, în ordinea fluxului');
 const seal=await body(await authorized({phase:'articles',items:[seedItems[2],seedItems[3]].map(item=>({url:item.url,html:articleHtml(item)}))}));
 assert.equal(seal.result,'ok');assert.equal(seal.failed.length,0);
 const after=await body(await authorized({phase:'feed',body:feedHtml(seedItems)}));
 assert.deepEqual(after.want,[],' ciclul feed→articles se repetă până când want este gol');
}
console.log('  acord: repetarea fazelor până la want gol este contractul runnerului.');

console.log('Leg 7 — cititorul servește datele relay-uite fără nicio reinterogare a sursei (clasa egress blocat):');
{
 const original=globalThis.fetch;let fetches=0;
 globalThis.fetch=async()=>{fetches++;throw Error('afir.ro nu trebuie reinterogat din Worker')};
 try{
  const articleState=await readSource(articleLoader(seedItems[5].url));
  assert(['fresh','cached'].includes(articleState.status),'cititorul servește copia relay-uită');assert.equal(fetches,0);
  assert.equal(articleState.data.title,seedItems[5].title);assert.equal(articleState.data.textComplete,true);
  assert(articleState.data.content.includes('Primul paragraf integral'),'textul integral servit');
  assert.equal(articleState.data.attachments.length,1);assert.equal(articleState.data.attachments[0].title,'Anexa comunicatului');
  assert(articleState.lastSuccessAt&&Date.parse(articleState.lastSuccessAt)>Date.now()-600000,'ultima preluare validă = momentul relay-ului');
  const feedState=await readSource(afirLoader);
  assert(['fresh','cached'].includes(feedState.status),'fluxul servește copia relay-uită');assert.equal(fetches,0);
  assert.deepEqual(feedState.data.items,seedItems,'fluxul servește exact comunicatele publicate prin relay');
  assert(!feedState.error,'fluxul fără eroare de sursă');
 }finally{globalThis.fetch=original}
}
console.log('  acord: 0 accesări ale sursei — readSource pe articol și pe flux servește doar din starea persistentă.');

console.log('Leg 8 — lista want se limitează la 10 comunicate și păstrează ordinea fluxului:');
{
 sqlite.prepare('DELETE FROM source_cache').run();
 const extended=[...seedItems,...[1,2,3,4].map(i=>({id:'/comunicate/verificare-suplimentara-'+i+'/',title:'Comunicat suplimentar de verificare '+i,url:'https://www.afir.ro/comunicate/verificare-suplimentara-'+i+'/',publishedAt:'2026-09-0'+i}))];
 const capped=await body(await authorized({phase:'feed',body:feedHtml(extended)}));
 assert.equal(capped.items,extended.length);
 assert.deepEqual(capped.want,extended.slice(0,10).map(item=>item.url),'want păstrează ordinea fluxului, maximum 10');
}
console.log('  acord: maximum 10 adrese per ciclu, în ordinea comunicatelor.');

assert.equal(escapes.length,0,'nicio respingere neprinsă nu evadează din rută');
console.log('Relay AFIR: contrat verificat — '+(await db.prepare('SELECT COUNT(*) AS n FROM source_cache').first()).n+' rânduri publicate în memoria de test (flux + comunicate).');
await rm(temp,{force:true,recursive:true});
}catch(error){
 console.error((error&&error.stack)||error);
 process.exitCode=1;
 try{await rm(temp,{force:true,recursive:true})}catch{}
}
