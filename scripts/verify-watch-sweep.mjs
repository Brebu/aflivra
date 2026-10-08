import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,generateKeyPairSync} from 'node:crypto';
import ts from 'typescript';

// Tura „Urmărește”: detecția per fel de urmărire reRefolosește exact încărcătoarele și
// cache-urile familiilor existente, deduplică evenimentele pe semnătură stabilă și trimite
// notificări Web Push criptate (RFC 8291) semnate VAPID (RFC 8292) — totul cu fetch controlat,
// fără nicio adresă reală, iar tura raportează onest fiecare săritură de buget.
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const groupsMap=JSON.parse(await readFile(join(root,'lib/live/refresh-groups.json'),'utf8'));
const registersGroup=groupsMap.groups.find(group=>group.name==='registers');
assert.ok(registersGroup,'grupul registers există înregistrat');
assert.equal(registersGroup.cron,'28 0,4,10,16 * * *','declanșatorul registers poartă tura de dimineață (00:28 UTC) și cele trei ture de urmărire (04:28, 10:28, 16:28 UTC) — planul gratuit rămâne la maximum cinci crons, deci urmărirea călătorește pe declanșătorul existent, cu dispatch pe oră');
assert.equal(new Set(groupsMap.groups.map(group=>group.cron)).size,groupsMap.groups.length);
assert.equal(groupsMap.groups.length,5,'cele cinci crons ale planului gratuit rămân intacte');
const temp=await mkdtemp(join(tmpdir(),'aflivra-watch-sweep-')),sqlite=new DatabaseSync(':memory:');
sqlite.exec(await readFile(join(root,'drizzle/0000_thin_demogoblin.sql'),'utf8'));
const db={prepare(sql){let args=[];const wrapper={bind(...values){for(const v of values)if(typeof v==='string'&&Buffer.byteLength(v)>2_000_000)throw Error('D1 row bound exceeded');args=values;return wrapper},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(result.changes)}}}};return wrapper},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results}};
const vapid=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const b64url=bytes=>Buffer.from(bytes).toString('base64url');
const vapidPrivate=b64url(Buffer.from(vapid.privateKey.export({format:'jwk'}).d,'base64url'));
const vapidJwk=vapid.publicKey.export({format:'jwk'});
const vapidPublicRaw=Buffer.concat([Buffer.from([4]),Buffer.from(vapidJwk.x,'base64url'),Buffer.from(vapidJwk.y,'base64url')]);
const vapidPublic=b64url(vapidPublicRaw);
const ua=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const uaPrivateJwk=ua.privateKey.export({format:'jwk'});
const uaPublicRaw=Buffer.concat([Buffer.from([4]),Buffer.from(ua.publicKey.export({format:'jwk'}).x,'base64url'),Buffer.from(ua.publicKey.export({format:'jwk'}).y,'base64url')]);
const uaAuth=Buffer.from('auth-secret-de-verificare');
globalThis.__aflivraTestEnv={DB:db,VAPID_PRIVATE:vapidPrivate,VAPID_PUBLIC:vapidPublic};
globalThis.__aflivraResourceCopies=JSON.parse(await readFile(join(root,'lib/live/resource-seed.json'),'utf8'));
const originalFetch=globalThis.fetch;
try{
const httpRetry=pathToFileURL(join(root,'lib/http-retry.mjs')).href;
for(const name of ['court-history','court-query','location-context','geographic-scope','tabular-geography']){let source=await readFile(join(root,'lib',name+'.ts'),'utf8');for(const [binding,path] of [['countyLookup','public/data/locality-counties.json'],['urbanLocalities','public/data/geographic-localities.json']])source=source.replace('import '+binding+" from '@/"+path+"';",'const '+binding+'='+await readFile(join(root,path),'utf8')+';');source=source.replace("from './live/query'","from './query'").replace("import institutions from '@/public/courts/institutions.json';",'const institutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");await writeFile(join(temp,name+'.mjs'),js)}
for(const name of ['records','text','media','query','source-xml','source-html','catalog-categories','catalog-metadata','adapters','company-registries','feeds','request-context','resource-copy','cache','weather-gate','forecast','weather','transport','transit-realtime','legal-consolidation','legal-portal','legal-registry','court-references','legal-selection','legal','knowledge','lawyers','directories','justice','trains','flights','housing','resources','events','cinema','stories','web-push','watch-sweep']){let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
 if(name==='watch-sweep')source=source.replace(/import\s+\w+\s+from\s+'\.\/refresh-groups\.json';/,'const sweepGroupsMap='+JSON.stringify(groupsMap)+';');
 source=source.replace("from '../court-history'","from './court-history'").replace("from '../court-query'","from './court-query'").replace("from '../geographic-scope'","from './geographic-scope'").replace("from '../tabular-geography'","from './tabular-geography'").replace("from '../location-context'","from './location-context'").replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;').replace("import baseSeeds from './seed.json';",'const baseSeeds={};').replace("import {serverSeeds,catalogSeed} from './seed-snapshots';",'const serverSeeds={};const catalogSeed=[];').replace("import resourceCopies from './resource-seed.json';",'const resourceCopies=globalThis.__aflivraResourceCopies;').replace("import courtInstitutions from '@/public/courts/institutions.json';",'const courtInstitutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';').replace("import venuesCatalog from '@/public/events/venues.json';",'const venuesCatalog='+await readFile(join(root,'public/events/venues.json'),'utf8')+';').replace("import confirmed from '@/public/courts/confirmed-references.json';",'const confirmed='+await readFile(join(root,'public/courts/confirmed-references.json'),'utf8')+';').replace("import codes from '@/public/legal-snapshots/manifest.json';",'const codes='+await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8')+';').replace("import codes from '@/public/legal-snapshots/manifest.json';",'const codes='+await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8')+';').replace("import cinemaCatalog from '@/public/cinema/cinemas.json';",'const cinemaCatalog='+await readFile(join(root,'public/cinema/cinemas.json'),'utf8')+';').replace("import audit from '@/public/catalog/audit.json';",'const audit='+await readFile(join(root,'public/catalog/audit.json'),'utf8')+';')
 let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");for(const pkg of ['xlsx','fflate'])output=output.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");
 await writeFile(join(temp,name+'.mjs'),output)}
