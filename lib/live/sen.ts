import {getSource,SourceError} from './adapters';
import type {Loader} from './types';

/*
 Transelectrica SEN — observația curentă a sistemului energetic național (producție,
 consum, sold de schimb, în MW). Răspunsul sursei e o listă de obiecte cu câte o cheie
 (o singură observație, nu un tabel independent) care se aplatizează la parsare.
 Marcajul de timp al sursei (row1_HARTASEN_DATA, „YY/MM/DD HH:MM:SS") se parsează pe
 convenția Europe/Bucharest — declarată ca presupunere, nu confirmată de sursă — și
 valoarea originală se păstrează alături. Vechimea se calculează pe momentul observat:
 sursa publică cu 1–2 minute în urmă, deci o vechime de câteva minute e normală. Soldul
 și puterea nu sunt tarife de energie sau cantități de facturat; reconcilierea completă
 a componentelor de producție nu e definită de contractul sursei — componentele se
 servesc exact cum le publică sursa, cu nota de agregare.
*/

const SEN_URL='https://www.transelectrica.ro/sen-filter';
const SOURCE_TIME_FIELD='row1_HARTASEN_DATA';

const toNumber=(value:unknown)=>{const text=String(value??'').trim().replace(',','.');const n=Number(text);return text&&Number.isFinite(n)?n:null};

// Ora locală a Europei/Bucharest, recompusă din formatToParts — comparația inversă a
// candidaturilor de fus se face pe acest format, nu pe un offset hardcodat.
const roLocalWall=(date:Date)=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
};

// Anul sursei are două cifre (fereastra 2000+YY), marcajul carnetului „YY/MM/DD
// HH:MM:SS" este ora locală pe ceasul României, dar JSON-ul sursei nu declară fusul —
// rămâne presupunerea declarată. Conversia încearcă ambele offseturi reale ale
// României (UTC+2 iarna, UTC+3 vara) și acceptă numai candidatul care, formatat înapoi
// prin regulile Europe/Bucharest, reproduce exact ora citită. Rezultatele speciale:
// ora inexistentă la trecerea de primăvară si ora repetată la trecerea de toamnă nu
// se confirmă — momentul rămâne null cu motivul explicit.
export function parseSourceTimestamp(text:unknown):{utc:string|null;note:string|null}{
 const match=/^(\d{2})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(String(text??'').trim());
 if(!match)return {utc:null,note:null};
 const [,yy,mm,dd,h,m,s]=match;
 const year=2000+Number(yy),nowYear=new Date().getUTCFullYear();
 if(year>nowYear+1)return {utc:null,note:'anul de referință este implauzibil pentru sursa reală'};
 const month=Number(mm),day=Number(dd),hour=Number(h),minute=Number(m),second=Number(s);
 if(month<1||month>12)return {utc:null,note:'luna este imposibilă pe un calendar'};
 if(day<1||day>31)return {utc:null,note:'ziua este imposibilă pe un calendar'};
 if(hour>23||minute>59||second>59)return {utc:null,note:'ora este imposibilă pe un ceas'};
 const dayCheck=new Date(Date.UTC(year,month-1,day));
 if(dayCheck.getUTCFullYear()!==year||dayCheck.getUTCMonth()!==month-1||dayCheck.getUTCDate()!==day)return {utc:null,note:'ziua nu există în calendarul acelui an'};
 const wall=`${year}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${String(hour).padStart(2,'0')}:${m}:${s}`;
 const candidates=[2,3].map(offset=>new Date(Date.UTC(year,month-1,day,hour,minute,second)-offset*3600000)).filter(date=>Number.isFinite(date.getTime())&&roLocalWall(date)===wall);
 if(candidates.length===1){const iso=candidates[0].toISOString();return {utc:iso.endsWith('.000Z')?iso.slice(0,-5)+'Z':iso,note:null}}
 if(candidates.length===2)return {utc:null,note:'ora apare de două ori la trecerea la ora de iarnă (trecerea de toamnă) — sursa nu dezambiguizează, momentul nu se confirmă'};
 return {utc:null,note:'ora nu există pe ceasul local al zilei respective (trecerea la ora de vară elimină 03:00–03:59)'};
}

