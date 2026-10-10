import {getSource,SourceError} from './adapters';
import type {Loader} from './types';
import {normalizeSearch} from './query';

/*
 INS TEMPO — seriile statistice officiale ale Institutului Național de Statistică,
 pe matricea POP105A (populația rezidentă la 1 ianuarie, pe județe și teritorii).
 Metadatele matricei se citesc întâi (dimensiunile și id-urile de selecție se
 derivă din ele — anii nomItemId îmbătrânesc și nu se hardcodează niciodată),
 apoi interogarea de date se face cu payload-ul `arr` construit din aceleași
 metadate, cu etichetele reproduse exact cum le servește sursa — inclusiv
 spațiile finale („Total "). Statutul valorilor (revizuit/provizoriu/semidefinitiv)
 marcă tipografic în HTML-ul răspunsului, după legenda oficială a sursei:
 ingroșat = revizuit, subliniat = provizoriu, ambele = semidefinitiv — servim
 statutul per valoare; „:" (lipsă) și „c" (confidențial) rămân valori goale
 marcate, nu zero. Selecția v1 rămâne la total vârste/sexe/medii și ultimii trei
 ani publicate, sub limitele oficiale — 30.000 combinații / 500 selecții.
*/

const TEMPO_BASE='http://statistici.insse.ro:8077/tempo-ins';
const MATRIX='POP105A';
export const INS_MATRICES=[MATRIX];

export type TempoOption={label:string;nomItemId:number;offset:number;parentId:number|null};
export type TempoDimension={dimCode:number;label:string;options:TempoOption[]};
export type TempoMeta={matrixName:string;ultimaActualizare:string|null;dimensionsMap:TempoDimension[];unitateMasura:string|null;periodicitate:string|null;definitie:string|null;intrerupere:string|null;continuareSerie:string|null;details:Record<string,number>};

const parseMeta=(raw:unknown):TempoMeta=>{
 if(!raw||typeof raw!=='object')throw new SourceError('Metadatele matricei TEMPO nu au putut fi citite.');
 const meta=raw as Record<string,unknown>;
 const dimensionsMap=meta['dimensionsMap'];
 if(!Array.isArray(dimensionsMap)||!dimensionsMap.length)throw new SourceError('Metadatele matricei TEMPO nu expună dimensiunile.');
 const dims=dimensionsMap as TempoDimension[];
 const periodicitati=meta['periodicitati'];
 return {matrixName:String(meta['matrixName']??''),ultimaActualizare:meta['ultimaActualizare']!=null?String(meta['ultimaActualizare']):null,dimensionsMap:dims,unitateMasura:dims.find(dimension=>dimension.label.startsWith('UM:'))?.options[0]?.label.trim()||null,periodicitate:Array.isArray(periodicitati)&&periodicitati.length?String(periodicitati[0]):null,definitie:meta['definitie']!=null?String(meta['definitie']):null,intrerupere:meta['intrerupere']!=null?String(meta['intrerupere']):null,continuareSerie:meta['continuareSerie']!=null?String(meta['continuareSerie']):null,details:(meta['details'] as Record<string,number>)||{}};
};

export const tempoMetaLoader:Loader<TempoMeta>={key:'ins:matrix:'+MATRIX,name:'INS TEMPO · matricea '+MATRIX,url:TEMPO_BASE+'/matrix/'+MATRIX,version:'ins.tempo-meta.v1',ttl:86400,load:async()=>({data:parseMeta(JSON.parse(await getSource(TEMPO_BASE+'/matrix/'+MATRIX))),publishedAt:null})};

const foldTempo=(value:unknown)=>normalizeSearch(String(value??'')).replace(/[^a-z0-9 z]/g,' ').replace(/\s+/g,' ').trim();

export function tempoTerritory(dimensions:TempoDimension[],territory:string){
 const dim=dimensions.find(dimension=>/jude/i.test(dimension.label));
 if(!dim)return null;
 const wanted=foldTempo(territory);
 return dim.options.find(option=>{const label=foldTempo(option.label);return label===wanted||label.replace(/^municipiul /,'')===wanted})||null;
}

export function tempoRecentYears(dimensions:TempoDimension[],count=3){
 const dim=dimensions.find(dimension=>/^ani$/i.test(foldTempo(dimension.label)));
 if(!dim)return [];
 return dim.options.filter(option=>/^\s*Anul \d{4}\s*$/.test(option.label)).slice(-count);
}

