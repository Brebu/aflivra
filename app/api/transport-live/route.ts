import {readGeographicContext,nearbyRecord} from '@/lib/geographic-scope';
import {transitCovers,outsideTransitCoverage} from '@/lib/transit-location';
import {readSource} from '@/lib/live/cache';
import {realtimeLoader,type RealtimeKind} from '@/lib/live/transit-realtime';
import {matchesQuery,paginate} from '@/lib/live/query';
import transit from '@/public/transit/manifest.json';import network from '@/public/transit/network.json';
const routeNames=new Map(network.routes.map(r=>[r.id,'Linia '+r.name+' '+r.longName+' '+r.operator])),stopNames=new Map(network.stops.map(s=>[s.stop_id,s.stop_name]));
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,kind=(p.get('kind')||'vehicles') as RealtimeKind,route=p.get('route')||'',stop=p.get('stop')||'',q=p.get('q')||'',page=Number(p.get('page')||0),context=readGeographicContext(p);
 if(!context||!['vehicles','arrivals','alerts'].includes(kind)||route.length>100||stop.length>100||q.length>200||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Filtre invalide.'},{status:400});
 if(context.active&&(!context.point||!transitCovers(context.point)))return Response.json(outsideTransitCoverage(context.locality||'poziția aleasă'));
 const point=context.point,nearStops=new Set(point?network.stops.filter(s=>nearbyRecord({lat:Number(s.stop_lat),lon:Number(s.stop_lon)},point)).map(s=>s.stop_id):[]),nearRoutes=new Set(point?network.stops.filter(s=>nearStops.has(s.stop_id)).flatMap(s=>s.routes):[]);
 const state=await readSource(realtimeLoader(kind));
 if(state.data){const now=Date.now(),resolved=state.data.items.map((r:any)=>({...r,...(kind!=='alerts'?{routeId:r.routeId||(transit.tripRoutes as Record<string,string>)[r.tripId]||''}:{})})),rows=resolved.filter((r:any)=>(!point||(kind==='vehicles'?nearbyRecord(r,point):kind==='arrivals'?r.stops.some((s:any)=>nearStops.has(s.stopId)):!r.routeIds.length&&!r.stopIds.length||r.routeIds.some((id:string)=>nearRoutes.has(id))||r.stopIds.some((id:string)=>nearStops.has(id))))&&(!route||(kind==='alerts'?r.routeIds.includes(route):r.routeId===route))&&(!stop||(kind==='alerts'?r.stopIds.includes(stop):kind==='arrivals'?r.stops.some((s:any)=>s.stopId===stop):r.stopId===stop))&&matchesQuery({...r,line:routeNames.get(r.routeId),station:stopNames.get(r.stopId),stations:(r.stops||[]).map((s:any)=>stopNames.get(s.stopId)),lines:(r.routeIds||[]).map((id:string)=>routeNames.get(id))},q));const active=kind==='alerts'?rows.filter((r:any)=>!r.periods.length||r.periods.some((x:any)=>(!x.start||Date.parse(x.start)<=now)&&(!x.end||Date.parse(x.end)>=now))):rows;state.data={...state.data,...paginate(active,page,60),isLive:state.status!=='stale'&&now-Date.parse(state.data.observedAt)<120000};}
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
