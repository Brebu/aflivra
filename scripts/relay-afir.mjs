import {pathToFileURL} from 'node:url';

export const AFIR_FEED_URL_DEFAULT='https://www.afir.ro/';
export const SEED_ROUTE='/api/seed/afir';
export const SEED_BASE_DEFAULT='https://aflivra.brebu.workers.dev';
export const RELAY_UA='Aflivra/1.0 gh-relay';
export const SOURCE_ACCEPT='application/json, application/rss+xml, application/xml, text/xml, text/html;q=0.8';
export const MAX_ARTICLES_PER_RUN=10;
export const MAX_BODY_BYTES=5_000_000;
export const FETCH_TIMEOUT_MS=18_000,POST_TIMEOUT_MS=30_000;

// AFIR relay business rule: afir.ro rejects the Cloudflare Workers egress network but serves
// ordinary runners, so this script — the scheduled GitHub Actions tour — fetches the feed page
// and only the article pages the seed route asks for, handing over the same raw bytes (same
// URL, same Accept header) the app's own afirLoader would read.
const line=(...parts)=>console.log(parts.join(' '));
const cause=error=>error instanceof Error?error.message:String(error);

async function fetchBounded(url,init){
 // Every request is timeout-bounded through AbortController: a hung source or a hung seed
 // route must never pin the tour open.
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),init.timeoutMs);
 try{return await fetch(url,{method:init.method||'GET',headers:init.headers,body:init.body,signal:controller.signal})}
 finally{clearTimeout(timer)}}

async function readBounded(response){
 // The relay carries at most the body size the app's own connector accepts.
 const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw Error('răspuns prea mare pentru acest intermediar');
 const reader=response.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let size=0,text='';
 for(;;){const step=await reader.read();if(step.done)break;size+=step.value.length;if(size>MAX_BODY_BYTES){try{await reader.cancel()}catch{}throw Error('răspuns prea mare pentru acest intermediar')}text+=decoder.decode(step.value,{stream:true})}
 return text+decoder.decode()}

async function postPhase(seedBase,token,payload){
 let response;
 try{response=await fetchBounded(seedBase+SEED_ROUTE,{method:'POST',headers:{'User-Agent':RELAY_UA,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),timeoutMs:POST_TIMEOUT_MS})}
 catch(error){return {kind:'unreachable',detail:cause(error)}}
 if(response.status===401||response.status===403)return {kind:'auth',status:response.status};
 if(response.status===400||response.status===422){let message='';try{message=String((await response.json()).error||'')}catch{}return {kind:'rejected',status:response.status,message}}
 if(!response.ok){try{await response.body?.cancel()}catch{}return {kind:'http',status:response.status}}
 try{return {kind:'ok',status:response.status,payload:await response.json()}}
 catch{return {kind:'json',status:response.status}}}

