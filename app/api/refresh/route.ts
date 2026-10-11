import {env} from 'cloudflare:workers';
import {refreshAuthorized} from '@/lib/live/refresh-auth';
import {liveContext} from '@/lib/live/request-context';
import {refreshSweep} from '@/lib/live/refresh-sweep';
import sweepMap from '@/lib/live/refresh-groups.json';
import {enqueueRefresh,selectRefreshMembers,drainRefreshJobs,RefreshInputError} from '@/lib/live/refresh-jobs';
import {readSource} from '@/lib/live/cache';
import {memberLoader} from '@/lib/live/refresh-sweep';
import {takeRefreshBudget} from '@/lib/live/refresh-budget';
export const dynamic='force-dynamic';
// Tokenul se compară pe rezumatul SHA-256 al ambelor valori, în timp constant: nici lungimea, nici prima
// poziție diferită nu scurg informație despre secretul din mediul de execuție.
export async function POST(request:Request){if(!refreshAuthorized(env.REFRESH_TOKEN,request.headers.get('authorization')))return Response.json({error:'Acces interzis.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const params=new URL(request.url).searchParams,source=(params.get('source')||'').trim(),member=(params.get('member')||'').trim(),force=params.get('force')==='true',map=sweepMap as any,names=map.groups.map((group:any)=>String(group.name));
  if(['async','force'].some(key=>params.has(key)&&!['true','false'].includes(params.get(key)!)))return Response.json({error:'async și force trebuie să fie true sau false.'},{status:400});
  let members:string[];try{members=selectRefreshMembers(source,member)}catch(error){return Response.json({error:error instanceof RefreshInputError?error.message:'Selecție invalidă.'},{status:400})}
  if(!env.DB)return Response.json({error:'Stocarea actualizărilor este indisponibilă.'},{status:503});
  try{const budget=await takeRefreshBudget(env.DB,'sources');if(!budget.allowed)return Response.json({error:'Limita zilnică de actualizări manuale a fost atinsă.',limit:budget.limit},{status:429,headers:{'Cache-Control':'no-store','Retry-After':String(budget.retryAfterSeconds)}})}
  catch{return Response.json({error:'Bugetul actualizărilor nu poate fi verificat.'},{status:503,headers:{'Cache-Control':'no-store'}})}
  if(params.get('async')==='true'){
   if(!env.DB)return Response.json({error:'Stocarea actualizărilor este indisponibilă.'},{status:503});
   try{
    const jobs=await enqueueRefresh(env.DB,members,force);
    if(env.REFRESH_QUEUE){try{await env.REFRESH_QUEUE.sendBatch(jobs.map(job=>({body:{jobId:job.id}})))}catch{console.warn(JSON.stringify({event:'refresh_queue_dispatch_failed',jobs:jobs.length}))}}
    else {const ctx=liveContext();if(ctx)ctx.waitUntil(drainRefreshJobs(env.DB).catch(()=>console.warn(JSON.stringify({event:'refresh_background_failed'}))))}
    return Response.json({accepted:true,jobs,execution:env.REFRESH_QUEUE?'queue':'background-and-cron',servedAt:new Date().toISOString()},{status:202,headers:{'Cache-Control':'no-store'}});
   }catch{return Response.json({error:'Coada de actualizare nu este disponibilă. Verifică migrarea D1.'},{status:503,headers:{'Cache-Control':'no-store'}})}
  }
  if(member){const state=await readSource(await memberLoader(member),{waitForRefresh:true,force});return Response.json({...state,data:undefined,servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}
  const ctx=liveContext(),groups=[];
  for(const name of source?[source]:names){const cron=String((map.groups.find((group:any)=>group.name===name)||{}).cron||'');
   try{ // Declanșarea manuală completă protecționează fiecare grup: o cădere izolată nu oprește celelalte grupuri.
    groups.push(await refreshSweep(env,ctx,name,{force})||{group:name,cron,startedAt:null,finishedAt:null,ok:0,failed:0,sources:[]})}
   catch(e){console.warn(JSON.stringify({event:'refresh_sweep_failure',group:name,message:e instanceof Error?e.message:'Unknown error'}));groups.push({group:name,cron,startedAt:null,finishedAt:null,ok:0,failed:0,sources:[]})}}
  return Response.json({groups,servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
}
