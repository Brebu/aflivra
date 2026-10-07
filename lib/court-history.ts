import institutions from '@/public/courts/institutions.json';
import {normalizeCourtNumber} from './court-query';

export type CourtReference={
 id:string;number:string;stage:string;court:string;courtLabel:string;
 document:string;documentNumber:string;documentDate:string;verifiedAt:string;
 source:{number:string;court:string;courtLabel:string;hearingDate:string;url:string;recordId?:string;responseSha256?:string};
};
export type CourtStage={
 id:string;label:string;court:string;courtLabel:string;recordIds:string[];
 hearingCount:number;evidence:CourtReference[];availability:'record'|'reference';
};
export type CourtHistory={number:string;recordIds:string[];stages:CourtStage[];relatedCases:CourtReference[];historyComplete:false};
const validNumber=(value:string)=>/^\d{1,8}\/\d{1,5}\/\d{4}(?:\/[a-zA-Z0-9.]{1,20})?$/.test(value);
// The Ministry of Justice's own systems replaced ș/ț with «?» inside words
// before publication; a fișa reproduces the official text verbatim instead of
// inventing the missing letters, and the loss is disclosed where it appears.
export const upstreamDiacriticLoss=(text:string)=>/[a-zăâîșțşţA-ZĂÂÎȘȚŞŢ]\?[a-zăâîșțşţA-ZĂÂÎȘȚŞŢ]/i.test(text);
export const DIACRITIC_LOSS_NOTE='Textul oficial al sursei conține «?» în locul unor litere ș/ț pierdute în sistemul Ministerului Justiției înainte de publicare; fișa redă primit textul oficial, fără a completa caracterele lipsă.';
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const courtByLabel=new Map(institutions.items.map(c=>[normalized(c.label),c]));
const stageLabel=(stage:string)=>({fond:'Fond',apel:'Apel',recurs:'Recurs'}[normalized(stage)]||stage||'Stadiu neprecizat');
const stageRank=(stage:string)=>({Fond:0,Apel:1,Recurs:2}[stage]??3);
const referenceId=(r:Omit<CourtReference,'id'>)=>[r.number,r.court,r.stage,r.documentNumber,r.documentDate,r.source.number,r.source.court,r.source.hearingDate].join('|');
function calendarDate(value:string){const match=value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);if(!match)return '';const iso=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');return Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:''}

// Only an explicit judgment, court and target case number establish a link.
// A shared prefix, party name, appeal label or a bare number cannot establish a fond.
export function extractCourtReferences(items:any[],verifiedAt:string):CourtReference[]{
 const references:CourtReference[]=[];
 const pattern=/Sentin[tțţ]a\s+(?:(?:civil[ăa]|penal[ăa])\s+)?nr\.?\s*(\d{1,8}(?:\/[a-zA-Z0-9.-]{1,20}){1,3})\s+din\s+(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})\s+pronun[tțţ]at[ăa]\s+de\s+([^.;\n]{3,140}?)\s+[îi]n\s+dosarul\s+(?:nr\.?\s*)?(\d{1,8}\s*\/\s*\d{1,5}\s*\/\s*\d{4}(?:\/[a-zA-Z0-9.]{1,20})?)(?![\d/])/gi;
 for(const item of items){
  if(!validNumber(normalizeCourtNumber(String(item.number||''))))continue;
  for(const hearing of item.hearings||[]){
   for(const match of String(hearing.summary||'').matchAll(pattern)){
    const number=normalizeCourtNumber(match[4]),court=courtByLabel.get(normalized(match[3])),documentDate=calendarDate(match[2]);
    if(!validNumber(number)||!court||!documentDate)continue;
    const reference:Omit<CourtReference,'id'>={number,stage:'Fond',court:court.id,courtLabel:court.label,document:/^Sentin[tțţ]a\s+civil[ăa]/i.test(match[0])?'Sentință civilă':/^Sentin[tțţ]a\s+penal[ăa]/i.test(match[0])?'Sentință penală':'Sentință',documentNumber:match[1],documentDate,verifiedAt,source:{number:normalizeCourtNumber(item.number),court:item.court,courtLabel:item.courtLabel,hearingDate:hearing.date,url:'https://portal.just.ro/SitePages/dosare.aspx',recordId:item.id}};
    references.push({id:referenceId(reference),...reference});
   }
  }
 }
 return uniqueCourtReferences(references);
}
export function uniqueCourtReferences(references:CourtReference[]){const byId=new Map<string,CourtReference>();for(const r of references){if(!r?.id||!validNumber(r.number)||!validNumber(r.source?.number||'')||!r.court||!r.documentNumber||!r.documentDate||!r.verifiedAt)continue;const old=byId.get(r.id);if(!old||r.verifiedAt>old.verifiedAt)byId.set(r.id,r)}return [...byId.values()]}
export function buildCourtHistories(items:any[],references:CourtReference[]=[],requestedNumber=''):CourtHistory[]{
 const numbers=[...new Set([...items.map(item=>normalizeCourtNumber(String(item.number||''))).filter(validNumber),...(requestedNumber?[normalizeCourtNumber(requestedNumber)]:[])])];
 return numbers.map(number=>{
  const records=items.filter(item=>normalizeCourtNumber(String(item.number))===number),stages=new Map<string,CourtStage>();
  for(const record of records){const label=stageLabel(String(record.stage||'')),id=record.court+'|'+label,stage:CourtStage=stages.get(id)||{id,label,court:record.court,courtLabel:record.courtLabel||record.court,recordIds:[],hearingCount:0,evidence:[],availability:'record'};stage.recordIds.push(record.id);stage.hearingCount+=(record.hearings||[]).length;stages.set(id,stage)}
  for(const reference of uniqueCourtReferences(references).filter(r=>r.number===number)){
   const id=reference.court+'|'+reference.stage,stage:CourtStage=stages.get(id)||{id,label:reference.stage,court:reference.court,courtLabel:reference.courtLabel,recordIds:[],hearingCount:0,evidence:[],availability:'reference'};
   stage.evidence.push(reference);stages.set(id,stage);
  }
  return{number,recordIds:records.map(item=>item.id),stages:[...stages.values()].sort((a,b)=>stageRank(a.label)-stageRank(b.label)||a.courtLabel.localeCompare(b.courtLabel,'ro')),relatedCases:uniqueCourtReferences(references).filter(r=>r.source.number===number&&r.number!==number),historyComplete:false as const};
 }).filter(history=>history.recordIds.length||history.stages.length);
}
export function courtHistoryText(history:CourtHistory){return ['Dosar '+history.number,'ETAPE CONFIRMATE',...history.stages.map(stage=>[stage.label+' · '+stage.courtLabel,stage.availability==='record'?stage.recordIds.length+' fișe disponibile · '+stage.hearingCount+' ședințe publicate':'Etapă confirmată prin trimitere oficială. Fișa și ședințele acestei etape nu sunt disponibile.',...stage.evidence.map(r=>r.document+' '+r.documentNumber+' din '+r.documentDate+'; confirmată în dosarul '+r.source.number+' la '+r.source.courtLabel+', soluția din '+r.source.hearingDate+'; verificată la '+r.verifiedAt+'; '+r.source.url)].join('\n')),...history.relatedCases.map(r=>'Dosar menționat: '+r.number+' · '+r.document+' '+r.documentNumber+' · '+r.courtLabel),'Sursa fișelor: https://portal.just.ro/SitePages/dosare.aspx','Etapele și ședințele sunt păstrate separat. Istoricul complet nu este garantat de serviciul public.'].join('\n\n')}
