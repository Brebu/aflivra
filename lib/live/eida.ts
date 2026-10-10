import {createHash} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {SourceError} from './adapters';
import {snapshotAssetPath,decodeSnapshotBytes} from '../snapshot-transport';
import {normalizeSearch,paginate} from './query';
import {calendarRange} from './date';
import proofs from '@/public/data/snapshot-transport.json';

/*
 Datele seismice INFP/EIDA — corpusul static comis de scripts/import-eida-snapshot.mjs
 din serviciile FDSN publice ale institutului: rețeaua de stații RO și istoricul
 cutremurelor resimțite (magnitudine ≥ 3, în dreptunghiul auditat 43–49°N / 20–30°E),
 pe felii anuale care respectă limita serviciului. Istoric și infrastructură, nu
 avertizare curentă: răspunsurile 204 pe ferestrele recente au rămas inconcludente la
 audit, iar fereastra comisă se declară în fiecare răspuns — evenimentele din afara ei
 nu se pretind inexistente. Dreptunghiul Nu definește exclusiv teritoriul României.
*/

type Proof={path:string;file:string;bytes:number;sha256:string};
const proofByPath=new Map((proofs as {items:Proof[]}).items.filter(item=>item.path.startsWith('/eida/')).map(item=>[item.path,item]));

type EidaEvent={eventIdentifier:string;time:string;latitude:string;longitude:string;depthKm:string;eventType:string;magnitude:string;magnitudeType:string;magnitudeAuthor:string;eventLocationName:string};
type EidaStation={network:string;station:string;latitude:string;longitude:string;elevation:string;siteName:string;startTime:string;endTime:string};
type EidaYearCoverage={year:number;status:string;rows:number;httpStatus?:number};
type EidaPayload={schema:string;sourceUrl:string;stationUrl:string;eventUrlPattern:string;window:{from:string;to:string;minMagnitude:number;minLatitude:number;maxLatitude:number;minLongitude:number;maxLongitude:number;note:string};bboxNote:string;truncatedYears:string[];coverageByYear?:EidaYearCoverage[];fetchedAt:string;license:string;licenseNote:string;counts:{stations:number;events:number;eventsByYear:Record<string,number>};stations:EidaStation[];events:EidaEvent[]};

let corpus:{at:number;payload:EidaPayload}|null=null;

const fetchAsset=async(path:string,base:string)=>{
 const request=new Request(new URL(snapshotAssetPath(path),base));
 const response=env.ASSETS?await env.ASSETS.fetch(request):await fetch(request);
 if(!response.ok)throw new SourceError('Datele seismice nu pot fi citite acum.');
 const bytes=decodeSnapshotBytes(await response.arrayBuffer());
 const proof=proofByPath.get(path);
 if(!proof||bytes.length!==proof.bytes||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==proof.sha256)throw new SourceError('Copia datelor seismice nu a trecut verificarea integralității.');
 return JSON.parse(new TextDecoder().decode(bytes)) as EidaPayload;
};

export const readEidaCorpus=async(base:string)=>{
 if(corpus&&Date.now()-corpus.at<600000)return corpus.payload;
 const payload=await fetchAsset('/eida/seismic.json',base);
 corpus={at:Date.now(),payload};
 return payload;
};

export type EidaQuery={kind:'events'|'stations';from?:string;to?:string;minMagnitude?:number;q?:string;page?:number};

export type EidaCoverage={status:'full'|'partial'|'outside'|'inconclusive';requested:{from:string;to:string};effective:{from:string;to:string}|null;inconclusiveYears:number[];note:string;outsideCoverage?:true};

