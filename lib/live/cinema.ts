import {getSource,SourceError} from './adapters';import type {Loader,Loaded} from './types';
import {publicUrl,embeddedMedia} from './media';import {sourceText} from './text';
import cinemaCatalog from '@/public/cinema/cinemas.json';
export const cinemaSites=cinemaCatalog.items;
export function parseCinema(raw:string,cinemaId:string,date:string):Loaded{
 const body=JSON.parse(raw).body,cinema=cinemaSites.find(x=>x.externalCode===cinemaId);
 if(!cinema||!Array.isArray(body?.films)||!Array.isArray(body?.events))throw new SourceError('Programul cinema nu a fost transmis în formatul așteptat.');
 const films=body.films.map((f:any)=>{const trailer=embeddedMedia(f.videoLink);return{...f,title:sourceText(f.name),url:publicUrl(f.link),media:[...(publicUrl(f.posterLink)?[{kind:'image',url:publicUrl(f.posterLink),caption:'Poster · '+sourceText(f.name),sourceUrl:publicUrl(f.link),credit:'Cinema City · materialul distribuit de operator'}]:[]),...(trailer?[{kind:'embed',url:trailer.url,watchUrl:trailer.watchUrl,poster:publicUrl(f.posterLink),caption:'Trailer publicat de operator',sourceUrl:publicUrl(f.link)}]:[])],shows:body.events.filter((e:any)=>e.filmId===f.id&&e.businessDay===date).sort((a:any,b:any)=>a.eventDateTime.localeCompare(b.eventDateTime))}}).filter((f:any)=>f.shows.length);
 return{publishedAt:null,data:{date,cinema,films,filmCount:films.length,eventCount:films.reduce((n:number,f:any)=>n+f.shows.length,0),sourceUrl:'https://www.cinemacity.ro'+cinema.uri+'/'+cinemaId,metadata:body,note:'Programul și materialele publicate de Cinema City. Ore locale; disponibilitatea biletelor se poate modifica.'}};
}

export const cinemaLoader=(cinemaId:string,date:string):Loader=>({key:'cinema:'+cinemaId+':'+date,name:'Cinema City · programul operatorului',url:'https://www.cinemacity.ro'+(cinemaSites.find(x=>x.externalCode===cinemaId)?.uri||'/cinemas')+'/'+cinemaId,version:'cinemacity.program-complete.v2',ttl:900,load:async()=>parseCinema(await getSource('https://www.cinemacity.ro/ro/data-api-service/v1/quickbook/10107/film-events/in-cinema/'+cinemaId+'/at-date/'+date+'?attr=',undefined,{maxBytes:8_000_000,timeoutMs:10000}),cinemaId,date)});
