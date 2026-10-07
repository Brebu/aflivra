import {env} from 'cloudflare:workers';
import {createHash,timingSafeEqual} from 'node:crypto';
import {biaAirports,biaAirport,biaFlightsLoader,parseBiaFlights} from '@/lib/live/flights';
import {publishLoaded,type Row} from '@/lib/live/cache';
export const dynamic='force-dynamic';
// Tokenul se compară pe rezumatul SHA-256 al ambelor valori, în timp constant: nici lungimea, nici prima
// poziție diferită nu scurg informație despre secretul din mediul de execuție.
const tokenValid=(token:string,header:string|null)=>{if(!token||!header?.startsWith('Bearer '))return false;const digest=(value:string)=>createHash('sha256').update(value).digest();return timingSafeEqual(digest(header.slice(7)),digest(token))};
const BOARD_CAP=5_000_000;
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string)=>json({error},400);
// Panoul BIA este apărat de un test de browser care respinge orice server: runnerul
// extern aduce panoul zilei, iar ruta îl publică prin exact parserul și setterul pe
// care cititorul le folosește, la aceeași cheie de stocare. Panoul zilei este
// adevărul integral al turei — livrarea înlocuiește copia anterioară, fără scurtături.
export async function POST(request:Request){
 const token=env.REFRESH_TOKEN||'';
 if(!token||!tokenValid(token,request.headers.get('authorization')))return json({error:'Acces interzis.'},401);
 const db=env.DB;
 if(!db)return json({error:'Starea persistentă a surselor este temporar indisponibilă.'},503);
 let body:any;try{body=await request.json()}catch{return reject('Cererea nu poate fi citită ca JSON.')}
 const id=typeof body?.airport==='string'?body.airport:'',airport=biaAirport(id);
 if(!airport)return reject('Aeroportul „'+id.slice(0,60)+'” nu face parte din panourile preluate. Aeroporturi preluate: '+biaAirports.map(a=>a.id).join(', ')+'.');
 const raw=body?.body;
 if(typeof raw!=='string'||!raw.length)return reject('Lipsește corpul panoului aeroportului de preluat.');
 if(raw.length>BOARD_CAP)return reject('Corpul panoului aeroportului depășește limita permisă.');
 let board;try{board=parseBiaFlights(raw)}catch(e){return reject(e instanceof Error?e.message:'Panoul aeroportului are o structură schimbată.')}
 const loader=biaFlightsLoader(airport);
 try{
  const prior=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>();
  await publishLoaded(db,loader,prior,board);
 }catch(e){console.warn(JSON.stringify({event:'bia_relay_failure',message:e instanceof Error?e.message:'panoul nu a putut fi publicat'}));return json({error:'Panoul aeroportului nu a putut fi publicat.'},500)}
 return json({result:'ok',airport:airport.id,arrivals:board.data.arrivals.length,departures:board.data.departures.length,dropped:board.data.dropped,servedAt:new Date().toISOString()});
}
