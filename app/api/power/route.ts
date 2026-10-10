import {readSource} from '@/lib/live/cache';
import {senLoader,revalidateSenTime} from '@/lib/live/sen';
export const dynamic='force-dynamic';

export async function GET(){
  const state=await readSource(senLoader);
  // O copie persistentă scrisă de adaptorul v1 (offset fix UTC+2) își servește
  // puterile, dar momentul observației se recalifică din valoarea brută, cu
  // parserul v2 — și recalculul se declară în răspuns, nu rămâne subînțeles.
  let observationTimeRevalidated=false;
  if(state.data&&state.storedAdapterVersion&&state.storedAdapterVersion!==senLoader.version){state.data=revalidateSenTime(state.data);observationTimeRevalidated=true}
  if(state.data){
   // Vechimea observației (față de momentul observat de sursă) e contractul comun al
   // fluxurilor de poziții — sursa publică cu 1–2 minute în urmă, deci o vechime de
   // câteva minute e normală, nu avarie; se calculează pe observedAt, nu pe preluare.
   // O vechime negativă nu se maschează la zero: ar ascunde exact o conversie greșită.
   const now=Date.now(),observed=state.data.observedAt?Date.parse(state.data.observedAt):NaN;
   const observationAgeSeconds=Number.isFinite(observed)?Math.floor((now-observed)/1000):null;
   const fetchedAgeSeconds=state.lastSuccessAt?Math.max(0,Math.floor((now-Date.parse(state.lastSuccessAt))/1000)):null;
   state.data={...state.data,...(observationAgeSeconds!==null?{observationAgeSeconds}:{}),...(fetchedAgeSeconds!==null?{fetchedAgeSeconds}:{})};
  }
  return Response.json({...state,...(observationTimeRevalidated?{observationTimeRevalidated}:{})},{headers:{'Cache-Control':'no-store'}});
}
