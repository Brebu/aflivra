import {env} from 'cloudflare:workers';
import {validInstallId,savePushSubscription} from '@/lib/live/watch-sweep';
export const dynamic='force-dynamic';
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string,status=400)=>json({error},status);
export async function POST(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  let body:any;try{body=await request.json()}catch{return reject('Cererea nu poate fi citită ca JSON.')}
  if(!validInstallId(body?.installId))return reject('Identificatorul de instalare nu este valid.');
  const result=await savePushSubscription(db,body.installId,body?.subscription);
  if('error'in result)return reject(result.error);
  return json(result);
}
const ENDPOINT_PATTERN=/^https:\/\/\S+$/;
export async function DELETE(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  const p=new URL(request.url).searchParams;
  const installId=(p.get('installId')||'').trim(),endpoint=(p.get('endpoint')||'').trim();
  if(!validInstallId(installId))return reject('Identificatorul de instalare nu este valid.');
  if(!endpoint||!ENDPOINT_PATTERN.test(endpoint)||endpoint.length>2000)return reject('Adresa abonamentului push nu este validă.');
  const result=await db.prepare('DELETE FROM push_subs WHERE install_id=? AND endpoint=?').bind(installId,endpoint).run();
  return json({removed:(result.meta.changes||0)>0});
}
