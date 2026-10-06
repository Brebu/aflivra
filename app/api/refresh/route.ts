import {env} from 'cloudflare:workers';
import {createHash,timingSafeEqual} from 'node:crypto';
import {liveContext} from '@/lib/live/request-context';
import {refreshSweep} from '@/lib/live/refresh-sweep';
import sweepMap from '@/lib/live/refresh-groups.json';
export const dynamic='force-dynamic';
// Tokenul se compară pe rezumatul SHA-256 al ambelor valori, în timp constant: nici lungimea, nici prima
// poziție diferită nu scurg informație despre secretul din mediul de execuție.
const tokenValid=(token:string,header:string|null)=>{if(!token||!header?.startsWith('Bearer '))return false;const digest=(value:string)=>createHash('sha256').update(value).digest();return timingSafeEqual(digest(header.slice(7)),digest(token))};
export async function POST(request:Request){const token=env.REFRESH_TOKEN||'';if(!token||!tokenValid(token,request.headers.get('authorization')))return Response.json({error:'Acces interzis.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const source=(new URL(request.url).searchParams.get('source')||'').trim(),map=sweepMap as any,names=map.groups.map((group:any)=>String(group.name));
  if(source&&!names.includes(source))return Response.json({error:'Grupul de surse „'+source.slice(0,200)+'” nu există. Grupuri valide: '+names.join(', ')+'.'},{status:404,headers:{'Cache-Control':'no-store'}});
  const ctx=liveContext(),groups=[];
  for(const name of source?[source]:names){const cron=String((map.groups.find((group:any)=>group.name===name)||{}).cron||'');
   try{ // Declanșarea manuală completă protecționează fiecare grup: o cădere izolată nu oprește celelalte grupuri.
    groups.push(await refreshSweep(env,ctx,name)||{group:name,cron,startedAt:null,finishedAt:null,ok:0,failed:0,sources:[]})}
   catch(e){console.warn(JSON.stringify({event:'refresh_sweep_failure',group:name,message:e instanceof Error?e.message:'Unknown error'}));groups.push({group:name,cron,startedAt:null,finishedAt:null,ok:0,failed:0,sources:[]})}}
  return Response.json({groups,servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
}
