import {getSource,parseBalance,parseRegistry,SourceError} from './adapters';
import {readSource} from './cache';
import {directoryLoader,directories} from './directories';
import type {Loader,Loaded} from './types';
// The registry columns accepted as the joinable CUI key come from the 31.03.2026 CNAS editions'
// export live probe plus own-infra reads of the deployed worker's cached editions,
// 2026-10-08); „CUI cod" stays accepted as the column name the pinned directory fixtures
// carry from earlier editions. An export without a recognized CUI column carries no joinable
// key and stays out of the company card.
const registryCuiColumns=['CUI cod','Cod fiscal furnizor'];
export const companyRegistryKinds=['health','pharmacies','hospitals'] as const;
// Reads ride the shared D1-cached copies of each registry (the directory loader rows), so every
// company view reuses one registry fetch per day across all viewers. This module is
// server-only: it pulls the cache (and its `cloudflare:workers` import) statically, so no
// client-reachable module may import it — the client bundle cannot resolve that import.
export async function companyPublicRegistries(cui:string){
 const reads:{kind:(typeof companyRegistryKinds)[number];registry?:any;unreadable?:boolean}[]=await Promise.all(companyRegistryKinds.map(async kind=>{
  try{
   const state=await readSource(directoryLoader(kind));if(!state.data)return{kind,unreadable:true};
   const records:any[]=state.data.records||[],column=registryCuiColumns.find(name=>records.some(record=>Object.hasOwn(record,name)));
   // Exact equality on the registry's own published CUI column — never a name match; several
   // matching rows stay distinct entries (multiple contracts, no destructive merge).
   const matched=column?records.filter(record=>String(record[column]).trim()===String(cui).trim()):[];
   return{kind,registry:{kind,name:directories[kind].name,period:state.data.period||null,records:matched,source:{...state,data:undefined}}}
  }catch{return{kind,unreadable:true}}
 }));
 return{registries:reads.filter(read=>read.registry).map(read=>read.registry),unreadable:reads.filter(read=>read.unreadable).map(read=>directories[read.kind].name)}
}
export async function loadCompany(cui:string):Promise<Loaded>{
 const lastYear=new Date().getUTCFullYear()-1,day=new Date().toISOString().slice(0,10);const years=Array.from({length:3},(_,i)=>lastYear-i);const warnings:string[]=[],history:any[]=[];let registry:any=null,registries:any=null; await Promise.all([
  ...years.map(async year=>{try{history.push(parseBalance(await getSource(`https://webservicesp.anaf.ro/bilant?an=${year}&cui=${cui}`),cui,year))}catch(e){warnings.push(`Bilanț ${year}: ${e instanceof Error?e.message:'indisponibil'}`)}}),
  (async()=>{try{registry=parseRegistry(await getSource('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{cui:Number(cui),data:day}])}),cui,day);if(!registry)warnings.push('Identitatea fiscală nu a fost returnată.')}catch(e){warnings.push('Identitate fiscală: '+(e instanceof Error?e.message:'indisponibilă'))}})(),
  (async()=>{try{registries=await companyPublicRegistries(cui)}catch{/* A registry that cannot be read now stays an absence, never a failure of the firm card. */}})()
 ]);
 if(!history.length&&!registry)throw new SourceError('ANAF nu a returnat identitate fiscală sau bilanțuri valide pentru acest CUI.');history.sort((a,b)=>a.year-b.year);const latest=history.at(-1);
 for(const name of registries?.unreadable||[])warnings.push('Registrul '+name+' nu a putut fi citit la această verificare.');
 return{publishedAt:latest?String(latest.year):registry.queriedDate,data:{cui,name:registry?.name||latest?.name,...(registry||{}),financialCaen:latest?.caen||null,caenLabel:latest?.caenLabel||null,vat:registry?.vat??null,inactive:registry?.inactive??null,queriedDate:registry?.queriedDate||null,year:latest?.year||null,indicators:latest?.entries||[],history,latestYearChecked:lastYear,publicRegistries:registries?.registries?.length?registries.registries:null,warnings}};
}
export const companyLoader=(cui='427282'):Loader=>({key:'company:'+cui,name:'ANAF',url:'https://webservicesp.anaf.ro/bilant',version:'anaf.profile.v3',ttl:86400,load:()=>loadCompany(cui)});
