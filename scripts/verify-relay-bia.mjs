import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Relay runner gate: scripts/relay-bia.mjs is the GitHub Actions side of the BIA relay
// (the airport protects its day board with a browser challenge that rejects every server
// we could probe from; whether a GitHub-hosted runner is challenged too is verified at the
// first real tour — registered honestly in README and STATUS, not assumed here). Freeze its
// single-phase contract against a loopback double of the airport boards and the /api/seed/bia
// route (route side is gated separately by the flights/bia cells of verify-source-errors.mjs):
// both boards fetched before any POST, the raw board text relayed byte for byte, the empty
// board posted honestly, the {result,arrivals,departures,dropped} confirmations, the
// per-airport partial discipline, the exit classes 0/1/2, and the workflow + registry
// classification — loopback only, zero real addresses.
const root=resolve(import.meta.dirname,'..');
const relay=await import(pathToFileURL(join(root,'scripts','relay-bia.mjs')));

assert.deepEqual(relay.BIA_AIRPORTS,['henri-coanda','baneasa-aurel-vlaicu'],'the relay fetches exactly the two airports of the biaAirports registry');
assert.equal(relay.SEED_ROUTE,'/api/seed/bia','the seed route path is frozen');
assert.equal(relay.RELAY_UA,'Aflivra/1.0 gh-relay','the relay identifies itself on every request');
assert.equal(relay.SOURCE_ACCEPT,'application/json','the relay asks the airport for the board format the app loader reads');
assert.equal(relay.MAX_BODY_BYTES,5_000_000,'the relay carries at most the seed route board cap');
const flightsSource=await readFile(join(root,'lib/live','flights.ts'),'utf8');
const biaAirportsLine=flightsSource.split('\n').find(text=>text.includes('export const biaAirports'));
const registeredIds=[...String(biaAirportsLine).matchAll(/id:'([a-z-]+)'/g)].map(match=>match[1]);
assert.deepEqual(registeredIds,relay.BIA_AIRPORTS,'the relay airport list mirrors the app biaAirports registry exactly');
const biaFlightsUrlBase=flightsSource.match(/export const biaFlightsUrl=\(airport:BiaAirport\)=>'([^']+?)\?'/)?.[1];
assert.equal(biaFlightsUrlBase,relay.BIA_SOURCE_BASE_DEFAULT+relay.BIA_FLIGHTS_PATH,'the relay fetches exactly the URL the app biaFlightsLoader reads — same URL, same data');
const seedRouteSource=await readFile(join(root,'app/api/seed/bia','route.ts'),'utf8');
const boardCap=seedRouteSource.match(/const BOARD_CAP=([\d_]+);/)?.[1];
assert.equal(Number(boardCap.replace(/_/g,'')),relay.MAX_BODY_BYTES,'the relay body cap matches the seed route board cap');
const workflow=await readFile(join(root,'.github/workflows','bia-refresh.yml'),'utf8');
assert.ok(workflow.includes('cron: "*/30 * * * *"'),'the relay tour runs every 30 minutes — a day board whose schedules, estimates and actuals move all day');
assert.ok(workflow.includes('workflow_dispatch'),'the relay tour can be triggered manually');
assert.ok(workflow.includes('node scripts/relay-bia.mjs'),'the tour runs the relay script');
assert.ok(workflow.includes('AFLIVRA_REFRESH_TOKEN: ${{ secrets.AFLIVRA_REFRESH_TOKEN }}'),'the token comes from the GitHub secret shared with the AFIR relay');
assert.ok(!/continue-on-error/i.test(workflow),'the tour never downgrades failures silently');
assert.ok(!/git (push|commit)/.test(workflow),'the tour writes no git state — the D1 store is the store');
const groups=JSON.parse(await readFile(join(root,'lib/live','refresh-groups.json'),'utf8'));
const members=groups.groups.flatMap(group=>group.members);
assert.deepEqual(groups.ghRelayed.map(entry=>entry.family),['feed.agricultura','flights.bia'],'AFIR and the BIA airport board are classified ghRelayed — both sit behind relay tours, each with its own runner');
assert.ok(!members.includes('flights.bia'),'the relayed board family left the cron sweep: the relay is the single writer of its freshness');
const routeHarness=await readFile(join(root,'scripts','verify-source-errors.mjs'),'utf8');
assert.ok(routeHarness.includes("family:'flights/bia'")&&routeHarness.includes('relay-publish'),'the route-side parity matrix pins the seed/reader contract this runner consumes');