export type SenObservation={
  observedAt:string|null;observedAtText:string|null;observedAtNote:string|null;timezoneAssumption:string;
  productionMW:number|null;consumptionMW:number|null;balanceSoldMW:number|null;
  componentsMW:Record<string,number|null>;sourceFields:Record<string,string>;
  reconciliationNote:string;unitNote:string;
};

export function parseSen(body:unknown):SenObservation{
  // getSource servește textul sursei; corpul e JSON chiar dacă sursa declară alt
  // content-type — parsarea se face pe corp, nu pe header.
  let raw:unknown=body;
  if(typeof body==='string'){try{raw=JSON.parse(body)}catch{throw new SourceError('Răspunsul Transelectrica nu s-a putut parsa ca JSON.')}}
  if(!Array.isArray(raw))throw new SourceError('Răspunsul Transelectrica nu are forma așteptată (listă de obiecte cu o cheie).');
  const flat:Record<string,string>={};
  for(const entry of raw)if(entry&&typeof entry==='object')for(const [k,v] of Object.entries(entry as Record<string,unknown>))flat[k]=String(v??'');
  const observedAtText=flat[SOURCE_TIME_FIELD]??null;
  const stamp=parseSourceTimestamp(observedAtText);
  const {productionMW,consumptionMW,balanceSoldMW,componentsMW,sourceFields}=flattenSen(flat);
  // Cele trei puteri sunt contractul observației: un „succes" cu toate goale ar însemna
  // un endpoint mutat sau un răspuns gol servit ca dată — eșec de sursă, nu observație.
  if(productionMW===null||consumptionMW===null||balanceSoldMW===null)throw new SourceError('Răspunsul Transelectrica nu conține puterile așteptate (PROD, CONS, SOLD) ca valori numerice — endpoint sau format schimbat, nu o observație validă.');
  return {observedAt:stamp.utc,observedAtText,observedAtNote:stamp.note,timezoneAssumption:'Europe/Bucharest — presupunere declarată, neconfirmată de sursă',productionMW,consumptionMW,balanceSoldMW,componentsMW,sourceFields,reconciliationNote:'Componentele de producție se servesc cum le publică sursa; reconcilierea completă a agregării nu e definită de contractul publicat.',unitNote:'MW — soldul și puterea nu sunt tarife de energie sau cantități de facturat.'};
}

// O copie persistentă scrisă de adaptorul v1 (offset fix UTC+2) poate purta o oră
// greșită de o oră în sezonul de vară; servirea ei recalifică momentul din valoarea
// brută păstrată, cu parserul curent — fără a invalida copia de puteri.
export function revalidateSenTime(observation:SenObservation):SenObservation{
 const stamp=parseSourceTimestamp(observation.observedAtText);
 return {...observation,observedAt:stamp.utc,observedAtNote:stamp.note};
}

function flattenSen(flat:Record<string,string>){
 const productionMW=toNumber(flat['PROD']),consumptionMW=toNumber(flat['CONS']),balanceSoldMW=toNumber(flat['SOLD']);
 // Componentele de producție publicate de sursă (denumirile sursei, nemodificate):
 // mixul de producție plus grupurile hidro găzduite, fără variantele pe sfert de oră.
 const componentKeys=['EOLIAN','FOTO','APE','NUCL','GAZE','CARB','BMASA','COSE','DOBR','DJER','VARN','KOZL1','KOZL2','S110','SIP_','KUSJ','ISPOZ','VULC'];
 const componentsMW:Record<string,number|null>={};
 for(const key of componentKeys)if(flat[key]!==undefined)componentsMW[key]=toNumber(flat[key]);
 const sourceFields:Record<string,string>={};
 for(const [k,v] of Object.entries(flat))if(k!==SOURCE_TIME_FIELD&&(toNumber(v)!==null||!['PROD','CONS','SOLD'].includes(k)))sourceFields[k]=v;
 return {productionMW,consumptionMW,balanceSoldMW,componentsMW,sourceFields};
}

export const senLoader:Loader<SenObservation>={key:'power:sen',name:'Transelectrica · sistemul energetic național',url:SEN_URL,version:'energy.power-system.v2',ttl:60,load:async()=>({data:parseSen(await getSource(SEN_URL)),publishedAt:null})};
