import {readSource} from '@/lib/live/cache';
import {tempoMetaLoader,insSeriesLoader,tempoTerritory,tempoRecentYears} from '@/lib/live/tempo';
export const dynamic='force-dynamic';

const envelopeBase={name:'INS TEMPO · serii statistice',url:'http://statistici.insse.ro:8077/tempo-ins/',adapterVersion:'ins.tempo.v1'};

export async function GET(request:Request){
 const p=new URL(request.url).searchParams;
 const territory=(p.get('territory')||'').trim();
 if(!territory)return Response.json({error:'Argumentul "territory" trebuie să fie un șir nevid (județul sau teritoriul serii, ex. "Cluj", "Brașov", "București").'},{status:400});
 if(territory.length>100)return Response.json({error:'Filtre invalide.'},{status:400});
 // Metadatele merg înaintea datelor: id-urile de selecție (anii, teritoriile) se
 // derivă din dimensionsMap la fiecare încărcare — niciodată hardcodate.
 const metaState=await readSource(tempoMetaLoader);
 if(!metaState.data)return Response.json({...envelopeBase,key:'ins:POP105A:'+territory,status:metaState.status,data:null,publishedAt:null,lastSuccessAt:metaState.lastSuccessAt,lastAttemptAt:metaState.lastAttemptAt,nextAttemptAt:metaState.nextAttemptAt,error:metaState.error||'Metadatele matricei TEMPO nu sunt disponibile acum.',ttlSeconds:metaState.ttlSeconds,errorDiagnostic:metaState.errorDiagnostic??null},{headers:{'Cache-Control':'no-store'}});
 const territoryOption=tempoTerritory(metaState.data.dimensionsMap,territory);
 if(!territoryOption)return Response.json({error:'Argumentul "territory" nu se regăsește printre teritoriile matricei POP105A (județe și Municipiul București). Datele pe localități nu fac parte din matricea validată.'},{status:400});
 const years=tempoRecentYears(metaState.data.dimensionsMap);
 if(!years.length)return Response.json({...envelopeBase,key:'ins:POP105A:'+territory,status:'unavailable',data:null,publishedAt:null,lastSuccessAt:metaState.lastSuccessAt,lastAttemptAt:metaState.lastAttemptAt,nextAttemptAt:null,error:'Matricea TEMPO nu expună anii recenți.',ttlSeconds:metaState.ttlSeconds},{headers:{'Cache-Control':'no-store'}});
 const state=await readSource(insSeriesLoader(metaState.data,territoryOption,years));
 return Response.json(state,{headers:{'Cache-Control':'no-store'}});
}
