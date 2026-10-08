import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Relay runner gate: scripts/relay-flights.mjs is the GitHub Actions side of the flights
// relay (adsb.lol serves residential egress but answers the Cloudflare Workers egress with
// 429/503 — the AFIR class, probe-proven 2026-10-07; the first real tour confirms the
// runner's own reputation against the source, registered honestly, not assumed here).
// Freeze its single-phase fail-closed contract against a loopback double of the four
// coverage points and the /api/seed/flights route (route side is gated separately by the
// flights/adsb cells of verify-source-errors.mjs): all four coverage responses fetched
// before the verdict, one failing centre delivering nothing (no quiet cut quadrant), the
// raw board texts relayed byte for byte, the {result,aircraft,hexes} confirmation, the
// exit classes 0/1/2, and the workflow + registry classification — loopback only, zero
// real addresses.
// The first real weekly tour (2026-10-07) met the source's rolling rate limit on the
// fourth consecutive hit (200, 200, 200, 429 back-to-back): the politeness answer is
// frozen here too — the four points stay sequential with a fixed inter-point gap, and
// only the source pause (HTTP 429) is retried, twice, with increasing delays, before the
// tour keeps its fail-closed verdict (a pause that never clears still delivers nothing).
const root=resolve(import.meta.dirname,'..');
const relay=await import(pathToFileURL(join(root,'scripts','relay-flights.mjs')));

assert.deepEqual(relay.ADSB_POINTS,[[47.5,22.75],[47.5,28.25],[44.5,22.75],[44.5,28.25]],'the relay fetches the four fixed national coverage points');
assert.equal(relay.ADSB_POINTS.length,4,'the coverage is the four-point maximum-radius envelope');
assert.equal(relay.ADSB_DIST,250,'each coverage query runs at the API maximum radius');
assert.equal(relay.SEED_ROUTE,'/api/seed/flights','the seed route path is frozen');
assert.equal(relay.RELAY_UA,'Aflivra/1.0 gh-relay','the relay identifies itself on every request');
assert.equal(relay.SOURCE_ACCEPT,'application/json','the relay asks the source for the format the app loader reads');
assert.equal(relay.MAX_BODY_BYTES,5_000_000,'the relay carries at most the response cap the app connector accepts');
assert.equal(relay.FETCH_TIMEOUT_MS,12_000,'the per-query bound mirrors the loader timeoutMs cap');
assert.equal(relay.POINT_GAP_MS,1_000,'the four sequential coverage GETs are paced with a fixed ~1 s inter-point gap — the first real tour met the source rolling window on the fourth back-to-back hit (200, 200, 200, 429)');
assert.equal(relay.RETRY_STATUS,429,'only the source pause (HTTP 429) is retried — every other status keeps the single-attempt fail-closed semantics');
assert.deepEqual(relay.RETRY_DELAYS_MS,[2_000,5_000],'a paused point gets at most two extra attempts with increasing delays — the absorbed-pause leg and the exhaustion leg freeze this bound behaviorally');
const flightsSource=await readFile(join(root,'lib/live','flights.ts'),'utf8');
const pointsLine=flightsSource.split('\n').find(text=>text.includes('const ADSB_POINTS'));
const loaderPoints=[...String(pointsLine).matchAll(/\[(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)]/g)].map(match=>[Number(match[1]),Number(match[2])]);
assert.deepEqual(loaderPoints,relay.ADSB_POINTS,'the relay coverage points mirror the app loader ADSB_POINTS exactly — same queries, same data');
const loaderDist=Number(flightsSource.match(/const ADSB_DIST=(\d+);/)?.[1]);
assert.equal(loaderDist,relay.ADSB_DIST,'the relay radius mirrors the app loader ADSB_DIST');
const loaderUrlBase=flightsSource.match(/const adsbUrl=\(lat:number,lon:number\)=>'([^']+)'/)?.[1];
for(const [lat,lon] of relay.ADSB_POINTS)
  assert.equal(relay.adsbCoverageUrl(relay.ADSB_BASE_DEFAULT,lat,lon),loaderUrlBase+lat+'/lon/'+lon+'/dist/'+relay.ADSB_DIST,'the relay fetches exactly the coverage URL the app loader reads for '+lat+', '+lon);
