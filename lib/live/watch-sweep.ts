import {env} from 'cloudflare:workers';
import {createHash} from 'node:crypto';
import sweepGroupsMap from './refresh-groups.json';
import {readSource} from './cache';
import {feedLoader} from './feeds';
import {alertsLoader} from './weather';
import {eventsLoader,eventVenues} from './events';
import {companyLoader} from './company-registries';
import {lawLoader,courtLoader} from './legal';
import {localityName,countyName,countyCode,sameLocality,classifyGeography,countyLookup} from '../geographic-scope';
import {normalizeCourtNumber} from '../court-query';
import {canonicalUrl} from './records';
import {sendPush,vapidPublicKey} from './web-push';
import type {PushPayload} from './web-push';

// Tura „Urmărește”: fiecare fel de urmărire își detectează schimbările reîmprospătând exact
// familiile existente (fluxuri, ANM, ANAF, portalul instanțelor, Portal Legislativ, calendarele
// instituțiilor), iar dosarele — singurele fără cache util între ture — se reverifică mărginit.
// Declanșătorul registers e orar: tura de registre și tura de urmărire călătoresc împreună —
// notificările „Urmăritelor” ajung la cel mult o oră de la schimbare, iar membrii cu TTL de
// zi se sar onest la fiecare tick (ritmul rămâne al TTL-ului, nu al ticăitului).
// grupului registers, cu dispatch pe oră (00 UTC = tura registers, celelalte ore = urmărire).
export const WATCH_KINDS=['dosar','firma','localitate','act','venue','meteo'] as const;
export type WatchKind=(typeof WATCH_KINDS)[number];
const groupList=(sweepGroupsMap as {groups:{name:string;cron:string}[]}).groups;
const registersGroup=groupList.find(group=>group.name==='registers');
if(!registersGroup)throw Error('Grupul registers lipsește din registrul de ture — declanșătorul urmăririi nu poate fi rezolvat.');
const cronParts=registersGroup.cron.split(/\s+/);
if(cronParts.length!==5||cronParts[0]!=='28'||cronParts[1]!=='*'||cronParts[2]!=='*'||cronParts[3]!=='*'||cronParts[4]!=='*')
  throw Error('Cronul registers trebuie să fie orar la minutul 28 („28 * * * *”) — tura de registre și tura de urmărire călătoresc împreună, orar, cu notificările „Urmăritelor” la cel mult o oră de la schimbare.');
export const WATCH_SWEEP_CRON=registersGroup.cron;
export const WATCH_SWEEP_HOURS=[...Array(24).keys()];
export const watchSweepSchedule=()=>({runsPerDay:24,timesUtc:'oră: 00:28–23:28 UTC'});
export const runsWatchSweep=(controller:{cron:string;scheduledTime:number|Date})=>controller.cron===WATCH_SWEEP_CRON;

