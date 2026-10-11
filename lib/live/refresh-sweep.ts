import {readSource} from './cache';
import {env} from 'cloudflare:workers';
import {withLiveContext} from './request-context';
import {bnrLoader,weatherLoader,catalogLoader} from './adapters';
import {companyLoader} from './company-registries';
import {alertsLoader,forecastLoader} from './weather';
import {feedLoader} from './feeds';
import {lawLoader,codeTopics} from './legal';
import {lawyerLoader} from './lawyers';
import {knowledgeLoader} from './knowledge';
import {directoryLoader} from './directories';
import {odeonLoader,eventsLoader,eventVenue} from './events';
import {cinemaLoader} from './cinema';
import {senLoader} from './sen';
import {posfJudeteLoader,posfOffersLoader,posfZoneFor} from './posf';
import {tempoMetaLoader} from './tempo';
import {anlLoader,ancpiLoader} from './housing';
// Zona POSF a unei ture de living: judet-ul publicat se rezolvă prin lista POSF (get-judete),
// nu hardcodat — id_zona e al sursei.
const posfZoneOffers=async(county:string)=>{const state=await readSource(posfJudeteLoader,{waitForRefresh:true});const zone=state.data?posfZoneFor(state.data.items,county):null;if(!zone)throw Error('Zona POSF nu a putut fi rezolvată din lista publicată.');return posfOffersLoader(zone,200,300)};
import {defaultCity} from '../location-context';
import {romanianDate} from './date';
import sweepMap from './refresh-groups.json';
import type {Loader,SourceState} from './types';
export type SweepSource={key:string;name:string;status:'fresh'|'cached'|'stale'|'unavailable';lastSuccessAt:string|null;error:string|null};
export type SweepResult={group:string;cron:string;startedAt:string;finishedAt:string;ok:number;failed:number;sources:SweepSource[]};
type SweepGroupMap={groups:{name:string;cron:string;estimatedSubrequests:number;members:string[]}[];seedBacked:{family:string;reason:string}[];onDemand:{family:string;reason:string}[]};
const groupMap:SweepGroupMap=sweepMap;
// Cinci grupuri reutilizează TTL-urile, lease-urile și pauzele surselor.
// Profilul plătit de bază păstrează estimările sub 120 subrequest-uri / tură;
// inventarele mari rămân în copiile verificate, iar sursele la cerere nu sunt enumerate.
const todayIso=()=>romanianDate();
const memberLoaders:Record<string,()=>Loader|Promise<Loader>>={
 'bnr':()=>bnrLoader,
 'weather.anm':()=>weatherLoader,
 'company.default':()=>companyLoader(),
 'catalog.default':()=>catalogLoader(),
 'weather.alerts':()=>alertsLoader,
 'forecast.bucuresti':()=>forecastLoader(defaultCity.lat,defaultCity.lon),
 'events.odeon':()=>odeonLoader,
 'events.teatruldearta':()=>eventsLoader(eventVenue('teatruldearta')!),
 'cinema.bucuresti.today':()=>cinemaLoader('1824',todayIso()),
 'feed.munca':()=>feedLoader('munca'),
 'feed.stiri':()=>feedLoader('stiri'),
 'feed.sanatate':()=>feedLoader('sanatate'),
 'feed.educatie':()=>feedLoader('educatie'),
 'feed.justitie':()=>feedLoader('justitie'),
 'feed.energie':()=>feedLoader('energie'),
 'feed.transport':()=>feedLoader('transport'),
 'housing.anl':()=>anlLoader,
 'housing.ancpi':()=>ancpiLoader,
 'directory.health':()=>directoryLoader('health'),
 'directory.pharmacies':()=>directoryLoader('pharmacies'),
 'directory.hospitals':()=>directoryLoader('hospitals'),
 'law.search.default':()=>lawLoader({title:'',text:'',number:'',year:'',page:0}),
 'law.search.codcivil':()=>lawLoader({title:codeTopics[0].title,text:'',number:'',year:'',page:0}),
 'lawyers.default':()=>lawyerLoader('',0,'recent'),
 'knowledge.company.default':()=>knowledgeLoader('427282'),
 'directory.schools.page0':()=>directoryLoader('schools','',0),
 'catalog.category.bani':()=>catalogLoader('bani','',0),
 'catalog.category.sanatate':()=>catalogLoader('sanatate','',0),
 'power.sen':()=>senLoader,
 'posf.judete':()=>posfJudeteLoader,
 'posf.offers.bucuresti':()=>posfZoneOffers('București'),
 'ins.matrix.pop105a':()=>tempoMetaLoader};
