import {readEida} from '@/lib/live/eida';
export const dynamic='force-dynamic';

const envelopeBase={name:'INFP / EIDA · istoricul seismic al României',url:'https://eida-sc3.infp.ro/',adapterVersion:'eida.seismic-history.v1',ttlSeconds:86400};

const isoDate=(value:string)=>/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value);

export async function GET(request:Request){
 const p=new URL(request.url).searchParams;
 const kindRaw=p.get('kind')||'events',q=p.get('q')||'',from=p.get('from')||'',to=p.get('to')||'',page=Number(p.get('page')||0),minRaw=p.get('minMagnitude');
 const kind=kindRaw==='stations'?'stations':'events';
 const minMagnitude=minRaw===null||minRaw===''?undefined:Number(minRaw);
 if(!['events','stations'].includes(kindRaw))return Response.json({error:'Argumentul "kind" trebuie să fie events sau stations.'},{status:400});
 if(q.length>200||(from&&!isoDate(from))||(to&&!isoDate(to))||minMagnitude!==undefined&&(!Number.isFinite(minMagnitude)||minMagnitude<0||minMagnitude>10)||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Filtre invalide.'},{status:400});
 try{
  const data=await readEida({kind,from:from||undefined,to:to||undefined,minMagnitude,q,page},request.url);
  return Response.json({...envelopeBase,key:'eida:'+kind,status:'cached',data,publishedAt:data.fetchedAt.slice(0,10),lastSuccessAt:data.fetchedAt.slice(0,10),lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return Response.json({...envelopeBase,key:'eida:'+kind,status:'unavailable',data:null,publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:error instanceof Error?error.message:'Datele seismice nu pot fi citite acum.',ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }
}
