import {readAmccrsBuildings} from '@/lib/live/amccrs';
export const dynamic='force-dynamic';

const envelopeBase={name:'AMCCRS · încadrarea seismică a clădirilor din București',url:'https://amccrs-pmb.ro/lista-imobile-2/',adapterVersion:'amccrs.seismic-buildings.v1',ttlSeconds:86400};

export async function GET(request:Request){
 const p=new URL(request.url).searchParams;
 const q=(p.get('q')||'').trim(),sector=(p.get('sector')||'').trim(),page=Number(p.get('page')||0);
 if(!q)return Response.json({error:'Argumentul "q" trebuie să fie un șir nevid (adresa căutată în București).'},{status:400});
 if(q.length>200||sector&&!/^[1-6]$/.test(sector)||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Filtre invalide.'},{status:400});
 try{
  const data=await readAmccrsBuildings({q,sector:sector||undefined,page},request.url);
  return Response.json({...envelopeBase,key:'amccrs:buildings',status:'cached',data,publishedAt:data.pageUpdated,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return Response.json({...envelopeBase,key:'amccrs:buildings',status:'unavailable',data:null,publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:error instanceof Error?error.message:'Registrul seismic nu poate fi citit acum.',ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }
}
