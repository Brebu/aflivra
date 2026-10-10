import {readSitur,SITUR_KINDS,type SiturKind} from '@/lib/live/situr';
export const dynamic='force-dynamic';

const envelopeBase={name:'Situr · registrele turistice clasificate',url:'https://se.situr.gov.ro/OpenData',adapterVersion:'situr.registries.v1',ttlSeconds:86400};

export async function GET(request:Request){
 const p=new URL(request.url).searchParams;
 const kindRaw=p.get('kind')||'',q=p.get('q')||'',locality=p.get('locality')||'',county=p.get('county')||'',page=Number(p.get('page')||0);
 if(!SITUR_KINDS.includes(kindRaw as SiturKind))return Response.json({error:'Argumentul "kind" trebuie să fie unul dintre: cazare, alimentatie, agentii.'},{status:400});
 if(q.length>200||locality.length>100||county.length>100||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Filtre invalide.'},{status:400});
 const kind=kindRaw as SiturKind;
 try{
  const data=await readSitur({kind,q,locality,county,page},request.url);
  return Response.json({...envelopeBase,key:'situr:'+kind,status:'cached',data,publishedAt:data.exportDate,lastSuccessAt:data.fetchedAt.slice(0,10),lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return Response.json({...envelopeBase,key:'situr:'+kind,status:'unavailable',data:null,publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:error instanceof Error?error.message:'Registrul turistic nu poate fi citit acum.',ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }
}
