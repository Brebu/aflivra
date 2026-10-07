import {pathToFileURL} from 'node:url';

export const ADSB_BASE_DEFAULT='https://api.adsb.lol';
export const SEED_ROUTE='/api/seed/flights';
export const SEED_BASE_DEFAULT='https://aflivra.brebu.workers.dev';
export const RELAY_UA='Aflivra/1.0 gh-relay';
export const SOURCE_ACCEPT='application/json';
export const MAX_BODY_BYTES=5_000_000;
export const FETCH_TIMEOUT_MS=12_000,POST_TIMEOUT_MS=30_000;
// Cele patru puncte fixe de acoperire și raza de 250 NM sunt constantele propriului
// încărcător al aplicației (lib/live/flights.ts): tura citește exact aceleași cereri
// pe care le-ar citi încărcătorul, iar verifica-relay-flights.mjs le îngheață în paritate.
export const ADSB_POINTS=[[47.5,22.75],[47.5,28.25],[44.5,22.75],[44.5,28.25]];
export const ADSB_DIST=250;
export const adsbCoverageUrl=(base,lat,lon)=>base+'/v2/lat/'+lat+'/lon/'+lon+'/dist/'+ADSB_DIST;

// Relaia avioanelor, regula de business: fluxul adsb.lol servește egress-ul rezidențial,
// dar respinge rețeaua Cloudflare Workers a serverului cu 429/503 (clasa AFIR). Tura
// programată GitHub Actions citește aceleași patru cereri fixe de acoperire națională
// pe care le citește încărcătorul aplicației și predă textele brute rutei de depunere,
// care le publică prin exact parserul și fuziunea încărcătorului, la cheia flights:adsb.
// Tura este fail-closed, ca și încărcătorul: dacă un singur punct de acoperire eșuează,
// tura nu predă nimic — un cadran tăcut nu se publică niciodată ca spațiu aerian întreg.
const line=(...parts)=>console.log(parts.join(' '));
const cause=error=>error instanceof Error?error.message:String(error);

async function fetchBounded(url,init){
  // Every request is timeout-bounded through AbortController: a hung source or a hung seed
  // route must never pin the tour open. The per-query bound mirrors the loader's own 12 s cap.
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),init.timeoutMs);
  try{return await fetch(url,{method:init.method||'GET',headers:init.headers,body:init.body,signal:controller.signal})}
  finally{clearTimeout(timer)}}

async function readBounded(response){
  // The relay carries at most the response size the app's own connector accepts (5 MB).
  const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw Error('răspuns prea mare pentru acest intermediar');
  const reader=response.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let size=0,text='';
  for(;;){const step=await reader.read();if(step.done)break;size+=step.value.length;if(size>MAX_BODY_BYTES){try{await reader.cancel()}catch{}throw Error('răspuns prea mare pentru acest intermediar')}text+=decoder.decode(step.value,{stream:true})}
  return text+decoder.decode()}

