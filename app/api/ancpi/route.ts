import {readSource} from '@/lib/live/cache';
import {ancpiLoader} from '@/lib/live/housing';
export const dynamic='force-dynamic';

export async function GET(){
 const state=await readSource(ancpiLoader);
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
