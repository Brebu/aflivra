'use client';
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import {useEffect,useRef,useState} from 'react';import type {SourceState} from '@/lib/live/types';
/* Ultima copie validă pe sesiune: la remontarea unei secțiuni, răspunsul bun anterior
   apare imediat, iar revalidarea rulează în fundal; un răspuns byte-identic nu mai
   re-randează secțiunea. Aceeași filosofie ca a oricărei surse: ultima copie validă
   rămâne vizibilă, cu data ei, până când una nouă o înlocuiește. */
const lastGood=new Map<string,{text:string;data:SourceState}>();
const lastGoodLimit=48;
function rememberGood(url:string,text:string,data:SourceState){
 if(lastGood.has(url))lastGood.delete(url);
 else if(lastGood.size>=lastGoodLimit)lastGood.delete(lastGood.keys().next().value as string);
 lastGood.set(url,{text,data});
}
export function useSource(url:string|null,options:{timeoutMs?:number;pollMs?:number}={}){
 const [response,setResponse]=useState<{url:string|null;data:SourceState|null;busy:boolean;error:string}>({url:null,data:null,busy:false,error:''}),[revision,setRevision]=useState(0);
 const initialData=url?lastGood.get(url)?.data||null:null;
 const current=response.url===url?response:{url,data:initialData,busy:!!url&&!initialData,error:''}, {data,busy,error}=current;
 const previousUrl=useRef(url),serial=useRef(0),attempts=useRef(0),timeoutMs=options.timeoutMs??20000;
 useEffect(()=>{
  if(!url){setResponse({url,data:null,busy:false,error:''});return}
  const controller=new AbortController(),n=++serial.current;let settled=false;
  if(previousUrl.current!==url)attempts.current=0;previousUrl.current=url;
  setResponse(r=>({url,data:r.url===url?r.data:lastGood.get(url)?.data||null,busy:!!url&&!lastGood.has(url),error:''}));
  const timer=setTimeout(()=>{if(settled||serial.current!==n)return;settled=true;controller.abort();
   const cached=lastGood.get(url);
   setResponse(r=>r.url!==url?r:{...r,busy:false,error:cached?.data?'':'La această încercare, sursa nu a transmis răspunsul la timp. Datele deja încărcate rămân disponibile. Poți reîncerca.'});
  },timeoutMs);
  fetchWithServerRetry(url,{signal:controller.signal,cache:'no-store'}).then(async r=>{
   const text=await r.text();
   const d:any=text?JSON.parse(text):null;
   if(!r.ok)throw Error(d.error||'Cererea nu a reușit.');
   if(!d.status)throw Error('Răspunsul sursei nu este valid.');
   return {text,d};
  }).then(({text,d})=>{
   if(serial.current!==n||settled)return;
   const cached=lastGood.get(url);
   if(d.status!=='unavailable')rememberGood(url,text,d);
   /* Byte-identic cu copia afișată: fără setResponse, fără a doua randare a secțiunii. */
   if(!cached||text!==cached.text)setResponse({url,data:d,busy:false,error:''});
  }).catch(e=>{
   if(serial.current!==n||e.name==='AbortError')return;
   const cached=lastGood.get(url);
   /* Cu o copie validă în mână, rată revalidării nu înlătură copia: rămâne vizibilă, cu data ei. */
   if(cached)setResponse(r=>{
    if(r.url!==url)return r;
    if(r.data===cached.data&&!r.busy)return r;
    return r.data===cached.data?{...r,busy:false}:{url,data:cached.data,busy:false,error:''};
   });
   else setResponse(r=>r.url===url?{...r,busy:false,error:e.message||'Nu am putut încărca informațiile. Încearcă din nou.'}:r);
  }).finally(()=>{clearTimeout(timer);settled=true;if(serial.current===n)setResponse(r=>r.busy?{...r,busy:false}:r)});
  return()=>{serial.current++;settled=true;clearTimeout(timer);controller.abort()};
 },[url,revision,timeoutMs]);
 useEffect(()=>{if(!url||busy||attempts.current>=6)return;const sources=data?[data,...(data.data?.sources||[])]:[],stale=sources.filter(s=>s.status==='stale'||s.status==='unavailable');if(!stale.length&&!error&&!options.pollMs)return;const next=stale.map(s=>s.nextAttemptAt?Date.parse(s.nextAttemptAt):0).filter(n=>Number.isFinite(n)&&n>Date.now());const delay=error?60000:next.length?Math.max(5000,Math.min(...next)-Date.now()):options.pollMs|| (stale.some(s=>!s.error)?5000:60000);const timer=setTimeout(()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(!options.pollMs)attempts.current++;setRevision(r=>r+1)}},Math.min(delay,3600000));return()=>clearTimeout(timer)},[url,data,busy,error,options.pollMs]);
 useEffect(()=>{if(!url)return;const online=()=>{attempts.current=0;setRevision(r=>r+1)},visible=()=>{if(document.visibilityState==='visible'&&navigator.onLine)online()};window.addEventListener('online',online);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible)}},[url]);
 return{data,busy,error,retry:()=>{attempts.current=0;setRevision(r=>r+1)}};
}
