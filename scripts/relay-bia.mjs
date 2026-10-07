import {pathToFileURL} from 'node:url';

export const BIA_SOURCE_BASE_DEFAULT='https://bucharestairports.ro';
export const BIA_FLIGHTS_PATH='/wp-json/fds/v1/flights';
export const SEED_ROUTE='/api/seed/bia';
export const SEED_BASE_DEFAULT='https://aflivra.brebu.workers.dev';
export const RELAY_UA='Aflivra/1.0 gh-relay';
export const SOURCE_ACCEPT='application/json';
export const MAX_BODY_BYTES=5_000_000;
export const FETCH_TIMEOUT_MS=18_000,POST_TIMEOUT_MS=30_000;
export const BIA_AIRPORTS=['henri-coanda','baneasa-aurel-vlaicu'];

// BIA relay business rule: the airport protects its day board with a browser challenge
// that rejects every server-side caller, including the Workers egress, so this script —
// the scheduled GitHub Actions tour — fetches each airport's board with the app loader's
// own request interface (same URL, same Accept header) and hands the raw text to the seed
// route, which publishes it through the same parser and setter the reader uses. Both
// boards are fetched before any POST: one tour publishes what it could fetch, and a
// per-airport failure is reported honestly, never masked as an empty board.
const line=(...parts)=>console.log(parts.join(' '));
const cause=error=>error instanceof Error?error.message:String(error);

async function fetchBounded(url,init){
  // Every request is timeout-bounded through AbortController: a hung source or a hung seed
  // route must never pin the tour open.
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),init.timeoutMs);
  try{return await fetch(url,{method:init.method||'GET',headers:init.headers,body:init.body,signal:controller.signal})}
  finally{clearTimeout(timer)}}

async function readBounded(response){
  // The relay carries at most the board size the seed route itself accepts (BOARD_CAP).
  const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw Error('răspuns prea mare pentru acest intermediar');
  const reader=response.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let size=0,text='';
  for(;;){const step=await reader.read();if(step.done)break;size+=step.value.length;if(size>MAX_BODY_BYTES){try{await reader.cancel()}catch{}throw Error('răspuns prea mare pentru acest intermediar')}text+=decoder.decode(step.value,{stream:true})}
  return text+decoder.decode()}

