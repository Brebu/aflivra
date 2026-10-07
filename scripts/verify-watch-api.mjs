import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {generateKeyPairSync} from 'node:crypto';
import ts from 'typescript';

// Rutele „Urmărește”: contractul public — adăugare, listă cu contorizare, flux de evenimente
// cu ( Șterge-mi datele”) — validat integral offline, pe o bază în memorie și un compilat al
// rutelor; identificatorul de instalare rămâne singura cheie, iar fiecare interogare e mărginită.
// Addendum-ul v1 (2026-10-07): comutarea notificărilor per rând (mute) și dez-abonarea push
// server-side, pe endpoint — ambele validate la graniță și mărginite la instalația care cere.
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const routePaths=['app/api/watch/route.ts','app/api/watch-events/route.ts','app/api/watch-events/ack/route.ts','app/api/watch/subscribe/route.ts','app/api/watch/mute/route.ts','app/api/watch/purge/route.ts'];
for(const route of routePaths){try{await access(join(root,route))}catch{console.error('RED: '+route+' nu există încă — implementează rutele de urmărire ca să devină verde acest ham.');process.exit(1)}}
assert.ok(await readFile(join(root,'drizzle/0000_thin_demogoblin.sql'),'utf8').then(sql=>sql.includes('CREATE TABLE `watch_items`')&&sql.includes('CREATE TABLE `watch_events`')&&sql.includes('CREATE TABLE `push_subs`')),'migrația conține cele trei tabele de urmărire');
const temp=await mkdtemp(join(tmpdir(),'aflivra-watch-api-')),sqlite=new DatabaseSync(':memory:');
sqlite.exec(await readFile(join(root,'drizzle/0000_thin_demogoblin.sql'),'utf8'));
const db={prepare(sql){let args=[];const wrapper={bind(...values){for(const v of values)if(typeof v==='string'&&Buffer.byteLength(v)>2_000_000)throw Error('D1 row bound exceeded');args=values;return wrapper},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(result.changes)}}}};return wrapper},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results}};
const vapid=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const b64url=bytes=>Buffer.from(bytes).toString('base64url');
const vapidPrivate=b64url(Buffer.from(vapid.privateKey.export({format:'jwk'}).d,'base64url'));
const vapidJwk=vapid.publicKey.export({format:'jwk'});
const vapidPublic=b64url(Buffer.concat([Buffer.from([4]),Buffer.from(vapidJwk.x,'base64url'),Buffer.from(vapidJwk.y,'base64url')]));
globalThis.__aflivraTestEnv={DB:db,VAPID_PRIVATE:vapidPrivate,VAPID_PUBLIC:vapidPublic};
globalThis.__aflivraResourceCopies=JSON.parse(await readFile(join(root,'lib/live/resource-seed.json'),'utf8'));
try{
const httpRetry=pathToFileURL(join(root,'lib/http-retry.mjs')).href;
for(const name of ['court-history','court-query','location-context','geographic-scope','tabular-geography']){let source=await readFile(join(root,'lib',name+'.ts'),'utf8');for(const [binding,path] of [['countyLookup','public/data/locality-counties.json'],['urbanLocalities','public/data/geographic-localities.json']])source=source.replace('import '+binding+" from '@/"+path+"';",'const '+binding+'='+await readFile(join(root,path),'utf8')+';');source=source.replace("from './live/query'","from './query'").replace("import institutions from '@/public/courts/institutions.json';",'const institutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");await writeFile(join(temp,name+'.mjs'),js)}
const groups=JSON.parse(await readFile(join(root,'lib/live/refresh-groups.json'),'utf8'));
for(const name of ['records','text','media','query','source-xml','source-html','catalog-categories','adapters','feeds','request-context','resource-copy','cache','weather-gate','forecast','weather','legal-consolidation','legal-portal','legal-registry','court-references','legal-selection','legal','knowledge','events','web-push','watch-sweep']){let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
 if(name==='watch-sweep')source=source.replace(/import\s+\w+\s+from\s+'\.\/refresh-groups\.json';/,'const sweepGroupsMap='+JSON.stringify(groups)+';');
 source=source.replace("from '../court-history'","from './court-history'").replace("from '../court-query'","from './court-query'").replace("from '../geographic-scope'","from './geographic-scope'").replace("from '../tabular-geography'","from './tabular-geography'").replace("from '../location-context'","from './location-context'").replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;').replace("import baseSeeds from './seed.json';",'const baseSeeds={};').replace("import {serverSeeds,catalogSeed} from './seed-snapshots';",'const serverSeeds={};const catalogSeed=[];').replace("import resourceCopies from './resource-seed.json';",'const resourceCopies=globalThis.__aflivraResourceCopies;').replace("import courtInstitutions from '@/public/courts/institutions.json';",'const courtInstitutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';').replace("import venuesCatalog from '@/public/events/venues.json';",'const venuesCatalog='+await readFile(join(root,'public/events/venues.json'),'utf8')+';').replace("import confirmed from '@/public/courts/confirmed-references.json';",'const confirmed='+await readFile(join(root,'public/courts/confirmed-references.json'),'utf8')+';').replace("import codes from '@/public/legal-snapshots/manifest.json';",'const codes='+await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8')+';');
 let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
 await writeFile(join(temp,name+'.mjs'),output)}
const routes={};
for(const name of ['watch','watch-events','watch-events/ack','watch/subscribe','watch/mute','watch/purge']){
 let route=await readFile(join(root,'app/api',name,'route.ts'),'utf8');
 route=route.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;').replaceAll('@/lib/live/','./');
 let output=ts.transpileModule(route,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+(p==='./watch-sweep'||p==='./web-push'||p==='./adapters'||p==='./cache'||p==='./feeds'||p==='./legal'||p==='./weather'||p==='./events'?p:p)+".mjs'").replaceAll("from './watch-events.mjs'","from './watch-sweep.mjs'").replaceAll("from './watch.mjs'","from './watch-sweep.mjs'").replaceAll("from './watch-events/ack.mjs'","from './watch-sweep.mjs'");
 await writeFile(join(temp,'route-'+name.replaceAll('/','-')+'.mjs'),output);
 routes[name]=await import(pathToFileURL(join(temp,'route-'+name.replaceAll('/','-')+'.mjs')))}
const assertStore=async()=>assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM source_cache').first()).n,0,'rutele de urmărire nu ating starea surselor');
const request=(method,path,body,headers={})=>new Request('https://verify.test'+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
const noStore=async response=>{assert.equal(response.headers.get('cache-control'),'no-store','fiecare răspuns rămâne nesalvat în cache');return response.json()};
const install='9c1d1aa8-2f4d-4c72-8e72-1e28a8ab3f61',other='1a0ff39b-e6f3-4c0f-974a-e2befa528670';

console.log('Leg 1 — GET /api/watch fără date noi: 200 și cheia publică push:');
{
 const response=await routes['watch'].GET(request('GET','/api/watch?installId='+install));
 assert.equal(response.status,200);
 const payload=await noStore(response);
 assert.deepEqual(payload.watches,[]);
 assert.deepEqual(payload.kinds,['dosar','firma','localitate','act','venue','meteo']);
 assert.equal(payload.sweepState.runsPerDay,3);assert.equal(payload.sweepState.timesUtc,'04:28, 10:28, 16:28');
 assert.equal(payload.sweepState.lastRunAt,null);assert.equal(payload.sweepState.lastOk,null);assert.match(payload.sweepState.note,/3 ori pe zi/);
 assert.equal(payload.notification.vapidPublicKey,vapidPublic,'cheia publică VAPID se expune exact cum o cere pushManager.subscribe');
 await assertStore();
}
console.log('  acord: listă goală, felurile declarate, „verificăm de 3 ori pe zi” derivată din cron, cheia VAPID publică prezentă.');

console.log('Leg 2 — validarea la graniță (instalație, feluri, referințe, limite):');
{
 for(const [label,body] of [['instalație invalidă',{installId:'nu-sunt-uuid',kind:'firma',ref:'427282'}],['fel necunoscut',{installId:install,kind:'eveniment',ref:'x'}],['referință lipsă',{installId:install,kind:'firma',ref:''}],['dosar invalid',{installId:install,kind:'dosar',ref:'12/3'}],['CUI cu zero în față',{installId:install,kind:'firma',ref:'0427282'}],['localitate neînregistrată',{installId:install,kind:'localitate',ref:'Nămolul de Mijloc'}],['act străin',{installId:install,kind:'act',ref:'https://www.edu.ro/act'}],['venue neînregistrat',{installId:install,kind:'venue',ref:'teatrul-muncii'}],['județ necunoscut',{installId:install,kind:'meteo',ref:'Atlantis'}]]){
  const response=await routes['watch'].POST(request('POST','/api/watch',body));
  assert.equal(response.status,400,label+' se respinge cu 400');
  const payload=await noStore(response);assert.equal(typeof payload.error,'string','eroarea poartă un mesaj în română');
 }
 const malformed=await routes['watch'].POST(new Request('https://verify.test/api/watch',{method:'POST',body:'nu-sunt-json'}));
 assert.equal(malformed.status,400,'json invalid respins');
 const huge=await routes['watch'].POST(request('POST','/api/watch',{installId:install,kind:'firma',ref:'427282',label:'x'.repeat(201)}));
 assert.equal(huge.status,400,'eticheta peste 200 de caractere se respinge');
 const longRef=await routes['watch'].POST(request('POST','/api/watch',{installId:install,kind:'dosar',ref:'1'+'2'.repeat(300)}));
 assert.equal(longRef.status,400,'referința peste limită se respinge la graniță');
 const qMalformed=await routes['watch'].DELETE(request('DELETE','/api/watch?installId=gresit&kind=firma&ref=427282'));
 assert.equal(qMalformed.status,400,'ștergerea validează aceleași granițe');
 await assertStore();
}
console.log('  acord: fiecare fel de referință se validează la graniță; cererile deformate nu ating starea persistentă.');

console.log('Leg 3 — adăugarea idempotentă și plafonul de 100 de urmăriri:');
{
 const first=await noStore(await routes['watch'].POST(request('POST','/api/watch',{installId:install,kind:'firma',ref:'427282',label:'Firma de verificare'})));
 assert.equal(first.watch.kind,'firma');assert.equal(first.watch.ref,'427282');assert.equal(first.watch.label,'Firma de verificare');assert.equal(first.watch.muted,false);assert.ok(first.watch.createdAt);assert.ok(/^[0-9a-f-]{36}$/.test(first.watch.id));
 const again=await noStore(await routes['watch'].POST(request('POST','/api/watch',{installId:install,kind:'firma',ref:'427282'})));
 assert.equal(again.watch.id,first.watch.id,'re-abonarea rămâne idempotentă');
 assert.equal(again.watch.label,'Firma de verificare','prima etichetă se păstrează');
 for(let at=0;at<99;at++){const response=await routes['watch'].POST(request('POST','/api/watch',{installId:install,kind:'dosar',ref:(at+1)+'/33/2026'}));assert.equal(response.status,200)}
 const over=await routes['watch'].POST(request('POST','/api/watch',{installId:install,kind:'dosar',ref:'9999/33/2026'}));
 assert.equal(over.status,400);assert.match((await over.json()).error,/100 de urmăriri/);
 const otherOk=await routes['watch'].POST(request('POST','/api/watch',{installId:other,kind:'dosar',ref:'9999/33/2026'}));
 assert.equal(otherOk.status,200,'plafonul e per instalație, nu global');
}
console.log('  acord: 100 de urmăriri per instalație, idempotența pe (instalație, fel, referință), plafonul nu trece in alte instalații.');

console.log('Leg 4 — listarea cu contorizare și izolarea între instalații:');
{
 sqlite.prepare('INSERT INTO watch_events (id,install_id,kind,ref,title,body,url,created_at,seen,sig) VALUES (?,?,?,?,?,?,?,?,?,?)').run('id-seen',install,'firma','427282','Titlu','Corp','/#view=watch&event=id-seen',new Date().toISOString(),0,'sig-a');
 const seenEvent=await routes['watch-events'].GET(request('GET','/api/watch-events?installId='+install));
 assert.equal(seenEvent.status,200);
 const feed=await noStore(seenEvent);
 assert.equal(feed.events.length,1);assert.equal(feed.events[0].id,'id-seen');assert.equal(feed.events[0].seen,false);
 assert.equal(feed.hasMore,false);
 const foreign=await noStore(await routes['watch-events'].GET(request('GET','/api/watch-events?installId='+other)));
 assert.deepEqual(foreign.events,[],'evenimentele altor instalații nu se văd');
 const list=await noStore(await routes['watch'].GET(request('GET','/api/watch?installId='+install)));
 const byKind=Object.fromEntries(list.watches.map(watch=>[watch.kind+':'+watch.ref,watch]));
 assert.equal(list.watches.length,100);
 assert.equal(byKind['firma:427282'].unseenCount,1);assert.ok(byKind['firma:427282'].lastEventAt);
 assert.equal(byKind['dosar:1/33/2026'].unseenCount,0);assert.equal(byKind['dosar:1/33/2026'].lastEventAt,null);
 sqlite.prepare('INSERT INTO watch_events (id,install_id,kind,ref,title,body,url,created_at,seen,sig) VALUES (?,?,?,?,?,?,?,?,?,?)').run('id-2',install,'dosar','5/33/2026','Titlu doi','Corp','/#view=watch&event=id-2',new Date().toISOString(),1,'sig-b');
 const list2=await noStore(await routes['watch'].GET(request('GET','/api/watch?installId='+install)));
 const byRef=Object.fromEntries(list2.watches.map(watch=>[watch.ref,watch]));
 assert.equal(byRef['5/33/2026'].unseenCount,0,'evenimentul văzut nu se mai numără');
 assert.ok(byRef['5/33/2026'].lastEventAt,'ultima activitate se arată chiar văzută');
}
console.log('  acord: necitite și ultima activitate per urmărire, în interiorul unei singuri instalații.');

console.log('Leg 5 — fluxul de evenimente: maximum 50, ordinea descrescătoare, since-ul pe rând:');
{
 sqlite.prepare('DELETE FROM watch_events').run();
 for(let at=0;at<60;at++)sqlite.prepare('INSERT INTO watch_events (id,install_id,kind,ref,title,body,url,created_at,seen,sig) VALUES (?,?,?,?,?,?,?,?,?,?)').run('evt-'+String(at).padStart(2,'0'),install,'dosar',(at+1)+'/33/2026','Titlu '+at,'Corp','/#view=watch&event=evt-'+at,new Date(Date.now()+at*1000).toISOString(),0,'sig-'+at);
 const firstPage=await noStore(await routes['watch-events'].GET(request('GET','/api/watch-events?installId='+install)));
 assert.equal(firstPage.events.length,50,'maximum 50 de evenimente');
 assert.equal(firstPage.hasMore,true);
 assert.equal(firstPage.events[0].id,'evt-59','cel mai nou primul');
 const since=await noStore(await routes['watch-events'].GET(request('GET','/api/watch-events?installId='+install+'&since=evt-40')));
 assert.equal(since.events.length,19,'since întoarce strict mai noi decât rândul dat');
 assert.equal(since.events[0].id,'evt-59');assert.equal(since.events.at(-1).id,'evt-41');
 assert.equal(since.events.some(event=>event.id==='evt-40'),false,'rândul de referință nu se repetă');
 const unknownSince=await noStore(await routes['watch-events'].GET(request('GET','/api/watch-events?installId='+install+'&since=nu-exista-asa')));
 assert.equal(unknownSince.events.length,50,'un since necunoscut cade onest pe prima pagină');
 const badInstall=await routes['watch-events'].GET(request('GET','/api/watch-events?installId=gresit'));
 assert.equal(badInstall.status,400);
}
console.log('  acord: pagina de 50, ordine nou-întâi, since pe poziția rândului; instalația se validează pe fiecare rută.');

console.log('Leg 6 — confirmarea maxim 200 de evenimente, pe caractere validate:');
{
 const bad=await routes['watch-events/ack'].POST(request('POST','/api/watch-events/ack',{installId:install,ids:['evt-01;drop']}));
 assert.equal(bad.status,400,'caracterele id-urilor se validează la graniță');
 const tooMany=await routes['watch-events/ack'].POST(request('POST','/api/watch-events/ack',{installId:install,ids:Array.from({length:201},(_,at)=>'evt-'+at)}));
 assert.equal(tooMany.status,400,'maxim 200 de id-uri pe confirmare');
 const ok=await noStore(await routes['watch-events/ack'].POST(request('POST','/api/watch-events/ack',{installId:install,ids:['evt-59','evt-58','evt-al-instalatiei-straine']})));
 assert.equal(ok.acked,2,'doar evenimentele instalației se confirmă');
 const stillUnseen=(await db.prepare('SELECT COUNT(*) AS n FROM watch_events WHERE install_id=? AND seen=0').bind(install).first()).n;
 assert.equal(stillUnseen,58,'restul rămân necitite');
}
console.log('  acord: confirmarea e mărginită, validată pe caractere și mărginită la instalația care cere.');

console.log('Leg 7 — abonamentul push: validare, cheie publică, plafon de 5, fail-closed fără VAPID:');
{
 const subscription={endpoint:'https://push.example/sub-de-verificare',keys:{p256dh:b64url(Buffer.concat([Buffer.from([4]),Buffer.from(vapidJwk.x,'base64url'),Buffer.from(vapidJwk.y,'base64url')])),auth:b64url(Buffer.from('auth-secret-de-verificare'))}};
 const badEndpoint=await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:install,subscription:{...subscription,endpoint:'http://push.example/insec'}}));
 assert.equal(badEndpoint.status,400,'doar https se acceptă');
 const badKeys=await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:install,subscription:{endpoint:subscription.endpoint,keys:{p256dh:'!!',auth:subscription.keys.auth}}}));
 assert.equal(badKeys.status,400,'cheile trebuie codate base64url');
 const ok=await noStore(await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:install,subscription})));
 assert.deepEqual(ok,{subscribed:true});
 const resub=await noStore(await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:install,subscription})));
 assert.deepEqual(resub,{subscribed:true},'re-abonarea pe același endpoint este idempotentă');
 const rows=(await db.prepare('SELECT install_id,endpoint FROM push_subs').all()).results;
 assert.equal(rows.length,1);
 for(let at=0;at<4;at++){const response=await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:install,subscription:{...subscription,endpoint:'https://push.example/sub-'+at,keys:subscription.keys}}));assert.equal(response.status,200)}
 const over=await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:install,subscription:{...subscription,endpoint:'https://push.example/sub-999',keys:subscription.keys}}));
 assert.equal(over.status,400);assert.match((await over.json()).error,/5 abonamente/);
 const savedVapidPublic=globalThis.__aflivraTestEnv.VAPID_PUBLIC,savedVapidPrivate=globalThis.__aflivraTestEnv.VAPID_PRIVATE;
 delete globalThis.__aflivraTestEnv.VAPID_PUBLIC;delete globalThis.__aflivraTestEnv.VAPID_PRIVATE;
 const noVapidList=await noStore(await routes['watch'].GET(request('GET','/api/watch?installId='+install)));
 assert.equal(noVapidList.notification.vapidPublicKey,null,'fără VAPID configurat, lista spune onest că notificările nu sunt disponibile');
 const noVapidSub=await noStore(await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:other,subscription:{...subscription,endpoint:'https://push.example/sub-fara-vapid',keys:subscription.keys}})));
 assert.match(noVapidSub.error,/nu sunt configurate/,'fără VAPID, abonarea se respinge cu mesaj onest, nu se scrie');
 globalThis.__aflivraTestEnv.VAPID_PUBLIC=savedVapidPublic;globalThis.__aflivraTestEnv.VAPID_PRIVATE=savedVapidPrivate;
}
console.log('  acord: abonamentul se validează, se limitează la 5, iar lipsa VAPID se raportează onest fără stare scrisă.');

