/** Age of the validated bundled copy, independent of its publication/reference year. */
export function staticFreshness(fetchedAt,ttlSeconds=86400,now=Date.now()){
 const time=typeof fetchedAt==='string'?Date.parse(fetchedAt):NaN;
 const valid=Number.isFinite(time)&&time<=now+300000;
 const corpusAgeSeconds=valid?Math.max(0,Math.floor((now-time)/1000)):null;
 const current=valid&&corpusAgeSeconds<=ttlSeconds;
 return {status:current?'cached':'stale',lastSuccessAt:valid?fetchedAt:null,corpusAgeSeconds,updateRequired:!current,error:current?null:'Nu este consemnată o verificare recentă pentru copia afișată. Datele rămân disponibile cu data preluării.'};
}
