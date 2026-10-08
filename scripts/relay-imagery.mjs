import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

export const WIKIDATA_API_DEFAULT='https://www.wikidata.org/w/api.php';
export const COMMONS_DEFAULT='https://commons.wikimedia.org';
export const IMAGERY_UA='Aflivra/1.0 gh-relay (contact: contactretetesecrete@gmail.com)';
export const THUMB_WIDTH=800;
export const DOWNLOADS_PER_RUN=40;
export const QIDS_PER_RUN=250;
export const WIKIDATA_IDS_PER_CALL=50;
export const COMMONS_TITLES_PER_CALL=50;
export const WAVE_FILE_CAP=2000;
export const MAX_IMAGE_BYTES=25*1024*1024;
export const FETCH_TIMEOUT_MS=18_000;
export const HOP_LIMIT=3;
export const INTER_REQUEST_MS=250;
export const REGISTER_RELATIVE_PATH='public/media/imagery-register.json';
export const REGISTER_SCHEMA='aflivra-imagery-v1';
export const MANIFEST_RELATIVE_PATH='public/media/manifest.json';
export const QID_PATTERN=/^Q[1-9]\d{0,9}$/;
// Clasele imaginilor cerute: parcuri (mediu · leisure=park), școli (educatie ·
// amenity=school), farmacii (sanatate · amenity=pharmacy) și instanțe (justitie ·
// amenity=courthouse). Cheia de imagine este întotdeauna un Q-id exact, publicat de
// sursă pe un tag care descrie ENTITATEA rândului: wikidata (entitatea însăși, o
// fotografie a acelui loc) sau brand:wikidata (brandul — etichetat onest ca fotografie
// de brand, niciodată ca fotografie a acelei farmacii). operator:wikidata și
// network:wikidata rămân excluse: fotografia operatorului unui liceu (un minister)
// nu este o fotografie a liceului.
export const IMAGERY_CLASSES={
 park:{category:'mediu',matchKey:'leisure',matchValue:'park',keys:[['wikidata','entity']]},
 school:{category:'educatie',matchKey:'amenity',matchValue:'school',keys:[['wikidata','entity']]},
 pharmacy:{category:'sanatate',matchKey:'amenity',matchValue:'pharmacy',keys:[['wikidata','entity'],['brand:wikidata','brand']]},
 court:{category:'justitie',matchKey:'amenity',matchValue:'courthouse',keys:[['wikidata','entity']]},
};
export const CLASS_ORDER=['park','school','pharmacy','court'];