const watch=await import(pathToFileURL(join(temp,'watch-sweep.mjs')));

console.log('Leg 1 — cron-ul și dispatch-ul turei de urmărire:');
{
 assert.equal(watch.WATCH_SWEEP_CRON,registersGroup.cron,'cronul turei vine din registru, nu dintr-o constantă paralelă');
 assert.deepEqual(watch.watchSweepSchedule(),{runsPerDay:3,timesUtc:'04:28, 10:28, 16:28'},'eticheta onestă „verificăm de 3 ori pe zi” se derivă din cron, nu se scrie de mână');
 const at=(hour,minute)=>({cron:watch.WATCH_SWEEP_CRON,scheduledTime:Date.UTC(2026,9,7,hour,minute)});
 assert.equal(watch.runsWatchSweep(at(0,28)),false,'firingul de la ora 00 UTC rămâne tura registers, neatinstituită de urmărire');
 assert.equal(watch.runsWatchSweep(at(4,28)),true);assert.equal(watch.runsWatchSweep(at(10,28)),true);assert.equal(watch.runsWatchSweep(at(16,28)),true);
 assert.equal(watch.runsWatchSweep({cron:'0 0 * * *',scheduledTime:Date.UTC(2026,9,7,0,0)}),false,'celelalte cron-uri nu declanșează urmărirea');
 for(const [kind,ref,label] of [['dosar','12/3','număr scurt de dosar'],['firma','0427282','CUI cu zero în frunte'],['meteo','Atlantis','județ necunoscut'],['venue','teatrul-muncii','venue neînregistrat'],['act','https://www.edu.ro/act','act cu adresă străină'],['localitate','Nămolul de Mijloc','localitate necunoscută']])assert.ok(watch.watchRefError(kind,ref),label+' se respinge la graniță');
 assert.equal(watch.watchRefError('localitate','Cluj-Napoca'),null,'localitatea din registrul național trece');
 assert.equal(watch.watchRefError('meteo','Ilfov'),null);assert.equal(watch.watchRefError('venue','operacluj'),null);
 assert.equal(watch.watchRefError('act','law-'+createHash('sha256').update('x').digest('hex')),null,'identificatorul de rezervă al actului trece');
 assert.equal(watch.watchRefError('dosar','123/45/2026'),null);assert.equal(watch.watchRefError('firma','427282'),null);
}
console.log('  acord: cronul registers purtat ca declanșator, dispatch pe oră, trei ture pe zi, fiecare fel de referință validată.');

