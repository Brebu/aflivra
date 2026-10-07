'use client';
import {useLocation} from './location';
import {GeographicScopeField,useGeographicScope,useLocationState} from './location-scope';
import {geographicParams} from '@/lib/geographic-scope';
import {SearchForm} from './search-form';
import {SelectField} from './select-field';
import {ContactsPanel} from './contacts-panel';
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useSource,Freshness} from './live-data';
import {Pagination} from './pagination';
import {ExportActions} from './export-actions';
import {countText} from '@/lib/live/query';
import {sourceText} from '@/lib/live/text';

const expertKinds=[{id:'experti-judiciari',label:'Experți judiciari'},{id:'experti-tehnici',label:'Experți tehnici'},{id:'traducatori',label:'Traducători și interpreți'}] as const;
type ExpertKind=typeof expertKinds[number]['id'];
const datasets:Record<ExpertKind,string>={'experti-judiciari':'https://data.gov.ro/dataset/476a8363-7c91-43e2-99d2-4fbe144c8e2a','experti-tehnici':'https://data.gov.ro/dataset/3f26ecb7-df7e-454e-a029-89dbd6d82c3f',traducatori:'https://data.gov.ro/dataset/b1c5ffa9-9dbc-4e71-82c5-6dbee3c806ff'};
const recordTitle=(record:Record<string,unknown>)=>String(record.Nume||record['Nume și prenume']||'Expert în registru').trim();

export function ExpertsWorkspace({initialQuery=''}:{initialQuery?:string}){
 const geo=useLocation(),[geoScope,setGeoScope]=useGeographicScope(),[kind,setKind]=useState<ExpertKind>('experti-judiciari'),[draft,setDraft]=useState(initialQuery),[q,setQ]=useState(initialQuery),[page,setPage]=useLocationState(0),[judet,setJudet]=useState(''),[open,setOpen]=useLocationState<number|null>(null);
 const state=useSource('/api/experts?'+new URLSearchParams({kind,q,page:String(page),...(judet?{judet}:{}),...geographicParams(geo,geoScope)}),{timeoutMs:28000});
 const d=state.data?.data;
 useEffect(()=>{setPage(0);setOpen(null)},[geo.key]);
 const judete:string[]=(d?.facets&&d.facets['Județele'])||[];
 return <section className="live-section">
  <span className="kicker">REGISTRE PROFESIONALE · JUSTIȚIE</span>
  <h2>Experți, traducători și interpreți</h2>
  <p>Registrele publicate de Ministerul Justiției și de ministerul de resort: experți judiciari, experți tehnici atestați, traducători și interpreți autorizați.</p>
  <div className="chip-row">{expertKinds.map(entry=><button type="button" key={entry.id} aria-pressed={entry.id===kind} className={entry.id===kind?'selected':''} onClick={()=>{setKind(entry.id);setDraft('');setQ('');setJudet('');setPage(0);setOpen(null)}}>{entry.label}</button>)}</div>
  <GeographicScopeField value={geoScope} onChange={value=>{setGeoScope(value);setPage(0);setOpen(null)}}/>
  <SearchForm className="live-search" key={kind} value={draft} onSearch={value=>{setDraft(value);setQ(value);setPage(0);setOpen(null)}} inputProps={{'aria-label':'Caută în registrul profesional','maxLength':100,placeholder:'Nume, specializare, limbă sau alte câmpuri publicate'}}/>
  <div className="entity-filters"><label><span className="control-label">Județ</span><SelectField value={judet} onChange={event=>{setJudet(event.target.value);setPage(0);setOpen(null)}}><option value="">Toate județele</option>{judete.map(name=><option key={name} value={name}>{name}</option>)}</SelectField></label></div>
  {state.busy&&<p role="status">Se încarcă registrul profesional…</p>}
  {(state.error||state.data?.status==='unavailable')&&<div className="live-error"><p>{state.error||state.data?.error||'Registrul profesional nu poate fi citit acum.'}</p><Button variant="outline" onClick={state.retry}><RefreshCw size={16}/>Reîncearcă</Button></div>}
  <Freshness source={state.data} loading={state.busy}/>
  {d&&<>
   <p>{countText(d.total,'înregistrare găsită','înregistrări găsite')}{d.period?' · ediția '+d.period:''}</p>
   <div className="record-list">{(d.records as Record<string,unknown>[]).map((record,index)=><article key={String(record._id??index)}>
    <button type="button" className="record-heading" onClick={()=>setOpen(open===index?null:index)} aria-expanded={open===index} aria-controls={'record-experti-'+index}><span><strong>{recordTitle(record)}</strong><small>{[String(record.Judet||record.Județul||'').trim(),String(record.Specializare||record.Limbi||'').trim()].filter(Boolean).join(' · ')||'Vezi toate datele înregistrării'}</small></span><span>{open===index?'−':'+'}</span></button>
    {open===index&&<ContactsPanel data={record}/>}
    {open===index&&<dl id={'record-experti-'+index} className="record-fields">{(d.fields as string[]).map(field=><div key={field}><dt>{field}</dt><dd>{record[field]===null||record[field]===undefined||String(record[field]).trim()===''?'Nefurnizat de sursă':sourceText(record[field])}</dd></div>)}</dl>}
    {open===index&&<div className="entity-detail-actions"><a className="text-link" href={datasets[kind]} target="_blank" rel="noreferrer">Registrul pe data.gov.ro</a><ExportActions input={{title:'Fișa publică a expertului',data:record}} label="Descarcă datele publicate"/></div>}
   </article>)}</div>
   {!d.records.length&&<p className="live-empty">Nu există înregistrări pentru căutarea aleasă.</p>}
   <Pagination page={d.page??page} pages={d.pages??Math.max(1,Math.ceil(d.total/20))} total={d.total} busy={state.busy} onPage={value=>{setPage(value);setOpen(null)}}/>
   <p className="field-help">{d.note}</p>
  </>}
 </section>;
}