console.log('Leg 8 — „Șterge-mi datele” curăță tot și numai instalația:');
{
 const before=(await db.prepare('SELECT COUNT(*) AS n FROM watch_items').first()).n;
 const purged=await noStore(await routes['watch/purge'].POST(request('POST','/api/watch/purge',{installId:install})));
 assert.equal(purged.purged.watches,100);assert.ok(purged.purged.events>=58);assert.equal(purged.purged.subscriptions,5);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM watch_items WHERE install_id=?').bind(install).first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM watch_events WHERE install_id=?').bind(install).first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?').bind(install).first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM watch_items').first()).n,before-purged.purged.watches,'alte instalații rămân neatinse');
 const empty=await noStore(await routes['watch/purge'].POST(request('POST','/api/watch/purge',{installId:'5bad8a1e-9999-4ccc-8c99-deadbeef0001'})));
 assert.deepEqual(empty,{purged:{watches:0,events:0,subscriptions:0}});
 const badPurge=await routes['watch/purge'].POST(request('POST','/api/watch/purge',{installId:'gresit'}));
 assert.equal(badPurge.status,400);
}
console.log('  acord: ștergerea e completă, per instalație și cu zero contabile oneste când nu e nimic.');

console.log('Leg 9 — mutarea unei urmăriri se face pe rândul ei, fără efecte vecine:');
{
 const addedNow=await noStore(await routes['watch'].POST(request('POST','/api/watch',{installId:install,kind:'venue',ref:'odeon'})));
 sqlite.prepare('UPDATE watch_items SET muted=1 WHERE id=?').run(addedNow.watch.id);
 const list=await noStore(await routes['watch'].GET(request('GET','/api/watch?installId='+install)));
 const muted=list.watches.find(watch=>watch.id===addedNow.watch.id);
 assert.equal(muted.muted,true,'răspunsul poartă starea de mutare');
 const dupe=(await db.prepare('SELECT COUNT(*) AS n FROM watch_items WHERE install_id=?').bind(install).first()).n;
 assert.equal(dupe,1);
}
console.log('  acord: mutarea rămâne o proprietate a rândului, vizibilă în listă.');