// The board fixture mirrors the shape recorded by the research session (biaBoardBody of the
// parity matrix): three usable rows plus rows without a flight number or without a direction —
// dropped rows are counted by the route, never invented. The real FDS row shape confirms at
// the first successful tour; a genuinely different shape exits 2 with the route's message.
const otpBoard=()=>JSON.stringify([
 {flightNumber:'W6 3187',airline:{RO:'Wizz Air',EN:'Wizz Air'},direction:'A',origin:'Londra Luton',destination:'București',scheduledTime:'07:45',estimatedTime:'07:52',status:'Aterizat',gate:'04'},
 {flightNumber:'W6 3189',airline:{RO:'Wizz Air',EN:'Wizz Air'},direction:'D',origin:'București',destination:'Londra Luton',scheduledTime:'09:15',status:'Programat'},
 {flightNumber:'OS 899',airline:{RO:'Tarom',EN:'TAROM'},Direction:'A',origin:'Viena',destination:'București',scheduledTime:'08:10',status:'Întârziat'},
 {origin:'Fără număr de zbor',direction:'A'},
 {flightNumber:'QR 000',origin:'neprecizat'}]);

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
    if(behavior.reply==='noresult'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({arrivals:0,departures:0,dropped:0}));return}
    response.setHeader('Content-Type','application/json');
    response.end(JSON.stringify({result:'ok',airport:body.airport,arrivals:2,departures:1,dropped:2,servedAt:new Date().toISOString()}))});
   return}
  log.sourceGets.push({airport:url.searchParams.get('airport'),language:url.searchParams.get('language'),userAgent:request.headers['user-agent']||null,accept:request.headers.accept||null,authorization:request.headers.authorization||undefined,path:url.pathname});
  if(behavior.hangSource&&url.searchParams.get('airport')===behavior.hangSource)return;
  const status=behavior.sourceStatus&&behavior.sourceStatus[url.searchParams.get('airport')||''];
  if(status){response.writeHead(status);response.end();return}
  if(behavior.emptyBoard&&url.searchParams.get('airport')==='baneasa-aurel-vlaicu'){response.writeHead(200,{'Content-Type':'application/json'});response.end('[]');return}
  if(behavior.emptyBody&&url.searchParams.get('airport')==='baneasa-aurel-vlaicu'){response.writeHead(200,{'Content-Type':'application/json'});response.end('');return}
  const board=otpBoard();
  response.writeHead(200,{'Content-Type':'application/json'});response.end(board)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 return {origin,log,close:async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve))}}};