async function postBoards(seedBase,token,boards){
  let response;
  try{response=await fetchBounded(seedBase+SEED_ROUTE,{method:'POST',headers:{'User-Agent':RELAY_UA,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({boards}),timeoutMs:POST_TIMEOUT_MS})}
  catch(error){return {kind:'unreachable',detail:cause(error)}}
  if(response.status===401||response.status===403)return {kind:'auth',status:response.status};
  if(response.status===400||response.status===422){let message='';try{message=String((await response.json()).error||'')}catch{}return {kind:'rejected',status:response.status,message}}
  if(!response.ok){try{await response.body?.cancel()}catch{}return {kind:'http',status:response.status}}
  try{return {kind:'ok',status:response.status,payload:await response.json()}}
  catch{return {kind:'json',status:response.status}}
}

export async function relayFlights(env=process.env){
  const sourceBase=((env.AFLIVRA_ADSB_SOURCE_BASE||'').trim()||ADSB_BASE_DEFAULT).replace(/\/+$/,'');
  const seedBase=((env.AFLIVRA_SEED_BASE||'').trim()||SEED_BASE_DEFAULT).replace(/\/+$/,'');
  const token=(env.AFLIVRA_REFRESH_TOKEN||'').trim();
  if(!token){line('[config]','Lipsește AFLIVRA_REFRESH_TOKEN — relaia nu se poate autentifica la ruta de depunere; nimic nu a fost contactat. Ieșire 1.');return 1}
  line('[config]','Cele patru cereri de acoperire de la '+sourceBase+' → depunere '+seedBase+SEED_ROUTE+'.');
  // Toate cele patru puncte se citesc înainte de verdict, ca la încărcător: primul punct
  // căzut nu oprește celelalte (fiecare are raportul lui onest în jurnal), dar orice
  // cădere oprește predarea — fără cadran tăcut.
  const boards=[];let failed=false;
  for(const [lat,lon] of ADSB_POINTS){
    const url=adsbCoverageUrl(sourceBase,lat,lon);
    try{
      const response=await fetchBounded(url,{headers:{'User-Agent':RELAY_UA,Accept:SOURCE_ACCEPT},timeoutMs:FETCH_TIMEOUT_MS});
      if(!response.ok){try{await response.body?.cancel()}catch{}line('[sursă]','punctul '+lat+', '+lon+' a răspuns cu HTTP '+response.status+' — fără cadran tăcut, tura nu predă nimic.');failed=true;boards.push(null);continue}
      const body=await readBounded(response);line('[sursă]','punctul '+lat+', '+lon+' → HTTP '+response.status+', '+body.length+' caractere.');
      boards.push(body);
    }catch(error){line('[sursă]','punctul '+lat+', '+lon+' nu a putut fi citit ('+cause(error)+') — fără cadran tăcut, tura nu predă nimic.');failed=true;boards.push(null)}}
   if(failed){line('[final]','Cel puțin un punct de acoperire a eșuat în această tură — fără listă parțială la rută. Ieșire 2 (informațional; reia la următoarea tură programată, săptămânal).');return 2}
  line('[sursă]','Cele patru răspunsuri de acoperire au fost citite integral — fuziunea o face ruta de depunere, prin logica încărcătorului.');
  const delivered=await postBoards(seedBase,token,boards);
  if(delivered.kind==='unreachable'){line('[predare]',seedBase+SEED_ROUTE,'nu a putut fi contactată ('+delivered.detail+') — ieșire 1.');return 1}
  if(delivered.kind==='auth'){line('[predare]','Autentificare respinsă la '+seedBase+SEED_ROUTE+' (HTTP '+delivered.status+') — ieșire 1.');return 1}
  if(delivered.kind==='rejected'){line('[predare]','Ruta a respins tura (HTTP '+delivered.status+')'+(delivered.message?': «'+delivered.message+'»':'')+' — ieșire 2 (informațional; forma fluxului s-a schimbat, iar mesajul numește ce a sosit — repară parserul cu un răspuns real capturat).');return 2}
  if(delivered.kind==='http'){line('[predare]',seedBase+SEED_ROUTE,'a răspuns cu HTTP '+delivered.status+' — ieșire 1.');return 1}
  const payload=delivered.kind==='ok'?delivered.payload:null;
  if(delivered.kind==='json'||!payload||typeof payload!=='object'||payload.result!=='ok'){line('[predare]','Răspunsul rutei nu poartă confirmarea așteptată — contract încălcat, ieșire 1.');return 1}
  line('[predare]','HTTP '+delivered.status+' — aeronave '+payload.aircraft+', adrese Mode-S distincte '+payload.hexes+'.');
  line('[final]','Relaia completă: cele patru răspunsuri de acoperire fuzionate și publicate la cheia flights:adsb.');
  return 0}

const invokedDirectly=import.meta.url===pathToFileURL(process.argv[1]||'').href;
if(invokedDirectly){try{process.exitCode=await relayFlights()}catch(error){console.error('[relaie] Eroare neașteptată: '+cause(error));process.exitCode=1}}
