import {readSource} from '@/lib/live/cache';
import {catalogLoader,categoryQueries} from '@/lib/live/adapters';
import {env} from 'cloudflare:workers';import {createHash} from 'node:crypto';
import {snapshotAssetPath,decodeSnapshotBytes} from '@/lib/snapshot-transport';
import proofs from '@/public/data/snapshot-transport.json';
import {readGeographicContext,classifyGeography,matchesGeography,createGeographyIndex,geographicLocalities} from '@/lib/geographic-scope';
import {matchesQuery,paginate} from '@/lib/live/query';
export const dynamic='force-dynamic';
let inventory:any=null;
async function localInventory(request:Request){if(inventory)return inventory;const proof=proofs.items.find(p=>p.path==='/catalog/index.json')!,asset=new Request(new URL(snapshotAssetPath('/catalog/index.json'),request.url)),r=env.ASSETS?await env.ASSETS.fetch(asset):await fetch(asset);if(!r.ok)throw Error('Inventarul nu poate fi citit acum.');const bytes=decodeSnapshotBytes(await r.arrayBuffer());if(bytes.length!==proof.bytes||createHash('sha256').update(bytes).digest('hex')!==proof.sha256)throw Error('Inventarul nu a trecut verificarea integralității.');inventory=JSON.parse(new TextDecoder().decode(bytes));return inventory}
let inventoryClasses:Map<string,string[]>|null=null;
async function enrichCatalogClasses(source:any,request:Request){
 const rows=source?.data&&Array.isArray(source.data.results)?source.data.results:null;
 if(!rows)return;
 let classes=null;
 try{const copy=await localInventory(request);classes=inventoryClasses??=new Map((copy.items||[]).map((r:any)=>[String(r.id),Array.isArray(r.categories)?r.categories.map(String):[]]))}catch{}
 for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row.categories))continue;
  // Inventarul verificat e sursa canonică a clasificării; categoria singulară
  // veche rămâne doar ultima rezervă, declarată ca atare — niciodată în fața
  // inventarului, ca să nu mai difere filtrarea de rezervă de cea live.
  const fromInventory=classes?.get(String(row.id))||[];
  if(fromInventory.length){row.categories=fromInventory;continue}
  if(typeof row.category==='string'&&row.category.trim()){row.categories=[row.category];row.categorySource='legacy-seed'}else row.categories=[]}
}
export async function GET(request:Request){const p=new URL(request.url).searchParams,q=(p.get('q')||'').trim(),category=p.get('category')||'',organization=p.get('organization')||'',format=p.get('format')||'',page=Number(p.get('page')||'0'),context=readGeographicContext(p);if(!context||q.length>200||organization.length>200||format.length>60||category&&!Object.hasOwn(categoryQueries,category)||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Căutare invalidă.'},{status:400});
 if(context.active){try{const copy=await localInventory(request),index=createGeographyIndex([...geographicLocalities,...(context.locality?[{name:context.locality,county:context.county,lat:0,lon:0}]:[])]),rows=copy.items.map((r:any)=>({...r,geography:classifyGeography(r,'catalog',index)})).filter((r:any)=>(!category||r.categories.includes(category))&&(!organization||r.organization===organization)&&(!format||r.formats.includes(format))&&matchesQuery(r,q)&&matchesGeography(r.geography,context)).sort((a:any,b:any)=>String(b.modified||'').localeCompare(String(a.modified||''))),selection=paginate(rows,page,24);return Response.json({key:'catalog:geographic',name:'data.gov.ro · inventarul verificat',url:copy.sourceUrl,adapterVersion:'catalog.geographic.v1',status:'cached',data:{...selection,count:selection.total,results:selection.items,organizations:[...new Set<string>(rows.map((r:any)=>r.organization))].sort().map(name=>({name,display_name:name})),formats:[...new Set<string>(rows.flatMap((r:any)=>r.formats))].sort().map(name=>({name,display_name:name}))},publishedAt:null,lastSuccessAt:copy.fetchedAt,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:3600},{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:e instanceof Error?e.message:'Inventarul nu poate fi citit.'},{status:503})}}
 const source=await readSource(catalogLoader(category,q,page,organization,format));
 // Every served row carries its inventory classification so search results and the catalog workspace agree on the dataset's own category.
 await enrichCatalogClasses(source,request);
 return Response.json(source,{headers:{'Cache-Control':'no-store'}})
}
