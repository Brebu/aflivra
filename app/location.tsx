'use client';
import React,{createContext,useCallback,useContext,useDeferredValue,useEffect,useId,useMemo,useRef,useState} from 'react';
import {LocateFixed,MapPin} from 'lucide-react';
import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';
import {defaultCity,defaultCountry,validPoint,nearestLocality,distanceKm,type LocalCity} from '@/lib/location-context';
import {withLocalCounty} from '@/lib/geographic-scope';
import {cityPositions} from './v2-model';
import {WatchButton} from './watch-button';import {normalizeSearch} from '@/lib/live/query';import {snapshotJson} from './snapshot-store';
export {distanceKm};
export type Position={lat:number;lon:number;accuracy:number};
type Mode='default'|'manual'|'device';
type LocationState={position:Position|null;city:LocalCity;locality:LocalCity|null;center:{lat:number;lon:number};country:string;mode:Mode;hasLocal:boolean;key:string;areaKey:string;label:string;cities:LocalCity[];busy:boolean;error:string;request:()=>void;clear:()=>void;selectCity:(city:LocalCity)=>void};
const storageKey='aflivra.location.v1';
const initial:LocationState={position:null,city:defaultCity,locality:null,center:defaultCity,country:defaultCountry,mode:'default',hasLocal:false,key:'default',areaKey:'default',label:'România · oraș implicit București',cities:cityPositions,busy:false,error:'',request:()=>{},clear:()=>{},selectCity:()=>{}};
const LocationContext=createContext<LocationState>(initial);
export function LocationProvider({children}:{children:React.ReactNode}){
 const [position,setPosition]=useState<Position|null>(null),[mode,setMode]=useState<Mode>('default'),[manual,setManual]=useState<LocalCity>(defaultCity),[cities,setCities]=useState<LocalCity[]>(cityPositions),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const watcher=useRef<number|null>(null),generation=useRef(0),cell=useRef(''),lastFix=useRef<Position|null>(null);
 const save=useCallback((value:object)=>{try{localStorage.setItem(storageKey,JSON.stringify(value))}catch{}},[]);
 const stop=useCallback(()=>{generation.current++;cell.current='';if(watcher.current!==null){navigator.geolocation?.clearWatch(watcher.current);watcher.current=null}setBusy(false)},[]);
 const request=useCallback(()=>{
   stop();const current=generation.current;
   if(!navigator.geolocation){setError('Localizarea nu este disponibilă. Folosim România și București; poți alege altă localitate.');return}
   setBusy(true);setError('');save({mode:'device'});
   watcher.current=navigator.geolocation.watchPosition(p=>{
    if(current!==generation.current)return;
    const point={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};if(!validPoint(point))return;
    /* O celulă de 3 zecimale (~100 m) este propria rotunjire a contextului geografic al aplicației;
       un fix în aceeași celulă nu schimbă nimic din ce se afișează, așa că nu re-randăm pagina pentru el. */
    const nextCell=point.lat.toFixed(3)+':'+point.lon.toFixed(3);
    if(nextCell===cell.current)return;
    cell.current=nextCell;lastFix.current=point;
    setPosition(point);setMode('device');setBusy(false);setError('');
   },e=>{
    if(current!==generation.current)return;
    /* Eroarea tranzitorie (POSITION_UNAVAILABLE, code 3) apare la fiecare schimbare de sursă
       a poziției și nu trebuie să demoleze un context funcțional: păstrăm ultima poziție bună
       până la următorul fix; doar refuzul permisiunii (code 1) oprește onest. */
    if(e.code===3&&lastFix.current){if(current!==generation.current)return;setError('');return}
    stop();setPosition(null);setManual(defaultCity);setMode('default');
    if(e.code===1)save({mode:'default'});
    setError(e.code===1?'Localizarea nu a fost permisă. Folosim România și București; poți alege localitatea manual.':e.code===3?'Poziția nu a fost primită la timp. Folosim România și București până la o nouă localizare.':'Poziția nu este disponibilă. Folosim România și București; poți alege localitatea manual.');
   },{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
  },[save,stop]);
  const clear=useCallback(()=>{stop();setPosition(null);lastFix.current=null;setManual(defaultCity);setMode('default');setError('');save({mode:'default'})},[stop,save]);
  const selectCity=useCallback((city:LocalCity)=>{if(!city.name?.trim()||!validPoint(city))return;stop();setPosition(null);lastFix.current=null;setManual(withLocalCounty(city));setMode('manual');setError('');save({mode:'manual',city})},[stop,save]);
  useEffect(()=>{
   try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.mode==='manual'&&saved.city?.name&&validPoint(saved.city)){selectCity(saved.city);return stop}if(saved?.mode==='default')return stop;
    if(!saved){const old=JSON.parse(localStorage.getItem('reper.v2.preferences')||'null'),city=cityPositions.find(c=>c.name===old?.city&&c.name!==defaultCity.name);if(city){selectCity(city);return stop}}
   }catch{}
   request();return stop;
  },[request,selectCity,stop]);
  useEffect(()=>{const controller=new AbortController();snapshotJson('/places/manifest.json',undefined,controller.signal).then(m=>snapshotJson('/places/cities.json',m.cities,controller.signal)).then(d=>{if(Array.isArray(d.items))setCities(d.items.filter((c:LocalCity)=>c.name&&validPoint(c)).map(withLocalCounty))}).catch(()=>{});return()=>controller.abort()},[]);
  const locality=useMemo(()=>{const city=position?nearestLocality(position,cities):mode==='manual'?manual:null;return city?withLocalCounty(city):null},[position,cities,mode,manual]),city=locality?withLocalCounty(locality):defaultCity,center=position||city,hasLocal=!!position||mode==='manual';
 const key=position?`device:${position.lat.toFixed(3)}:${position.lon.toFixed(3)}:${locality?.name||''}`:mode==='manual'?`manual:${city.name}:${city.lat}:${city.lon}`:'default';
 /* Area identity for state that follows WHERE you are, not the raw fix: the resolved
    locality (name + county), the manual city, or the default. A GPS fix quantizing
    into the next ~100 m cell — or the async city list re-resolving the same nearest
    locality — keeps this key, so dialogs and readers survive background drift; only
    an actual locality change re-keys it. The cell key above stays for consumers where
    the coordinates themselves matter (radius filters, map view keys). */
 const areaKey=position?locality?`local:${locality.name}|${locality.county||''}`:'device:none':mode==='manual'?`manual:${city.name}|${city.county||''}`:'default';
 const label=position?(locality?'Aproape de '+locality.name:'Poziția dispozitivului'):hasLocal?city.name:initial.label;
 return <LocationContext.Provider value={{position,city,locality,center,country:defaultCountry,mode,hasLocal,key,areaKey,label,cities,busy,error,request,clear,selectCity}}>{children}</LocationContext.Provider>;
}
export const useLocation=()=>useContext(LocationContext);

