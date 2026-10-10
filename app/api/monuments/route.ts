import {readMonuments} from '@/lib/live/lmi';
export const dynamic='force-dynamic';

const envelopeBase={name:'Lista Monumentelor Istorice 2015 · București',url:'https://patrimoniu.ro/ro/profiles/lista-monumentelor-istorice',adapterVersion:'lmi.monuments-2015.v1',ttlSeconds:86400};

export async function GET(request:Request){
 const p=new URL(request.url).searchParams;
 const q=(p.get('q')||'').trim(),page=Number(p.get('page')||0);
 if(q.length>200||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Filtre invalide.'},{status:400});
 try{
  const data=await readMonuments({q,page},request.url);
  return Response.json({...envelopeBase,key:'lmi:bucuresti',status:'cached',data,publishedAt:'2016-02-15',lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return Response.json({...envelopeBase,key:'lmi:bucuresti',status:'unavailable',data:null,publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:error instanceof Error?error.message:'Lista monumentelor nu poate fi citită acum.',ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }
}
