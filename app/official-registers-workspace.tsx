'use client';
import {useMemo,useState} from 'react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Landmark,Activity,Waves,BookOpen,BarChart3,Plug,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {SelectField} from './select-field';
import {SearchInput} from './search-input';
import {useSource,Freshness,dateText} from './live-data';
import {Pagination} from './pagination';
import {ExportActions} from './export-actions';

/*
 Registrele oficiale românești, la îndemână: fiecare tool MCP de „surse românești"
 are și o suprafață UI pe aceeași rută publică — SITUR (clasificare turistică),
 AMCCRS (încadrarea seismică a Bucureștiului), INFP/EIDA (istoricul seismic),
 LMI (monumente istorice), INS TEMPO (serii statistice) și energia (ofertele POSF
 plus observația SEN a Transelectricei). Registrul de clasificare spune cine e
 autorizat și cu ce capacitate declarată — nu prețuri, disponibilitate sau verdicturi.
*/

const COUNTIES=['Alba','Alba Iulia','Arad','Argeș','Bacău','Bihor','Bistrița-Năsăud','Botoșani','Brăila','Brașov','București','Buzău','Caraș-Severin','Călărași','Cluj','Constanța','Covasna','Dâmbovița','Dolj','Galați','Giurgiu','Gorj','Harghita','Hunedoara','Ialomița','Iași','Ilfov','Maramureș','Mehedinți','Mureș','Neamț','Olt','Prahova','Sălaj','Satu Mare','Sibiu','Suceava','Teleorman','Timiș','Tulcea','Vaslui','Vâlcea','Vrancea'];

