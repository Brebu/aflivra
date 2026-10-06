import {readSource} from '@/lib/live/cache';
import {directories,directoryLoader} from '@/lib/live/directories';
import {matchesQuery,paginate} from '@/lib/live/query';
import {readGeographicContext,registryMatchesLocation} from '@/lib/geographic-scope';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,kind=p.get('kind')||'',q=(p.get('q')||'').trim(),page=Number(p.get('page')||0),context=readGeographicContext(p);
 if(!Object.hasOwn(directories,kind)||q.length>100||!context||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Căutare invalidă.'},{status:400});
 if(context.active&&!context.county){const config=directories[kind];return Response.json({key:'directory:'+kind+':unknown-county',name:config.name,url:'https://data.gov.ro/dataset/'+config.dataset,adapterVersion:'directory.geographic.v1',status:'cached',data:{records:[],fields:[],total:0,page:0,pages:1,geographicUnavailable:true,note:'Județul acestei localități nu este identificat sigur în sursa geografică. Nu afișăm înregistrări din localități omonime. Poți alege Toată România pentru registrul integral.'},publishedAt:config.period,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}})}
 const state=await readSource(directoryLoader(kind,q,page,context));
 if(state.data&&!state.data.paginated){const data=state.data,records=data.records.map((r:any)=>data.compact?Object.fromEntries(data.fields.map((f:string,i:number)=>[f,r[i]])):r).filter((r:any)=>matchesQuery(r,q)&&registryMatchesLocation(r,context,kind)),selection=paginate(records,page,20);state.data={...data,...selection,items:undefined,compact:false,records:selection.items}}
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
