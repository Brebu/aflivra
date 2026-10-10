import {getSource,SourceError} from './adapters';
import type {Loader,Loaded} from './types';
import {uniqueRecords,uniqueRecordsLatest} from './records';

export type FlightItem={hex:string;callsign:string|null;registration:string|null;typeCode:string|null;lat:number;lon:number;track:number|null;trueHeading:number|null;altitudeFt:number|null;onGround:boolean;groundSpeedKt:number|null;verticalRateFpm:number|null;squawk:string|null;emergency:string|null;observedAt:string;details:unknown};

// Interogarea v2 a adsb.lol nu are formă de dreptunghi (verificat 2026-10-07 pe API-ul
// public): acoperirea spațiului aerian românesc se face prin patru cereri punct fixe
// la raza maximă de 250 NM, iar reuniunea se restrânge apoi la Chenarul național
// folosit de toate fluxurile de poziții din aplicație, ca să nu se servească traficul
// statelor vecine ca fiind „peste România”.
const AIRSPACE={latMin:43,latMax:49,lonMin:20,lonMax:31};
const ADSB_POINTS:[[number,number],[number,number],[number,number],[number,number]]=[[47.5,22.75],[47.5,28.25],[44.5,22.75],[44.5,28.25]];
const ADSB_DIST=250;
const adsbUrl=(lat:number,lon:number)=>'https://api.adsb.lol/v2/lat/'+lat+'/lon/'+lon+'/dist/'+ADSB_DIST;
const finite=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?n:null};

