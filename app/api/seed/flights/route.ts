import {env} from 'cloudflare:workers';
import {createHash,timingSafeEqual} from 'node:crypto';
import {adsbFlightsLoader,parseAdsbFlights,mergeAdsbBoards} from '@/lib/live/flights';
import type {Loaded} from '@/lib/live/types';
import {publishLoaded,type Row} from '@/lib/live/cache';
export const dynamic='force-dynamic';
// Tokenul se compară pe rezumatul SHA-256 al ambelor valori, în timp constant: nici lungimea, nici prima
// poziție diferită nu scurg informație despre secretul din mediul de execuție.
const tokenValid=(token:string,header:string|null)=>{if(!token||!header?.startsWith('Bearer '))return false;const digest=(value:string)=>createHash('sha256').update(value).digest();return timingSafeEqual(digest(header.slice(7)),digest(token))};
const BOARD_CAP=5_000_000;
// Tura de relaie livrează exact cele patru răspunsuri ale cererilor fixe de acoperire
// națională ale încărcătorului — fără cadran tăcut: un livru mai scurt nu se publică
// ca spațiu aerian întreg.
const COVERAGE_BOARDS=4;
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string)=>json({error},400);
// Fluxul adsb.lol servește egress-ul rezidențial, dar respinge rețeaua Cloudflare
// Workers a serverului cu 429/503 (clasa AFIR): tura externă de relaie aduce cele
// patru răspunsuri brute de acoperire, iar ruta le publică prin exact parserul și
// fuziunea propriului încărcător, la aceeași cheie de stocare flights:adsb — tura
// de relaie este singurul scriitor al prospețimii, iar cititorul servește copia cu
// eticheta onestă de vechime.
export async function POST(request:Request){
 const token=env.REFRESH_TOKEN||'';
 if(!token||!tokenValid(token,request.headers.get('authorization')))return json({error:'Acces interzis.'},401);
 const db=env.DB;
 if(!db)return json({error:'Starea persistentă a surselor este temporar indisponibilă.'},503);
 let body:any;try{body=await request.json()}catch{return reject('Cererea nu poate fi citită ca JSON.')}
 const boards=body?.boards;
 if(!Array.isArray(boards))return reject('Turul de relaie livrează lista de răspunsuri de acoperire (boards).');
 if(boards.length!==COVERAGE_BOARDS)return reject('Turul de acoperire livrează '+boards.length+' răspunsuri în loc de cele '+COVERAGE_BOARDS+' cereri fixe de acoperire națională — fără cadran tăcut, nimic nu se publică.');
 const parsed:Loaded[]=[];
 for(let at=0;at<boards.length;at++){
  const raw=boards[at];
  if(typeof raw!=='string'||!raw.length)return reject('Lipsește corpul răspunsului de acoperire numărul '+(at+1)+'.');
  if(raw.length>BOARD_CAP)return reject('Răspunsul de acoperire numărul '+(at+1)+' depășește limita permisă.');
 }
 for(let at=0;at<boards.length;at++){try{parsed.push(parseAdsbFlights(boards[at]))}catch(e){return reject(e instanceof Error?e.message:'Fluxul adsb.lol are o structură schimbată.')}}
 let merged;try{merged=mergeAdsbBoards(parsed)}catch(e){return reject(e instanceof Error?e.message:'Fluxul adsb.lol are o structură schimbată.')}
 try{
  const prior=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(adsbFlightsLoader.key).first<Row>();
  await publishLoaded(db,adsbFlightsLoader,prior,merged);
 }catch(e){console.warn(JSON.stringify({event:'flights_relay_failure',message:e instanceof Error?e.message:'fluxul nu a putut fi publicat'}));return json({error:'Fluxul de poziții nu a putut fi publicat.'},500)}
 return json({result:'ok',aircraft:merged.data.items.length,hexes:merged.data.entityCount,observedAt:merged.data.observedAt,servedAt:new Date().toISOString()});
}
