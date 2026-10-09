import {getSource,SourceError} from './adapters';
import {read,utils} from 'xlsx';
import {downloadResource} from './resources';
import {createHash} from 'node:crypto';
import type {Loader,Loaded} from './types';

/*
 Registrele profesionale ale justiției — XLSX exports published on data.gov.ro (CC-BY-4.0):
 notari publici, experți judiciari, experți tehnici atestați and traducători și interpreți.
 Each loader picks the newest dated export of its dataset, verifies the published structure
 before accepting it, and serves the full registry with the original columns so every
 published field stays inspectable. The notary fee grid is a separate act — Ordinul
 ministrului justiției nr. 177/C/2024 — linked from the workspace to the Portal Legislativ.
*/

export type JusticeRegistryKind='notari'|'experti-judiciari'|'experti-tehnici'|'traducatori';
type JusticeRegistry={name:string;dataset:string;sourceName:string;publisher:string;note:string;required:string[];facet:string;facetTitle:string;};
const months:Record<string,number>={ianuarie:1,februarie:2,martie:3,aprilie:4,mai:5,iunie:6,iulie:7,august:8,septembrie:9,octombrie:10,noiembrie:11,decembrie:12};
const scoreDate=(name:string)=>{const dotted=name.match(/(\d{2})\.(\d{2})\.(20\d{2})/);if(dotted)return Number(dotted[3])+Number(dotted[2])/100+Number(dotted[1])/10000;const text=name.match(/(\d{1,2})\s+([a-zăâșțîşţ]+)\s+(20\d{2})/i);const month=text&&months[text[2].toLowerCase()];return text&&month?Number(text[3])+month/100+Number(text[1])/10000:0};
const periodOf=(name:string)=>{const dotted=name.match(/(\d{2})\.(\d{2})\.(20\d{2})/);if(dotted)return {period:dotted[0],published:dotted[3]+'-'+dotted[2]+'-'+dotted[1]};const text=name.match(/(?:p(?:a|â)na la data de\s+)?(\d{1,2})\s+([a-zăâșțîşţ]+)\s+(20\d{2})/i);const month=text&&months[text[2].toLowerCase()];return text&&month?{period:text[0],published:text[3]+'-'+String(month).padStart(2,'0')+'-'+text[1].padStart(2,'0')}:null};

export const justiceRegistries:Record<JusticeRegistryKind,JusticeRegistry>={
 notari:{name:'Registrul notarilor publici',dataset:'bc69c898-b356-4e2c-9251-1833857d1a6e',sourceName:'MJ / CECNJ',publisher:'Ministerul Justiției',
  note:'Registrul notarilor publici, publicat de Ministerul Justiției. Grila de onorarii se stabilește prin Ordinul ministrului justiției nr. 177/C/2024; actul oficial se consultă pe Portalul Legislativ.',
  required:['NUME','CAMERA','LOCALITATE','JUDET'],facet:'CAMERA',facetTitle:'Camerele notarilor'},
 'experti-judiciari':{name:'Tabloul experților judiciari',dataset:'476a8363-7c91-43e2-99d2-4fbe144c8e2a',sourceName:'MJ · experți judiciari',publisher:'Ministerul Justiției',
  note:'Experții judiciari și specialiștii Ministerului Justiției, la ediția publicată în catalog. Prezența în tablou nu atestă disponibilitatea pentru un dosar anume.',
  required:['Legitimatie','Judet','Nume'],facet:'Judet',facetTitle:'Județele'},
 'experti-tehnici':{name:'Registrul experților tehnici atestați',dataset:'3f26ecb7-df7e-454e-a029-89dbd6d82c3f',sourceName:'MDPLPA · experți tehnici',publisher:'Ministerul Dezvoltării, Lucrărilor Publice și Administrației',
  note:'Experții tehnici atestați, la lista publicată în catalog. Atestarea nu implică disponibilitatea sau acceptarea unei misiuni pentru un dosar anume.',
  required:['Nume și prenume','Județul'],facet:'Județul',facetTitle:'Județele'},
 traducatori:{name:'Registrul traducătorilor și interpreților',dataset:'b1c5ffa9-9dbc-4e71-82c5-6dbee3c806ff',sourceName:'MJ · traducători',publisher:'Ministerul Justiției',
  note:'Traducătorii și interpreții autorizați, la ediția publicată în catalog. Autorizația nu confirmă disponibilitatea pentru o lucrare anume.',
  required:['Nume','Limbi'],facet:'Judet',facetTitle:'Județele'}};

