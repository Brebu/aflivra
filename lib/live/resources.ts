import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import {read,utils} from 'xlsx';
import {unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
import {publicUrl} from './media';
import {env} from 'cloudflare:workers';
import {getSource,SourceError} from './adapters';
import {xmlTableRowSet,isWordPackage,wordPackageText} from './source-xml';
import {matchesQuery,paginate,compareValues} from './query';
import type {Loader,Loaded,SourceState} from './types';
import {savedResourceMetadata} from './catalog-metadata';
import {tabularMatches,tabularLocationNote,tabularGeography,datastoreGeographicFilters} from '../tabular-geography';
import type {GeographicContext} from '../geographic-scope';
export type ResourceSheet={name:string;columns:string[];rows:string[][];total:number;truncated:boolean};
export type ResourceQuery={q:string;page:number;sheet:number;sort:number;desc:boolean;geographicContext?:GeographicContext};
const cell=(v:unknown)=>v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);
const byteLength=(v:string)=>new TextEncoder().encode(v).length;
// Fișa publicată la sursă poartă formatele așa cum le scrie editorul: variante cu majuscule
// lipsă („XSLX"), despărțite prin separatori („JSON, SOAP, XML") sau cu punct final („XML.").
// Normalizarea ia primul jeton, curăță punctele și spațiile de la capete și aplică aliasurile
// cunoscute; „ZIP, SHP" rămâne la absența onestă a cititorului, cu prima formă numită.
const FORMAT_ALIASES:Record<string,string>={XSLX:'XLSX',XLSXL:'XLS',XLSL:'XLS'};
const normalizeResourceFormat=(format:string)=>{
 const token=format.toUpperCase().split(/[,;/ ]/)[0]||'';
 const clean=token.replace(/^[.\s]+/,'').replace(/[.\s]+$/,'');
 return FORMAT_ALIASES[clean]??clean;
};
export function parseResource(bytes:Uint8Array,format:string,title?:string):Loaded {
 const kind=normalizeResourceFormat(format);
 if(kind==='PDF'){
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new SourceError('Fișierul primit nu este un PDF valid.');
  if(bytes.length>1_400_000)return{publishedAt:null,data:{kind:'pdf',binary:bytes,size:bytes.length}};
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));
  return{publishedAt:null,data:{kind:'pdf',base64:btoa(binary),size:bytes.length}};
 }
 let sheets:ResourceSheet[]=[];
 if(kind==='JSON'||kind==='GEOJSON'){
  const json=JSON.parse(new TextDecoder().decode(bytes));const records=Array.isArray(json)?json:Array.isArray(json.records)?json.records:Array.isArray(json.features)?json.features:json&&typeof json==='object'?[json]:[{value:json}];
  const objects=records.map((r:any)=>r&&typeof r==='object'&&!Array.isArray(r)?r:{value:r});const columns=[...new Set<string>(objects.flatMap((r:any)=>Object.keys(r)))];
  sheets=[{name:'Date',columns,rows:objects.map((r:any)=>columns.map(k=>cell(r[k]))),total:records.length,truncated:false}];
 }else if(['CSV','TSV','XLS','XLSX','ODS'].includes(kind)){
  if(bytes[0]===80&&bytes[1]===75){let expanded=0;unzipSync(bytes,{filter:f=>{expanded+=f.originalSize;if(f.originalSize>20_000_000||expanded>40_000_000)throw new SourceError('Arhiva extinsă depășește capacitatea cititorului; nu a fost importată parțial.');return false}})}
  const book=read(bytes,{type:'array',cellDates:false,raw:false});
  sheets=book.SheetNames.map(name=>{const array=utils.sheet_to_json<unknown[]>(book.Sheets[name],{header:1,defval:'',blankrows:false,raw:false});const header=array.shift()||[];let width=header.length;for(const row of array)width=Math.max(width,row.length);const columns=Array.from({length:width},(_,i)=>cell(header[i])||'Coloana '+(i+1));return{name,columns,rows:array.map(r=>columns.map((_,i)=>cell(r[i]))),total:array.length,truncated:false}});
 }else if(['XML','TXT','TEXT'].includes(kind)){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new SourceError('Documentul XML conține declarații care nu sunt acceptate.');
  if(kind==='XML'){
   // Stratul de tabel: mulțimea dominantă de rânduri aplatizează XML-ul în foaie; fără ea,
   // conținutul rămâne document integral, etichetat onest cu formatul lui.
   const table=xmlTableRowSet(text);
   if(table)sheets=[{name:table.name||title||'XML',columns:table.columns,rows:table.rows,total:table.rows.length,truncated:false}];
   else if(isWordPackage(text))return{publishedAt:null,data:{kind:'text',text:wordPackageText(text),format:'XML, DOC',textComplete:false,sourceShape:'word-flat-opc',originalCharacters:text.length,xmlDocument:text}};
   else return{publishedAt:null,data:{kind:'text',text,format:'XML',textComplete:true}};
  }else return{publishedAt:null,data:{kind:'text',text,format:kind,textComplete:true}};
 }else throw new SourceError('Formatul '+kind+' nu are încă un cititor integrat. Metadatele rămân disponibile.');
 if(!sheets.some(s=>s.columns.length))throw new SourceError('Fișierul nu conține un tabel utilizabil.');
 return{data:{kind:'table',sheets},publishedAt:null};
}
// The quality profile describes the source's own table: column identifiers are
// stable per index, duplicate labels get a distinct display label, and missing
// vs. zero values are counted separately — normalization for analysis stays
// separate from the export, which always keeps the original labels and rows.
function sheetQualityProfile(rows:string[][],columns:string[]){
 const labels=columns.map(label=>String(label??''));
 const occurrences=new Map<string,number>();for(const label of labels)occurrences.set(label,(occurrences.get(label)||0)+1);
 const ordinal=new Map<string,number>();
 const profile=labels.map((label,index)=>{const seen=(ordinal.get(label)||0)+1;ordinal.set(label,seen);let missing=0,zero=0;for(const row of rows){const value=String(row[index]??'').trim();if(!value)missing++;else if(/^-?(?:0+(?:[.,]0+)?)$/.test(value.replace(/\s/g,'')))zero++}return{columnId:'c'+index,label,...((occurrences.get(label)||0)>1?{displayLabel:label+' ('+seen+')'}:{}),missingCount:missing,zeroCount:zero}});
 const seen=new Set<string>();let duplicates=0;for(const row of rows){const key=JSON.stringify(row);if(seen.has(key))duplicates++;else seen.add(key)}
 return{rows:rows.length,exactDuplicateRows:duplicates,columns:profile};
}
// Immutable chunks keep every accepted row and cell within D1's per-row limit.
// Publish the snapshot only after all of its chunks have been written.
export function chunkRows(rows:string[][],maximum=450_000){const chunks:string[][][]=[];let chunk:string[][]=[],size=2;for(const row of rows){const n=byteLength(JSON.stringify(row))+1;if(n>1_600_000)throw new SourceError('O înregistrare depășește capacitatea stocării. Copia anterioară rămâne intactă.');if(chunk.length&&size+n>maximum){chunks.push(chunk);chunk=[];size=2}chunk.push(row);size+=n}if(chunk.length)chunks.push(chunk);return chunks}
async function indexTable(id:string,parsed:any,publishedAt:string|null){
 const db=env.DB;if(!db)throw new SourceError('Stocarea persistentă a resursei este temporar indisponibilă.');
 const version=createHash('sha256').update(JSON.stringify(parsed)).digest('hex'),written:string[]=[],sheets:any[]=[];
 try{for(let sheet=0;sheet<parsed.sheets.length;sheet++){const s=parsed.sheets[sheet],keys:string[]=[],checksums:string[]=[];let imported=0;
  const quality=sheetQualityProfile(s.rows,s.columns);for(const [part,rows] of chunkRows(s.rows).entries()){const key=`resource-chunk:${id}:${version}:${sheet}:${part}`,encoded=JSON.stringify(rows);const result=await db.prepare('INSERT OR IGNORE INTO source_cache (key,data,published_at,last_success_at,adapter_version) VALUES (?,?,?,?,?)').bind(key,encoded,publishedAt,new Date().toISOString(),'resource.chunk.v2').run();if(result.meta.changes)written.push(key);keys.push(key);checksums.push(createHash('sha256').update(encoded).digest('hex'));imported+=rows.length}if(imported!==s.total)throw new SourceError('Numărul de rânduri importate nu coincide cu setul primit.');sheets.push({...s,rows:[],qualityProfile:quality,chunks:keys,checksums,integrity:{expectedRows:s.total,importedRows:imported,columns:s.columns.length,complete:true}})}return{...parsed,sheets,indexed:true,snapshot:version,complete:true};
 }catch(error){for(const key of written)await db.prepare('DELETE FROM source_cache WHERE key=?').bind(key).run();throw error}
}
async function indexDocument(id:string,parsed:any,publishedAt:string|null){const db=env.DB;if(!db)throw new SourceError('Stocarea documentului este temporar indisponibilă.');const binary=parsed.binary instanceof Uint8Array,content=binary?parsed.binary:new TextEncoder().encode(parsed.text),version=createHash('sha256').update(content).digest('hex'),keys:string[]=[],checksums:string[]=[],created:string[]=[];let imported=0;try{for(let at=0;at<content.length;at+=300000){const key=`resource-document:${id}:${version}:${at}`,part=content.slice(at,at+300000);let encoded='';for(let i=0;i<part.length;i+=8192)encoded+=String.fromCharCode(...part.slice(i,i+8192));const data=JSON.stringify(btoa(encoded)),checksum=createHash('sha256').update(data).digest('hex');const result=await db.prepare('INSERT OR IGNORE INTO source_cache (key,data,published_at,last_success_at,adapter_version) VALUES (?,?,?,?,?)').bind(key,data,publishedAt,new Date().toISOString(),'resource.document.v1').run();if(result.meta.changes)created.push(key);const stored=await db.prepare('SELECT data FROM source_cache WHERE key=?').bind(key).first<{data:string}>();if(!stored||createHash('sha256').update(stored.data).digest('hex')!==checksum)throw new SourceError('Documentul nu a trecut verificarea integralității după stocare.');keys.push(key);checksums.push(checksum);imported+=part.length}if(imported!==content.length)throw new SourceError('Documentul nu a fost importat integral.');const {binary:ignored,text,...metadata}=parsed;return{...metadata,documentChunks:keys,documentChecksums:checksums,snapshot:version,size:content.length,complete:true,integrity:{expectedBytes:content.length,importedBytes:imported,passes:3}}}catch(e){for(const key of created)await db.prepare('DELETE FROM source_cache WHERE key=?').bind(key).run();throw e}}
export async function documentPart(data:any,index:number){const key=data.documentChunks?.[index],db=env.DB;if(!key||!db)throw new SourceError('Documentul nu poate fi citit acum.');const record=await db.prepare('SELECT data FROM source_cache WHERE key=?').bind(key).first<{data:string}>();if(!record?.data||data.documentChecksums?.[index]&&createHash('sha256').update(record.data).digest('hex')!==data.documentChecksums[index])throw new SourceError('Verificarea integralității documentului a eșuat.');return Uint8Array.from(atob(JSON.parse(record.data)),c=>c.charCodeAt(0))}
export async function expandDocument(state:SourceState){const d=state.data;if(!d?.documentChunks||d.kind!=='text')return state;const decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0;for(let i=0;i<d.documentChunks.length;i++){const part=await documentPart(d,i);bytes+=part.length;text+=decoder.decode(part,{stream:true})}text+=decoder.decode();if(bytes!==d.size)throw new SourceError('Documentul nu conține toate datele importate.');return{...state,data:{...d,text,documentChunks:undefined,documentChecksums:undefined}}}
const resourceHosts=new Set(['data.gov.ro','www.edu.ro','edu.ro','cnas.ro','www.cnas.ro','insse.ro','www.insse.ro','www.meteoromania.ro','opendata.meteoromania.ro','static.anaf.ro','www.just.ro','just.ro']);
export async function downloadResource(url:URL){
 if(url.protocol!=='https:'||url.username||url.password||!resourceHosts.has(url.hostname)||url.port&&url.port!=='443')throw new SourceError('Fișierul este pe un editor extern care nu este încă conectat. Metadatele lui rămân disponibile.');
 let response:Response;for(let hop=0;;hop++){response=await fetchWithServerRetry(url,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Aflivra/1.0 public-data-reader'}});if(![301,302,303,307,308].includes(response.status))break;const location=response.headers.get('location');if(!location||hop>=3)throw new SourceError('Redirecționarea fișierului nu a putut fi confirmată.');const next=new URL(location,url);if(next.protocol!=='https:'||next.username||next.password||!resourceHosts.has(next.hostname)||next.port&&next.port!=='443')throw new SourceError('Fișierul a fost mutat la un editor care trebuie conectat.');url=next}if(!response.ok)throw new SourceError('Fișierul public răspunde cu HTTP '+response.status+'.');if(Number(response.headers.get('content-length'))>25_000_000)throw new SourceError('Fișierul depășește capacitatea de 25 MB a importului. Documentul nu a fost scurtat.');
 const reader=response.body?.getReader();if(!reader)throw new SourceError('Fișierul nu are conținut.');const chunks:Uint8Array[]=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>25_000_000){await reader.cancel();throw new SourceError('Fișierul depășește capacitatea de 25 MB a importului.')}chunks.push(value)}const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}return bytes;
}
export const resourceLoader=(id:string):Loader=>({key:'resource:'+id,name:'Resursă publică · data.gov.ro',url:'https://data.gov.ro/api/3/action/resource_show?id='+id,version:'resource.complete-index.v8',ttl:86400,load:async()=>{
 const snapshot=await savedResourceMetadata(id);let r:any,metadataNotice='';try{const meta=JSON.parse(await getSource('https://data.gov.ro/api/3/action/resource_show?id='+id,undefined,{timeoutMs:snapshot?3500:18000}));if(meta.success!==true||!meta.result?.url)throw new SourceError('Metadatele resursei nu sunt disponibile.');r=meta.result}catch(error){if(!snapshot)throw error;r=snapshot.resource;metadataNotice='Fișier citit folosind fișa din inventarul verificat; API-ul metadatelor nu a răspuns. Fișa a trecut verificarea SHA-256.'}
 const publishedAt=r.last_modified||r.created||null,title=String(r.name||id);
 if(r.datastore_active){try{const d=JSON.parse(await getSource('https://data.gov.ro/api/3/action/datastore_search?'+new URLSearchParams({resource_id:id,limit:'0'}),undefined,{timeoutMs:snapshot?3500:18000}));if(d.success!==true||!Array.isArray(d.result?.fields)||!Number.isInteger(d.result.total))throw new SourceError('Structura tabelului public nu este disponibilă.');return{publishedAt,data:{kind:'datastore',title,sourceUrl:r.url,columns:d.result.fields.map((f:any)=>String(f.id)),total:d.result.total,metadataNotice}}}catch{metadataNotice+=' Tabelul API nu a răspuns; verificăm fișierul publicat.'}}
 const url=new URL(r.url);if(url.protocol==='http:'&&url.hostname==='data.gov.ro')url.protocol='https:';
 const mediaFormat=String(r.format||'').toUpperCase();if(/^(?:JPG|JPEG|PNG|WEBP|GIF|MP4|WEBM|OGV)$/.test(mediaFormat)){const mediaUrl=publicUrl(url.href);if(!mediaUrl)throw new SourceError('Materialul media nu are o adresă HTTPS utilizabilă.');return{publishedAt,data:{kind:'media',title,sourceUrl:url.href,media:[{kind:/MP4|WEBM|OGV/.test(mediaFormat)?'video':'image',url:mediaUrl,caption:title,sourceUrl:'https://data.gov.ro/dataset/'+String(r.package_id||'')}]}}}
 const parsed=parseResource(await downloadResource(url),String(r.format||url.pathname.split('.').at(-1)||''),title);const data=parsed.data.kind==='table'?await indexTable(id,parsed.data,publishedAt):parsed.data.binary||parsed.data.kind==='text'&&byteLength(parsed.data.text)>1_000_000?await indexDocument(id,parsed.data,publishedAt):parsed.data;return{publishedAt,data:{...data,title,sourceUrl:url.href,metadataNotice}};
}});
// Livrarea documentului Word e onestă indiferent de forma rândului: rândul
// proaspât poartă deja extrasul și integralul pe xmlDocument, dar istoricul
// sau seed-ul poartă XML-ul brut în text — extracția se aplică la servire, iar
// integralul rămâne descărcabil pe ruta de fișier.
export function wordDocumentView(data:any):any{
 if(!data||data.kind!=='text')return null;
 let raw=typeof data.xmlDocument==='string'?data.xmlDocument:null;
 let text=typeof data.text==='string'?data.text:'';
 if(!raw&&data.sourceShape!=='word-flat-opc'&&isWordPackage(text))raw=text;
 if(!raw)return null;
 if(data.sourceShape!=='word-flat-opc'||data.textComplete!==false)text=wordPackageText(raw);
 return {...data,xmlDocument:undefined,text,sourceShape:'word-flat-opc',textComplete:false,format:/DOC/i.test(String(data.format||''))?data.format:'XML, DOC',originalCharacters:typeof data.originalCharacters==='number'?data.originalCharacters:raw.length};
}
export function selectResourceRows(rows:string[][],query:ResourceQuery){const found=rows.filter(r=>matchesQuery(r,query.q));if(query.sort>=0)found.sort((a,b)=>compareValues(a[query.sort],b[query.sort])*(query.desc?-1:1));return paginate(found,query.page,50)}
export async function resourceSheetRows(d:any,sheetIndex:number){
 const sheet=d.sheets[sheetIndex];if(!sheet)throw new SourceError('Foaia solicitată nu există în acest set.');if(!d.indexed){if(d.complete===true&&sheet.rows?.length!==sheet.total)throw new SourceError('Copia nu conține toate rândurile verificate.');return sheet.rows as string[][]}const db=env.DB;if(!db)throw new SourceError('Copia persistentă nu poate fi citită acum.');let rows:string[][]=[];
 for(let at=0;at<sheet.chunks.length;at+=4){const chunks=await Promise.all(sheet.chunks.slice(at,at+4).map(async(key:string,index:number)=>{const chunk=await db.prepare('SELECT data FROM source_cache WHERE key=?').bind(key).first<{data:string}>();if(!chunk?.data)throw new SourceError('Copia resursei este incompletă pe server; reîncercăm preluarea.');if(sheet.checksums?.[at+index]&&createHash('sha256').update(chunk.data).digest('hex')!==sheet.checksums[at+index])throw new SourceError('Verificarea integralității resursei a eșuat.');return JSON.parse(chunk.data)}));for(const chunk of chunks)for(const row of chunk)rows.push(row)}
 if(rows.length!==sheet.total)throw new SourceError('Copia persistentă nu conține toate rândurile importate.');
 return rows;
}
export async function resourcePage(state:SourceState,query:ResourceQuery):Promise<SourceState>{
 const d=state.data;if(!d||d.kind!=='table'||!d.indexed&&d.complete!==true)return state;const rows=await resourceSheetRows(d,query.sheet);
 const columns=d.sheets[query.sheet].columns,localRows=rows.filter(r=>tabularMatches(r,columns,query.geographicContext)),selection=selectResourceRows(localRows,query);return{...state,data:{...d,geographicNote:tabularLocationNote(columns,query.geographicContext),sheets:d.sheets.map((s:any,i:number)=>({...s,chunks:undefined,rows:i===query.sheet?selection.items:[],truncated:false})),navigation:{...selection,items:undefined,sheet:query.sheet,query:query.q,complete:true}}};
}
export const datastorePageLoader=(id:string,meta:SourceState,query:ResourceQuery):Loader=>({key:'resource:'+id+':query:'+JSON.stringify(query),name:meta.name,url:meta.url,version:'ckan.datastore-pages.v1',ttl:3600,load:async()=>{
 const d=meta.data,column=d.columns[query.sort],filters=datastoreGeographicFilters(d.columns,query.geographicContext),fields=tabularGeography(d.columns),coordinateOnly=query.geographicContext?.active&&fields.lat>=0&&fields.lon>=0&&fields.locality<0&&fields.county<0;
 if(coordinateOnly)return{publishedAt:meta.publishedAt,data:{kind:'table',title:d.title,sourceUrl:d.sourceUrl,geographicNote:'API-ul acestui tabel nu permite o filtrare sigură după distanță. Selectează Toată România pentru tabelul integral.',sheets:[{name:d.title,columns:d.columns,rows:[],total:d.total,truncated:false}],navigation:{total:0,page:0,pageSize:50,pages:1,sheet:0,query:query.q,complete:true,remote:true}}};
 const params=new URLSearchParams({resource_id:id,limit:'50',offset:String(query.page*50),...(Object.keys(filters).length?{filters:JSON.stringify(filters)}:{}),...(query.q?{q:query.q}:{}),...(column?{sort:'"'+column.replaceAll('"','""')+'" '+(query.desc?'desc':'asc')}: {})});const response=JSON.parse(await getSource('https://data.gov.ro/api/3/action/datastore_search?'+params));if(response.success!==true||!Array.isArray(response.result?.records)||!Number.isInteger(response.result.total))throw new SourceError('Pagina tabelului public nu a fost primită.');const columns=response.result.fields.map((f:any)=>String(f.id)),rows=response.result.records.map((r:any)=>columns.map((c:string)=>cell(r[c])));
 return{publishedAt:meta.publishedAt,data:{kind:'table',title:d.title,sourceUrl:d.sourceUrl,geographicNote:tabularLocationNote(columns,query.geographicContext),sheets:[{name:d.title,columns,rows:rows.filter((row:string[])=>tabularMatches(row,columns,query.geographicContext)),total:d.total,truncated:false}],navigation:{total:response.result.total,page:query.page,pageSize:50,pages:Math.max(1,Math.ceil(response.result.total/50)),sheet:0,query:query.q,complete:true,remote:true}}};
}});
