import {verifiedCatalogResource,saveResourceMetadata} from '@/lib/live/catalog-metadata';
import {resourceLoader,resourcePage,expandDocument,datastorePageLoader} from '@/lib/live/resources';
import {readSource} from '@/lib/live/cache';
import {readGeographicContext} from '@/lib/geographic-scope';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{if(Number(request.headers.get('content-length')||0)>5_000_000)return Response.json({error:'Fișa este prea mare pentru recuperare.'},{status:413});const raw=await request.text();if(new TextEncoder().encode(raw).length>5_000_000)return Response.json({error:'Fișa este prea mare pentru recuperare.'},{status:413});const p=JSON.parse(raw),uuid=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  if(!uuid.test(p.id||'')||!uuid.test(p.datasetId||'')||typeof p.rawDataset!=='string')return Response.json({error:'Fișă invalidă.'},{status:400});
  const record=verifiedCatalogResource(p.datasetId,p.id,p.rawDataset);await saveResourceMetadata(record);let source=await readSource(resourceLoader(p.id));
  const geographicContext=readGeographicContext(new URLSearchParams(Object.fromEntries(['geoScope','locality','county','lat','lon'].filter(k=>p.query?.[k]!==undefined&&p.query[k]!=='').map(k=>[k,String(p.query[k])]))));if(!geographicContext)return Response.json({error:'Locație invalidă.'},{status:400});
  const query={geographicContext,q:String(p.query?.q||'').slice(0,200),page:Math.max(0,Math.trunc(Number(p.query?.page)||0)),sheet:Math.max(0,Math.trunc(Number(p.query?.sheet)||0)),sort:Number.isFinite(Number(p.query?.sort))?Math.max(-1,Math.trunc(Number(p.query?.sort))):-1,desc:p.query?.desc===true};
  source=source.data?.kind==='datastore'?await readSource(datastorePageLoader(p.id,source,query)):await resourcePage(source,query);source=await expandDocument(source);
  return Response.json(source,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Resursa nu poate fi recuperată acum.'},{status:503})}
}
