import {getSource,SourceError} from './adapters';
import type {Loader} from './types';
import {uniqueRecords} from './records';
import {normalizeSearch,paginate} from './query';
import {romanianDate} from './date';
import {countyName} from '../geographic-scope';

/*
 ANRE / POSF — ofertele de energie electrică pentru casnici din comparatorul public
 posf.ro (indicat de pagina ANRE). Endpointul e clientul web public al comparatorului,
 nu un API de integrare cu contract de stabilitate verificat — răspunsul se parsează
 ca JSON indiferent de Content-Type (sursa servește HTML pe un corp JSON), iar un 422
 cu explicații ajunge eroare onestă cu diagnostic, nu reinterpretată. Zona se rezolvă
 prin lista publicată de județe (get-judete), nu hardcoded. Rândurile brute au
 duplicate integrale identice: se deduplică pe id_oferta+zonă și numărul duplicatelor
 se servește, fără eliminare silențioasă. Rândurile „prosumator" primesc flag — nu se
 elimină și nu se recomandă: prețul cel mai mic nu e o ofertă disponibilă oricui.
*/

const POSF_BASE='https://posf.ro/comparator/api/index.php';

const roDateDash=()=>{const iso=romanianDate();return iso.slice(8,10)+'-'+iso.slice(5,7)+'-'+iso.slice(0,4)};

const parseJsonBody=async(url:string)=>{const text=await getSource(url);try{return JSON.parse(text)}catch{throw new SourceError('Răspunsul comparatorului POSF nu s-a putut parsa ca JSON.')}};

export type PosfJudet={id_judet:number;nume:string;id_zona:number;nume_zona:string};
export type PosfOffer={
 id_oferta:string;cod_oferta:string|null;denumire_oferta:string;furnizor:string;
 pret_final:string|null;unitate_masura:string|null;pret_energie:string|null;
 valoare_componenta_fixa:string|null;valoare_factura_furnizor_fc:string|null;
 rezultat_comparatie_valoare_factura:string|null;rezultat_economie_cost:string|null;
 valabilitate_oferta_start:string|null;valabilitate_oferta_stop:string|null;
 perioada_de_aplicare_start:string|null;perioada_de_aplicare_stop:string|null;
 oferta_pdf:string|null;legatura_oferta:string|null;ultima_actualizare:string|null;
 prosumator:boolean;
};

const isProsumator=(row:Record<string,unknown>)=>/prosumator/i.test(String(row['denumire_oferta']??'')+' '+String(row['oferta_pdf']??''));

export const posfJudeteLoader:Loader<{items:PosfJudet[];count:number}>={key:'posf:judete',name:'POSF · lista județelor și zonelor',url:POSF_BASE+'?request=get-judete',version:'posf.judete.v1',ttl:86400,load:async()=>{
 const rows=await parseJsonBody(POSF_BASE+'?request=get-judete');
 if(!Array.isArray(rows)||!rows.length)throw new SourceError('Lista județelor POSF nu a putut fi citită.');
 const items=(rows as Record<string,unknown>[]).map(row=>({id_judet:Number(row['id_judet']),nume:String(row['nume']??''),id_zona:Number(row['id_zona']),nume_zona:String(row['nume_zona']??'')})).filter(row=>Number.isFinite(row.id_judet)&&Number.isFinite(row.id_zona)&&row.nume);
 return {data:{items,count:items.length},publishedAt:null};
}};

export function posfZoneFor(counties:PosfJudet[],county:string){
 const wanted=normalizeSearch(countyName(county)||county).replace(/[^a-z0-9 ]/g,' ').trim();
 return counties.find(entry=>normalizeSearch(entry.nume).replace(/[^a-z0-9 ]/g,' ').trim()===wanted)||null;
}

