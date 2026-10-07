import {createHash} from 'node:crypto';
import {getSource,SourceError} from './adapters';
import {xmlText} from './feeds';
import {uniqueRecords} from './records';
import type {Loader,Loaded,SourceState} from './types';
import {env} from 'cloudflare:workers';
import {resolveLawSelection} from './legal-selection';
import {consolidateLaw,legalToday,officialLawUrl,verifiedConsolidation} from './legal-consolidation';
import {portalPage} from './legal-portal';
import {rememberLaw} from './legal-registry';
import courtInstitutions from '@/public/courts/institutions.json';
import {xmlChildren,xmlChild} from './source-xml';
import type {CourtQuery} from '../court-query';
import {rememberCourtReferences} from './court-references';
import {upstreamDiacriticLoss,DIACRITIC_LOSS_NOTE} from '../court-history';
export type {CourtQuery} from '../court-query';

// Both public WSDL contracts advertise HTTP. These are server-side, read-only
// public-data requests; browser navigation and all Aflivra APIs stay HTTPS.
const LAW_ENDPOINT='http://legislatie.just.ro/apiws/FreeWebService.svc/SOAP';
// The Ministry's documentation advertises this public HTTP SOAP endpoint.
// It carries a public case number only; no account credentials or private case documents.
const COURT_ENDPOINT='http://portalquery.just.ro/Query.asmx';
export const LAW_PAGE_SIZE=10;
export const codeTopics=[
 {label:'Codul civil',title:'CODUL CIVIL din 17 iulie 2009'},
 {label:'Codul penal',title:'CODUL PENAL din 17 iulie 2009'},
 {label:'Codul fiscal',title:'CODUL FISCAL din 8 septembrie 2015'},
 {label:'Codul de procedură civilă',title:'CODUL DE PROCEDURĂ CIVILĂ din 1 iulie 2010'},
 {label:'Codul de procedură penală',title:'CODUL DE PROCEDURĂ PENALĂ din 1 iulie 2010'},
 {label:'Codul muncii',title:'Codul muncii'},
];
export const escapeXml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
function field(raw:string,name:string){return raw.match(new RegExp('<(?:[\\w.-]+:)?'+name+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?'+name+'>','i'))?.[1]||''}
function blocks(raw:string,name:string){return [...raw.matchAll(new RegExp('<(?:[\\w.-]+:)?'+name+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?'+name+'>','gi'))].map(m=>m[1])}
function validateSoap(raw:string,result:string){if(/<!DOCTYPE|<!ENTITY/i.test(raw)||!/<(?:[\w.-]+:)?Envelope\b/i.test(raw))throw new SourceError('Structura serviciului juridic este incompatibilă.');if(/<(?:[\w.-]+:)?Fault\b/i.test(raw))throw new SourceError('Serviciul juridic a respins interogarea. Reîncercăm mai târziu.');if(!new RegExp('<(?:[\\w.-]+:)?'+result+'\\b','i').test(raw))throw new SourceError('Răspunsul nu conține rezultatul oficial al interogării.');}
function lawUrl(raw:string){try{const u=new URL(xmlText(raw));if(u.hostname==='legislatie.just.ro'&&/^\/Public\/(DetaliiDocument(?:Afis)?\/\d+|FormaPrintabila\/[^/]+)$/.test(u.pathname)){u.protocol='https:';return u.href}}catch{}return null}
export function parseLawSearch(raw:string,full=false,selectedId=''):Loaded{
 validateSoap(raw,'SearchResult');
 const rows=blocks(raw,'Legi').map(x=>{const title=xmlText(field(x,'Titlu'));const number=xmlText(field(x,'Numar'));const date=xmlText(field(x,'DataVigoare'));const type=xmlText(field(x,'TipAct'));if(!title||!type)throw new SourceError('Un act nu are identificatori suficienți.');const text=full?xmlText(xmlText(field(x,'Text'))):undefined;const sourceUrl=lawUrl(field(x,'LinkHtml')||field(x,'Url')||field(x,'Link'));return{id:sourceUrl||'law-'+createHash('sha256').update([type,number,date,title].join('|')).digest('hex'),title,number,date,type,issuer:xmlText(field(x,'Emitent')),publication:xmlText(field(x,'Publicatie')),sourceUrl,...(full?{text,textProvided:!!text}:{}),year:date.match(/^\d{4}/)?.[0]||title.match(/\b(?:19|20)\d{2}\b/)?.[0]||''}});
 const items=uniqueRecords(rows,r=>r.id).filter(r=>!selectedId||r.id===selectedId);
 return{publishedAt:null,data:{items,hasMore:rows.length>=LAW_PAGE_SIZE}};
}
export type LawQuery={title:string;text:string;number:string;year:string;page:number;full?:boolean;selectedId?:string;exactTitle?:string;selectedType?:string;selectedNumber?:string;selectedDate?:string;pageSize?:number};
// BasicHttpBinding uses the HTTP SOAPAction. The mustUnderstand WS-Addressing
// header from the old HTML guide is rejected with HTTP 400 by the live service.
export const soapEnvelope=(body:string)=>'<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><s:Body>'+body+'</s:Body></s:Envelope>';
async function soap(url:string,action:string,body:string){return getSource(url,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'"'+action+'"'},body:soapEnvelope(body)},{maxBytes:25_000_000,timeoutMs:25000})}
export function lawRequest(query:LawQuery,token:string){const optional=(name:string,value:string)=>value?'<a:'+name+'>'+escapeXml(value)+'</a:'+name+'>':'<a:'+name+' i:nil="true"/>';return '<Search xmlns="http://tempuri.org/"><SearchModel xmlns:a="http://schemas.datacontract.org/2004/07/FreeWebService" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><a:NumarPagina>'+query.page+'</a:NumarPagina><a:RezultatePagina>'+(query.pageSize||LAW_PAGE_SIZE)+'</a:RezultatePagina>'+optional('SearchAn',query.year)+optional('SearchNumar',query.number)+optional('SearchText',query.text)+optional('SearchTitlu',query.title)+'</SearchModel><tokenKey>'+escapeXml(token)+'</tokenKey></Search>'}
export const validCourtInstitution=(id:string)=>!id||courtInstitutions.items.some(c=>c.id===id);
export type CourtOperation='CautareDosare'|'CautareDosare2';
export function courtRequest(value:string|CourtQuery,operation:CourtOperation='CautareDosare'){const q=typeof value==='string'?{number:value,name:'',subject:'',institution:'',from:'',to:''}:value;const optional=(name:string,value:string)=>value?'<'+name+'>'+escapeXml(value)+'</'+name+'>':'<'+name+' i:nil="true"/>';return '<'+operation+' xmlns="portalquery.just.ro">'+optional('numarDosar',q.number)+optional('obiectDosar',q.subject)+optional('numeParte',q.name)+optional('institutie',q.institution)+optional('dataStart',q.from?q.from+'T00:00:00':'')+optional('dataStop',q.to?q.to+'T23:59:59':'')+(operation==='CautareDosare2'?optional('dataUltimaModificareStart','')+optional('dataUltimaModificareStop',''):'')+'</'+operation+'>'}
export function relatedCodeTitle(act:any){if(!/^LEGE/i.test(act.type)||String(act.text||'').length>1000)return null;const text=String(act.text||'');if(/COD FISCAL\s+08\/09\/2015/i.test(text))return codeTopics[2].title;if(/COD PR CIVIL[AĂ]\s*(?:\(R\))?\s+01\/07\/2010/i.test(text))return codeTopics[3].title;return null}
async function storeLawText(loaded:Loaded){if(!env.DB)return loaded;for(const act of loaded.data.items){if(new TextEncoder().encode(JSON.stringify(act)).length<1_750_000)continue;const text=String(act.text||''),version='consolidated.v1:'+createHash('sha256').update(String(act.id)+'|'+text).digest('hex'),keys:string[]=[];try{for(let at=0;at<text.length;at+=200000){const key='law-text:'+version+':'+at;await env.DB.prepare('INSERT INTO source_cache (key,data,last_success_at,adapter_version) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,last_success_at=excluded.last_success_at').bind(key,JSON.stringify(text.slice(at,at+200000)),new Date().toISOString(),'law.text.v2').run();keys.push(key)}act.textChunks=keys;act.textSha256=createHash('sha256').update(text).digest('hex');act.textCharacters=text.length;act.text=undefined}catch(e){throw e}}return loaded}
export async function expandLawText(source:any){const db=env.DB;if(!db)return source;if(!source.data?.items)return source;const items=[];for(const record of source.data.items){const act={...record};if(act.textChunks){const parts=[];for(const key of act.textChunks){const part=await db.prepare('SELECT data FROM source_cache WHERE key=?').bind(key).first<{data:string}>();if(!part?.data)throw new SourceError('Legea nu a fost primită integral. Reîncearcă preluarea.');parts.push(JSON.parse(part.data))}act.text=parts.join('');if(act.text.length!==act.textCharacters||createHash('sha256').update(act.text).digest('hex')!==act.textSha256)throw new SourceError('Textul integral nu corespunde copiei verificate.');act.textChunks=undefined}items.push(act)}return{...source,data:{...source.data,items}}}
const lawRecordKey=(id:string)=>'law-record:consolidated.v2:'+createHash('sha256').update(id).digest('hex');
async function saveLawRecords(loaded:Loaded){if(!env.DB)return;const stored=await storeLawText(loaded),checked=new Date().toISOString();for(const act of stored.data.items){if(!verifiedConsolidation(act))continue;await env.DB.prepare('INSERT INTO source_cache (key,data,last_success_at,expires_at,adapter_version) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,last_success_at=excluded.last_success_at,expires_at=excluded.expires_at,adapter_version=excluded.adapter_version').bind(lawRecordKey(act.id),JSON.stringify(act),checked,Date.now()+3600000,'law.consolidated-record.v2').run();await rememberLaw(act)}
 // Last verified records and their text chunks survive outages and day changes.
 // An old chunk is never removed merely because another act refreshed today.
}
export async function storedLawRecord(id:string):Promise<SourceState|null>{if(!id||!env.DB)return null;const columns='data,last_success_at,expires_at,adapter_version';let row=await env.DB.prepare('SELECT '+columns+' FROM source_cache WHERE key=?').bind(lawRecordKey(id)).first<{data:string;last_success_at:string;expires_at:number;adapter_version:string}>();
 // Migrate only verified consolidation records, never original SOAP records.
 if(!row)row=await env.DB.prepare('SELECT '+columns+" FROM source_cache WHERE key>=? AND key<? AND json_extract(data,'$.id')=? ORDER BY last_success_at DESC LIMIT 1").bind('law-record:consolidated.v1:','law-record:consolidated.v2:',id).first();
 if(!row?.data||!['law.consolidated-record.v1','law.consolidated-record.v2'].includes(row.adapter_version))return null;let act:any;try{act=JSON.parse(row.data)}catch{return null}if(act.id!==id||!verifiedConsolidation(act)||act.consolidation.asOf>legalToday())return null;return{key:lawRecordKey(id),name:'Portal Legislativ · forme consolidate',url:'https://legislatie.just.ro/',adapterVersion:'law.consolidated-record.v2',status:Date.now()<row.expires_at&&act.consolidation.asOf===legalToday()?'cached':'stale',data:{items:[act],hasMore:false},publishedAt:act.consolidation.versionDate,lastSuccessAt:row.last_success_at,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:3600}}
async function currentLaw(act:any){try{const current=await consolidateLaw(act,portalPage);if(current._relatedCodes.length>1)throw Error('Documentele codului anexat nu au putut fi identificate fără echivoc.');if(current._relatedCodes.length===1){const ref=current._relatedCodes[0],code=await consolidateLaw({...ref,date:ref.title.includes('08/09/2015')?'2015-09-08':'2010-07-01'},portalPage,current.consolidation.asOf);current.relatedDocuments=[{id:code.id,title:code.title,sourceUrl:code.sourceUrl,consolidation:code.consolidation}];current.text+='\n\n'+code.text;current.textCombined=true}delete current._relatedCodes;return current}catch(e){throw new SourceError(e instanceof SourceError?e.message:'Forma actuală a actului nu a putut fi verificată. '+(e instanceof Error?e.message:'Portalul este temporar indisponibil.'),e instanceof SourceError?e.retryAfter:0,e instanceof SourceError?e.diagnostic:undefined)}}
export function lawLoader(query:LawQuery):Loader{return{key:'law:'+(query.full?'consolidated.v2:':'search.v5:')+(query.full&&officialLawUrl(query.selectedId||'')?createHash('sha256').update(officialLawUrl(query.selectedId||'')!).digest('hex'):JSON.stringify(query)),name:'Portal Legislativ · Ministerul Justiției',url:'https://legislatie.just.ro/',version:query.full?'legislation.consolidated.v2':'legislation.search.v5',ttl:3600,load:async()=>{
 // Opening a selected official document skips SOAP: its original text cannot
 // establish a current consolidation, even when it was retrieved moments ago.
 if(query.full&&officialLawUrl(query.selectedId||'')){const act=await currentLaw({id:query.selectedId,sourceUrl:query.selectedId,title:query.exactTitle,type:query.selectedType,number:query.selectedNumber,date:query.selectedDate});const loaded={publishedAt:act.consolidation.versionDate,data:{items:[act],hasMore:false,pageSize:1}};await saveLawRecords(loaded);return loaded}
 const tokenRaw=await soap(LAW_ENDPOINT,'http://tempuri.org/IFreeWebService/GetToken','<GetToken xmlns="http://tempuri.org/"/>');validateSoap(tokenRaw,'GetTokenResult');const token=xmlText(field(tokenRaw,'GetTokenResult'));if(!token||token.length>1024)throw new SourceError('Serviciul legislativ nu a furnizat un token valid.');
 const pageSize=query.full?2:LAW_PAGE_SIZE;const effective={...query,pageSize};const raw=await soap(LAW_ENDPOINT,'http://tempuri.org/IFreeWebService/Search',lawRequest(effective,token)),all=parseLawSearch(raw),loaded=parseLawSearch(raw);if(query.full&&(query.selectedId||query.exactTitle)){const chosen=resolveLawSelection(all.data.items,{id:query.selectedId,title:query.exactTitle,type:query.selectedType,number:query.selectedNumber,date:query.selectedDate});loaded.data.items=chosen?[chosen]:[]}
 loaded.data.hasMore=all.data.items.length>=pageSize;loaded.data.pageSize=pageSize;
 if(query.full){loaded.data.items=await Promise.all(loaded.data.items.map(currentLaw));loaded.publishedAt=loaded.data.items[0]?.consolidation.versionDate||null;await saveLawRecords(loaded);return loaded}return loaded;
}}}

export function parseCourtSearch(raw:string,operation:CourtOperation='CautareDosare'):Loaded{
 if(/<!DOCTYPE|<!ENTITY/i.test(raw)||!/<(?:[\w.-]+:)?Envelope\b/i.test(raw))throw new SourceError('Structura serviciului juridic este incompatibilă.');
 if(/<(?:[\w.-]+:)?Fault\b/i.test(raw))throw new SourceError('Serviciul juridic a respins interogarea. Reîncercăm mai târziu.');
 const envelope=xmlChildren(raw).find(e=>e.name==='Envelope');
 const body=xmlChildren(xmlChild(xmlChildren(envelope?.body||''),'Body'));
 // Read both the real response wrapper and old verified fragments used by imports.
 const response=body.find(e=>e.name===operation+'Response'),results=response?xmlChildren(response.body):body;
 // The official WSDL declares Result with minOccurs=0. An empty, valid
 // Response is a zero-record result; missing/wrong wrappers are not.
 const result=results.find(e=>e.name===operation+'Result');if(!result&&(!response||results.length))throw new SourceError('Răspunsul nu conține rezultatul oficial al interogării.');
 const records=xmlChildren(result?.body||'').filter(e=>e.name==='Dosar'&&e.body.trim());
 const rows=records.map(record=>{
  const fields=xmlChildren(record.body),value=(name:string)=>xmlText(xmlChild(fields,name));
  const number=value('numar'),court=value('institutie');if(!number||!court)throw new SourceError('Un dosar nu are număr sau instanță.');
  const children=(name:string,entry:string)=>xmlChildren(xmlChild(fields,name)).filter(e=>e.name===entry&&e.body.trim()).map(e=>xmlChildren(e.body));
  const item={number,oldNumber:value('numarVechi'),court,courtLabel:courtInstitutions.items.find(c=>c.id===court)?.label||court,department:value('departament'),date:value('data'),modified:value('dataModificare'),subject:value('obiect'),category:value('categorieCazNume')||value('categorieCaz'),stage:value('stadiuProcesualNume')||value('stadiuProcesual'),
   parties:children('parti','DosarParte').map(p=>({name:xmlText(xmlChild(p,'nume')),role:xmlText(xmlChild(p,'calitateParte'))})),
   hearings:children('sedinte','DosarSedinta').map(h=>({date:xmlText(xmlChild(h,'data')),time:xmlText(xmlChild(h,'ora')),panel:xmlText(xmlChild(h,'complet')),result:xmlText(xmlChild(h,'solutie')),summary:xmlText(xmlChild(h,'solutieSumar')),pronouncementDate:xmlText(xmlChild(h,'dataPronuntare')),document:xmlText(xmlChild(h,'documentSedinta')),documentNumber:xmlText(xmlChild(h,'numarDocument')),documentDate:xmlText(xmlChild(h,'dataDocument'))})),
   appeals:children('caiAtac','DosarCaleAtac').map(a=>({date:xmlText(xmlChild(a,'dataDeclarare')),party:xmlText(xmlChild(a,'parteDeclaratoare')),type:xmlText(xmlChild(a,'tipCaleAtac'))}))};
  // The SOAP contract has no stable record ID. Number + court can identify
  // multiple proceedings; only identical complete records may be removed.
  return{id:number+'|'+court+'|'+createHash('sha256').update(JSON.stringify(item)).digest('hex'),...item};
 });
 const items=uniqueRecords(rows,r=>r.id);
 const diacriticsLost=upstreamDiacriticLoss(JSON.stringify(items));
 return{publishedAt:items.map(x=>x.modified).filter(Boolean).sort().at(-1)||null,data:{items,returnedRecords:records.length,hearingCount:items.reduce((total,item)=>total+item.hearings.length,0),sourceLimit:1000,limitReached:records.length>=1000,historyComplete:false,capabilities:{partyNames:true,hearingSummary:true,judgmentText:false,lawyerField:false},note:'Sunt afișate toate fișele și ședințele din răspunsul primit. Serviciul public nu garantează istoricul complet al dosarului: înregistrările din arhiva pasivă și cele confidențiale pot lipsi. Fișele de la fond, apel sau recurs sunt păstrate separat. Textul integral al hotărârii și un câmp distinct pentru avocat nu sunt incluse.'+(diacriticsLost?' '+DIACRITIC_LOSS_NOTE:'')}};
}
export async function loadCourtSearch(query:CourtQuery):Promise<Loaded>{
 const deadline=Date.now()+25000,loaded:Loaded[]=[],checks:{operation:CourtOperation;status:'ok'|'failed';records?:number;hearings?:number}[]=[],warnings:string[]=[];
 // An exact number is checked with both documented operations, serially.
 // Empty / hearing-less or invalid 200 responses receive a third verification.
 // getSource already makes at most three HTTP 5xx attempts; never wrap that
 // exhaustion in another retry loop, and never ignore an upstream 429 pause.
 const operations:CourtOperation[]=query.number?['CautareDosare','CautareDosare2','CautareDosare']:['CautareDosare'];
 let failure:unknown;
 for(const operation of operations){
  if(Date.now()>=deadline){warnings.push('Timpul alocat verificărilor suplimentare a expirat.');break}
  if(checks.length===2&&loaded.some(result=>result.data.hearingCount>0)&&checks.every(check=>check.status==='ok'))break;
  try{
   const raw=await getSource(COURT_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'"portalquery.just.ro/'+operation+'"'},body:soapEnvelope(courtRequest(query,operation))},{maxBytes:25_000_000,timeoutMs:Math.max(1,deadline-Date.now())});
   const result=parseCourtSearch(raw,operation);loaded.push(result);checks.push({operation,status:'ok',records:result.data.returnedRecords,hearings:result.data.hearingCount});
  }catch(error){
   failure=error;checks.push({operation,status:'failed'});
   const message=error instanceof SourceError?error.message:'Răspunsul oficial nu a putut fi citit integral.';warnings.push(message);
   if(error instanceof SourceError&&(error.diagnostic||error.retryAfter>0))break;
  }
 }
 if(!loaded.length)throw failure instanceof SourceError?failure:new SourceError(warnings.at(-1)||'Dosarul nu a putut fi verificat.');
 const items=uniqueRecords(loaded.flatMap(result=>result.data.items),item=>item.id),hearingCount=items.reduce((total,item)=>total+item.hearings.length,0);
 try{await rememberCourtReferences(items,new Date().toISOString())}catch{console.warn(JSON.stringify({event:'court_reference_index_write_failure'}))}
 const completed=query.number?checks.some(check=>check.operation==='CautareDosare'&&check.status==='ok')&&checks.some(check=>check.operation==='CautareDosare2'&&check.status==='ok'):checks[0]?.status==='ok';
 const warning=!completed?'Verificarea aprofundată nu a putut fi încheiată. '+(warnings.at(-1)||''):query.number&&!items.length?'Numărul nu a fost găsit în verificările oficiale. Un răspuns gol nu confirmă absența unui dosar din arhiva instanței.':'';
 return{publishedAt:items.map(item=>item.modified).filter(Boolean).sort().at(-1)||null,...(warning?{warning,retryAfterSeconds:failure instanceof SourceError?failure.retryAfter:60}:{}),data:{...loaded[0].data,items,hearingCount,returnedRecords:loaded.reduce((total,result)=>total+result.data.returnedRecords,0),limitReached:loaded.some(result=>result.data.limitReached),deepSearch:{enabled:!!query.number,completed,checks,warnings},note:(query.number?'Căutarea aprofundată reunește fișele din verificările oficiale succesive. ':'')+loaded[0].data.note+(warnings.length?' Verificări suplimentare: '+[...new Set(warnings)].join(' '):'')}};
}
// Positive v5 records already have complete fields. Reuse their storage key
// so an outage during the adapter upgrade cannot discard that valid copy.
export const courtLoader=(value:string|CourtQuery):Loader=>{const query=typeof value==='string'?{number:value,name:'',subject:'',institution:'',from:'',to:''}:value;return {key:'court:records.v5:'+createHash('sha256').update(JSON.stringify(query)).digest('hex'),name:'Portalul instanțelor · date publice',url:'https://portal.just.ro/SitePages/dosare.aspx',version:'portal.deep-records.v6',ttl:query.number?300:3600,load:()=>loadCourtSearch(query)}};
