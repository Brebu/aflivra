'use client';
import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {useLocation} from './location';import {useSource} from './use-source';
import {forecastConfig,parseForecast} from '@/lib/live/forecast';
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import type {SourceState} from '@/lib/live/types';
const WeatherContext=createContext<ReturnType<typeof useSource>>({data:null,busy:false,error:'',retry:()=>{}});
export function useForecast(center:{lat:number;lon:number}){
 const config=forecastConfig(center.lat,center.lon),key=config.key,server=useSource('/api/weather?'+new URLSearchParams({lat:center.lat.toFixed(2),lon:center.lon.toFixed(2)}),{pollMs:600000});
 const [direct,setDirect]=useState<{key:string;data:SourceState|null;busy:boolean;error:string}>({key:'',data:null,busy:false,error:''}),[revision,setRevision]=useState(0),latest=useRef(direct),appliedRevision=useRef(0);latest.current=direct;
 const needsDirect=!server.busy&&(!!server.error||!!server.data?.error||server.data?.status==='unavailable');
 useEffect(()=>{
  if(!needsDirect)return;
  const forced=appliedRevision.current!==revision;appliedRevision.current=revision;
  const prior=latest.current;if(!forced&&prior.key===key&&prior.data&&Date.parse(prior.data.lastSuccessAt||'')+config.ttl*1000>Date.now())return;
  const controller=new AbortController();let active=true;const checkedAt=new Date().toISOString();
  setDirect(old=>({key,data:old.key===key?old.data:null,busy:true,error:''}));
  const timer=setTimeout(()=>{if(!active)return;active=false;controller.abort();setDirect(old=>({...old,busy:false,error:'Prognoza nu a răspuns la timp. Reîncearcă.'}))},20000);
  fetchWithServerRetry(config.requestUrl,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'},{deadlineAt:Date.now()+20000}).then(async response=>{
   if(!response.ok)throw Error(response.status===429?'Open-Meteo limitează temporar cererile. Reîncearcă în câteva minute.':`Prognoza este temporar indisponibilă (HTTP ${response.status}).`);
   const loaded=parseForecast(await response.text());return{key,name:config.name,url:config.url,adapterVersion:config.version,status:'fresh' as const,...loaded,lastSuccessAt:new Date().toISOString(),lastAttemptAt:checkedAt,nextAttemptAt:null,error:null,ttlSeconds:config.ttl};
  }).then(data=>{if(active)setDirect({key,data,busy:false,error:''})}).catch(error=>{if(active)setDirect(old=>({...old,busy:false,error:error instanceof Error?error.message:'Prognoza nu a putut fi încărcată.'}))}).finally(()=>clearTimeout(timer));
  return()=>{active=false;clearTimeout(timer);controller.abort()};
 },[key,needsDirect,server.data?.lastAttemptAt,server.error,revision]);
 const local=direct.key===key?direct:null,preferred=local?.data&&Date.parse(local.data.lastSuccessAt||'')>Date.parse(server.data?.lastSuccessAt||'1970-01-01')?local.data:server.data;
 const data=preferred&&preferred===local?.data&&Date.parse(preferred.lastSuccessAt||'')+config.ttl*1000<Date.now()?{...preferred,status:'stale' as const}:preferred;
 return{data,busy:server.busy||needsDirect&&!!local?.busy,error:needsDirect?local?.error||server.error:server.error,retry:()=>{setRevision(value=>value+1);server.retry()}};
}
export function LocalWeatherProvider({children}:{children:React.ReactNode}){const {center}=useLocation(),state=useForecast(center);return <WeatherContext.Provider value={state}>{children}</WeatherContext.Provider>}
export const useLocalWeather=()=>useContext(WeatherContext);
