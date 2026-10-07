// One-time corpus import: the official Infofer "Mers tren" XML editions published on
// data.gov.ro (one dataset per operator, S.C. Informatică Feroviară S.A. publisher).
// Reads the resource lists from the verified local CKAN snapshot, downloads the latest
// edition of each of the 9 operators politely (sequential, small pauses), and writes the
// planned-timetable corpus served by /api/trains: a station index plus sharded per-station
// boards. An operator whose edition cannot be fetched or parsed is reported and skipped;
// the corpus only ever contains verified editions.
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'fflate';
import {createHash} from 'node:crypto';

const here=new URL('../',import.meta.url);
const decode=bytes=>new TextDecoder().decode(gunzipSync(bytes));
async function readDataset(id){return JSON.parse(decode(await readFile(new URL('public/catalog/datasets/'+id+'.json.gz',here))))}

const operators=[
 {id:'sntfc',name:'SNTFC „CFR Călători”',dataset:'c4f71dbb-de39-49b2-b697-5b60a5f299a2'},
 {id:'regio',name:'Regio Călători',dataset:'1da1018d-df38-4b5f-9667-88e4521abfb3'},
 {id:'astra',name:'Astra Trans Carpatic',dataset:'1d057a43-3eaa-4fed-a349-4106f3ad0e49'},
 {id:'interregional',name:'Interregional Călători',dataset:'b4e2ce0b-6935-44b1-8e9d-f3999123358a'},
 {id:'transferoviar',name:'Transferoviar Călători',dataset:'9d4adc7b-d407-46c2-9003-5aa87cd16fb7'},
 {id:'softrans',name:'Softrans',dataset:'e4ba7432-2904-4cc4-9588-2afbf021756e'},
 {id:'ferotrafic',name:'FEROTRAFIC – TFI',dataset:'019ecd94-b7ce-46e5-a003-7e4db3180147'},
 {id:'cfm',name:'Calea Ferată din Moldova',dataset:'4ae60d7e-5f1d-4969-94c9-82236babfa08'},
 {id:'regiotrans',name:'Regiotrans',dataset:'8d6bde26-dec0-44f6-9f2a-63e25dc08484'}];

