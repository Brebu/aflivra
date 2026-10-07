import {readSource} from '@/lib/live/cache';
import {biaAirports,biaAirport,biaFlightsLoader} from '@/lib/live/flights';
import {matchesQuery} from '@/lib/live/query';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,airportId=p.get('airport')||biaAirports[0].id,q=p.get('q')||'';
 const airport=biaAirport(airportId);
 if(q.length>200||!airport)return Response.json({error:'Filtre invalide.'},{status:400});
 const state=await readSource(biaFlightsLoader(airport));
 if(state.data){
  // Panoul zilei este mic și se servește întreg: filtrarea pe text rămâne onestă,
  // cu totalurile complete alături de listele filtrate.
  const filter=(r:any)=>matchesQuery({number:r.flightNumber,airline:r.airline,from:r.from,to:r.to,status:r.status,gate:r.gate},q);
  const arrivals=(state.data.arrivals||[]).filter(filter),departures=(state.data.departures||[]).filter(filter);
  state.data={...state.data,arrivals,departures,arrivalsTotal:(state.data.arrivals||[]).length,departuresTotal:(state.data.departures||[]).length,airport:airport.id,airportName:airport.name};
 }
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