export function parseAdsbFlights(raw:string):Loaded{
 let d:any;try{d=JSON.parse(raw)}catch{throw new SourceError('Fluxul adsb.lol nu poate fi decodat integral.')}
 if(!Array.isArray(d?.ac))throw new SourceError('Fluxul adsb.lol nu are structura așteptată.');
 const stamp=Number(d.now),observedAt=Number.isFinite(stamp)&&stamp>1700000000000&&stamp<=Date.now()+300000?new Date(stamp).toISOString():null;
 if(!observedAt)throw new SourceError('Momentul fluxului adsb.lol nu este valid.');
 const items=d.ac.flatMap((row:any)=>{
  const hex=String(row?.hex||'').trim().toLowerCase(),lat=finite(row?.lat),lon=finite(row?.lon);
  if(!/^[0-9a-f]{6}$/i.test(hex)||lat===null||lon===null||lat<AIRSPACE.latMin||lat>AIRSPACE.latMax||lon<AIRSPACE.lonMin||lon>AIRSPACE.lonMax)return[];
  const onGround=row?.alt_baro==='ground',altitudeFt=onGround?null:finite(row?.alt_baro);
  const emergency=String(row?.emergency||'').trim();
  return[{hex,callsign:String(row?.flight||'').trim()||null,registration:typeof row?.r==='string'&&row.r.trim()?row.r.trim():null,typeCode:typeof row?.t==='string'&&row.t.trim()?row.t.trim():null,lat,lon,track:finite(row?.track),trueHeading:finite(row?.true_heading),altitudeFt,onGround,groundSpeedKt:finite(row?.gs),verticalRateFpm:finite(row?.baro_rate),squawk:typeof row?.squawk==='string'&&row.squawk.trim()?row.squawk.trim():null,emergency:emergency&&emergency!=='none'?emergency:null,observedAt,details:row}];
 });
 const identities=[...new Set(d.ac.map((row:any)=>String(row?.hex||'').trim().toLowerCase()).filter(Boolean))];
 return{publishedAt:observedAt,data:{kind:'flights',observedAt,items:uniqueRecords<FlightItem>(items,x=>x.hex),hexes:identities,note:'Stările aeronavelor provin din fluxul public adsb.lol, alimentat de receptori comunitari. O aeronavă lipsă din flux nu înseamnă că nu zboară.'}};
}
// Fuziunea celor patru răspunsuri de acoperire este logica partajată a sursei: o citește
// încărcătorul la cerere, o citește și ruta de depunere /api/seed/flights pentru tura
// externă de relaie — aceeași dedublare pe Mode-S, același chenar național, același
// moment al fluxului, ca să nu existe două adevăruri despre spațiul aerian.
export function mergeAdsbBoards(boards:Loaded[]):Loaded{
 const merged=uniqueRecordsLatest<FlightItem>(boards.flatMap(board=>board.data.items),x=>x.hex.toLowerCase(),x=>x.observedAt);
 const moments=[...boards.map(board=>Date.parse(board.data.observedAt)),...boards.flatMap(board=>board.data.items).map(item=>Date.parse(item.observedAt))].filter(Number.isFinite);
 const latest=new Date(Math.max(...(moments.length?moments:[0]))).toISOString();
 // Identitățile se reunesc și ele, ca pozițiile: patru răspunsuri identice rămân
 // un singur set de aeronave observate, nu patru.
 const entityCount=[...new Set(boards.flatMap(board=>board.data.hexes||[]))].length;
 return{publishedAt:latest,data:{...boards[0].data,items:merged,entityCount,observedAt:latest,...(moments.length?{observedMinAt:new Date(Math.min(...moments)).toISOString(),observedMaxAt:latest}:{})}};
}
export const adsbFlightsLoader:Loader={key:'flights:adsb',name:'adsb.lol · ADS-B comunitar',url:'https://api.adsb.lol/v2/',version:'flights.adsb.ro.v1',ttl:60,load:loadAdsbFlights};
async function loadAdsbFlights():Promise<Loaded>{
 try{
  // Cele patru cereri de acoperire fac parte dintr-o singură încărcare: toate se
  // așază la loc înainte de verdict, iar dacă una dintre ele eșuează, întregul
  // flux eșuează — nu se servește o hartă cu un cadran tăcut, fără să se spună.
  const parts=await Promise.allSettled(ADSB_POINTS.map(async([lat,lon])=>parseAdsbFlights(await getSource(adsbUrl(lat,lon),{headers:{'User-Agent':'Aflivra/1.0 public-flight-state reader',Accept:'application/json'}},{timeoutMs:12000}))));
  const failed=parts.find(part=>part.status==='rejected');
  if(failed)throw (failed as PromiseRejectedResult).reason;
  return mergeAdsbBoards(parts.map(part=>(part as PromiseFulfilledResult<Loaded>).value));
  }catch(e){
   // Fluxul servește egress-ul rezidențial, dar respinge rețeaua Cloudflare Workers a
   // serverului cu 429/503 (clasa AFIR, dovedită de sonde): clasa se preia onest în
   // nota de intermediar, cu codul sursei păstrat — prospețimea o poartă tura externă
   // de relaie, orară, iar încărcătorul rămâne logica partajată.
   if(e instanceof SourceError&&(e.diagnostic?.httpStatus===429||e.diagnostic?.httpStatus===503))throw new SourceError('Fluxul public adsb.lol a respins rețeaua serverului (HTTP '+e.diagnostic?.httpStatus+'). Pozițiile se reîmprospătează prin tura de intermediar extern, la fiecare oră; încearcă din nou peste puțin timp.',e.retryAfter,e.diagnostic);
   throw e;
  }
}

export type BiaAirport={id:string;name:string;label:string};
export const biaAirports:BiaAirport[]=[{id:'henri-coanda',name:'Henri Coandă',label:'Henri Coandă (OTP)'},{id:'baneasa-aurel-vlaicu',name:'Băneasa · Aurel Vlaicu',label:'Băneasa · Aurel Vlaicu (BBU)'}];
export const biaAirport=(id:string)=>biaAirports.find(airport=>airport.id===id)||null;
export const biaFlightsUrl=(airport:BiaAirport)=>'https://bucharestairports.ro/wp-json/fds/v1/flights?'+new URLSearchParams({airport:airport.id,language:'ro'});

