import {normalizeSearch} from './live/query';
import {countyName,countyCode,sameLocality,nearbyRecord,type GeographicContext} from './geographic-scope';

const key=(value:string)=>normalizeSearch(value).replace(/[^a-z0-9]/g,'');
const localityFields=new Set(['localitate','localitateunitate','oras','municipiu','city','locality','addresslocality']);
const countyFields=new Set(['judet','judetpj','judetul','county','countycode','codcas','numecas']);
export function tabularGeography(columns:string[]){const find=(names:Set<string>)=>columns.findIndex(c=>names.has(key(c)));return{locality:find(localityFields),county:find(countyFields),lat:find(new Set(['lat','latitude','latitudine','stoplat'])),lon:find(new Set(['lon','lng','longitude','longitudine','stoplon']))}}
export function tabularLocationNote(columns:string[],context?:GeographicContext){if(!context?.active)return 'Tabelul integral al sursei; context național.';const fields=tabularGeography(columns);return fields.locality>=0?'Rânduri pentru localitatea aleasă'+(fields.county>=0?' și județul ei.':'.'):fields.county>=0?'Rânduri pentru județul ales. Sursa nu precizează o localitate pentru fiecare rând.':fields.lat>=0&&fields.lon>=0?'Rânduri din raza de 15 km de locația activă.':'Acoperire națională: tabelul nu are coloane geografice care să permită o filtrare locală sigură.'}
export function tabularMatches(row:string[],columns:string[],context?:GeographicContext){
 if(!context?.active)return true;const fields=tabularGeography(columns);
 if(fields.locality>=0&&(!context.locality||!sameLocality(row[fields.locality],context.locality)))return false;
 if(fields.county>=0&&(!context.county||countyName(row[fields.county])!==countyName(context.county)))return false;
 if(fields.lat>=0&&fields.lon>=0&&fields.locality<0&&fields.county<0){const number=(v:string)=>Number(String(v??'').replace(',','.'));return !!context.point&&nearbyRecord({lat:number(row[fields.lat]),lon:number(row[fields.lon])},context.point)}
 return true;
}
const variants=(value:string)=>[...new Set([value,value.toLocaleUpperCase('ro-RO'),value.toLocaleLowerCase('ro-RO'),normalizeSearch(value),normalizeSearch(value).toUpperCase(),value.replace(/ș/g,'ş').replace(/ț/g,'ţ'),value.toLocaleUpperCase('ro-RO').replace(/Ș/g,'Ş').replace(/Ț/g,'Ţ')])];
/** CKAN's documented list filters restrict rows before offset/limit. */
export function datastoreGeographicFilters(columns:string[],context?:GeographicContext){
 const filters:Record<string,string[]>={};if(!context?.active)return filters;const fields=tabularGeography(columns);
 if(fields.locality>=0){const names=[context.locality,...['Municipiul ','Orașul ','Comuna '].map(prefix=>prefix+context.locality),...(sameLocality(context.locality,'București')?Array.from({length:6},(_,i)=>'București Sectorul '+(i+1)):[])];filters[columns[fields.locality]]=[...new Set(names.flatMap(variants).flatMap(v=>[v,v.replaceAll('-',' ')]))]}
 if(fields.county>=0)filters[columns[fields.county]]=[...new Set([context.county,'Județul '+context.county,'CAS '+context.county,countyCode(context.county)].flatMap(variants))];
 return filters;
}
