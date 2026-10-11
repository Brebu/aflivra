// Download time never substitutes for the timestamp of a position.
export const LIVE_MAX_AGE_SECONDS = 120;
export function observationAge(observedAt:unknown,now=Date.now()):number|null {
 const at=typeof observedAt==='string'?Date.parse(observedAt):NaN;
 return Number.isFinite(at)&&at<=now?Math.floor((now-at)/1000):null;
}
export function observedItems<T extends {observedAt?:string|null}>(items:T[],includeStale=false,now=Date.now()) {
 const annotated=items.map(item=>{const observationAgeSeconds=observationAge(item.observedAt,now);return {...item,observationAgeSeconds,isLive:observationAgeSeconds!==null&&observationAgeSeconds<LIVE_MAX_AGE_SECONDS}});
 const current=annotated.filter(item=>item.isLive);
 return {items:includeStale?annotated:current,liveCount:current.length,staleCount:annotated.length-current.length,includeStale,maxObservationAgeSeconds:LIVE_MAX_AGE_SECONDS};
}