async function postBoard(seedBase,token,airport,body){
  let response;
  try{response=await fetchBounded(seedBase+SEED_ROUTE,{method:'POST',headers:{'User-Agent':RELAY_UA,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({airport,body}),timeoutMs:POST_TIMEOUT_MS})}
  catch(error){return {kind:'unreachable',detail:cause(error)}}
  if(response.status===401||response.status===403)return {kind:'auth',status:response.status};
  if(response.status===400||response.status===422){let message='';try{message=String((await response.json()).error||'')}catch{}return {kind:'rejected',status:response.status,message}}
  if(!response.ok){try{await response.body?.cancel()}catch{}return {kind:'http',status:response.status}}
  try{return {kind:'ok',status:response.status,payload:await response.json()}}
  catch{return {kind:'json',status:response.status}}
}
// Piesa de predare este partajată cu pasul de browser (fetch-bia-browser.mjs): aceeași
// forma {airport, body}, același Bearer, aceleași clase de ieșire — un singur contract.
export {postBoard};
export const biaBoardUrl=(base,airport)=>base+BIA_FLIGHTS_PATH+'?'+new URLSearchParams({airport,language:'ro'});

export async function relayBia(env=process.env){
  const sourceBase=((env.AFLIVRA_BIA_SOURCE_BASE||'').trim()||BIA_SOURCE_BASE_DEFAULT).replace(/\/+$/,'');
  const seedBase=((env.AFLIVRA_SEED_BASE||'').trim()||SEED_BASE_DEFAULT).replace(/\/+$/,'');
  const token=(env.AFLIVRA_REFRESH_TOKEN||'').trim();
  if(!token){line('[config]','Lipsește AFLIVRA_REFRESH_TOKEN — relaia nu se poate autentifica la ruta de depunere; nimic nu a fost contactat. Ieșire 1.');return 1}
  line('[config]','Panourile '+BIA_AIRPORTS.join(', ')+' de la '+sourceBase+' → depunere '+seedBase+SEED_ROUTE+'.');
  // Both boards are fetched before any POST: a failing airport never blocks the healthy
  // one, and the tour publishes everything it could fetch in one pass.
  const boards=[];
  for(const airport of BIA_AIRPORTS){
   const url=biaBoardUrl(sourceBase,airport);
   try{
    const response=await fetchBounded(url,{headers:{'User-Agent':RELAY_UA,Accept:SOURCE_ACCEPT},timeoutMs:FETCH_TIMEOUT_MS});
    if(!response.ok){try{await response.body?.cancel()}catch{}line('[sursă]',airport,'a răspuns cu HTTP '+response.status+' — panoul acestui aeroport nu se predă în această tură; celălalt continuă.');boards.push({airport,body:null});continue}
    const body=await readBounded(response);line('[sursă]',airport,'→ HTTP '+response.status+', '+body.length+' caractere.');
    // Un panou gol este valid: un aeroport cu trafic redus poate să nu aibă curse acum — se
    // predă oricum, parserul rutei servește onest sosirile și plecările goale.
    if(!body.length){line('[sursă]',airport,'a răspuns cu un panou gol — se predă onest, fără curse inventate.')}
    boards.push({airport,body});
   }catch(error){line('[sursă]',airport,'nu a putut fi citit ('+cause(error)+') — panoul acestui aeroport nu se predă în această tură; celălalt continuă.');boards.push({airport,body:null})}}
  const fetched=boards.filter(board=>board.body!==null);
  if(!fetched.length){line('[final]','Niciun panou al aeroporturilor nu a putut fi citit în această tură — fără listă goală la rută. Ieșire 2 (informațional; reia la următoarea tură programată).');return 2}
  if(fetched.length<boards.length)line('[!]','Se predă '+fetched.length+' din '+boards.length+' panouri — panoul lipsă este raportat onest, nu mascat.');
  let published=0,rejected=false;
  for(const {airport,body} of fetched){
   const delivered=await postBoard(seedBase,token,airport,body);
   if(delivered.kind==='unreachable'){line('[predare]',airport,seedBase+SEED_ROUTE,'nu a putut fi contactată ('+delivered.detail+') — ieșire 1.');return 1}
   if(delivered.kind==='auth'){line('[predare]','Autentificare respinsă la '+seedBase+SEED_ROUTE+' (HTTP '+delivered.status+') — ieșire 1.');return 1}
   if(delivered.kind==='rejected'){line('[predare]',airport,'Ruta a respins panoul (HTTP '+delivered.status+')'+(delivered.message?': «'+delivered.message+'»':'')+' — ieșire 2 (informațional; forma panoului s-a schimbat, iar mesajul numește ce a sosit — repară parserul cu un panou real capturat).');rejected=true;continue}
   if(delivered.kind==='http'){line('[predare]',airport,seedBase+SEED_ROUTE,'a răspuns cu HTTP '+delivered.status+' — ieșire 1.');return 1}
   const payload=delivered.kind==='ok'?delivered.payload:null;
   if(delivered.kind==='json'||!payload||typeof payload!=='object'||payload.result!=='ok'){line('[predare]',airport,'Răspunsul rutei nu poartă confirmarea așteptată — contract încălcat, ieșire 1.');return 1}
   line('[predare]',airport,'HTTP '+delivered.status+' — sosiri '+payload.arrivals+', plecări '+payload.departures+(payload.dropped?', rânduri omise '+payload.dropped:'')+'.');
   published++}
  if(rejected){line('[final]','Relaia s-a încheiat cu un panou respins de rută — forma panoului s-a schimbat; ieșire 2 (informațional).');return 2}
  if(published<boards.length){line('[final]','Relaia completă cu avarii: '+published+' din '+boards.length+' panouri publicate de rută — ieșire 2 (informațional; aeroportul căzut se reia la următoarea tură).');return 2}
  line('[final]','Relaia completă: '+published+' din '+boards.length+' panouri publicate de rută.');
  return 0}

const invokedDirectly=import.meta.url===pathToFileURL(process.argv[1]||'').href;
if(invokedDirectly){try{process.exitCode=await relayBia()}catch(error){console.error('[relaie] Eroare neașteptată: '+cause(error));process.exitCode=1}}