console.log('Leg 2 — abonarea și abonamentul push:');
const install='9c1d1aa8-2f4d-4c72-8e72-1e28a8ab3f61';
let added=0;
for(const [kind,ref,label] of [['dosar','123/45/2026','Dosar de verificare'],['firma','427282','Firma de verificare'],['localitate','Cluj-Napoca',null],['act','https://legislatie.just.ro/Public/DetaliiDocumentAfis/123','ORDONANȚĂ DE URGENȚĂ 5/2026'],['venue','odeon',null],['meteo','Cluj',null]]){await watch.addWatch(db,install,kind,ref,label);added++}
assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM watch_items WHERE install_id=?').bind(install).first()).n,added);
assert.ok(!watch.validInstallId('nu-sunt-un-uuid'),'identificatorul de instalare se validează la graniță');
await watch.savePushSubscription(db,install,{endpoint:'https://push.example/sub-de-verificare',keys:{p256dh:b64url(uaPublicRaw),auth:b64url(uaAuth)}});
assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?').bind(install).first()).n,1);

const feedItem=(n,city,date)=>`<item><title>Anunț oficial ${n} pentru ${city}</title><link>https://www.mai.gov.ro/anunt-${n}/</link><pubDate>${date}</pubDate><description>Anunț de verificare despre ${city}.</description></item>`;
const fixtures={
 stiriVersion:1,
 stiri:()=>`<rss><channel>${feedItem(1,'Cluj-Napoca','Mon, 05 Oct 2026 09:00:00 GMT')}${feedItem(2,'București','Mon, 05 Oct 2026 10:00:00 GMT')}${fixtures.stiriVersion>1?feedItem(3,'Cluj-Napoca','Tue, 06 Oct 2026 09:00:00 GMT'):''}${fixtures.stiriVersion>3?feedItem(4,'Cluj-Napoca','Wed, 07 Oct 2026 09:00:00 GMT'):''}${fixtures.stiriVersion>4?feedItem(5,'Cluj-Napoca','Thu, 08 Oct 2026 09:00:00 GMT'):''}</channel></rss>`,
 alertsVersion:1,
 alerts:()=>`<avertizari cod="GALBEN" tip="1">${fixtures.alertsVersion>1?'<avertizare fenomen="Caniculă" intensitate="38 grade" localitate="Cluj, București - Ilfov" dataStart="2026-07-10" dataStop="2026-07-12"/>':''}<avertizare fenomen="Vânt" intensitate="50-70 km/h" localitate="Constanța" dataStart="2026-10-05" dataStop="2026-10-06"/></avertizari>`,
 companyVersion:1,
 companyName:()=>fixtures.companyVersion>1?'FIRMA DE VERIFICARE ACTUALIZATĂ S.A.':'FIRMA DE VERIFICARE S.A.',
 courtVersion:1,
 courtHearings:()=>fixtures.courtVersion>1?2:1,
 lawVersion:1,
 lawDate:()=>fixtures.lawVersion>1?'2026-02-02':'2026-01-01',
 eventsVersion:1,
 odeonEvents:()=>Array.from({length:fixtures.eventsVersion},(_,i)=>JSON.stringify({'@type':'Event',name:'Spectacol de verificare '+i,startDate:'2026-10-1'+(i%10)+'T19:30:00',url:'https://teatrul-odeon.ro/spectacol/verificare-'+i})).join(',')
};
const courtEnvelope=(operation,hearings)=>`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${operation}Response xmlns="portalquery.just.ro"><${operation}Result><Dosar><numar>123/45/2026</numar><institutie>PRORPJ</institutie><departament>PENAL</departament><data>2026-01-10T00:00:00</data><dataModificare>2026-10-0${Math.min(hearings,9)}T09:00:00</dataModificare><obiect>Practică frauduloasă</obiect><stadiuProcesualNume>Fond</stadiuProcesualNume><sedinte>${Array.from({length:hearings},(_,i)=>`<DosarSedinta><data>2026-11-0${i+1}</data><ora>09:0${i}</ora><complet>2</complet><solutie>Solutie</solutie><solutieSumar>Aducere la cunoștință</solutieSumar></DosarSedinta>`).join('')}</sedinte></Dosar></${operation}Result></${operation}Response></s:Body></s:Envelope>`;
const lawEnvelope=date=>`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><SearchResponse xmlns="http://tempuri.org/"><SearchResult xmlns:a="http://schemas.datacontract.org/2004/07/FreeWebService"><Legi><Titlu>ORDONANȚĂ DE URGENȚĂ 5/2026</Titlu><Numar>5</Numar><DataVigoare>${date}</DataVigoare><TipAct>ORDONANTA DE URGENTA</TipAct><Emitent>GUVERN</Emitent><Publicatie>MONITORUL OFICIAL</Publicatie><LinkHtml>https://legislatie.just.ro/Public/DetaliiDocumentAfis/123</LinkHtml></Legi></SearchResult></SearchResponse></s:Body></s:Envelope>`;
const pushCalls=[];const pushResponses={};
globalThis.fetch=async(url,init={})=>{
 const href=String(typeof url==='string'?url:url&&typeof url.url==='string'?url.url:url),method=(init.method||'GET').toUpperCase();
 if(href==='https://www.mai.gov.ro/feed/')return new Response(fixtures.stiri(),{headers:{'content-type':'application/rss+xml'}});
 if(href==='https://www.meteoromania.ro/avertizari-xml.php')return new Response(fixtures.alerts(),{headers:{'content-type':'application/xml'}});
 if(href.startsWith('https://teatrul-odeon.ro/'))return new Response('<script type="application/ld+json">['+fixtures.odeonEvents()+']</script>',{headers:{'content-type':'text/html'}});
 if(href.startsWith('https://webservicesp.anaf.ro/bilant')){const params=new URL(href).searchParams;return Response.json({cui:Number(params.get('cui')),an:Number(params.get('an')),deni:fixtures.companyName(),caen:'7021',i:[{indicator:'I28',val_indicator:'1234',val_den_indicator:'Rezultatul brut'}]})}
 if(href==='https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva')return Response.json([{date_generale:{cui:427282,data:'2026-10-01',denumire:fixtures.companyName(),adresa:'STR VERIFICARII NR 1',nrRegCom:'J40/1/2026',cod_CAEN:'7021',telefon:'',fax:'',codPostal:'010101',forma_juridica:'SOCIETATE PE ACTIUNI',organFiscalCompetent:'AFI 1',data_inregistrare:'2026-01-01',stare_inregistrare:'INREGISTRAT'},inregistrare_scop_Tva:{scpTVA:false},stare_inactiv:{statusInactivi:false}}]);
 if(href==='http://portalquery.just.ro/Query.asmx'){const operation=String(init.body||'').includes('CautareDosare2')?'CautareDosare2':'CautareDosare';return new Response(courtEnvelope(operation,fixtures.courtHearings()),{headers:{'content-type':'text/xml'}})};
 if(href==='http://legislatie.just.ro/apiws/FreeWebService.svc/SOAP'){const body=String(init.body||'');if(body.includes('GetToken'))return new Response('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetTokenResponse xmlns="http://tempuri.org/"><GetTokenResult>token-de-verificare</GetTokenResult></GetTokenResponse></s:Body></s:Envelope>',{headers:{'content-type':'text/xml'}});return new Response(lawEnvelope(fixtures.lawDate()),{headers:{'content-type':'text/xml'}})}
 if(href.startsWith('https://push.example/')){const raw=init.headers;const headers={};if(raw instanceof Headers)for(const [key,value] of raw.entries())headers[key.toLowerCase()]=value;else for(const [key,value] of Object.entries(raw||{}))headers[String(key).toLowerCase()]=value;pushCalls.push({endpoint:href,headers,body:new Uint8Array(init.body)});return new Response(null,{status:pushResponses[href]??201})}
 throw Error('adresă neacoperită de fixture: '+method+' '+href)};
