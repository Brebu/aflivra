import {readSource} from '@/lib/live/cache';
import {companyLoader} from '@/lib/live/adapters';
import {knowledgeLoader,combineCompany} from '@/lib/live/knowledge';
export const dynamic='force-dynamic';
export async function GET(request:Request){const cui=new URL(request.url).searchParams.get('cui')||'427282';if(!/^[1-9]\d{1,9}$/.test(cui))return Response.json({error:'CUI invalid.'},{status:400});const [primary,knowledge]=await Promise.all([readSource(companyLoader(cui)),readSource(knowledgeLoader(cui),{background:true})]);return Response.json(combineCompany(primary,knowledge),{headers:{'Cache-Control':'no-store'}})}
