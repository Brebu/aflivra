import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Relay runner gate: scripts/relay-afir.mjs is the GitHub Actions side of the AFIR relay
// (afir.ro blocks Workers egress, runners can fetch it). Freeze its two-phase contract against
// a loopback double of the source and the /api/seed/afir route (route side is gated separately
// by verify-afir-relay.mjs): the POST shapes, want-driven fetches, no empty items POST, the
// exit classes 0/1/2, and the workflow + registry classification — loopback only, zero real
// addresses.
const root=resolve(import.meta.dirname,'..');
const relay=await import(pathToFileURL(join(root,'scripts','relay-afir.mjs')));

assert.equal(relay.AFIR_FEED_URL_DEFAULT,'https://www.afir.ro/','the default feed URL is the app loader URL');
assert.equal(relay.MAX_ARTICLES_PER_RUN,10,'the relay carries at most 10 articles per tour');
assert.equal(relay.SEED_ROUTE,'/api/seed/afir','the seed route path is frozen');
assert.equal(relay.RELAY_UA,'Aflivra/1.0 gh-relay','the relay identifies itself on every request');
const feedsSource=await readFile(join(root,'lib/live','feeds.ts'),'utf8');
const afirLoaderUrl=feedsSource.match(/export const afirLoader[^\n]*?url:'([^']+)'/)?.[1];
assert.equal(afirLoaderUrl,relay.AFIR_FEED_URL_DEFAULT,'the relay fetches exactly the URL the app afirLoader reads — same URL, same data');
const workflow=await readFile(join(root,'.github/workflows','afir-refresh.yml'),'utf8');
assert.ok(workflow.includes('cron: "30 */2 * * *"'),'the relay tour runs every two hours (repo public — Actions minutes unlimited; the press-releases feed publishes intraday, so the near-real-time sweep covers the whole day, weekends honestly no-op)');
assert.ok(workflow.includes('workflow_dispatch'),'the relay tour can be triggered manually');
assert.ok(workflow.includes('node scripts/relay-afir.mjs'),'the tour runs the relay script');
assert.ok(workflow.includes('AFLIVRA_REFRESH_TOKEN: ${{ secrets.AFLIVRA_REFRESH_TOKEN }}'),'the token comes from the GitHub secret');
assert.ok(!/continue-on-error/i.test(workflow),'the tour never downgrades failures silently');
assert.ok(!/git (push|commit)/.test(workflow),'the tour writes no git state — the D1 store is the store');
const groups=JSON.parse(await readFile(join(root,'lib/live','refresh-groups.json'),'utf8'));
const members=groups.groups.flatMap(group=>group.members);
assert.deepEqual(groups.ghRelayed.map(entry=>entry.family),['feed.agricultura','transport.flights','flights.bia'],'AFIR, the Romanian airspace flight states and the BIA airport board are classified ghRelayed — each sits behind its own relay tour with its own runner');
assert.ok(!members.includes('feed.agricultura'),'the relayed family left the cron sweep: the relay is the single writer of its freshness');
assert.equal(groups.groups.find(group=>group.name==='registers').estimatedSubrequests,31,'the registers estimate covers its five members, including the TEMPO matrix (surse noi)');
const routeHarness=await readFile(join(root,'scripts','verify-afir-relay.mjs'),'utf8');
assert.ok(routeHarness.includes('stored')&&routeHarness.includes('failed'),'the route-side harness pins the stored/failed reply contract this runner consumes');

