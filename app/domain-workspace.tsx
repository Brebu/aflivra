'use client';
import {SelectField} from './select-field';
import {useLocation} from './location';
import {useState} from 'react';import {Layers,Coins} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';import {Input} from '@/components/ui/input';
import {topicSections,catalogTopic} from '@/lib/dashboard-topics';import type {LiveBundle} from '@/lib/live/types';
import {LawyersWorkspace} from './lawyers-workspace';import {PlacesWorkspace} from './places-workspace';import {TransitWorkspace} from './transit-workspace';import {CinemaWorkspace} from './cinema-workspace';import {StoriesWorkspace} from './stories-workspace';import {EventsWorkspace} from './events-workspace';
import {WeatherStations,EnergyCalculator,FeedCards,RecordBrowser,LocalitySearch,LiveCatalog,Freshness} from './live-data';
import {CompanyView,CompanyCompare} from './live-company';import {LegalWorkspace} from './legal-workspace';import {convertToLei} from './currency';
function MoneyWorkspace({source}:{source:LiveBundle['bnr']}){const [currency,setCurrency]=useState('EUR'),[amount,setAmount]=useState('100'),rates=source.data?.rates||[],rate=rates.find((r:any)=>r.currency===currency),converted=rate?convertToLei(amount,String(rate.value),String(rate.multiplier||1)):null;return <section className="live-section"><h2><Coins size={24}/>Cursuri și conversii BNR</h2><Freshness source={source}/><div className="entity-filters"><label><span className="control-label">Monedă</span><SelectField value={currency} onChange={e=>setCurrency(e.target.value)}>{rates.map((r:any)=><option key={r.currency}>{r.currency}</option>)}</SelectField></label><label><span className="control-label">Sumă</span><Input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" aria-label="Suma de convertit"/></label><div className="currency-answer"><span>Valoare în lei</span><strong>{converted??'—'} RON</strong></div></div><p>Curs de referință. Băncile și casele de schimb pot folosi alte cursuri și comisioane.</p><div className="currency-grid">{rates.map((r:any)=><button key={r.currency} onClick={()=>setCurrency(r.currency)} className={currency===r.currency?'active':''}><span>{r.currency}</span><strong>{Number(r.value)/Number(r.multiplier||1)}</strong><small>RON pentru o unitate</small></button>)}</div></section>}
export function DomainWorkspace({category,live,city,curated}:{category:string;live:LiveBundle;city:{name:string;lat:number;lon:number};curated?:React.ReactNode}){
 const geo=useLocation(),sections=topicSections[category]||[],[active,setActive]=useState(sections[0]?.id||'data');
 function content(id:string){
  if(id==='data')return <LiveCatalog category={catalogTopic(category)}/>;
  if(id==='places')return <PlacesWorkspace category={category} preferredCity={city.name}/>;
  if(id==='weather')return <WeatherStations source={live.weather} city={city}/>;
  if(id==='registry')return <LocalitySearch/>;
  if(id==='network'||id==='vehicles'||id==='arrivals'||id==='alerts'||id==='transport')return <TransitWorkspace mode={id==='transport'?'network':id}/>;
  if(id==='cinema')return <CinemaWorkspace preferredCity={city.name}/>;
  if(id==='films')return <FeedCards kind="filme"/>;
  if(id==='stories')return <StoriesWorkspace/>;
  if(id==='events')return <EventsWorkspace/>;
  if(id==='selection')return curated;
  if(id==='currency')return <MoneyWorkspace source={live.bnr}/>;
  if(id==='companies')return <CompanyView initialCui={geo.hasLocal?'':'427282'}/>;
  if(id==='compare')return <CompanyCompare/>;
  if(id==='calculator')return <EnergyCalculator/>;
  if(id==='lawyers')return <LawyersWorkspace/>;
  if(id==='legal')return <LegalWorkspace/>;
  if(['health','pharmacies','hospitals','schools'].includes(id))return <RecordBrowser kind={id}/>;
  if(id==='news')return <FeedCards kind={category}/>;
  return null;
 }
 return <Tabs className="domain-workspace" value={active} onValueChange={setActive}><TabsList className="domain-subcategories" aria-label="Subcategorii">{sections.map(s=><TabsTrigger key={s.id} value={s.id}>{s.label}</TabsTrigger>)}<TabsTrigger value="data"><Layers size={16}/>Date și documente publice</TabsTrigger></TabsList>{[...sections,{id:'data',label:'Date și documente publice'}].map(s=><TabsContent key={s.id} value={s.id}>{active===s.id&&content(s.id)}</TabsContent>)}</Tabs>;
}
