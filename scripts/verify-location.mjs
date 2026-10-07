import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import ts from 'typescript';
import {readSnapshotFile as readFile} from './snapshot-read.mjs';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-location-'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function compile(name,path,transform=s=>s){const source=transform(await readFile(join(root,path),'utf8')),js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.React}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");await writeFile(join(temp,name+'.mjs'),js);return import(pathToFileURL(join(temp,name+'.mjs')))}
function host(){let slots=[],cursor=0,effects=[],cleanups=[];const same=(a,b)=>a&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));const h={
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},
 useRef(initial){const i=cursor++;return slots[i]??={current:initial}},
 useEffect(fn,deps){const i=cursor++,old=slots[i];if(!same(old,deps)){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}},
  useMemo(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={deps,value:fn()};return slots[i].value},
  useCallback(fn,deps){return h.useMemo(()=>fn,deps)},useDeferredValue(value){return value},createContext(value){return{Provider:Symbol('Provider'),value}},useContext(context){return context.value},useId(){return 'test-picker'},
 React:{createElement(type,props,...children){return{type,props,children}}},
 render(fn){cursor=0;return fn()},commit(){const queue=effects;effects=[];queue.forEach(fn=>fn())},destroy(){cleanups.forEach(fn=>fn?.())},reset(){h.destroy();slots=[];cursor=0;effects=[];cleanups=[]}
 };return h}