console.log('Leg 10 — addendum: comutarea notificărilor pe rândul urmărit, la graniță validată:');
{
  // Leg 9 a lăsat urmărirea venue a instalației cu muted=1, pus direct pe rând.
  const before=await noStore(await routes['watch'].GET(request('GET','/api/watch?installId='+install)));
  const target=before.watches.find(watch=>watch.kind==='venue'&&watch.ref==='odeon');
  assert.equal(target.muted,true,'starea de plecare: mutarea pusă direct pe rând');
  for(const [label,body] of [['instalație invalidă',{installId:'gresit',kind:'venue',ref:'odeon',muted:true}],['fel necunoscut',{installId:install,kind:'nu-exista',ref:'odeon',muted:true}],['venue neînregistrat',{installId:install,kind:'venue',ref:'teatrul-muncii',muted:true}],['referință depășită',{installId:install,kind:'firma',ref:'1'+'2'.repeat(300),muted:true}],['muted fără boolean',{installId:install,kind:'venue',ref:'odeon',muted:'da'}],['muted lipsă',{installId:install,kind:'venue',ref:'odeon'}]]){
    const response=await routes['watch/mute'].POST(request('POST','/api/watch/mute',body));
    assert.equal(response.status,400,label+' se respinge la graniță');
    const payload=await noStore(response);
    assert.equal(typeof payload.error,'string','eroarea poartă un mesaj');
  }
  const malformed=await routes['watch/mute'].POST(new Request('https://verify.test/api/watch/mute',{method:'POST',body:'nu-sunt-json'}));
  assert.equal(malformed.status,400,'json invalid respins');
  // Comutarea trece prin rută și se vede pe rândul ei, nu pe altul.
  const resumed=await noStore(await routes['watch/mute'].POST(request('POST','/api/watch/mute',{installId:install,kind:'venue',ref:'odeon',muted:false})));
  assert.deepEqual(resumed,{muted:false});
  assert.equal((await db.prepare('SELECT muted FROM watch_items WHERE install_id=? AND kind=? AND ref=?').bind(install,'venue','odeon').first()).muted,0,'rândul poartă starea reactivată');
  const mutedAgain=await noStore(await routes['watch/mute'].POST(request('POST','/api/watch/mute',{installId:install,kind:'venue',ref:'odeon',muted:true})));
  assert.deepEqual(mutedAgain,{muted:true});
  assert.equal((await db.prepare('SELECT muted FROM watch_items WHERE install_id=? AND kind=? AND ref=?').bind(install,'venue','odeon').first()).muted,1,'rândul poartă starea de mutare');
  const listed=await noStore(await routes['watch'].GET(request('GET','/api/watch?installId='+install)));
  assert.equal(listed.watches.find(watch=>watch.kind==='venue'&&watch.ref==='odeon').muted,true,'lista reflectă comutarea');
  const unknown=await routes['watch/mute'].POST(request('POST','/api/watch/mute',{installId:install,kind:'firma',ref:'427282',muted:true}));
  assert.equal(unknown.status,400,'o urmărire care nu există se respinge onest');
  assert.match((await unknown.json()).error,/nu există/);
  const foreign=await routes['watch/mute'].POST(request('POST','/api/watch/mute',{installId:install,kind:'dosar',ref:'9999/33/2026',muted:true}));
  assert.equal(foreign.status,400,'rândul altei instalații nu poate fi mutat de aici');
  assert.equal((await db.prepare('SELECT muted FROM watch_items WHERE install_id=? AND kind=? AND ref=?').bind(other,'dosar','9999/33/2026').first()).muted,0,'rândul celeilalte instalații rămâne neatins');
  await assertStore();
}
console.log('  acord: comutarea cere forma exactă, atinge rândul instalației care cere și se vede în listă.');