const attrs=block=>Object.fromEntries([...block.matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const pad=n=>String(n).padStart(2,'0');
const tt=seconds=>{const total=Math.max(0,Math.floor(Number(seconds)||0));const day=Math.floor(total/86400),rest=total%86400;return pad(Math.floor(rest/3600))+':'+pad(Math.floor(rest%3600/60))+(day>0?' +1':'');};
const days=code=>{const mask=Number(code)||0;const labels=['L','Ma','Mi','J','V','S','D'],on=labels.filter((_,i)=>mask>>i&1);if(on.length===7)return 'zilnic';return on.length?on.join(', '):'nedeterminat';};

function parseMersTren(xml){
 const mt=xml.match(/<Mt\b([^>]*)>/);if(!mt)throw Error('Fișierul nu conține o ediție de mers tren.');
 const mtAttrs=attrs(mt[1]);
 const stations=new Map(),trains=[];
 for(const trainBlock of xml.matchAll(/<Tren\b([^>]*)>([\s\S]*?)<\/Tren>/g)){
  const train=attrs(trainBlock[1]),body=trainBlock[2];
  const calendar=body.match(/<CalendarTren\b([^>]*)\/>/)?.[1]||'';
  const calAttrs=attrs(calendar);
  const elements=[...body.matchAll(/<ElementTrasa\b([^>]*?)\/>/g)].map(m=>attrs(m[1]));
  if(!elements.length)continue;
  const finalCode=Number(trainBlock[2].match(/<Trasa\b[^>]*CodStatieFinala="(\d+)"/)?.[1]||elements.at(-1)?.CodStaDest||0);
  const stops=[];
  for(const e of elements){
   const origin=Number(e.CodStaOrigine);if(!origin||!e.DenStaOrigine)continue;
   stops.push({code:origin,name:e.DenStaOrigine,arrive:e.OraP,depart:e.OraS,tip:e.TipOprire||'',next:e.DenStaDestinatie||''});
   if(Number(e.CodStaDest)===finalCode&&e.DenStaDestinatie&&Number(e.CodStaDest)!==origin)stops.push({code:Number(e.CodStaDest),name:e.DenStaDestinatie,arrive:e.OraP,depart:e.OraS,tip:'T',next:''});
  }
  const seen=new Set(),uniq=stops.filter(stop=>{const key=stop.code+':'+stop.depart+':'+stop.arrive;if(seen.has(key))return false;seen.add(key);return true});
  for(const stop of uniq){
   if(!stations.has(stop.code))stations.set(stop.code,{name:stop.name,departures:[],arrivals:[]});
   const station=stations.get(stop.code);
   if(station.departures.length+station.arrivals.length<400){
    if(stop.tip!=='T'&&stop.depart)station.departures.push({t:Number(stop.depart),n:String(train.Numar||''),c:train.CategorieTren||'',d:stop.next,z:calAttrs.Zile||'',zl:calAttrs.Zile?days(calAttrs.Zile):''});
    if(stop.arrive&&(stop.tip==='T'||Number(stop.arrive)!==Number(stop.depart)))station.arrivals.push({t:Number(stop.arrive),n:String(train.Numar||''),c:train.CategorieTren||'',f:uniq[0]?.name||'',z:calAttrs.Zile||'',zl:calAttrs.Zile?days(calAttrs.Zile):''});
   }
  }
  trains.push(String(train.Numar||''));
 }
 if(!trains.length||!stations.size)throw Error('Fișierul nu conține trenuri și stații.');
 return {mtAttrs,trains,stations};
}

const results=[];
for(const operator of operators){
 const detail=await readDataset(operator.dataset);
 const candidates=(detail.resources||[]).map(resource=>{
  const years=[...String(resource.name).matchAll(/(20\d{2})/g)].map(m=>Number(m[1]));
  return {resource,end:years.length?Math.max(...years):0};
 }).filter(c=>/\.?xml/i.test(String(c.resource.format||''))&&c.end>0).sort((a,b)=>b.end-a.end);
 
 const chosen=candidates[0];
 if(!chosen){results.push({...operator,status:'skipped',reason:'Nicio ediție XML cu an identificabil.'});continue}
 let url=String(chosen.resource.url||'');
 if(url.startsWith('http://data.gov.ro/'))url='https://data.gov.ro/'+url.slice('http://data.gov.ro/'.length);
 try{
  if(!/^https:\/\/data\.gov\.ro\//.test(url))throw Error('Adresa ediției nu este pe data.gov.ro.');
  // Cache each verified edition under the session dir so parse-iteration reruns never re-fetch.
  const cachePath=new URL('ssnc-agent-orch/2026/10/06/media-expansion/probes/mers-tren-'+operator.id+'.xml',here);
  let xml=null;
  try{xml=new TextDecoder().decode(await readFile(cachePath))}catch{}
  if(!xml){
   await new Promise(r=>setTimeout(r,1200));
   const response=await fetch(url,{headers:{'User-Agent':'Aflivra/1.0 public-data-reader'},signal:AbortSignal.timeout(90000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const buffer=Buffer.from(await response.arrayBuffer());
   if(buffer.length>25_000_000)throw Error('Fișierul depășește limita de 25 MB.');
   xml=buffer.toString('utf8');
   try{await writeFile(cachePath,xml)}catch{}
  }
  const parsed=parseMersTren(xml);
  results.push({...operator,status:'verified',edition:String(chosen.resource.name).trim(),url,bytes:xml.length,validFrom:parsed.mtAttrs.MtValabilDeLa||'',validTo:parsed.mtAttrs.MtValabilPinaLa||'',dataExport:parsed.mtAttrs.DataExport||'',trains:parsed.trains.length,stations:parsed.stations.size,parsed});
  await writeFile(new URL('ssnc-agent-orch/2026/10/06/media-expansion/probes/mers-tren-'+operator.id+'.xml.head',here),xml.slice(0,65536));
 }catch(error){results.push({...operator,status:'skipped',reason:error.message})}
}

const verified=results.filter(r=>r.status==='verified');
if(!verified.length)throw Error('Nicio ediție de mers tren nu a putut fi verificată. '+JSON.stringify(results.map(({parsed,...r})=>r)));
const operatorIds=verified.map(r=>r.id);
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// Infofer station names use legacy cedilla diacritics (ş/ţ); fold both legacy and modern
// comma-below forms after NFD so any spelling a reader types matches the station.
const fold=s=>String(s).replace(/[şŞ]/g,'ș').replace(/[ţŢ]/g,'ț');
const searchKey=s=>norm(fold(s));

// Station index + sharded boards, computed over every verified edition collectively,
// merged by the national station code so a board lists every operator serving a station.
const merged=new Map();
for(const operator of verified){
 for(const [code,station] of operator.parsed.stations){
  if(!merged.has(code))merged.set(code,{code,name:station.name,operators:new Set(),departures:[],arrivals:[]});
  const board=merged.get(code);
  board.operators.add(operator.id);
  board.departures.push(...station.departures.map(d=>({...d,o:operator.id})));
  board.arrivals.push(...station.arrivals.map(a=>({...a,o:operator.id})));
 }
}
const SHARDS=128;
const boardsByShard=Array.from({length:SHARDS},()=>({shard:[],stations:[]}));
const items=[...merged.values()].map(station=>{
 station.departures.sort((a,b)=>a.t-b.t||String(a.n).localeCompare(String(b.n)));
 station.arrivals.sort((a,b)=>a.t-b.t||String(a.n).localeCompare(String(b.n)));
 const shard=station.code%SHARDS;
 boardsByShard[shard].stations.push({
  code:station.code,name:station.name,
  departures:station.departures.map(d=>({...d,tt:tt(d.t)})),
  arrivals:station.arrivals.map(a=>({...a,tt:tt(a.t)}))});
 boardsByShard[shard].shard.push(station.code);
 return {code:station.code,name:station.name,search:searchKey(station.name+' '+[...station.operators].join(' ')),operators:[...station.operators].sort(),trains:uniqueTrains(station),shard};
}).sort((a,b)=>a.name.localeCompare(b.name,'ro')||a.code-b.code);
function uniqueTrains(station){const seen=new Set();for(const row of [...station.departures,...station.arrivals])seen.add(row.o+':'+row.n);return seen.size}

const dir=new URL('public/trains/',here);
await rm(dir,{recursive:true,force:true});
await mkdir(new URL('boards/',dir),{recursive:true});
const publicDir=new URL('public/',here);
const files=[];
const writeSnapshot=async(path,object,compressed)=>{
 const raw=Buffer.from(JSON.stringify(object));
 const stored=compressed?gzipSync(raw,{mtime:0}):raw;
 // Registry `file` is relative to public/, mirroring the places/stories/catalog corpora; the
 // logical `path` is what routes read through snapshotAssetPath.
 // Registry `file` mirrors the logical snapshot path (leading slash); writes land under public/.
 const rel=path.replace(/^\/trains\//,'')+(compressed?'.gz':''),file='/trains/'+rel;
 await writeFile(new URL(rel,dir),stored);
 files.push({path,file,storedBytes:stored.length,storedSha256:createHash('sha256').update(stored).digest('hex'),bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')});
 return raw.length;
};
const manifest={
 schema:'aflivra-trains-v1',fetchedAt:new Date().toISOString(),
 sourceUrl:'https://data.gov.ro/',
 license:'OGL-ROU · S.C. Informatică Feroviară S.A.',
 note:'Orare planificate, pe edițiile publicate de fiecare operator. Nu include întârzieri, anulări în ziua de mers sau garanția unei escală comerciale. Edițiile mai vechi ale operatorilor privați rămân cele mai recente publicate oficial.',
 operators:results.map(({parsed,...r})=>({...r,datasetUrl:'https://data.gov.ro/dataset/'+r.dataset})),
 counts:{stations:items.length,operators:verified.length,trains:verified.reduce((n,o)=>n+o.trains,0)},
 shards:SHARDS};
await writeSnapshot('/trains/manifest.json',manifest,false);
const bytesStations=await writeSnapshot('/trains/stations.json',{items,count:items.length,shards:SHARDS,operators:operatorIds},true);
let boardsBytes=0;
for(let shard=0;shard<SHARDS;shard++){
 const payload=boardsByShard[shard];
 if(!payload.stations.length)continue;
 payload.stations.sort((a,b)=>a.name.localeCompare(b.name,'ro'));
 boardsBytes+=await writeSnapshot('/trains/boards/'+pad(shard)+'.json',payload,true);
}
const registry=JSON.parse(await readFile(new URL('public/data/snapshot-transport.json',here),'utf8'));
registry.items=registry.items.filter(item=>!item.path.startsWith('/trains/'));
registry.items.push(...files);
registry.originalBytes=registry.items.reduce((n,item)=>n+item.bytes,0);
await writeFile(new URL('public/data/snapshot-transport.json',here),JSON.stringify(registry)+'\n');
console.log(JSON.stringify({stations:items.length,operators:verified.length,shards:SHARDS,files:files.length,stationsBytes:bytesStations,boardsBytes,skipped:results.filter(r=>r.status!=='verified').map(r=>({id:r.id,reason:r.reason}))}));
