import {readGeographicContext,countyName} from '@/lib/geographic-scope';
import {lawyerLoader,normalizeLawyerData} from '@/lib/live/lawyers';
import {readSource} from '@/lib/live/cache';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,q=(p.get('q')||'').trim(),page=Number(p.get('page')||0),sort=p.get('sort')||'recent',context=readGeographicContext(p);
 if(!context||q.length>160||q&&q.length<3||!Number.isInteger(page)||page<0||page>100000||!['name','recent'].includes(sort))return Response.json({error:'Introdu cel puțin 3 caractere și filtre valide.'},{status:400});
 const source=await readSource(lawyerLoader(context.active?[context.county,q].filter(Boolean).join(' '):q,page,sort));
 const data=normalizeLawyerData(source.data);if(data&&context.active){data.sourceTotal=data.total;data.items=data.items.filter((item:any)=>!!context.county&&countyName(item.title.match(/baroul\s+([^\[,;\n]+)/i)?.[1])===context.county)}return Response.json({...source,data},{headers:{'Cache-Control':'no-store'}});
}
