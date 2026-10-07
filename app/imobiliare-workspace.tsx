'use client';
import {SearchForm} from './search-form';
import {SelectField} from './select-field';
import {useState} from 'react';
import {Building2,Info,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useSource,Freshness} from './live-data';
import {Pagination} from './pagination';
import {ExportActions} from './export-actions';
import {DataChart} from './v2-charts';
import {countText} from '@/lib/live/query';

/*
 Stratul „Imobiliare & locuințe” sub Bani & economie. Verdictul cercetării: anunțurile
 imobiliare private nu au nicio sursă liberă și publică, deci nu se republică. Straturile
 publice servite aici: amplasamentele ANL recepționate (programe, localități, unități) și
 dinamica ipotecilor ANCPI (indicatori de piață, nu anunțuri) — cu limita declarată la vedere.
*/
export function ImobiliareWorkspace({initialQuery=''}:{initialQuery?:string}){
 const [draft,setDraft]=useState(initialQuery),[q,setQ]=useState(initialQuery),[page,setPage]=useState(0),[county,setCounty]=useState(''),[open,setOpen]=useState<number|null>(null);
 const anl=useSource('/api/anl?'+new URLSearchParams({q,page:String(page),...(county?{county}:{})}),{timeoutMs:28000});
 const ancpi=useSource('/api/ancpi',{timeoutMs:28000});
 const d=anl.data?.data,s=ancpi.data?.data,counties:string[]=(d?.facets&&d.facets['Județele ANL'])||[];
 const resetBrowse=()=>{setPage(0);setOpen(null)};
 const recordTitle=(record:Record<string,unknown>)=>String(record['Amplasament']||'Amplasament în programul ANL').trim();
 return <section className="live-section imobiliare-workspace">
  <div className="panel-top"><div><span className="kicker">IMOBILIARE ȘI LOCUINȚE · SURSE PUBLICE</span><h2><Building2 size={20}/> Locuințe și ipoteci, pe surse publice</h2><p>Nu există o sursă publică liberă pentru anunțurile imobiliare, deci nu republicăm anunțuri. Straturile publice disponibile: amplasamentele recepționate de ANL în programul național de locuințe pentru tineri și dinamica ipotecilor publicată de ANCPI.</p></div><Building2 size={30}/></div>
  <div className="vcallout"><Info size={26}/><div><strong>Ce poate arăta onest un strat public de imobiliare</strong><p>Programe, localități, unități de locuit recepționate și numărul ipotecilor înscrise — indicatori de piață, nu anunțuri. Anunțurile private rămân la portalurile care le publică, cu termenii lor.</p></div></div>
  {d&&<article className="vpanel">
   <div className="panel-top"><div><span className="kicker">{d.publisher.toUpperCase()}</span><h3>Amplasamente locuințe pentru tineri · ANL</h3></div></div>
   <p>{d.program}. Recepția nu înseamnă locuri libere: repartizarea o face ANL, la termenii publiciți de agenție.</p>
   <div className="entity-filters">
    <SearchForm className="live-search" value={draft} onSearch={value=>{setDraft(value);setQ(value);resetBrowse()}} inputProps={{'aria-label':'Caută amplasament, localitate sau județ','maxLength':100,placeholder:'Amplasament, localitate, județ sau alt câmp publicat'}}/>
    <label><span className="control-label">Județul</span><SelectField value={county} onChange={event=>{setCounty(event.target.value);resetBrowse()}}><option value="">Toate județele</option>{counties.map(name=><option key={name} value={name}>{name}</option>)}</SelectField></label>
   </div>
   {anl.busy&&<p role="status">Se încarcă lista ANL…</p>}
   {(anl.error||anl.data?.status==='unavailable')&&<div className="live-error"><p>{anl.error||anl.data?.error||'Lista ANL nu poate fi citită acum.'}</p><Button variant="outline" onClick={anl.retry}><RefreshCw size={16}/>Reîncearcă</Button></div>}
   <Freshness source={anl.data} loading={anl.busy}/>
   <p>{countText(d.total,'amplasament ANL găsit','amplasamente ANL găsite')}{d.period?' · programul '+d.period:''}{d.edition?' · '+d.edition:''} · {countText(d.unitsTotal,'unitate de locuit recepționată','unități de locuit recepționate')} la nivel național.</p>
   <DataChart data={d.years||[]} type="bar" labels={['Locuințe recepționate pe an']} unit="unități de locuit"/>
   <p className="field-help">Traiectoria națională a programului, din rândul de totaluri publicat de sursă: ani cu unități recepționate, fără completări.</p>
   <div className="record-list">{(d.records as Record<string,unknown>[]).map((record,index)=><article key={String(record._id??index)}>
    <button type="button" className="record-heading" onClick={()=>setOpen(open===index?null:index)} aria-expanded={open===index} aria-controls={'record-anl-'+index}><Building2 size={18}/><span><strong>{recordTitle(record)}</strong><small>{[String(record['Localitate']||'').trim(),String(record['Judeţ']||'').trim()].filter(Boolean).join(' · ')||'Vezi toate datele publicate'}</small></span><span>{open===index?'−':'+'}</span></button>
    {open===index&&<dl id={'record-anl-'+index} className="record-fields">{(d.fields as string[]).filter(field=>record[field]!==undefined).map(field=><div key={field}><dt>{field}</dt><dd>{record[field]===null||record[field]===undefined||String(record[field]).trim()===''?'Nefurnizat de sursă':String(record[field])}</dd></div>)}</dl>}
   </article>)}</div>
   {d.records&&!d.records.length&&<p className="live-empty">Nu există amplasamente ANL pentru căutarea aleasă.</p>}
   <Pagination page={d.page??page} pages={d.pages??1} total={d.total} busy={anl.busy} onPage={value=>{setPage(value);setOpen(null)}}/>
   <div className="entity-detail-actions"><a className="text-link" href="https://data.gov.ro/dataset/04ab4208-d17f-4f9b-ba81-7778f373344d" target="_blank" rel="noreferrer">Setul ANL pe data.gov.ro</a><ExportActions input={{title:'Amplasamente locuințe pentru tineri · ANL ('+d.edition+')',data:{program:d.program,period:d.period,edition:d.edition,records:d.records}}} label="Descarcă amplasamentele afișate"/></div>
   <p className="field-help">{d.note}</p>
  </article>}
  {s&&<article className="vpanel">
   <div className="panel-top"><div><span className="kicker">{s.publisher.toUpperCase()}</span><h3>Dinamica ipotecilor · ANCPI</h3></div></div>
   <p>Numărul imobilelor ipotecate în {s.monthLabel}, raportat pe județe și pe tipul imobilului, cum publică ANCPI în editia lunară. {countText(s.total,'ipotecă înscrisă','ipoteci înscrise')}{s.countyCount?' în '+countText(s.countyCount,'județ','județe'):''}.</p>
   {ancpi.busy&&<p role="status">Se încarcă raportul ANCPI…</p>}
   {(ancpi.error||ancpi.data?.status==='unavailable')&&<div className="live-error"><p>{ancpi.error||ancpi.data?.error||'Raportul ANCPI nu poate fi citit acum.'}</p><Button variant="outline" onClick={ancpi.retry}><RefreshCw size={16}/>Reîncearcă</Button></div>}
   <Freshness source={ancpi.data} loading={ancpi.busy}/>
   {(s.operations||[]).includes('inscriere')&&<DataChart data={(s.byType||[]).map((entry:{nameDisplay?:string;name:string;value:number})=>({name:entry.nameDisplay||entry.name,value:entry.value}))} type="bar" labels={['Ipoteci înscrise, după tipul imobilului']} unit="ipoteci"/>}
   <p className="field-help">Tipurile de imobil păstrează denumirile publicate de ANCPI; „neprecizat” înseamnă rândurile pe care sursa le marchează „-”.</p>
   <div className="table-scroll"><table className="facts-table"><thead><tr><th>Județ</th><th>Ipoteci înscrise</th><th>Apartamente</th><th>Terenuri cu construcții</th><th>Fără construcții</th><th>Agricol</th></tr></thead><tbody>{(s.byCounty||[]).map((row:Record<string,unknown>)=><tr key={String(row.county)}><th>{String(row.county)}</th><td>{countText(Number(row.total),'ipotecă','ipoteci')}</td><td>{countText(Number(row.apartamente),'ipotecă','ipoteci')}</td><td>{countText(Number(row['cu constructii']),'ipotecă','ipoteci')}</td><td>{countText(Number(row['fara constructii']),'ipotecă','ipoteci')}</td><td>{countText(Number(row.agricol),'ipotecă','ipoteci')}</td></tr>)}</tbody></table></div>
   {s.countyCount>(s.byCounty||[]).length&&<p className="field-help">Tabelul arată primele {countText((s.byCounty||[]).length,'județ','județe')} din {countText(s.countyCount,'județ raportat','județe raportate')}; exportul de mai jos conține toate rândurile publicate.</p>}
   <div className="entity-detail-actions"><a className="text-link" href="https://data.gov.ro/dataset/62410f25-a155-40fd-9aa9-ae54bdc96f42" target="_blank" rel="noreferrer">Setul ANCPI pe data.gov.ro</a><ExportActions input={{title:'Dinamica ipotecilor · ANCPI · '+s.monthLabel,data:s}} label="Descarcă raportul lunar"/></div>
   <p className="field-help">{s.note}</p>
  </article>}
 </section>;
}
