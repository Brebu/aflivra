import {readSource} from '@/lib/live/cache';
import {justiceLoader,justiceRecordId,type JusticeRegistryKind} from '@/lib/live/justice';
import {matchesQuery,paginate} from '@/lib/live/query';
import {readGeographicContext,countyName} from '@/lib/geographic-scope';
export const dynamic='force-dynamic';

const kinds:Record<string,JusticeRegistryKind>={'experti-judiciari':'experti-judiciari','experti-tehnici':'experti-tehnici',traducatori:'traducatori'};
const countyColumn:Record<JusticeRegistryKind,string>={'experti-judiciari':'Judet','experti-tehnici':'Județul',traducatori:'Judet',notari:'JUDET'};

export async function GET(request:Request){
 const p=new URL(request.url).searchParams,kindParam=p.get('kind')||'experti-judiciari',q=(p.get('q')||'').trim(),page=Number(p.get('page')||0),judet=(p.get('judet')||'').trim(),context=readGeographicContext(p);
 if(!Object.hasOwn(kinds,kindParam)||q.length>100||judet.length>80||!context||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Căutare invalidă.'},{status:400});
 const kind=kinds[kindParam];
 const state=await readSource(justiceLoader(kind));
 if(state.data){
  const data=state.data,records=(data.records as Record<string,unknown>[])
   .filter(record=>matchesQuery(record,q)&&(!judet||countyName(record[countyColumn[kind]])===countyName(judet)))
   .filter(record=>!context.active||!!context.county&&countyName(record[countyColumn[kind]])===context.county)
   .map(record=>({...record,_id:justiceRecordId(kind,record)}));
  const selection=paginate(records,page,20);
  state.data={...data,...selection,records:selection.items,compact:false};
 }
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
