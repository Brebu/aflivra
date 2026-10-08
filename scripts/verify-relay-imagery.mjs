import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

// Relay runner gate for the Wikidata/Commons imagery register: scripts/relay-imagery.mjs is
// the weekly GitHub Actions tour that maps the committed OSM corpus (park / school /
// pharmacy / court) onto exact Wikidata Q-ids, fetches the P18/P158 claims plus the Commons
// extmetadata license and downloads the 800px Special:FilePath thumbnail, appending the
// attested rows to public/media/manifest.json and the public/media/imagery-register.json
// index. Freezes its two-phase contract on a loopback double of Wikidata and Commons —
// zero real addresses: the corpus comes from a synthetic fixture root whose chunks carry
// real sha256 proofs, the candidate rules (exact Q-id only, operator/network excluded — an
// operator's photo is not a photo of the place), the per-tour caps, per-file origin and
// license gates, the dedup guard on Commons titles shared by several Q-ids, idempotence,
// the honest exit classes 0/1/2 and the workflow that commits the register through the
// two media verify gates. The app-side rendering gates live in verify-exploration-media.mjs
// and the e2e imagery-attribution legs.
let relay;
try{relay=await import(pathToFileURL(join(resolve(import.meta.dirname,'..'),'scripts','relay-imagery.mjs')))}
catch{console.error('RED: scripts/relay-imagery.mjs nu există încă — implementează relaia de imagini ca să devină verde acest ham.');process.exit(1)}
const root=resolve(import.meta.dirname,'..');

assert.equal(typeof relay.classifyImageryRecords,'function','the classifier is exported so the app-side gates reuse one rule set');
assert.equal(typeof relay.parseWikidataClaims,'function','the claims parser is exported for the verify battery');
assert.equal(typeof relay.parseCommonsImageinfo,'function','the Commons imageinfo parser is exported for the verify battery');
assert.equal(relay.IMAGERY_UA,'Aflivra/1.0 gh-relay (contact: contactretetesecrete@gmail.com)','the relay identifies itself with a contact on every request (Wikimedia UA policy)');
assert.equal(relay.THUMB_WIDTH,800,'the representative thumbnail is the ≈800px band that respects the media size budget');
assert.equal(relay.DOWNLOADS_PER_RUN,40,'the weekly tour downloads at most 40 images — politeness cap');
assert.equal(relay.WAVE_FILE_CAP,2000,'the imagery register keeps the wave soft cap of 2,000 files');
assert.equal(relay.MAX_IMAGE_BYTES,25*1024*1024,'the ASSETS per-file hard ceiling 25 MiB is the relay skip bound');
assert.equal(relay.WIKIDATA_IDS_PER_CALL,50,'wbgetentities carries at most 50 ids per call');
assert.equal(relay.COMMONS_TITLES_PER_CALL,50,'imageinfo carries at most 50 titles per call');
assert.equal(relay.REGISTER_RELATIVE_PATH,'public/media/imagery-register.json','the register index path is frozen for the renderer and the gates');
assert.equal(relay.CLASS_ORDER.join(','),'park,school,pharmacy,court','the tour covers exactly the four imagery classes of the user ask');
// The exact-id rule and the class scoping must share the app's link-out vocabulary:
// an id that is not a single exact Q-id never becomes an image key, and operator/network
// photos (a ministry is not a school, a network is not a park) stay out.
const placesWorkspace=await readFile(join(root,'app','places-workspace.tsx'),'utf8');
assert.ok(/^Q[1-9]\d{0,9}$/.test('Q959632')&&!/^Q[1-9]\d{0,9}$/.test('Q959632;Q1'),'the Q-id probe shape stays exact');
assert.ok(placesWorkspace.includes('/^Q[1-9]\\d{0,9}$/'),'the app link-out builder still uses the same exact Q-id rule the relay keys on');
const workflow=await readFile(join(root,'.github','workflows','imagery-refresh.yml'),'utf8');
assert.ok(workflow.includes('cron: "0 6 * * 4"'),'the imagery tour runs weekly Thursday 06:00 UTC — outside the Monday/Tuesday/Wednesday relay slots (afir/bia/flights)');
assert.ok(workflow.includes('workflow_dispatch:'),'the imagery tour can be triggered manually');
assert.ok(workflow.includes('permissions:')&&workflow.includes('contents: write'),'the tour commits the register: the workflow needs the contents write permission');
assert.ok(workflow.includes('node scripts/relay-imagery.mjs'),'the tour runs the relay script');
assert.ok(workflow.includes('node scripts/verify-exploration-media.mjs')&&workflow.includes('node scripts/verify-media-budget.mjs'),'the two media gates run before the register is committed');
assert.ok(workflow.includes('git add public/media'),'the tour commits only the media manifests and files it produced');
assert.ok(/git push/.test(workflow),'the tour pushes the committed register');
assert.ok(!/continue-on-error/i.test(workflow),'the tour never downgrades its own failures silently');
assert.ok(workflow.includes('- cron: "0 6 * * 4"')&&!/cron: "0 [0-5] \* \* [123]"/.test(workflow.replace('cron: "0 6 * * 4"','')),'no second cron slot collides with the frozen worker/relay schedule');

