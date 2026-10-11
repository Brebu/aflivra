import {env} from 'cloudflare:workers';
import {refreshAuthorized} from '@/lib/live/refresh-auth';
import {takeRefreshBudget} from '@/lib/live/refresh-budget';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function POST(request:Request){
 if(!refreshAuthorized(env.REFRESH_TOKEN,request.headers.get('authorization')))return Response.json({error:'Acces interzis.'},{status:401,headers});
 const source=new URL(request.url).searchParams.get('source')||'all';
 if(!['all','situr','amccrs','eida','lmi'].includes(source))return Response.json({error:'Corpus necunoscut.'},{status:400,headers});
 if(!env.CORPORA_GITHUB_TOKEN||!env.DB)return Response.json({error:'Declanșarea corpusurilor necesită CORPORA_GITHUB_TOKEN și stocare D1.'},{status:503,headers});
 try{
  const now=Date.now(),key='source-gate:corpora-dispatch';
  const slot=await env.DB.prepare("INSERT INTO source_cache (key,next_attempt_at,adapter_version) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET next_attempt_at=excluded.next_attempt_at WHERE source_cache.next_attempt_at<=? RETURNING key").bind(key,now+60000,'corpora.dispatch.v1',now).first();
  if(!slot)return Response.json({error:'Există o declanșare recentă. Reîncearcă peste un minut.'},{status:429,headers:{...headers,'Retry-After':'60'}});
  const budget=await takeRefreshBudget(env.DB,'corpora');
  if(!budget.allowed)return Response.json({error:'Limita zilnică de importuri manuale a fost atinsă.',limit:budget.limit},{status:429,headers:{...headers,'Retry-After':String(budget.retryAfterSeconds)}});
  const response=await fetch('https://api.github.com/repos/Brebu/aflivra/actions/workflows/corpora-refresh.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+env.CORPORA_GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Aflivra-corpus-dispatch','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{source}}),signal:AbortSignal.timeout(10000)});
  try{await response.body?.cancel()}catch{}
  if(!response.ok)return Response.json({error:'GitHub nu a acceptat declanșarea.',upstreamStatus:response.status},{status:502,headers});
  return Response.json({accepted:true,source,workflow:'corpora-refresh.yml',runsUrl:'https://github.com/Brebu/aflivra/actions/workflows/corpora-refresh.yml',note:'Importul va rula în GitHub Actions. Datele din aplicație se schimbă după validare, integrarea PR-ului și deploy.',servedAt:new Date().toISOString()},{status:202,headers});
 }catch{return Response.json({error:'Declanșarea nu a putut fi confirmată. Verifică lista de rulări înainte de o nouă încercare.'},{status:503,headers})}
}