const INSTALL_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validInstallId=(value:unknown):value is string=>typeof value==='string'&&INSTALL_PATTERN.test(value);
export const WATCH_LIMIT=100,EVENT_PAGE=50,ACK_LIMIT=200,SUBSCRIPTION_LIMIT=5;
// Retenția politicii de confidentialitate, ca numere unice în cod: o urmărire fără
// nicio interacțiune de la WATCH_INACTIVE_DAYS și un eveniment de la EVENT_RETENTION_DAYS
// se elimină la tura de verificare. Politica de pe /confidentialitate le citește pe acestea.
export const WATCH_INACTIVE_DAYS=180,EVENT_RETENTION_DAYS=365;
const DOSAR_CHECK_CAP=20,ACT_CHECK_CAP=8,FIRMA_CHECK_CAP=6,VENUE_CHECK_CAP=6,METEO_EVENT_CAP=6,FEED_EVENT_CAP=8,VENUE_EVENT_CAP=8;
const DETECTION_FETCH_BUDGET=25,PUSH_SEND_BUDGET=15;
const FEED_KINDS=['stiri','munca','sanatate','educatie','justitie'];
const COURT_NUMBER_PATTERN=/^\d{1,8}\/\d{1,5}\/\d{4}(\/[a-zA-Z0-9.]{1,20})?$/;
const ACT_REF_PATTERN=/^law-[0-9a-f]{64}$/;
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
const fingerprintOf=(value:unknown)=>sha256(JSON.stringify(value));
const validActRef=(ref:string)=>{if(ACT_REF_PATTERN.test(ref))return true;try{const url=new URL(ref);return url.protocol==='https:'&&url.hostname==='legislatie.just.ro'&&/^\/Public\/(DetaliiDocument(?:Afis)?\/\d+|FormaPrintabila\/[^/?#]+)$/.test(url.pathname)}catch{return false}};
/** Validarea referinței la graniță, per fel de urmărire; null = formă acceptată. */
export function watchRefError(kind:string,ref:unknown):string|null{
  if(!WATCH_KINDS.includes(kind as WatchKind))return 'Tipul de urmărire trebuie să fie unul din: '+WATCH_KINDS.join(', ')+'.';
  const value=typeof ref==='string'?ref.trim():'';
  if(!value||value.length>400)return 'Referința urmăririi lipsește sau depășește lungimea permisă.';
  if(kind==='dosar'&&!COURT_NUMBER_PATTERN.test(normalizeCourtNumber(value)))return 'Numărul de dosar nu este valid (formă așteptată: 123/45/2026).';
  if(kind==='firma'&&!/^[1-9]\d{1,9}$/.test(value))return 'CUI-ul firmei nu este valid.';
  if(kind==='localitate'&&!Object.hasOwn(countyLookup.items,localityName(value)))return 'Localitatea nu este în registrul național.';
  if(kind==='act'&&!validActRef(value))return 'Identificatorul actului normativ nu este valid.';
  if(kind==='venue'&&!eventVenues.some(venue=>venue.id===value))return 'Instituția nu este în registrul calendarelor publice validate.';
  if(kind==='meteo'&&countyCode(value)==='')return 'Județul nu este în registrul național.';
  return null;
}
export type WatchRow={id:string;install_id:string;kind:WatchKind;ref:string;label:string|null;created_at:string;muted:number;checked_at:string|null;fingerprint:string|null;sigs:string|null};
export type WatchEventRow={id:string;install_id:string;kind:string;ref:string;title:string;body:string|null;url:string;created_at:string;seen:number;sig:string};
const watchShape=(row:WatchRow)=>({id:row.id,kind:row.kind,ref:row.ref,label:row.label,createdAt:row.created_at,muted:row.muted===1});
const eventUrl=(id:string)=>'/#view=watch&event='+id;
export const eventShape=(row:WatchEventRow)=>({id:row.id,kind:row.kind,ref:row.ref,title:row.title,body:row.body,url:row.url,createdAt:row.created_at,seen:row.seen===1});

export async function addWatch(db:D1Database,installId:string,kind:string,ref:unknown,label:unknown):Promise<{watch:ReturnType<typeof watchShape>}|{error:string}>{
  const kindError=watchKindError(kind);
  if(kindError)return{error:kindError};
  const refError=watchRefError(kind,ref);
  if(refError)return{error:refError};
  const cleanRef=(ref as string).trim();
  const rawLabel=label===undefined||label===null?'':typeof label==='string'?label:'';
  if(rawLabel.trim().length>200)return{error:'Eticheta urmăririi depășește lungimea permisă (200 de caractere).'};
  const cleanLabel=rawLabel.trim()||null;
  const existing=await db.prepare('SELECT * FROM watch_items WHERE install_id=? AND kind=? AND ref=?').bind(installId,kind,cleanRef).first<WatchRow>();
  if(existing)return{watch:watchShape(existing)};
  const counted=await db.prepare('SELECT COUNT(*) AS n FROM watch_items WHERE install_id=?').bind(installId).first<{n:number}>();
  if((counted?.n||0)>=WATCH_LIMIT)return{error:'Limita de '+WATCH_LIMIT+' de urmăriri per instalație a fost atinsă. Șterge una pentru a adăuga alta.'};
  const row:WatchRow={id:crypto.randomUUID(),install_id:installId,kind:kind as WatchKind,ref:cleanRef,label:cleanLabel,created_at:new Date().toISOString(),muted:0,checked_at:null,fingerprint:null,sigs:null};
  await db.prepare('INSERT INTO watch_items (id,install_id,kind,ref,label,created_at,muted) VALUES (?,?,?,?,?,?,0)').bind(row.id,row.install_id,row.kind,row.ref,row.label,row.created_at).run();
  return{watch:watchShape(row)};
}
const watchKindError=(kind:string)=>WATCH_KINDS.includes(kind as WatchKind)?null:'Tipul de urmărire trebuie să fie unul din: '+WATCH_KINDS.join(', ')+'.';
export async function removeWatch(db:D1Database,installId:string,kind:string,ref:string):Promise<boolean>{
  const result=await db.prepare('DELETE FROM watch_items WHERE install_id=? AND kind=? AND ref=?').bind(installId,kind,ref).run();
  return (result.meta.changes||0)>0;
}
export async function listWatches(db:D1Database,installId:string){
  const rows=(await db.prepare('SELECT * FROM watch_items WHERE install_id=? ORDER BY created_at').bind(installId).all<WatchRow>()).results;
  const stats=(await db.prepare('SELECT kind,ref,MAX(created_at) AS lastAt,SUM(CASE WHEN seen=0 THEN 1 ELSE 0 END) AS unseen FROM watch_events WHERE install_id=? GROUP BY kind,ref').bind(installId).all<{kind:string;ref:string;lastAt:string;unseen:number}>()).results;
  const byWatch=new Map(stats.map(stat=>[stat.kind+'\u0000'+stat.ref,stat]));
  return{watches:rows.map(row=>({...watchShape(row),lastEventAt:byWatch.get(row.kind+'\u0000'+row.ref)?.lastAt||null,unseenCount:byWatch.get(row.kind+'\u0000'+row.ref)?.unseen||0}))};
}
export async function listWatchEvents(db:D1Database,installId:string,since:string|null){
  let filter='install_id=?',values:(string|number)[]=[installId];
  if(since){const anchor=await db.prepare('SELECT rowid FROM watch_events WHERE install_id=? AND id=?').bind(installId,since).first<{rowid:number}>();if(anchor){filter='install_id=? AND rowid>?';values=[installId,anchor.rowid]}}
  const rows=(await db.prepare('SELECT * FROM watch_events WHERE '+filter+' ORDER BY rowid DESC LIMIT '+(EVENT_PAGE+1)).bind(...values).all<WatchEventRow>()).results;
  const page=rows.slice(0,EVENT_PAGE);
  return{events:page.map(eventShape),hasMore:rows.length>EVENT_PAGE};
}
export async function ackWatchEvents(db:D1Database,installId:string,ids:string[]):Promise<number>{
  let acked=0;
  for(let at=0;at<ids.length;at+=80){
    const slice=ids.slice(at,at+80),placeholders=slice.map(()=>'?').join(','),result=await db.prepare('UPDATE watch_events SET seen=1 WHERE install_id=? AND id IN ('+placeholders+')').bind(installId,...slice).run();
    acked+=result.meta.changes||0;
  }
  return acked;
}
const SUBSCRIPTION_ENDPOINT=/^https:\/\/\S+$/;
const P256DH_PATTERN=/^[A-Za-z0-9_-]{40,120}$/,AUTH_PATTERN=/^[A-Za-z0-9_-]{16,120}$/;
export async function savePushSubscription(db:D1Database,installId:string,subscription:unknown):Promise<{subscribed:boolean}|{error:string}>{
  const record=subscription as {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}}|null;
  const endpoint=typeof record?.endpoint==='string'?record.endpoint.trim():'';
  const p256dh=typeof record?.keys?.p256dh==='string'?record.keys.p256dh.trim():'';
  const auth=typeof record?.keys?.auth==='string'?record.keys.auth.trim():'';
  if(!endpoint||!SUBSCRIPTION_ENDPOINT.test(endpoint)||endpoint.length>2000)return{error:'Adresa abonamentului push nu este validă.'};
  if(!p256dh||!auth||!P256DH_PATTERN.test(p256dh)||!AUTH_PATTERN.test(auth))return{error:'Cheile abonamentului push nu sunt valide.'};
  if(!vapidPublicKey())return{error:'Notificările push nu sunt configurate pe acest server. Evenimentele rămân disponibile în centru.'};
  const existing=await db.prepare('SELECT id FROM push_subs WHERE endpoint=?').bind(endpoint).first<{id:string}>();
  if(existing){await db.prepare('UPDATE push_subs SET install_id=?,p256dh=?,auth=? WHERE endpoint=?').bind(installId,p256dh,auth,endpoint).run();return{subscribed:true}}
  const counted=await db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE install_id=?').bind(installId).first<{n:number}>();
  if((counted?.n||0)>=SUBSCRIPTION_LIMIT)return{error:'Limita de '+SUBSCRIPTION_LIMIT+' abonamente push per instalație a fost atinsă.'};
  await db.prepare('INSERT INTO push_subs (id,install_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),installId,endpoint,p256dh,auth,new Date().toISOString()).run();
  return{subscribed:true};
}
export async function purgeInstall(db:D1Database,installId:string){
  const watches=await db.prepare('DELETE FROM watch_items WHERE install_id=?').bind(installId).run();
  const events=await db.prepare('DELETE FROM watch_events WHERE install_id=?').bind(installId).run();
  const subscriptions=await db.prepare('DELETE FROM push_subs WHERE install_id=?').bind(installId).run();
  return{purged:{watches:watches.meta.changes||0,events:events.meta.changes||0,subscriptions:subscriptions.meta.changes||0}};
}

export type WatchSweepState={startedAt:string;finishedAt:string;itemsChecked:number;baselined:number;eventsEmitted:number;pushesSent:number;pushGone:number;pushFailed:number;pushDeferred:number;pushSkipped:number;budgetSkipped:number;retentionWatches:number;retentionEvents:number;degraded:number;failed:number;notes:string[];perKind:Record<string,{checked:number;events:number;skipped:number}>};
export const WATCH_SWEEP_KEY='sweep:watch',WATCH_SWEEP_VERSION='watch.sweep.v1';
/** Starea publică a turei pentru eticheta onestă „verificăm de X ori pe zi”. */
export async function watchSweepPublicState(db:D1Database|undefined=env.DB){
  const schedule=watchSweepSchedule();
  let last:WatchSweepState|null=null;
  if(db){const row=await db.prepare('SELECT data FROM source_cache WHERE key=?').bind(WATCH_SWEEP_KEY).first<{data:string|null}>();if(row?.data){try{last=JSON.parse(row.data)}catch{last=null}}}
  return{runsPerDay:schedule.runsPerDay,timesUtc:schedule.timesUtc,lastRunAt:last?.finishedAt||null,lastEvents:last?.eventsEmitted??0,lastPushes:last?.pushesSent??0,lastOk:last?last.failed===0&&last.degraded===0:null,note:'verificăm orar'};
}
type Budget={spent:number;cap:number;reserve(n:number):boolean};
const makeBudget=(cap:number):Budget=>({spent:0,cap,reserve(n){if(n<=0)return true;if(this.spent+n>this.cap)return false;this.spent+=n;return true}});
const usableSource=(state:{status:string;data:any})=>state.status==='fresh'||state.status==='cached';

export async function runWatchSweep(db:D1Database|undefined=env.DB):Promise<WatchSweepState|null>{
  if(!db)return null;
  const startedAt=new Date().toISOString();
  const budget=makeBudget(DETECTION_FETCH_BUDGET);
  const state:WatchSweepState={startedAt,finishedAt:'',itemsChecked:0,baselined:0,eventsEmitted:0,pushesSent:0,pushGone:0,pushFailed:0,pushDeferred:0,pushSkipped:0,budgetSkipped:0,retentionWatches:0,retentionEvents:0,degraded:0,failed:0,notes:[],perKind:{}};
  const bump=(kind:string,field:'checked'|'events'|'skipped')=>{state.perKind[kind]??={checked:0,events:0,skipped:0};state.perKind[kind][field]++};
  // Retenția curăță înainte de verificare: o urmărire fără nicio interacțiune (creată
  // și fără vreun eveniment de la pragul de inactivitate) nu mai e verificată zadarnic,
  // iar evenimentele peste vechimea lor maximă dispar indiferent de urmări.
  {
    const watchCutoff=new Date(Date.now()-WATCH_INACTIVE_DAYS*86400000).toISOString(),eventCutoff=new Date(Date.now()-EVENT_RETENTION_DAYS*86400000).toISOString();
    const inactive=(await db.prepare('SELECT id FROM watch_items WHERE created_at<? AND COALESCE((SELECT MAX(created_at) FROM watch_events WHERE install_id=watch_items.install_id AND kind=watch_items.kind AND ref=watch_items.ref),created_at)<?').bind(watchCutoff,watchCutoff).all<{id:string}>()).results;
    for(let at=0;at<inactive.length;at+=80){const slice=inactive.slice(at,at+80);await db.prepare('DELETE FROM watch_items WHERE id IN ('+slice.map(()=>'?').join(',')+')').bind(...slice.map(row=>row.id)).run()}
    state.retentionWatches=inactive.length;
    const staleEvents=await db.prepare('DELETE FROM watch_events WHERE created_at<?').bind(eventCutoff).run();
    state.retentionEvents=staleEvents.meta.changes||0;
    if(inactive.length)state.notes.push('retenție: '+inactive.length+(inactive.length===1?' urmărire fără':' urmăriri fără')+' interacțiune de '+WATCH_INACTIVE_DAYS+' de zile eliminată');
    if(state.retentionEvents)state.notes.push('retenție: '+state.retentionEvents+(state.retentionEvents===1?' eveniment mai vechi':' evenimente mai vechi')+' de '+EVENT_RETENTION_DAYS+' de zile eliminat');
  }
  const rows=(await db.prepare('SELECT * FROM watch_items ORDER BY COALESCE(checked_at,created_at) ASC').all<WatchRow>()).results;
  const pushQueue:{installId:string;payload:PushPayload}[]=[];
  const touch=async(row:WatchRow,fingerprint:string|null,sigs:string[]|null)=>{await db.prepare('UPDATE watch_items SET checked_at=?, fingerprint=COALESCE(?,fingerprint), sigs=COALESCE(?,sigs) WHERE id=?').bind(new Date().toISOString(),fingerprint,sigs?JSON.stringify(sigs):null,row.id).run();state.itemsChecked++;bump(row.kind,'checked')};
  const emit=async(row:WatchRow,entries:{sig:string;title:string;body:string}[],cap:number)=>{
    let fresh=0;
    for(const entry of entries.slice(0,cap)){
      const id=sha256(row.install_id+'\u0000'+entry.sig);
      const result=await db.prepare('INSERT OR IGNORE INTO watch_events (id,install_id,kind,ref,title,body,url,created_at,seen,sig) VALUES (?,?,?,?,?,?,?,?,0,?)').bind(id,row.install_id,row.kind,row.ref,entry.title,entry.body,eventUrl(id),new Date().toISOString(),entry.sig).run();
      if((result.meta.changes||0)>0){fresh++;if(row.muted!==1)pushQueue.push({installId:row.install_id,payload:{title:entry.title,body:entry.body,url:eventUrl(id)}})}
    }
    if(entries.length>cap)state.notes.push(row.kind+' '+row.ref+': '+(entries.length-cap)+' schimbări peste plafonul per verificare');
    if(fresh)state.eventsEmitted+=fresh;
  };
  // Amprenta hotărăște dacă s-a schimbat ceva; lista de semnături anterioară hotărăște CE e nou —
  // altfel orice element rămas din lista veche s-ar anunța din nou la prima schimbare.
  const applyFingerprint=async(row:WatchRow,entries:{sig:string;title:string;body:string}[],cap:number)=>{
    const sigs=entries.map(entry=>entry.sig),fingerprint=fingerprintOf(sigs);
    if(row.fingerprint===null||row.sigs===null){await touch(row,fingerprint,sigs);state.baselined++;return}
    let previous:string[]=[];try{previous=Array.isArray(JSON.parse(row.sigs))?JSON.parse(row.sigs):[]}catch{previous=[]}
    if(row.fingerprint===fingerprint){await touch(row,null,null);return}
    await emit(row,entries.filter(entry=>!previous.includes(entry.sig)),cap);
    await touch(row,fingerprint,sigs);
  };
  const rowsOf=(kind:WatchKind)=>rows.filter(row=>row.kind===kind);
  try{
    // meteo — fluxul ANM de avertizări, pe cheia turei weather.
    const meteoRows=rowsOf('meteo');
    if(meteoRows.length){
      if(budget.reserve(1)){
        const alerts=await readSource(alertsLoader,{waitForRefresh:true});
        if(usableSource(alerts)){
          const document=String((alerts.data as {document?:string})?.document||'');
          const alertsParsed=[...document.matchAll(/<avertizare\s+([^>]*?)(?:\/>|><\/avertizari?\b[^>]*>)/gi)].map(match=>Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map(attr=>[attr[1],attr[2]]))as Record<string,string>);
          for(const row of meteoRows){
            const county=countyName(row.ref);
            if(!county){state.degraded++;continue}
            const matched=alertsParsed.filter(alert=>String(alert.localitate||'').split(/[,;]|\s+-\s+/).some(token=>countyName(token)===county));
            const alertSig=(alert:Record<string,string>)=>'meteo:'+countyCode(county)+':'+sha256([alert.cod,alert.tip,alert.fenomen,alert.intensitate,alert.localitate,alert.dataStart,alert.dataStop].join('|'));
            await applyFingerprint(row,matched.map(alert=>({sig:alertSig(alert),title:'Avertizare ANM — '+county,body:String(alert.fenomen||'Avertizare')+(alert.intensitate?', '+alert.intensitate:'')+(alert.dataStart?'; valabil '+alert.dataStart+(alert.dataStop?' – '+alert.dataStop:''):'')})),METEO_EVENT_CAP);
          }
        }else{state.degraded+=meteoRows.length;state.notes.push('avertizările ANM nu au putut fi verificate în această tură')}
      }else state.budgetSkipped+=meteoRows.length;
    }
    // localitate — fluxurile ministerelor pe sursele turei news; AFIR se citește din copia brută
    // (clasa egress blocat: sursa respinge conexiunile Workerilor, reîmprospătarea o face relaia).
    const localityRows=rowsOf('localitate');
    if(localityRows.length){
      const items:{title:string;summary:string|null;content:string|null;sourceName:string;url:string}[]=[];
      let degradedFeeds=0;
      for(const kind of FEED_KINDS){
        if(!budget.reserve(1)){degradedFeeds++;state.budgetSkipped++;continue}
        const feed=await readSource(feedLoader(kind),{waitForRefresh:true});
        if(!usableSource(feed)){degradedFeeds++;continue}
        for(const item of (feed.data as {items?:any[]})?.items||[])items.push({title:String(item.title||''),summary:item.summary?String(item.summary):null,content:item.content?String(item.content):null,sourceName:feed.name,url:String(item.url||'')});
      }
      const afirRow=await db.prepare('SELECT data FROM source_cache WHERE key=?').bind('feed:agricultura').first<{data:string|null}>();
      if(afirRow?.data){try{for(const item of (JSON.parse(afirRow.data)?.items||[]))items.push({title:String(item.title||''),summary:null,content:null,sourceName:'AFIR',url:String(item.url||'')})}catch{state.notes.push('fluxul AFIR nu a putut fi citit din copia persistentă')}}
      if(items.length){
        for(const row of localityRows){
          const refCounty=(countyLookup.items as Record<string,string>)[localityName(row.ref)];
          const matches=items.filter(item=>{
            const coverage=classifyGeography({title:item.title,summary:item.summary,content:item.content,sourceName:item.sourceName},'feed');
            if(coverage.level==='locality')return coverage.localities.some(name=>sameLocality(name,row.ref))&&(!refCounty||!coverage.counties.length||coverage.counties.some(county=>countyName(county)===refCounty));
            if(coverage.level==='county')return !!refCounty&&coverage.counties.some(county=>countyName(county)===refCounty);
            return false;
          });
          await applyFingerprint(row,matches.map(item=>({sig:'loc:'+localityName(row.ref)+':'+canonicalUrl(item.url),title:'Știre pentru '+(row.label||row.ref),body:item.title+' · '+item.sourceName})),FEED_EVENT_CAP);
        }
      }else{for(const row of localityRows){await touch(row,null,null)}if(degradedFeeds)state.notes.push(degradedFeeds+' fluxuri de știri indisponibile în această tură')}
    }
    // venue — calendarele publice ale instituțiilor din registru, pe încărcătorul existent.
    const venueRows=rowsOf('venue');
    if(venueRows.length){
      const calendars=new Map<string,{ok:boolean;items:any[]}>();
      for(const ref of [...new Set(venueRows.map(row=>row.ref))].slice(0,VENUE_CHECK_CAP)){
        if(!budget.reserve(1)){continue}
        const venue=eventVenues.find(entry=>entry.id===ref);
        if(!venue){calendars.set(ref,{ok:true,items:[]});continue}
        const calendar=await readSource(eventsLoader(venue),{waitForRefresh:true});
        calendars.set(ref,{ok:usableSource(calendar),items:usableSource(calendar)?(calendar.data as {items?:any[]})?.items||[]:[]});
      }
      for(const row of venueRows){
        const calendar=calendars.get(row.ref);
        if(!calendar||!calendar.ok){if(!calendar)state.budgetSkipped++;else state.degraded++;continue}
        const venue=eventVenues.find(entry=>entry.id===row.ref);
        await applyFingerprint(row,calendar.items.map(item=>({sig:'ven:'+row.ref+':'+String(item.id),title:'Spectacol nou — '+(row.label||venue?.name||row.ref),body:String(item.title||'')+(item.start?', '+String(item.start).replace('T',' ').slice(0,16):'')+(venue?.city?' · '+venue.city:'')})),VENUE_EVENT_CAP);
      }
    }
    // act — înregistrarea actului din Portal Legislativ, prin căutarea SOAP existentă pe titlu.
    let actChecked=0;
    for(const row of rowsOf('act')){
      if(actChecked>=ACT_CHECK_CAP||!budget.reserve(2)){state.budgetSkipped++;continue}
      actChecked++;
      const search=await readSource(lawLoader({title:row.label||row.ref,text:'',number:'',year:'',page:0}),{waitForRefresh:true});
      if(!usableSource(search)){state.degraded++;continue}
      const found=((search.data as {items?:any[]})?.items||[]).find(item=>String(item.id||'')===row.ref);
      if(!found){await touch(row,null,null);state.notes.push('actul '+row.ref.slice(0,80)+' nu apare în căutarea acestei ture');continue}
      const recordFingerprint=fingerprintOf({id:found.id,numar:found.number,data:found.date,titlu:found.title,tip:found.type});
      await applyFingerprint(row,[{sig:'act:'+row.ref+':'+recordFingerprint,title:'Act normativ actualizat',body:(row.label||String(found.title||row.ref))+': înregistrarea din portal s-a schimbat (număr, dată sau formă).'}],1);
    }
    // firma — profilul ANAF pe încărcătorul existent (identitate + anii de bilanț).
    let firmaChecked=0;
    for(const row of rowsOf('firma')){
      if(firmaChecked>=FIRMA_CHECK_CAP||!budget.reserve(4)){state.budgetSkipped++;continue}
      firmaChecked++;
      const profile=await readSource(companyLoader(row.ref),{waitForRefresh:true});
      if(!usableSource(profile)){state.degraded++;continue}
      const data=profile.data as any;
      const current=fingerprintOf({name:data?.name,address:data?.address,registration:data?.registration,currentCaen:data?.currentCaen,vat:data?.vat,inactive:data?.inactive,queriedDate:data?.queriedDate,years:(data?.history||[]).map((entry:any)=>entry.year).sort()});
      await applyFingerprint(row,[{sig:'firma:'+row.ref+':'+current,title:'Firmă actualizată — '+(row.label||data?.name||row.ref),body:'ANAF: identitate fiscală sau bilanțuri schimbate pentru CUI '+row.ref+'.'}],1);
    }
    // dosar — reverificare vie mărginită pe portalul instanțelor, cele mai vechi verificate mai întâi.
    let dosarChecked=0;
    for(const row of rowsOf('dosar')){
      if(dosarChecked>=DOSAR_CHECK_CAP||!budget.reserve(3)){state.budgetSkipped++;continue}
      dosarChecked++;
      try{
        const cases=await readSource(courtLoader(normalizeCourtNumber(row.ref)),{waitForRefresh:true});
        if(!usableSource(cases)){state.degraded++;continue}
        const items=(cases.data as {items?:any[]})?.items||[];
        const current=fingerprintOf(items.map(record=>[record.number,record.court,record.stage,record.modified,record.hearings?.map((hearing:any)=>[hearing.date,hearing.time,hearing.solution||hearing.result,hearing.summary])]));
        await applyFingerprint(row,[{sig:'dosar:'+row.ref+':'+current,title:'Dosar '+row.ref+' — actualizare',body:'Stadiu, termene sau soluții actualizate în fișele dosarului (portal.just).'}],1);
      }catch(e){state.failed++;state.notes.push('dosarul '+row.ref+' nu a putut fi verificat: '+(e instanceof Error?e.message:'eroare necunoscută'))}
    }
    // notificările — best-effort; centrul și insigna rămân sursa adevărului.
    if(pushQueue.length){
      if(!vapidPublicKey())state.pushSkipped=pushQueue.length;
      else for(const entry of pushQueue){
        const subs=(await db.prepare('SELECT * FROM push_subs WHERE install_id=?').bind(entry.installId).all<{install_id:string;endpoint:string;p256dh:string;auth:string}>()).results;
        if(!subs.length)continue;
        for(const sub of subs){
          if(state.pushesSent>=PUSH_SEND_BUDGET){state.pushDeferred++;continue}
          const outcome=await sendPush(sub,entry.payload);
          if(outcome==='sent')state.pushesSent++;
          else if(outcome==='gone'){state.pushGone++;await db.prepare('DELETE FROM push_subs WHERE endpoint=?').bind(sub.endpoint).run()}
          else if(outcome==='failed')state.pushFailed++;
          else state.pushSkipped++;
        }
      }
    }
  }catch(e){state.failed++;state.notes.push('tura de urmărire a întâlnit o eroare: '+(e instanceof Error?e.message:'eroare necunoscută'))}
  state.finishedAt=new Date().toISOString();
  try{await db.prepare('INSERT INTO source_cache (key,data,last_attempt_at,last_success_at,adapter_version) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,adapter_version=excluded.adapter_version').bind(WATCH_SWEEP_KEY,JSON.stringify(state),state.startedAt,state.finishedAt,WATCH_SWEEP_VERSION).run()}
  catch{console.warn(JSON.stringify({event:'watch_sweep_state_write_failure'}))}
  return state;
}