assert.ok(flightsSource.includes('timeoutMs:12000'),'the relay per-query cap is the loader own per-query cap');
const seedRouteSource=await readFile(join(root,'app/api/seed/flights','route.ts'),'utf8');
const boardCap=seedRouteSource.match(/const BOARD_CAP=([\d_]+);/)?.[1];
assert.equal(Number(boardCap?.replace(/_/g,'')),relay.MAX_BODY_BYTES,'the relay body cap matches the seed route board cap');
const coverageBoards=Number(seedRouteSource.match(/const COVERAGE_BOARDS=(\d+);/)?.[1]);
assert.equal(coverageBoards,relay.ADSB_POINTS.length,'the seed route demands exactly the four coverage responses the relay fetches — no quiet cut quadrant');
const workflow=await readFile(join(root,'.github/workflows','flights-refresh.yml'),'utf8');
assert.ok(workflow.includes('cron: "35 1,7,13,19 * * *"'),'the relay tour runs four times a day at 01:35/07:35/13:35/19:35 UTC (repo public — Actions minutes unlimited; the aircraft snapshot the reader serves between tours always carries the snapshot-age label, never a numeric cadence promise)');
assert.ok(workflow.includes('workflow_dispatch'),'the relay tour can be triggered manually');
assert.ok(workflow.includes('node scripts/relay-flights.mjs'),'the tour runs the relay script');
assert.ok(workflow.includes('AFLIVRA_REFRESH_TOKEN: ${{ secrets.AFLIVRA_REFRESH_TOKEN }}'),'the token comes from the GitHub secret shared with the AFIR and BIA relays');
assert.ok(!/continue-on-error/i.test(workflow),'the tour never downgrades failures silently');
assert.ok(!/git (push|commit)/.test(workflow),'the tour writes no git state — the D1 store is the store');
const groups=JSON.parse(await readFile(join(root,'lib/live','refresh-groups.json'),'utf8'));
const members=groups.groups.flatMap(group=>group.members);
assert.deepEqual(groups.ghRelayed.map(entry=>entry.family),['feed.agricultura','transport.flights','flights.bia'],'AFIR, the Romanian airspace flight states and the BIA airport board are classified ghRelayed — each sits behind a relay tour with its own runner');
assert.ok(!members.includes('transport.flights'),'the relayed flights family left the cron sweep: the relay is the single writer of its freshness');
const routeHarness=await readFile(join(root,'scripts','verify-source-errors.mjs'),'utf8');
assert.ok(routeHarness.includes("family:'flights/adsb'")&&routeHarness.includes('relay-publish'),'the route-side parity matrix pins the seed/reader contract this runner consumes');

// The coverage board mirrors the shape of the live v2 point response (the wave2-live
// fixture adsb-point-250.json): ac[] with an in-envelope aircraft, a spillover row and a
// row without a Mode-S address; the seed route's own parser + merge is gated by the
// flights/adsb cells — the loopback double only proves the runner carries the raw bytes.
const doubleBoard=()=>{const now=Date.now();
  return JSON.stringify({now,ctime:now,msg:'No error',total:3,ac:[
   {hex:'481f55',type:'adsb_icao',flight:'W6XYZ',r:'HA-LMN',t:'A320',lat:44.5,lon:26.1,alt_baro:30500,gs:448.1,baro_rate:1152,track:270.5,true_heading:268.2,squawk:'1000',emergency:'none'},
   {hex:'3c6b2f',type:'adsb_icao',flight:'DLH440',r:'D-ABYT',t:'A21N',lat:48.85,lon:2.35,alt_baro:35000,gs:470,baro_rate:0,track:95.1,true_heading:95.1,squawk:'1000',emergency:'none'},
   {type:'adsb_icao',flight:'NOHEX',lat:44.5,lon:26.1}]})};

