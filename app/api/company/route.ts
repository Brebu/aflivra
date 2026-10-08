import {readSource} from '@/lib/live/cache';
import {companyLoader} from '@/lib/live/company-registries';
import {companyNameSearchLoader} from '@/lib/live/adapters';
import {knowledgeLoader,combineCompany} from '@/lib/live/knowledge';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,name=(params.get('name')||'').trim(),cui=params.get('cui')||'427282';
 // Name search reads only the open-knowledge registry — the official name registries
 // publish no server-side query (probe-settled 2026-10-08) — through its own loader,
 // so it never loads the ANAF family for a term that is not a CUI.
 if(name){
  if(name.length<2||name.length>100)return Response.json({error:'Nume invalid.'},{status:400});
  return Response.json(await readSource(companyNameSearchLoader(name)),{headers:{'Cache-Control':'no-store'}});
 }
 if(!/^[1-9]\d{1,9}$/.test(cui))return Response.json({error:'CUI invalid.'},{status:400});const [primary,knowledge]=await Promise.all([readSource(companyLoader(cui)),readSource(knowledgeLoader(cui),{background:true})]);return Response.json(combineCompany(primary,knowledge),{headers:{'Cache-Control':'no-store'}})}
