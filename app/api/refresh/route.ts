import {env} from 'cloudflare:workers';
import {liveContext} from '@/lib/live/request-context';
import {refreshSweep} from '@/lib/live/refresh-sweep';
import sweepMap from '@/lib/live/refresh-groups.json';
export const dynamic='force-dynamic';
export async function POST(request:Request){const token=env.REFRESH_TOKEN||'';if(!token||request.headers.get('authorization')!=='Bearer '+token)return Response.json({error:'Acces interzis.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const source=(new URL(request.url).searchParams.get('source')||'').trim(),map=sweepMap as any,names=map.groups.map((group:any)=>String(group.name));
  if(source&&!names.includes(source))return Response.json({error:'Grupul de surse „'+source+'” nu există. Grupuri valide: '+names.join(', ')+'.'},{status:404,headers:{'Cache-Control':'no-store'}});
  const ctx=liveContext(),groups=[];
  for(const name of source?[source]:names){const cron=String((map.groups.find((group:any)=>group.name===name)||{}).cron||'');
   try{ // Declanșarea manuală completă protecționează fiecare grup: o cădere izolată nu oprește celelalte grupuri.
    groups.push(await refreshSweep(env,ctx,name)||{group:name,cron,startedAt:null,finishedAt:null,ok:0,failed:0,sources:[]})}
   catch(e){console.warn(JSON.stringify({event:'refresh_sweep_failure',group:name,message:e instanceof Error?e.message:'Unknown error'}));groups.push({group:name,cron,startedAt:null,finishedAt:null,ok:0,failed:0,sources:[]})}}
  return Response.json({groups,servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
}
