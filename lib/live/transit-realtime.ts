import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import {env} from 'cloudflare:workers';
import bindings from 'gtfs-realtime-bindings';
import type {Loader,Loaded} from './types';
import {getSource,SourceError} from './adapters';
import {normalizeSearch} from './query';
export type RealtimeKind='vehicles'|'arrivals'|'alerts';
const endpoints={vehicles:'vehiclePositions',arrivals:'tripUpdates',alerts:'serviceAlerts'};
const text=(value:any)=>value?.translation?.find((t:any)=>t.language==='ro')?.text||value?.translation?.[0]?.text||'';
const epoch=(n:unknown)=>{const value=Number(n);return Number.isFinite(value)&&value>0?new Date(value*1000).toISOString():null};
export function parseRealtime(bytes:Uint8Array,kind:RealtimeKind):Loaded{
 let decoded:any;try{decoded=bindings.transit_realtime.FeedMessage.toObject(bindings.transit_realtime.FeedMessage.decode(bytes),{longs:String,enums:String})}catch{throw new SourceError('Fluxul TPBI nu poate fi decodat integral.')}
 if(!['1.0','2.0'].includes(decoded.header?.gtfsRealtimeVersion)||decoded.header.incrementality==='DIFFERENTIAL')throw new SourceError('Versiunea fluxului TPBI trebuie verificată.');
 const observedAt=epoch(decoded.header.timestamp);if(!observedAt||Date.parse(observedAt)>Date.now()+300000)throw new SourceError('Momentul fluxului live nu este valid.');
 const entities=decoded.entity||[];
 const items=entities.flatMap((e:any)=>{
  if(kind==='vehicles'&&e.vehicle){const v=e.vehicle,p=v.position;if(!p||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||p.latitude<43||p.latitude>49||p.longitude<20||p.longitude>31)return[];return[{id:e.id,routeId:v.trip?.routeId||'',tripId:v.trip?.tripId||'',vehicleName:v.vehicle?.label||'Vehicul',licensePlate:v.vehicle?.licensePlate||'',lat:p.latitude,lon:p.longitude,bearing:p.bearing??null,speed:p.speed??null,stopId:v.stopId||'',observedAt:epoch(v.timestamp)||observedAt,occupancy:v.occupancyStatus||null,occupancyPercentage:v.occupancyPercentage??null,wheelchairAccessible:v.vehicle?.wheelchairAccessible||null,currentStatus:v.currentStatus||null,details:v}]}
  if(kind==='arrivals'&&e.tripUpdate){const t=e.tripUpdate;return[{id:e.id,routeId:t.trip?.routeId||'',tripId:t.trip?.tripId||'',observedAt:epoch(t.timestamp)||observedAt,scheduleRelationship:t.trip?.scheduleRelationship||null,vehicleName:t.vehicle?.label||null,delay:t.delay??null,stops:(t.stopTimeUpdate||[]).map((s:any)=>({stopId:s.stopId||'',sequence:s.stopSequence??null,arrivalAt:epoch(s.arrival?.time),departureAt:epoch(s.departure?.time),delay:s.arrival?.delay??s.departure?.delay??null,uncertainty:s.arrival?.uncertainty??s.departure?.uncertainty??null,scheduleRelationship:s.scheduleRelationship||null,details:s})),details:t}]}
  if(kind==='alerts'&&e.alert){const a=e.alert;return[{id:e.id,title:text(a.headerText),description:text(a.descriptionText),url:text(a.url),routeIds:(a.informedEntity||[]).map((v:any)=>v.routeId).filter(Boolean),stopIds:(a.informedEntity||[]).map((v:any)=>v.stopId).filter(Boolean),periods:(a.activePeriod||[]).map((p:any)=>({start:epoch(p.start),end:epoch(p.end)})),cause:a.cause||null,effect:a.effect||null,details:a}]}
  return[];
 });
 return{publishedAt:observedAt,data:{kind,observedAt,items,entityCount:entities.length,header:decoded.header,note:'Poziții și estimări publicate de TPBI. Un vehicul lipsă din flux nu înseamnă că linia nu circulă.'}};
}
export const realtimeLoader=(kind:RealtimeKind):Loader=>({key:'transport:realtime:'+kind,name:'TPBI · '+({vehicles:'poziții vehicule',arrivals:'estimări de sosire',alerts:'alerte de circulație'}[kind]),url:'https://gtfs.tpbi.ro/regional/',version:'gtfs.realtime.v1',ttl:kind==='vehicles'?15:30,load:async()=>{
 const r=await fetchWithServerRetry('https://gtfs.tpbi.ro/api/gtfs-rt/'+endpoints[kind],{headers:{'User-Agent':'Aflivra/1.0 cached public transit reader',Accept:'application/octet-stream'},signal:AbortSignal.timeout(12000),redirect:'manual'});
 if(!r.ok)throw new SourceError('Fluxul TPBI răspunde cu HTTP '+r.status+'.',r.status===429?60:0);
 if(Number(r.headers.get('content-length'))>5000000)throw new SourceError('Fluxul live este prea mare.');
 const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>5000000)throw new SourceError('Fluxul live este prea mare.');return parseRealtime(bytes,kind);
}});

