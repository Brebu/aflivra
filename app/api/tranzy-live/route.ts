import {readGeographicContext,nearbyRecord} from '@/lib/geographic-scope';
import {readSource} from '@/lib/live/cache';
import {tranzyAgenciesLoader,tranzyVehiclesLoader,tranzyResolveAgency} from '@/lib/live/transit-realtime';
import {matchesQuery,paginate} from '@/lib/live/query';
import {observedItems,observationAge} from '@/lib/live/observation';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,q=p.get('q')||'',page=Number(p.get('page')||0),context=readGeographicContext(p);
 if(!context||!context.active||!context.locality||q.length>200||!Number.isInteger(page)||page<0||page>100000||p.has('includeStale')&&!['true','false'].includes(p.get('includeStale')!))return Response.json({error:'Filtre invalide.'},{status:400});
 const agenciesState=await readSource(tranzyAgenciesLoader);
 if(!agenciesState.data)return Response.json(agenciesState,{headers:{'Cache-Control':'no-store'}});
 const agency=tranzyResolveAgency(agenciesState.data.agencies||[],context.locality);
 if(!agency)return Response.json({key:'transport:tranzy:vehicles',name:'Tranzy · '+context.locality,url:tranzyAgenciesLoader.url,adapterVersion:'tranzy.vehicles.v1',status:'unavailable',data:null,publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:'Niciun operator Tranzy nu a fost identificat pentru '+context.locality+'. Fluxul altui oraș nu este interogat.',ttlSeconds:3600},{headers:{'Cache-Control':'no-store'}});
  const state=await readSource(tranzyVehiclesLoader(agency));
  if(state.data){const now=Date.now(),rows=(state.data.items as any[]).filter((r:any)=>(!context.point||nearbyRecord(r,context.point,context.radius))&&matchesQuery({...r,line:'Linia '+String(r.routeId),vehicle:r.vehicleName},q));
  // O veche copie nu ascunde harta: poziția păstrată rămâne servită. Vechimea
  // OBSERVAȚIEI (de la momentul observat) e eticheta pozițiilor — separat de
  // vechimea PRELUĂRII (de la ultima reușită), ca pozițiile vechi de luni să nu
  // pară proaspete doar pentru că preluarea a reușit acum.
  const positions=observedItems(rows,p.get('includeStale')==='true',now),isLive=state.status!=='stale'&&positions.liveCount>0,
   observationAgeSeconds=observationAge(state.data.observedAt,now),
   fetchedAgeSeconds=observationAge(state.lastSuccessAt,now),
   stalenessMinutes=observationAgeSeconds===null?null:Math.round(observationAgeSeconds/60);
  state.data={...state.data,...positions,...paginate(positions.items,page,60),isLive,stalenessMinutes,observationAgeSeconds,fetchedAgeSeconds,agency:agency.agency_name}}
  return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