const original={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
try{
 await compile('query','lib/live/query.ts');
 const geo=await compile('geo','lib/location-context.ts',s=>s.replace("from './live/query'","from './query'"));
 const countyLookup=await readFile(join(root,'public/data/locality-counties.json'),'utf8'),urbanLocalities=await readFile(join(root,'public/data/geographic-localities.json'),'utf8');
 const scope=await compile('scope','lib/geographic-scope.ts',s=>s.replace("from './live/query'","from './query'").replace("from './location-context'","from './geo'").replace("import countyLookup from '@/public/data/locality-counties.json';",'const countyLookup='+countyLookup+';').replace("import urbanLocalities from '@/public/data/geographic-localities.json';",'const urbanLocalities='+urbanLocalities+';'));
 await compile('text','lib/live/text.ts');const media=await compile('media','lib/live/media.ts');
 const places=await compile('places','lib/places-query.ts',s=>s.replace("from './live/query'","from './query'").replace("from './live/media'","from './media'"));
 const manifest=JSON.parse(await readFile(join(root,'public/places/manifest.json'),'utf8')),cities=JSON.parse(await readFile(join(root,'public/places/cities.json'),'utf8')).items;
 assert.equal(geo.defaultCountry,'România');assert.equal(geo.defaultCity.name,'București');assert(geo.validPoint({lat:37.77,lon:-122.42}));assert(!geo.validPoint({lat:100,lon:0}));assert.equal(geo.nearestLocality({lat:37.77,lon:-122.42},cities),null);
 assert(geo.mentionsLocation('Municipiul BRASOV, rețeaua școlară','Brașov'));assert(!geo.mentionsLocation('Baiași','Iași'));assert.equal(geo.locationMentionScore({title:'Servicii publice Brașov'}, {name:'Brașov',lat:0,lon:0}),2);
 assert.equal(media.publicImageUrl('https://photos.app.goo.gl/album'),null);assert(media.publicImageUrl('https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg').endsWith('Example.jpg?width=720'));
 const read=async proof=>JSON.parse(await readFile(join(root,'public/places',proof.file),'utf8'));
 const base={category:'cultura',q:'',sub:'',contact:'',scope:'all',lat:44.4268,lon:26.1025,radius:15,sort:'name',page:0};
 const photos=await places.queryPlaces(manifest,{...base,photos:true},read);assert.equal(photos.items.length,18);assert(photos.total>18);assert(photos.items.every(r=>media.publicImageUrl(r.image)));assert.equal(photos.items[0].name.includes('Orient Express'),false,'Album-only records must not be treated as displayable photos');
 const last=await places.queryPlaces(manifest,{...base,photos:true,page:100000},read);assert.equal(last.page,Math.ceil(photos.total/18)-1);assert.equal(last.items.length,photos.total-last.page*18);
 const buc=await places.queryPlaces(manifest,{...base,scope:'nearby',sort:'distance',radius:5},read),brasov=await places.queryPlaces(manifest,{...base,scope:'nearby',sort:'distance',radius:5,lat:45.6579,lon:25.6012},read);assert(buc.items.length&&brasov.items.length);assert.notEqual(buc.items[0].id,brasov.items[0].id);assert(buc.items.every(r=>r.distance<=5)&&brasov.items.every(r=>r.distance<=5));
 console.log(`Full culture catalog: ${manifest.categories.cultura} records, ${photos.total} displayable source-photo references; first/last photo pages and real București/Brașov nearby results verified.`);

 await compile('records','lib/live/records.ts');
 globalThis.__sourceFixture={status:'cached',name:'Instituție națională',data:{items:[{id:'national',title:'Comunicat național',publishedAt:'2026-10-05',url:'https://www.edu.ro/national'},{id:'brasov',title:'Școli din Brașov',publishedAt:'2026-10-01',url:'https://www.edu.ro/brasov'},{id:'cluj',title:'Anunț pentru Cluj-Napoca',publishedAt:'2026-10-04',url:'https://www.edu.ro/cluj'}]}};
 const domain=await compile('domain','app/api/domain/route.ts',s=>s
  .replace("import {readSource} from '@/lib/live/cache';",'const readSource=async()=>structuredClone(globalThis.__sourceFixture);')
  .replace("import {feedConfigs,feedLoader,afirLoader,filmsLoader} from '@/lib/live/feeds';","const feedConfigs={educatie:{},stiri:{}},feedLoader=()=>({}),afirLoader={},filmsLoader={};")
  .replace("from '@/lib/live/query'","from './query'").replace("from '@/lib/live/text'","from './text'").replace("from '@/lib/live/records'","from './records'").replace("export const useLocation=()=>useContext(LocationContext);","export const useLocation=()=>globalThis.__pickerGeo||useContext(LocationContext);")
  .replace("from '@/lib/location-context'","from './geo'").replace("from '@/lib/geographic-scope'","from './scope'"));
 const news=async params=>(await domain.GET(new Request('https://example.test/api/domain?kind=educatie&'+new URLSearchParams(params)))).json();
 let result=await news({geoScope:'context',locality:'Brașov'});assert.equal(result.data.items[0].id,'brasov');assert.equal(result.data.total,2,'National information remains available, other-city items are excluded');result=await news({geoScope:'context',locality:'Cluj-Napoca'});assert.equal(result.data.items[0].id,'cluj');result=await news({geoScope:'local',locality:'Brașov'});assert.equal(result.data.total,1);result=await news({geoScope:'national'});assert.equal(result.data.items[0].id,'national');
 const invalid=await domain.GET(new Request('https://example.test/api/domain?kind=educatie&geoScope=invalid'));assert.equal(invalid.status,400);
 console.log('Actual announcements API verified: geography is applied before pagination, changing the city changes the filtered results, national items remain available and the explicit local filter works.');

 const visibilityListeners=new Set();globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.document={visibilityState:'visible',addEventListener(event,fn){if(event==='visibilitychange')visibilityListeners.add(fn)},removeEventListener(event,fn){if(event==='visibilitychange')visibilityListeners.delete(fn)}};
 const stored=new Map(),callbacks=new Map(),cleared=[];let watches=0;
 globalThis.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,geolocation:{watchPosition(ok,error){callbacks.set(++watches,{ok,error});return watches},clearWatch(id){cleared.push(id)}}}});
 globalThis.__geoHost=host();globalThis.__geoCities=cities;
 const exploration=await readFile(join(root,'public/places/exploration.json'),'utf8');
 await compile('model','app/v2-model.ts',s=>s.replace("import expandedPlaces from '@/public/places/exploration.json';",'const expandedPlaces='+exploration+';'));
 const location=await compile('location','app/location.tsx',s=>s
  .replace(/import React,\{[^\n]+from 'react';/,'const React=globalThis.__geoHost.React;const {createContext,useCallback,useContext,useDeferredValue,useEffect,useId,useMemo,useRef,useState}=globalThis.__geoHost;')
  .replace(/import \{LocateFixed,MapPin\} from 'lucide-react';/, 'const LocateFixed=()=>null,MapPin=()=>null;')
  .replace(/import \{Button\}[^\n]+/, 'const Button=()=>null,Input=()=>null;')
  .replace(/import \{WatchButton\} from '\.\/watch-button';/, 'const WatchButton=()=>null;')
  .replace("export const useLocation=()=>useContext(LocationContext);","export const useLocation=()=>globalThis.__pickerGeo||useContext(LocationContext);")
  .replace("from '@/lib/location-context'","from './geo'").replace("from '@/lib/geographic-scope'","from './scope'").replace("from './v2-model'","from './model'").replace("from '@/lib/live/query'","from './query'")
  .replace("import {snapshotJson} from './snapshot-store';", "const snapshotJson=async path=>path.includes('cities')?{items:globalThis.__geoCities}:{cities:{}};"));
 const renderLocation=()=>{const result=globalThis.__geoHost.render(()=>location.LocationProvider({children:null}));globalThis.__geoHost.commit();return result.props.value};
 let current=renderLocation();assert.equal(current.city.name,'București');assert.equal(current.hasLocal,false);assert.equal(watches,1);await tick();
 const send=(id,lat,lon)=>callbacks.get(id).ok({coords:{latitude:lat,longitude:lon,accuracy:15}});
 send(1,44.4268,26.1025);current=renderLocation();assert.equal(current.mode,'device');assert.equal(current.center.lat,44.4268);const firstKey=current.key;
 send(1,45.6579,25.6012);current=renderLocation();assert.notEqual(current.key,firstKey);assert.equal(current.city.name,'Brașov');assert(!stored.get('aflivra.location.v1').includes('latitude'),'Precise device coordinates must not be persisted');
 current.selectCity({name:'Cluj-Napoca',lat:46.7712,lon:23.6236});current=renderLocation();assert.equal(current.mode,'manual');assert.equal(current.position,null);assert(cleared.includes(1));send(1,44.4268,26.1025);current=renderLocation();assert.equal(current.city.name,'Cluj-Napoca','A late GPS callback must not overwrite a manual choice');
 current.clear();current=renderLocation();assert.equal(current.city.name,'București');assert.equal(current.hasLocal,false);current.request();callbacks.get(watches).error({code:1});current=renderLocation();assert.equal(current.hasLocal,false);assert.equal(current.city.name,'București');assert(current.error.includes('nu a fost permisă'));
 globalThis.__geoHost.destroy();
 stored.set('aflivra.location.v1',JSON.stringify({mode:'manual',city:{name:'Brașov',lat:45.6579,lon:25.6012}}));globalThis.__geoHost.reset();const priorWatches=watches;renderLocation();current=renderLocation();assert.equal(current.mode,'manual');assert.equal(current.city.name,'Brașov');assert.equal(watches,priorWatches);globalThis.__geoHost.destroy();
 console.log('Actual location provider verified: automatic device tracking, movement București → Brașov, manual selection, late GPS rejection, denied permission, national defaults and restored manual preference.');
 globalThis.__geoHost.reset();const selections=[];globalThis.__pickerGeo={...current,cities,selectCity:city=>selections.push(city)};
 const walk=node=>[node,...(node?.children||[]).flatMap(child=>Array.isArray(child)?child.flatMap(walk):child&&typeof child==='object'?walk(child):[])];
 const renderPicker=()=>{const tree=globalThis.__geoHost.render(()=>location.LocationCityPicker());globalThis.__geoHost.commit();return walk(tree)},pickerInput=()=>renderPicker().find(node=>node.props?.list),pickerApply=()=>renderPicker().find(node=>node.props?.onClick);
 for(const text of ['B','Br','Bra','Brașov'])pickerInput().props.onChange({target:{value:text}});assert.equal(selections.length,0,'Typing a valid full city still must not start any location request');assert.equal(pickerApply().props.disabled,false);pickerApply().props.onClick();assert.equal(selections.length,1);assert.equal(selections[0].name,'Brașov');
 const cluj=cities.find(city=>city.name==='Cluj-Napoca'),clujLabel=cluj.name+(cluj.county&&cluj.county!==cluj.name?' · '+cluj.county:'');pickerInput().props.onChange({target:{value:clujLabel}});let prevented=false;pickerInput().props.onKeyDown({key:'Enter',preventDefault(){prevented=true}});assert(prevented);assert.equal(selections.length,2);assert.equal(selections[1].name,'Cluj-Napoca');
 pickerInput().props.onChange({target:{value:'Unknown incomplete place'}});assert.equal(pickerApply().props.disabled,true);pickerApply().props.onClick();assert.equal(selections.length,2);globalThis.__geoHost.destroy();delete globalThis.__pickerGeo;
 console.log('Actual city picker verified with the full local catalog: typing performs no location changes, Apply/Enter commits once, and invalid text cannot apply.');

 const scopedHost=host();globalThis.__scopedHost=scopedHost;globalThis.__scopedLocation={key:'manual:București'};
 const scoped=await compile('location-scope','app/location-scope.tsx',s=>s.replace("import {useRef,useState} from 'react';",'const {useRef,useState}=globalThis.__scopedHost;').replace("import {useLocation} from './location';",'const useLocation=()=>globalThis.__scopedLocation;').replace("import {SelectField} from './select-field';",'const SelectField=()=>null;'));
 const renderScoped=()=>scopedHost.render(()=>({page:scoped.useLocationState(0),scope:scoped.useGeographicScope(),selection:scoped.useLocationState(null)}));
 let localState=renderScoped();localState.page[1](7);localState.scope[1]('national');localState.selection[1]({city:'București'});const delayedSetter=localState.selection[1];localState=renderScoped();assert.equal(localState.page[0],7);
 globalThis.__scopedLocation={key:'manual:Cluj-Napoca'};localState=renderScoped();assert.equal(localState.page[0],0);assert.equal(localState.scope[0],'context');assert.equal(localState.selection[0],null);delayedSetter({city:'București'});assert.equal(renderScoped().selection[0],null,'A delayed result may not reopen a previous-city selection');localState.selection[1]({city:'Cluj-Napoca'});localState.page[1](p=>p+1);localState.page[1](p=>p+1);delayedSetter({city:'București'});localState=renderScoped();assert.equal(localState.selection[0].city,'Cluj-Napoca','Delayed old-city callbacks must not discard a new-city selection');assert.equal(localState.page[0],2,'Functional page updates must compose');scopedHost.destroy();delete globalThis.__scopedHost;delete globalThis.__scopedLocation;
 console.log('Actual location-bound state verified: pages, geographic scopes and open selections reset in the first new-city render; delayed previous-city updates remain hidden.');


 const h=host();globalThis.__sourceHost=h;
 const {useSource}=await compile('hook','app/use-source.ts',s=>s.replace("import {useEffect,useRef,useState} from 'react';",'const {useEffect,useRef,useState}=globalThis.__sourceHost;'));
 const pending=new Map();globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>pending.set(url,{resolve,reject,signal:options.signal}));
 const render=url=>{const state=h.render(()=>useSource(url));h.commit();return state},answer=(url,city)=>pending.get(url).resolve(Response.json({status:'cached',data:{city}}));
 const a='/api/weather?lat=44.43&lon=26.10',b='/api/weather?lat=45.66&lon=25.60',c='/api/weather?lat=46.77&lon=23.62';
 render(a);answer(a,'București');await tick();assert.equal(render(a).data.data.city,'București');
 let state=render(b);assert.equal(state.data,null);assert.equal(state.busy,true);assert(pending.get(a).signal.aborted);
 state=render(c);assert.equal(state.data,null);assert(pending.get(b).signal.aborted);answer(b,'Brașov');await tick();assert.equal(render(c).data,null,'A late response for the previous location must be ignored');answer(c,'Cluj-Napoca');await tick();assert.equal(render(c).data.data.city,'Cluj-Napoca');
 render(a);pending.get(a).reject(Error('Old location error'));await tick();state=render(b);assert.equal(state.error,'');assert.equal(state.data,null);answer(b,'Brașov');await tick();render(b);
 const previousRequest=pending.get(b);document.visibilityState='hidden';visibilityListeners.forEach(fn=>fn());render(b);assert.equal(pending.get(b),previousRequest);document.visibilityState='visible';visibilityListeners.forEach(fn=>fn());render(b);assert.notEqual(pending.get(b),previousRequest,'Returning to the page must resume refresh even after a background polling timer stopped');assert.equal(render(b).data.data.city,'Brașov','Same-location data remains visible during revalidation');
 render(null);assert.equal(render(null).busy,false);assert.equal(visibilityListeners.size,0);h.destroy();
 console.log('Actual shared source hook verified: immediate removal of old-location values, automatic new requests, cancellation, late-response rejection and error isolation during rapid changes.');
 const forecast=await compile('forecast','lib/live/forecast.ts');const weatherHost=host();globalThis.__sourceHost=weatherHost;globalThis.__forecastHost=weatherHost;
 await compile('weather-hook','app/use-source.ts',s=>s.replace("import {useEffect,useRef,useState} from 'react';",'const {useEffect,useRef,useState}=globalThis.__sourceHost;'));
 const localWeather=await compile('local-weather','app/local-weather.tsx',s=>s
  .replace("import React,{createContext,useContext,useEffect,useRef,useState} from 'react';",'const React=globalThis.__forecastHost.React;const {createContext,useContext,useEffect,useRef,useState}=globalThis.__forecastHost;')
  .replace("import {useLocation} from './location';",'const useLocation=()=>({center:globalThis.__forecastCenter});')
  .replace("from './use-source'","from './weather-hook'").replace("from '@/lib/live/forecast'","from './forecast'"));
 const weatherPending=new Map();globalThis.fetch=(url,options)=>new Promise(resolve=>weatherPending.set(String(url),{resolve,signal:options.signal,options}));
 const renderWeather=point=>{globalThis.__forecastCenter=point;const tree=weatherHost.render(()=>localWeather.LocalWeatherProvider({children:null}));weatherHost.commit();return tree.props.value};
 const unavailable={status:'unavailable',data:null,error:'Sursa a cerut o pauză (HTTP 429).',lastAttemptAt:new Date().toISOString()},respond=(url,data)=>weatherPending.get(url).resolve(Response.json(data));
 const pointA={lat:44.43,lon:26.10},pointB={lat:45.66,lon:25.60},pointC={lat:46.77,lon:23.62};
 const fixture=(point,temperature)=>{const time=1791176400;return{latitude:point.lat,longitude:point.lon,elevation:50,timezone:'Europe/Bucharest',current:{time,interval:900,...Object.fromEntries(forecast.currentVariables.map(key=>[key,key==='temperature_2m'?temperature:0]))},current_units:{temperature_2m:'°C'},hourly:{time:[time],...Object.fromEntries(forecast.hourlyVariables.map(key=>[key,[0]]))},hourly_units:{temperature_2m:'°C'},daily:{time:[time],...Object.fromEntries(forecast.dailyVariables.map(key=>[key,[key==='sunrise'||key==='sunset'?time:0]]))},daily_units:{temperature_2m_max:'°C'}}};
 renderWeather(pointA);respond(a,unavailable);await tick();renderWeather(pointA);renderWeather(pointA);const directA=forecast.forecastConfig(pointA.lat,pointA.lon).requestUrl;assert(weatherPending.has(directA));assert.equal(weatherPending.get(directA).options.credentials,'omit');
 let weatherState=renderWeather(pointB);assert.equal(weatherState.data,null);assert(weatherPending.get(directA).signal.aborted,'A location change must cancel direct upstream weather as well');respond(b,unavailable);await tick();renderWeather(pointB);renderWeather(pointB);const directB=forecast.forecastConfig(pointB.lat,pointB.lon).requestUrl;
 respond(directA,fixture(pointA,99));await tick();assert.equal(renderWeather(pointB).data?.data,null,'A late direct forecast must not repopulate the previous city');
 const responseAt=process.argv.indexOf('--weather-response'),rawB=responseAt>=0?JSON.parse(await readFile(process.argv[responseAt+1],'utf8')):fixture(pointB,6);respond(directB,rawB);await tick();weatherState=renderWeather(pointB);assert.equal(weatherState.data.status,'fresh');assert.equal(weatherState.data.data.current.temperature_2m,rawB.current.temperature_2m);assert.equal(weatherState.data.data.hourly.length,rawB.hourly.time.length);assert.equal(weatherState.data.data.daily.length,rawB.daily.time.length);assert.equal(weatherState.busy,false);assert.equal(weatherState.error,'');
 weatherState.retry();renderWeather(pointB);respond(b,{...unavailable,status:'fresh',error:null,data:forecast.parseForecast(JSON.stringify(fixture(pointB,11))).data,lastSuccessAt:new Date(Date.now()+1000).toISOString()});await tick();weatherState=renderWeather(pointB);assert.equal(weatherState.data.data.current.temperature_2m,11);assert.equal(weatherState.busy,false,'Successful server refresh must not leave a cancelled direct request marked busy');
 weatherState=renderWeather(pointC);assert.equal(weatherState.data,null);respond(c,{status:'fresh',data:forecast.parseForecast(JSON.stringify(fixture(pointC,12))).data,lastSuccessAt:new Date().toISOString()});await tick();weatherState=renderWeather(pointC);assert.equal(weatherState.data.data.current.temperature_2m,12);assert(!weatherPending.has(forecast.forecastConfig(pointC.lat,pointC.lon).requestUrl),'A healthy server forecast must not trigger an extra direct request');weatherHost.destroy();
 const incomplete=fixture(pointB,7);delete incomplete.hourly.temperature_2m;assert.throws(()=>forecast.parseForecast(JSON.stringify(incomplete)),/incomplet/);
 console.log('Actual shared weather provider verified: server 429 fallback populates current/hourly/daily values, CORS fetch omits credentials, rapid city changes cancel old forecasts, delayed old values are rejected, and healthy server responses need no duplicate request.');

}finally{globalThis.fetch=original.fetch;globalThis.window=original.window;globalThis.document=original.document;globalThis.localStorage=original.localStorage;if(original.navigator)Object.defineProperty(globalThis,'navigator',original.navigator);else delete globalThis.navigator;await rm(temp,{recursive:true,force:true})}
