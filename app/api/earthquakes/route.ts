import {readEida} from '@/lib/live/eida';
import {calendarRange} from '@/lib/live/date';
export const dynamic='force-dynamic';

const envelopeBase={name:'INFP / EIDA · istoricul seismic al României',url:'https://eida-sc3.infp.ro/',adapterVersion:'eida.seismic-history.v2',ttlSeconds:86400};

export async function GET(request:Request){
 const p=new URL(request.url).searchParams;
 const kindRaw=p.get('kind')||'events',q=p.get('q')||'',from=p.get('from')||'',to=p.get('to')||'',page=Number(p.get('page')||0),minRaw=p.get('minMagnitude');
 const kind=kindRaw==='stations'?'stations':'events';
 const minMagnitude=minRaw===null||minRaw===''?undefined:Number(minRaw);
 // Prefixurile de interval trebuie să existe pe un calendar (2026-13 sau 2026-02-30 nu
 // sunt intervale, sunt greșeli), iar intervalul inversat se respinge explicit —
 // o cerere validă în afara corpusului rămâne 200 cu acoperirea declarată.
 const fromRange=from?calendarRange(from):null,toRange=to?calendarRange(to):null;
 if(!['events','stations'].includes(kindRaw))return Response.json({error:'Argumentul "kind" trebuie să fie events sau stations.'},{status:400});
 if(q.length>200||(from&&!fromRange)||(to&&!toRange)||(fromRange&&toRange&&fromRange.from>toRange.to)||minMagnitude!==undefined&&(!Number.isFinite(minMagnitude)||minMagnitude<0||minMagnitude>10)||!Number.isInteger(page)||page<0||page>100000)return Response.json({error:'Filtre invalide: „from" și „to" trebuie să fie prefixuri calendaristice reale (YYYY, YYYY-MM, YYYY-MM-DD), în ordine.'},{status:400});
 try{
  const data=await readEida({kind,from:from||undefined,to:to||undefined,minMagnitude,q,page},request.url);
  return Response.json({...envelopeBase,key:'eida:'+kind,status:'cached',data,publishedAt:data.fetchedAt.slice(0,10),lastSuccessAt:data.fetchedAt.slice(0,10),lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return Response.json({...envelopeBase,key:'eida:'+kind,status:'unavailable',data:null,publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:error instanceof Error?error.message:'Datele seismice nu pot fi citite acum.',ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }
}
