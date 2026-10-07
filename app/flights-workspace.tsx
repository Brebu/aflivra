'use client';
import {useSource} from './use-source';
import {SearchInput} from './search-input';
import {Pagination} from './pagination';
import {PublicMap} from './public-map';
import {Freshness,dateText} from './live-data';
import {MetadataFields} from './metadata-fields';
import {countText} from '@/lib/live/query';
import {format} from './v2-model';
import {biaAirports} from '@/lib/live/flights';
import {Plane,PlaneTakeoff,Search,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useState} from 'react';

function SourceFailure({state}:{state:ReturnType<typeof useSource>}){return <>{state.busy&&<p role="status">Se încarcă sursele…</p>}{(state.error||state.data?.status==='unavailable')&&<div className="live-error"><p>{state.error||state.data?.error}</p><Button onClick={state.retry} variant="outline"><RefreshCw size={16}/>Reîncearcă</Button></div>}<Freshness source={state.data}/></>}

function boardTimes(row:any){return [row.scheduledTime?'Ora publicată '+row.scheduledTime:'',row.estimatedTime?'Estimată '+row.estimatedTime:'',row.actualTime?'Efectuată '+row.actualTime:''].filter(Boolean).join(' · ')}

export function FlightsWorkspace({initialQuery=''}:{initialQuery?:string}){
 const [q,setQ]=useState(initialQuery),[page,setPage]=useState(0),[airportId,setAirportId]=useState(biaAirports[0].id),[map,setMap]=useState(true);
 const live=useSource('/api/flights?'+new URLSearchParams({q,page:String(page)}),{timeoutMs:15000,pollMs:30000});
 const board=useSource('/api/flight-board?'+new URLSearchParams({airport:airportId,q}),{timeoutMs:15000});
 const ld=live.data?.data,bd=board.data?.data,airport=biaAirports.find(a=>a.id===airportId)||biaAirports[0];
 const rows=ld?.items||[];
 return <section className="live-section flights-workspace">
  <div className="panel-top"><div><span className="kicker">ADS-B · SPAȚIUL AERIAN ROMÂNESC</span><h2>Avioane în spațiul românesc</h2><p>Stările aeronavelor aflate acum deasupra României: indicativ, tip, imatriculare, altitudine și viteză, cu direcția de zbor pe hartă.</p></div><Plane size={30}/></div>
  <div className="live-search"><Search size={18}/><SearchInput delay={350} value={q} onValueChange={value=>{setQ(value);setPage(0)}} aria-label="Caută avioane după indicativ, imatriculare sau tip" placeholder="Indicativ, imatriculare, tip sau cod transponder"/></div>
  <SourceFailure state={live}/>
  {ld&&<><p className={ld.isLive?'small-muted':'source-warning'}>{countText(ld.total,'avion în spațiul aerian românesc','avioane în spațiul aerian românesc')}{ld.isLive?' · flux publicat acum':' · ultima copie disponibilă; pozițiile curente sunt neconfirmate'} · momentul fluxului: {dateText(ld.observedAt)}</p>
  {ld.isLive&&map&&<PublicMap points={rows.map((r:any)=>({id:r.hex,name:String(r.callsign||r.registration||'Aeronavă fără identificativ')+(r.typeCode?' · '+r.typeCode:''),lat:r.lat,lon:r.lon,vehicle:true,description:'Imatriculare '+(r.registration||'neprecizată'),bearing:r.track,speed:r.groundSpeedKt===null||r.groundSpeedKt===undefined?undefined:r.groundSpeedKt*0.514444,occupancy:null,occupancyPercentage:null}))} viewKey={'flights:'+q+':'+page}/>}
  {ld.isLive&&!map&&<div className="control-action"><Button variant="outline" onClick={()=>setMap(true)}>Vezi pozițiile pe hartă</Button></div>}
  {ld.isLive&&map&&<div className="control-action"><Button variant="outline" onClick={()=>setMap(false)}>Închide harta</Button></div>}
  <div className="record-list">{rows.map((r:any)=><article className="flight-record" key={r.hex}><h3><Plane size={22}/>{String(r.callsign||'Imatricularea '+(r.registration||r.hex))}</h3><p>{[r.typeCode,r.registration].filter(Boolean).join(' · ')||'Tip neprecizat de receptor'} · {r.onGround||r.altitudeFt===null?'la sol':format(Math.round(r.altitudeFt*0.3048))+' m'}{r.groundSpeedKt===null||r.groundSpeedKt===undefined?'':' · '+(r.groundSpeedKt*1.852).toFixed(0)+' km/h'}{r.verticalRateFpm?' · '+(r.verticalRateFpm>0?'urcă':'coboară')+' '+Math.abs(r.verticalRateFpm)+' ft/min':''}</p><p>Starea din flux: {dateText(r.observedAt)}{r.squawk?' · transponder '+r.squawk:''}{r.emergency?' · urgență '+r.emergency:''}</p><MetadataFields data={r.details} title="Toate datele publicate de receptorii ADS-B"/></article>)}</div>
  {!rows.length&&<p>{ld.isLive&&ld.entityCount?'Receptorii nu au în flux aeronave pentru această căutare.':'Fluxul nu conține aeronave în spațiul aerian românesc acum.'}</p>}
  <Pagination page={ld.page} pages={ld.pages} total={ld.total} busy={live.busy} onPage={setPage}/>
  <p className="small-muted">{ld.note}</p></>}
  <div className="airport-board">
   <div className="panel-top"><div><span className="kicker">{'AEROPORTUL '+airport.name.toUpperCase()+' · BIA'}</span><h3>Panoul oficial de sosiri și plecări</h3><p>Panoul publicat de Compania Națională a Aeroporturilor București, preluat prin intermediar extern și servit din copia verificată.</p></div><PlaneTakeoff size={30}/></div>
   <div className="chip-row">{biaAirports.map(a=><button key={a.id} type="button" className={airportId===a.id?'selected':''} aria-pressed={airportId===a.id} onClick={()=>setAirportId(a.id)}>{a.label}</button>)}</div>
   <SourceFailure state={board}/>
   {bd&&<><p>{countText(bd.arrivalsTotal??bd.arrivals.length,'sosire','sosiri')} · {countText(bd.departuresTotal??bd.departures.length,'plecare','plecări')}{bd.dropped?' · '+countText(bd.dropped,'curse omisă fără câmpuri complete','curse omise fără câmpuri complete'):''} · momentul panoului: {dateText(bd.observedAt)}</p>
   <div className="board-lists">
    <div className="board-column"><h4>Sosiri</h4>{bd.arrivals.length?<div className="record-list">{bd.arrivals.map((f:any,i:number)=><article className="board-flight" key={f.flightNumber+':'+i}><strong>{f.flightNumber}</strong>{f.airline&&<p>{f.airline}</p>}{f.route&&<p>{f.route}</p>}<p>{[boardTimes(f),f.status||''].filter(Boolean).join(' · ')}</p>{f.gate&&<p>Poarta {f.gate}</p>}<MetadataFields data={f.details} title="Toate datele publicate de aeroport"/></article>)}</div>:<p>Nici o sosire pentru filtrul curent.</p>}</div>
    <div className="board-column"><h4>Plecări</h4>{bd.departures.length?<div className="record-list">{bd.departures.map((f:any,i:number)=><article className="board-flight" key={f.flightNumber+':'+i}><strong>{f.flightNumber}</strong>{f.airline&&<p>{f.airline}</p>}{f.route&&<p>{f.route}</p>}<p>{[boardTimes(f),f.status||''].filter(Boolean).join(' · ')}</p>{f.gate&&<p>Poarta {f.gate}</p>}<MetadataFields data={f.details} title="Toate datele publicate de aeroport"/></article>)}</div>:<p>Nici o plecare pentru filtrul curent.</p>}</div>
   </div>
   <p className="small-muted">{bd.note} Panoul zilei se reîmprospătează la fiecare 30 de minute prin intermediarul de reîmprospătare.</p>
   <a href={board.data?.url||'https://bucharestairports.ro/'} target="_blank" rel="noreferrer">Panoul oficial al aeroportului</a></>}
  </div>
 </section>;
}