export const posfOffersLoader=(zone:PosfJudet,consumptionMonthly:number,currentBillLei:number):Loader<{items:PosfOffer[];count:number;rawRows:number;duplicateIdenticalRows:number;prosumatorRows:number;zone:PosfJudet;consumptionMonthlyKwh:number;billBasisNote:string}>=>{
 const params=new URLSearchParams({request:'comparator-electric',tip_client:'casnic',tip_oferta:'0',tip_pret:'nediferentiat',consum_lunar:String(consumptionMonthly),consum_anual:String(consumptionMonthly*12),valoare_factura_curenta:String(currentBillLei),nivel_tensiune:'JT_',id_zona:String(zone.id_zona),tip_produs:'0',data_start_aplicare:roDateDash(),perioada_contract:'',energie_regenerabila:'',factura_electronica:'',frecventa_emitere_factura:'',procent_zona_noapte:'',procent_zona_zi:'',frecventa_citire_contor:'',valoare_fixa:''});
 return {key:'posf:offers:'+normalizeSearch(zone.nume)+':'+consumptionMonthly+':'+currentBillLei,name:'POSF · comparator oferte energie',url:POSF_BASE+'?'+params,version:'posf.comparator-electric.v1',ttl:86400,load:async()=>{
  const rows=await parseJsonBody(POSF_BASE+'?'+params);
  if(!Array.isArray(rows))throw new SourceError('Răspunsul comparatorului POSF nu conține lista de oferte.');
  const raw=(rows as Record<string,unknown>[]).map(row=>({
   id_oferta:String(row['id_oferta']??''),cod_oferta:row['cod_oferta']!=null?String(row['cod_oferta']):null,denumire_oferta:String(row['denumire_oferta']??''),furnizor:String((row['furnizor'] as Record<string,unknown>|null)?.['nume_furnizor']??''),
   pret_final:row['pret_final']!=null?String(row['pret_final']):null,unitate_masura:row['unitate_masura']!=null?String(row['unitate_masura']):null,pret_energie:row['pret_energie']!=null?String(row['pret_energie']):null,
   valoare_componenta_fixa:row['valoare_componenta_fixa']!=null?String(row['valoare_componenta_fixa']):null,valoare_factura_furnizor_fc:row['valoare_factura_furnizor_fc']!=null?String(row['valoare_factura_furnizor_fc']):null,
   rezultat_comparatie_valoare_factura:row['rezultat_comparatie_valoare_factura']!=null?String(row['rezultat_comparatie_valoare_factura']):null,rezultat_economie_cost:row['rezultat_economie_cost']!=null?String(row['rezultat_economie_cost']):null,
   valabilitate_oferta_start:row['valabilitate_oferta_start']!=null?String(row['valabilitate_oferta_start']):null,valabilitate_oferta_stop:row['valabilitate_oferta_stop']!=null?String(row['valabilitate_oferta_stop']):null,
   perioada_de_aplicare_start:row['perioada_de_aplicare_start']!=null?String(row['perioada_de_aplicare_start']):null,perioada_de_aplicare_stop:row['perioada_de_aplicare_stop']!=null?String(row['perioada_de_aplicare_stop']):null,
   oferta_pdf:row['oferta_pdf']!=null?String(row['oferta_pdf']):null,legatura_oferta:row['legatura_oferta']!=null?String(row['legatura_oferta']):null,ultima_actualizare:row['ultima_actualizare']!=null?String(row['ultima_actualizare']):null,
   prosumator:isProsumator(row),
  }));
  const deduped=uniqueRecords(raw,row=>row.id_oferta+'@'+zone.id_zona);
  return {data:{items:deduped,count:deduped.length,rawRows:raw.length,duplicateIdenticalRows:raw.length-deduped.length,prosumatorRows:raw.filter(row=>row.prosumator).length,zone,consumptionMonthlyKwh:consumptionMonthly,billBasisNote:'Factura de referință ('+currentBillLei+' lei) e baza de calcul a comparatorului, ipoteză de calcul — nu factura utilizatorului.'},publishedAt:null};
 }};
};

export type PosfQuery={county:string;consumptionMonthly?:number;currentBillLei?:number;q?:string;page?:number};

export async function readPosfOffers(query:PosfQuery,read:typeof import('./cache').readSource){
 const consumption=Math.min(Math.max(Math.round(query.consumptionMonthly??200),1),20000);
 const bill=Math.min(Math.max(Math.round(query.currentBillLei??300),0),1000000);
 const countiesState=await read(posfJudeteLoader);
 if(!countiesState.data)throw new SourceError('Lista județelor POSF nu e disponibilă acum — zonele nu se inventează.');
 const zone=posfZoneFor(countiesState.data.items,query.county);
 if(!zone)throw new SourceError('Județul cerut nu se regăsește în lista publicată de zone a comparatorului.');
 const state=await read(posfOffersLoader(zone,consumption,bill));
 if(!state.data)throw new SourceError('Ofertele comparatorului POSF nu sunt disponibile acum.');
 return {state,zone,consumption,bill};
}

export function paginatePosf(items:PosfOffer[],query:{q?:string;page?:number}){
 const term=normalizeSearch(query.q||'');
 const filtered=term?items.filter(offer=>normalizeSearch(offer.furnizor+' '+offer.denumire_oferta+' '+offer.cod_oferta).includes(term)):items;
 return paginate(filtered,query.page,20);
}
