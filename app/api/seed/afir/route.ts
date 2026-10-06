import {env} from 'cloudflare:workers';
import {createHash,timingSafeEqual} from 'node:crypto';
import {afirLoader,parseAfir} from '@/lib/live/feeds';
import {articleLoader,articleUrl,parseArticlePage} from '@/lib/live/content';
import {cachedCopyServes,publishLoaded,type Row} from '@/lib/live/cache';
import {canonicalUrl,uniqueRecords} from '@/lib/live/records';
import {SourceError} from '@/lib/live/adapters';
import type {Loaded} from '@/lib/live/types';
export const dynamic='force-dynamic';
// Tokenul se compară pe rezumatul SHA-256 al ambelor valori, în timp constant: nici lungimea, nici prima
// poziție diferită nu scurg informație despre secretul din mediul de execuție.
const tokenValid=(token:string,header:string|null)=>{if(!token||!header?.startsWith('Bearer '))return false;const digest=(value:string)=>createHash('sha256').update(value).digest();return timingSafeEqual(digest(header.slice(7)),digest(token))};
const FEED_CAP=5_000_000,ARTICLE_CAP=8_000_000,RELAY_CAP=10;
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string)=>json({error},400);
// Sursa AFIR blochează egress-ul Workerilor: runnerul extern aduce paginile, iar ruta le publică
// prin parserul și setterul exact pe care cititorul le folosește, la aceleași chei de stocare.
const afirArticle=(value:string)=>{const url=new URL(articleUrl(value));if(url.hostname.replace(/^www\./,'')!=='afir.ro')throw new SourceError('Doar comunicatele publicației AFIR se preiau prin relay.');return url.href};
const relayLoader=(value:string)=>{try{return articleLoader(value)}catch{return null}};
export async function POST(request:Request){
  const token=env.REFRESH_TOKEN||'';
  if(!token||!tokenValid(token,request.headers.get('authorization')))return json({error:'Acces interzis.'},401);
  const db=env.DB;
  if(!db)return json({error:'Starea persistentă a surselor este temporar indisponibilă.'},503);
  let body:any;try{body=await request.json()}catch{return reject('Cererea nu poate fi citită ca JSON.')}
  const phase=body?.phase;
  if(phase!=='feed'&&phase!=='articles')return reject('Faza de preluare „'+String(phase).slice(0,40)+'” nu există. Faze valide: feed, articles.');
  return phase==='feed'?await relayFeed(db,body):await relayArticles(db,body);
}
async function relayFeed(db:D1Database,body:any){
  const raw=body?.body;
  if(typeof raw!=='string'||!raw.length)return reject('Lipsește corpul paginii AFIR de preluat.');
  if(raw.length>FEED_CAP)return reject('Corpul paginii AFIR depășește limita permisă.');
  let feed:Loaded;try{feed=parseAfir(raw)}catch(e){return reject(e instanceof Error?e.message:'Structura comunicatelor AFIR s-a schimbat.')}
  let want:string[];try{
    want=[];
    for(const item of feed.data.items){
      const loader=relayLoader(item.url);
      if(loader){
        const row=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>();
        if(!cachedCopyServes(row,loader.version))want.push(item.url);
      }
      if(want.length>=RELAY_CAP)break;
    }
  }catch{console.warn(JSON.stringify({event:'afir_relay_state_failure',message:'starea articolelor relay-ului nu a putut fi citită'}));return json({error:'Starea persistentă a surselor este temporar indisponibilă.'},503)}
  let feedStored=true,error:string|null=null;
  try{
    const prior=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(afirLoader.key).first<Row>();
    await publishLoaded(db,afirLoader,prior,feed);
  }catch(e){feedStored=false;error=e instanceof Error?e.message:'Copia de flux nu a putut fi publicată.';console.warn(JSON.stringify({event:'afir_relay_feed_failure',message:error}))}
  return json({result:feedStored?'ok':'partial',phase:'feed',items:feed.data.items.length,want,feedStored,...(error?{error}:{}),servedAt:new Date().toISOString()});
}
async function relayArticles(db:D1Database,body:any){
  const items=body?.items;
  if(!Array.isArray(items)||!items.length)return reject('Lipsește lista de articole de preluat.');
  if(items.length>RELAY_CAP)return reject('Lista depășește limita de '+RELAY_CAP+' articole pe preluare.');
  for(let at=0;at<items.length;at++){
    const item=items[at];
    if(!item||typeof item.url!=='string'||typeof item.html!=='string')return reject('Articolul '+at+' nu are adresă și pagină de preluat.');
    if(item.url.length>2000)return reject('Adresa articolului '+at+' depășește limita permisă.');
    if(!item.html.length)return reject('Pagina articolului '+at+' este goală.');
    if(item.html.length>ARTICLE_CAP)return reject('Pagina articolului '+at+' depășește limita permisă.');
    try{afirArticle(item.url)}catch(e){return reject('Articolul '+at+' nu este un comunicat AFIR valid: '+(e instanceof Error?e.message:'adresa nu poate fi verificată.'))}
  }
  const stored:string[]=[],failed:{url:string;error:string}[]=[];
  for(const item of uniqueRecords(items,(x:any)=>canonicalUrl(afirArticle(x.url)))){
    try{
      const loader=articleLoader(item.url);
      const prior=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>();
      await publishLoaded(db,loader,prior,parseArticlePage(item.html,loader.url));
      stored.push(item.url);
    }catch(e){failed.push({url:item.url,error:e instanceof Error?e.message:'Publicația nu a putut fi preluată.'})}
  }
  return json({result:failed.length?'partial':'ok',phase:'articles',stored,failed,servedAt:new Date().toISOString()});
}
