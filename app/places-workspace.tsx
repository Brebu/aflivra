'use client';
import {SearchForm} from './search-form';
import {useLocationState} from './location-scope';
import {SelectField} from './select-field';
import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {Search,MapPin,Phone,Mail,Globe,Clock,ArrowDownAZ,RefreshCw,Download,Map as MapIcon,LocateFixed,Image as ImageIcon} from 'lucide-react';
import {Input} from '@/components/ui/input';import {Button} from '@/components/ui/button';
import {useLocation,distanceKm,LocationControl,LocationCityPicker} from './location';import {Pagination} from './pagination';
import {snapshotJson} from './snapshot-store';import {MetadataFields} from './metadata-fields';import {ContactsPanel} from './contacts-panel';
import {PublicMediaGallery} from './public-media';import {recordMedia,publicUrl,publicImageUrl} from '@/lib/live/media';
import {publicContacts} from '@/lib/live/contacts';import {countNoun,countText,normalizeSearch,paginate} from '@/lib/live/query';
import {placeFacts,readableHours,type PlaceIndex} from '@/lib/places-view';import {sourceText} from '@/lib/live/text';
import {format,cityPositions} from './v2-model';import {dateText} from './live-data';import {ExportActions} from './export-actions';
import {PublicMap} from './public-map';import illustrations from '@/public/media/category-illustrations.json';
import type {PlacesManifest as Manifest} from '@/lib/places-query';import {useSource} from './use-source';
type City={name:string;lat:number;lon:number;type:string;county:string};
/* Inventarul de locuri se citește o dată pe sesiune: fiecare montare a spațiului de
   locuri și fiecare fișă deschisă refolosesc aceeași promisiune, în loc să re-descarce
   și re-analizeze același manifest la fiecare schimbare de perspectivă. */
