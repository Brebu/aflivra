import {readPosfOffers,paginatePosf} from '@/lib/live/posf';
import {readSource} from '@/lib/live/cache';
export const dynamic='force-dynamic';

const envelopeBase={name:'POSF / ANRE · comparatorul ofertelor de energie electrică',url:'https://posf.ro/comparator?comparatorType=electric',adapterVersion:'posf.energy-offers.v1'};

export async function GET(request:Request){
 const p=new URL(request.url).searchParams;
 const county=(p.get('county')||'').trim(),q=p.get('q')||'',page=Number(p.get('page')||0);
 const consumptionMonthly=p.get('consumptionMonthly')===null?200:Number(p.get('consumptionMonthly'));
 const currentBillLei=p.get('currentBillLei')===null?300:Number(p.get('currentBillLei'));
 if(!county)return Response.json({error:'Argumentul "county" trebuie să fie un șir nevid — zona comparatorului se rezolvă prin lista publicată de județe.'},{status:400});
 if(county.length>100||q.length>200||!Number.isInteger(page)||page<0||page>100000||!Number.isInteger(consumptionMonthly)||consumptionMonthly<1||consumptionMonthly>20000||!Number.isInteger(currentBillLei)||currentBillLei<0||currentBillLei>1000000)return Response.json({error:'Filtre invalide.'},{status:400});
 try{
  const {state,zone,consumption,bill}=await readPosfOffers({county,consumptionMonthly,currentBillLei,q,page},readSource);
  if(state.data){
   const selection=paginatePosf(state.data.items,{q,page});
   state.data={...state.data,...selection,
    eligibilityNote:'Rândurile „prosumator" se marchează, nu se elimină și nu se recomandă: prețul cel mai mic nu e o ofertă disponibilă oricui. Fereastra de ofertare și eligibilitatea fiecărui client se verifică în oferta furnizorului.',
    anreNote:'Pagina ANRE care indică comparatorul include o restricție de copiere fără acord scris; accesul anonim nu e dovada unei licențe de reutilizare.'};
  }
  return Response.json({...state,key:'posf:offers:'+zone.nume.toLowerCase(),name:envelopeBase.name,url:envelopeBase.url,adapterVersion:envelopeBase.adapterVersion,data:state.data&&{...state.data,zone:{...zone,rezolvatDin:'get-judete — lista publicată de POSF'},consumptionMonthlyKwh:consumption,billBasisLei:bill}},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return Response.json({...envelopeBase,key:'posf:offers',status:'unavailable',data:null,publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:error instanceof Error?error.message:'Ofertele comparatorului nu sunt disponibile acum.',ttlSeconds:86400},{headers:{'Cache-Control':'no-store'}});
 }
}
