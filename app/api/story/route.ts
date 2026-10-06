import {readSource} from '@/lib/live/cache';
import {storyLoader} from '@/lib/live/stories';
export const dynamic='force-dynamic';
export async function GET(request:Request){const id=new URL(request.url).searchParams.get('id')||'';if(!/^\d{1,12}$/.test(id))return Response.json({error:'Poveste invalidă.'},{status:400});return Response.json(await readSource(storyLoader(id)),{headers:{'Cache-Control':'no-store'}})}