console.log('Leg 11 — addendum: dez-abonarea push server-side, pe endpoint și instalație:');
{
  const sub={endpoint:'https://push.example/sub-dezabonare',keys:{p256dh:'B'+'a'.repeat(86),auth:'bK'.repeat(11)}};
  const otherSub={endpoint:'https://push.example/sub-alta-instalatie',keys:{p256dh:'B'+'c'.repeat(86),auth:'cM'.repeat(11)}};
  await noStore(await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:install,subscription:sub})));
  await noStore(await routes['watch/subscribe'].POST(request('POST','/api/watch/subscribe',{installId:other,subscription:otherSub})));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM push_subs').first()).n,2,'două abonamente pe tabel');
  // boundary: fiecare parametru se validează la graniță
  for(const [label,query] of [['instalație invalidă','installId=gresit&endpoint='+encodeURIComponent(sub.endpoint)],['endpoint non-https','installId='+install+'&endpoint='+encodeURIComponent('http://push.example/insec')],['endpoint lipsă','installId='+install],['endpoint peste limită','installId='+install+'&endpoint='+encodeURIComponent('https://push.example/'+'x'.repeat(2001))]]){
    const response=await routes['watch/subscribe'].DELETE(request('DELETE','/api/watch/subscribe?'+query));
    assert.equal(response.status,400,label+' se respinge la graniță');
    const payload=await noStore(response);
    assert.equal(typeof payload.error,'string','eroarea poartă un mesaj');
  }
  // Oprirea pe acest dispozitiv taie rândul acestui endpoint, nu și pe celelalte.
  const removed=await noStore(await routes['watch/subscribe'].DELETE(request('DELETE','/api/watch/subscribe?installId='+install+'&endpoint='+encodeURIComponent(sub.endpoint))));
  assert.deepEqual(removed,{removed:true});
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?').bind(install).first()).n,0,'abonamentul instalației a fost scos');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?').bind(other).first()).n,1,'rândul celeilalte instalații rămâne');
  const again=await noStore(await routes['watch/subscribe'].DELETE(request('DELETE','/api/watch/subscribe?installId='+install+'&endpoint='+encodeURIComponent(sub.endpoint))));
  assert.deepEqual(again,{removed:false},'a doua oprire e un zero onest, nu o eroare');
  const foreign=await noStore(await routes['watch/subscribe'].DELETE(request('DELETE','/api/watch/subscribe?installId='+install+'&endpoint='+encodeURIComponent(otherSub.endpoint))));
  assert.deepEqual(foreign,{removed:false},'endpointul celeilalte instalații nu poate fi scos de aici');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?').bind(other).first()).n,1,'rândul celeilalte instalații supraviețuiește încercării străine');
  await assertStore();
}
console.log('  acord: dez-abonarea e per endpoint, per instalație, cu zero onest când nu mai e nimic de scos.');

console.log('Rutele „Urmărește”: contract verificat — validare la graniță, plafoane per instalație, izolare și curățare completă.');
}catch(error){console.error((error&&error.stack)||error);process.exitCode=1}finally{delete globalThis.__aflivraTestEnv;delete globalThis.__aflivraResourceCopies;await rm(temp,{recursive:true,force:true})}
