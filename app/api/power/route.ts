import {readSource} from '@/lib/live/cache';
import {senLoader} from '@/lib/live/sen';
export const dynamic='force-dynamic';

export async function GET(){
 const state=await readSource(senLoader);
 if(state.data){
  // Vechimea observației (față de momentul observat de sursă) e contractul comun al
  // fluxurilor de poziții — sursa publică cu 1–2 minute în urmă, deci o vechime de
  // câteva minute e normală, nu avarie; se calculează pe observedAt, nu pe preluare.
  const now=Date.now(),observed=state.data.observedAt?Date.parse(state.data.observedAt):NaN;
  const observationAgeSeconds=Number.isFinite(observed)?Math.max(0,Math.floor((now-observed)/1000)):null;
  const fetchedAgeSeconds=state.lastSuccessAt?Math.max(0,Math.floor((now-Date.parse(state.lastSuccessAt))/1000)):null;
  state.data={...state.data,...(observationAgeSeconds!==null?{observationAgeSeconds}:{}),...(fetchedAgeSeconds!==null?{fetchedAgeSeconds}:{})};
 }
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