const startDouble=async behavior=>{
  const log={sourceGets:[],workerPosts:[]};
  const boardText=doubleBoard();
  const server=createServer((request,response)=>{
   const url=new URL(request.url,'http://127.0.0.1');
   if(url.pathname===relay.SEED_ROUTE){
    let raw='';request.setEncoding('utf8');request.on('data',chunk=>raw+=chunk);
    request.on('end',()=>{
     const body=JSON.parse(raw);
     log.workerPosts.push({method:request.method,authorization:request.headers.authorization||null,userAgent:request.headers['user-agent']||null,body});
     if(behavior.workerStatus){response.writeHead(behavior.workerStatus,{'Content-Type':'application/json'});response.end(JSON.stringify({error:behavior.workerError||'Acces interzis.'}));return}
     if(behavior.reply==='noresult'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({aircraft:0,hexes:0}));return}
     response.setHeader('Content-Type','application/json');
     response.end(JSON.stringify({result:'ok',aircraft:3,hexes:4,observedAt:new Date().toISOString(),servedAt:new Date().toISOString()}))});
    return}
   const match=url.pathname.match(/^\/v2\/lat\/([\d.]+)\/lon\/([\d.]+)\/dist\/(\d+)$/),point=match?[match[1],match[2]]:null;
    log.sourceGets.push({point,dist:match?Number(match[3]):null,url:url.pathname,userAgent:request.headers['user-agent']||null,accept:request.headers.accept||null,authorization:request.headers.authorization||undefined,at:Date.now()});
    if(!match){response.writeHead(404);response.end();return}
    if(behavior.hangPoint&&behavior.hangPoint===point.join(','))return;
    if(behavior.failPoints&&behavior.failPoints.has(point.join(','))){const status=behavior.failPoints.get(point.join(','));response.writeHead(status);response.end();return}
    if(behavior.throttlePoints&&point){const key=point.join(','),left=behavior.throttlePoints.get(key)||0;
     if(left>0){behavior.throttlePoints.set(key,left-1);response.writeHead(429);response.end();return}}
    response.writeHead(200,{'Content-Type':'application/json'});response.end(boardText)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  return {origin,log,boardText,close:async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve))}}};

