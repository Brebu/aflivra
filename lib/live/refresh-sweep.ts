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
import {odeonLoader} from './events';
import {cinemaLoader} from './cinema';
import {defaultCity} from '../location-context';
import sweepMap from './refresh-groups.json';
import type {Loader} from './types';
export type SweepSource={key:string;name:string;status:'fresh'|'cached'|'stale'|'unavailable';lastSuccessAt:string|null;error:string|null};
export type SweepResult={group:string;cron:string;startedAt:string;finishedAt:string;ok:number;failed:number;sources:SweepSource[]};
type SweepGroupMap={groups:{name:string;cron:string;estimatedSubrequests:number;members:string[]}[];seedBacked:{family:string;reason:string}[];onDemand:{family:string;reason:string}[]};
const groupMap:SweepGroupMap=sweepMap;
// Planul gratuit limitează o invocare programată la 50 de subrequest-uri; grupurile din refresh-groups.json
// rămân sub plafon, iar familiile grele (GTFS, SIRUTA, registre XLSX, consolidări integrale) se servesc din
// semințele verificate la construire — tura de noapte pre-împrospătează doar sursele ușoare, la cheia exactă
// pe care o citește prima încărcare a aplicației.
const todayIso=()=>new Date().toISOString().slice(0,10);
const memberLoaders:Record<string,()=>Loader>={
 'bnr':()=>bnrLoader,
 'weather.anm':()=>weatherLoader,
 'company.default':()=>companyLoader(),
 'catalog.default':()=>catalogLoader(),
 'weather.alerts':()=>alertsLoader,
 'forecast.bucuresti':()=>forecastLoader(defaultCity.lat,defaultCity.lon),
 'events.odeon':()=>odeonLoader,
 'cinema.bucuresti.today':()=>cinemaLoader('1824',todayIso()),
 'feed.munca':()=>feedLoader('munca'),
 'feed.stiri':()=>feedLoader('stiri'),
 'feed.sanatate':()=>feedLoader('sanatate'),
 'feed.educatie':()=>feedLoader('educatie'),
 'feed.justitie':()=>feedLoader('justitie'),
 'law.search.default':()=>lawLoader({title:'',text:'',number:'',year:'',page:0}),
 'law.search.codcivil':()=>lawLoader({title:codeTopics[0].title,text:'',number:'',year:'',page:0}),
 'lawyers.default':()=>lawyerLoader('',0,'recent'),
 'knowledge.company.default':()=>knowledgeLoader('427282'),
 'directory.schools.page0':()=>directoryLoader('schools','',0),
 'catalog.category.bani':()=>catalogLoader('bani','',0),
 'catalog.category.sanatate':()=>catalogLoader('sanatate','',0)};
for(const group of groupMap.groups)for(const member of group.members)if(!memberLoaders[member])throw Error('Membru de reîmprospătare necunoscut: '+member);
export const memberLoader=(member:string):Loader=>{const make=memberLoaders[member];if(!make)throw Error('Membru de reîmprospătare necunoscut: '+member);return make()};
export const listGroups=()=>groupMap.groups.map(group=>({name:group.name,cron:group.cron,members:[...group.members]}));
export const listSeedBacked=()=>groupMap.seedBacked.map(entry=>({...entry}));
export const listOnDemand=()=>groupMap.onDemand.map(entry=>({...entry}));
export const groupForCron=(cron:string)=>groupMap.groups.find(group=>group.cron===cron)??null;
export async function runGroup(name:string,db:D1Database|undefined=env.DB):Promise<SweepResult|null>{
 const group=groupMap.groups.find(entry=>entry.name===name);
 if(!group){console.warn(JSON.stringify({event:'sweep_unknown_group',group:name}));return null}
 const startedAt=new Date().toISOString(),sources:SweepSource[]=[];
 for(const member of group.members){
  // Izolare per sursă: o cădere sau o buget epuizată se înregistrează și tura continuă cu celelalte surse.
  try{const state=await readSource(memberLoader(member),{waitForRefresh:true});sources.push({key:state.key,name:state.name,status:state.status,lastSuccessAt:state.lastSuccessAt,error:state.error})}
  catch(e){sources.push({key:member,name:member,status:'unavailable',lastSuccessAt:null,error:e instanceof Error?e.message:'Sursa nu a putut fi verificată în această tură.'})}}
 const ok=sources.filter(source=>source.status==='fresh'||source.status==='cached').length;
 const result:SweepResult={group:name,cron:group.cron,startedAt,finishedAt:new Date().toISOString(),ok,failed:sources.length-ok,sources};
 if(db)try{await db.prepare('INSERT INTO source_cache (key,data,last_attempt_at,last_success_at,adapter_version) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,adapter_version=excluded.adapter_version').bind('sweep:group:'+name,JSON.stringify(result),result.startedAt,result.finishedAt,'sweep.groups.v1').run()}catch{console.warn(JSON.stringify({event:'sweep_summary_write_failure',group:name}))}
 return result}
export async function runSweep(cron:string):Promise<SweepResult|null>{
 const group=groupForCron(cron);
 if(!group){console.warn(JSON.stringify({event:'sweep_unknown_cron',cron}));return null}
 return await runGroup(group.name)}
export async function refreshSweep(sweepEnv:{DB?:D1Database}|null|undefined,ctx:{waitUntil:(promise:Promise<unknown>)=>void}|null|undefined,groupNameOrCron:string):Promise<SweepResult|null>{
 const group=groupMap.groups.find(entry=>entry.name===groupNameOrCron)||groupForCron(groupNameOrCron);
 if(!group){console.warn(JSON.stringify({event:'sweep_unknown_trigger',trigger:groupNameOrCron}));return null}
 const run=()=>runGroup(group.name,sweepEnv?.DB);
 return ctx?.waitUntil?withLiveContext(ctx,run):await run()}
