import {readSource} from '@/lib/live/cache';import {sirutaLoader} from '@/lib/live/directories';
import {matchesQuery,paginate} from '@/lib/live/query';
import {readGeographicContext,sameLocality,countyName,geographicLocalities} from '@/lib/geographic-scope';
export const dynamic='force-dynamic';
export async function GET(request:Request){const p=new URL(request.url).searchParams,q=p.get('q')||'',page=Number(p.get('page')||0),context=readGeographicContext(p);if(q.length>100||!context||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Căutare invalidă.'},{status:400});const result=await readSource(sirutaLoader),matches=(result.data?.items||[]).filter((x:any)=>matchesQuery(x,q)&&(!context.active||!!context.county&&sameLocality(x.name,context.locality)&&countyName(x.county)===context.county));
 // Coordonatele vin din registrul cartografiat al localităților urbane (aceeași
 // sursă SIRUTA): o potrivire unică pe nume pliat + județ leagă centrul
 // cartografiat; localitățile fără punct cartografiat rămân onest fără el.
 const coordinates=(item:any)=>{
  if(!item?.name||!item?.county)return null;
  const hits=geographicLocalities.filter(locality=>countyName(locality.county)===countyName(item.county)&&sameLocality(locality.name,item.name));
  return hits.length===1&&Number.isFinite(hits[0]!.lat)&&Number.isFinite(hits[0]!.lon)?{lat:hits[0]!.lat,lon:hits[0]!.lon}:null};
 const enriched=matches.map((item:any)=>{const point=coordinates(item);return point?{...item,lat:point.lat,lon:point.lon}:item});
 return Response.json({...result,data:result.data?{period:result.data.period,...paginate(enriched,page,40)}:null},{headers:{'Cache-Control':'no-store'}})}
