import {readSource} from '@/lib/live/cache';import {eventsLoader,eventVenues,eventVenue} from '@/lib/live/events';
import {readGeographicContext,nearbyRecord,sameLocality} from '@/lib/geographic-scope';
import {matchesQuery,countText,paginate} from '@/lib/live/query';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,context=readGeographicContext(p),q=(p.get('q')||'').trim(),venueParam=(p.get('venue')||'').trim(),page=Number(p.get('page')||0);
 if(!context)return Response.json({error:'Locație invalidă.'},{status:400});
 if(q.length>200||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Căutare invalidă.'},{status:400});
 if(venueParam&&!eventVenue(venueParam))return Response.json({error:'Instituția nu este în registrul calendarelor publice validate.'},{status:400});
 // The national search contract: the registry's own calendars, each served from its validated copy, merged over title/institution/city.
 if(q){
  const sources=[];for(const venue of eventVenues){const state=await readSource(eventsLoader(venue),{background:true});sources.push({venue,state})}
  const failed=sources.filter(({state})=>!state.data);
  const items=sources.flatMap(({venue,state})=>((state.data as any)?.items||[]).filter((item:any)=>matchesQuery({title:item.title,content:item.content,venue:venue.name,city:venue.city,category:item.category},q)).map((item:any)=>({...item,venue:venue.id,venueName:venue.name,city:venue.city}))).sort((a:any,b:any)=>String(a.start).localeCompare(String(b.start)));
  const selection=paginate(items,page,20);
  return Response.json({key:'events:search',name:'Spectacole și concerte · calendarele publice reunite',url:eventVenues[0]?.url||'',adapterVersion:'events.national.v1',status:items.length?failed.length?'stale':'cached':'unavailable',data:{...selection,query:q,sources:sources.map(({venue,state})=>({key:state.key,name:state.name,status:state.status,error:state.error,venue:venue.id})),note:'Căutare în registru validat '+countText(eventVenues.length,'instituție','instituții')+' cu calendare publice.'},publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:failed.length?countText(failed.length,'calendar public nu a putut fi verificat acum. Celelalte calendare rămân disponibile.','calendare publice nu au putut fi verificate acum. Celelalte calendare rămân disponibile.'):null,ttlSeconds:3600},{headers:{'Cache-Control':'no-store'}});
 }
 const venue=eventVenue(venueParam||'odeon');
 if(!venue)return Response.json({error:'Locație invalidă.'},{status:400});
 if(context.active&&(!context.point||!nearbyRecord(venue,context.point))&&!sameLocality(venue.city,context.locality))return Response.json({key:'events:outside-coverage',name:'Calendarul spectacolelor',url:venue.url,adapterVersion:'events.geographic.v2',status:'cached',data:{items:[],venue,outOfCoverage:true,note:'Nu avem un calendar validat pentru această instituție în zona aleasă.'},publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:3600});
 return Response.json(await readSource(eventsLoader(venue)),{headers:{'Cache-Control':'no-store'}})}