const runRelay=overrides=>{const env={...process.env};delete env.AFLIVRA_BIA_SOURCE_BASE;delete env.AFLIVRA_SEED_BASE;delete env.AFLIVRA_REFRESH_TOKEN;Object.assign(env,overrides);
 return new Promise(resolve=>{const child=spawn(process.execPath,[join(root,'scripts','relay-bia.mjs')],{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);const timer=setTimeout(()=>child.kill('SIGKILL'),90_000);child.on('close',(code,signal)=>{clearTimeout(timer);resolve({status:signal!==null?null:code,stdout,stderr})})})};
const leg=async(name,run)=>{try{await run();console.log('  [picior] '+name+' ✓')}catch(error){throw Object.assign(error,{message:'['+name+'] '+error.message})}};
const relayEnv=(d,token='token-de-verificare')=>({AFLIVRA_BIA_SOURCE_BASE:d.origin,AFLIVRA_SEED_BASE:d.origin,...(token?{AFLIVRA_REFRESH_TOKEN:token}:{})});

await leg('protocol complet: ambele panouri citite înainte de orice predare, text brut byte cu byte, confirmările consumate',async()=>{
 const d=await startDouble({});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,0,'exit 0 — both boards reachable, the relay completes');
  assert.ok(run.stdout.includes('[final]'),'the honest final line is printed');
  assert.equal(d.log.workerPosts.length,2,'exactly two POSTs — one per airport');
  assert.equal(d.log.sourceGets.length,2,'one board GET per airport, nothing else');
  for(const airport of relay.BIA_AIRPORTS){
   const get=d.log.sourceGets.find(entry=>entry.airport===airport);
   assert.ok(get,'airport '+airport+' is fetched');
   assert.equal(get.language,'ro','the board is read in Romanian, like the app loader');
   assert.equal(get.accept,relay.SOURCE_ACCEPT,'source requests mirror the app loader request shape');
   assert.equal(get.userAgent,relay.RELAY_UA,'the relay identifies itself at the airport');
   assert.equal(get.authorization,undefined,'the worker token never reaches the airport');
  }
  for(const post of d.log.workerPosts){
   assert.equal(post.method,'POST');assert.equal(post.userAgent,relay.RELAY_UA);
   assert.equal(post.authorization,'Bearer token-de-verificare','the seed POST authenticates');
   assert.equal(typeof post.body.body,'string','the board is handed over as raw text');
   assert.equal(post.body.body,otpBoard(),'the raw board text is relayed byte for byte');
   assert.ok(relay.BIA_AIRPORTS.includes(post.body.airport),'the POST names one of the registered airports');
  }
  const boardFetchedBeforeAnyPost=run.stdout.lastIndexOf('[sursă]')<run.stdout.indexOf('[predare]');
  assert.ok(boardFetchedBeforeAnyPost,'both boards are fetched before any POST — one tour publishes what it could fetch');
  assert.ok(run.stdout.includes('sosiri 2')&&run.stdout.includes('plecări 1'),'the route confirmations are consumed and printed');
  assert.ok(run.stdout.includes('rânduri omise 2'),'the dropped-rows count is surfaced honestly');
 }finally{await d.close()}});

await leg('panou gol (listă JSON goală): predat byte cu byte, fără curse inventate, ieșire 0',async()=>{
 const d=await startDouble({emptyBoard:true});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,0,'exit 0 — an empty board is a valid board');
  assert.equal(d.log.workerPosts.length,2,'the empty board is still POSTed');
  const bbuPost=d.log.workerPosts.find(post=>post.body.airport==='baneasa-aurel-vlaicu');
  assert.equal(bbuPost.body.body,'[]','the empty BBU board is handed over as the empty list it is');
  assert.ok(run.stdout.includes('2 caractere'),'the honest character count is printed for the short board');
 }finally{await d.close()}});

await leg('răspuns fără corp: panoul gol se predă onest, fără curse inventate, ieșire 0',async()=>{
 const d=await startDouble({emptyBody:true});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,0,'exit 0 — a zero-length board is still delivered');
  assert.equal(d.log.workerPosts.length,2,'the zero-length board is still POSTed');
  const bbuPost=d.log.workerPosts.find(post=>post.body.airport==='baneasa-aurel-vlaicu');
  assert.equal(bbuPost.body.body,'','the empty body is handed over as the empty text it is');
  assert.ok(run.stdout.includes('panou gol'),'the empty board is stated honestly, never padded');
 }finally{await d.close()}});

await leg('avarie per aeroport: panoul căzut nu blochează aeroportul sănătos, ieșire 2 informațional',async()=>{
 const d=await startDouble({sourceStatus:{'baneasa-aurel-vlaicu':403}});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — the airport itself errored, informational');
  assert.equal(d.log.workerPosts.length,1,'the healthy board is still published');
  assert.equal(d.log.workerPosts[0].body.airport,'henri-coanda','the healthy airport carries the tour');
  assert.ok(run.stdout.includes('Se predă 1 din 2'),'the per-airport partial is reported honestly, not masked');
  assert.ok(run.stdout.includes('HTTP 403'),'the failing airport status is stated');
 }finally{await d.close()}});

await leg('ambele panouri pică: fără listă goală la rută, ieșire 2',async()=>{
 const d=await startDouble({sourceStatus:{'henri-coanda':503,'baneasa-aurel-vlaicu':503}});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — both airports errored');
  assert.equal(d.log.workerPosts.length,0,'nothing is relayed when no board could be fetched');
  assert.equal(d.log.sourceGets.length,2,'each airport is attempted exactly once');
  assert.ok(run.stdout.includes('Niciun panou'),'the empty tour is stated honestly');
 }finally{await d.close()}});