const expireSources=async()=>{sqlite.prepare("UPDATE source_cache SET expires_at=0, next_attempt_at=0, lock_until=0 WHERE key NOT LIKE 'sweep:%'").run()};
const events=async(filter,args=[])=>(await db.prepare('SELECT * FROM watch_events'+(filter?' WHERE '+filter:'')).bind(...args).all()).results;
const count=async(sql,args=[])=>(await db.prepare(sql).bind(...args).all()).results[0].n;
async function decryptPush(bodyBytes){
 const salt=Buffer.from(bodyBytes.slice(0,16)),keyid=Buffer.from(bodyBytes.slice(21,86)),ciphertext=Buffer.from(bodyBytes.slice(86));
 const application=await crypto.subtle.importKey('raw',keyid,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const device=await crypto.subtle.importKey('jwk',{...uaPrivateJwk},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
 const ikm=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:application},device,256));
 const hkdf=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);
 const cek=new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:uaAuth,info:new TextEncoder().encode('WebPush: info aes128gcm')},hkdf,128));
 const nonce=new Uint8Array(12);
 for(let i=0;i<4;i++)nonce[8+i]=salt[12+i]^(i===3?1:0);
 const aesKey=await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['decrypt']);
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce,tagLength:128},aesKey,ciphertext));
 assert.equal(plain.at(-1),2,'delimitatorul de umplere 0x02 încheie textul');
 return JSON.parse(new TextDecoder().decode(plain.slice(0,-1)))}

