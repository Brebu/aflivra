import manifest from '@/public/trains/manifest.json';
import {readTrainsStations,readTrainStationBoard,searchTrainStations,foldTrainText,type TrainsOperatorInfo} from '@/lib/live/trains';
import {paginate} from '@/lib/live/query';
export const dynamic='force-dynamic';

const operators=manifest.operators as TrainsOperatorInfo[];
const verifiedOperators=operators.filter(operator=>operator.status==='verified');
const envelope={key:'trains:stations',name:'Informatică Feroviară · mersul trenurilor',url:'https://data.gov.ro/',adapterVersion:'trains.planned.v1',ttlSeconds:86400};
const note='Orare planificate, pe edițiile publicate de fiecare operator pe data.gov.ro. Nu include întârzieri, anulări în ziua de mers sau garanția unei escală comerciale. Edițiile mai vechi ale unui operator rămân cele mai recente publicate oficial.';
const operatorSummary=verifiedOperators.map(operator=>({id:operator.id,name:operator.name,edition:operator.edition,validFrom:operator.validFrom,validTo:operator.validTo,trains:operator.trains,datasetUrl:operator.datasetUrl}));

export async function GET(request:Request){
 const p=new URL(request.url).searchParams,q=(p.get('q')||'').trim(),page=Number(p.get('page')||0),station=p.get('station');
 if(q.length>100||!Number.isInteger(page)||page<0||page>100000||station!==null&&!/^\d{1,7}$/.test(station))return Response.json({error:'Căutare invalidă.'},{status:400});
 try{
  if(station!==null){
   const stations=await readTrainsStations(request.url);
   const found=stations.items.find(entry=>String(entry.code)===station);
   if(!found)return Response.json({...envelope,status:'unavailable',data:{board:null,operators:operatorSummary,note:'Stația nu se află în copia verificată a orarului.'},publishedAt:manifest.fetchedAt,lastSuccessAt:manifest.fetchedAt,lastAttemptAt:null,nextAttemptAt:null,error:'Stația nu se află în copia verificată a orarului.',ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
   const board=await readTrainStationBoard(found,request.url);
   const response={...envelope,status:'cached',data:{station:{code:found.code,name:found.name,operators:found.operators,trains:found.trains},departures:board.departures,arrivals:board.arrivals,operators:operatorSummary,note},publishedAt:manifest.fetchedAt,lastSuccessAt:manifest.fetchedAt,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400};
   return Response.json(response,{headers:{'Cache-Control':'no-store'}});
  }
  const stations=await readTrainsStations(request.url);
  const rows=searchTrainStations(stations,q);
  const selection=paginate(rows,page,40);
  return Response.json({...envelope,status:'cached',data:{...selection,operators:operatorSummary,note,delayedEditions:operators.filter(operator=>operator.status!=='verified').map(operator=>operator.name+' ('+(operator.reason||'ediție indisponibilă')+')')},publishedAt:manifest.fetchedAt,lastSuccessAt:manifest.fetchedAt,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return Response.json({...envelope,status:'unavailable',data:null,publishedAt:manifest.fetchedAt,lastSuccessAt:manifest.fetchedAt,lastAttemptAt:null,nextAttemptAt:null,error:error instanceof Error?error.message:'Orarul trenurilor nu poate fi citit acum.',ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }
}