for(const group of groupMap.groups)for(const member of group.members)if(!memberLoaders[member])throw Error('Membru de reîmprospătare necunoscut: '+member);
export const memberLoader=async(member:string):Promise<Loader>=>{const make=memberLoaders[member];if(!make)throw Error('Membru de reîmprospătare necunoscut: '+member);return await make()};
export const listGroups=()=>groupMap.groups.map(group=>({name:group.name,cron:group.cron,members:[...group.members]}));
export const listSeedBacked=()=>groupMap.seedBacked.map(entry=>({...entry}));
export const listOnDemand=()=>groupMap.onDemand.map(entry=>({...entry}));
export const groupForCron=(cron:string)=>groupMap.groups.find(group=>group.cron===cron)??null;
export async function runGroup(name:string,db:D1Database|undefined=env.DB,options:{force?:boolean}={}):Promise<SweepResult|null>{
 const group=groupMap.groups.find(entry=>entry.name===name);
 if(!group){console.warn(JSON.stringify({event:'sweep_unknown_group',group:name}));return null}
 const startedAt=new Date().toISOString(),sources:SweepSource[]=Array(group.members.length);let cursor=0;
 const reads=new Map<string,Promise<SourceState>>();
 const readMember=(member:string):Promise<SourceState>=>{
  const existing=reads.get(member);if(existing)return existing;
  const pending=(async()=>{
   // The offer loader resolves its zone through the county cache. It must await
   // that cache's writer, even when independent group members run in parallel.
   if(member==='posf.offers.bucuresti')await readMember('posf.judete');
   return readSource(await memberLoader(member),{waitForRefresh:true,force:options.force});
  })();reads.set(member,pending);return pending;
 };
 await Promise.all(Array.from({length:Math.min(3,group.members.length)},async()=>{while(cursor<group.members.length){const index=cursor++,member=group.members[index];
  // Izolare per sursă: o cădere sau o buget epuizată se înregistrează și tura continuă cu celelalte surse.
  try{const state=await readMember(member);sources[index]={key:state.key,name:state.name,status:state.status,lastSuccessAt:state.lastSuccessAt,error:state.error}}
  catch(e){sources[index]={key:member,name:member,status:'unavailable',lastSuccessAt:null,error:e instanceof Error?e.message:'Sursa nu a putut fi verificată în această tură.'}}}}));
 const ok=sources.filter(source=>source.status==='fresh'||source.status==='cached').length;
 const result:SweepResult={group:name,cron:group.cron,startedAt,finishedAt:new Date().toISOString(),ok,failed:sources.length-ok,sources};
 if(db)try{await db.prepare('INSERT INTO source_cache (key,data,last_attempt_at,last_success_at,adapter_version) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,adapter_version=excluded.adapter_version').bind('sweep:group:'+name,JSON.stringify(result),result.startedAt,result.finishedAt,'sweep.groups.v1').run()}catch{console.warn(JSON.stringify({event:'sweep_summary_write_failure',group:name}))}
 return result}
export async function runSweep(cron:string):Promise<SweepResult|null>{
 const group=groupForCron(cron);
 if(!group){console.warn(JSON.stringify({event:'sweep_unknown_cron',cron}));return null}
 return await runGroup(group.name)}
export async function refreshSweep(sweepEnv:{DB?:D1Database}|null|undefined,ctx:{waitUntil:(promise:Promise<unknown>)=>void}|null|undefined,groupNameOrCron:string,options:{force?:boolean}={}):Promise<SweepResult|null>{
 const group=groupMap.groups.find(entry=>entry.name===groupNameOrCron)||groupForCron(groupNameOrCron);
 if(!group){console.warn(JSON.stringify({event:'sweep_unknown_trigger',trigger:groupNameOrCron}));return null}
 const run=()=>runGroup(group.name,sweepEnv?.DB,options);
 return ctx?.waitUntil?withLiveContext(ctx,run):await run()}