// Fixture corpus: synthetic chunks with real sha256 proofs, mirroring the committed
// transport (gzipped files, proofs describing the decompressed snapshot bytes).
const fixtureItems=[
 {id:'n1',name:'Parcul Cișmigiu',categories:['mediu'],lat:44.43,lon:26.09,tags:{leisure:'park',wikidata:'Q959632'}},
 {id:'n2',name:'Parcul Carol I',categories:['mediu'],lat:44.43,lon:26.1,tags:{leisure:'park',wikidata:'Q2052075'}},
 {id:'n3',name:'Școala Centrală',categories:['educatie'],lat:44.44,lon:26.1,tags:{amenity:'school',wikidata:'Q12744205'}},
 {id:'n4',name:'Catena',categories:['sanatate'],lat:44.45,lon:26.1,tags:{amenity:'pharmacy','brand:wikidata':'Q24035728',brand:'Catena'}},
 {id:'n5',name:'Palatul de Justiție',categories:['justitie'],lat:45.79,lon:24.15,tags:{amenity:'courthouse',wikidata:'Q43113639'}},
 {id:'n6',name:'Liceul cu_operator',categories:['educatie'],lat:44.44,lon:26.11,tags:{amenity:'school','operator:wikidata':'Q1583546'}},
 {id:'n7',name:'Parcul Bordei',categories:['mediu'],lat:44.46,lon:26.08,tags:{leisure:'park',wikidata:'Q4093496'}},
 {id:'n8',name:'Parcul cu id multiplu',categories:['mediu'],lat:44.46,lon:26.09,tags:{leisure:'park',wikidata:'Q959632;Q2052075'}},
 {id:'n9',name:'Help Net',categories:['sanatate'],lat:44.45,lon:26.12,tags:{amenity:'pharmacy','brand:wikidata':'Q12729923',brand:'Help Net'}},
 {id:'n10',name:'Farmacia fără id',categories:['sanatate'],lat:44.45,lon:26.13,tags:{amenity:'pharmacy',name:'Farmacia de cartier'}},
];
const fixtureClaims={
 Q959632:{labels:{ro:{value:'Parcul Cișmigiu'}},claims:{P18:[{mainsnak:{datavalue:{value:'Cismigiu-Garden-Bucharest-3.jpg'}}}]}},
 Q2052075:{labels:{ro:{value:'Parcul Carol I'}},claims:{P18:[{mainsnak:{datavalue:{value:'Carol Park Bucharest.jpg'}}}]}},
 Q12744205:{labels:{ro:{value:'Școala Centrală'}},claims:{}},
 Q24035728:{labels:{ro:{value:'Catena'}},claims:{P18:[{mainsnak:{datavalue:{value:'Catena pharmacy.jpg'}}}]}},
 Q43113639:{labels:{ro:{value:'Palatul de Justiție din Sibiu'}},claims:{P158:[{mainsnak:{datavalue:{value:'Courthouse Sibiu seal.png'}}}]}},
 Q4093496:{labels:{ro:{value:'Parcul Bordei'}},claims:{P18:[{mainsnak:{datavalue:{value:'Bordei Park.jpg'}}}]}},
 Q12729923:{labels:{ro:{value:'Help Net'}},claims:{P18:[{mainsnak:{datavalue:{value:'HelpNet.jpg'}}}]}},
 Q1583546:{labels:{ro:{value:'Ministerul Educației'}},claims:{P18:[{mainsnak:{datavalue:{value:'Ministry building.jpg'}}}]}},
};
const fixtureImageinfo={
 'Cismigiu-Garden-Bucharest-3.jpg':{license:'CC BY-SA 3.0',licenseUrl:'http://creativecommons.org/licenses/by-sa/3.0/',artist:'<a href="https://ro.wikipedia.org/wiki/User:Mastermindsro">Mastermindsro</a>',width:1024,height:768,type:'image/jpeg'},
 'Carol Park Bucharest.jpg':{license:'Public domain',licenseUrl:'',artist:'Miehs',width:7672,height:3401,type:'image/jpeg'},
 'Catena pharmacy.jpg':{license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',artist:'Catena brand photo',width:640,height:640,type:'image/jpeg'},
 'Courthouse Sibiu seal.png':{license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',artist:'Sibiu court',width:600,height:600,type:'image/png'},
 'Bordei Park.jpg':{license:'CC BY-SA 3.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/',artist:'Existing',width:900,height:600,type:'image/jpeg'},
 'Ministry building.jpg':{license:'CC BY-SA 3.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/',artist:'Anyone',width:800,height:600,type:'image/jpeg'},
 'HelpNet.jpg':{license:'',licenseUrl:'',artist:'',width:800,height:600,type:'image/jpeg'},
};
const imageBytes=title=>Buffer.from('octeți-fixture-'+title,'utf8');
const preAttestedRow=()=>({app_id:'wiki-q4093496',app_file:'/media/wiki-q4093496.jpg',qid:'Q4093496',author:'Existing',license:'CC BY-SA 3.0',license_url:'https://creativecommons.org/licenses/by-sa/3.0/',source_page_url:'https://commons.wikimedia.org/wiki/File:Bordei_Park.jpg',title:'Bordei Park.jpg',bytes:imageBytes('Bordei Park.jpg').length,sha256:createHash('sha256').update(imageBytes('Bordei Park.jpg')).digest('hex')});

const buildRoot=async overrides=>{
 const dir=await mkdtemp(join(tmpdir(),'aflivra-imagery-relay-'));
 await mkdir(join(dir,'public/places/records'),{recursive:true});
 await mkdir(join(dir,'public/media'),{recursive:true});
 const raw=Buffer.from(JSON.stringify({items:fixtureItems}));
 await writeFile(join(dir,'public/places/records/0000.json.gz'),gzipSync(raw));
 const manifest={schema:'aflivra-places-v2',chunks:{'0000':{bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')}}};
 await writeFile(join(dir,'public/places/manifest.json'),JSON.stringify(manifest));
 const initialRows=overrides?.manifestRows??[];
 await writeFile(join(dir,'public/media/manifest.json'),JSON.stringify({assets:initialRows}));
 if(overrides?.register){await writeFile(join(dir,relay.REGISTER_RELATIVE_PATH),JSON.stringify(overrides.register))}
 else if(!overrides?.noRegister){await writeFile(join(dir,relay.REGISTER_RELATIVE_PATH),JSON.stringify({schema:relay.REGISTER_SCHEMA,generatedAt:'2026-10-01T06:00:00.000Z',source:'Wikidata (P18/P158) · Wikimedia Commons',classes:{},assets:[preAttestedRow()],records:{n7:{a:'wiki-q4093496',c:'park',t:'wikidata'}}}))}
 if(overrides?.mediaFiles)for(const [name,bytes] of overrides.mediaFiles)await writeFile(join(dir,'public/media',name),bytes);
 return dir};

// Loopback doubles: one Wikidata api, one Commons api + Special:FilePath. Every request is
// logged; behaviors inject the failure modes the exit classes must classify.
const startWikidata=async behavior=>{
 const log={calls:[]};
 const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');log.calls.push({action:url.searchParams.get('action'),ids:(url.searchParams.get('ids')||'').split('|'),ua:request.headers['user-agent']||null});
  if(url.pathname!=='/w/api.php'||url.searchParams.get('action')!=='wbgetentities'){response.writeHead(404).end();return}
  if(behavior.status){response.writeHead(behavior.status,{'Content-Type':'application/json'});response.end('{}');return}
  if(behavior.invalid){response.writeHead(200,{'Content-Type':'application/json'});response.end('nu este json');return}
  const claims=behavior.claims||fixtureClaims,entities={};for(const id of url.searchParams.get('ids').split('|'))if(claims[id])entities[id]=claims[id];
  response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({entities,success:1}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 return {origin,log,close:async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r))}}};

const startCommons=async behavior=>{
 const log={imageinfo:[],fileDownloads:[]};
 const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');
  if(url.pathname==='/w/api.php'&&url.searchParams.get('action')==='query'){
   log.imageinfo.push({titles:(url.searchParams.get('titles')||'').split('|'),width:url.searchParams.get('iiurlwidth'),ua:request.headers['user-agent']||null});
   if(behavior.infoStatus){response.writeHead(behavior.infoStatus,{'Content-Type':'application/json'});response.end('{}');return}
   const pageid=x=>1000+[...x].reduce((a,c)=>a+c.charCodeAt(0),0);
   const pages={};for(const title of url.searchParams.get('titles').split('|')){
    const bare=title.replace(/^File:/,''),meta=fixtureImageinfo[bare];
    if(!meta)continue; // a title with no imageinfo (deleted/moved) stays honestly skipped
    pages[pageid(bare)]={pageid:pageid(bare),ns:6,title,imagerepository:'local',revisions:[{revid:1}],imageinfo:[{thumburl:behavior.origin+'/w/thumb?'+encodeURIComponent(bare),thumbwidth:800,url:'https://upload.wikimedia.org/wikipedia/commons/'+bare,descriptionurl:'https://commons.wikimedia.org/wiki/'+title,width:meta.width,height:meta.height,size:imageBytes(bare).length,sha1:'0'.repeat(40),extmetadata:meta.license?{LicenseShortName:{value:meta.license},...(meta.licenseUrl?{LicenseUrl:{value:meta.licenseUrl}}:{}),Artist:{value:meta.artist},ObjectName:{value:bare},Credit:{value:'Own work'}}:{}}]}}
   response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({query:{pages}}));return}
  if(url.pathname.startsWith('/wiki/Special:FilePath/')){
   const bare=decodeURIComponent(url.pathname.slice('/wiki/Special:FilePath/'.length)),meta=fixtureImageinfo[bare];
   log.fileDownloads.push({title:bare,width:url.searchParams.get('width'),ua:request.headers['user-agent']||null,accept:request.headers.accept||null});
   if(behavior.redirect){response.writeHead(302,{Location:behavior.redirect});response.end();return}
   if(behavior.downloadStatus){response.writeHead(behavior.downloadStatus);response.end();return}
   if(!meta){response.writeHead(404).end();return}
   response.writeHead(200,{'Content-Type':meta.type});response.end(imageBytes(bare));return}
  response.writeHead(404).end()});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 return {origin,log,close:async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r))}}};