await leg('sursa atârnă: legătura se întrerupe la limita de timp, panoul celălalt continuă',async()=>{
 const d=await startDouble({hangSource:'henri-coanda'});
 try{
  const started=Date.now();
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — the hung airport aborts its fetch, the healthy one still publishes');
  assert.ok(Date.now()-started>=relay.FETCH_TIMEOUT_MS-2000,'the AbortController bound actually fired (not an instant error)');
  assert.equal(d.log.workerPosts.length,1,'only the board that answered is handed over');
  assert.ok(run.stdout.includes('nu a putut fi citit'),'the hung fetch is reported honestly');
 }finally{await d.close()}});

await leg('ruta de depunere inaccesibilă: ieșire 1, eroare de infrastructură',async()=>{
 const d=await startDouble({});
 try{
  const run=await runRelay({...relayEnv(d),AFLIVRA_SEED_BASE:'http://127.0.0.1:1'});
  assert.equal(run.status,1,'exit 1 — our infrastructure, loud');
  assert.ok(run.stdout.includes('nu a putut fi contactată'),'the failing step is named');
  assert.equal(d.log.workerPosts.length,0,'the dead seed route receives no handoff');
 }finally{await d.close()}});

await leg('autentificare respinsă (HTTP 401): ieșire 1 fără livrare',async()=>{
 const d=await startDouble({workerStatus:401});
 try{
  const run=await runRelay(relayEnv(d,'token-gresit-401'));
  assert.equal(run.status,1,'exit 1 — auth rejected');
  assert.equal(d.log.workerPosts.length,1,'the relay stops at the first rejected POST');
  assert.ok(run.stdout.includes('Autentificare respinsă'),'the auth failure is stated');
 }finally{await d.close()}});

await leg('ruta respinge panoul (HTTP 400): ieșire 2 cu mesajul rutei, forma panoului s-a schimbat',async()=>{
 const d=await startDouble({workerStatus:400,workerError:'Panoul aeroportului nu poate fi decodat integral.'});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,2,'exit 2 — the route rejected the board shape, informational');
  assert.ok(run.stdout.includes('Panoul aeroportului nu poate fi decodat integral.'),'the route error message names what arrived');
  assert.equal(d.log.workerPosts.length,2,'both boards are attempted before the verdict');
  assert.ok(run.stdout.includes('ieșire 2'),'the exit class is stated in the log');
 }finally{await d.close()}});

await leg('confirmare lipsă la rută: contract încălcat, ieșire 1',async()=>{
 const d=await startDouble({reply:'noresult'});
 try{
  const run=await runRelay(relayEnv(d));
  assert.equal(run.status,1,'exit 1 — the reply does not carry the expected confirmation');
  assert.equal(d.log.workerPosts.length,1,'the relay stops at the first broken reply');
  assert.ok(run.stdout.includes('nu poartă confirmarea așteptată'),'the broken contract is stated');
 }finally{await d.close()}});

await leg('token lipsă: ieșire 1 înainte de orice contact cu aeroportul sau ruta',async()=>{
 const d=await startDouble({});
 try{
  const run=await runRelay(relayEnv(d,''));
  assert.equal(run.status,1,'exit 1 — missing token');
  assert.equal(d.log.sourceGets.length,0,'the airport is not contacted without a token');
  assert.equal(d.log.workerPosts.length,0,'the seed route is not contacted without a token');
  assert.ok(run.stdout.includes('AFLIVRA_REFRESH_TOKEN'),'the missing variable is named');
 }finally{await d.close()}});

console.log('Runnerul de relație BIA verificat pe dublă loopback: ambele panouri citite înainte de orice predare, panoul gol și răspunsul fără corp preluate onest, avaria per aeroport raportată fără mascare, paritatea URL cu încărcătorul aplicației, confirmările sosiri/plecări/rânduri omise, terminalul fără token și clasele de ieșire 0/1/2 — fără nicio adresă reală. Forma reală a rândurilor FDS se confirmă la prima tură reală a relay-ului (probele noastre au întâlnit testul de browser al sursei); o formă schimbată iese cu clasa 2 și mesajul rutei.');
console.log(JSON.stringify({result:'ok',legs:11,airports:relay.BIA_AIRPORTS.length,boardCap:relay.MAX_BODY_BYTES,route:relay.SEED_ROUTE}));
