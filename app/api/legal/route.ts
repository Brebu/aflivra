import {readSource} from '@/lib/live/cache';
import {lawLoader,courtLoader,expandLawText,storedLawRecord,validCourtInstitution,courtInstitution} from '@/lib/live/legal';
import {resolveLawSelection} from '@/lib/live/legal-selection';
import {legalToday,verifiedConsolidation} from '@/lib/live/legal-consolidation';
import {rememberLaw,trackedLaws} from '@/lib/live/legal-registry';
import {portalRetryAt} from '@/lib/live/legal-portal';
import institutions from '@/public/courts/institutions.json';
import {readGeographicContext,classifyGeography,matchesGeography} from '@/lib/geographic-scope';
import {courtSearchPlan,normalizeCourtNumber} from '@/lib/court-query';
import {buildCourtHistories} from '@/lib/court-history';
import {courtReferences} from '@/lib/live/court-references';
export const dynamic='force-dynamic';
export async function GET(request:Request){const cursor=new URL(request.url).searchParams.get('cursor')||'';if(cursor&&!/^[a-f0-9]{64}$/.test(cursor))return Response.json({error:'Cursor invalid.'},{status:400});try{return Response.json({...await trackedLaws(cursor),portalNextAttemptAt:await portalRetryAt()},{headers:{'Cache-Control':'no-store'}})}catch(e){console.warn(JSON.stringify({event:'legal_registry_read_failure',message:e instanceof Error?e.message:'Unknown error'}));return Response.json({error:'Lista actelor de reverificat nu este disponibilă acum.'},{status:503,headers:{'Cache-Control':'no-store'}})}}
export async function POST(request:Request){
 let p:any;try{if(Number(request.headers.get('content-length')||0)>4096)throw Error();const raw=await request.text();if(raw.length>4096)throw Error();p=JSON.parse(raw)}catch{return Response.json({error:'Interogare invalidă.'},{status:400})}
 if(typeof p!=='object'||p===null||Array.isArray(p))return Response.json({error:'Interogare invalidă.'},{status:400});
 const headers={'Cache-Control':'no-store'};
 if(p.kind==='court'){const input={number:normalizeCourtNumber(String(p.number||'')),name:String(p.name||'').trim(),subject:String(p.subject||'').trim(),institution:courtInstitution(String(p.institution||'')),from:String(p.from||''),to:String(p.to||'')};
  if(p.numberScope!==undefined&&!['all','filtered'].includes(p.numberScope))return Response.json({error:'Mod de căutare invalid.'},{status:400});
  const {query,followsNumber}=courtSearchPlan(input,p.numberScope||'all');
  const dateValid=(v:string)=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if((p.institution||'').trim()&&!input.institution)return Response.json({error:'Alege o instanță din registrul instanțelor — denumirea sau id-ul din registrul național.'},{status:400});
   if(query.number&&!/^\d{1,8}\/\d{1,5}\/\d{4}(?:\/[a-zA-Z0-9.]{1,20})?$/.test(query.number)||query.name&&query.name.length<3||query.name.length>160||query.subject.length>200||!dateValid(query.from)||!dateValid(query.to)||query.from&&query.to&&query.from>query.to||!query.number&&!query.name&&!query.subject)return Response.json({error:'Introdu numărul dosarului, numele părții (minimum 3 caractere) sau obiectul și verifică intervalul.'},{status:400});
  const context=readGeographicContext(new URLSearchParams([['geoScope',String(p.geoScope||'')],['locality',String(p.locality||'')],['county',String(p.county||'')],['lat',String(p.lat||'')],['lon',String(p.lon||'')]].filter(([,v])=>v!=='')));
  if(!context||!followsNumber&&context.active&&!institutions.items.some(c=>c.id===query.institution&&matchesGeography(classifyGeography({title:c.label+' '+c.id.replace(/([a-z])([A-Z])/g,'$1 $2')}),context)))return Response.json({error:'Alege o instanță din zona activă sau selectează Toată România.'},{status:400});
  const state=await readSource(courtLoader(query));
  const items=state.data?(!followsNumber&&context.active?state.data.items.filter((r:any)=>r.court===query.institution):state.data.items):[];
  const linked=await courtReferences(items,query.number,state.lastSuccessAt||'');
  const caseHistories=buildCourtHistories(items,linked.references,query.number);
  // Reference-only evidence remains visible even if the case service is down.
  // It never changes the service status or invents a missing record/hearing.
  if(state.data||caseHistories.length)state.data={...state.data,items,caseHistories,referenceLookupAvailable:linked.lookupAvailable,hearingCount:items.reduce((total:number,item:any)=>total+(item.hearings?.length||0),0),searchScope:followsNumber?'number-all-courts':'filters'};
  return Response.json(state,{headers});}

 if(p.kind!=='law')return Response.json({error:'Tip necunoscut.'},{status:400});
 const title=String(p.title||'').trim(),text=String(p.text||'').trim(),number=String(p.number||'').trim(),year=String(p.year||'').trim(),page=Number(p.page||0);
 if(title.length>160||text.length>160||number&&!/^\d{1,8}$/.test(number)||year&&!/^(?:18|19|20)\d{2}$/.test(year)||!Number.isInteger(page)||page<0||page>500||!title&&!text&&!number)return Response.json({error:'Completează titlul, cuvintele din text sau numărul actului.'},{status:400});
 const exactTitle=String(p.exactTitle||'').trim();if(exactTitle.length>1200)return Response.json({error:'Titlul actului este prea lung.'},{status:400});const query={title:p.full===true&&exactTitle?exactTitle.replace(/^\s*\uFEFF?/,'').split(/\s+(?:\(|EMITENT|PUBLICAT)/)[0].trim():title,text:p.full===true?'':text,number:p.full===true?'':number,year:p.full===true?'':year,page:p.full===true?0:page,full:p.full===true,...(p.full===true?{selectedId:String(p.id||'').slice(0,1200),exactTitle,selectedType:String(p.selectedType||'').slice(0,80),selectedNumber:String(p.selectedNumber||'').slice(0,20),selectedDate:String(p.selectedDate||'').slice(0,40)}:{})};if(query.full)try{await rememberLaw({id:query.selectedId,title:query.exactTitle||query.title,type:query.selectedType,number:query.selectedNumber,date:query.selectedDate})}catch(e){console.warn(JSON.stringify({event:'legal_registry_write_failure',message:e instanceof Error?e.message:'Unknown error'}))}const stored=query.full?await storedLawRecord(query.selectedId||''):null;let source=stored?.status==='cached'?stored:await readSource(lawLoader(query),{waitForRefresh:query.full});if(query.full&&!source.data&&stored)source={...stored,status:'stale',lastAttemptAt:source.lastAttemptAt,nextAttemptAt:source.nextAttemptAt,error:source.error||'Este disponibilă ultima formă consolidată verificată.'};if(query.full)try{source=await expandLawText(source)}catch(e){return Response.json({...source,status:'unavailable',data:null,error:e instanceof Error?e.message:'Textul nu poate fi citit acum.'},{headers})}
 if(query.full&&p.summary===true)source={...source,portalNextAttemptAt:await portalRetryAt()};
 if(query.full&&source.data?.items){const selected=resolveLawSelection(source.data.items,{id:p.id,title:p.exactTitle,type:p.selectedType,number:p.selectedNumber,date:p.selectedDate});const chosen=selected&&verifiedConsolidation(selected)&&selected.consolidation.asOf<=legalToday()?selected:null;return Response.json({...source,status:chosen?(chosen.consolidation.asOf===legalToday()?source.status:'stale'):'unavailable',data:chosen?{items:[p.summary===true?{id:chosen.id,title:chosen.title,consolidation:chosen.consolidation,characters:chosen.text?.length||0}:chosen],hasMore:false}:null,error:chosen?source.error:source.error||'Forma actuală a actului ales nu a putut fi verificată integral. Reîncearcă preluarea.'},{headers})}
 return Response.json(source,{headers});
}
