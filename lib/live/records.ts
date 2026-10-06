/** Preserve source order while removing repeated identifiers or equivalent canonical URLs. */
export function uniqueRecords<T>(rows:T[],key:(row:T)=>string):T[]{const seen=new Set<string>();return rows.filter(row=>{const k=key(row);if(!k)return true;if(seen.has(k))return false;seen.add(k);return true})}
export function canonicalUrl(value:string){try{const u=new URL(value);u.hash='';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_')||['fbclid','gclid'].includes(k))u.searchParams.delete(k);u.searchParams.sort();return u.href.replace(/\/$/,'')}catch{return value.trim()}}
