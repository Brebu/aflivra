import {readSource} from '@/lib/live/cache';import {sirutaLoader} from '@/lib/live/directories';
import {matchesQuery,paginate} from '@/lib/live/query';
import {readGeographicContext,sameLocality,countyName} from '@/lib/geographic-scope';
export const dynamic='force-dynamic';
export async function GET(request:Request){const p=new URL(request.url).searchParams,q=p.get('q')||'',page=Number(p.get('page')||0),context=readGeographicContext(p);if(q.length>100||!context||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Căutare invalidă.'},{status:400});const result=await readSource(sirutaLoader),matches=(result.data?.items||[]).filter((x:any)=>matchesQuery(x,q)&&(!context.active||!!context.county&&sameLocality(x.name,context.locality)&&countyName(x.county)===context.county));return Response.json({...result,data:result.data?{period:result.data.period,...paginate(matches,page,40)}:null},{headers:{'Cache-Control':'no-store'}})}