export type TranzyAgency={agency_id:number;agency_name:string;agency_timezone?:string|null;agency_url?:string|null};
const TRANZY_BASE='https://api.tranzy.ai/v1/opendata';
export const tranzyApiKey=()=>String(env.TRANZY_API_KEY||'').trim();
export function tranzyNoKeyError(){return new SourceError('Fluxul live Tranzy necesită cheia de acces TRANZY_API_KEY, neconfigurată pe acest server. Fără cheie sursa nu este interogată și nu sunt inventate poziții.')}
const tranzyHeaders=(key:string,agencyId?:number)=>({'User-Agent':'Aflivra/1.0',Accept:'application/json','X-API-KEY':key,...(agencyId!==undefined?{'X-Agency-Id':String(agencyId)}:{})});
// Tranzy stamps positions as "YYYY-MM-DD HH:MM:SS" with no zone designator;
// the GTFS convention carries UTC there, so an unstamped value is read as UTC.
const tranzyTime=(value:unknown)=>{
 const text=String(value??'').trim();
 if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(text))return null;
 const iso=text.replace(' ','T'),marked=/Z$|[+-]\d{2}:?\d{2}$/.test(iso)?iso:iso+'Z',at=Date.parse(marked);
 return Number.isFinite(at)&&at<=Date.now()+300000?new Date(at).toISOString():null;
};
export function parseTranzyVehicles(raw:string):Loaded{
 let rows:any[];try{rows=JSON.parse(raw)}catch{throw new SourceError('Fluxul Tranzy nu poate fi decodat integral.')}
 if(!Array.isArray(rows))throw new SourceError('Fluxul Tranzy nu are structura așteptată.');
 const items=rows.flatMap((v:any)=>{
  const lat=Number(v?.latitude),lon=Number(v?.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<43||lat>49||lon<20||lon>31)return[];
  const observedAt=tranzyTime(v?.timestamp);if(!observedAt)return[];
  const speed=Number(v?.speed);
  const wheelchair=String(v?.wheelchair_accessible||'');
  return[{id:String(v.id??''),routeId:String(v.route_id??''),tripId:String(v.trip_id??''),vehicleName:String(v.label||'Vehicul'),licensePlate:'',lat,lon,
   bearing:null,speed:Number.isFinite(speed)&&speed>=0?speed:null,stopId:'',observedAt,
   occupancy:null,occupancyPercentage:null,wheelchairAccessible:['WHEELCHAIR_ACCESSIBLE','WHEELCHAIR_INACCESSIBLE'].includes(wheelchair)?wheelchair:null,
   currentStatus:null,details:v}];
 });
 if(rows.length&&!items.length)throw new SourceError('Fluxul Tranzy nu conține poziții utilizabile acum.');
 const observedAt=items.reduce((latest:string|null,item:any)=>!latest||item.observedAt>latest?item.observedAt:latest,null);
 return{publishedAt:observedAt,data:{kind:'vehicles',observedAt,items,entityCount:rows.length,note:'Pozițiile vehiculelor provin din fluxul Tranzy Opendata al operatorului local. Un vehicul lipsă din flux nu înseamnă că linia nu circulă.'}};
}
export const tranzyAgenciesLoader:Loader={key:'transport:tranzy:agencies',name:'Tranzy Opendata · operatori',url:TRANZY_BASE+'/agency',version:'tranzy.agencies.v1',ttl:86400,load:async()=>{
 const key=tranzyApiKey();if(!key)throw tranzyNoKeyError();
 let rows:any[];try{rows=JSON.parse(await getSource(TRANZY_BASE+'/agency',{headers:tranzyHeaders(key)}))}catch(error){if(error instanceof SourceError)throw error;throw new SourceError('Lista operatorilor Tranzy nu poate fi decodată.')}
 if(!Array.isArray(rows)||!rows.length)throw new SourceError('Lista operatorilor Tranzy lipsește.');
 const agencies=rows.filter((row:any)=>Number.isFinite(Number(row?.agency_id))&&String(row?.agency_name||'').trim()).map((row:any)=>({agency_id:Number(row.agency_id),agency_name:String(row.agency_name).trim(),agency_timezone:row.agency_timezone??null,agency_url:row.agency_url??null}));
 if(!agencies.length)throw new SourceError('Lista operatorilor Tranzy nu conține operatori utilizabili.');
 return{publishedAt:new Date().toISOString(),data:{agencies,observedAt:new Date().toISOString(),note:'Operatorii publici care publică poziții prin Tranzy Opendata.'}};
}};
export const tranzyVehiclesLoader=(agency:TranzyAgency):Loader=>({key:'transport:tranzy:vehicles:'+agency.agency_id,name:'Tranzy · '+agency.agency_name,url:TRANZY_BASE+'/vehicles',version:'tranzy.vehicles.v1',ttl:30,load:async()=>{
 const key=tranzyApiKey();if(!key)throw tranzyNoKeyError();
 return parseTranzyVehicles(await getSource(TRANZY_BASE+'/vehicles',{headers:tranzyHeaders(key,agency.agency_id)}));
}});
// Operatorii se numesc adesea prin acronim (RATBV), deci potrivitul se face pe
// tokenii numelui localități: acoperire completă înainte de potrivire parțială,
// iar localitatea fără operator rămâne o notă onestă, nu un operator inventat.
export function tranzyResolveAgency(agencies:TranzyAgency[],locality:string):TranzyAgency|null{
 const fold=(value:unknown)=>normalizeSearch(String(value??''));
 const tokens=[...new Set(fold(locality).split(/[^a-z0-9]+/).filter(token=>token.length>=4))];
 if(!tokens.length)return null;
 const candidates=agencies.map(agency=>{const name=fold(agency.agency_name);const hits=tokens.filter(token=>name.includes(token)).length;return{agency,name,all:hits===tokens.length,any:hits>0}}).filter(candidate=>candidate.any).sort((a,b)=>Number(b.all)-Number(a.all)||a.name.localeCompare(b.name));
 return candidates[0]?.agency||null;
}