console.log('Leg 3 — prima tură stabilește linia de bază, fără evenimente:');
{
 const state=await watch.runWatchSweep(db);
 assert.ok(state);assert.equal(state.itemsChecked,6,'toate cele șase urmăriri au fost verificate');
 assert.equal(await count('SELECT COUNT(*) AS n FROM watch_events'),0,'prima verificare nu generează evenimente — linia de bază');
 for(const row of (await db.prepare('SELECT * FROM watch_items WHERE install_id=?').bind(install).all()).results){assert.ok(row.fingerprint,'fiecare urmărire are amprenta liniei de bază');assert.ok(row.checked_at)}
}
console.log('  acord: abonarea nu înseamnă istorie — evenimentele încep de la schimbarea de după abonare.');

console.log('Leg 4 — schimbările reale produc exact un eveniment per urmărire:');
{
 fixtures.stiriVersion=2;fixtures.alertsVersion=2;fixtures.courtVersion=2;fixtures.lawVersion=2;fixtures.eventsVersion=2;fixtures.companyVersion=2;
 await expireSources();
 const state=await watch.runWatchSweep(db);
 assert.ok(state);assert.equal(state.eventsEmitted,6,'șase schimbări, șase evenimente');
 assert.equal(await count('SELECT COUNT(*) AS n FROM watch_events'),6);
 const rows=(await db.prepare('SELECT * FROM watch_events ORDER BY kind').all()).results;
 const byKind=Object.fromEntries(rows.map(row=>[row.kind,row]));
 assert.equal(byKind.localitate.title,'Știre pentru Cluj-Napoca');
 assert.match(byKind.localitate.body,/Anunț oficial 3 pentru Cluj-Napoca/);
 assert.equal(byKind.localitate.sig,'loc:cluj napoca:https://www.mai.gov.ro/anunt-3','semnătura evenimentului de știre e stabilă: localitate + adresă canonică');
 assert.equal(byKind.meteo.title,'Avertizare ANM — Cluj');
 assert.match(byKind.meteo.body,/Caniculă/);
 assert.match(byKind.meteo.body,/2026-07-10/);
 assert.match(byKind.firma.body,/ANAF/,'evenimentul de firmă menționează ANAF');
 assert.match(byKind.dosar.body,/portal\.just|dosarului/i,'evenimentul de dosar menționează dosarul');
 assert.equal(byKind.act.title,'Act normativ actualizat');
 assert.match(byKind.venue.body,/Spectacol de verificare 1/);
 for(const row of rows){assert.equal(row.url,'/#view=watch&event='+row.id,'legătura profundă a evenimentului');assert.equal(row.seen,0);assert.equal(row.install_id,install)}
 const sweepRow=await db.prepare("SELECT data,adapter_version FROM source_cache WHERE key='sweep:watch'").first();
 assert.equal(sweepRow.adapter_version,'watch.sweep.v1');
 const stored=JSON.parse(sweepRow.data);assert.equal(stored.eventsEmitted,6);assert.ok(stored.finishedAt>=stored.startedAt);
 const shape=await watch.watchSweepPublicState(db);
 assert.equal(shape.runsPerDay,3);assert.equal(shape.timesUtc,'04:28, 10:28, 16:28');
 assert.equal(shape.lastRunAt,state.finishedAt);assert.equal(shape.lastEvents,6);assert.equal(shape.lastOk,true);assert.match(shape.note,/3 ori pe zi/);
}
console.log('  acord: firmă, localitate, dosar, act, venue și meteo — câte un eveniment fiecare, cu stare de tură onestă.');

console.log('Leg 5 — re-verificarea fără schimbare nu produce nimic (dedublare pe semnătură):');
{
 await expireSources();
 const state=await watch.runWatchSweep(db);
 assert.ok(state);assert.equal(state.eventsEmitted,0,'niciun eveniment nou la re-verificare');
 assert.equal(await count('SELECT COUNT(*) AS n FROM watch_events'),6,'tabelul rămâne la cele șase evenimente');
 assert.equal(state.pushesSent,0,'fără schimbări nu se trimite nicio notificare');
}
console.log('  acord: semnătura stabilă per (instalație, sursă, element) blochează dublurile.');