const seedEntry=JSON.parse(await readFile(join(root,'lib/live','server-seed.json'),'utf8'))['feed:agricultura'];
const seedItems=seedEntry.data.items;
assert.ok(seedItems.length>1,'the verified seed copy holds the real AFIR rows');
const months=['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];
const romanianDate=value=>{const [y,m,d]=String(value||'2026-10-01').split('-');return d+' '+months[Number(m)-1]+' '+y};
const articlePaths=seedItems.map(item=>new URL(item.url).pathname);
const feedFixture='<html><body>'+seedItems.map(item=>'<div class="card-body news-content"><h4><a href="'+new URL(item.url).pathname+'">'+item.title+'</a></h4><p class="item-date">'+romanianDate(item.publishedAt)+'</p></div><div class="news-border"></div>').join('')+'</body></html>';
const articleFixtures=new Map(seedItems.map(item=>[new URL(item.url).pathname,'<!doctype html><html><head><meta property="article:published_time" content="'+(item.publishedAt||'2026-10-01')+'T10:30:00+03:00"></head><body><h1>'+item.title+'</h1><div class="entry-content"><p>Primul paragraf integral al comunicatului de verificare.</p></div></body></html>']));

const startDouble=async behavior=>{
 const log={sourceGets:[],workerPosts:[]};
 const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');
  if(url.pathname===relay.SEED_ROUTE){
   let raw='';request.setEncoding('utf8');request.on('data',chunk=>raw+=chunk);
   request.on('end',()=>{
    const body=JSON.parse(raw);
    log.workerPosts.push({method:request.method,authorization:request.headers.authorization||null,userAgent:request.headers['user-agent']||null,body});
    if(behavior.workerStatus){response.writeHead(behavior.workerStatus,{'Content-Type':'application/json'});response.end(JSON.stringify({error:behavior.workerError||'Acces interzis.'}));return}
    if(body.phase==='feed'){
     const want=(behavior.want||[]).map(entry=>entry.startsWith('/')?origin+entry:entry);
     response.setHeader('Content-Type','application/json');
     response.end(JSON.stringify({result:'ok',phase:'feed',items:seedItems.length,want,feedStored:true,servedAt:new Date().toISOString()}))}
    else{
     const resolveUrl=entry=>typeof entry==='string'&&entry.startsWith('/')?origin+entry:entry;
     const reply=behavior.articlesReply||{stored:body.items.map(item=>item.url),failed:[]};
     response.setHeader('Content-Type','application/json');
     response.end(JSON.stringify({result:reply.failed.length?'partial':'ok',phase:'articles',stored:reply.stored.map(resolveUrl),failed:reply.failed.map(failure=>({...failure,url:resolveUrl(failure.url)}))}))}});
   return}
  log.sourceGets.push({pathname:url.pathname,userAgent:request.headers['user-agent']||null,accept:request.headers.accept||null,authorization:request.headers.authorization||undefined});
  if(url.pathname==='/'&&behavior.hangFeed)return;
  if(url.pathname==='/'){if(behavior.feedStatus===500){response.writeHead(500);response.end();return}response.setHeader('Content-Type','text/html');response.end(feedFixture);return}
  if(url.pathname.startsWith('/comunicate/')){if(behavior.articleStatus===500){response.writeHead(500);response.end();return}response.setHeader('Content-Type','text/html');response.end(articleFixtures.get(url.pathname)||'<html><body>comunicat</body></html>');return}
  response.writeHead(404);response.end()});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 return {origin,log,close:async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve))}}};

const runRelay=overrides=>{const env={...process.env};delete env.AFLIVRA_AFIR_SOURCE_URL;delete env.AFLIVRA_SEED_BASE;delete env.AFLIVRA_REFRESH_TOKEN;Object.assign(env,overrides);
 return new Promise(resolve=>{const child=spawn(process.execPath,[join(root,'scripts','relay-afir.mjs')],{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);const timer=setTimeout(()=>child.kill('SIGKILL'),60_000);child.on('close',(code,signal)=>{clearTimeout(timer);resolve({status:signal!==null?null:code,stdout,stderr})})})};
const leg=async(name,run)=>{try{await run();console.log('  [picior] '+name+' ✓')}catch(error){throw Object.assign(error,{message:'['+name+'] '+error.message})}};
const relayEnv=(d,token='token-de-verificare')=>({AFLIVRA_AFIR_SOURCE_URL:d.origin+'/',AFLIVRA_SEED_BASE:d.origin,...(token?{AFLIVRA_REFRESH_TOKEN:token}:{})});

await leg(' protocol complet: flux brut predat byte cu byte, want conduce accesările, token doar la rută',async()=>{
 const d=await startDouble({want:[articlePaths[0],articlePaths[1]]});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,0,'exit 0 — the source is reachable and the relay completes');
  assert.ok(run.stdout.includes('[final]'),'the honest final line is printed');
  assert.equal(d.log.workerPosts.length,2,'exactly two POSTs — the two-phase protocol');
  const [feedPost,articlesPost]=d.log.workerPosts;
  assert.equal(feedPost.method,'POST');assert.equal(feedPost.userAgent,relay.RELAY_UA);
  assert.equal(feedPost.authorization,'Bearer token-de-verificare','the seed POST authenticates');
  assert.deepEqual(feedPost.body,{phase:'feed',body:feedFixture},'phase feed carries the raw feed page, byte for byte');
  assert.equal(articlesPost.authorization,'Bearer token-de-verificare');
  assert.equal(articlesPost.body.phase,'articles');
  assert.deepEqual(articlesPost.body.items.map(item=>item.url),[d.origin+articlePaths[0],d.origin+articlePaths[1]],'items carry exactly the wanted URLs');
  assert.equal(articlesPost.body.items[0].html,articleFixtures.get(articlePaths[0]),'the article HTML is relayed raw, byte for byte');
  assert.equal(d.log.sourceGets.length,3,'want drives fetching: one feed GET plus exactly the wanted articles');
  assert.deepEqual(d.log.sourceGets.map(get=>get.pathname),['/',articlePaths[0],articlePaths[1]]);
  assert.ok(d.log.sourceGets.every(get=>get.userAgent===relay.RELAY_UA&&get.accept===relay.SOURCE_ACCEPT),'source requests mirror the app loader request shape');
  assert.ok(d.log.sourceGets.every(get=>get.authorization===undefined),'the worker token never reaches the source');
 }finally{await d.close()}});

