import type {Loader,Loaded} from './types';
import {uniqueRecords} from './records';
import {sourceText} from './text';
import {publicUrl} from './media';
import {fetchWithServerRetry,retryAfterSeconds} from '@/lib/http-retry.mjs';
export type SourceDiagnostic={url:string;category:'http'|'connection'|'tls'|'timeout'|'dns';httpStatus?:number;server?:string|null;rayId?:string|null;detail?:string;attempts?:number};
export class SourceError extends Error {constructor(message:string,public retryAfter=0,public diagnostic?:SourceDiagnostic){super(message)}}
export async function getSource(url:string,init?:RequestInit,options:{maxBytes?:number;timeoutMs?:number}={}){
 let r:Response;let attempts=0;let current=new URL(url);const first=current,deadlineAt=Date.now()+(options.timeoutMs||18000),timeout=AbortSignal.timeout(options.timeoutMs||18000),signal=init?.signal?AbortSignal.any([init.signal,timeout]):timeout;try{for(let hop=0;;hop++){r=await fetchWithServerRetry(current,{...init,headers:{'User-Agent':'Aflivra/1.0 public-data-source-check',Accept:'application/json, application/rss+xml, application/xml, text/xml, text/html;q=0.8',...init?.headers},signal,redirect:'manual'},{retryPost:true,deadlineAt,onAttempt:n=>{attempts=n}});if(![301,302,303,307,308].includes(r.status))break;const target=r.headers.get('location');if(!target||hop>=2)throw new SourceError('Redirecționarea sursei nu a putut fi rezolvată.');const next=new URL(target,current);if(next.hostname.replace(/^www\./,'')!==first.hostname.replace(/^www\./,'')||next.username||next.password||next.port!==first.port||first.protocol==='https:'&&next.protocol!=='https:')throw new SourceError('Sursa a mutat răspunsul către o adresă care trebuie verificată.');if(init?.method&&init.method!=='GET'&&![307,308].includes(r.status))throw new SourceError('Serviciul a mutat adresa de interogare; cererea nu a fost retransmisă automat.');current=next;}}catch(e){if(e instanceof SourceError)throw e;const code=String((e as any)?.cause?.code||(e as any)?.code||'');const message=String((e as any)?.message||'');if(/CERT|TLS|SSL/.test(code+' '+message))throw new SourceError('Conexiunea securizată a sursei nu poate fi validată. Păstrăm copia disponibilă.',0,{url:current.href,category:'tls',detail:code||message});if(/ENOTFOUND|EAI_AGAIN/.test(code))throw new SourceError('Adresa sursei nu a putut fi rezolvată prin DNS.',0,{url:current.href,category:'dns',detail:code});if(/Timeout|Abort/i.test(String((e as any)?.name)))throw new SourceError('Sursa nu a răspuns în timpul alocat.',0,{url:current.href,category:'timeout'});throw new SourceError('Conexiunea cu sursa nu a putut fi stabilită.',0,{url:current.href,category:'connection',detail:code||message});}
 if(!r.ok){const seconds=retryAfterSeconds(r.headers.get('retry-after'));try{await r.body?.cancel()}catch{}throw new SourceError(r.status===429?'Sursa a cerut o pauză (HTTP 429).':`Sursa a răspuns cu HTTP ${r.status}.`,Number.isFinite(seconds)?seconds:0,{url:current.href,category:'http',httpStatus:r.status,server:r.headers.get('server'),rayId:r.headers.get('cf-ray'),attempts})}
 const maximum=options.maxBytes||5_000_000;if(Number(r.headers.get('content-length'))>maximum)throw new SourceError('Răspuns prea mare pentru acest conector.');const reader=r.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let size=0,text='';try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maximum){await reader.cancel();throw new SourceError('Răspuns prea mare pentru acest conector.')}text+=decoder.decode(value,{stream:true})}return text+decoder.decode()}catch(e){if(e instanceof SourceError)throw e;throw new SourceError('Sursa nu a transmis răspunsul complet în timpul alocat.')}
}
const clean=sourceText;
const finite=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function parseBnr(text:string):Loaded{
 const cubes=[...text.matchAll(/<Cube\s+date=["'](\d{4}-\d{2}-\d{2})["'][^>]*>([\s\S]*?)<\/Cube>/g)];
 const days=cubes.map(m=>{const rates=[...m[2].matchAll(/<Rate\s+([^>]+)>([\d.]+)<\/Rate>/g)].map(x=>{const currency=x[1].match(/currency=["']([A-Z]{3})["']/)?.[1];const multiplier=x[1].match(/multiplier=["'](\d+)["']/)?.[1]||'1';if(!currency||!/^\d+\.\d{1,8}$/.test(x[2])||Number(x[2])<=0||Number(multiplier)<=0)throw new SourceError('Structura BNR este incompatibilă.');return {currency,value:x[2],multiplier}});if(rates.length<20||!rates.some(r=>r.currency==='EUR'))throw new SourceError('Lista BNR este incompletă.');return{date:m[1],rates}}).sort((a,b)=>a.date.localeCompare(b.date));
 if(!days.length)throw new SourceError('Nu am găsit o publicație BNR validă.');const latest=days[days.length-1];
 return {publishedAt:latest.date,data:{publishedAt:latest.date,sourceUrl:'https://curs.bnr.ro/nbrfxrates10days.xml',rates:latest.rates,history:days.map(d=>({date:d.date,...Object.fromEntries(d.rates.map(r=>[r.currency,Number(r.value)/Number(r.multiplier)]))}))}};
}
export function parseWeather(raw:string):Loaded{
 const d=JSON.parse(raw);if(d.success!==true||!Array.isArray(d.features)||!Number.isFinite(Date.parse(d.date)))throw new SourceError('Structura ANM este incompatibilă.');
 const stations=d.features.map((f:any)=>{const p=f.properties;if(!p||typeof p.nume!=='string')throw new SourceError('Lipsește numele stației ANM.');const temperature=finite(p.tempe);if(temperature!==null&&(temperature< -60||temperature>65))throw new SourceError('Temperatură ANM invalidă.');const coordinates=f.geometry?.coordinates;let lat=Array.isArray(coordinates)?finite(coordinates[1]):null,lon=Array.isArray(coordinates)?finite(coordinates[0]):null;if(lat!==null&&lon!==null&&(Math.abs(lat)>90||Math.abs(lon)>180)){lat=(2*Math.atan(Math.exp(lat/6378137))-Math.PI/2)*180/Math.PI;lon=lon/6378137*180/Math.PI}if(lat!==null&&lon!==null&&(lat<43||lat>49||lon<20||lon>31)){lat=null;lon=null}const available=(v:unknown)=>!v||v==='indisponibil'?null:clean(v);return{lat,lon,name:clean(p.nume),temperature,humidity:finite(p.umezeala),sky:available(p.nebulozitate),wind:available(p.vant),pressure:available(p.presiunetext),phenomena:available(p.fenomen_e),snow:available(p.zapada),waterTemperature:available(p.tempapa),observedAtText:clean(p.actualizat),details:p}});
 if(stations.length<10)throw new SourceError('Răspunsul ANM nu conține suficiente stații.');
 return{publishedAt:d.date,data:{observedAt:d.date,sourceUrl:'https://www.meteoromania.ro/wp-json/meteoapi/v2/starea-vremii',stations}};
}
export function parseBalance(raw:string,cui:string,year:number){
 const d=JSON.parse(raw);if(Number(d.cui)!==Number(cui)||Number(d.an)!==year||!Array.isArray(d.i)||!d.i.length)throw new SourceError(`Bilanțul ${year} nu este disponibil în răspuns.`);
 const indicators=d.i.map((i:any)=>{if(!/^I\d+$/.test(i.indicator)||finite(i.val_indicator)===null)throw new SourceError('Indicator financiar invalid.');return{code:i.indicator,value:Number(i.val_indicator),label:clean(i.val_den_indicator)}});
 // den_caen is a field the balance response itself publishes beside the CAEN code;
 // keeping it typed honors the source instead of dropping it at parse.
 return{year,name:clean(d.deni),caen:String(d.caen??''),caenLabel:clean(d.den_caen)||null,indicators:Object.fromEntries(indicators.map((i:any)=>[i.code,i.value])),entries:indicators,url:`https://webservicesp.anaf.ro/bilant?an=${year}&cui=${cui}`};
}
export function parseRegistry(raw:string,cui:string,day:string){
 const result=JSON.parse(raw);const rows=Array.isArray(result)?result:Array.isArray(result.found)?result.found:result.date_generale?[result]:[];const f=rows.find((f:any)=>Number(f.date_generale?.cui)===Number(cui));if(!f)return null;const g=f.date_generale;if(typeof g.denumire!=='string'||!g.denumire.trim())throw new SourceError('Identitatea fiscală este incompletă.');
 const bool=(v:unknown)=>typeof v==='boolean'?v:null;
 return{name:clean(g.denumire),address:clean(g.adresa)||null,registration:clean(g.nrRegCom)||null,currentCaen:clean(g.cod_CAEN)||null,vat:bool(f.inregistrare_scop_Tva?.scpTVA),vatFrom:clean(f.inregistrare_scop_Tva?.dataInceputScpTVA)||null,vatTo:clean(f.inregistrare_scop_Tva?.dataSfarsitScpTVA)||null,inactive:bool(f.stare_inactiv?.statusInactivi),queriedDate:day,phone:clean(g.telefon)||null,fax:clean(g.fax)||null,postalCode:clean(g.codPostal)||null,registrationState:clean(g.stare_inregistrare)||null,legalForm:clean(g.forma_juridica)||null,organizationForm:clean(g.forma_de_organizare)||null,taxAuthority:clean(g.organFiscalCompetent)||null,registrationDate:clean(g.data_inregistrare)||null,registryDetails:f};
}
// The registry CUI columns: every CNAS edition published today (clinici, farmacii, spitale —
// 31.03.2026) carries „Cod fiscal furnizor" with a plain numeric CUI (probe-pinned: the FARM
import {categoryQueries} from './catalog-categories';
export {categoryQueries} from './catalog-categories';
const safeUrl=(s:unknown)=>{try{const u=new URL(String(s));return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
export function parseCatalog(raw:string):Loaded{
 const d=JSON.parse(raw);if(d.success!==true||!Array.isArray(d.result?.results)||!Number.isInteger(d.result.count))throw new SourceError('Structura catalogului este incompatibilă.');
 const results=d.result.results.filter((r:any)=>r.private!==true).map((r:any)=>({id:String(r.id),name:clean(r.name),title:clean(r.title),organization:clean(r.organization?.title||r.organization?.name||'Editor neprecizat'),modified:r.metadata_modified||null,license:clean(r.license_title||'Licență neprecizată'),url:'https://data.gov.ro/dataset/'+encodeURIComponent(r.name||r.id),notes:clean(r.notes),resourceCount:Number(r.num_resources)||r.resources?.length||0,metadata:r,resources:(r.resources||[]).sort((a:any,b:any)=>String(b.last_modified||'').localeCompare(String(a.last_modified||''))).map((v:any)=>({...v,id:String(v.id||''),datastore_active:v.datastore_active===true,name:clean(v.name||v.id),format:clean(v.format||'fișier'),url:safeUrl(v.url),last_modified:v.last_modified||null}))}));
 const facet=(key:string)=>d.result.search_facets?.[key]?.items||[];
 return{publishedAt:results.map((r:any)=>r.modified).filter(Boolean).sort().at(-1)||null,data:{count:d.result.count,results:uniqueRecords<any>(results,r=>r.id),organizations:facet('organization'),formats:facet('res_format')}};
}
export const bnrLoader:Loader={key:'bnr',name:'Banca Națională a României',url:'https://curs.bnr.ro/nbrfxrates10days.xml',version:'bnr.xml.v1',ttl:900,load:async()=>parseBnr(await getSource('https://curs.bnr.ro/nbrfxrates10days.xml'))};
export const weatherLoader:Loader={key:'weather',name:'Administrația Națională de Meteorologie',url:'https://www.meteoromania.ro/wp-json/meteoapi/v2/starea-vremii',version:'anm.complete-detail.v3',ttl:600,load:async()=>parseWeather(await getSource('https://www.meteoromania.ro/wp-json/meteoapi/v2/starea-vremii'))};
 export const catalogLoader=(category='',q='',page=0,organization='',format=''):Loader=>{const query=[categoryQueries[category]?'('+categoryQueries[category]+')':'',q.trim()?'('+q.trim()+')':''].filter(Boolean).join(' AND ');const quoted=(v:string)=>'"'+v.replace(/["\\]/g,'')+'"';const fq=[organization?'organization:'+quoted(organization):'',format?'res_format:'+quoted(format):''].filter(Boolean).join(' AND ');const params=new URLSearchParams({q:query,rows:'24',start:String(page*24),sort:'metadata_modified desc', 'facet.field':JSON.stringify(['organization','res_format']),'facet.limit':'500',...(fq?{fq}:{})});const url='https://data.gov.ro/api/3/action/package_search?'+params;return{key:organization||format?'catalog:v3:'+JSON.stringify({category,q,page,organization,format}):'catalog:v2:'+category+':'+q+':'+page,name:'Catalogul național de date deschise',url,version:'ckan.all-datasets.v3',ttl:3600,load:async()=>parseCatalog(await getSource(url))}};
// The name→firm search. Probe-settled (2026-10-08): the official registries of names
// publish no server-side query — ONRC's OD_FIRME (693 MB) and MFP's identification
// exports (2×~435 MB) are integral files over every fetch cap, and mfinante's name
// lookup page is retired — so the one honest upstream is the open-knowledge registry
// the firm family already reads, searched through Wikidata's own indexed entity
// search and restricted to what the registry carries (a plain label-CONTAINS scan of
// every VAT holder exceeds the upstream time budget when the endpoint has not cached
// the query — probe-measured).
const nameSearchLimit=50,nameSearchNoCuiLimit=5;
// Căutarea pe nume citește registrul de cunoștințe în doi pași: căutarea de entități
// (wbsearchentities — întâi eticheta română, apoi cea engleză, îmbinate pe înregistrare;
// ordonarea rămâne a primei limbi) și fișa detaliată a entităților găsite (identificatorul
// TVA și site-urile, într-o singură interogare VALUES). Căutarea prin EntitySearch-ul
// SPARQL sărea firme de marcă găsite primele de API-ul direct (eMAG, Ursus — măsurat
// 2026-10-09). Entitatea găsită pe nume, dar fără identificator TVA citit în registru,
// rămâne listată cu marca onestă „fără CUI citit" — fără dosar inventat.
function companyNameSearchIds(raw:string){
 const order:string[]=[],seed=new Map<string,string>();
 let parsed:any;try{parsed=JSON.parse(raw)}catch{throw new SourceError('Structura Wikidata nu poate fi validată.')}
 const entries=Array.isArray(parsed?.search)?parsed.search:null;
 if(!entries)throw new SourceError('Structura Wikidata nu poate fi validată.')
 for(const entry of entries){
  const id=typeof entry?.id==='string'&&/^Q[1-9]\d{0,9}$/.test(entry.id)?entry.id:'';
  if(!id||order.includes(id))continue;
  order.push(id);seed.set(id,clean(entry.label)||'')
 }
 return {order,seed};
}
export function parseCompanyNameSearch(parts:{order:string[];seed:Map<string,string>}[],detail:string,term:string):Loaded{
 const order=parts.flatMap(part=>part.order).filter((id,index,all)=>all.indexOf(id)===index);
 const seed=new Map<string,string>();
 for(const part of parts)for(const [id,label] of part.seed)if(!seed.has(id))seed.set(id,label);
 const facts=new Map<string,{cui:string|null;vat:string|null;name:string;websites:string[]}>();
 if(order.length){
  let parsedDetail:any;try{parsedDetail=JSON.parse(detail)}catch{throw new SourceError('Structura Wikidata nu poate fi validată.')}
  const bindings=Array.isArray(parsedDetail?.results?.bindings)?parsedDetail.results.bindings:null;
  if(!bindings)throw new SourceError('Structura Wikidata nu poate fi validată.');
  for(const row of bindings){
   const id=row.item?.value?.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d{0,9})$/)?.[1];
   if(!id)continue;
   const vat=clean(row.vat?.value)||'';
   // Cheia de îmbinare rămâne identificatorul TVA validat ca pe dosarul firmei — lipsă,
   // rândul rămâne fără CUI (listat onest), nu eliminat: firma există în registrul de
   // cunoștințe, doar identificatorul fiscal lipsește de la sursă.
   const cui=/^[1-9]\d{1,9}$/.test(vat.replace(/^RO/i,''))?vat.replace(/^RO/i,''):null;
   const label=clean(row.itemLabel?.value);
   let record=facts.get(id);
   if(!record){record={cui,vat:cui?vat:null,name:label||'',websites:[]};facts.set(id,record)}
   else{if(!record.cui&&cui){record.cui=cui;record.vat=vat}if(label&&!record.name)record.name=label}
   const website=publicUrl(row.website?.value);
   if(website&&!record.websites.includes(website))record.websites.push(website)
  }
 }
 const all=order.slice(0,nameSearchLimit).map(id=>{const fact=facts.get(id),name=fact?.name||seed.get(id)||'';
  return name?{cui:fact?.cui??null,vat:fact?.vat??null,qid:id,name,websites:fact?.websites||[],sourceUrl:'https://www.wikidata.org/wiki/'+id}:null}).filter((item):item is NonNullable<typeof item>=>!!item);
 // Firmele cu CUI citit din registru se servesc toate — potriviri fiscale integrale.
 // Potrivirile fără CUI sunt majoritar zgomot de rang (specii, comune, asociații
 // omonime) și rămân listate doar în fruntea rangului sursei: primele 5, cu
 // nota „Se afișează primele potriviri" — nu inventăm CUI-uri și nu ascundem ce
 // există, doar mărginim ce se afișează.
 let withoutCui=0;
 const list=all.filter(item=>item.cui||withoutCui++<nameSearchNoCuiLimit);
 return{publishedAt:null,data:{query:term,items:list,count:list.length,limited:all.length>list.length||all.length>=nameSearchLimit}};
}
export const companyNameSearchLoader=(name:string):Loader=>{const term=name.trim(),quoted=term.replace(/["\\]/g,'');return{key:'company-name:'+term.toLowerCase(),name:'Wikidata · firme după nume',url:'https://www.wikidata.org/',version:'wikidata.company-name.v3',ttl:3600,load:async()=>{
 if(term.length<2||term.length>100||!quoted)throw new SourceError('Termenul de căutat nu are lungimea acceptată.');
 const search=(language:string)=>getSource('https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbsearchentities',search:term,language,limit:String(nameSearchLimit),type:'item',format:'json'}));
 // Structura primei etichete se validează fail-fast — un răspuns nevalid al registrului
 // se respinge înainte de a cheltui bugetul de acces al celei de-a doua etichete.
 const ro=companyNameSearchIds(await search('ro'));
 // Eticheta engleză e best-effort: dacă nu răspunde sau nu se poate citi, căutarea
 // servește tot potrivirile românești.
 let en={order:[] as string[],seed:new Map<string,string>()};
 try{en=companyNameSearchIds(await search('en'))}catch{}
 const parts=[ro,en],order=parts.flatMap(part=>part.order).filter((id,index,all)=>all.indexOf(id)===index);
 const query='SELECT ?item ?itemLabel ?vat ?website WHERE { VALUES ?item { '+order.slice(0,nameSearchLimit).map(id=>'wd:'+id).join(' ')+' } OPTIONAL { ?item wdt:P3608 ?vat. } OPTIONAL { ?item wdt:P856 ?website. } SERVICE wikibase:label { bd:serviceParam wikibase:language "ro,en". } }';
 const detail=order.length?await getSource('https://query.wikidata.org/sparql?'+new URLSearchParams({query,format:'json'}),{headers:{Accept:'application/sparql-results+json'}}):'{"results":{"bindings":[]}}';
 return parseCompanyNameSearch(parts,detail,term)}}};