console.log('Leg 6 — notificarea push: antet VAPID ES256 valid, corp aes128gcm decriptabil de receptor:');
{
 assert.equal(pushCalls.length,6,'câte un trimis per eveniment nou');
 const eventRows=(await db.prepare('SELECT * FROM watch_events ORDER BY kind').all()).results;
 const byId=new Map(eventRows.map(row=>[row.id,row]));
 for(const call of pushCalls){
  const header=call.headers['authorization'];
  assert.ok(header&&header.startsWith('vapid t='),'antetul Authorization poartă schema vapid');
  assert.ok(header.endsWith(', k='+vapidPublic),'cheia publică VAPID expusă clienților e exact k= din antet');
  const jwt=header.slice('vapid t='.length,header.length-(', k='+vapidPublic).length);
  const [head,payloadText,signature]=jwt.split('.');
  assert.equal(head,b64url(new TextEncoder().encode('{"typ":"JWT","alg":"ES256"}')),'antetul JWT păstrează ordinea câmpurilor din contractul VAPID');
  const payload=JSON.parse(Buffer.from(payloadText,'base64url').toString());
  assert.equal(payload.aud,'https://push.example','aud = originea endpointului de push');
  assert.ok(payload.exp>Date.now()/1000&&payload.exp<Date.now()/1000+13*3600,'experare la 12h±1h');
   assert.equal(payload.sub,'mailto:contactretetesecrete@gmail.com','contactul RFC 8292 este adresa reală a operatorului, nu un internal placeholder');
  const verifyKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64url(vapidPublicRaw.slice(1,33)),y:b64url(vapidPublicRaw.slice(33))},{name:'ECDSA',namedCurve:'P-256',hash:'SHA-256'},false,['verify']);
  assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},verifyKey,Buffer.from(signature,'base64url'),new TextEncoder().encode(head+'.'+payloadText)),'semnătura ES256 se verifică cu cheia publică VAPID');
  assert.equal(call.headers['content-encoding'],'aes128gcm');assert.equal(call.headers['ttl'],'86400');assert.equal(call.headers['content-type'],'application/octet-stream');
  const body=call.body;
  assert.ok(body.length>86,'corpul are antet de schemă aes128gcm');
  assert.deepEqual([...body.slice(16,20)],[0,0,0x10,0],'rs=4096 big-endian');
  assert.equal(body[20],65,'idlen = 65 octeți');assert.equal(body[21],4,'cheia efemeră e punct P-256 necomprimat');
  const plaintext=await decryptPush(body);
  const row=byId.get(plaintext.url.slice('/#view=watch&event='.length));
  assert.ok(row,'payloadul decriptat referă un eveniment real');
  assert.equal(plaintext.title,row.title);assert.equal(plaintext.body,row.body);assert.equal(plaintext.url,row.url);
 }
}
console.log('  acord: vapid t/k, JWT ES256 verificabil cu ordinea de câmpuri impusă, corp decriptat integral de receptorul de test.');

console.log('Leg 7 — 410 de la serviciul push curăță abonamentul dispărut:');
{
 pushResponses['https://push.example/sub-de-verificare-410']=410;
 await watch.savePushSubscription(db,install,{endpoint:'https://push.example/sub-de-verificare-410',keys:{p256dh:b64url(uaPublicRaw),auth:b64url(uaAuth)}});
 assert.equal(await count('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?',[install]),2);
 fixtures.stiriVersion=4;await expireSources();
 const state=await watch.runWatchSweep(db);
 assert.ok(state);
 assert.equal(await count('SELECT COUNT(*) AS n FROM watch_events WHERE kind=? AND ref=?',['localitate','Cluj-Napoca']),2,'a doua știre Cluj devine eveniment');
 assert.equal(await count('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?',[install]),1,'abonamentul dispărut (410) se curăță');
 assert.equal(state.pushGone,1);assert.ok(state.pushesSent>=1,'abonamentul rămas primește notificarea');
 assert.equal(pushCalls.at(-1).endpoint,'https://push.example/sub-de-verificare-410','curățarea se face exact pe abonamentul care a răspuns 410');
}
console.log('  acord: 410 = abonamentul nu mai există; rândul lui dispare, celelalte funcționează.');