const runRelay=overrides=>{const env={...process.env};delete env.AFLIVRA_WIKIDATA_API;delete env.AFLIVRA_COMMONS;delete env.AFLIVRA_IMAGERY_LIMIT;delete env.AFLIVRA_IMAGERY_WAVE_CAP;Object.assign(env,overrides);
 return new Promise(r=>{const child=spawn(process.execPath,[join(root,'scripts','relay-imagery.mjs')],{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);const timer=setTimeout(()=>child.kill('SIGKILL'),60_000);child.on('close',(code,signal)=>{clearTimeout(timer);r({status:signal!==null?null:code,stdout,stderr})})})};
const leg=async(name,run)=>{try{await run();console.log('  [picior] '+name+' ✓')}catch(error){throw Object.assign(error,{message:'['+name+'] '+error.message})}};
const relayEnv=(rootDir,w,b,c={})=>({AFLIVRA_IMAGERY_ROOT:rootDir,AFLIVRA_WIKIDATA_API:w.origin+'/w/api.php',AFLIVRA_COMMONS:c.commons??b.origin,...c.env});
const nodeFs=await import('node:fs');
const readJson=(dir,file)=>JSON.parse(nodeFs.readFileSync(join(dir,file)));

await leg('tur complet: clasificarea exactă, licențele, ștampilele sha256 și registrul',async()=>{
 const dir=await buildRoot(),w=await startWikidata({}),b=await startCommons({});
 try{
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,0,'exit 0 — the tour applied the attested imagery');
  const ids=w.log.calls.flatMap(call=>call.ids);
  assert.deepEqual(new Set(ids),new Set(['Q959632','Q2052075','Q12744205','Q24035728','Q43113639','Q12729923']),'exact Q-id keys only: malformed multi-valued ids and the pre-attested row stay out, the operator-only and imageless records are queried for their own id only when it exists — Q1583546 is operator-only and never queried');
  assert.ok(w.log.calls.every(call=>call.ids.length<=relay.WIKIDATA_IDS_PER_CALL),'wbgetentities batches stay within the 50-id cap');
  assert.ok(w.log.calls.every(call=>call.ua===relay.IMAGERY_UA),'the relay identifies itself to Wikidata');
  assert.deepEqual(new Set(b.log.fileDownloads.map(d=>d.title)),new Set(['Cismigiu-Garden-Bucharest-3.jpg','Carol Park Bucharest.jpg','Catena pharmacy.jpg','Courthouse Sibiu seal.png']),'only licensed claims download: the licenseless HelpNet.jpg is skipped honestly, the operator ministry photo is never fetched');
  assert.ok(b.log.fileDownloads.every(d=>d.width===String(relay.THUMB_WIDTH)),'every Special:FilePath request asks for the 800px thumbnail');
  assert.ok(b.log.fileDownloads.every(d=>d.ua===relay.IMAGERY_UA),'the relay identifies itself to Commons');
  const register=readJson(dir,relay.REGISTER_RELATIVE_PATH);
  assert.equal(register.schema,relay.REGISTER_SCHEMA);
  assert.deepEqual(Object.keys(register.records),['n1','n2','n4','n5','n7'],'records with an attested image: n3 (no claim) and n9 (no license) stay out, n6/n8/n10 never qualified, n7 keeps its pre-attested row');
  assert.equal(register.records.n1.a,'wiki-q959632');assert.equal(register.records.n1.c,'park');assert.equal(register.records.n1.t,'wikidata');
  assert.equal(register.records.n4.t,'brand:wikidata','the pharmacy brand row is labeled as a brand key');
  const byId=new Map(register.assets.map(a=>[a.app_id,a]));
  assert.ok(byId.has('wiki-q959632')&&byId.has('wiki-q2052075')&&byId.has('wiki-q24035728')&&byId.has('wiki-q43113639'),'five assets including the pre-attested Bordei row survive');
  assert.equal(register.assets.length,5,'one asset per Q-id — no duplicates');
  const cismigiu=byId.get('wiki-q959632');
  assert.equal(cismigiu.author,'Mastermindsro','extmetadata Artist is stripped to the plain author name');
  assert.equal(cismigiu.license,'CC BY-SA 3.0');assert.equal(cismigiu.license_url,'https://creativecommons.org/licenses/by-sa/3.0/','the http license URL is normalized to https');
  assert.equal(cismigiu.source_page_url,'https://commons.wikimedia.org/wiki/File:Cismigiu-Garden-Bucharest-3.jpg');
  assert.equal(cismigiu.role,'entity','park/school/court rows carry the entity role');
  assert.equal(byId.get('wiki-q24035728').role,'brand','pharmacy brand rows carry the honest brand role');
  assert.equal(byId.get('wiki-q43113639').claim,'P158','P18 missing falls back to the P158 logo claim');
  const man=readJson(dir,'public/media/manifest.json'),manifestRow=man.assets.find(a=>a.app_id==='wiki-q959632');
  assert.equal(manifestRow.bytes,imageBytes('Cismigiu-Garden-Bucharest-3.jpg').length,'the manifest row counts the exact shipped bytes');
   const fileBytes=Buffer.from(nodeFs.readFileSync(join(dir,'public/media','wiki-q959632.jpg')));
  assert.equal(createHash('sha256').update(fileBytes).digest('hex'),manifestRow.sha256,'the manifest sha256 proves the exact shipped bytes');
  assert.equal(manifestRow.sha256,cismigiu.sha256,'register and manifest agree on the proof');
  assert.equal(man.assets.length,4,'the manifest rows are appended for the applied images only — the pre-attested register row owned its own manifest face in a previous tour');
  assert.ok(run.stdout.includes('fotografii atestate'),'the honest summary states the applied count');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('idempotență: a doua tură nu re-descarcă și nu dublează rândurile',async()=>{
 const dir=await buildRoot(),w=await startWikidata({}),b=await startCommons({});
 try{
  await runRelay(relayEnv(dir,w,b));
  const {assets:before,records:recordsBefore}=readJson(dir,relay.REGISTER_RELATIVE_PATH);
  const filesBefore=nodeFs.readdirSync(join(dir,'public/media')).filter(f=>f.startsWith('wiki-')).length;
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,0,'exit 0 — the cycle adds nothing new');
  const {assets:after,records:recordsAfter}=readJson(dir,relay.REGISTER_RELATIVE_PATH);
  assert.equal(after.length,before.length,'no duplicate manifest-facing rows');
  assert.equal(Object.keys(recordsAfter).length,Object.keys(recordsBefore).length,'no duplicate record keys');
  assert.equal(nodeFs.readdirSync(join(dir,'public/media')).filter(f=>f.startsWith('wiki-')).length,filesBefore,'no bytes are re-downloaded');
  assert.equal(b.log.fileDownloads.length,4,'both tours together downloaded the four licensed files exactly once');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('limita per tură: primii candidați, restul onest la următoarea tură',async()=>{
 const dir=await buildRoot(),w=await startWikidata({}),b=await startCommons({});
 try{
  const run=await runRelay({...relayEnv(dir,w,b),AFLIVRA_IMAGERY_LIMIT:'2'});
  assert.equal(run.status,0,'exit 0 with the capped delivery');
  const register=readJson(dir,relay.REGISTER_RELATIVE_PATH);
  assert.equal(register.assets.filter(a=>a.app_id!=='wiki-q4093496').length,2,'only the first two class-ordered candidates are applied');
  assert.equal(nodeFs.readdirSync(join(dir,'public/media')).filter(f=>f.startsWith('wiki-')).length,2,'only two files land on disk');
  assert.ok(Object.keys(register.records).every(id=>register.assets.some(a=>a.app_id===register.records[id].a)),'no record row dangles on an asset that was not applied');
  assert.ok(run.stdout.includes('[limită]'),'the cap is reported honestly');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('plafonul de val: plafonul atins, fără descărcări, ieșire 0',async()=>{
 const dir=await buildRoot({register:{schema:relay.REGISTER_SCHEMA,generatedAt:'2026-10-01T06:00:00.000Z',assets:[preAttestedRow()],records:{n7:{a:'wiki-q4093496',c:'park',t:'wikidata'}}}}),w=await startWikidata({}),b=await startCommons({});
 try{
  const run=await runRelay({...relayEnv(dir,w,b),AFLIVRA_IMAGERY_WAVE_CAP:'1'});
  assert.equal(run.status,0,'exit 0 — the cap is a decision, not an error');
  const register=readJson(dir,relay.REGISTER_RELATIVE_PATH);
  assert.equal(register.assets.length,1,'nothing is added past the wave cap');
  assert.equal(b.log.fileDownloads.length,0,'no download is attempted past the cap');
  assert.ok(run.stdout.includes('plafon')||run.stdout.includes('limită'),'the cap is stated in the log');}
 finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('Wikidata pică (HTTP 500): ieșire 2 informațional, nimic scris',async()=>{
 const dir=await buildRoot(),w=await startWikidata({status:500}),b=await startCommons({});
 try{
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,2,'exit 2 — the source itself errored, informational');
  assert.equal(w.log.calls.length,1,'exactly one attempt at the source');
  assert.equal(b.log.fileDownloads.length,0,'nothing is downloaded when the source fails');
  assert.ok(!nodeFs.existsSync(join(dir,'public/media','wiki-q959632.jpg')),'no file is written');
  assert.equal(readJson(dir,'public/media/manifest.json').assets.length,0,'the manifest keeps its original rows only');
  assert.ok(run.stdout.includes('ieșire 2'),'the exit class is stated');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('Commons pică după Wikidata: ieșire 2 informațional, nimic scris',async()=>{
 const dir=await buildRoot(),w=await startWikidata({}),b=await startCommons({infoStatus:500});
 try{
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,2,'exit 2 — Commons errored this tour');
  assert.ok(w.log.calls.length>=1,'the claims phase did run');
  assert.equal(b.log.fileDownloads.length,0,'no download happens without the license metadata');
  assert.ok(!nodeFs.existsSync(join(dir,'public/media','wiki-q959632.jpg')),'no file is written');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('toate descărcările pică: fără scrieri parțiale, ieșire 2',async()=>{
 const dir=await buildRoot(),w=await startWikidata({}),b=await startCommons({downloadStatus:404});
 try{
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,2,'exit 2 — every candidate download failed at the source');
  assert.equal(readJson(dir,'public/media/manifest.json').assets.length,0,'no partial manifest write');
  assert.equal(nodeFs.readdirSync(join(dir,'public/media')).filter(f=>f.startsWith('wiki-')).length,0,'no partial files');
  assert.ok(run.stdout.includes('omis')||run.stdout.includes('eșuat'),'the per-candidate omission is stated honestly');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('redirecționare străină la descărcare: candidat refuzat, ieșire 2',async()=>{
 const dir=await buildRoot(),w=await startWikidata({}),b=await startCommons({redirect:'http://evil.test/exfil.jpg'});
 try{
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,2,'exit 2 — the source tried to send the bytes off-wikimedia');
  assert.equal(nodeFs.readdirSync(join(dir,'public/media')).filter(f=>f.startsWith('wiki-')).length,0,'no bytes from a foreign origin land in the register');
  assert.ok(run.stdout.includes('[refuzat]'),'the refusal is reported');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('corpus cu dovada sha256 ruptă: ieșire 1, sursa nu este contactată',async()=>{
 const dir=await buildRoot(),w=await startWikidata({}),b=await startCommons({});
 try{nodeFs.writeFileSync(join(dir,'public/places/records/0000.json.gz'),gzipSync(Buffer.from(JSON.stringify({items:fixtureItems.slice(0,3)}))));
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,1,'exit 1 — our committed corpus forgery is our infra failure');
  assert.equal(w.log.calls.length,0,'the corrupted corpus contacts no API');
  assert.equal(b.log.fileDownloads.length,0,'no downloads');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('garda de dedublare pe titlu Comun: două Q-id-uri, un singur fișier',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aflivra-imagery-relay-'));
 await mkdir(join(dir,'public/places/records'),{recursive:true});await mkdir(join(dir,'public/media'),{recursive:true});
 const items=[fixtureItems[0],{...fixtureItems[1],tags:{...fixtureItems[1].tags,wikidata:'Q999000001'}}];
 const raw=Buffer.from(JSON.stringify({items}));
 await writeFile(join(dir,'public/places/records/0000.json.gz'),gzipSync(raw));
 await writeFile(join(dir,'public/places/manifest.json'),JSON.stringify({schema:'aflivra-places-v2',chunks:{'0000':{bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')}}}));
 await writeFile(join(dir,'public/media/manifest.json'),JSON.stringify({assets:[]}));
 const claims={Q959632:fixtureClaims.Q959632,Q999000001:{labels:{ro:{value:'Al doilea parc'}},claims:{P18:[{mainsnak:{datavalue:{value:'Cismigiu-Garden-Bucharest-3.jpg'}}}]}}};
 const w=await startWikidata({claims}),b=await startCommons({});
 try{
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,0);
  const register=readJson(dir,relay.REGISTER_RELATIVE_PATH);
  assert.equal(register.assets.length,1,'a Commons title shared by two Q-ids is downloaded and attested once');
  assert.equal(register.assets[0].app_id,'wiki-q959632','the first class-ordered Q-id owns the asset');
  assert.equal(register.records.n2.a,'wiki-q959632','the second record reuses the same attested asset');
  assert.equal(b.log.fileDownloads.length,1,'the bytes are fetched exactly once');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('ciclul stabil: doar cheile neverificate se interoghează, zero descărcări, ieșire 0',async()=>{
 const fullRegister={schema:relay.REGISTER_SCHEMA,generatedAt:'2026-10-01T06:00:00.000Z',source:'Wikidata (P18/P158) · Wikimedia Commons',classes:{},assets:[preAttestedRow()],records:{}};
 fullRegister.assets.push({app_id:'wiki-q959632',app_file:'/media/wiki-q959632.jpg',qid:'Q959632',author:'Mastermindsro',license:'CC BY-SA 3.0',license_url:'https://creativecommons.org/licenses/by-sa/3.0/',source_page_url:'https://commons.wikimedia.org/wiki/File:Cismigiu-Garden-Bucharest-3.jpg',title:'Cismigiu-Garden-Bucharest-3.jpg',bytes:imageBytes('Cismigiu-Garden-Bucharest-3.jpg').length,sha256:createHash('sha256').update(imageBytes('Cismigiu-Garden-Bucharest-3.jpg')).digest('hex'),role:'entity',claim:'P18',classes:['park']});
 fullRegister.assets.push({app_id:'wiki-q2052075',app_file:'/media/wiki-q2052075.jpg',qid:'Q2052075',author:'Miehs',license:'Public domain',license_url:'https://commons.wikimedia.org/wiki/File:Carol_Park_Bucharest.jpg',source_page_url:'https://commons.wikimedia.org/wiki/File:Carol_Park_Bucharest.jpg',title:'Carol Park Bucharest.jpg',bytes:imageBytes('Carol Park Bucharest.jpg').length,sha256:createHash('sha256').update(imageBytes('Carol Park Bucharest.jpg')).digest('hex'),role:'entity',claim:'P18',classes:['park']});
 fullRegister.assets.push({app_id:'wiki-q24035728',app_file:'/media/wiki-q24035728.jpg',qid:'Q24035728',author:'Catena brand photo',license:'CC BY-SA 4.0',license_url:'https://creativecommons.org/licenses/by-sa/4.0/',source_page_url:'https://commons.wikimedia.org/wiki/File:Catena_pharmacy.jpg',title:'Catena pharmacy.jpg',bytes:imageBytes('Catena pharmacy.jpg').length,sha256:createHash('sha256').update(imageBytes('Catena pharmacy.jpg')).digest('hex'),role:'brand',claim:'P18',classes:['pharmacy']});
 fullRegister.assets.push({app_id:'wiki-q43113639',app_file:'/media/wiki-q43113639.png',qid:'Q43113639',author:'Sibiu court',license:'CC0',license_url:'https://creativecommons.org/publicdomain/zero/1.0/',source_page_url:'https://commons.wikimedia.org/wiki/File:Courthouse_Sibiu_seal.png',title:'Courthouse Sibiu seal.png',bytes:imageBytes('Courthouse Sibiu seal.png').length,sha256:createHash('sha256').update(imageBytes('Courthouse Sibiu seal.png')).digest('hex'),role:'entity',claim:'P158',classes:['court']});
 fullRegister.records={n1:{a:'wiki-q959632',c:'park',t:'wikidata'},n2:{a:'wiki-q2052075',c:'park',t:'wikidata'},n4:{a:'wiki-q24035728',c:'pharmacy',t:'brand:wikidata'},n5:{a:'wiki-q43113639',c:'court',t:'wikidata'}};
 const dir=await buildRoot({register:fullRegister,manifestRows:fullRegister.assets.map(a=>({...a}))}),w=await startWikidata({}),b=await startCommons({});
 try{
  const run=await runRelay(relayEnv(dir,w,b));
  assert.equal(run.status,0,'exit 0 — every licensed claim is already attested');
  // n3 (school, no claim) keeps the tour looking for newly-published photos: its Q-id is
  // the only honest reason to still call Wikidata on a "complete" register.
  assert.deepEqual(w.log.calls.flatMap(call=>call.ids).sort(),['Q12729923','Q12744205'],'only the not-yet-attested Q-ids are queried — the unlicensed brand is retried (its license may appear), the claimless school is retried (a photo may be published)');
  assert.equal(b.log.fileDownloads.length,0,'nothing is downloaded');
  assert.ok(run.stdout.includes('0 fotografii')||run.stdout.includes('niciuna'),'the zero-apply outcome is stated');
 }finally{await b.close();await w.close();await rm(dir,{recursive:true,force:true})}});

await leg('clasificatorul: regulile D4 — id exact, operator exclus, clasele domeniului',async()=>{
 const rows=relay.classifyImageryRecords(fixtureItems);
 const byId=new Map(rows.map(r=>[r.id,r]));
 assert.ok(['n1','n2','n4','n5','n7','n3','n9'].every(id=>byId.has(id)),'records with an exact id key in their class');
 assert.ok(!byId.has('n6'),'operator-only records never key on the operator');
 assert.ok(!byId.has('n8'),'multi-valued ids never key');
 assert.ok(!byId.has('n10'),'records without a Q-id never key');
 assert.equal(byId.get('n4').qid,'Q24035728');assert.equal(byId.get('n4').tag,'brand:wikidata');assert.equal(byId.get('n4').role,'brand');
 assert.equal(byId.get('n1').role,'entity');
 assert.equal(byId.get('n5').cls,'court');
 const corpusClassCategories=new Set(rows.map(r=>relay.IMAGERY_CLASSES[r.cls].category));
 assert.deepEqual(corpusClassCategories,new Set(['mediu','educatie','sanatate','justitie']),'the four classes map onto the four corpus categories');
});

console.log('Runnerul de relație al imaginilor verificat pe dublă loopback: clasificarea exactă a Q-id-urilor (operator exclus, id-uri multiple respinse), licențele extmetadata cu normalizare https, ștampilele sha256 pe octeții exacți, garda de dedublare pe titluri comune, limitele per tură și de val, respingerea redirecționărilor străine, integritatea corpusului înainte de orice contact, idempotența și clasele de ieșire 0/1/2 — fără nicio adresă reală.');
console.log(JSON.stringify({result:'ok',legs:12,waveCap:relay.WAVE_FILE_CAP,downloadsPerTour:relay.DOWNLOADS_PER_RUN,thumbWidth:relay.THUMB_WIDTH}));
