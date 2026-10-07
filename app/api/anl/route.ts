import {readSource} from '@/lib/live/cache';
import {anlLoader,anlRecordId} from '@/lib/live/housing';
import {matchesQuery,paginate} from '@/lib/live/query';
import {readGeographicContext,countyName,sameLocality} from '@/lib/geographic-scope';
export const dynamic='force-dynamic';

export async function GET(request:Request){
 const p=new URL(request.url).searchParams,q=(p.get('q')||'').trim(),page=Number(p.get('page')||0),county=(p.get('county')||'').trim(),context=readGeographicContext(p);
 if(q.length>100||county.length>120||!context||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Căutare invalidă.'},{status:400});
 const state=await readSource(anlLoader);
 if(state.data){
  const data=state.data,all=data.records as Record<string,unknown>[];
  const facets={'Județele ANL':[...new Set(all.map(record=>String(record['Judeţ']??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ro'))};
  const records=all
   .filter(record=>matchesQuery(record,q)&&(!county||String(record['Judeţ']||'').trim()===county))
   .filter(record=>!context.active||!!context.county&&countyName(record['Judeţ'])===context.county&&(String(record['Localitate']??'').trim()===''||sameLocality(record['Localitate'],context.locality)))
   .map(record=>({...record,_id:anlRecordId(record)}));
  const selection=paginate(records,page,20);
  state.data={...data,...selection,records:selection.items,facets};
 }
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
