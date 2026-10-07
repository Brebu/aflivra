'use client';
import {SearchForm} from './search-form';
import {useState} from 'react';
import {TrainFront,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useSource,Freshness} from './live-data';
import {Pagination} from './pagination';
import {countText} from '@/lib/live/query';

// Category labels are presentation-only; the corpus module stays server-side (Workers env).
const trainCategory=(code:string)=>({R:'Regional',IR:'Interregional','IR-N':'Interregional - noapte',I:'InterCity',IC:'InterCity','IC-N':'InterCity - noapte',N:'Tren de noapte',S:'Special'} as Record<string,string>)[code]||code;


type StationRow={code:number;name:string;operators:string[];trains:number};
type BoardRow={t:number;tt:string;n:string;c:string;d?:string;f?:string;zl:string;o:string};
type OperatorInfo={id:string;name:string;edition:string;validFrom:string;validTo:string;trains:number;datasetUrl:string};

const dateText=(compact:string)=>compact?compact.slice(0,4)+'-'+compact.slice(4,6)+'-'+compact.slice(6,8):'';

export function TrainsWorkspace({initialQuery=''}:{initialQuery?:string}){
 const [draft,setDraft]=useState(initialQuery),[q,setQ]=useState(initialQuery),[page,setPage]=useState(0),[station,setStation]=useState<StationRow|null>(null);
 const state=useSource('/api/trains?'+new URLSearchParams({q,page:String(page)}));
 const boardState=useSource(station?'/api/trains?'+new URLSearchParams({station:String(station.code)}):null);
 const d=state.data?.data,board=boardState.data?.data,operators=d?.operators as OperatorInfo[]|undefined;
 const operatorName=(id:string)=>operators?.find(entry=>entry.id===id)?.name||id;
 return <section className="live-section">
  <span className="kicker">MERSUL TRENURILOR · OPERATORI FEROVIARI</span>
  <h2><TrainFront size={22}/> Gări și mersul trenurilor</h2>
   <p>Orarele planificate ale operatorilor de transport feroviar de călători, edițiile publicate pe data.gov.ro de S.C. Informatică Feroviară S.A. Caută gara sau stația și deschide tabla de plecări și sosiri planificate. Edițiile publicate sunt doar ore planificate — pozițiile în timp real ale trenurilor nu sunt disponibile de la operator, deci această pagină nu desenează trenuri pe hartă și nu inventează poziții.</p>
  <SearchForm className="live-search" value={draft} onSearch={value=>{setDraft(value);setQ(value);setPage(0);setStation(null)}} inputProps={{'aria-label':'Caută gara sau stația de tren','maxLength':100,placeholder:'Gară, stație sau haltă — de ex. Brașov'}}/>
  {state.busy&&!d&&<p role="status">Se încarcă indicele stațiilor…</p>}
  {(state.error||state.data?.status==='unavailable')&&<div className="live-error"><p>{state.error||state.data?.error||'Orarul trenurilor nu poate fi citit acum.'}</p><Button variant="outline" onClick={state.retry}><RefreshCw size={16}/>Reîncearcă</Button></div>}
  <Freshness source={state.data} loading={state.busy}/>
  {d&&station&&board&&board.departures&&board.arrivals&&
   <div className="transport-detail">
    <div className="panel-top"><h3>{station.name}</h3><Button variant="outline" onClick={()=>setStation(null)}>Închide tabla</Button></div>
    <p>{countText(board.departures.length,'plecare planificată','plecări planificate')} · {countText(board.arrivals.length,'sosire planificată','sosiri planificate')}</p>
    <div className="table-scroll"><table className="facts-table"><thead><tr><th>Plecare</th><th>Tren</th><th>Categorie</th><th>Destinație</th><th>Zile</th><th>Operator</th></tr></thead><tbody>{board.departures.map((row:BoardRow,i:number)=><tr key={'d'+row.o+row.n+row.t+i}><td>{row.tt}</td><td>{row.n}</td><td>{trainCategory(row.c)}</td><td>{row.d||'—'}</td><td>{row.zl}</td><td>{operatorName(row.o)}</td></tr>)}</tbody></table></div>
    <div className="table-scroll"><table className="facts-table"><thead><tr><th>Sosire</th><th>Tren</th><th>Categorie</th><th>Proveniență</th><th>Zile</th><th>Operator</th></tr></thead><tbody>{board.arrivals.map((row:BoardRow,i:number)=><tr key={'a'+row.o+row.n+row.t+i}><td>{row.tt}</td><td>{row.n}</td><td>{trainCategory(row.c)}</td><td>{row.f||'—'}</td><td>{row.zl}</td><td>{operatorName(row.o)}</td></tr>)}</tbody></table></div>
   </div>}
  {d?.items&&<>
   <p>{countText(d.total,'stație găsită','stații găsite')}</p>
   <div className="record-list">{(d.items as StationRow[]).map((row,index)=><article key={row.code}>
    <button type="button" className="record-heading" onClick={()=>setStation(row)} aria-expanded={station?.code===row.code}><TrainFront size={18}/><span><strong>{row.name}</strong><small>{[countText(row.trains,'tren','trenuri'),row.operators.length?countText(row.operators.length,'operator','operatori'):''].filter(Boolean).join(' · ')}</small></span><span>Tabla stației</span></button>
   </article>)}</div>
   {!d.items.length&&<p className="live-empty">Nu există stații pentru căutarea aleasă.</p>}
   <Pagination page={d.page??page} pages={d.pages??Math.max(1,Math.ceil(d.total/40))} total={d.total} busy={state.busy} onPage={value=>{setPage(value);setStation(null)}}/>
   <p className="field-help">{d.note}</p>
   {operators&&<details className="reader-provenance"><summary>Edițiile operatorilor ({operators.length})</summary>{operators.map(operator=><p key={operator.id}><strong>{operator.name}</strong> — ediția „{operator.edition}”, valabilă {dateText(operator.validFrom)}–{dateText(operator.validTo)}, {countText(operator.trains,'tren','trenuri')}. <a className="text-link" href={operator.datasetUrl} target="_blank" rel="noreferrer">Setul de date</a></p>)}</details>}
   {!!d.delayedEditions?.length&&<p className="source-warning">{d.delayedEditions.join('; ')}</p>}
  </>}
  {station&&!board&&boardState.busy&&<p role="status">Se încarcă tabla stației {station.name}…</p>}
  {station&&!board&&!boardState.busy&&boardState.data?.status==='unavailable'&&<div className="live-error"><p>{boardState.data.error||boardState.error||'Tabla stației nu poate fi citită acum.'}</p>{boardState.retry&&<Button variant="outline" onClick={boardState.retry}><RefreshCw size={16}/>Reîncearcă</Button>}</div>}
 </section>;
}
