import {env} from 'cloudflare:workers';
import {loadSourceHealth} from '@/lib/live/source-health';
export const dynamic='force-dynamic';
export async function GET(){
 if(!env.DB)return Response.json({error:'Starea surselor nu poate fi citită acum.'},{status:503,headers:{'Cache-Control':'no-store'}});
 try{return Response.json(await loadSourceHealth(env.DB),{headers:{'Cache-Control':'no-store'}})}
 catch{return Response.json({error:'Starea surselor nu poate fi citită acum.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
