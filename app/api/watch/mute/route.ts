import {env} from 'cloudflare:workers';
import {WATCH_KINDS,validInstallId,watchRefError} from '@/lib/live/watch-sweep';
export const dynamic='force-dynamic';
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string,status=400)=>json({error},status);
export async function POST(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  let body:any;try{body=await request.json()}catch{return reject('Cererea nu poate fi citită ca JSON.')}
  if(!validInstallId(body?.installId))return reject('Identificatorul de instalare nu este valid.');
  const kind=typeof body?.kind==='string'?body.kind.trim():'';
  if(!WATCH_KINDS.includes(kind as typeof WATCH_KINDS[number]))return reject('Tipul de urmărire trebuie să fie unul din: '+WATCH_KINDS.join(', ')+'.');
  if(typeof body?.muted!=='boolean')return reject('Comutarea notificărilor trebuie să fie adevărată (true) sau falsă (false).');
  const ref=typeof body?.ref==='string'?body.ref.trim():'';
  const refError=watchRefError(kind,ref);
  if(refError)return reject(refError);
  const result=await db.prepare('UPDATE watch_items SET muted=? WHERE install_id=? AND kind=? AND ref=?').bind(body.muted?1:0,body.installId,kind,ref).run();
  if((result.meta.changes||0)===0)return reject('Urmărirea specificată nu există pentru această instalație.');
  return json({muted:body.muted});
}
