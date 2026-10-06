'use client';
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import {useEffect,useRef,useState} from 'react';import type {SourceState} from '@/lib/live/types';
export function useSource(url:string|null,options:{timeoutMs?:number;pollMs?:number}={}){
 const [response,setResponse]=useState<{url:string|null;data:SourceState|null;busy:boolean;error:string}>({url:null,data:null,busy:false,error:''}),[revision,setRevision]=useState(0);
 const current=response.url===url?response:{url,data:null,busy:!!url,error:''}, {data,busy,error}=current;
 const previousUrl=useRef(url),serial=useRef(0),attempts=useRef(0),timeoutMs=options.timeoutMs??20000;
 useEffect(()=>{
  if(!url){setResponse({url,data:null,busy:false,error:''});return}
  const controller=new AbortController(),n=++serial.current;let settled=false;
  if(previousUrl.current!==url)attempts.current=0;previousUrl.current=url;
  setResponse(r=>({url,data:r.url===url?r.data:null,busy:true,error:''}));
  const timer=setTimeout(()=>{if(settled||serial.current!==n)return;settled=true;controller.abort();setResponse(r=>({...r,busy:false,error:'La această încercare, sursa nu a transmis răspunsul la timp. Datele deja încărcate rămân disponibile. Poți reîncerca.'}));},timeoutMs);
  fetchWithServerRetry(url,{signal:controller.signal,cache:'no-store'}).then(async r=>{const d:any=await r.json();if(!r.ok)throw Error(d.error||'Cererea nu a reușit.');if(!d.status)throw Error('Răspunsul sursei nu este valid.');return d}).then(d=>{if(serial.current===n&&!settled)setResponse({url,data:d,busy:false,error:''})}).catch(e=>{if(serial.current===n&&!settled&&e.name!=='AbortError')setResponse(r=>({...r,busy:false,error:e.message||'Nu am putut încărca informațiile. Încearcă din nou.'}))}).finally(()=>{clearTimeout(timer);settled=true;if(serial.current===n)setResponse(r=>({...r,busy:false}))});
  return()=>{serial.current++;settled=true;clearTimeout(timer);controller.abort()};
 },[url,revision,timeoutMs]);
 useEffect(()=>{if(!url||busy||attempts.current>=6)return;const sources=data?[data,...(data.data?.sources||[])]:[],stale=sources.filter(s=>s.status==='stale'||s.status==='unavailable');if(!stale.length&&!error&&!options.pollMs)return;const next=stale.map(s=>s.nextAttemptAt?Date.parse(s.nextAttemptAt):0).filter(n=>Number.isFinite(n)&&n>Date.now());const delay=error?60000:next.length?Math.max(5000,Math.min(...next)-Date.now()):options.pollMs|| (stale.some(s=>!s.error)?5000:60000);const timer=setTimeout(()=>{if(document.visibilityState==='visible'&&navigator.onLine){if(!options.pollMs)attempts.current++;setRevision(r=>r+1)}},Math.min(delay,3600000));return()=>clearTimeout(timer)},[url,data,busy,error,options.pollMs]);
 useEffect(()=>{if(!url)return;const online=()=>{attempts.current=0;setRevision(r=>r+1)},visible=()=>{if(document.visibilityState==='visible'&&navigator.onLine)online()};window.addEventListener('online',online);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible)}},[url]);
 return{data,busy,error,retry:()=>{attempts.current=0;setRevision(r=>r+1)}};
}