await leg('want gol: ciclul este complet, fără a doua fază, ieșire 0',async()=>{
 const d=await startDouble({want:[]});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,0,'exit 0 even with 0 articles');
  assert.equal(d.log.workerPosts.length,1,'no empty items POST — the cycle is complete at the feed phase');
  assert.ok(run.stdout.includes('ciclul de relaie este complet'),'the completion is stated');
  assert.equal(d.log.sourceGets.length,1,'no article is fetched when none is wanted');
 }finally{await d.close()}});

await leg('limita de 10 articole per tură: primii 10 ceruți, restul la următoarea tură',async()=>{
 const eleven=[articlePaths[0],...Array.from({length:10},(_,i)=>'/comunicate/verificare-relaie-'+i+'/')];
 const d=await startDouble({want:eleven});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,0,'exit 0 with the capped delivery');
  const items=d.log.workerPosts[1].body.items;
  assert.equal(items.length,10,'the POST carries at most 10 items');
  assert.deepEqual(items.map(item=>item.url),eleven.slice(0,10).map(path=>d.origin+path),'the first ten wanted, in order');
  assert.equal(d.log.sourceGets.length,11,'one feed GET plus ten article GETs');
  assert.ok(run.stdout.includes('[limită]'),'the cap is reported honestly');
 }finally{await d.close()}});

await leg('sursa pică cu HTTP 500: ieșire 2 informațional, ruta nu este contactată',async()=>{
 const d=await startDouble({feedStatus:500,want:[articlePaths[0]]});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — afir.ro itself errored, informational');
  assert.equal(d.log.workerPosts.length,0,'nothing is relayed when the source fails');
  assert.equal(d.log.sourceGets.length,1,'exactly one attempt at the source');
  assert.ok(run.stdout.includes('ieșire 2'),'the exit class is stated in the log');
 }finally{await d.close()}});

await leg('sursa atârnă: legătura se întrerupe la limita de timp, ieșire 2',async()=>{
 const d=await startDouble({hangFeed:true,want:[articlePaths[0]]});
 try{
  const started=Date.now();
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — the hung source aborts the fetch');
  assert.ok(Date.now()-started>=relay.FETCH_TIMEOUT_MS-2000,'the AbortController bound actually fired (not an instant error)');
  assert.equal(d.log.workerPosts.length,0,'a hung source relays nothing');
 }finally{await d.close()}});

await leg('ruta de depunere inaccesibilă: ieșire 1, eroare de infrastructură',async()=>{
 const d=await startDouble({want:[articlePaths[0]]});
 try{
  const run=await runRelay({...relayEnv(d),AFLIVRA_SEED_BASE:'http://127.0.0.1:1'});
  assert.equal(run.status,1,'exit 1 — our infrastructure, loud');
  assert.ok(run.stdout.includes('[predare flux]'),'the failing step is named');
  assert.equal(d.log.workerPosts.length,0,'the dead seed route receives no handoff');
 }finally{await d.close()}});

await leg('autentificare respinsă (HTTP 401): ieșire 1 fără livrare',async()=>{
 const d=await startDouble({workerStatus:401,want:[articlePaths[0]]});
 try{
  const run=await runRelay(relayEnv(d,'token-gresit-401'));
  assert.equal(run.status,1,'exit 1 — auth rejected');
  assert.equal(d.log.workerPosts.length,1,'the relay stops at the first rejected POST');
  assert.ok(run.stdout.includes('Autentificare respinsă'),'the auth failure is stated');
 }finally{await d.close()}});

