'use client';
import React,{createContext,useCallback,useContext,useEffect,useId,useMemo,useRef,useState} from 'react';
import {LocateFixed,MapPin} from 'lucide-react';
import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';
import {defaultCity,defaultCountry,validPoint,nearestLocality,distanceKm,type LocalCity} from '@/lib/location-context';
import {withLocalCounty} from '@/lib/geographic-scope';
import {cityPositions} from './v2-model';
import {WatchButton} from './watch-button';import {normalizeSearch} from '@/lib/live/query';import {snapshotJson} from './snapshot-store';
export {distanceKm};
export type Position={lat:number;lon:number;accuracy:number};
type Mode='default'|'manual'|'device';
type LocationState={position:Position|null;city:LocalCity;locality:LocalCity|null;center:{lat:number;lon:number};country:string;mode:Mode;hasLocal:boolean;key:string;label:string;cities:LocalCity[];busy:boolean;error:string;request:()=>void;clear:()=>void;selectCity:(city:LocalCity)=>void};
const storageKey='aflivra.location.v1';
const initial:LocationState={position:null,city:defaultCity,locality:null,center:defaultCity,country:defaultCountry,mode:'default',hasLocal:false,key:'default',label:'România · oraș implicit București',cities:cityPositions,busy:false,error:'',request:()=>{},clear:()=>{},selectCity:()=>{}};
const LocationContext=createContext<LocationState>(initial);
export function LocationProvider({children}:{children:React.ReactNode}){
 const [position,setPosition]=useState<Position|null>(null),[mode,setMode]=useState<Mode>('default'),[manual,setManual]=useState<LocalCity>(defaultCity),[cities,setCities]=useState<LocalCity[]>(cityPositions),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const watcher=useRef<number|null>(null),generation=useRef(0);
 const save=useCallback((value:object)=>{try{localStorage.setItem(storageKey,JSON.stringify(value))}catch{}},[]);
 const stop=useCallback(()=>{generation.current++;if(watcher.current!==null){navigator.geolocation?.clearWatch(watcher.current);watcher.current=null}setBusy(false)},[]);
 const request=useCallback(()=>{
  stop();const current=generation.current;
  if(!navigator.geolocation){setError('Localizarea nu este disponibilă. Folosim România și București; poți alege altă localitate.');return}
  setBusy(true);setError('');save({mode:'device'});
  watcher.current=navigator.geolocation.watchPosition(p=>{
   if(current!==generation.current)return;
   const point={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};if(!validPoint(point))return;
   setPosition(point);setMode('device');setBusy(false);setError('');
  },e=>{
   if(current!==generation.current)return;stop();setPosition(null);setManual(defaultCity);setMode('default');
   if(e.code===1)save({mode:'default'});
   setError(e.code===1?'Localizarea nu a fost permisă. Folosim România și București; poți alege localitatea manual.':e.code===3?'Poziția nu a fost primită la timp. Folosim România și București până la o nouă localizare.':'Poziția nu este disponibilă. Folosim România și București; poți alege localitatea manual.');
  },{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
 },[save,stop]);
 const clear=useCallback(()=>{stop();setPosition(null);setManual(defaultCity);setMode('default');setError('');save({mode:'default'})},[stop,save]);
 const selectCity=useCallback((city:LocalCity)=>{if(!city.name?.trim()||!validPoint(city))return;stop();setPosition(null);setManual(withLocalCounty(city));setMode('manual');setError('');save({mode:'manual',city})},[stop,save]);
 useEffect(()=>{
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.mode==='manual'&&saved.city?.name&&validPoint(saved.city)){selectCity(saved.city);return stop}if(saved?.mode==='default')return stop;
   if(!saved){const old=JSON.parse(localStorage.getItem('reper.v2.preferences')||'null'),city=cityPositions.find(c=>c.name===old?.city&&c.name!==defaultCity.name);if(city){selectCity(city);return stop}}
  }catch{}
  request();return stop;
 },[request,selectCity,stop]);
 useEffect(()=>{const controller=new AbortController();snapshotJson('/places/manifest.json',undefined,controller.signal).then(m=>snapshotJson('/places/cities.json',m.cities,controller.signal)).then(d=>{if(Array.isArray(d.items))setCities(d.items.filter((c:LocalCity)=>c.name&&validPoint(c)).map(withLocalCounty))}).catch(()=>{});return()=>controller.abort()},[]);
 const locality=useMemo(()=>{const city=position?nearestLocality(position,cities):mode==='manual'?manual:null;return city?withLocalCounty(city):null},[position,cities,mode,manual]),city=locality?withLocalCounty(locality):defaultCity,center=position||city,hasLocal=!!position||mode==='manual';
 const key=position?`device:${position.lat.toFixed(3)}:${position.lon.toFixed(3)}:${locality?.name||''}`:mode==='manual'?`manual:${city.name}:${city.lat}:${city.lon}`:'default';
 const label=position?(locality?'Aproape de '+locality.name:'Poziția dispozitivului'):hasLocal?city.name:initial.label;
 return <LocationContext.Provider value={{position,city,locality,center,country:defaultCountry,mode,hasLocal,key,label,cities,busy,error,request,clear,selectCity}}>{children}</LocationContext.Provider>;
}
export const useLocation=()=>useContext(LocationContext);
export function LocationCityPicker(){
 const geo=useLocation(),id=useId(),cityLabel=geo.city.name+(geo.city.county&&geo.city.county!==geo.city.name?' · '+geo.city.county:''),[draft,setDraft]=useState(cityLabel);
 useEffect(()=>setDraft(cityLabel),[geo.key,cityLabel]);
 const index=useMemo(()=>{
  const counts=new Map<string,number>();for(const c of geo.cities){const label=c.name+(c.county&&c.county!==c.name?' · '+c.county:'');counts.set(label,(counts.get(label)||0)+1)}const exact=new Map<string,LocalCity|null>(),items=geo.cities.map(city=>{const base=city.name+(city.county&&city.county!==city.name?' · '+city.county:''),label=(counts.get(base)||0)>1?base+' · '+city.lat.toFixed(3)+', '+city.lon.toFixed(3):base,folded=normalizeSearch(label);exact.set(folded,exact.has(folded)?null:city);return{city,label,folded}});
  return{items,exact};
 },[geo.cities]);
 const query=normalizeSearch(draft),chosen:LocalCity|undefined=index.exact.get(query)||cityPositions.find(c=>normalizeSearch(c.name)===query);
 const matches=useMemo(()=>{const found:typeof index.items=[];for(const item of index.items){if(item.folded.includes(query))found.push(item);if(found.length===30)break}return found},[index,query]);
 function apply(){if(chosen){geo.selectCity(chosen);setDraft(chosen.name+(chosen.county&&chosen.county!==chosen.name?' · '+chosen.county:''))}}
 return <div className="location-city-picker"><label htmlFor={id}>Localitate</label><div className="location-city-input"><Input id={id} list={id+'-options'} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply()}}} placeholder="Caută o localitate" autoComplete="off"/><Button type="button" variant="outline" onClick={apply} disabled={!chosen}>Aplică localitatea</Button></div><datalist id={id+'-options'}>{matches.map(item=><option key={item.label+':'+item.city.lat} value={item.label}/>)}</datalist><small>Alege din listă și aplică localitatea. Vremea și datele locale se actualizează automat.</small>
   <div className="location-watch-row"><WatchButton kind="localitate" target={geo.city.name} name={geo.city.name}/></div></div>;
}
export function LocationControl({onManual,compact=false}:{onManual?:()=>void;compact?:boolean}){const l=useLocation();return <div className={'location-control '+(compact?'compact':'')}><Button variant="outline" onClick={l.request} disabled={l.busy}><LocateFixed size={17}/>{l.busy?'Localizare…':l.position?'Actualizează poziția':'Folosește locația mea'}</Button>{!compact&&<><p role="status">{l.label}{l.position?` · precizie aproximativă ${Math.round(l.position.accuracy)} m. Poziția și datele locale se actualizează automat.`:'. Contextul local se aplică datelor care au informații geografice.'}</p>{l.hasLocal&&<button className="text-link" onClick={l.clear}>{l.position?'Oprește localizarea · revino la România':'Revino la România · București implicit'}</button>}{onManual&&<button className="text-link" onClick={onManual}><MapPin size={15}/>Alege localitatea manual</button>}</>}{l.error&&<p role="status">{l.error}</p>}</div>}
