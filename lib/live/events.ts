import {getSource,SourceError} from './adapters';import {sourceText} from './text';import {publicUrl} from './media';import type {Loader,Loaded} from './types';import venuesCatalog from '@/public/events/venues.json';
export type EventVenueKind='jsonld'|'tribe-events-v1';
// Registry fields joined back onto calendar items on the venue id the loaders stamp:
// `address` and `placeId` are validated at registry-commit time — the address against
// the institution's own published contact page, the placeId against the committed
// OSM record id — never name-matched at runtime.
export type EventVenue={id:string;name:string;short:string;aliases?:string[];type:string;city:string;county:string;address?:string;latitude:number;longitude:number;url:string;kind:EventVenueKind;placeId?:string};
export const eventVenues=venuesCatalog.items as EventVenue[];
const foldVenue=(v:unknown)=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
export function eventVenue(id:string){const key=foldVenue(id);return eventVenues.find(venue=>venue.id===String(id).trim()||foldVenue(venue.short)===key||foldVenue(venue.name)===key||(venue.aliases||[]).some(alias=>foldVenue(alias)===key))||null}
const venueHost=(venue:EventVenue)=>new URL(venue.url).hostname.replace(/^www\./,'');
const venueCalendar=(venue:EventVenue)=>venue.kind==='tribe-events-v1'?venue.url+'wp-json/tribe/events/v1/events?per_page=100&status=publish':venue.url;
const publishedOn=(url:unknown,venue:EventVenue)=>{const link=publicUrl(url);if(!link)return '';return new URL(link).hostname.replace(/^www\./,'').endsWith(venueHost(venue))?link:''};
// Calendar stamps arrive both as ISO (JSON-LD) and as „Y-m-d H:i:s” (The Events Calendar); local hours are preserved as published.
const localStamp=(value:unknown)=>{if(typeof value!=='string')return undefined;const match=value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{2}:\d{2})/);if(match)return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}T${match[4]}`;
 // Program publicat cu ziua, fără oră locală: schema.org acceptă startDate doar-dată, iar
 // instituția publică exact atât. Evenimentul păstrează data; ora rămâne neanunțată, nu inventată.
 const day=value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);return day?`${day[1]}-${day[2].padStart(2,'0')}-${day[3].padStart(2,'0')}`:undefined};
const uniqueSorted=(items:any[])=>[...new Map(items.map(item=>[item.id,item])).values()].sort((a,b)=>String(a.start).localeCompare(String(b.start)));
export function parseEvents(raw:string,venue:EventVenue=eventVenue('odeon') as EventVenue):Loaded{
 const items:any[]=[];
 for(const match of raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  let parsed:any;try{parsed=JSON.parse(match[1])}catch{continue}
  const rows=Array.isArray(parsed)?parsed:parsed['@graph']||[parsed];
  for(const item of rows){if(!/Event/.test(String(item['@type']))||!item.name||!item.startDate)continue;const url=publishedOn(item.url,venue);if(!url)continue;const start=localStamp(item.startDate);if(!start)continue;
   const image=publishedOn(typeof item.image==='string'?item.image:item.image?.url,venue);
   const offers=Array.isArray(item.offers)?item.offers[0]:item.offers;
   // Programul publicat cu ziua, fără oră: data se păstrează, ora rămâne neanunțată
   // (timeKnown:false). Prețul zero nu dovedește gratuit — priceKnown cere preț pozitiv.
   const dayOnly=typeof item.startDate==='string'&&!item.startDate.includes('T');
   const publishedPrice=typeof offers?.price==='string'||typeof offers?.price==='number'?String(offers.price):null;
   items.push({...item,id:String(item['@id']||url),title:sourceText(item.name),content:sourceText(item.description||''),start,end:localStamp(item.endDate||''),url,ticketUrl:publicUrl(offers?.url)||undefined,timeKnown:!dayOnly,...(publishedPrice!==null?{price:publishedPrice,priceCurrency:offers.priceCurrency||null,priceKnown:Number(publishedPrice)>0}:{}),media:image?[{kind:'image',url:image,caption:sourceText(item.name),sourceUrl:url,credit:venue.name+' · materialul publicat de instituție'}]:[],sourceName:venue.name,venue:venue.id});
   }
  }
 if(!items.length)throw new SourceError('Calendarul teatrului nu a transmis spectacole verificabile.');
 return {publishedAt:null,data:{venue,items:uniqueSorted(items),sourceUrl:venue.url,note:'Program publicat de '+venue.name+', ore locale din calendarul vizibil al instituției. Spectacolele se pot modifica.'}};
}
export function parseTribeEvents(raw:string,venue:EventVenue):Loaded{
 let parsed:any;try{parsed=JSON.parse(raw)}catch{throw new SourceError('Calendarul instituției nu are formatul așteptat.')}
 const rows=Array.isArray(parsed?.events)?parsed.events:null;
 if(!rows)throw new SourceError('Calendarul instituției nu a transmis spectacole verificabile.');
 const items=rows.map((item:any)=>{
  const url=publishedOn(item.url,venue);if(!url)return null;const start=localStamp(item.start_date);if(!start)return null;
  // The institution publishes the same occurrence in both languages; the Romanian edition carries it, the /en/ edition repeats it.
  if(new URL(url).pathname.split('/').includes('en'))return null;
  const image=publishedOn(item.image?.url,venue);
  // Apele la fel: data publicată fără oră rămâne fără oră; costul textual se
  // păstrează, iar priceKnown cere un preț pozitiv publicat — zero nu e gratuit dovedit.
  const dayOnlyTribe=typeof item.start_date==='string'&&!item.start_date.includes(' ');
  const costText=typeof item.cost==='string'?item.cost.trim():'';
  const category=[item.categories].flat().filter(Boolean).map((entry:any)=>sourceText(entry.name)).find(Boolean);
  return {...item,id:String(item.id||item.global_id||url),title:sourceText(item.title),content:sourceText(item.description||item.excerpt||''),start,end:localStamp(item.end_date||''),url,ticketUrl:publicUrl(item.website)||undefined,timeKnown:!dayOnlyTribe,...(costText?{price:costText,priceCurrency:null,priceKnown:Number(costText.replace(/[^\d.]/g,''))>0}:{}),category,media:image?[{kind:'image',url:image,caption:sourceText(item.title),sourceUrl:url,credit:venue.name+' · materialul publicat de instituție'}]:[],sourceName:venue.name,venue:venue.id};
  }).filter((item:any)=>item);
 if(!items.length)throw new SourceError('Calendarul instituției nu a transmis spectacole verificabile.');
 return {publishedAt:null,data:{venue,items:uniqueSorted(items),publishedTotal:Number.isFinite(Number(parsed?.total))?Number(parsed.total):items.length,sourceUrl:venue.url,note:'Program publicat de '+venue.name+' prin calendarul public al instituției (edițiile în limba română). Ore locale; spectacolele se pot modifica.'}};
}
const loaderVersions:Record<EventVenueKind,string>={'jsonld':'events.jsonld.v2','tribe-events-v1':'events.tribe-rest.v1'};
export function eventsLoader(venue:EventVenue):Loader{return{key:'events:'+venue.id,name:venue.name+' · calendarul public',url:venue.url,version:loaderVersions[venue.kind],ttl:1800,load:async()=>(venue.kind==='tribe-events-v1'?parseTribeEvents:parseEvents)(await getSource(venueCalendar(venue),undefined,{maxBytes:8_000_000,timeoutMs:15000}),venue)}}
export const odeonLoader:Loader=eventsLoader(eventVenue('odeon') as EventVenue);
