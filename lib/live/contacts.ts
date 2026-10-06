export type PublicContact={kind:'phone'|'email'|'website'|'address';value:string;href?:string;field:string};
const normalized=(key:string)=>key.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
/** Extract only contact fields actually supplied in this record. No lookup or inferred identity. */
export function publicContacts(data:unknown):PublicContact[]{
 const found:PublicContact[]=[],seen=new Set<string>(),visited=new Set<object>();
 const add=(kind:PublicContact['kind'],value:string,field:string,href?:string)=>{const clean=value.trim();if(!clean)return;const key=kind+':'+clean.toLocaleLowerCase('ro-RO');if(!seen.has(key)){seen.add(key);found.push({kind,value:clean,field,...(href?{href}:{})})}};
 const walk=(value:unknown,path:string,kind?:PublicContact['kind'])=>{
  if(value===null||value===undefined)return;
  if(typeof value==='object'){if(visited.has(value))return;visited.add(value);if(Array.isArray(value)){for(const child of value)walk(child,path,kind)}else for(const [key,child] of Object.entries(value)){const field=normalized(key);const contactKind=/^(?:telefon(?:unitate|contact|mobil|fix|fax)?|phone(?:number)?|mobile(?:phone)?|tel(?:fax)?|(?:nr|numar)telefon)$/.test(field)?'phone':/email|mail$/.test(field)?'email':/website|websites|siteweb|sitelweb|paginaweb|adresaweb|^site$/.test(field)?'website':/^(address|adresa|adresasediu|sediu|postaladdress|adresaunitate)$/.test(field)?'address':undefined;walk(child,path?path+'.'+key:key,contactKind)}return}
  if(!kind||!['string','number'].includes(typeof value))return;const text=String(value).trim();
  if(kind==='email'){for(const match of text.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))add(kind,match[0],path,'mailto:'+match[0])}
  else if(kind==='website'){try{const url=new URL(/^https?:\/\//i.test(text)?text:'https://'+text);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname.includes('.'))add(kind,text,path,url.href)}catch{}}
  else if(kind==='phone'){for(const number of text.split(/[;,\n]+/)){const digits=number.replace(/[^\d+]/g,'');if(/^\+?\d{7,15}$/.test(digits))add(kind,number,path,'tel:'+digits)}}
  else add(kind,text,path);
 };
 walk(data,'');return found;
}