const ResultTable=({head,rows,empty}:{head:string[];rows:(React.ReactNode)[][];empty:string})=>rows.length?(
 <div className="table-scroll"><table className="facts-table"><thead><tr>{head.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
):<p className="live-empty">{empty}</p>;

function TourismPanel(){
 const [kind,setKind]=useState('cazare'),[q,setQ]=useState(''),[county,setCounty]=useState(''),[page,setPage]=useState(0);
 const url=`/api/tourism?${new URLSearchParams({kind,q,county,page:String(page)})}`;
 const source=useSource(url,{timeoutMs:15000}),data=source.data?.data;
 const kindLabel=useMemo(()=>({cazare:'cazare',alimentatie:'alimentație publică',agentii:'agenții de turism'}[kind]||kind),[kind]);
 return <section className="live-section" aria-label="Registrele turistice SITUR">
  <div className="panel-top"><div><span className="kicker">SITUR · REGISTRUL TURISTIC</span><h2>Cine e clasificat și licențiat?</h2><p>Registrele oficiale ale structurilor de {kindLabel}: capacitatea declarată, CUI-ul, județul — de clasificare și licențiere, nu prețuri sau rezervări.</p></div><Landmark size={30}/></div>
  <div className="live-search"><Search size={18}/><SearchInput value={q} onValueChange={value=>{setQ(value);setPage(0)}} aria-label="Caută în registrul turistic" placeholder="Nume unitate, operator sau CUI"/></div>
  <div className="entity-filters"><label><span className="control-label">Registrul</span><SelectField value={kind} onChange={e=>{setKind(e.target.value);setPage(0)}}><option value="cazare">Cazare</option><option value="alimentatie">Alimentație publică</option><option value="agentii">Agenții de turism</option></SelectField></label><label><span className="control-label">Județ</span><SelectField value={county} onChange={e=>{setCounty(e.target.value);setPage(0)}}><option value="">Toată România</option>{COUNTIES.map(c=><option key={c}>{c}</option>)}</SelectField></label></div>
  {source.busy&&!data&&<p role="status">Se citește registrul…</p>}
  {source.error&&!data&&<div className="live-error"><p>{source.error}</p><Button variant="outline" onClick={source.retry}>Reîncearcă</Button></div>}
  {data&&<><p className="small-muted">{(data.total??0).toLocaleString('ro-RO')} înregistrări în selecție · exportul oficial din {(data.exportDate||data.fetchedAt||'').slice(0,10)}{(data.profile?.cuiLipsa||0)>0?` · ${data.profile.cuiLipsa.toLocaleString('ro-RO')} rânduri cu CUI lipsă chiar în exportul oficial`:''}</p>
  <ResultTable head={['Denumire','Localitate','Județ','Categorie','Locuri','CUI','Operator']} rows={(data.items||[]).map((item:any)=>[String(item.denumire||'—'),String(item.localitate||item.componenta||''),String(item.judet||''),String(item.categorie||''),String(item.locuri||''),String(item.cui||'—'),String(item.operator||'')])} empty="Nicio structură nu se potrivește selecției."/>
  <Pagination page={page} pages={data.pages??1} total={data.total??0} onPage={setPage}/>
  <ExportActions input={{title:'Registrul turistic SITUR — '+kindLabel,data:{filters:{kind,q,county},total:data.total,items:data.items},subtitle:'se.situr.gov.ro · registru de clasificare și licențiere'}} label="Descarcă selecția"/></>}
  {source.data&&<Freshness source={source.data} documentUrl={typeof data?.sourceUrl==='string'?data.sourceUrl:undefined}/>}
 </section>;
}

function SeismicPanel(){
 const [q,setQ]=useState(''),[sector,setSector]=useState(''),[page,setPage]=useState(0);
 const url=q.trim()?`/api/seismic?${new URLSearchParams({q:q.trim(),...(sector?{sector}:{}),page:String(page)})}`:null;
 const source=useSource(url,{timeoutMs:15000}),data=source.data?.data;
 return <section className="live-section" aria-label="Încadrarea seismică a clădirilor din București">
  <div className="panel-top"><div><span className="kicker">AMCCRS · ÎNCADRAREA SEISMICĂ</span><h2>Ce clasă de risc are o clădire din București?</h2><p>Registrul oficial al Primăriei: adresa, anul construcției, regimul de înălțime și clasa de risc normalizată. O adresă absentă din registru înseamnă „nu am găsit o înregistrare”, nu „clădire sigură”.</p></div><Activity size={30}/></div>
  <div className="live-search"><Search size={18}/><SearchInput value={q} onValueChange={value=>{setQ(value);setPage(0)}} aria-label="Caută o adresă în registrul seismic" placeholder="Adresă în București (ex. Academiei)"/></div>
  <div className="entity-filters"><label><span className="control-label">Sector</span><SelectField value={sector} onChange={e=>{setSector(e.target.value);setPage(0)}}><option value="">Toate</option>{[1,2,3,4,5,6].map(s=><option key={s} value={String(s)}>Sector {s}</option>)}</SelectField></label></div>
  <p className="field-help">Textul original de încadrare al registrului se păstrează integral; clasa normalizată (RsI–RsIV, urgență, consolidată) e derivare onestă, nu verdict cadastral.</p>
  {source.busy&&<p role="status">Se citește registrul…</p>}
  {source.error&&<div className="live-error"><p>{source.error}</p><Button variant="outline" onClick={source.retry}>Reîncearcă</Button></div>}
  {data&&<><p className="small-muted">{(data.total??0).toLocaleString('ro-RO')} clădiri în selecție · registrul actualizat {data.pageUpdated||'—'}</p>
  <ResultTable head={['Adresa','Anul construcției','Regim de înălțime','Apartamente','Clasa de risc normalizată']} rows={(data.items||[]).map((item:any)=>[String(item.adresaCompleta||item.adresa||''),String(item.anulconstruirii||'—'),String(item.regimuldeinaltime||'—'),String(item.numardeapartamente||'—'),<strong key="c">{String(item.clasanormalizata||'')}</strong>])} empty="Nicio clădire nu se potrivește — fie adresa nu e înregistrată, fie scrierea diferă."/>
  <Pagination page={page} pages={data.pages??1} total={data.total??0} onPage={setPage}/></>}
  {source.data&&<Freshness source={source.data} documentUrl="https://amccrs-pmb.ro/lista-imobile-2/"/>}
 </section>;
}

function EarthquakesPanel(){
 const [kind,setKind]=useState('events'),[from,setFrom]=useState('2015'),[to,setTo]=useState('2026'),[minMagnitude,setMinMagnitude]=useState(''),[q,setQ]=useState(''),[page,setPage]=useState(0);
 const url=`/api/earthquakes?${new URLSearchParams({kind,from,to,...(minMagnitude?{minMagnitude}:{}),q,page:String(page)})}`;
 const source=useSource(url,{timeoutMs:15000}),data=source.data?.data;
 const coverage=data?.coverage;
 return <section className="live-section" aria-label="Istoricul seismic al României">
  <div className="panel-top"><div><span className="kicker">INFP / EIDA · ISTORIC SEISMIC</span><h2>Cutremurele resimțite ale României</h2><p>Magnitudine ≥ 3 în dreptunghiul auditat 43–49°N / 20–30°E, pe felii anuale comise — istoric și infrastructură, nu avertizare în timp real.</p></div><Waves size={30}/></div>
  <div className="entity-filters"><label><span className="control-label">Registrul</span><SelectField value={kind} onChange={e=>{setKind(e.target.value);setPage(0)}}><option value="events">Evenimente</option><option value="stations">Stațiile rețelei RO</option></SelectField></label><label><span className="control-label">De la an</span><Input value={from} onChange={e=>{setFrom(e.target.value);setPage(0)}} inputMode="numeric" maxLength={10} aria-label="Anul sau data de început"/></label><label><span className="control-label">Până la an</span><Input value={to} onChange={e=>{setTo(e.target.value);setPage(0)}} inputMode="numeric" maxLength={10} aria-label="Anul sau data de final"/></label><label><span className="control-label">Magnitudine minimă</span><Input value={minMagnitude} onChange={e=>{setMinMagnitude(e.target.value);setPage(0)}} inputMode="decimal" maxLength={4} aria-label="Magnitudinea minimă"/></label>{kind==='events'&&<label><span className="control-label">Caută</span><SearchInput value={q} onValueChange={value=>{setQ(value);setPage(0)}} placeholder="Tip, locație, magnitudine"/></label>}</div>
  {coverage&&<p className="field-help">Acoperirea cererii: <strong>{coverage.status}</strong>{coverage.effective?` · interval efectiv ${coverage.effective.from}–${coverage.effective.to}`:''}{coverage.inconclusiveYears?.length?` · felii inconcludente: ${coverage.inconclusiveYears.join(', ')} (204 la sursă)`:''}. {coverage.note}</p>}
  {source.busy&&<p role="status">Se citește istoricul…</p>}
  {source.error&&<div className="live-error"><p>{source.error}</p><Button variant="outline" onClick={source.retry}>Reîncearcă</Button></div>}
  {data&&kind==='events'&&<><p className="small-muted">{(data.total??0).toLocaleString('ro-RO')} evenimente în selecție · M3+, felii anuale validate</p>
  <ResultTable head={['Momentul','Magnitudine','Tip','Adâncime (km)','Latitudine','Longitudine']} rows={(data.items||[]).map((item:any)=>[String(item.time||'').replace('T',' ').slice(0,16),<strong key="m">{item.magnitude}</strong>,String(item.eventType||''),String(item.depthKm||''),String(item.latitude||''),String(item.longitude||'')])} empty="Nicio înregistrare în intervalul acoperit."/>
  <Pagination page={page} pages={data.pages??1} total={data.total??0} onPage={setPage}/></>}
  {data&&kind==='stations'&&<><p className="small-muted">{(data.total??0).toLocaleString('ro-RO')} înregistrări de stație/perioadă ale rețelei RO — nu neapărat active în prezent</p>
  <ResultTable head={['Stația','Site','Latitudine','Longitudine','Perioadă']} rows={(data.items||[]).map((item:any)=>[item.station,String(item.siteName||''),String(item.latitude||''),String(item.longitude||''),String(item.startTime||'').slice(0,10)+(item.endTime?' – '+String(item.endTime).slice(0,10):' – prezent')])} empty="Nicio stație nu se potrivește."/>
  <Pagination page={page} pages={data.pages??1} total={data.total??0} onPage={setPage}/></>}
  {source.data&&<Freshness source={source.data} documentUrl="https://eida-sc3.infp.ro/"/>}
 </section>;
}

function MonumentsPanel(){
 const [q,setQ]=useState(''),[page,setPage]=useState(0);
 const url=`/api/monuments?${new URLSearchParams({q,page:String(page)})}`;
 const source=useSource(url,{timeoutMs:15000}),data=source.data?.data;
 return <section className="live-section" aria-label="Monumentele istorice ale Bucureștiului">
  <div className="panel-top"><div><span className="kicker">LMI 2015 · MONUMENTE ISTORICE</span><h2>Patrimoniul construit al Bucureștiului</h2><p>Lista Monumentelor Istorice 2015 (Monitorul Oficial, Partea I, Nr. 113 bis): cod LMI, adresă, datare și poziția în Monitor — foliul tipărit și pagina PDF, separate. Baza 2015: ordinele ulterioare nu sunt înglobate.</p></div><BookOpen size={30}/></div>
  <div className="live-search"><Search size={18}/><SearchInput value={q} onValueChange={value=>{setQ(value);setPage(0)}} aria-label="Caută în lista monumentelor" placeholder="Cod LMI, denumire sau adresă"/></div>
  {source.busy&&<p role="status">Se citește lista…</p>}
  {source.error&&<div className="live-error"><p>{source.error}</p><Button variant="outline" onClick={source.retry}>Reîncearcă</Button></div>}
  {data&&<><p className="small-muted">{(data.total??0).toLocaleString('ro-RO')} din {(data.total===0?2651:2651).toLocaleString('ro-RO')} de poziții în lista București · extragerea pe coloanele Monitorului</p>
  <ResultTable head={['Cod LMI','Denumire','Adresa','Datare','Foliul Monitorului','Pagina PDF']} rows={(data.items||[]).map((item:any)=>[<strong key="c">{item.codLmi}</strong>,String(item.denumire||''),String(item.adresa||''),String(item.datare||'—'),String(item.folioMof||''),String(item.paginaPdf||'')])} empty="Nicio poziție nu se potrivește."/>
  <Pagination page={page} pages={data.pages??1} total={data.total??0} onPage={setPage}/>
  <ExportActions input={{title:'Lista Monumentelor Istorice 2015 — București (selecție)',data:{filters:{q},total:data.total,items:data.items},subtitle:'patrimoniu.ro · Monitorul Oficial Partea I Nr. 113 bis/15.II.2016'}} label="Descarcă selecția"/></>}
  {source.data&&<Freshness source={source.data} documentUrl="https://patrimoniu.ro/ro/profiles/lista-monumentelor-istorice"/>}
 </section>;
}

function InsPanel(){
 const [territory,setTerritory]=useState('București');
 const url=`/api/ins?${new URLSearchParams({territory})}`;
 const source=useSource(url,{timeoutMs:25000}),data=source.data?.data;
 const statusLabel=(status:unknown)=>status==='revizuit'?'revizuit':status==='provizoriu'?'provizoriu':status==='semidefinitiv'?'semidefinitiv':'';
 return <section className="live-section" aria-label="Serii statistice INS TEMPO">
  <div className="panel-top"><div><span className="kicker">INS TEMPO · SERII STATISTICE</span><h2>Populația stabilă, pe teritorii</h2><p>Matricea validată POP105A: populația stabilă la 1 ianuarie, pe ultimii ani publicați, cu statutul per valoare așa cum îl marchează sursa tipografic.</p></div><BarChart3 size={30}/></div>
  <div className="entity-filters"><label><span className="control-label">Teritoriul</span><SelectField value={territory} onChange={e=>setTerritory(e.target.value)}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</SelectField></label></div>
  {source.busy&&<p role="status">Se interoghează matricea TEMPO…</p>}
  {source.error&&<div className="live-error"><p>{source.error}</p><Button variant="outline" onClick={source.retry}>Reîncearcă</Button></div>}
  {data&&<><p className="small-muted">{data.territoryLabel||territory} · {data.unit||'Număr persoane'} · {data.reference||''}{data.ultimaActualizare?` · actualizat ${String(data.ultimaActualizare).slice(0,10)}`:''}</p>
  <ResultTable head={['Anul','Populația stabilă','Statutul valorii']} rows={(data.values||[]).map((value:any)=>[String(value.year||''),value.value==null?'—':Number(value.value).toLocaleString('ro-RO'),(statusLabel(value.dataStatus))||'final (ne-marcat)'])} empty="Matricea nu a returnat valori pentru teritoriu."/>
  {data.statusNote&&<p className="small-muted">{data.statusNote}</p>}</>}
  {source.data&&<Freshness source={source.data} documentUrl="http://statistici.insse.ro:8077/tempo-ins/"/>}
 </section>;
}

function EnergyPanel(){
 const [county,setCounty]=useState('București'),[consumption,setConsumption]=useState('200'),[bill,setBill]=useState('300'),[q,setQ]=useState(''),[page,setPage]=useState(0);
 const offersUrl=`/api/energy-offers?${new URLSearchParams({county,consumptionMonthly:consumption||'200',currentBillLei:bill||'300',q,page:String(page)})}`;
 const offersSource=useSource(offersUrl,{timeoutMs:20000}),offers=offersSource.data?.data;
 const powerSource=useSource('/api/power',{timeoutMs:15000,pollMs:120000}),power=powerSource.data?.data;
 const ageText=(seconds:number|null|undefined)=>seconds==null?null:seconds<60?`acum ${seconds}s`:seconds<3600?`acum ${Math.round(seconds/60)} min`:`acum ${Math.round(seconds/3600)}h`;
 return <section className="live-section" aria-label="Energia: ofertele de energie electrică și sistemul energetic național">
  <div className="panel-top"><div><span className="kicker">POSF / ANRE · COMPARATORUL DE OFERTE</span><h2>Ce plătești, la ce ofertă?</h2><p>Ofertele casnice ale zonei tale, calculate la consumul și factura de referință declarate — ipoteze de calcul, nu factura ta.</p></div><Plug size={30}/></div>
  <div className="entity-filters"><label><span className="control-label">Zona (județul)</span><SelectField value={county} onChange={e=>{setCounty(e.target.value);setPage(0)}}>{COUNTIES.map(c=><option key={c}>{c}</option>)}</SelectField></label><label><span className="control-label">Consum lunar (kWh)</span><Input value={consumption} onChange={e=>{setConsumption(e.target.value);setPage(0)}} inputMode="numeric" maxLength={5}/></label><label><span className="control-label">Factura de referință (lei)</span><Input value={bill} onChange={e=>{setBill(e.target.value);setPage(0)}} inputMode="numeric" maxLength={7}/></label><label><span className="control-label">Caută furnizor</span><SearchInput value={q} onValueChange={value=>{setQ(value);setPage(0)}} placeholder="Nume furnizor"/></label></div>
  {offersSource.busy&&<p role="status">Se citesc ofertele zonei…</p>}
  {offersSource.error&&<div className="live-error"><p>{offersSource.error}</p><Button variant="outline" onClick={offersSource.retry}>Reîncearcă</Button></div>}
  {offers&&<><p className="small-muted">{offers.count} oferte distincte ({offers.rawRows} rânduri brute, {offers.duplicateIdenticalRows} duplicate identice, {offers.prosumatorRows} rânduri prosumator marcate) în zona {offers.zone?.nume_zona||county}</p>
  <ResultTable head={['Furnizor','Ofertă','Plată estimată','Facturare']} rows={(offers.items||[]).map((o:any)=>[String(o.furnizor||''),String(o.denumire_oferta||''),o.total_plata?Number(o.total_plata).toLocaleString('ro-RO')+' lei':String(o.total_plata??'—'),String(o.frecventa_emitere_factura||o.metoda_facturare||'')])} empty="Nicio ofertă nu se potrivește selecției."/>
  <Pagination page={page} pages={offers.pages??1} total={offers.count??0} onPage={setPage}/></>}
  {offersSource.data&&<Freshness source={offersSource.data} documentUrl="https://posf.ro/comparator?comparatorType=electric"/>}
  <article className="vpanel"><div className="panel-top"><div><span className="kicker">TRANSELECTRICA · SEN</span><h2>Sistemul energetic național, acum</h2><p>Observația de minut a rețelei: producție, consum și sold de schimb, în MW — observație curentă, nu prognoză energetică.</p></div><Activity size={26}/></div>
  {powerSource.busy&&!power&&<p role="status">Se citește observația SEN…</p>}
  {powerSource.error&&!power&&<div className="live-error"><p>{powerSource.error}</p><Button variant="outline" onClick={powerSource.retry}>Reîncearcă</Button></div>}
   {power&&<div className="dash-stats"><span className="field-help"><strong>{power.productionMW}</strong> MW producție</span><span className="field-help"><strong>{power.consumptionMW}</strong> MW consum</span><span className="field-help"><strong>{power.balanceSoldMW}</strong> MW sold de schimb</span></div>}
   {power&&power.observedAtText&&<p className="small-muted">Observat „{power.observedAtText}”{power.observationAgeSeconds!=null?` · ${ageText(power.observationAgeSeconds)}`:' · moment neconfirmat'}{power.observedAtNote?` · ${power.observedAtNote}`:''} · fusul declarat ca presupunere (Europe/Bucharest). Soldul și puterea nu sunt tarife sau cantități de facturat.</p>}
   {powerSource.data&&<Freshness source={powerSource.data} documentUrl="https://www.transelectrica.ro/"/>}
  </article>
 </section>;
}

export function OfficialRegistersWorkspace(){
 return <div className="official-registers-workspace"><Tabs defaultValue="tourism"><TabsList>
  <TabsTrigger value="tourism"><Landmark size={16}/>Turism</TabsTrigger>
  <TabsTrigger value="seismic"><Activity size={16}/>Clădiri seismice</TabsTrigger>
  <TabsTrigger value="earthquakes"><Waves size={16}/>Cutremure</TabsTrigger>
  <TabsTrigger value="monuments"><BookOpen size={16}/>Monumente</TabsTrigger>
  <TabsTrigger value="ins"><BarChart3 size={16}/>Statistici INS</TabsTrigger>
  <TabsTrigger value="energy"><Plug size={16}/>Energie</TabsTrigger>
 </TabsList>
  <TabsContent value="tourism"><TourismPanel/></TabsContent>
  <TabsContent value="seismic"><SeismicPanel/></TabsContent>
  <TabsContent value="earthquakes"><EarthquakesPanel/></TabsContent>
  <TabsContent value="monuments"><MonumentsPanel/></TabsContent>
  <TabsContent value="ins"><InsPanel/></TabsContent>
  <TabsContent value="energy"><EnergyPanel/></TabsContent>
 </Tabs></div>;
}
