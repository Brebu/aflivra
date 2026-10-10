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

const SEN_URL='https://www.transelectrica.ro/web/tel/sen-filter';
const SOURCE_TIME_FIELD='row1_HARTASEN_DATA';

const toNumber=(value:unknown)=>{const text=String(value??'').trim().replace(',','.');const n=Number(text);return text&&Number.isFinite(n)?n:null};

// Anul sursei are două cifre: fereastra 2000+YY (un „26" e 2026, nu 1926); valorile
// viitoare peste +1 an față de anul curent nu se produc din sursă reală.
const parseSourceTimestamp=(text:unknown)=>{
 const match=/^(\d{2})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(String(text??'').trim());
 if(!match)return null;
 const [,yy,mm,dd,h,m,s]=match;
 const year=2000+Number(yy),nowYear=new Date().getUTCFullYear();
 if(year>nowYear+1)return null;
 const utc=Date.UTC(year,Number(mm)-1,Number(dd),Number(h)-2,Number(m),Number(s));
 return Number.isFinite(utc)?new Date(utc).toISOString():null;
};

export type SenObservation={
 observedAt:string|null;observedAtText:string|null;timezoneAssumption:string;
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
 const observedAt=parseSourceTimestamp(observedAtText);
 const {productionMW,consumptionMW,balanceSoldMW,componentsMW,sourceFields}=flattenSen(flat);
 return {observedAt,observedAtText,timezoneAssumption:'Europe/Bucharest — presupunere declarată, neconfirmată de sursă',productionMW,consumptionMW,balanceSoldMW,componentsMW,sourceFields,reconciliationNote:'Componentele de producție se servesc cum le publică sursa; reconcilierea completă a agregării nu e definită de contractul publicat.',unitNote:'MW — soldul și puterea nu sunt tarife de energie sau cantități de facturat.'};
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

export const senLoader:Loader<SenObservation>={key:'power:sen',name:'Transelectrica · sistemul energetic național',url:SEN_URL,version:'energy.power-system.v1',ttl:60,load:async()=>({data:parseSen(await getSource(SEN_URL)),publishedAt:null})};