console.log('Leg 8 — bugetul de subrequest-uri amână onest, fără evenimente false:');
{
 const extra='b7e51aa2-36aa-423a-b0d0-cb399e1c5876';
 for(let at=0;at<25;at++)await watch.addWatch(db,extra,'dosar','20'+String(10+at)+'/33/2026',null);
 sqlite.prepare("UPDATE source_cache SET expires_at=0 WHERE key LIKE 'court:%'").run();
 const first=await watch.runWatchSweep(db);
 assert.ok(first);
 const total=await count('SELECT COUNT(*) AS n FROM watch_items WHERE kind=? AND install_id=?',['dosar',extra]);
 const checked=await count('SELECT COUNT(*) AS n FROM watch_items WHERE kind=? AND install_id=? AND checked_at IS NOT NULL',['dosar',extra]);
 assert.ok(checked<total,'bugetul epuizat amână restul — nu se fabrică verificări');
 assert.ok(checked>0,'o parte din dosare se verifică în tura curentă');
 assert.ok(first.budgetSkipped>0,'săriturile de buget se raportează în starea turei');
 const dosarEvents=await count('SELECT COUNT(*) AS n FROM watch_events WHERE install_id=? AND kind=?',[extra,'dosar']);
 assert.equal(dosarEvents,0,'linia de bază pentru dosarele noi nu generează evenimente');
 sqlite.prepare("UPDATE source_cache SET expires_at=0 WHERE key LIKE 'court:%'").run();
 await watch.runWatchSweep(db);
 const checkedAgain=await count('SELECT COUNT(*) AS n FROM watch_items WHERE kind=? AND install_id=? AND checked_at IS NOT NULL',['dosar',extra]);
 assert.ok(checkedAgain>checked,'tura următoare continuă cu cele mai vechi neverificate');
}
console.log('  acord: plafonul de dosare și bugetul global de accesări limitează tura, cu amânare onestă și reluare din cel mai vechi.');

console.log('Leg 9 — urmărirea mută primește eveniment, dar nu notificare:');
{
 sqlite.prepare('UPDATE watch_items SET muted=1 WHERE install_id=?').run(install);
 const pushCountBefore=pushCalls.length;
 fixtures.stiriVersion=5;await expireSources();
 const state=await watch.runWatchSweep(db);
 assert.ok(state);
 assert.equal(await count('SELECT COUNT(*) AS n FROM watch_events WHERE install_id=? AND sig=?',[install,'loc:cluj napoca:https://www.mai.gov.ro/anunt-5']),1,'evenimentul nou există în centru');
 assert.equal(pushCalls.length,pushCountBefore,'nicun trimis push pentru o instalație cu toate urmăririle muțite');
}
console.log('  acord: mutarea oprește notificarea, nu istoricul — centrul rămâne sursa adevărului.');

console.log('Leg 10 — curățarea șterge toate datele instalației:');
{
 const otherCount=await count('SELECT COUNT(*) AS n FROM watch_items');
 const purge=await watch.purgeInstall(db,install);
 const purged=purge.purged;
 assert.ok(purged.watches>=6&&purged.events>=8&&purged.subscriptions>=1);
 assert.equal(await count('SELECT COUNT(*) AS n FROM watch_items WHERE install_id=?',[install]),0);
 assert.equal(await count('SELECT COUNT(*) AS n FROM watch_events WHERE install_id=?',[install]),0);
 assert.equal(await count('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?',[install]),0);
 assert.equal(await count('SELECT COUNT(*) AS n FROM watch_items'),otherCount-purged.watches,'alte instalații rămân neatinse');
 assert.deepEqual(await watch.purgeInstall(db,install),{purged:{watches:0,events:0,subscriptions:0}},'o instalație fără date se curăță cu zero contabile, nu cu eroare');
}
console.log('  acord: „Șterge-mi datele” șterge integral și numai instalația care cere.');

