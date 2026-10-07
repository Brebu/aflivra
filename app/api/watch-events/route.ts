import {env} from 'cloudflare:workers';
import {validInstallId,listWatchEvents} from '@/lib/live/watch-sweep';
export const dynamic='force-dynamic';
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string,status=400)=>json({error},status);
const EVENT_ID=/^[0-9A-Za-z_-]{1,64}$/;
export async function GET(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  const p=new URL(request.url).searchParams;
  const installId=(p.get('installId')||'').trim(),since=(p.get('since')||'').trim();
  if(!validInstallId(installId))return reject('Identificatorul de instalare nu este valid.');
  if(since&&!EVENT_ID.test(since))return reject('Filtrul „since” nu este valid.');
  const result=await listWatchEvents(db,installId,since||null);
  return json(result);
}
