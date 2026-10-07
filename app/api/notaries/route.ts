import {readSource} from '@/lib/live/cache';
import {justiceLoader,justiceRecordId} from '@/lib/live/justice';
import {matchesQuery,paginate} from '@/lib/live/query';
import {readGeographicContext,countyName,sameLocality} from '@/lib/geographic-scope';
export const dynamic='force-dynamic';

export async function GET(request:Request){
 const p=new URL(request.url).searchParams,q=(p.get('q')||'').trim(),page=Number(p.get('page')||0),chamber=(p.get('chamber')||'').trim(),context=readGeographicContext(p);
 if(q.length>100||chamber.length>120||!context||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Căutare invalidă.'},{status:400});
 const state=await readSource(justiceLoader('notari'));
 if(state.data){
  const data=state.data,records=(data.records as Record<string,unknown>[])
   .filter(record=>matchesQuery(record,q)&&(!chamber||String(record.CAMERA||'').trim()===chamber))
   .filter(record=>!context.active||!!context.county&&countyName(record.JUDET)===context.county&&(String(record.LOCALITATE??'').trim()===''||sameLocality(record.LOCALITATE,context.locality)))
   .map(record=>({...record,_id:justiceRecordId('notari',record)}));
  const selection=paginate(records,page,20);
  state.data={...data,...selection,records:selection.items,compact:false};
 }
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
