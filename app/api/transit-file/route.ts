import {env} from 'cloudflare:workers';
import {createHash} from 'node:crypto';
import manifest from '@/public/transit/manifest.json';
import {transitFiles,transitCsvStream} from '@/lib/transit-csv';
import {fileDisposition} from '@/lib/live/resource-download';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const file=new URL(request.url).searchParams.get('file');
 if(!transitFiles.some(([name])=>name===file))return Response.json({error:'Fișier de transport invalid.'},{status:400});
 try{
  const asset=new Request(new URL('/transit/TPBI_GTFS.zip',request.url),{signal:request.signal}),response=env.ASSETS?await env.ASSETS.fetch(asset):await fetch(asset);
  if(!response.ok)throw Error('Exportul operatorului nu poate fi citit acum.');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==manifest.bytes||createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Exportul operatorului nu a trecut verificarea integralității.');
  return new Response(transitCsvStream(bytes,file+'.txt'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':fileDisposition('TPBI',file||'transport','csv',true),'Cache-Control':'private, max-age=300'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Exportul CSV nu poate fi pregătit acum.'},{status:503})}
}
