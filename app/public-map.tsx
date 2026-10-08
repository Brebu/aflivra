'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap,LayerGroup,LatLngExpression,TileLayer} from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {bearingText,speedText,occupancyText} from '@/lib/transit-view';
export type MapPoint={id:string;name:string;lat:number;lon:number;description?:string;vehicle?:boolean;bearing?:number|null;speed?:number|null;occupancy?:string|null;occupancyPercentage?:number|null};
const emptyPaths:{lat:number;lon:number}[][]=[];
const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,ch=>({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'})[ch] as string);
// Stratul orto național AIGA 1:5000 (CKAN 57bdbd9b, licență CC-BY-4.0): serviciul INSPIRE de
// vizualizare al MApN. Fișele se citesc din browser direct de la sursă — serverul AIGA e lent sau
// înghețat geografic din rețeaua Workers, iar fișele grele nu trec niciodată prin worker.
const AIGA_WMS='https://inspire.geomil.ro/network/rest/services/INSPIRE/OI_View/MapServer/WmsServer';
const AIGA_DATASET='https://data.gov.ro/dataset/ortofotoplan-scara-1-5000-pentru-teritoriul-romaniei';
const AIGA_CREDIT='Ortoimagini 1:5000 · AIGA / MApN · CC BY 4.0';
// Selectable repere pins (the national map surface): Leaflet markers aren't buttons,
// so the accessible pin is a real <button> inside the marker icon — keyboard
// Enter/Space, taps and clicks all select, the same ≥5px slop keeps a drag a pan,
// and a transient onSelect identity never rebuilds the marker corpus.
/* Tropăiala de dezmontare a canvasului Leaflet 1.9.4: la demontarea secțiunii care
   conține harta, bilele de animație programate de redarea pe canvas pot rula după
   ce onRemove a șters contextul (_ctx) și harta (_map) — o eroare neprinsă în
   „clearRect of undefined". Panza redesenată pe un render distrus devine un
   no-op: stratul oricum dispare odată cu harta. Aplicat o singură dată, pe
   prototipul Canvas. */
let canvasTeardownHardened=false;
function hardenCanvasTeardown(L:typeof import('leaflet')){if(canvasTeardownHardened)return;canvasTeardownHardened=true;const redraw=(L as any).Canvas?.prototype?._redraw;if(typeof redraw!=='function')return;(L as any).Canvas.prototype._redraw=function(this:any,...args:any[]){if(!this._ctx||!this._map)return;return redraw.apply(this,args)}}
export function PublicMap({points,paths=emptyPaths,viewKey='map',ownPosition=null,onViewportSettle,onSelect,selectedId,regionLabel}:{points:MapPoint[];paths?:{lat:number;lon:number}[][];viewKey?:string;ownPosition?:{lat:number;lon:number;accuracy:number}|null;onViewportSettle?:(center:{lat:number;lon:number})=>void;onSelect?:(id:string)=>void;selectedId?:string;regionLabel?:string}){
  const element=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),layers=useRef<LayerGroup|null>(null),ownLayer=useRef<LayerGroup|null>(null),lastView=useRef(''),orthoLayer=useRef<TileLayer.WMS|null>(null),orthoName=useRef(''),settleCb=useRef<((center:{lat:number;lon:number})=>void)|undefined>(undefined),quiet=useRef(false),settleTimer=useRef<ReturnType<typeof setTimeout>|null>(null),selectedRef=useRef<string|undefined>(selectedId),onSelectRef=useRef<((id:string)=>void)|undefined>(onSelect),repereRef=useRef(new Map<string,HTMLButtonElement>()),[ready,setReady]=useState(false),[error,setError]=useState(''),[ortho,setOrtho]=useState<{status:'off'|'loading'|'on'|'error';error:string}>({status:'off',error:''});
  /* Programmatic moves (initial view, pin-set refits, size changes) finish synchronously —
     the microtask window swallows their moveend so only the user's own settled moves notify. */
  const programmatic=(run:()=>void)=>{quiet.current=true;try{run()}finally{queueMicrotask(()=>{quiet.current=false})}};
  useEffect(()=>{settleCb.current=onViewportSettle},[onViewportSettle]);
  useEffect(()=>{onSelectRef.current=onSelect},[onSelect]);
  useEffect(()=>{selectedRef.current=selectedId;for(const[id,button] of repereRef.current)button.classList.toggle('chosen',id===selectedId)},[selectedId]);
  useEffect(()=>{let cancelled=false,frame=0;let observer:ResizeObserver|undefined;let owned:LeafletMap|undefined;import('leaflet').then(L=>{if(cancelled||!element.current)return;hardenCanvasTeardown(L);const m=L.map(element.current,{scrollWheelZoom:false,preferCanvas:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false});owned=m;map.current=m;programmatic(()=>m.setView([45.9,25],6));
   // One settled gesture — one notification: the refetch follows the map's new center,
   // debounced past the moveend/zoomend pair a pinch produces, never a programmatic move.
   const settle=()=>{if(quiet.current)return;clearTimeout(settleTimer.current!);settleTimer.current=setTimeout(()=>{const cb=settleCb.current,view=map.current;if(!cb||!view)return;const center=view.getCenter();cb({lat:center.lat,lon:center.lng})},400)};m.on('moveend',settle);m.on('zoomend',settle);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'}).addTo(m);layers.current=L.layerGroup().addTo(m);observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!cancelled)programmatic(()=>m.invalidateSize({pan:false}))})});observer.observe(element.current);setReady(true)}).catch(()=>{if(!cancelled)setError('Harta nu poate fi încărcată acum. Adresele și coordonatele rămân disponibile.');});return()=>{cancelled=true;observer?.disconnect();cancelAnimationFrame(frame);clearTimeout(settleTimer.current!);layers.current?.clearLayers();orthoLayer.current?.remove();orthoLayer.current=null;owned?.remove();map.current=null;layers.current=null}},[]);
 const aigaLayerName=async()=>{
  if(orthoName.current)return orthoName.current;
  const response=await fetch(AIGA_WMS+'?service=WMS&request=GetCapabilities',{signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const text=await response.text();
  if(!/<Layer[\s>]/i.test(text))throw Error('fără straturi publicate');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('XML invalid');
  const published=[...doc.getElementsByTagName('Layer')].map(node=>({name:(node.getElementsByTagName('Name')[0]?.textContent||'').trim(),title:(node.getElementsByTagName('Title')[0]?.textContent||'').trim()})).filter(entry=>entry.name&&entry.name.toLowerCase()!=='wms');
  if(!published.length)throw Error('straturi fără nume');
  const chosen=published.find(entry=>/orto|imag/i.test(entry.name+' '+entry.title))||published[0];
  orthoName.current=chosen.name;
  return chosen.name;
 };
 const enableOrtho=async()=>{
  if(!map.current)return;
  setOrtho({status:'loading',error:''});
  try{
   const name=await aigaLayerName();
   if(!map.current)return;
   const L=await import('leaflet');
   const layer=L.tileLayer.wms(AIGA_WMS,{layers:name,format:'image/png',transparent:true,attribution:AIGA_CREDIT});
   let failed=0,loaded=false;
   layer.on('tileload',()=>{loaded=true});
   layer.on('tileerror',()=>{failed++;if(failed>=8&&!loaded){orthoLayer.current?.remove();orthoLayer.current=null;setOrtho({status:'error',error:'Stratul orto AIGA nu poate fi încărcat acum: serviciul AIGA nu a transmis imaginile.'})}});
   orthoLayer.current?.remove();
   orthoLayer.current=layer;
   layer.addTo(map.current);
   setOrtho({status:'on',error:''});
  }catch{
   orthoLayer.current?.remove();orthoLayer.current=null;
   setOrtho({status:'error',error:'Stratul orto AIGA nu poate fi încărcat acum. Serviciul de vizualizare AIGA nu a răspuns.'});
  }
 };
 const toggleOrtho=()=>{
  if(ortho.status==='loading')return;
  if(ortho.status==='on'){orthoLayer.current?.remove();orthoLayer.current=null;setOrtho({status:'off',error:''});return}
  void enableOrtho();
 };
 useEffect(()=>{if(!ready||!map.current||!layers.current)return;let cancelled=false;import('leaflet').then(L=>{if(cancelled||!map.current||!layers.current)return;layers.current.clearLayers();repereRef.current.clear();const bounds:LatLngExpression[]=[];for(const path of paths){const line=path.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).map(x=>[x.lat,x.lon] as [number,number]);if(line.length>1){L.polyline(line,{color:'#0877ed',weight:4,opacity:.85}).addTo(layers.current);bounds.push(...line)}}for(const p of points){if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;const telemetry=p.vehicle?[bearingText(p.bearing),speedText(p.speed),occupancyText(p.occupancy,p.occupancyPercentage)].filter(Boolean).join(' · '):'';const text=document.createElement('div'),title=document.createElement('strong');title.textContent=p.name;text.appendChild(title);if(p.description){const info=document.createElement('p');info.textContent=p.description;text.appendChild(info)}if(telemetry){const live=document.createElement('p');live.textContent=telemetry;text.appendChild(live)}
      // Fiecare punct de pe hartă poartă ieșirea spre navigația dispozitivului: Google Maps
      // și Harta Apple primesc exact coordonata punctului, ca destinație.
      if(Number.isFinite(p.lat)&&Number.isFinite(p.lon)){const nav=document.createElement('p');nav.className='pin-nav';const g=document.createElement('a');g.href='https://www.google.com/maps/dir/?api=1&destination='+p.lat+','+p.lon;g.target='_blank';g.rel='noreferrer';g.textContent='Navighează cu Google Maps';const sep=document.createTextNode(' · ');const a=document.createElement('a');a.href='https://maps.apple.com/?daddr='+p.lat+','+p.lon;a.target='_blank';a.rel='noreferrer';a.textContent='cu Harta Apple';nav.appendChild(g);nav.appendChild(sep);nav.appendChild(a);text.appendChild(nav)}const heading=p.vehicle&&p.bearing!==null&&p.bearing!==undefined?Number(p.bearing):NaN;if(onSelectRef.current&&!p.vehicle){const label='Selectează '+p.name;const icon=L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],html:'<button type="button" class="repere-pin'+(selectedRef.current===p.id?' chosen':'')+'" aria-label="'+escapeHtml(label)+'" title="'+escapeHtml(p.name)+'"></button>'});const marker=L.marker([p.lat,p.lon],{icon,title:p.name}).addTo(layers.current);const node=marker.getElement()?.querySelector('button')??null;if(node instanceof HTMLButtonElement){repereRef.current.set(p.id,node);node.addEventListener('pointerdown',ev=>{node.dataset.px=String(ev.clientX);node.dataset.py=String(ev.clientY)});node.addEventListener('click',ev=>{const x=Number(node.dataset.px??ev.clientX),y=Number(node.dataset.py??ev.clientY);delete node.dataset.px;delete node.dataset.py;if(Math.hypot(ev.clientX-x,ev.clientY-y)>5)return;onSelectRef.current?.(p.id)})}bounds.push([p.lat,p.lon]);continue}if(p.vehicle&&Number.isFinite(heading)){const label=[p.name,telemetry].filter(Boolean).join(' · ');const degrees=((heading%360)+360)%360;const icon=L.divIcon({className:'',iconSize:[28,28],iconAnchor:[14,14],html:'<div role="img" aria-label="'+escapeHtml(label)+'"><svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" focusable="false"><g transform="rotate('+degrees+' 14 14)"><path d="M14 2.5 L21.5 23 L14 19 L6.5 23 Z" fill="#0877ed" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/></g></svg></div>'});L.marker([p.lat,p.lon],{icon,title:label}).bindPopup(text).addTo(layers.current)}else{L.circleMarker([p.lat,p.lon],{radius:p.vehicle?9:6,color:p.vehicle?'#ffffff':'#0a3975',weight:2,fillColor:p.vehicle?'#0877ed':'#ffffff',fillOpacity:1}).bindPopup(text).addTo(layers.current)}bounds.push([p.lat,p.lon])}if(bounds.length&&lastView.current!==viewKey){programmatic(()=>{map.current?.fitBounds(L.latLngBounds(bounds),{padding:[25,25],maxZoom:15})});lastView.current=viewKey}
      });return()=>{cancelled=true}},[ready,points,paths,viewKey]);
  // The "you are here" layer is deliberately separate from the pin corpus above: it
  // renders only the device's own reported fix (raw coordinates, never quantized
  // into the app's cell keys), never joins the fitBounds corpus and never re-keys
  // the map's view, so a moving dot cannot rebuild the pin corpus or re-trigger the
  // pin refetches — it positions itself and nothing else.
  useEffect(()=>{if(!ready)return;let cancelled=false;import('leaflet').then(L=>{if(cancelled||!map.current)return;ownLayer.current?.remove();ownLayer.current=null;if(!ownPosition||!Number.isFinite(ownPosition.lat)||!Number.isFinite(ownPosition.lon))return;const accuracy=Number.isFinite(ownPosition.accuracy)&&ownPosition.accuracy>=0?ownPosition.accuracy:0;const caption=accuracy>0?'Ești aici · precizie aproximativă '+Math.round(accuracy)+' m':'Ești aici';const group=L.layerGroup().addTo(map.current);if(accuracy>0)L.circle([ownPosition.lat,ownPosition.lon],{radius:accuracy,color:'#0877ed',weight:1,opacity:.5,fillColor:'#0877ed',fillOpacity:.08}).addTo(group);const icon=L.divIcon({className:'',iconSize:[20,20],iconAnchor:[10,10],html:'<div role="img" aria-label="'+escapeHtml(caption)+'" title="'+escapeHtml(caption)+'" style="width:20px;height:20px;border-radius:50%;background:#0877ed;border:3px solid #ffffff;box-shadow:0 1px 6px rgba(10,57,117,.45)">&nbsp;</div>'});L.marker([ownPosition.lat,ownPosition.lon],{icon,title:caption}).bindPopup('<strong>Ești aici</strong><br>poziția raportată de dispozitiv'+(accuracy>0?', cu precizia declarată (~'+Math.round(accuracy)+' m)':'')+'.').addTo(group);ownLayer.current=group});return()=>{cancelled=true;ownLayer.current?.remove();ownLayer.current=null}},[ready,ownPosition]);
 return <div className="public-map-wrap"><div ref={element} data-pins={points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).length} className="public-map" role="region" aria-label={regionLabel||'Hartă interactivă a locurilor și traseului'}/>{error&&<p role="status">{error}</p>}
  {ready&&!error&&<div className="map-layer-controls" role="group" aria-label="Straturi de hartă"><button type="button" className={ortho.status==='on'||ortho.status==='loading'?'selected':''} aria-pressed={ortho.status==='on'||ortho.status==='loading'} onClick={toggleOrtho}>Ortoimagini AIGA 1:5000</button>{ortho.status==='loading'&&<span role="status">Se încarcă stratul orto AIGA…</span>}{ortho.status==='error'&&<span role="alert">{ortho.error}<button type="button" onClick={()=>void enableOrtho()}>Reîncearcă stratul orto</button></span>}</div>}
  {ortho.status==='on'&&<a className="map-credit" href={AIGA_DATASET} target="_blank" rel="noreferrer">{AIGA_CREDIT}</a>}
  <p className="small-muted">{onSelect?'Mișcă harta și folosește + / − pentru zoom. Atinge un reper pentru a deschide povestea locului.':'Mișcă harta și folosește + / − pentru zoom. Atinge un punct pentru nume și detalii.'}</p></div>;
}
