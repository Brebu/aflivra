import {getSource,SourceError} from './adapters';import {sourceText} from './text';import {publicUrl} from './media';import type {Loader,Loaded} from './types';
export function parseEvents(raw:string):Loaded{
 const items:any[]=[];
 for(const match of raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  let parsed:any;try{parsed=JSON.parse(match[1])}catch{continue}
  const rows=Array.isArray(parsed)?parsed:parsed['@graph']||[parsed];
  for(const item of rows){if(!/Event/.test(String(item['@type']))||!item.name||!item.startDate)continue;const url=publicUrl(item.url);if(!url||!new URL(url).hostname.endsWith('teatrul-odeon.ro'))continue;
   const normalize=(value:string)=>value?.replace(/^(\d{4})-(\d{1,2})-(\d{1,2})T(\d\d:\d\d).*/,(_,y,m,d,t)=>y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0')+'T'+t);
   const image=publicUrl(typeof item.image==='string'?item.image:item.image?.url);
   items.push({...item,id:String(item['@id']||url),title:sourceText(item.name),content:sourceText(item.description||''),start:normalize(item.startDate),end:normalize(item.endDate||''),url,media:image?[{kind:'image',url:image,caption:sourceText(item.name),sourceUrl:url,credit:'Teatrul Odeon · materialul publicat de instituție'}]:[],sourceName:'Teatrul Odeon'});
  }
 }
 if(!items.length)throw new SourceError('Calendarul teatrului nu a transmis spectacole verificabile.');
 return {publishedAt:null,data:{items:[...new Map(items.map(x=>[x.id,x])).values()].sort((a,b)=>a.start.localeCompare(b.start)),sourceUrl:'https://teatrul-odeon.ro/',note:'Program publicat de Teatrul Odeon, ore locale din calendarul vizibil al instituției. Spectacolele se pot modifica.'}};
}
export const odeonLoader:Loader={key:'events:odeon',name:'Teatrul Odeon · calendarul public',url:'https://teatrul-odeon.ro/',version:'odeon.full-calendar.v1',ttl:3600,load:async()=>parseEvents(await getSource('https://teatrul-odeon.ro/',undefined,{maxBytes:8_000_000,timeoutMs:10000}))};