let placesManifestSession:Promise<Manifest>|null=null;
function loadPlacesManifest():Promise<Manifest>{
 placesManifestSession??=snapshotJson<Manifest>('/places/manifest.json').then(m=>{if(m.schema!=='aflivra-places-v2')throw Error('Inventarul locurilor nu are formatul așteptat.');return m}).catch(e=>{placesManifestSession=null;throw e});
 return placesManifestSession;
}
const names:Record<string,string>={local:'Servicii și locuri din localitate',sanatate:'Spitale, clinici și farmacii',cultura:'Muzee, teatre și obiective de vizitat',filme:'Cinematografe',educatie:'Școli și locuri de învățare',bani:'Bănci, bancomate și schimb valutar',firme:'Magazine, birouri și servicii',transport:'Stații, gări și servicii de transport',justitie:'Instanțe și servicii juridice',munca:'Ocupare și recrutare',mediu:'Natură și locuri în aer liber',energie:'Încărcare și infrastructură energetică',agricultura:'Piețe, ferme și servicii agricole',stiri:'Redacții și instituții media'};
const categoryDescriptions:Record<string,string>={sanatate:'Găsește unitatea, adresa, contactele, programul publicat și specialitățile disponibile în surse.',cultura:'Explorează toate locurile din copia națională, cu program, contacte, acces și materialele publicate.',local:'Administrație, servicii medicale, școli, transport, cultură și servicii utile în jurul localității alese.'};
// External Wikidata references are built from the exact Q-ids published in the record's
// OSM tags — a link-out only: the app never calls Wikidata at runtime, and a value that
// is not an exact Q-id (multi-valued, malformed) stays inside the raw disclosure only.
const wikidataTagLabels:[string,string][]=[['wikidata','Fișa locului pe Wikidata'],['brand:wikidata','Fișa brandului pe Wikidata'],['operator:wikidata','Fișa operatorului pe Wikidata'],['network:wikidata','Fișa rețelei pe Wikidata']];
const wikidataLinks=(tags:Record<string,string>)=>wikidataTagLabels.map(([tag,label])=>{const qid=String(tags[tag]||'');return /^Q[1-9]\d{0,9}$/.test(qid)?{tag,label,qid,url:'https://www.wikidata.org/wiki/'+qid}:null}).filter((x):x is {tag:string;label:string;qid:string;url:string}=>!!x);
function EntityDetail({entry,manifest,category}:{entry:PlaceIndex;manifest:Manifest;category:string}){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[map,setMap]=useState(false);
 useEffect(()=>{const c=new AbortController();setError('');snapshotJson('/places/records/'+entry.chunk+'.json',manifest.chunks[entry.chunk],c.signal).then(d=>{const item=d.items.find((r:any)=>r.id===entry.id);if(!item)throw Error('Fișa nu a fost găsită în copia verificată.');setData(item)}).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>c.abort()},[entry.id,entry.chunk,manifest,revision]);
 const facts=data?placeFacts(data.tags,category):[],wikiLinks=data?wikidataLinks(data.tags):[];
 return <div className="entity-expanded">{error&&<div className="live-error"><p>{error}</p><Button variant="outline" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={16}/>Reîncearcă</Button></div>}{!data&&!error&&<p role="status">Se încarcă fișa integrală…</p>}{data&&<>
  <ContactsPanel data={data.tags} title="Contactele publicate pentru acest loc"/>{data.tags.opening_hours&&<p>Program publicat: {readableHours(data.tags.opening_hours)}</p>}{data.tags.description&&<p className="entity-description">{sourceText(data.tags.description)}</p>}
  <PublicMediaGallery items={recordMedia(data.tags,data.sourceUrl)} title={entry.name}/>
   {facts.length>0&&<dl className="entity-facts">{facts.map(f=><div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
   {wikiLinks.length>0&&<div className="reader-links wikidata-links" data-testid="wikidata-links"><span className="small-muted">Referințe externe, construite din identificatorii exacți (Q…) publicați în sursă:</span>{wikiLinks.map(l=><a key={l.tag} href={l.url} target="_blank" rel="noreferrer">{l.label} · {l.qid}</a>)}<p className="small-muted">Legăturile se deschid la Wikidata, în afara aplicației; aplicația nu interoghează Wikidata.</p></div>}
  <div className="entity-detail-actions"><Button variant="outline" onClick={()=>setMap(v=>!v)} aria-expanded={map}><MapIcon size={17}/>{map?'Închide harta':'Vezi pe hartă aici'}</Button><ExportActions input={{title:entry.name,data,subtitle:entry.sourceUrl}} label="Descarcă fișa completă"/></div>
  {map&&<PublicMap points={[{id:entry.id,name:entry.name,lat:entry.lat,lon:entry.lon,description:entry.address}]} viewKey={entry.id}/>}
  {data.locationApproximate&&<p className="small-muted">Poziție aproximativă calculată din conturul cartografiat. Nu indică neapărat intrarea.</p>}
  {data.relatedSources?.length>0&&<details className="reader-provenance"><summary>Date reunite pentru același loc</summary><p>Au fost reunite numai fișe cu același nume, adresă sau contact și poziții apropiate.</p>{data.relatedSources.map((r:any)=><div key={r.id}><ContactsPanel data={r} title="Contacte din fișa asociată"/><MetadataFields data={r.tags} title="Câmpurile sursei asociate"/><a href={r.sourceUrl} target="_blank" rel="noreferrer">Locul pe harta sursei</a></div>)}</details>}
  <details className="reader-provenance"><summary>Surse, data și toate informațiile publicate</summary><p>© OpenStreetMap contributors · date comunitare. Ultima modificare a fișei: {dateText(data.updatedAt||entry.updatedAt)}. Extract verificat: {dateText(manifest.fetchedAt)}.</p><a href={entry.sourceUrl} target="_blank" rel="noreferrer">Fișa exactă a locului pe hartă</a><MetadataFields data={data.tags} title="Toate câmpurile originale ale locului"/></details>
 </>}</div>;
}
const EntityCard=memo(function EntityCard({entry,category,manifest,distance}:{entry:PlaceIndex;category:string;manifest:Manifest;distance:number|null}){
 const [open,setOpen]=useState(false),[failed,setFailed]=useState(false);const art=illustrations.find(x=>x.id===category)||illustrations[0];
 const image=publicImageUrl(entry.image),contacts=publicContacts(entry),subtypes=entry.types.filter(x=>category==='local'||x.category===category).map(x=>x.label);
 return <article className={'entity-card entity-model-'+category}>
  <figure className="entity-card-image"><img src={image&&!failed?image:'/media/'+art.file} alt={image&&!failed?entry.name:art.caption} loading="lazy" width={720} height={420} onError={()=>setFailed(true)}/>{(!image||failed)&&<figcaption>{image&&failed?"Fotografia nu s-a încărcat · ilustrație AI":"Ilustrație reprezentativă · AI"}</figcaption>}</figure>
  <div className="entity-card-content">{entry.image&&!image&&publicUrl(entry.image)&&<a className="text-link" href={publicUrl(entry.image)!} target="_blank" rel="noreferrer">Galeria foto indicată de sursă</a>}<span className="kicker">{[...new Set(subtypes)].join(' · ')}</span><h3>{sourceText(entry.name)}</h3>
  {distance!==null&&<span className="distance-label"><MapPin size={15}/>{format(distance,1)} km · în linie dreaptă</span>}
  <div className="entity-essentials">{entry.address?<p><MapPin size={18}/><span>{entry.address}</span></p>:<p className="small-muted"><MapPin size={18}/><span>Adresa nu este publicată. Poziția este disponibilă pe hartă.</span></p>}{entry.openingHours&&<p><Clock size={18}/><span>{readableHours(entry.openingHours)}</span></p>}
  {contacts.filter(x=>x.kind!=='address').map(c=>{const Icon=c.kind==='phone'?Phone:c.kind==='email'?Mail:Globe;return <a key={c.kind+c.value} href={c.href} {...(c.kind==='website'?{target:'_blank',rel:'noreferrer'}:{})}><Icon size={18}/><span>{c.value}</span></a>})}</div>
  {entry.openingHours&&<p className="small-muted">Program publicat în hartă; poate necesita confirmare la unitate.</p>}
  <Button className="entity-open" variant="outline" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls={'entity-'+entry.id}>{open?'Închide fișa':'Toate informațiile și harta'}</Button>
  {open&&<div id={'entity-'+entry.id}><EntityDetail entry={entry} manifest={manifest} category={category}/></div>}
 </div></article>;
});
function ImportedPlaceRecord({entry,category}:{entry:PlaceIndex;category:string}){
  const [manifest,setManifest]=useState<Manifest|null>(null),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();loadPlacesManifest().then(m=>{if(!c.signal.aborted)setManifest(m)}).catch(e=>{if(e.name!=='AbortError'&&!c.signal.aborted)setError(e.message)});return()=>c.abort()},[]);
 return error?<p role="status">{error}</p>:manifest?<EntityDetail entry={entry} manifest={manifest} category={category}/>:<p role="status">Se încarcă informațiile locului…</p>;
}
export function PlaceSourceDetails({id,chunk,category,name,lat,lon,sourceUrl}:{id:string;chunk:string;category:string;name:string;lat:number;lon:number;sourceUrl:string}){
 const [open,setOpen]=useState(false);
 const entry:PlaceIndex={id,chunk,name,lat,lon,sourceUrl,categories:[category],types:[],address:'',city:'',phone:'',email:'',website:'',openingHours:'',updatedAt:'',search:''};
 return <details className="place-source-details" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Fișa completă, contactele și harta din sursă</summary>{open&&<ImportedPlaceRecord entry={entry} category={category}/>}</details>;
}
export function PlacesWorkspace({category,preferredCity='București',photosDefault=false,initialQuery='',initialSub=''}:{category:string;preferredCity?:string;photosDefault?:boolean;initialQuery?:string;initialSub?:string}){
 const geo=useLocation();const [manifest,setManifest]=useState<Manifest|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const [resetKey,setResetKey]=useState(0),[draft,setDraft]=useState(initialQuery),[q,setQ]=useState(initialQuery),[sub,setSub]=useState(initialSub),[scope,setScope]=useLocationState('context'),[photos,setPhotos]=useState(photosDefault),[radius,setRadius]=useLocationState('15'),[sort,setSort]=useState('context'),[contact,setContact]=useState(''),[page,setPage]=useLocationState(0),[view,setView]=useState('cards'),[mapCenter,setMapCenter]=useLocationState<{lat:number;lon:number}|null>(null);const section=useRef<HTMLElement>(null);
  useEffect(()=>{const c=new AbortController();setLoading(true);setError('');loadPlacesManifest().then(m=>{if(!c.signal.aborted)setManifest(m)}).catch(e=>{if(e.name!=='AbortError'&&!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[revision]);
 useEffect(()=>{setSub('');setPage(0)},[category]);
 useEffect(()=>setPage(0),[geo.key]);
 useEffect(()=>{setDraft(initialQuery);setQ(initialQuery);setSub(initialSub);setPage(0)},[initialQuery,initialSub]);
  const center=geo.center,activeScope=scope==='context'?(geo.hasLocal?'nearby':'all'):scope,activeSort=sort==='context'?(geo.hasLocal?'distance':'name'):sort;
  const categoryKey=category==='local'?'local-all':category,labels=manifest?.subcategories[categoryKey]||[];
  // The nearby map layer serves the pin set of the selected radius around the map's own
  // center — the whole in-radius selection, with no page-size cap; the card lists keep
  // their honest 18-per-page inventory. The national map sample keeps its own bounded request.
  const pinsView=view==='map'&&activeScope==='nearby',pinCenter=mapCenter??center;
  const state=useSource(manifest&&(activeScope==='all'||center)?'/api/places?'+new URLSearchParams(pinsView?{category,q,sub,contact,scope:'nearby',radius,sort:activeSort,photos:String(photos),view:'map',...(pinCenter?{lat:pinCenter.lat.toFixed(3),lon:pinCenter.lon.toFixed(3)}:{})}:{category,q,sub,contact,scope:activeScope,radius,sort:activeSort,photos:String(photos),page:String(page),...(view==='map'?{pageSize:'200'}:{}),...(center?{lat:center.lat.toFixed(3),lon:center.lon.toFixed(3)}:{})}):null);
  const result=state.data?.data||{items:[],total:0,page:0,pages:1};const resetPage=()=>setPage(0),busy=loading||state.busy;
  const setMapCenterFromMap=(c:{lat:number;lon:number})=>{const next={lat:Number(c.lat.toFixed(3)),lon:Number(c.lon.toFixed(3))};setMapCenter(old=>old&&old.lat===next.lat&&old.lon===next.lon?old:next)};


 return <section className="live-section places-workspace" ref={section}>
  <div className="panel-top"><div><span className="kicker">LOCURI ȘI SERVICII · ROMÂNIA</span><h2>{names[category]||'Locuri și servicii'}</h2><p>{categoryDescriptions[category]||'Toate locurile din copia națională a acestei categorii, cu fișe complete și contacte publicate.'}</p></div><MapPin size={30}/></div>
  <SearchForm resetKey={resetKey} className="live-search" value={draft} onSearch={value=>{setDraft(value);setQ(value);resetPage()}} inputProps={{"maxLength":200,"aria-label":"Caută locuri, servicii, adrese și contacte","placeholder":"Nume, serviciu, adresă, telefon, e-mail…"}}/>
  <div className="entity-filters"><label><span className="control-label">Subcategorie</span><SelectField value={sub} onChange={e=>{setSub(e.target.value);resetPage()}}><option value="">Toate subcategoriile</option>{labels.map(s=><option key={s}>{s}</option>)}</SelectField></label><label><span className="control-label">Unde cauți</span><SelectField value={scope} onChange={e=>{setScope(e.target.value);resetPage()}}><option value="context">{geo.hasLocal?geo.label:"Toată România · implicit"}</option><option value="all">Toată România</option><option value="nearby">În apropierea localității / poziției</option></SelectField></label><label><span className="control-label"><ArrowDownAZ size={16}/>Ordonare</span><SelectField value={sort} onChange={e=>{setSort(e.target.value);resetPage()}}><option value="context">{geo.hasLocal?"Apropiere · automat":"Nume A–Z · automat"}</option><option value="name">Nume A–Z</option><option value="distance" disabled={!center}>Distanță</option><option value="recent">Ultima modificare în sursă</option></SelectField></label><label><span className="control-label">Imagini</span><SelectField value={photos?"photos":"all"} onChange={e=>{setPhotos(e.target.value==="photos");resetPage()}}><option value="all">Toate obiectivele</option><option value="photos">Cu fotografii publicate</option></SelectField></label><label><span className="control-label">Contact disponibil</span><SelectField value={contact} onChange={e=>{setContact(e.target.value);resetPage()}}><option value="">Toate locurile</option><option value="phone">Cu telefon</option><option value="email">Cu e-mail</option><option value="website">Cu website</option><option value="address">Cu adresă</option><option value="openingHours">Cu program</option></SelectField></label></div>
  {activeScope==='nearby'&&<div className="entity-location"><LocationCityPicker/><label><span className="control-label">Rază</span><SelectField value={radius} onChange={e=>{setRadius(e.target.value);resetPage()}}>{[2,5,10,15,30,50,100].map(n=><option key={n} value={n}>{n} km</option>)}</SelectField></label><LocationControl compact/></div>}
  <p className="field-help">{activeScope==='nearby'?(pinsView?`Pinurile hărții acoperă toată raza de ${radius} km în jurul centrului hărții. Muta harta în altă zonă — pinurile se reîncarcă pentru zona din centru. Distanțele sunt în linie dreaptă.`:`Rezultate în raza de ${radius} km de ${geo.position?'poziția dispozitivului':geo.city.name}. Distanțele sunt în linie dreaptă.`):'Inventarul complet din România, afișat pe pagini.'}{photos?' Sunt selectate fișele care au o fotografie publicată în sursă.':''}</p>
  {loading&&<p role="status">Se încarcă inventarul național…</p>}{error&&<div className="live-error"><p>{error}</p><Button variant="outline" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={16}/>Reîncearcă</Button></div>}
  {state.busy&&<p role="status">Se încarcă rezultatele…</p>}{state.error&&<div className="live-error"><p>{state.error}</p><Button variant="outline" onClick={state.retry}>Reîncearcă</Button></div>}{manifest&&<><div className="entity-results-header"><p><strong>{format(result.total)}</strong> {countNoun(result.total,'rezultat','rezultate')}{activeScope==='nearby'?' în raza de '+radius+' km':''} · {countText(manifest.categories[categoryKey]||0,'loc în categoria națională','locuri în categoria națională')}</p><div className="chip-row"><button onClick={()=>setView('cards')} aria-pressed={view==='cards'} className={view==='cards'?'selected':''}>Fișe</button><button onClick={()=>setView('map')} aria-pressed={view==='map'} className={view==='map'?'selected':''}><MapIcon size={16}/>Harta paginii</button><button onClick={()=>{setResetKey(n=>n+1);setDraft('');setQ('');setSub('');setContact('');setPhotos(false);setScope('all');setPage(0);setMapCenter(null)}}>Resetează filtrele</button></div></div>
    {view==='map'&&<PublicMap points={result.items.map((r:PlaceIndex & {distance?:number})=>({id:r.id,name:r.name,lat:r.lat,lon:r.lon,description:r.address}))} ownPosition={geo.position} viewKey={category+sub+q+result.page+activeScope+radius+geo.key} onViewportSettle={pinsView?setMapCenterFromMap:undefined} />}
   {!pinsView&&<div className="entity-card-grid">{result.items.map((r:PlaceIndex & {distance?:number})=><EntityCard key={r.id} entry={r} category={category==='local'?(r.categories[0]||'local'):category} manifest={manifest} distance={activeScope==='nearby'||activeSort==='distance'?(r.distance??null):null}/>)}</div>}
   {!result.items.length&&!busy&&!state.error&&<div className="live-empty"><p>Nu sunt rezultate pentru aceste filtre. Poți mări raza sau căuta în toată România.</p><Button variant="outline" onClick={()=>{setResetKey(n=>n+1);setDraft('');setQ('');setPhotos(false);setScope('all');setSub('');setContact('');setPage(0);setMapCenter(null)}}>Toate obiectivele din România</Button></div>}
   {!pinsView&&<Pagination page={result.page} pages={result.pages} total={result.total} busy={busy} onPage={p=>{setPage(p);section.current?.scrollIntoView({behavior:'smooth',block:'start'})}}/>}
   <details className="reader-provenance"><summary>Acoperire, actualizare și surse</summary><p>{manifest.note}</p><p>{countText(manifest.count,'loc reunit din extractul național','locuri reunite din extractul național')}. Data extractului: {dateText(manifest.dataAsOf)} · ultima preluare validă: {dateText(manifest.fetchedAt)}.</p><p>Lista cuprinde toate înregistrările importate pentru subcategoriile de mai sus. O unitate nemapată sau fără contacte nu este completată prin presupuneri.</p><a href={manifest.sourceUrl} target="_blank" rel="noreferrer">Extractul național al sursei</a> · <a href={manifest.licenseUrl} target="_blank" rel="noreferrer">{manifest.attribution} · ODbL 1.0</a></details>
  </>}
 </section>;
}