const runRelay=overrides=>{const env={...process.env};delete env.AFLIVRA_ADSB_SOURCE_BASE;delete env.AFLIVRA_SEED_BASE;delete env.AFLIVRA_REFRESH_TOKEN;Object.assign(env,overrides);
  return new Promise(resolve=>{const child=spawn(process.execPath,[join(root,'scripts','relay-flights.mjs')],{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);const timer=setTimeout(()=>child.kill('SIGKILL'),90_000);child.on('close',(code,signal)=>{clearTimeout(timer);resolve({status:signal!==null?null:code,stdout,stderr})})})};
const leg=async(name,run)=>{try{await run();console.log('  [picior] '+name+' ✓')}catch(error){throw Object.assign(error,{message:'['+name+'] '+error.message})}};
const relayEnv=(d,token='token-de-verificare')=>({AFLIVRA_ADSB_SOURCE_BASE:d.origin,AFLIVRA_SEED_BASE:d.origin,...(token?{AFLIVRA_REFRESH_TOKEN:token}:{})});

await leg('protocol complet: cele patru cereri de acoperire în ordinea punctelor, text brut byte cu byte, confirmarea consumată',async()=>{
  const d=await startDouble({});
  try{
   const run=await runRelay(relayEnv(d));
   assert.equal(run.status,0,'exit 0 — all four coverage points answered, the relay completes');
   assert.ok(run.stdout.includes('[final]'),'the honest final line is printed');
   assert.equal(d.log.sourceGets.length,4,'exactly the four coverage GETs — nothing else');
   assert.ok(d.log.sourceGets.every(get=>get.dist===relay.ADSB_DIST),'each coverage query runs at the fixed radius');
   assert.deepEqual(d.log.sourceGets.map(get=>get.point.map(Number)),relay.ADSB_POINTS,'the four fixed points are fetched in the loader order');
   assert.ok(d.log.sourceGets.every(get=>get.userAgent===relay.RELAY_UA&&get.accept===relay.SOURCE_ACCEPT),'source requests mirror the app loader request shape');
   assert.ok(d.log.sourceGets.every(get=>get.authorization===undefined),'the worker token never reaches the source');
   assert.equal(d.log.workerPosts.length,1,'exactly one POST — the tour is the four boards, not four deliveries');
   const post=d.log.workerPosts[0];
   assert.equal(post.method,'POST');assert.equal(post.userAgent,relay.RELAY_UA);
   assert.equal(post.authorization,'Bearer token-de-verificare','the seed POST authenticates');
   assert.ok(Array.isArray(post.body.boards)&&post.body.boards.length===4,'the POST carries the four coverage boards');
   assert.deepEqual(post.body.boards,relay.ADSB_POINTS.map(()=>d.boardText),'the raw coverage texts are relayed byte for byte, in point order');
   const fetchedBeforePost=run.stdout.lastIndexOf('[sursă]')<run.stdout.indexOf('[predare]');
   assert.ok(fetchedBeforePost,'all four boards are fetched before the POST — fail-closed coverage, never partial');
   assert.ok(run.stdout.includes('aeronave 3')&&run.stdout.includes('adrese Mode-S distincte 4'),'the route confirmations are consumed and printed');
  }finally{await d.close()}});

await leg('un punct de acoperire cade: fără cadran tăcut, tura nu predă nimic, ieșire 2 informațional',async()=>{
  const d=await startDouble({failPoints:new Map([['47.5,28.25',403]])});
  try{
   const run=await runRelay(relayEnv(d));
   assert.equal(run.status,2,'exit 2 — one centre failed, the whole tour fails closed');
   assert.equal(d.log.workerPosts.length,0,'nothing is relayed when a coverage point fails — a cut quadrant is never published');
   assert.equal(d.log.sourceGets.length,4,'every coverage point is still attempted, for its own honest report');
   assert.ok(run.stdout.includes('HTTP 403'),'the failing point status is stated');
   assert.ok(run.stdout.includes('fără cadran tăcut'),'the fail-closed rule is stated in the log');
  }finally{await d.close()}});

await leg('toate patru punctele pică: fără listă la rută, ieșire 2',async()=>{
  const d=await startDouble({failPoints:new Map(relay.ADSB_POINTS.map(([lat,lon])=>[lat+','+lon,503]))});
  try{
   const run=await runRelay(relayEnv(d));
   assert.equal(run.status,2,'exit 2 — the source errored on every point');
   assert.equal(d.log.workerPosts.length,0,'nothing is relayed when no board could be fetched');
   assert.equal(d.log.sourceGets.length,4,'each coverage point is attempted exactly once');
   assert.ok(run.stdout.includes('Ieșire 2'),'the exit class is stated in the log');
  }finally{await d.close()}});

await leg('un punct atârnă: legătura se întrerupe la limita de timp, tura nu predă nimic',async()=>{
  const d=await startDouble({hangPoint:'47.5,22.75'});
  try{
   const started=Date.now();
   const run=await runRelay(relayEnv(d));
   assert.equal(run.status,2,'exit 2 — the hung point aborts its fetch, nothing is published');
   assert.ok(Date.now()-started>=relay.FETCH_TIMEOUT_MS-2000,'the AbortController bound actually fired (not an instant error)');
   assert.equal(d.log.workerPosts.length,0,'the tour delivers nothing without all four boards');
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

await leg('ruta respinge tura (HTTP 400): ieșire 2 cu mesajul rutei, forma fluxului s-a schimbat',async()=>{
  const d=await startDouble({workerStatus:400,workerError:'Turul de acoperire livrează 3 răspunsuri în loc de cele 4 cereri fixe de acoperire națională — fără cadran tăcut, nimic nu se publică.'});
  try{
   const run=await runRelay(relayEnv(d));
   assert.equal(run.status,2,'exit 2 — the route rejected the delivery, informational');
   assert.ok(run.stdout.includes('cereri fixe de acoperire națională'),'the route error message names what arrived');
   assert.ok(run.stdout.includes('ieșire 2'),'the exit class is stated in the log');
  }finally{await d.close()}});

await leg('confirmare lipsă la rută: contract încălcat, ieșire 1',async()=>{
  const d=await startDouble({reply:'noresult'});
  try{
   const run=await runRelay(relayEnv(d));
   assert.equal(run.status,1,'exit 1 — the reply does not carry the expected confirmation');
   assert.ok(run.stdout.includes('nu poartă confirmarea așteptată'),'the broken contract is stated');
  }finally{await d.close()}});

await leg('token lipsă: ieșire 1 înainte de orice contact cu sursa sau ruta',async()=>{
  const d=await startDouble({});
  try{
    const run=await runRelay(relayEnv(d,''));
    assert.equal(run.status,1,'exit 1 — missing token');
    assert.equal(d.log.sourceGets.length,0,'the source is not contacted without a token');
    assert.equal(d.log.workerPosts.length,0,'the seed route is not contacted without a token');
    assert.ok(run.stdout.includes('AFLIVRA_REFRESH_TOKEN'),'the missing variable is named');
  }finally{await d.close()}});

await leg('pauza sursei (HTTP 429) absorbită mărginit: punctul al patrulea cere pauză de două ori și apoi răspunde — tura livrează integral, ieșire 0',async()=>{
  const d=await startDouble({throttlePoints:new Map([['44.5,28.25',2]])});
  try{
    const started=Date.now();
    const run=await runRelay(relayEnv(d));
    assert.equal(run.status,0,'exit 0 — the rolling rate limit on the fourth point is absorbed by the bounded retry, the relay completes');
    assert.equal(d.log.sourceGets.length,6,'the four coverage points plus exactly two bounded retries on the throttled point — nothing else');
    assert.deepEqual(d.log.sourceGets.map(get=>get.point.join(',')),['47.5,22.75','47.5,28.25','44.5,22.75','44.5,28.25','44.5,28.25','44.5,28.25'],'the coverage stays sequential in loader order, with the throttled point retried in place');
    const times=d.log.sourceGets.map(get=>get.at),gaps=times.slice(1).map((at,index)=>at-times[index]);
    assert.ok(gaps[0]>=900&&gaps[1]>=900&&gaps[2]>=900,'the sequential points are paced by the fixed inter-point gap (~1 s each)');
    assert.ok(gaps[3]>=1900&&gaps[4]>=4900,'the two bounded 429 retries wait the increasing delays (~2 s, then ~5 s) before refetching the same point');
    assert.ok(Date.now()-started>=7000,'the retry delays actually elapsed, the tour is not instant-pass');
    assert.equal((run.stdout.match(/a cerut o pauză/g)||[]).length,2,'each of the two source pauses is logged with its bounded retry');
    assert.ok(run.stdout.includes('după 2 reîncercări'),'the recovered point reports its retries honestly');
    assert.equal(d.log.workerPosts.length,1,'the tour still delivers exactly once, after the retries');
    assert.deepEqual(d.log.workerPosts[0].body.boards,relay.ADSB_POINTS.map(()=>d.boardText),'all four boards arrive byte for byte after the absorbed pauses');
    assert.ok(run.stdout.includes('[final]'),'the honest final line is printed after the recovered tour');
  }finally{await d.close()}});

await leg('pauza sursei care nu se limpezește: 429 în toate cele trei încercări ale punctului al patrulea — fără cadran tăcut, tura nu predă nimic, ieșire 2',async()=>{
  const d=await startDouble({failPoints:new Map([['44.5,28.25',429]])});
  try{
    const run=await runRelay(relayEnv(d));
    assert.equal(run.status,2,'exit 2 — the retry is bounded, the exhausted pause still fails the whole tour closed');
    assert.equal(d.log.workerPosts.length,0,'nothing is relayed when the bounded retry exhausts — fail-closed unchanged, a cut quadrant is never published');
    assert.equal(d.log.sourceGets.filter(get=>get.point.join(',')==='44.5,28.25').length,3,'the throttled point is attempted exactly three times — the initial try plus two bounded retries');
    assert.equal(d.log.sourceGets.filter(get=>get.point.join(',')!=='44.5,28.25').length,3,'the other three points stay at one attempt each — only the source pause is retried, no other status');
    assert.ok(run.stdout.includes('HTTP 429')&&run.stdout.includes('fără cadran tăcut'),'the exhausted pause status and the fail-closed rule are stated in the log');
    assert.equal((run.stdout.match(/a cerut o pauză/g)||[]).length,2,'both bounded retries are logged before the honest give-up');
  }finally{await d.close()}});

console.log('Runnerul de relație al avioanelor verificat pe dublă loopback: cele patru cereri fixe de acoperire în ordinea și pe adresele încărcătorului, citite pe rând cu pauză fixă între ele, cu pauza sursei (HTTP 429) absorbită mărginit — până la două reîncercări cu întârzieri crescătoare pentru același punct, iar pauza care nu se limpezește lasă tura fail-closed, fără cadran tăcut —, textele brute preluate byte cu byte, confirmările aeronave/adrese Mode-S, terminalul fără token și clasele de ieșire 0/1/2 — fără nicio adresă reală. Reputația runnerului GitHub față de adsb.lol se confirmă la prima tură reală (clasa respingerii egress-ului Worker a fost dovedită de sonde, iar limita rulantă a primei ture reale e absorbită de forma politicoasă); o formă schimbată iese cu clasa 2 și mesajul rutei.');
console.log(JSON.stringify({result:'ok',legs:11,points:relay.ADSB_POINTS.length,boardCap:relay.MAX_BODY_BYTES,route:relay.SEED_ROUTE}));