// Acoperirea descrie cererea față de datele verificate, nu existența unui catalog
// seismic complet: „full" înseamnă că intervalul cerut e acoperit de feliile validate;
// „partial" că iese din fereastră sau atinge felii inconcludente (identificate separat);
// „outside" că e în afara datelor, fără a afirma absența cutremurelor reale;
// „inconclusive" că tot intervalul atins a răspuns 204 la sursă. Magnitudinile sub
// pragul corpusului nu se pretin niciodată acoperite.
function coverageFor(payload:EidaPayload,query:EidaQuery):EidaCoverage{
 const windowFrom=payload.window.from,windowTo=payload.window.to;
 const reqFrom=calendarRange(query.from)?.from??windowFrom;
 const reqTo=calendarRange(query.to)?.to??windowTo;
 const outside=reqFrom>windowTo||reqTo<windowFrom;
 const inconclusiveSet=new Set((payload.coverageByYear??[]).filter(entry=>String(entry.status).includes('inconclusive')).map(entry=>entry.year));
 const firstYear=Number(reqFrom.slice(0,4)),lastYear=Number(reqTo.slice(0,4));
 const yearsTouched=[];for(let year=firstYear;year<=lastYear;year++)yearsTouched.push(year);
 const inconclusiveYears=yearsTouched.filter(year=>inconclusiveSet.has(year));
 const allInconclusive=inconclusiveYears.length===yearsTouched.length&&yearsTouched.length>0;
 let status:EidaCoverage['status']='full';
 if(outside)status='outside';
 else if(allInconclusive)status='inconclusive';
 else if(reqFrom<windowFrom||reqTo>windowTo||inconclusiveYears.length)status='partial';
 const notes:string[]=[];
 if(status==='full')notes.push('Intervalul cerut este acoperit integral de feliile anuale validate ale corpusului.');
 if(status==='partial')notes.push(inconclusiveYears.length?'Intervalul cerut depășește fereastra comisă sau atinge felii inconcludente ('+inconclusiveYears.join(', ')+'); intervalul efectiv se declară explicit.':'Intervalul cerut depășește fereastra comisă; intervalul efectiv se declară explicit.');
 if(status==='outside')notes.push('Intervalul cerut nu este acoperit de corpusul verificat — fără afirmație despre evenimentele reale din acea perioadă.');
 if(status==='inconclusive')notes.push('Feliile atinse au răspuns 204 la sursă (inconcludent la verificare) — nu se afirmă absența cutremurelor.');
 if(query.minMagnitude!==undefined&&query.minMagnitude<payload.window.minMagnitude)notes.push('Corpusul acoperă magnitudini ≥ '+payload.window.minMagnitude+' (pragul sursei la import); magnitudinile sub prag nu se pretind acoperite.');
 return {status,requested:{from:reqFrom,to:reqTo},effective:outside?null:{from:reqFrom<windowFrom?windowFrom:reqFrom,to:reqTo>windowTo?windowTo:reqTo},inconclusiveYears,note:notes.join(' '),...(outside?{outsideCoverage:true}:{})};
}

export async function readEida(query:EidaQuery,base:string){
  const payload=await readEidaCorpus(base);
  const term=normalizeSearch(query.q||'');
  if(query.kind==='stations'){
   const filtered=payload.stations.filter(station=>!term||normalizeSearch(station.siteName+' '+station.station+' '+station.network).includes(term));
   const page=paginate(filtered,query.page,20);
   return {sourceUrl:payload.sourceUrl,window:payload.window,fetchedAt:payload.fetchedAt,license:payload.license,licenseNote:payload.licenseNote,
    profile:{note:'Înregistrări de stații și perioade ale rețelei RO — nu stații neapărat active în prezent.'},
    filters:{kind:'stations',q:query.q||'',applied:!!term},...page,items:page.items};
  }
  // Filtrele de timp se compară pe prefixul cerut (an, lună sau zi ISO), inclusiv
  // la marginea de sus — o zi „to" acoperă evenimentele zilei, nu doar miezul nopții.
  const filtered=payload.events.filter(event=>{
   if(query.from&&event.time.slice(0,query.from.length)<query.from)return false;
   if(query.to&&event.time.slice(0,query.to.length)>query.to)return false;
   if(query.minMagnitude&&Number(event.magnitude)<query.minMagnitude)return false;
   if(term&&!normalizeSearch(event.eventLocationName+' '+event.eventType+' '+event.magnitudeAuthor+' '+event.magnitude+' '+event.time.slice(0,10)).includes(term))return false;
   return true;
  }).sort((a,b)=>b.time.localeCompare(a.time));
  const page=paginate(filtered,query.page,20);
  const coverage=coverageFor(payload,query);
  return {sourceUrl:payload.sourceUrl,window:payload.window,bboxNote:payload.bboxNote,truncatedYears:payload.truncatedYears,coverage,
   available:{from:payload.window.from,to:payload.window.to,minMagnitude:payload.window.minMagnitude},
   fetchedAt:payload.fetchedAt,license:payload.license,licenseNote:payload.licenseNote,
   profile:{minMagnitudeBaza:payload.window.minMagnitude,note:'Istoric și infrastructură — nu avertizare de cutremur în timp real; 204 pe ferestre recente a fost inconcludent la audit.'},
   filters:{kind:'events',from:query.from||'',to:query.to||'',minMagnitude:query.minMagnitude??payload.window.minMagnitude,applied:!!(query.from||query.to||term)},
   countsByYear:payload.counts.eventsByYear,
   ...page,items:page.items};
}