export type BiaFlight={flightNumber:string;airline:string|null;from:string|null;to:string|null;route:string|null;scheduledTime:string|null;estimatedTime:string|null;actualTime:string|null;status:string|null;gate:string|null;details:unknown};
// Câmpurile rândurilor panoului BIA s-au citit în sesiunea de cercetare din obiectul
// unei sosiri rei, capturat în browser; forma exactă se confirmă la prima tură de
// relaie — soluția tolerantă caută numele înregistrat și câțiva varianți de scriere,
// iar rândul fără număr de zbor sau fără sens (sosire/plecare) se omite, nu se inventează.
const pick=(row:Record<string,unknown>,names:string[]):string|null=>{for(const name of names){const key=Object.keys(row).find(candidate=>candidate.toLowerCase()===name);if(!key)continue;const text=String(row[key]??'').trim();if(text)return text}return null};
const pickAirline=(row:Record<string,unknown>):string|null=>{const value=Object.keys(row).find(key=>key.toLowerCase()==='airline');if(!value)return null;const airline=row[value];if(typeof airline==='string'&&airline.trim())return airline.trim();if(airline&&typeof airline==='object'){const any=airline as Record<string,unknown>;for(const key of ['RO','ro','EN','en'])if(typeof any[key]==='string'&&any[key].trim())return String(any[key].trim())}return null};
const arrivalWord=/^(a|arr|arrival|arrivals|sosire|sosiri)\s*$/i,departureWord=/^(d|dep|departure|departures|plecare|plecari)\s*$/i;
const biaDirection=(row:Record<string,unknown>):'arrival'|'departure'|null=>{for(const name of ['direction','flightdirection','scheduledirection','operation','operationtype']){const key=Object.keys(row).find(candidate=>candidate.toLowerCase()===name);if(!key)continue;const value=String(row[key]??'').trim();if(arrivalWord.test(value))return 'arrival';if(departureWord.test(value))return 'departure'}return null};

export function parseBiaFlights(raw:string):Loaded{
 let d:any;try{d=JSON.parse(raw)}catch{throw new SourceError('Panoul aeroportului nu poate fi decodat integral.')}
 const rows=Array.isArray(d)?d:Array.isArray(d?.flights)?d.flights:null;
 if(!rows||!Array.isArray(rows))throw new SourceError('Panoul aeroportului nu are structura așteptată.');
 const arrivals:BiaFlight[]=[],departures:BiaFlight[]=[];let dropped=0;
 for(const row of rows){
  if(!row||typeof row!=='object'){dropped++;continue}
  const record=row as Record<string,unknown>,flightNumber=pick(record,['flightnumber','flight_number','flight']);
  const direction=biaDirection(record);
  if(!flightNumber||!direction){dropped++;continue}
  const from=pick(record,['origin','from','origine','sursa','departureairport','fromairport']),to=pick(record,['destination','to','destinatie','arrivalairport','toairport']);
  const item:BiaFlight={flightNumber,airline:pickAirline(record),from,to,route:from&&to?[from,to].join(' · '):from||to||null,scheduledTime:pick(record,['scheduledtime','scheduled','std','sta','time','ora']),estimatedTime:pick(record,['estimatedtime','estimated','etd','eta']),actualTime:pick(record,['actualtime','actual','atd','ata']),status:pick(record,['status','stare']),gate:pick(record,['gate','poarta']),details:record};
  (direction==='arrival'?arrivals:departures).push(item);
 }
 if(rows.length&&!arrivals.length&&!departures.length&&dropped)throw new SourceError('Panoul aeroportului nu conține curse utilizabile acum.');
 const observedAt=new Date().toISOString();
 return{publishedAt:observedAt,data:{observedAt,arrivals,departures,dropped,note:'Panoul oficial al zilei, publicat de aeroport și predat stocării de intermediarul de reîmprospătare.'}};
}
export const biaFlightsLoader=(airport:BiaAirport):Loader=>({key:'flights:bia:'+airport.id,name:'Bucharest Airports · '+airport.name,url:biaFlightsUrl(airport),version:'flights.bia.board.v1',ttl:3600,load:async()=>{
 try{return parseBiaFlights(await getSource(biaFlightsUrl(airport),{headers:{'User-Agent':'Aflivra/1.0 public-flight-board reader',Accept:'application/json'}}))}
 catch(e){
  // Aeroportul apără panoul cu un test de browser care respinge orice server:
  // clasa preluată onest în eroare, nu un 403 crud — preluarea o face intermediarul.
  if(e instanceof SourceError&&e.diagnostic?.httpStatus===403)throw new SourceError('Panoul aeroportului nu a fost încă preluat. Reîmprospătarea o face un intermediar extern, care rulează din afara rețelei serverului; încearcă din nou peste puțin timp.',0,e.diagnostic);
  throw e;
 }
}});
