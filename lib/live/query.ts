export const normalizeSearch=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function searchable(value:unknown):string {if(value===null||value===undefined)return '';if(typeof value==='object')return Object.entries(value).map(([key,v])=>key+' '+searchable(v)).join(' ');return String(value)}
function queryTerms(query:string){return [...normalizeSearch(query.trim()).matchAll(/"([^"]+)"|(\S+)/g)].map(m=>m[1]||m[2])}
export function queryMatcher(query:string){const terms=queryTerms(query);return (value:unknown)=>{if(!terms.length)return true;const text=normalizeSearch(searchable(value));return terms.every(term=>text.includes(term))}}
export function matchesQuery(value:unknown,query:string){return !query.trim()||queryMatcher(query)(value)}
export type SearchEntry<T>={item:T;text:string};
export function createSearchIndex<T>(items:T[],project:(item:T)=>unknown=item=>item):SearchEntry<T>[]{return items.map(item=>({item,text:normalizeSearch(searchable(project(item)))}))}
export function searchIndex<T>(index:SearchEntry<T>[],query:string):T[]{const terms=queryTerms(query);return index.filter(row=>terms.every(term=>row.text.includes(term))).map(row=>row.item)}
const collator=new Intl.Collator('ro',{numeric:true});
export const compareNames=(a:unknown,b:unknown)=>collator.compare(String(a??''),String(b??''));
export function paginate<T>(rows:T[],page=0,size=20){const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(Math.max(0,page),pages-1);return{items:rows.slice(current*size,(current+1)*size),total:rows.length,page:current,pageSize:size,pages}}
export function compareValues(a:unknown,b:unknown){const numeric=(v:unknown)=>{const s=String(v??'').trim().replace(/[\s\u00a0]/g,'');return s&&/^-?\d+(?:[.,]\d+)?$/.test(s)?Number(s.replace(',','.')):null};const left=numeric(a),right=numeric(b);return left!==null&&right!==null?left-right:compareNames(a,b)}