export async function relayAfir(env=process.env){
 const feedUrlText=(env.AFLIVRA_AFIR_SOURCE_URL||'').trim()||AFIR_FEED_URL_DEFAULT;
 const seedBase=((env.AFLIVRA_SEED_BASE||'').trim()||SEED_BASE_DEFAULT).replace(/\/+$/,'');
 const token=(env.AFLIVRA_REFRESH_TOKEN||'').trim();
 let feedUrl;try{feedUrl=new URL(feedUrlText);if(!['http:','https:'].includes(feedUrl.protocol))throw Error('protocol')}catch{line('[config]','Adresa sursei AFIR nu este o adresă http(s) validă:',feedUrlText.slice(0,200),'— ieșire 1.');return 1}
 if(!token){line('[config]','Lipsește AFLIVRA_REFRESH_TOKEN — relaia nu se poate autentifica la ruta de depunere; nimic nu a fost contactat. Ieșire 1.');return 1}
 line('[config]','Sursă '+feedUrl.href+' → depunere '+seedBase+SEED_ROUTE+'.');
 let feedBody;
 try{
  const response=await fetchBounded(feedUrl.href,{headers:{'User-Agent':RELAY_UA,Accept:SOURCE_ACCEPT},timeoutMs:FETCH_TIMEOUT_MS});
  if(!response.ok){try{await response.body?.cancel()}catch{};line('[sursă]',feedUrl.href,'a răspuns cu HTTP '+response.status+' — ieșire 2 (informațional; reia la următoarea tură).');return 2}
  feedBody=await readBounded(response);line('[sursă]',feedUrl.href,'→ HTTP '+response.status+', '+feedBody.length+' caractere.');
 }catch(error){line('[sursă]',feedUrl.href,'nu a putut fi citită ('+cause(error)+') — ieșire 2 (informațional; reia la următoarea tură).');return 2}
 const seed=await postPhase(seedBase,token,{phase:'feed',body:feedBody});
 if(seed.kind==='unreachable'){line('[predare flux]',seedBase+SEED_ROUTE,'nu a putut fi contactată ('+seed.detail+') — ieșire 1.');return 1}
 if(seed.kind==='auth'){line('[predare flux]','Autentificare respinsă la '+seedBase+SEED_ROUTE+' (HTTP '+seed.status+') — ieșire 1.');return 1}
 if(seed.kind==='rejected'){line('[predare flux]','Ruta a respins conținutul sursei (HTTP '+seed.status+')'+(seed.message?': «'+seed.message+'»':'')+' — ieșire 2 (informațional; conținutul paginii afir.ro a fost respins la validarea rutei).');return 2}
 if(seed.kind==='http'){line('[predare flux]',seedBase+SEED_ROUTE,'a răspuns cu HTTP '+seed.status+' — ieșire 1.');return 1}
 const seedPayload=seed.kind==='ok'?seed.payload:null;
 if(seed.kind==='json'||!seedPayload||typeof seedPayload!=='object'||!Array.isArray(seedPayload.want)){line('[predare flux]','Răspunsul rutei nu poartă lista want — contract încălcat, ieșire 1.');return 1}
 const want=seedPayload.want;
 line('[predare flux]','HTTP '+seed.status+' — rută cere '+want.length+' articole.');
 const wanted=[],rejected=[],seen=new Set();
 for(const entry of want){
  // The relay only carries pages from the origin it fetched the feed from: a broken or
  // compromised seed route must not turn this runner into a proxy for arbitrary addresses.
  const candidate=typeof entry==='string'?entry:'';
  let url=null;if(candidate){try{url=new URL(candidate)}catch{}}
  if(!url||url.origin!==feedUrl.origin){rejected.push(String(entry).slice(0,200));continue}
  if(seen.has(url.href))continue;seen.add(url.href);wanted.push(url.href)}
 for(const entry of rejected)line('[refuzat]','Ruta a cerut o adresă din afara sursei:',entry+' — ignorată, raportată la final.');
 const capped=wanted.slice(0,MAX_ARTICLES_PER_RUN);
 if(wanted.length>MAX_ARTICLES_PER_RUN)line('[limită]','Ruta a cerut '+wanted.length+' articole; această tură livrează primele '+MAX_ARTICLES_PER_RUN+' — restul la următoarea tură.');
 const items=[];
 for(const url of capped){
  try{
   const response=await fetchBounded(url,{headers:{'User-Agent':RELAY_UA,Accept:SOURCE_ACCEPT},timeoutMs:FETCH_TIMEOUT_MS});
   if(!response.ok){try{await response.body?.cancel()}catch{};line('[articol]',new URL(url).pathname,'→ HTTP '+response.status+' — omis, fără date inventate.');continue}
   const html=await readBounded(response);items.push({url,html});line('[articol]',new URL(url).pathname,'→ HTTP '+response.status+', '+html.length+' caractere.');
  }catch(error){line('[articol]',new URL(url).pathname,'nu a putut fi citit ('+cause(error)+') — omis.');continue}}
 if(!items.length&&capped.length===0){line('[final]','Ruta nu a cerut articole — ciclul de relaie este complet.');return rejected.length?1:0}
 if(!items.length){const code=rejected.length?1:2;line('[predare articole]','Nicio dintre cele '+capped.length+' pagini cerute nu a putut fi citită de la sursă — fără listă goală la rută. Ieșire '+code+(code===2?' (informațional; reia la următoarea tură).':'.'));return code}
 const delivered=await postPhase(seedBase,token,{phase:'articles',items});
 if(delivered.kind==='unreachable'){line('[predare articole]',seedBase+SEED_ROUTE,'nu a putut fi contactată ('+delivered.detail+') — ieșire 1.');return 1}
 if(delivered.kind==='auth'){line('[predare articole]','Autentificare respinsă la '+seedBase+SEED_ROUTE+' (HTTP '+delivered.status+') — ieșire 1.');return 1}
 if(delivered.kind==='rejected'){line('[predare articole]','Ruta a respins livrarea (HTTP '+delivered.status+')'+(delivered.message?': «'+delivered.message+'»':'')+' — ieșire 2 (informațional).');return rejected.length?1:2}
 if(delivered.kind==='http'){line('[predare articole]',seedBase+SEED_ROUTE,'a răspuns cu HTTP '+delivered.status+' — ieșire 1.');return 1}
 const deliveredPayload=delivered.kind==='ok'?delivered.payload:null;
 if(delivered.kind==='json'||!deliveredPayload||typeof deliveredPayload!=='object'||!Array.isArray(deliveredPayload.stored)||!Array.isArray(deliveredPayload.failed)){line('[predare articole]','Răspunsul rutei nu poartă listele stored și failed — contract încălcat, ieșire 1.');return 1}
 const storedUrls=deliveredPayload.stored.filter(entry=>typeof entry==='string');
 const failedEntries=deliveredPayload.failed.filter(entry=>entry&&typeof entry==='object'&&typeof entry.url==='string');
 line('[predare articole]','HTTP '+delivered.status+' — stored='+storedUrls.length+(failedEntries.length?', failed='+failedEntries.length:'')+(String(deliveredPayload.result||'')==='partial'?' (parțial)':'')+'.');
 for(const failure of failedEntries)line('[eșuat]',failure.url.replace(/^https?:\/\/[^/]+/,'')+' — '+(typeof failure.error==='string'?failure.error:'respins de rută'));
 if(rejected.length){line('[final]','Relaia s-a încheiat, dar ruta a cerut '+rejected.length+' adresă(e) din afara sursei — ieșire 1 (verifică ruta '+SEED_ROUTE+').');return 1}
 if(!storedUrls.length&&failedEntries.length){line('[final]','Ruta a respins toate cele '+items.length+' pagini livrate — ieșire 2 (informațional; reia la următoarea tură).');return 2}
 if(storedUrls.length<items.length)line('[final]','Relaia completă cu avarii: '+storedUrls.length+' din '+items.length+' articole publicate de rută.');
 else line('[final]','Relaia completă: '+storedUrls.length+' din '+items.length+' articole publicate de rută.');
 return 0}

const invokedDirectly=import.meta.url===pathToFileURL(process.argv[1]||'').href;
if(invokedDirectly){try{process.exitCode=await relayAfir()}catch(error){console.error('[relaie] Eroare neașteptată: '+cause(error));process.exitCode=1}}
