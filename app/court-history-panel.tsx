'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {courtHistoryText,type CourtHistory} from '@/lib/court-history';
import {dateText} from './live-data';
import {ExportActions} from './export-actions';

export function CourtHistoryPanel({history,onOpenRecord,onSearchNumber}:{history:CourtHistory;onOpenRecord:(id:string)=>void;onSearchNumber:(number:string)=>void}){
 const [evidenceOpen,setEvidenceOpen]=useState<string[]>([]);
 return <section className="court-history-panel" aria-label={'Etapele dosarului '+history.number}>
  <h3>Parcursul dosarului {history.number}</h3>
  <div className="court-history-stages">{history.stages.map(stage=><article className="court-stage" key={stage.id}>
   <h4>{stage.label}</h4><p>{stage.courtLabel}</p>
   <p className="court-stage-status">{stage.availability==='record'?stage.recordIds.length+' fișe disponibile · '+stage.hearingCount+' ședințe publicate':'Confirmat prin trimitere oficială'}</p>
   {stage.availability==='reference'&&<p className="field-help">Fișa și ședințele de la această etapă nu sunt disponibile în răspunsul portalului.</p>}
   {stage.evidence.map(reference=><p key={reference.id}>{reference.document} {reference.documentNumber} · {dateText(reference.documentDate)}</p>)}
   <div className="court-stage-actions">{stage.recordIds.map((id,index)=><Button key={id} variant="outline" onClick={()=>onOpenRecord(id)}>Vezi fișa de {stage.label.toLowerCase()}{stage.recordIds.length>1?' ('+(index+1)+')':''}</Button>)}
    {!!stage.evidence.length&&<Button variant="outline" aria-expanded={evidenceOpen.includes(stage.id)} onClick={()=>setEvidenceOpen(ids=>ids.includes(stage.id)?ids.filter(id=>id!==stage.id):[...ids,stage.id])}>{evidenceOpen.includes(stage.id)?'Ascunde confirmarea':'Vezi confirmarea'}</Button>}
   </div>
   {evidenceOpen.includes(stage.id)&&<div className="court-stage-evidence">{stage.evidence.map(reference=><div key={reference.id}>
    <p>Soluția din {dateText(reference.source.hearingDate)}, dosarul <strong>{reference.source.number}</strong>, {reference.source.courtLabel}, indică {reference.document.toLowerCase()} {reference.documentNumber} din {dateText(reference.documentDate)} în dosarul {reference.number}.</p>
    <p className="field-help">Confirmare verificată: {dateText(reference.verifiedAt)}. Ședința sursei aparține dosarului {reference.source.number}.</p>
    <div className="court-stage-actions"><Button variant="outline" onClick={()=>onSearchNumber(reference.source.number)}>Deschide dosarul sursei {reference.source.number}</Button><a className="text-link" href={reference.source.url} target="_blank" rel="noreferrer">Portalul oficial al instanțelor</a></div>
   </div>)}</div>}
  </article>)}</div>
  {!!history.relatedCases.length&&<div className="court-related-cases"><p>Hotărâri din alte dosare menționate în soluții:</p>{[...new Map(history.relatedCases.map(r=>[r.number,r])).values()].map(reference=><Button key={reference.number} variant="outline" onClick={()=>onSearchNumber(reference.number)}>Dosar {reference.number} · {reference.courtLabel}</Button>)}</div>}
  <p className="field-help">Sunt legate etapele confirmate de datele oficiale. Istoricul complet și existența altor etape nu sunt garantate de sursă.</p>
  <ExportActions input={{title:'Etapele dosarului '+history.number,text:courtHistoryText(history),data:history}} formats={['pdf','csv','xlsx']} label="Descarcă etapele și confirmările"/>
 </section>;
}
