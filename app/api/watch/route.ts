import {env} from 'cloudflare:workers';
import {WATCH_KINDS,validInstallId,watchRefError,addWatch,removeWatch,listWatches,watchSweepPublicState} from '@/lib/live/watch-sweep';
import {vapidPublicKey} from '@/lib/live/web-push';
export const dynamic='force-dynamic';
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}});
const reject=(error:string,status=400)=>json({error},status);
export async function GET(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  const installId=(new URL(request.url).searchParams.get('installId')||'').trim();
  if(!validInstallId(installId))return reject('Identificatorul de instalare nu este valid.');
  const[ordered,sweep]=await Promise.all([listWatches(db,installId),watchSweepPublicState(db)]);
  return json({...ordered,sweepState:sweep,notification:{vapidPublicKey:vapidPublicKey()},kinds:[...WATCH_KINDS]});
}
export async function POST(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  let body:any;try{body=await request.json()}catch{return reject('Cererea nu poate fi citită ca JSON.')}
  if(!validInstallId(body?.installId))return reject('Identificatorul de instalare nu este valid.');
  if(typeof body?.kind!=='string')return reject('Tipul de urmărire lipseste.');
  const result=await addWatch(db,body.installId,body.kind,body?.ref,body?.label);
  if('error'in result)return reject(result.error);
  return json(result);
}
export async function DELETE(request:Request){
  const db=env.DB;
  if(!db)return reject('Starea persistentă este temporar indisponibilă.',503);
  const p=new URL(request.url).searchParams;
  const installId=(p.get('installId')||'').trim(),kind=(p.get('kind')||'').trim(),ref=(p.get('ref')||'').trim();
  if(!validInstallId(installId))return reject('Identificatorul de instalare nu este valid.');
  if(!WATCH_KINDS.includes(kind as typeof WATCH_KINDS[number]))return reject('Tipul de urmărire trebuie să fie unul din: '+WATCH_KINDS.join(', ')+'.');
  const refError=watchRefError(kind,ref);
  if(refError)return reject(refError);
  const deleted=await removeWatch(db,installId,kind,ref);
  return json({deleted});
}
