import {readSource} from '@/lib/live/cache';
import {adsbFlightsLoader} from '@/lib/live/flights';
import {matchesQuery,paginate} from '@/lib/live/query';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,q=p.get('q')||'',page=Number(p.get('page')||0);
 if(q.length>200||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Filtre invalide.'},{status:400});
 const state=await readSource(adsbFlightsLoader);
 if(state.data){const now=Date.now(),rows=state.data.items.filter((r:any)=>matchesQuery({callsign:r.callsign,registration:r.registration,type:r.typeCode,squawk:r.squawk,hex:r.hex},q));state.data={...state.data,...paginate(rows,page,60),isLive:state.status!=='stale'&&now-Date.parse(state.data.observedAt)<120000};}
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
