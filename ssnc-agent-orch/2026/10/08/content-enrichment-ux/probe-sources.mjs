// A2-1 probe pass — one polite probe per active family (31 total, the exact
// verify-source-errors.mjs matrix list). Source URLs are the loaders' own
// request URLs so the captured shape is the shape the app parses. Politeness:
// one request per family (shared endpoints probed once), ≥5s between probes,
// ≥20s around the two TPBI hits (hard ceiling ≤4 TPBI requests/min), no DDG
// (D6: research-only, not wired). Output: fixtures/ + probe-results.json,
// consumed by scripts/audit-unused-fields.mjs for the field gap-list.
import {writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const here=import.meta.dirname,fixtures=join(here,'fixtures'),out=[];
await mkdir(fixtures,{recursive:true});
const today=new Date().toISOString().slice(0,10);
const UA='Aflivra/1.0 public-data-source-check';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const venues=JSON.parse(await require('node:fs').promises.readFile(join(here,'..','..','..','..','..','public','events','venues.json'),'utf8')).items;
const odeon=venues.find(v=>v.id==='odeon'),operacluj=venues.find(v=>v.id==='operacluj');
const filmQuery='SELECT ?film ?filmLabel ?date ?directorLabel ?image WHERE { ?film wdt:P31/wdt:P279* wd:Q11424; wdt:P495 wd:Q218. OPTIONAL { ?film wdt:P577 ?date. } OPTIONAL { ?film wdt:P57 ?director. } OPTIONAL { ?film wdt:P18 ?image. } SERVICE wikibase:label { bd:serviceParam wikibase:language "ro,en". } } ORDER BY DESC(?date) LIMIT 50';
const soapEnvelope=body=>'<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><s:Body>'+body+'</s:Body></s:Envelope>';
const probes=[
 {family:'weather/open-meteo',method:'GET',url:'https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:'44.43',longitude:'26.1',current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',hourly:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day',daily:'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',forecast_days:'7',timezone:'auto',timeformat:'unixtime',wind_speed_unit:'kmh'}),headers:{}},
 {family:'company/anaf',method:'GET',url:'https://webservicesp.anaf.ro/bilant?an=2025&cui=427282',headers:{}},
 {family:'courts/portal.just',method:'POST',url:'http://portalquery.just.ro/Query.asmx',body:soapEnvelope('<CautareDosare2 xmlns="portalquery.just.ro"><numarDosar>1/2/2026</numarDosar><obiectDosar i:nil="true"/><numeParte i:nil="true"/><institutie i:nil="true"/><dataStart i:nil="true"/><dataStop i:nil="true"/><dataUltimaModificareStart i:nil="true"/><dataUltimaModificareStop i:nil="true"/></CautareDosare2>'),headers:{SOAPAction:'"portalquery.just.ro/CautareDosare2"','Content-Type':'text/xml; charset=utf-8'}},
 {family:'feeds/stiri',method:'GET',url:'https://www.mai.gov.ro/feed/',headers:{Accept:'application/rss+xml, application/xml'}},
 {family:'catalog/ckan',method:'GET',url:'https://data.gov.ro/api/3/action/package_search?'+new URLSearchParams({q:'',rows:'4',start:'0',sort:'metadata_modified desc','facet.field':JSON.stringify(['organization','res_format']),'facet.limit':'500'}),headers:{}},
 {family:'transport/tpbi',method:'GET',url:'https://gtfs.tpbi.ro/regional/BUCHAREST-REGION.zip',headers:{Range:'bytes=0-2047',Accept:'application/zip'},rangeProbe:true},
 {family:'transport/realtime',method:'GET',url:'https://gtfs.tpbi.ro/api/gtfs-rt/vehiclePositions',headers:{Accept:'application/octet-stream'},protobuf:true},
 {family:'directory/schools',method:'GET',url:'https://data.gov.ro/api/3/action/datastore_search?'+new URLSearchParams({resource_id:'280d52b6-4c5e-489d-9b48-3dd8961f56e0',limit:'2'}),headers:{}},
 {family:'directory/health|pharmacies|hospitals (shared endpoint)',method:'GET',url:'https://data.gov.ro/api/3/action/package_show?id=lista-furnizori',headers:{}},
 {family:'localities/siruta',method:'GET',url:'https://data.gov.ro/api/3/action/package_show?id=siruta_s1-2026',headers:{}},
 {family:'lawyers/ifep',method:'GET',url:'https://www.ifep.ro/Justice/Lawyers/LawyersPanel.aspx',headers:{Accept:'text/html'}},
 {family:'legal/law',method:'POST',url:'http://legislatie.just.ro/apiws/FreeWebService.svc/SOAP',body:soapEnvelope('<GetToken xmlns="http://tempuri.org/"/>'),headers:{SOAPAction:'"http://tempuri.org/IFreeWebService/GetToken"','Content-Type':'text/xml; charset=utf-8'}},
 {family:'feeds/agricultura',method:'GET',url:'https://www.afir.ro/',headers:{Accept:'text/html'}},
 {family:'feeds/filme',method:'GET',url:'https://query.wikidata.org/sparql?'+new URLSearchParams({query:filmQuery,format:'json'}),headers:{Accept:'application/sparql-results+json'}},
 {family:'events/odeon',method:'GET',url:odeon.url,headers:{Accept:'text/html'}},
 {family:'cinema/cinemacity',method:'GET',url:'https://www.cinemacity.ro/ro/data-api-service/v1/quickbook/10107/film-events/in-cinema/1824/at-date/'+today+'?attr=',headers:{}},
 {family:'stories/wikisource',method:'GET',url:'https://ro.wikisource.org/w/api.php?'+new URLSearchParams({action:'parse',pageid:'29611',prop:'text|links|revid|images|categories',format:'json',redirects:'1'}),headers:{}},
 {family:'justice/notari',method:'GET',url:'https://data.gov.ro/api/3/action/package_show?id=bc69c898-b356-4e2c-9251-1833857d1a6e',headers:{}},
 {family:'justice/experti-judiciari',method:'GET',url:'https://data.gov.ro/api/3/action/package_show?id=476a8363-7c91-43e2-99d2-4fbe144c8e2a',headers:{}},
 {family:'justice/experti-tehnici',method:'GET',url:'https://data.gov.ro/api/3/action/package_show?id=3f26ecb7-df7e-454e-a029-89dbd6d82c3f',headers:{}},
 {family:'justice/traducatori',method:'GET',url:'https://data.gov.ro/api/3/action/package_show?id=b1c5ffa9-9dbc-4e71-82c5-6dbee3c806ff',headers:{}},
 {family:'flights/adsb',method:'GET',url:'https://api.adsb.lol/v2/lat/44.5/lon/26.1/dist/250',headers:{'User-Agent':'Aflivra/1.0 public-flight-state reader',Accept:'application/json'}},
 {family:'flights/bia',method:'GET',url:'https://bucharestairports.ro/wp-json/fds/v1/flights?'+new URLSearchParams({airport:'henri-coanda',language:'ro'}),headers:{'User-Agent':'Aflivra/1.0 public-flight-board reader',Accept:'application/json'}},
 {family:'events/search + events/operanationalacluj (shared calendar)',method:'GET',url:operacluj.url+'wp-json/tribe/events/v1/events?per_page=100&status=publish',headers:{}},
];
const skipped=[
 {family:'transport/trains',reason:'corpus-only family — the loader serves the committed Infofer corpus (public/trains/**) and never re-fetches; the politeness ledger spends no external request (matrix cell is corpus-only by design)'},
 {family:'transport/tranzy',reason:'env-gated family — TRANZY_API_KEY is not configured in this environment and the gate forbids interrogating any Tranzy address without a key; shape is pinned by the fixture matrix + the 2026/10/06 reference probe'},
];
let tpbiWindow=[];
const shapeOf=(family,text,bytes)=>{
 try{const d=JSON.parse(text);
  if(family.startsWith('weather/open-meteo'))return{envelope:Object.keys(d),current:Object.keys(d.current||{}),currentUnits:d.current_units,hourlySample:Object.keys(d.hourly||{}),dailySample:Object.keys(d.daily||{}),nowIsUnixSeconds:typeof d.current?.time==='number'&&d.current.time>1e9,sunriseSample:d.daily?.sunrise?.[0]};
  if(family.startsWith('company/anaf'))return{row:Object.keys(d),indicatorRows:d.i?.map(x=>Object.keys(x)),sample:d.i?.slice(0,2)};
  if(family.startsWith('catalog/ckan')||family.includes('directory/')||family.startsWith('localities')||family.startsWith('justice/')){const r=d.result;return{success:d.success,resultKeys:Object.keys(r||{}),datasetKeys:r?.resources?.[0]?Object.keys(r.resources[0]):null,searchResultRow:r?.results?.[0]?Object.keys(r.results[0]):null,datastoreFields:r?.fields?.map(f=>f.id)||null,searchRecordKeys:r?.records?.[0]?Object.keys(r.records[0]):null};
  }
  if(family.startsWith('flights/adsb'))return{envelope:Object.keys(d),nowIsUnixMs:typeof d.now==='number'&&d.now>1e12,acRow:Object.keys(d.ac?.[0]||{}),sample:d.ac?.[0]};
  return{jsonKeys:Object.keys(d)}}
 catch{if(/<rss|<item/.test(text))return{rss:true};if(/Envelope/.test(text))return{soap:true};if(/^\s*\{/.test(text))return{json:true};return{textSample:text.slice(0,240)}}};
for(const probe of probes){
 const isTpbi=probe.url.includes('gtfs.tpbi.ro');
 if(isTpbi){const now=Date.now();tpbiWindow=tpbiWindow.filter(t=>now-t<60000);if(tpbiWindow.length>=3){await sleep(15000);const n=Date.now();tpbiWindow=tpbiWindow.filter(t=>n-t<60000)}}
 const curl='curl -sS -X '+probe.method+" '"+probe.url+"'"+(probe.headers&&Object.keys(probe.headers).length?' -H '+Object.entries({...{'User-Agent':UA},...probe.headers}).map(([k,v])=>JSON.stringify(k+': '+v)).join(' -H '):'')+(probe.body?" --data-binary '"+probe.body.replace(/'/g,"'\\''")+"'":'');
 const entry={family:probe.family,method:probe.method,url:probe.url,attemptedAt:new Date().toISOString(),curl};
 try{const signal=AbortSignal.timeout(30000);
  const response=await fetch(probe.url,{method:probe.method,headers:{'User-Agent':UA,...probe.headers},...(probe.body?{body:probe.body}:{}),signal,redirect:'manual'});
  entry.httpStatus=response.status;
  entry.headers=Object.fromEntries(['content-type','content-length','last-modified','retry-after','x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset','ratelimit-limit','ratelimit-remaining','ratelimit-reset','cf-mitigated','server','cache-control'].map(k=>[k,response.headers.get(k)]).filter(([,v])=>v!==null));
  if(probe.rangeProbe){const reader=response.body?.getReader(),first=await reader?.read();try{await reader?.cancel()}catch{};const bytes=first?.value||new Uint8Array();entry.rangeHonored=response.status===206;entry.magic=String.fromCharCode(...bytes.slice(0,2));entry.shape={zipMagic:entry.magic==='PK',byteSample:bytes.length};}
  else if(probe.protobuf){const bytes=new Uint8Array(await response.arrayBuffer());let decoded=null;try{const bindings=require('gtfs-realtime-bindings').transit_realtime;decoded=bindings.FeedMessage.toObject(bindings.FeedMessage.decode(bytes),{longs:String,enums:String})}catch{}
   if(decoded){const vehicle=decoded.entity?.find(e=>e.vehicle)?.vehicle;if(vehicle)entry.shape={headerKeys:Object.keys(decoded.header),vehicleKeys:Object.keys(vehicle),tripKeys:Object.keys(vehicle.trip||{}),positionKeys:Object.keys(vehicle.position||{}),vehicleDescriptorKeys:Object.keys(vehicle.vehicle||{}),oneVehicleSample:{routeId:vehicle.trip?.routeId,tripId:vehicle.trip?.tripId,label:vehicle.vehicle?.label,licensePlate:vehicle.vehicle?.licensePlate||null,occupancyStatus:vehicle.occupancyStatus||null,occupancyPercentage:vehicle.occupancyPercentage===undefined?null:vehicle.occupancyPercentage,stopId:vehicle.stopId||null,currentStatus:vehicle.currentStatus||null,timestampType:typeof vehicle.timestamp},entityCount:decoded.entity?.length,headerTimestampType:typeof decoded.header.timestamp};await writeFile(join(fixtures,'tpbi-vehiclepositions.shape.json'),JSON.stringify(entry.shape,null,2));}
   else entry.shape={protobuf:true,decode:'failed',bytes:bytes.length};}
  else{const text=await response.text();entry.shape=shapeOf(probe.family,text,text.length);const safe=probe.family.replace(/[^a-z0-9-]+/gi,'-').replace(/-+$/,'');await writeFile(join(fixtures,safe+'.txt'),text.length>65536?text.slice(0,65536)+'\n… [truncated at 64KB; full length '+text.length+']':text)}
  if(isTpbi)tpbiWindow.push(Date.now());
 }catch(error){entry.error=String(error?.message||error)}
 out.push(entry);console.log('['+entry.family+'] HTTP '+(entry.httpStatus??'ERR')+(entry.rangeProbe?' range='+(entry.rangeHonored?'206':'200'):'')+(entry.error?' err='+entry.error.slice(0,120):''));
 if(probe.family!=='transport/tpbi')await sleep(5000);else await sleep(20000);
}
await writeFile(join(here,'probe-results.json'),JSON.stringify({probedAt:new Date().toISOString(),politeness:{familiesProbed:probes.length,skipped,window:'≥5s between probes, ≥20s between TPBI probes, one request per family (shared endpoints once)'},result:[...out,...skipped.map(s=>({family:s.family,skipped:s.reason}))]},null,2));
console.log('probe pass complete: '+probes.length+' probed, '+skipped.length+' skipped (ledger in probe-results.json)');
