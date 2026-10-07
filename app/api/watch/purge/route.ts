import {env} from 'cloudflare:workers';
import {validInstallId,purgeInstall} from '@/lib/live/watch-sweep';
export const dynamic='force-dynamic';
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string,status=400)=>json({error},status);
// „Șterge-mi datele”: șterge integral și numai rândurile instalației care cere —
// urmăririle, evenimentele și abonamentele push, fără urmă difuză.
export async function POST(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  let body:any;try{body=await request.json()}catch{return reject('Cererea nu poate fi citită ca JSON.')}
  if(!validInstallId(body?.installId))return reject('Identificatorul de instalare nu este valid.');
  return json(await purgeInstall(db,body.installId));
}