await leg('ruta respinge conținutul sursei (HTTP 400): ieșire 2 cu mesajul rutei',async()=>{
 const d=await startDouble({workerStatus:400,workerError:'Structura comunicatelor AFIR s-a schimbat.',want:[articlePaths[0]]});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — the route rejected the source content, informational');
  assert.ok(run.stdout.includes('Structura comunicatelor AFIR s-a schimbat.'),'the route error message is surfaced');
  assert.equal(d.log.workerPosts.length,1,'the relay stops after the rejected feed');
 }finally{await d.close()}});

await leg('want din afara sursei: subsetul valid livrat, ieșire 1 pe cererea străină',async()=>{
 const d=await startDouble({want:[articlePaths[0],'https://alt-exemplu.test/comunicate/strain/','nu este adresă']});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,1,'exit 1 — the seed route asked for foreign addresses');
  assert.equal(d.log.workerPosts.length,2,'the valid subset still completes the protocol');
  assert.deepEqual(d.log.workerPosts[1].body.items.map(item=>item.url),[d.origin+articlePaths[0]],'only the same-origin article is carried');
  assert.equal(d.log.sourceGets.filter(get=>get.pathname!=='/').length,1,'only the valid address is fetched — no proxying');
  assert.ok(run.stdout.includes('[refuzat]'),'the refusal is reported');
 }finally{await d.close()}});

await leg('token lipsă: ieșire 1 înainte de orice contact cu sursa sau ruta',async()=>{
 const d=await startDouble({want:[articlePaths[0]]});
 try{
  const run=await runRelay(relayEnv(d,''));
  assert.equal(run.status,1,'exit 1 — missing token');
  assert.equal(d.log.sourceGets.length,0,'the source is not contacted without a token');
  assert.equal(d.log.workerPosts.length,0,'the seed route is not contacted without a token');
  assert.ok(run.stdout.includes('AFLIVRA_REFRESH_TOKEN'),'the missing variable is named');
 }finally{await d.close()}});

await leg('toate paginile cerute pică la sursă: fără listă goală la rută, ieșire 2',async()=>{
 const d=await startDouble({articleStatus:500,want:[articlePaths[0],articlePaths[1]]});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — the source errored on every wanted article');
  assert.equal(d.log.workerPosts.length,1,'no empty items POST is attempted');
  assert.equal(d.log.sourceGets.length,3,'feed plus both articles were attempted');
  assert.ok(run.stdout.includes('fără listă goală'),'the omission is stated honestly');
 }finally{await d.close()}});

await leg('respingeri per articol la rută: numărătorile oneste, ieșire 0 cu livrare parțială',async()=>{
 const d=await startDouble({want:[articlePaths[2],articlePaths[3]],articlesReply:{stored:[articlePaths[3]],failed:[{url:articlePaths[2],error:'Publicația nu a furnizat o pagină validă.'}]}});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,0,'exit 0 — the relay delivered what the source served');
  assert.equal(d.log.workerPosts[1].body.items.length,2,'both fetched pages are handed over');
  assert.ok(run.stdout.includes('stored=1')&&run.stdout.includes('failed=1'),'stored and failed counts are printed');
  assert.ok(run.stdout.includes('[eșuat]'),'the per-article failure is listed');
 }finally{await d.close()}});

await leg('ruta respinge toate paginile livrate: ieșire 2 informațional',async()=>{
 const d=await startDouble({want:[articlePaths[4],articlePaths[5]],articlesReply:{stored:[],failed:[articlePaths[4],articlePaths[5]].map(path=>({url:path,error:'Publicația nu a furnizat o pagină validă.'}))}});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — the source pages were rejected by the route');
  assert.equal(d.log.workerPosts.length,2,'the delivery was attempted');
  assert.ok(run.stdout.includes('ieșire 2'),'the exit class is stated');
 }finally{await d.close()}});

console.log('Runnerul de relație AFIR verificat pe dublă loopback: contractul celor două faze, want care conduce accesările, fără listă goală, paritatea URL cu încărcătorul aplicației, limita de 10 articole, respingerea adreselor străine, terminalul fără token și clasele de ieșire 0/1/2 — fără nicio adresă reală.');
console.log(JSON.stringify({result:'ok',legs:13,feedItems:seedItems.length,articlesCap:relay.MAX_ARTICLES_PER_RUN,feedUrl:relay.AFIR_FEED_URL_DEFAULT,route:relay.SEED_ROUTE}));