type CityIndexEntry={city:LocalCity;label:string;nameFolded:string;labelFolded:string;typeRank:number;typeLabel:string};
type CityIndex={items:CityIndexEntry[];exact:Map<string,LocalCity|null>};
const suggestionCollator=new Intl.Collator('ro',{numeric:true});
const cityLabelOf=(city:LocalCity)=>city.name+(city.county&&city.county!==city.name?' · '+city.county:'');
const typeRankOf=(type?:string)=>type==='city'?0:type==='town'?1:type==='village'?2:3;
const typeLabelOf=(type?:string)=>type==='city'||type==='town'?'oraș':type==='village'?'sat':type==='hamlet'?'cătun':'localitate';
const compareEntries=(a:CityIndexEntry,b:CityIndexEntry)=>a.typeRank-b.typeRank||suggestionCollator.compare(a.city.name,b.city.name);
/* Indexul comun de localități se construiește o dată pe corpus și se partajează între
   toate instanțele selectorului (foaia de preferințe și spațiul de locuri), nu o dată per montare. */
const cityIndexCache=new WeakMap<LocalCity[],CityIndex>();
function buildCityIndex(cities:LocalCity[]):CityIndex{
 const cached=cityIndexCache.get(cities);if(cached)return cached;
 const counts=new Map<string,number>();for(const c of cities){const base=cityLabelOf(c);counts.set(base,(counts.get(base)||0)+1)}
 const exact=new Map<string,LocalCity|null>(),items:CityIndexEntry[]=[];
 for(const city of cities){
  const base=cityLabelOf(city),label=(counts.get(base)||0)>1?base+' · '+city.lat.toFixed(3)+', '+city.lon.toFixed(3):base,nameFolded=normalizeSearch(city.name),labelFolded=normalizeSearch(label);
  /* Numele simplu rezolvă spre purtătorul cel mai important (oraș înainte de sat);
     dubiozitățile de coordonate rămân la eticheta completă, cu null ca până acum. */
  if(!exact.has(nameFolded))exact.set(nameFolded,city);
  else{const previous=exact.get(nameFolded);if(previous&&typeRankOf(city.type)<typeRankOf(previous.type))exact.set(nameFolded,city)}
  if(labelFolded!==nameFolded)exact.set(labelFolded,exact.has(labelFolded)?null:city);
  items.push({city,label,nameFolded,labelFolded,typeRank:typeRankOf(city.type),typeLabel:typeLabelOf(city.type)});
 }
 const index={items,exact};cityIndexCache.set(cities,index);return index;
}
const SUGGESTION_LIMIT=8;
/* Ordinea: potrivire exactă, prefix pe nume, început de cuvânt, numele conține,
   apoi eticheta cu județ — județul nu mai îngroapă orașul sub satele lui. */
