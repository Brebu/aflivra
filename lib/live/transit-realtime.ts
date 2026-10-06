import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import bindings from 'gtfs-realtime-bindings';
import type {Loader,Loaded} from './types';
import {SourceError} from './adapters';
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
export const realtimeLoader=(kind:RealtimeKind):Loader=>({key:'transport:realtime:'+kind,name:'TPBI · '+({vehicles:'poziții vehicule',arrivals:'estimări de sosire',alerts:'alerte de circulație'}[kind]),url:'https://gtfs.tpbi.ro/regional/',version:'gtfs.realtime.v1',ttl:30,load:async()=>{
 const r=await fetchWithServerRetry('https://gtfs.tpbi.ro/api/gtfs-rt/'+endpoints[kind],{headers:{'User-Agent':'Aflivra/1.0 cached public transit reader',Accept:'application/octet-stream'},signal:AbortSignal.timeout(12000),redirect:'manual'});
 if(!r.ok)throw new SourceError('Fluxul TPBI răspunde cu HTTP '+r.status+'.',r.status===429?60:0);
 if(Number(r.headers.get('content-length'))>5000000)throw new SourceError('Fluxul live este prea mare.');
 const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>5000000)throw new SourceError('Fluxul live este prea mare.');return parseRealtime(bytes,kind);
}});