console.log('Leg 11 — retenția: urmărirea fără interacțiune de 180 de zile se curăță singură; evenimentul de 365 de zile la fel:');
{
  const stale='a1b2c3d4-0000-4000-8000-000000000001',fresh='a1b2c3d4-0000-4000-8000-000000000002',active='a1b2c3d4-0000-4000-8000-000000000003';
  const daysAgo=n=>new Date(Date.now()-n*864e5).toISOString();
  // o urmărire de 400 de zile fără vreun eveniment — se elimină la tură;
  await watch.addWatch(db,stale,'meteo','Cluj',null);
  sqlite.prepare('UPDATE watch_items SET created_at=? WHERE install_id=?').run(daysAgo(400),stale);
  // o urmărire veche dar cu activitate recentă (eveniment de acum 10 zile) — rămâne;
  await watch.addWatch(db,active,'meteo','Ilfov',null);
  sqlite.prepare('UPDATE watch_items SET created_at=? WHERE install_id=?').run(daysAgo(400),active);
  sqlite.prepare('INSERT INTO watch_events (id,install_id,kind,ref,title,body,url,created_at,seen,sig) VALUES (?,?,?,?,?,?,?,?,0,?)').run('retention-active-probe',active,'meteo','Ilfov','Avertizare recentă de probă',null,'/#view=watch&event=retention-active-probe',daysAgo(10),'meteo:if:retention-probe-1');
  // o urmărire proaspătă — rămâne.
  await watch.addWatch(db,fresh,'meteo','Constanța',null);
  // două evenimente de 400 de zile — se elimină la cele 365 de zile ale politicii.
  for(let at=1;at<=2;at++)sqlite.prepare('INSERT INTO watch_events (id,install_id,kind,ref,title,body,url,created_at,seen,sig) VALUES (?,?,?,?,?,?,?,?,0,?)').run('retention-old-'+at,fresh,'meteo','Constanța','Avertizare veche de probă '+at,null,'/#view=watch&event=retention-old-'+at,daysAgo(400),'meteo:ct:retention-old-'+at);
  await expireSources();
  const state=await watch.runWatchSweep(db);
  assert.ok(state);
  assert.equal(state.retentionWatches,1,'doar urmăirea fără nicio activitate de 180+ zile se elimină');
  assert.equal(state.retentionEvents,2,'evenimentele mai vechi de 365 de zile se elimină, numărate onest');
  assert.ok(state.notes.some(note=>note.includes('180')),'tura înregistrează o notă de retenție cu numărul politicilor');
  assert.equal(await count('SELECT COUNT(*) AS n FROM watch_items WHERE install_id=?',[stale]),0,'urmărirea de 400 de zile fără evenimente dispare');
  assert.equal(await count('SELECT COUNT(*) AS n FROM watch_items WHERE install_id=?',[active]),1,'urmărirea veche cu activitate recentă rămâne');
  assert.equal(await count('SELECT COUNT(*) AS n FROM watch_items WHERE install_id=?',[fresh]),1,'urmărirea proaspătă rămâne');
  assert.equal(await count('SELECT COUNT(*) AS n FROM watch_events WHERE sig LIKE \'meteo:ct:retention-old%\''),0,'evenimentele de 400 de zile dispar');
  assert.equal(await count('SELECT COUNT(*) AS n FROM watch_events WHERE sig=\'meteo:if:retention-probe-1\''),1,'evenimentul recent de probă rămâne');
}
console.log('  acord: 180 de zile fără interacțiune elimină urmărirea; evenimentele trăiesc maximum 365 de zile — politica și tura spun aceleași numere.');

console.log('Leg 12 — numerele politicii de pe /confidentialitate sunt cele ale turei, nu ale unui text rupt de cod:');
{
  const policy=await readFile(join(root,'app/confidentialitate/page.tsx'),'utf8');
  assert.ok(policy.includes(String(watch.WATCH_INACTIVE_DAYS)+' de zile'),'pagina spune numărul exact de zile de inactivitate al turei ('+watch.WATCH_INACTIVE_DAYS+')');
  assert.ok(policy.includes(String(watch.EVENT_RETENTION_DAYS)+' de zile'),'pagina spune numărul exact de zile de viață al evenimentelor ('+watch.EVENT_RETENTION_DAYS+')');
  assert.ok(policy.includes('contactretetesecrete@gmail.com'),'pagina poartă contactul real al operatorului — același din antetul VAPID');
  assert.ok(policy.includes('anpdcp.ro'),'pagina arată autoritatea de supraveghere');
  for(const surface of ['app/site-footer.tsx','app/page.tsx'])
    assert.ok((await readFile(join(root,surface),'utf8')).includes('mailto:contactretetesecrete@gmail.com'),'contactul apare și în subsol ('+surface+')');
}
console.log('  acord: schimbarea constantelor de retenție sau a contactului fără actualizarea paginii rupe tura de contract — intenționat.');
console.log('Tura „Urmărește”: contract verificat — '+pushCalls.length+' trimisuri push modelate, evenimente deduplicate pe semnătură, buget și plafoane raportate onest.');
}catch(error){console.error((error&&error.stack)||error);process.exitCode=1}finally{globalThis.fetch=originalFetch;delete globalThis.__aflivraTestEnv;delete globalThis.__aflivraResourceCopies;await rm(temp,{recursive:true,force:true})}