// Alege varianta „Total" a unei dimensiuni de descompunere (vârste/sexe/medii):
// prima opțiune a dimensiunii, cu eticheta reprodusă exact.
const totalTime=(dimensions:TempoDimension[],code:number)=>dimensions.find(dimension=>dimension.dimCode===code)?.options[0]||null;

export type TempoValue={year:string;value:number|null;dataStatus:'definitiv'|'revizuit'|'provizoriu'|'semidefinitiv'|'lipsa'|'confidential'};
export type TempoSeries={matrix:string;territory:string;territoryLabel:string;reference:string;unit:string;values:TempoValue[];ultimaActualizare:string|null;selectionNote:string;statusNote:string;limitsNote:string};

const parseResultTable=(html:string,years:string[],territoryLabel:string):TempoValue[]=>{
 // Tabelul HTML numește coloanele anilor în antet; rândul teritoriului căutat
 // poartă valorile cu marcajele tipografice de statut ale legendei oficiale.
 const rows=[...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match=>match[1]);
 const row=rows.find(body=>body.includes('>'+territoryLabel));
 if(!row)throw new SourceError('Răspunsul TEMPO nu conține rândul teritoriului cerut.');
  // Sursa închide celulele cu atribute: „</td align='right'>” — tag-ul de închidere
 // trebuie să admită atribute, nu doar „</td>” exact.
 const cells=[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td[^>]*>/g)].map(match=>match[1]);
 return cells.map((cell,index)=>{
  const text=cell.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
  const status=text===':'?'lipsa':text==='c'?'confidential':/<strong>\s*<u>/.test(cell)||/<u>\s*<strong>/.test(cell)?'semidefinitiv':/<strong>/.test(cell)?'revizuit':/<u>/.test(cell)?'provizoriu':'definitiv';
  const value=text===':'||text==='c'?null:Number(text.replace(/\s/g,'').replace(',','.'));
  return {year:years[index]??String(index),value:Number.isFinite(value as number)?value:null,dataStatus:status} as TempoValue;
 });
};

export const insSeriesLoader=(meta:TempoMeta,territory:TempoOption,years:TempoOption[]):Loader<TempoSeries>=>{
 const territoryDim=meta.dimensionsMap.find(dimension=>/jude/i.test(dimension.label));
 const totals=[totalTime(meta.dimensionsMap,1),totalTime(meta.dimensionsMap,2),totalTime(meta.dimensionsMap,3)];
 const unit=meta.dimensionsMap.find(dimension=>dimension.label.startsWith('UM:'))?.options[0]||{label:'',nomItemId:0,offset:1,parentId:null};
 if(totals.some(option=>!option)||!territoryDim||!years.length||!unit)throw new SourceError('Matricea TEMPO nu expune selecțiile cerute.');
 const arr=[[totals[0]],[totals[1]],[totals[2]],[territory],years,[unit]];
 return {key:'ins:'+MATRIX+':'+foldTempo(territory.label),name:'INS TEMPO · '+meta.matrixName.slice(0,80),url:TEMPO_BASE+'/matrix/'+MATRIX,version:'ins.tempo-pop105a.v1',ttl:86400,load:async()=>{
  const response=await fetch(TEMPO_BASE+'/matrix/'+MATRIX,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'ro',arr,matrixName:meta.matrixName,matrixDetails:meta.details})});
  if(!response.ok)throw new SourceError('Interogarea TEMPO a eșuat (HTTP '+response.status+').');
  const payload=await response.json() as {resultTable?:string};
  if(!payload.resultTable)throw new SourceError('Interogarea TEMPO nu a întors tabelul de rezultate.');
  const values=parseResultTable(payload.resultTable,years.map(option=>option.label.trim()),territory.label.trim());
  return {data:{
   matrix:MATRIX,territory:foldTempo(territory.label),territoryLabel:territory.label.trim(),reference:'1 ianuarie',unit:meta.unitateMasura||unit.label.trim(),
   values,ultimaActualizare:meta.ultimaActualizare,
   selectionNote:'Selecția v1: total vârste, sexe și medii de rezidență, teritoriul cerut, ultimii trei ani publicați — sub limita oficială de 30.000 combinații și 500 selecții pe dimensiune.',
   statusNote:'Statutul valorilor urmează legenda oficială a sursei: îngroșat = revizuit, subliniat = provizoriu, îngroșat+subliniat = semidefinitiv; „:" = date lipsă, „c" = confidențiale — servite goale marcate, niciodată zero.',
   limitsNote:'POP105A e matricea validată; alte matrici se validează separat înainte de expunere.',
  },publishedAt:null};
 }};
};