function rankSuggestions(index:CityIndex,query:string,limit=SUGGESTION_LIMIT):CityIndexEntry[]{
 if(!query)return[];
 const best:{score:number;entry:CityIndexEntry}[]=[];
 const better=(score:number,entry:CityIndexEntry)=>score<best[best.length-1].score||(score===best[best.length-1].score&&compareEntries(entry,best[best.length-1].entry)<0);
 const place=(score:number,entry:CityIndexEntry)=>{
  if(best.length<limit){best.push({score,entry});best.sort((a,b)=>a.score-b.score||compareEntries(a.entry,b.entry))}
  else if(better(score,entry)){best[best.length-1]={score,entry};best.sort((a,b)=>a.score-b.score||compareEntries(a.entry,b.entry))}
 };
 for(const entry of index.items){
  if(entry.labelFolded===query||entry.nameFolded===query)place(0,entry);
  else if(entry.nameFolded.startsWith(query))place(1,entry);
  else if(entry.nameFolded.includes(' '+query))place(2,entry);
  else if(entry.nameFolded.includes(query))place(3,entry);
  else if(entry.labelFolded.includes(query))place(4,entry);
 }
 return best.map(row=>row.entry);
}
function currentEntry(index:CityIndex,city:LocalCity):CityIndexEntry|undefined{
 const name=normalizeSearch(city.name);
 return index.items.find(entry=>entry.nameFolded===name&&Math.abs(entry.city.lat-city.lat)<0.05&&Math.abs(entry.city.lon-city.lon)<0.05)||index.items.find(entry=>entry.nameFolded===name);
}
export function LocationCityPicker(){
  const geo=useLocation(),id=useId(),cityLabel=cityLabelOf(geo.city),[draft,setDraft]=useState(cityLabel),[open,setOpen]=useState(false),[active,setActive]=useState(0);
  /* Doar eticheta localității resincronizează câmpul — un fix de poziție care nu schimbă
     localitatea rezolvată nu mai șterge ce tastează utilizatorul. */
  useEffect(()=>setDraft(cityLabel),[cityLabel]);
  const index=useMemo(()=>buildCityIndex(geo.cities),[geo.cities]);
  const query=normalizeSearch(draft),chosen:LocalCity|undefined=index.exact.get(query)||cityPositions.find(c=>normalizeSearch(c.name)===query);
  /* Lista se ridică pe valoarea amânată: tasta răspunde instant, scanarea rămâne în afara ei. */
  const deferredQuery=useDeferredValue(query);
  const ranked=useMemo(()=>rankSuggestions(index,deferredQuery),[index,deferredQuery]);
  const current=useMemo(()=>currentEntry(index,geo.city),[index,geo.city]);
  const rows=deferredQuery?ranked:(current?[current]:[]);
  function apply(city?:LocalCity){const target=city??chosen;if(!target||!target.name?.trim()||!validPoint(target))return;geo.selectCity(target);setDraft(cityLabelOf(target))}
  function choose(entry:CityIndexEntry){apply(entry.city);setOpen(false)}
  function activate(next:number){setActive(Math.max(0,Math.min(next,rows.length-1)))}
  const inputHandlers:{onFocus:React.FocusEventHandler<HTMLInputElement>;onChange:React.ChangeEventHandler<HTMLInputElement>;onKeyDown:React.KeyboardEventHandler<HTMLInputElement>}={
   onFocus:()=>{setOpen(true);activate(0)},
   onChange:e=>{setDraft(e.target.value);setOpen(true);activate(0)},
   onKeyDown:e=>{
    if(e.key==='Enter'){e.preventDefault();if(chosen)apply();else if(open&&rows[active])choose(rows[active]);return}
    if(e.key==='ArrowDown'&&rows.length){e.preventDefault();setOpen(true);activate(active+1);return}
    if(e.key==='ArrowUp'&&rows.length){e.preventDefault();activate(active-1);return}
    if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false)}
   }
  };
  return <div className="location-city-picker"><label htmlFor={id}>Localitate</label><div className="location-city-input"><Input id={id} list={id+'-options'} role="combobox" aria-expanded={open&&rows.length>0} aria-controls={id+'-list'} aria-autocomplete="list" aria-activedescendant={open&&rows[active]?id+'-option-'+active:undefined} value={draft} onChange={inputHandlers.onChange} onKeyDown={inputHandlers.onKeyDown} onFocus={inputHandlers.onFocus} placeholder="Caută o localitate" autoComplete="off"/><Button type="button" variant="outline" onClick={()=>apply()} disabled={!chosen}>Aplică localitatea</Button></div><datalist id={id+'-options'}>{ranked.map(item=><option key={item.label+':'+item.city.lat} value={item.label}/>)}</datalist>
    {open&&rows.length>0&&<ul id={id+'-list'} role="listbox" aria-label="Sugestii de localități" data-query={deferredQuery} className="location-suggestions">{rows.map((item,i)=><li key={item.label+':'+item.city.lat} id={id+'-option-'+i} role="option" aria-selected={i===active} className={'location-suggestion'+(current&&item===current?' current':'')} onClick={()=>choose(item)}><span><strong>{item.city.name}</strong><small>{item.label!==item.city.name?item.label+' · ':''}{item.typeLabel}{current&&item===current?' · localitatea activă':''}</small></span><MapPin size={15}/></li>)}</ul>}
    <small>Alege din listă și aplică localitatea. Vremea și datele locale se actualizează automat.</small>
    <div className="location-watch-row"><WatchButton kind="localitate" target={geo.city.name} name={geo.city.name}/></div></div>;
}
export function LocationControl({onManual,compact=false}:{onManual?:()=>void;compact?:boolean}){const l=useLocation();return <div className={'location-control '+(compact?'compact':'')}><Button variant="outline" onClick={l.request} disabled={l.busy}><LocateFixed size={17}/>{l.busy?'Localizare…':l.position?'Actualizează poziția':'Folosește locația mea'}</Button>{!compact&&<><p role="status">{l.label}{l.position?` · precizie aproximativă ${Math.round(l.position.accuracy)} m. Poziția și datele locale se actualizează automat.`:'. Contextul local se aplică datelor care au informații geografic.'}</p>{l.hasLocal&&<button className="text-link" onClick={l.clear}>{l.position?'Oprește localizarea · revino la România':'Revino la România · București implicit'}</button>}{onManual&&<button className="text-link" onClick={onManual}><MapPin size={15}/>Alege localitatea manual</button>}</>}{l.error&&<p role="status">{l.error}</p>}</div>}
