import {pathToFileURL} from 'node:url';
import {BIA_SOURCE_BASE_DEFAULT,BIA_AIRPORTS,biaBoardUrl,postBoard,SEED_BASE_DEFAULT,SEED_ROUTE,SOURCE_ACCEPT,MAX_BODY_BYTES} from './relay-bia.mjs';

export const CHALLENGE_WAIT_MS_DEFAULT=45_000,CHALLENGE_POLL_MS=2_500,NAV_TIMEOUT_MS=20_000;

// Pasul de browser al relaiei BIA, regula de business: aeroportul își apără panoul cu un
// test de browser (Cloudflare) care respinge orice server — inclusiv runnerul cu fetch
// simplu (clasa 2 a relației obișnuite). Acest pas rulează același URL printr-un
// chromium headless cu versiunea fixată a depozitului (@playwright/test din package.json
// + pnpm-lock; CI instalează chromiumul lui): pagina navigată poartă testul de browser,
// iar cererile de context refolosesc cookie-urile trecute pentru panoul brut, cu același
// contract de predare {airport, body} ca relația simplă. Verificarea onestă a primei ture
// reale: dacă testul nu trece nici headless, așteptarea mărginită renunță cu clasa 2 —
// tura de CI înregistrează avertisment, iar panoul rămâne la nota onestă de intermediar.
const line=(...parts)=>console.log(parts.join(' '));
const cause=error=>error instanceof Error?error.message:String(error);

const importChromium=async()=>{try{const {chromium}=await import('@playwright/test');return chromium}catch{return null}};

async function boardViaContext(context,url){
  // Cererea de context păstrează UA-ul browserului: trecerea challenge-ului este legată
  // de sesiunea paginii, nu de agentul relației — a schimba UA-ul aici ar risca respingerea
  // cookie-ului tocmai trecut.
  const response=await context.request.get(url,{headers:{Accept:SOURCE_ACCEPT}}).catch(error=>({__fetchError:error}));
  if(response.__fetchError)return {ok:false,detail:cause(response.__fetchError)};
  if(!response.ok())return {ok:false,detail:'HTTP '+response.status()};
  const type=String(response.headers()['content-type']||'');
  if(!/json/i.test(type))return {ok:false,detail:'răspuns fără conținut JSON'};
  const body=await response.text();
  if(body.length>MAX_BODY_BYTES)return {ok:false,detail:'răspuns prea mare pentru acest intermediar'};
  return {ok:true,body};
}

export async function fetchBiaBoards(env=process.env){
 const sourceBase=((env.AFLIVRA_BIA_SOURCE_BASE||'').trim()||BIA_SOURCE_BASE_DEFAULT).replace(/\/+$/,'');
 const seedBase=((env.AFLIVRA_SEED_BASE||'').trim()||SEED_BASE_DEFAULT).replace(/\/+$/,'');
 const token=(env.AFLIVRA_REFRESH_TOKEN||'').trim();
 if(!token){line('[config]','Lipsește AFLIVRA_REFRESH_TOKEN — pasul de browser nu se poate autentifica la ruta de depunere; nimic nu a fost contactat. Ieșire 1.');return 1}
 const waits=Number(env.AFLIVRA_BIA_CHALLENGE_WAIT_MS),waitMs=Number.isFinite(waits)&&waits>0?waits:CHALLENGE_WAIT_MS_DEFAULT;
 line('[config]','Panourile '+BIA_AIRPORTS.join(', ')+' de la '+sourceBase+', prin browser headless → depunere '+seedBase+SEED_ROUTE+'.');
 const chromium=await importChromium();
 if(!chromium){line('[config]','Lipsește @playwright/test (versiunea fixată a depozitului) — pasul de browser nu poate porni; instalează dependențele depozitului (corepack pnpm install). Ieșire 1.');return 1}
 let browser;
 try{browser=await chromium.launch({headless:true})}
 catch(error){line('[browser]','Chromiumul fixat nu a putut porni ('+cause(error)+') — pasul de browser nu rulează. Ieșire 1.');return 1}
 let boards;
 try{
  const context=await browser.newContext(),page=await context.newPage();
  try{
   // Trecerea challenge-ului se face pe adresa primului aeroport: pagina navigată rulează
   // testul de browser, iar cererea de context verifică dacă sesiunea a trecut. Așteptarea
   // este mărginită — la deadline tura renunță onest, cu clasa 2.
   const firstUrl=biaBoardUrl(sourceBase,BIA_AIRPORTS[0]),deadline=Date.now()+waitMs;
   let cleared=false;
   for(;;){
    const response=await page.goto(firstUrl,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT_MS}).catch(()=>null);
    const probe=await boardViaContext(context,firstUrl);
    if(probe.ok){cleared=true;line('[browser]','Testul de browser al aeroportului a trecut (navigarea a ajuns la HTTP '+(response?response.status():'?')+').');break}
    if(Date.now()+CHALLENGE_POLL_MS>deadline){line('[browser]','Testul de browser al aeroportului nu a trecut în timpul alocat ('+Math.round(waitMs/1000)+' s, ultima navigare: '+(response?response.status():'fără răspuns')+') — panourile nu se pot citi pe această cale în această tură.');break}
    await page.waitForTimeout(CHALLENGE_POLL_MS)}
   if(!cleared)return 2;
   // Sesiunea trecută servește ambele panouri: fiecare aeroport are raportul lui onest,
   // avaria unuia nu blochează celălalt — ca la relația simplă.
   boards=[];
   for(const airport of BIA_AIRPORTS){
    const read=await boardViaContext(context,biaBoardUrl(sourceBase,airport));
    if(!read.ok){line('[sursă]',airport,'nu a putut fi citit prin browser ('+read.detail+') — panoul acestui aeroport nu se predă în această tură; celălalt continuă.');boards.push({airport,body:null});continue}
    line('[sursă]',airport,'→ panou prin browser, '+read.body.length+' caractere.');
    if(!read.body.length)line('[sursă]',airport,'a răspuns cu un panou gol — se predă onest, fără curse inventate.');
    boards.push({airport,body:read.body})}
  }finally{await context.close().catch(()=>{})}
 }finally{await browser.close().catch(()=>{})}
 const fetched=boards.filter(board=>board.body!==null);
 if(!fetched.length){line('[final]','Niciun panou al aeroporturilor nu a putut fi citit nici prin browser în această tură — fără listă goală la rută. Ieșire 2 (informațional; reia la următoarea tură programată).');return 2}
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
 if(rejected){line('[final]','Pasul de browser s-a încheiat cu un panou respins de rută — forma panoului s-a schimbat; ieșire 2 (informațional).');return 2}
 if(published<boards.length){line('[final]','Pasul de browser s-a încheiat cu avarii: '+published+' din '+boards.length+' panouri publicate de rută — ieșire 2 (informațional; aeroportul căzut se reia la următoarea tură).');return 2}
 line('[final]','Pasul de browser complet: '+published+' din '+boards.length+' panouri publicate de rută.');
 return 0}

const invokedDirectly=import.meta.url===pathToFileURL(process.argv[1]||'').href;
if(invokedDirectly){try{process.exitCode=await fetchBiaBoards()}catch(error){console.error('[browser] Eroare neașteptată: '+cause(error));process.exitCode=1}}
