import {env} from 'cloudflare:workers';
import {validInstallId,ackWatchEvents,ACK_LIMIT} from '@/lib/live/watch-sweep';
export const dynamic='force-dynamic';
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string,status=400)=>json({error},status);
const EVENT_ID=/^[0-9A-Za-z_-]{1,64}$/;
export async function POST(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  let body:any;try{body=await request.json()}catch{return reject('Cererea nu poate fi citită ca JSON.')}
  if(!validInstallId(body?.installId))return reject('Identificatorul de instalare nu este valid.');
  const ids=body?.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>ACK_LIMIT)return reject('Lista de evenimente confirmate trebuie să aibă maximum '+ACK_LIMIT+' de identificatori.');
  for(const id of ids)if(typeof id!=='string'||!EVENT_ID.test(id))return reject('Un identificator de eveniment nu este valid.');
  const acked=await ackWatchEvents(db,body.installId,ids);
  return json({acked});
}
