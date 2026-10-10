/** Preserve source order while removing repeated identifiers or equivalent canonical URLs. */
export function uniqueRecords<T>(rows:T[],key:(row:T)=>string):T[]{const seen=new Set<string>();return rows.filter(row=>{const k=key(row);if(!k)return true;if(seen.has(k))return false;seen.add(k);return true})}
export function canonicalUrl(value:string){try{const u=new URL(value);u.hash='';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_')||['fbclid','gclid'].includes(k))u.searchParams.delete(k);u.searchParams.sort();return u.href.replace(/\/$/,'')}catch{return value.trim()}}

/** Keep, per normalized key, the record with the newest observation moment; on
 * equal moments the first in source order wins — deterministic for any input
 * order, unlike first-occurrence dedup which preserves whichever came first. */
export function uniqueRecordsLatest<T>(rows:T[],key:(row:T)=>string,moment:(row:T)=>string|number|Date):T[]{const best=new Map<string,{row:T;moment:number}>();for(const row of rows){const k=key(row);if(!k)continue;const t=Date.parse(String(moment(row)));const seen=best.get(k);if(!seen||Number.isFinite(t)&&t>seen.moment)best.set(k,{row,moment:Number.isFinite(t)?t:seen?.moment??0})}return [...best.values()].map(entry=>entry.row)}