export function classifyImageryRecords(items){
 const rows=[];
 for(const item of items){
  const tags=item&&item.tags||{};
  for(const cls of CLASS_ORDER){
   const conf=IMAGERY_CLASSES[cls];
   if(!item||!Array.isArray(item.categories)||!item.categories.includes(conf.category)||tags[conf.matchKey]!==conf.matchValue)continue;
   for(const [tag,role] of conf.keys){
    const qid=String(tags[tag]||'').trim();
    if(QID_PATTERN.test(qid)){rows.push({id:item.id,cls,qid,tag,role});break}
   }
   break; // un rând aparține primei clase care îl descrie
  }
 }
 return rows;
}
const propertyValue=(entity,property)=>{
 const statements=entity&&entity.claims&&entity.claims[property];
 if(Array.isArray(statements)&&statements.length){
  const value=statements[0]&&statements[0].mainsnak&&statements[0].mainsnak.datavalue&&statements[0].mainsnak.datavalue.value;
  if(typeof value==='string'&&value.trim())return value.trim();
 }
 return null;
};
export function parseWikidataClaims(payload){
 const out=[],entities=payload&&payload.entities;
 if(!entities||typeof entities!=='object')return out;
 for(const [qid,entity] of Object.entries(entities)){
  const image=propertyValue(entity,'P18'),logo=propertyValue(entity,'P158');
  if(!image&&!logo)continue; // fără revendicare de imagine — rămâne la fel de onest la următoarea tură
  const label=entity&&entity.labels&&(entity.labels.ro&&entity.labels.ro.value||entity.labels.en&&entity.labels.en.value)||qid;
  out.push({qid,label,image:image||logo,claim:image?'P18':'P158'});
 }
 return out;
}
export function parseCommonsImageinfo(payload){
 const out=[],pages=payload&&payload.query&&payload.query.pages;
 if(!pages||typeof pages!=='object')return out;
 const plain=html=>String(html||'').replace(/<[^>]*>/g,'').replace(/&/g,'&').replace(/"/g,'"').replace(/\s+/g,' ').trim();
 for(const page of Object.values(pages)){
  const info=Array.isArray(page.imageinfo)?page.imageinfo[0]:null;
  if(!info)continue; // fișier șters sau mutat la Commons — omis, fără date inventate
  const ext=info.extmetadata||{};
  const title=String(page.title||'').replace(/^File:/,'');
  out.push({title,width:Number(info.width)||null,height:Number(info.height)||null,license:plain(ext.LicenseShortName&&ext.LicenseShortName.value),licenseUrl:String(ext.LicenseUrl&&ext.LicenseUrl.value||'').trim().replace(/^http:\/\//i,'https://'),author:plain(ext.Artist&&ext.Artist.value),objectName:plain(ext.ObjectName&&ext.ObjectName.value)});
 }
 return out;
}
// Garda de origine la descărcare: Special:FilePath poate redirecționa doar în familia de
// gazde a proiectului Wikimedia (upload/thumb .wikimedia.org); o redirecționare spre o
// gazdă străină este refuzată, iar salturile se urmează manual, cu validarea gazdei la
// fiecare pas — runnerul nu devine niciodată un agent de descărcare pentru adrese arbitrare.
const isIpHost=host=>/^\d+(\.\d+){3}$/.test(host)||host.includes(':');
const registrableHost=host=>isIpHost(host)||host.split('.').length<3?host:host.split('.').slice(-2).join('.');
const sameFamily=(host,commonsHost)=>{const family=registrableHost(commonsHost);return host===commonsHost||host.endsWith('.'+family)};
const line=(...parts)=>console.log(parts.join(' '));
const cause=error=>error instanceof Error?error.message:String(error);
const wait=ms=>new Promise(resolve=>{setTimeout(resolve,ms)});
const contentTypes={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/tiff':'tiff'};
const sortedEntries=object=>JSON.stringify(Object.entries(object).sort(([a],[b])=>a<b?-1:a>b?1:0));

async function fetchBounded(url,init){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),init.timeoutMs);
 try{return await fetch(url,{method:'GET',redirect:'manual',headers:init.headers,signal:controller.signal})}
 finally{clearTimeout(timer)}}
async function readBounded(response,maxBytes){
 const declared=Number(response.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>maxBytes)throw Error('răspuns prea mare pentru acest intermediar');
 const reader=response.body&&response.body.getReader();if(!reader)return Buffer.alloc(0);
 const chunks=[];let size=0;
 for(;;){const step=await reader.read();if(step.done)break;size+=step.value.length;
  if(size>maxBytes){try{await reader.cancel()}catch{}throw Error('răspuns prea mare pentru acest intermediar')}
  chunks.push(Buffer.from(step.value))}
 return Buffer.concat(chunks)}
export async function apiJson(url){
 let response;
 try{response=await fetchBounded(url,{headers:{'User-Agent':IMAGERY_UA,Accept:'application/json'},timeoutMs:FETCH_TIMEOUT_MS})}
 catch(error){return {kind:'http',status:0,detail:cause(error)}}
 if(!response.ok){try{await response.body&&response.body.cancel()}catch{}return {kind:'http',status:response.status}}
 try{return {kind:'ok',payload:await response.json()}}
 catch{return {kind:'json'}}}
export async function downloadImage(url,commonsHost){
 let current=url,hops=0;
 for(;;){
  let response;
  try{response=await fetchBounded(current,{headers:{'User-Agent':IMAGERY_UA,Accept:'image/*'},timeoutMs:FETCH_TIMEOUT_MS})}
  catch(error){return {kind:'error',detail:cause(error)}}
  if(response.status>=300&&response.status<400){
   const location=response.headers.get('location');
   try{await response.body&&response.body.cancel()}catch{}
   let target=null;if(location){try{target=new URL(location,current)}catch{}}
   if(!target)return {kind:'error',detail:'redirecționare fără destinație'};
   if(!sameFamily(target.hostname,commonsHost))return {kind:'foreign',host:target.hostname};
   if(++hops>HOP_LIMIT)return {kind:'hops'};
   current=target;continue;
  }
  if(!response.ok){try{await response.body&&response.body.cancel()}catch{}return {kind:'http',status:response.status}}
  const contentType=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const extension=contentTypes[contentType];
  if(!extension){try{await response.body&&response.body.cancel()}catch{}return {kind:'type',contentType}}
  let bytes;
  try{bytes=await readBounded(response,MAX_IMAGE_BYTES)}
  catch(error){return {kind:'error',detail:cause(error)}}
  return {kind:'ok',bytes,extension};
 }
}
export function readCorpusRecords(rootDir){
 // Corpul comis se citește numai cu dovezile de integritate din inventarul locurilor —
 // aceeași regulă pe care o aplică ruta /api/places la rulare: octeți exacți + sha256
 // pe fiecare fragment, înainte de orice contact cu sursele externe.
 const placesManifest=JSON.parse(readFileSync(resolve(rootDir,'public/places/manifest.json'),'utf8'));
 const chunks=placesManifest.chunks&&typeof placesManifest.chunks==='object'?placesManifest.chunks:null;
 if(!chunks)throw Error('inventarul locurilor nu publică dovezile fragmentelor');
 const items=[];
 for(const chunk of Object.keys(chunks).sort()){
  const proof=chunks[chunk],file=resolve(rootDir,'public/places/records/'+chunk+'.json.gz');
  let raw;try{raw=gunzipSync(readFileSync(file))}catch{throw Error('fragmentul '+chunk+' nu poate fi citit')}
  const sha=createHash('sha256').update(raw).digest('hex');
  if(raw.length!==proof.bytes||sha!==proof.sha256)throw Error('dovada sha256 a fragmentului '+chunk+' nu se potrivește cu octeții comiși');
  let parsed;try{parsed=JSON.parse(raw.toString('utf8'))}catch{throw Error('fragmentul '+chunk+' nu este JSON valid')}
  if(!parsed||!Array.isArray(parsed.items))throw Error('fragmentul '+chunk+' nu are lista items');
  items.push(...parsed.items);
 }
 return items;
}
const sourcePageFor=title=>'https://commons.wikimedia.org/wiki/File:'+title.replace(/ /g,'_');
export function buildAssetRow({qid,claim,role,classes,label,title,meta,bytes,sha256,extension,commonsOrigin}){
 const row={app_id:'wiki-'+qid.toLowerCase(),app_file:'/media/wiki-'+qid.toLowerCase()+'.'+extension,qid,claim,role,classes:[...classes],subject:label||meta.objectName||title,title,original_title:title,caption_ro:(label||meta.objectName||title)+(role==='brand'?' · fotografie de brand Wikidata':' · fotografie de entitate Wikidata'),source_page_url:sourcePageFor(title),original_image_url:meta.pageUrl||sourcePageFor(title),downloaded_image_url:commonsOrigin+'/wiki/Special:FilePath/'+encodeURIComponent(title)+'?width='+THUMB_WIDTH,author:meta.author,license:meta.license,license_url:meta.licenseUrl||sourcePageFor(title),attribution:title+' — '+meta.author+' / Wikimedia Commons / '+meta.license,bytes:bytes.length,sha256,retrieval_date:new Date().toISOString().slice(0,10),changes:'Miniatură Special:FilePath '+THUMB_WIDTH+'px; octeții descărcați se publică exact, fără re-encodare; licența originală se aplică.'};
 return row;
}
export async function relayImagery(env=process.env){
 const wikidataApi=(env.AFLIVRA_WIKIDATA_API||'').trim()||WIKIDATA_API_DEFAULT;
 const commonsText=(env.AFLIVRA_COMMONS||'').trim()||COMMONS_DEFAULT;
 const invokedFrom=process.argv[1]||'.';
 const rootDir=(env.AFLIVRA_IMAGERY_ROOT||'').trim()||resolve(dirname(pathToFileURL(invokedFrom).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
 let wikidataUrl,commonsUrl;
 try{
  wikidataUrl=new URL(wikidataApi);if(!['http:','https:'].includes(wikidataUrl.protocol))throw Error('protocol');
  commonsUrl=new URL(commonsText);if(!['http:','https:'].includes(commonsUrl.protocol))throw Error('protocol');
 }catch{line('[config]','Adresele Wikidata ('+wikidataApi+') sau Commons ('+commonsText+') nu sunt adrese http(s) valide — ieșire 1.');return 1}
 const commonsApi=commonsUrl.origin+'/w/api.php',commonsOrigin=commonsUrl.origin;
 const limit=Math.max(0,Math.min(1000,Number.parseInt(env.AFLIVRA_IMAGERY_LIMIT||'',10)||DOWNLOADS_PER_RUN));
 const waveCap=Math.max(0,Number.parseInt(env.AFLIVRA_IMAGERY_WAVE_CAP||'',10)||WAVE_FILE_CAP);
 line('[config]','Corpus '+rootDir+' · Wikidata '+wikidataUrl.origin+' · Commons '+commonsOrigin+' · limită '+limit+' fotografii/tură · plafon de val '+waveCap+'.');
 let corpus;
 try{corpus=readCorpusRecords(rootDir)}
 catch(error){line('[corpus]','Copia comisă nu a trecut verificarea integralității ('+cause(error)+') — ieșire 1 (infrastructura noastră).');return 1}
 const rows=classifyImageryRecords(corpus),byClass={};
 for(const cls of CLASS_ORDER)byClass[cls]=rows.filter(row=>row.cls===cls);
 line('[corpus]',rows.length+' rânduri cu cheie Q-id exactă: '+CLASS_ORDER.map(cls=>cls+' '+byClass[cls].length).join(' · ')+'.');
 const registerPath=resolve(rootDir,REGISTER_RELATIVE_PATH),manifestPath=resolve(rootDir,MANIFEST_RELATIVE_PATH),mediaPath=resolve(rootDir,'public/media');
 let register;
 if(existsSync(registerPath)){
  try{register=JSON.parse(readFileSync(registerPath,'utf8'))}catch{line('[registru]','Registrul imaginilor nu este JSON valid — ieșire 1 (infrastructura noastră).');return 1}
  if(!register||register.schema!==REGISTER_SCHEMA||!Array.isArray(register.assets)||!register.records||typeof register.records!=='object'){line('[registru]','Registrul imaginilor nu are formatul așteptat — ieșire 1 (infrastructura noastră).');return 1}
 }else register={schema:REGISTER_SCHEMA,generatedAt:new Date().toISOString(),source:'Wikidata (P18/P158) · Wikimedia Commons',classes:{},assets:[],records:{}};
 const attestedQids=new Map(register.assets.map(asset=>[asset.qid,asset]));
 const attestedTitles=new Map(register.assets.map(asset=>[asset.title,asset.app_id]));
 const candidates=[],seen=new Set();
 for(const cls of CLASS_ORDER)for(const row of [...byClass[cls]].sort((a,b)=>a.qid.localeCompare(b.qid,undefined,{numeric:true}))){
  if(attestedQids.has(row.qid)||seen.has(row.qid))continue; // un activ pe Q-id; revendicările fără licență se reîncearcă onest la următoarea tură
  seen.add(row.qid);candidates.push(row);
 }
 const capped=candidates.slice(0,QIDS_PER_RUN);
 if(candidates.length>QIDS_PER_RUN)line('[limită]',candidates.length+' chei noi așteaptă: interogăm primele '+QIDS_PER_RUN+' în această tură.');
 if(!capped.length){
  line('[final]','Ciclul de relaie este complet: fiecare cheie Q-id a claselor este atestată deja. 0 fotografii noi în această tură.');
  return 0;
 }
 if(register.assets.length>=waveCap){
  line('[plafon]','Registrul a atins plafonul de '+waveCap+' fișiere al acestei val — 0 descărcări în această tură; plafonul se reevaluează cu fiecare val.');
  return 0;
 }
 // ── Faza 1 (interogare): chei Q-id exacte → revendicări P18/P158 → licențe Commons
 const claimsByQid=new Map(),queried=[];
 for(let at=0;at<capped.length;at+=WIKIDATA_IDS_PER_CALL){
  const batch=capped.slice(at,at+WIKIDATA_IDS_PER_CALL).map(row=>row.qid);
  const params=new URLSearchParams({action:'wbgetentities',ids:batch.join('|'),props:'claims|labels',languages:'ro|en',format:'json'});
  const result=await apiJson(wikidataApi+'?'+params.toString());
  if(result.kind==='http'){line('[wikidata]','API-ul Wikidata a răspuns cu HTTP '+(result.status||'fără răspuns')+' — ieșire 2 (informațional; reia la următoarea tură).');return 2}
  if(result.kind==='json'||!result.payload||typeof result.payload!=='object'){line('[wikidata]','Răspunsul Wikidata nu este JSON valid — ieșire 2 (informațional).');return 2}
  queried.push(...batch);
  for(const claim of parseWikidataClaims(result.payload))claimsByQid.set(claim.qid,claim);
  if(at+WIKIDATA_IDS_PER_CALL<capped.length)await wait(INTER_REQUEST_MS);
 }
 const withClaims=capped.filter(row=>claimsByQid.has(row.qid));
 line('[wikidata]',withClaims.length+' din '+queried.length+' chei au o revendicare de imagine.');
 const metasByTitle=new Map(),unresolved=[...new Set(withClaims.filter(row=>!attestedTitles.has(claimsByQid.get(row.qid).image)).map(row=>claimsByQid.get(row.qid).image))];
 for(let at=0;at<unresolved.length;at+=COMMONS_TITLES_PER_CALL){
  const batch=unresolved.slice(at,at+COMMONS_TITLES_PER_CALL);
  const params=new URLSearchParams({action:'query',prop:'imageinfo',iiprop:'url|size|extmetadata',iiurlwidth:String(THUMB_WIDTH),titles:batch.map(title=>'File:'+title).join('|'),format:'json'});
  const result=await apiJson(commonsApi+'?'+params.toString());
  if(result.kind==='http'){line('[commons]','API-ul Commons a răspuns cu HTTP '+(result.status||'fără răspuns')+' — ieșire 2 (informațional; reia la următoarea tură).');return 2}
  if(result.kind==='json'||!result.payload||typeof result.payload!=='object'){line('[commons]','Răspunsul Commons nu este JSON valid — ieșire 2 (informațional).');return 2}
  for(const meta of parseCommonsImageinfo(result.payload))metasByTitle.set(meta.title,meta);
  if(at+COMMONS_TITLES_PER_CALL<unresolved.length)await wait(INTER_REQUEST_MS);
 }
 const downloads=[],reuses=[],skipped=[],titleOwner=new Map();let carrier=0;
 for(const row of withClaims){
  const claim=claimsByQid.get(row.qid),existingApp=attestedTitles.get(claim.image);
  if(existingApp){reuses.push({row,claim});continue} // garda de dedublare: fișierul Comun e deja atestat
  if(titleOwner.has(claim.image)){reuses.push({row,claim});continue} // același fișier Comun cerut de a doua cheie în această tură
  const meta=metasByTitle.get(claim.image);
  if(!meta){skipped.push({qid:row.qid,title:claim.image,cause:'fără informații de fișier la Commons'});continue}
  if(!meta.license||!meta.author){skipped.push({qid:row.qid,title:claim.image,cause:'fără licență sau autor publicat (extmetadata)'});continue}
  titleOwner.set(claim.image,row.qid);downloads.push({row,claim,meta});
 }
 for(const skip of skipped)line('[omis]',skip.qid+' «'+skip.title+'» — '+skip.cause+'; fără date inventate.');
 if(downloads.length>limit){line('[limită]','Limita de '+limit+' descărcări per tură: livrăm primele '+limit+'; restul la următoarea tură.');carrier=downloads.length-limit;downloads.length=limit}
 const waveRoom=waveCap-register.assets.length;
 if(downloads.length>waveRoom){line('[plafon]','Plafonul de val lasă '+waveRoom+' locuri: livrăm atât; restul la următoarea val.');downloads.length=Math.max(0,waveRoom)}
 // ── Faza 2 (aplicare): miniatura Special:FilePath cu licența_extmetadata atestată
 const applied=[],failures=[];const refused=[];
 for(const download of downloads){
  const url=commonsOrigin+'/wiki/Special:FilePath/'+encodeURIComponent(download.claim.image)+'?width='+THUMB_WIDTH;
  const result=await downloadImage(url,commonsUrl.hostname);
  if(result.kind==='ok'){
   const sha256=createHash('sha256').update(result.bytes).digest('hex');
   const classes=[...new Set(byClass[download.row.cls].filter(r=>r.qid===download.row.qid).map(r=>r.cls))];
   const kind=byClass[download.row.cls].find(r=>r.qid===download.row.qid);
   const asset=buildAssetRow({qid:download.row.qid,claim:download.claim.claim,role:kind.role,classes,label:download.claim.label,title:download.claim.image,meta:download.meta,bytes:result.bytes,sha256,extension:result.extension,commonsOrigin});
   try{writeFileSync(resolve(mediaPath,asset.app_file.replace('/media/','')),result.bytes)}
   catch(error){failures.push({qid:download.row.qid,title:download.claim.image,cause:'scrierea în public/media a eșuat: '+cause(error)});continue}
   applied.push(asset);attestedQids.set(asset.qid,asset);attestedTitles.set(asset.title,asset.app_id);
   line('[atestare]',asset.app_id+' «'+asset.title+'» — '+asset.license+' · '+result.bytes.length+' octeți · '+download.row.cls+'.');
  }
  else if(result.kind==='foreign'){refused.push({qid:download.row.qid,title:download.claim.image,host:result.host});line('[refuzat]',download.row.qid+' «'+download.claim.image+'» → redirecționare spre gazda străină '+result.host+' — octeții nu părăsesc familia Wikimedia.')}
  else failures.push({qid:download.row.qid,title:download.claim.image,cause:result.kind==='http'?'HTTP '+result.status:result.kind==='type'?'tip de conținut nepublicat ('+result.contentType+')':'descărcarea nu a reușit ('+(result.detail||result.kind)+')'});
  if(download!==downloads.at(-1))await wait(INTER_REQUEST_MS);
 }
 for(const failure of failures)line('[omis]',failure.qid+' «'+failure.title+'» — '+failure.cause+'; fără date inventate.');
 if(!applied.length&&!reuses.length){
  if(failures.length||refused.length){line('[final]','Niciuna din '+downloads.length+' descărcări nu a reușit la sursă — fără scrieri parțiale. Ieșire 2 (informațional; reia la următoarea tură).');return 2}
  line('[final]','0 fotografii noi în această tură (chei fără revendicare sau fără licență publicată). Registrul rămâne neschimbat.');
  return 0;
 }
 // Harta rândurilor: fiecare rând al corpusului a cărui cheie e atestată primește activul
 // ei — inclusiv toate farmaciile lanțului care partajează brandul, și cheile a căror
 // revendicare indică un fișier Comun deja atestat de altă cheie.
 const appByQid=new Map(register.assets.map(asset=>[asset.qid,asset.app_id]));
 for(const asset of applied)appByQid.set(asset.qid,asset.app_id);
 for(const row of withClaims){
  if(appByQid.has(row.qid))continue;
  const claim=claimsByQid.get(row.qid);
  if(claim&&attestedTitles.has(claim.image))appByQid.set(row.qid,attestedTitles.get(claim.image));
 }
 const records={};
 for(const row of rows){const appId=appByQid.get(row.qid);if(appId)records[row.id]={a:appId,c:row.cls,t:row.tag}}
 if(sortedEntries(records)===sortedEntries(register.records)&&!applied.length){line('[final]','0 fotografii noi; harta rândurilor rămâne neschimbată.');return 0}
 const classes={};
 for(const cls of CLASS_ORDER)classes[cls]={records:byClass[cls].length,imaged:byClass[cls].filter(row=>appByQid.has(row.qid)).length};
 let manifest;
 try{manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{assets:[]}}
 catch(error){line('[manifest]','manifest.json nu poate fi citit ('+cause(error)+') — ieșire 1.');return 1}
 if(!manifest||!Array.isArray(manifest.assets)){line('[manifest]','manifest.json nu are lista assets — ieșire 1.');return 1}
 const manifestIds=new Set(manifest.assets.map(asset=>asset.app_id));
 for(const asset of applied)if(!manifestIds.has(asset.app_id))manifest.assets.push(asset);
 try{
 writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 writeFileSync(registerPath,JSON.stringify({schema:REGISTER_SCHEMA,generatedAt:new Date().toISOString(),source:register.source||'Wikidata (P18/P158) · Wikimedia Commons',classes,assets:[...register.assets,...applied.filter(asset=>!register.assets.some(existing=>existing.app_id===asset.app_id))],records},null,2)+'\n');
}catch(error){line('[scriere]','Registrul sau manifestul nu au putut fi scrise ('+cause(error)+') — ieșire 1.');return 1}
 line('[final]',applied.length+' fotografii atestate această tură ('+applied.map(a=>a.app_id).join(', ')+') · '+reuses.length+' dedublări reutilizate · '+Object.keys(records).length+' rânduri hărțiuite în registru'+(carrier?'; '+carrier+' la următoarea tură':'')+'.');
 return 0;
}
const invokedDirectly=import.meta.url===pathToFileURL(process.argv[1]||'').href;
if(invokedDirectly){try{process.exitCode=await relayImagery()}catch(error){console.error('[relaie] Eroare neașteptată: '+cause(error));process.exitCode=1}}
