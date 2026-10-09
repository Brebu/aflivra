import {readGeographicContext,nearbyRecord,sameLocality} from '@/lib/geographic-scope';
import {readSource} from '@/lib/live/cache';import {cinemaLoader,cinemaSites} from '@/lib/live/cinema';
export const dynamic='force-dynamic';
export async function GET(request:Request){const p=new URL(request.url).searchParams,id=p.get('id')||'1824',date=p.get('date')||'',detail=p.get('detail')||'full',context=readGeographicContext(p),cinema=cinemaSites.find(c=>c.externalCode===id);if(!context||!cinema||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))return Response.json({error:'Cinema sau dată invalidă.'},{status:400});if(context.active&&(!context.point||!nearbyRecord(cinema,context.point))&&!sameLocality(cinema.address.city,context.locality))return Response.json({error:'Cinematograful nu se află în zona aleasă.'},{status:400});const state=await readSource(cinemaLoader(id,date));
 // Proiecția compactă (conversații, tool-uri) nu poartă corpul complet al sursei
 // pe lângă filmele și proiecțiile deja transformate — dublura rămâne integrală
 // doar în forma completă, cerută explicit, pe care interfața o randează.
 if(detail==='compact'&&state.data){const {metadata:metadataIgnored,...rest}=state.data as Record<string,unknown>;return Response.json({...state,data:{...rest,detail:'compact'}},{headers:{'Cache-Control':'no-store'}})}
 return Response.json(state,{headers:{'Cache-Control':'no-store'}})}