const matchesResource=(kind:JusticeRegistryKind,name:string):boolean=>{const clean=String(name||'').trim();
 if(kind==='notari')return /^notari[\s_]+\d{2}\.\d{2}\.\d{4}/i.test(clean);
 if(kind==='experti-judiciari')return /^experti judiciari[\s_]+\d{2}\.\d{2}\.\d{4}/i.test(clean);
 if(kind==='experti-tehnici')return /exper[țţt]ii?lor tehnici atest/i.test(clean)&&!/suspend/i.test(clean)&&!!scoreDate(clean);
 return /^traduc[ăa]tori[\s_]*(?:[sș]i[\s_]*interpre[țt]i[\s_]*)?\d{2}\.\d{2}\.\d{4}/i.test(clean)};

function workbookRecords(bytes:ArrayBuffer):Record<string,unknown>[]{
 const book=read(bytes,{type:'array',cellDates:false,raw:false});
 const records:Record<string,unknown>[]=[];
 for(const sheetName of book.SheetNames){
  const array=utils.sheet_to_json<unknown[]>(book.Sheets[sheetName],{header:1,defval:null,blankrows:false});
  const headerIndex=array.findIndex(row=>Array.isArray(row)&&row.length>1&&row.some(cell=>/^n[ua]me/i.test(String(cell??'').trim())));
  if(headerIndex<0)continue;
  const header=array[headerIndex].map(cell=>String(cell??'').trim());
  for(const row of array.slice(headerIndex+1)){
   if(!Array.isArray(row)||!row.some(cell=>cell!==null&&cell!==undefined&&String(cell).trim()!==''))continue;
   records.push(Object.fromEntries(header.map((column,index)=>[column,row[index]??null])));
  }
 }
 return records;
}
function distinctValues(records:Record<string,unknown>[],column:string):string[]{
 return [...new Set(records.map(record=>String(record[column]??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ro'));
}
export function parseJusticeRegistry(bytes:ArrayBuffer,kind:JusticeRegistryKind,resourceName:string):Loaded{
 const registry=justiceRegistries[kind],records=workbookRecords(bytes).filter(record=>Object.values(record).some(value=>value!==null&&String(value).trim()!==''));
 if(records.length<10)throw new SourceError('Registrul '+kind+' nu conține înregistrări utilizabile.');
 if(!records.slice(0,5).every(record=>registry.required.every(column=>Object.hasOwn(record,column))))throw new SourceError('Structura registrului '+kind+' s-a schimbat.');
 const edition=periodOf(resourceName);
 return {publishedAt:edition?.published||null,data:{title:registry.name,period:edition?.period||'',note:registry.note,publisher:registry.publisher,fields:[...new Set(records.flatMap(record=>Object.keys(record)))],records,facets:{[registry.facetTitle]:distinctValues(records,registry.facet)},total:records.length}};
}
export function justiceLoader(kind:JusticeRegistryKind):Loader{
 const registry=justiceRegistries[kind];
 return {key:'justice:'+kind,name:registry.sourceName+' · '+registry.name.toLowerCase(),url:'https://data.gov.ro/dataset/'+registry.dataset,version:'justice.registries.v1',ttl:86400,load:async()=>{
  const meta=JSON.parse(await getSource('https://data.gov.ro/api/3/action/package_show?id='+registry.dataset));
  const candidates=(meta.result?.resources||[]).filter((resource:any)=>matchesResource(kind,String(resource.name||''))&&/\.?xlsx/i.test(String(resource.format||''))).map((resource:any)=>({resource,score:scoreDate(String(resource.name||''))})).sort((a:{score:number},b:{score:number})=>b.score-a.score);
  const chosen=candidates[0];
  if(!chosen||new URL(chosen.resource.url).origin!=='https://data.gov.ro')throw new SourceError('Exportul registrului '+kind+' nu este disponibil.');
  const bytes=await downloadResource(new URL(chosen.resource.url));
  return parseJusticeRegistry(bytes.buffer as ArrayBuffer,kind,String(chosen.resource.name||''));
 }};
}
// Cheia trebuie să identifice o persoană, nu un câmp: marcajele sursei („0 0"
// la legitimții) nu diferențiază pe nimeni, deci un număr devine cheie doar când
// poartă cifre reale; altfel cheia derivă din tot ce separă două persoane.
const plausibleRegistryNumber=(value:unknown)=>{
 const text=String(value??'').trim();
 return text&&/[1-9]/.test(text)?text:null;
};
export const justiceRecordId=(kind:JusticeRegistryKind,record:Record<string,unknown>):string=>{
 const primary=kind==='experti-judiciari'?plausibleRegistryNumber(record.Legitimatie):kind==='traducatori'?plausibleRegistryNumber(record['Nr Autorizatie']):null;
 if(primary)return primary;
 return createHash('sha256').update(kind+JSON.stringify([record.NUME||record.Nume||record['Nume și prenume'],record.JUDET||record.Judet||record.Județul||record.CAMERA||record['Curte de Apel'],record.Telefon||record.telefon,record.Adresa||record.ADRESA_SEDIU||record['Adresa sediu'],record.Specializare,record.Email,record.Limbi])).digest('hex').slice(0,12);
};
