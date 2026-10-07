'use client';
import {useLocation} from './location';
import {GeographicScopeField,useGeographicScope,useLocationState} from './location-scope';
import {geographicParams} from '@/lib/geographic-scope';
import {SearchForm} from './search-form';
import {SelectField} from './select-field';
import {ContactsPanel} from './contacts-panel';
import {useEffect,useState} from 'react';
import {RefreshCw,Scale} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useSource,Freshness} from './live-data';
import {Pagination} from './pagination';
import {ExportActions} from './export-actions';
import {countText} from '@/lib/live/query';
import {sourceText} from '@/lib/live/text';

export function NotariesWorkspace({initialQuery=''}:{initialQuery?:string}){
 const geo=useLocation(),[geoScope,setGeoScope]=useGeographicScope(),[draft,setDraft]=useState(initialQuery),[q,setQ]=useState(initialQuery),[page,setPage]=useLocationState(0),[chamber,setChamber]=useState(''),[open,setOpen]=useLocationState<number|null>(null);
 const state=useSource('/api/notaries?'+new URLSearchParams({q,page:String(page),...(chamber?{chamber}:{}),...geographicParams(geo,geoScope)}),{timeoutMs:28000});
 const d=state.data?.data;
 useEffect(()=>{setPage(0);setOpen(null)},[geo.key]);
 const chambers:string[]=(d?.facets&&d.facets['Camerele notarilor'])||[];
 const recordTitle=(record:Record<string,unknown>)=>String(record.NUME||'Notar în registru').trim();
 return <section className="live-section">
  <span className="kicker">REGISTRU PROFESIONAL · MINISTERUL JUSTIȚIEI</span>
  <h2><Scale size={22}/> Notari publici în registru</h2>
  <p>Registrul oficial al notarilor publici, cu camera de notari și biroul fiecăruia. Prezența în registru nu este o recomandare; actele notariale se încheie la biroul ales.</p>
  <GeographicScopeField value={geoScope} onChange={value=>{setGeoScope(value);setPage(0);setOpen(null)}}/>
  <SearchForm className="live-search" value={draft} onSearch={value=>{setDraft(value);setQ(value);setPage(0);setOpen(null)}} inputProps={{'aria-label':'Caută notar în registrul profesional','maxLength':100,placeholder:'Nume, notariat, localitate sau alte câmpuri publicate'}}/>
  <div className="entity-filters">
   <label><span className="control-label">Camera notarilor</span><SelectField value={chamber} onChange={event=>{setChamber(event.target.value);setPage(0);setOpen(null)}}><option value="">Toate camerele</option>{chambers.map(name=><option key={name} value={name}>{name}</option>)}</SelectField></label>
   <a className="text-link" href="https://legislatie.just.ro/Public/DetaliiDocument/278490" target="_blank" rel="noreferrer">Grila de onorarii — Ordinul 177/C/2024</a>
  </div>
  {state.busy&&<p role="status">Se încarcă registrul notarilor…</p>}
  {(state.error||state.data?.status==='unavailable')&&<div className="live-error"><p>{state.error||state.data?.error||'Registrul notarilor nu poate fi citit acum.'}</p><Button variant="outline" onClick={state.retry}><RefreshCw size={16}/>Reîncearcă</Button></div>}
  <Freshness source={state.data} loading={state.busy}/>
  {d&&<>
   <p>{countText(d.total,'înregistrare găsită','înregistrări găsite')}{d.period?' · ediția '+d.period:''}</p>
   <div className="record-list">{d.records.map((record:Record<string,unknown>,index:number)=><article key={String(record._id??index)}>
    <button type="button" className="record-heading" onClick={()=>setOpen(open===index?null:index)} aria-expanded={open===index} aria-controls={'record-notari-'+index}><Scale size={18}/><span><strong>{recordTitle(record)}</strong><small>{[String(record.CAMERA||'').trim(),String(record.LOCALITATE||'').trim(),String(record.JUDET||'').trim()].filter(Boolean).join(' · ')||'Vezi toate datele înregistrării'}</small></span><span>{open===index?'−':'+'}</span></button>
    {open===index&&<ContactsPanel data={record}/>}
    {open===index&&<dl id={'record-notari-'+index} className="record-fields">{(d.fields as string[]).map(field=><div key={field}><dt>{field}</dt><dd>{record[field]===null||record[field]===undefined||String(record[field]).trim()===''?'Nefurnizat de sursă':sourceText(record[field])}</dd></div>)}</dl>}
    {open===index&&<div className="entity-detail-actions"><a className="text-link" href="https://data.gov.ro/dataset/bc69c898-b356-4e2c-9251-1833857d1a6e" target="_blank" rel="noreferrer">Registrul pe data.gov.ro</a><ExportActions input={{title:'Fișa publică a notarului',data:record}} label="Descarcă datele publicate"/></div>}
   </article>)}</div>
   {!d.records.length&&<p className="live-empty">Nu există notari pentru căutarea aleasă.</p>}
   <Pagination page={d.page??page} pages={d.pages??Math.max(1,Math.ceil(d.total/20))} total={d.total} busy={state.busy} onPage={value=>{setPage(value);setOpen(null)}}/>
   <p className="field-help">{d.note}</p>
  </>}
 </section>;
}
