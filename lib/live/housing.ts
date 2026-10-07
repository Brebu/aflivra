import {getSource,SourceError} from './adapters';
import {read,utils} from 'xlsx';
import {downloadResource} from './resources';
import type {Loader,Loaded} from './types';

/*
 Straturile publice ale imobiliarelor — research verdict: NU există sursă liberă și publică
 pentru anunțuri imobiliare, deci familia nu republică anunțuri. Ceea ce există și se servește:
 amplasamentele recepționate de ANL în programul „Locuințe pentru tineri” (XLS pe data.gov.ro,
 OGL-ROU) și dinamica ipotecilor ANCPI (XLSX lunar, CC-BY-4.0) — indicatori de piață, nu anunțuri.
 Fiecare încărcător alege cea mai nouă resursă publicată a setului, verifică structura
 publicată înainte de a o accepta și servește rândurile cu coloanele originale.
*/

export type AnlSiteRecord=Record<string,string|number|null>;
export type AncpiCountyRow={county:string;apartamente:number;agricol:number;'cu constructii':number;'fara constructii':number;neagricol:number;neprecizat:number;total:number};

const anlDataset='04ab4208-d17f-4f9b-ba81-7778f373344d';
const ancpiDataset='62410f25-a155-40fd-9aa9-ae54bdc96f42';
const months:Record<string,number>={ianuarie:1,februarie:2,martie:3,aprilie:4,mai:5,iunie:6,iulie:7,august:8,septembrie:9,octombrie:10,noiembrie:11,decembrie:12};
const monthNames=['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];
const scoreEdition=(name:string)=>{const dotted=name.match(/(\d{2})\.(\d{2})\.(20\d{2})/);if(dotted)return Number(dotted[3])+Number(dotted[2])/100+Number(dotted[1])/10000;const romanian=name.match(/(\d{1,2})\s+([a-zăâșțîşţ]+)\s+(20\d{2})/i);const month=romanian&&months[romanian[2].toLowerCase()];return romanian&&month?Number(romanian[3])+month/100+Number(romanian[1])/10000:0};
const scoreYear=(name:string)=>{const dotted=scoreEdition(name);if(dotted)return dotted;const year=name.match(/(20\d{2})/);return year?Number(year[1]):0};
const scoreAncpiMonth=(name:string)=>{const romanian=name.match(/([a-zăâșțîşţ]+)\s+(20\d{2})/i);const month=romanian&&months[romanian[1].toLowerCase()];return romanian&&month?Number(romanian[2])+month/100:0};

function workbookRows(bytes:ArrayBuffer):unknown[][]{
 const book=read(bytes,{type:'array',cellDates:false,raw:false});
 if(!book.SheetNames.length)throw new SourceError('Registrul publicat nu conține foi utilizabile.');
 return utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]],{header:1,defval:null,blankrows:false});
}
const cleanCell=(value:unknown)=>value===null||value===undefined?'':String(value).trim();

export function parseAnlSites(bytes:ArrayBuffer,resourceName:string):Loaded{
 const rows=workbookRows(bytes);
 const headerIndex=rows.findIndex(row=>Array.isArray(row)&&/^nr\.?\s*crt/i.test(cleanCell(row[0]))&&/amplasament/i.test(cleanCell(row[3])));
 if(headerIndex<0)throw new SourceError('Lista ANL nu mai are structura așteptată.');
 const header=rows[headerIndex].map(cleanCell);
 if(!/jude/i.test(header[1])||!/localitat/i.test(header[2])||!/u\.?\s*l/i.test(header[4]))throw new SourceError('Lista ANL nu mai are coloanele așteptate.');
 const yearColumns=header.map((cell,index)=>({year:Number(cell),index})).filter(x=>Number.isInteger(x.year)&&x.year>=1990&&x.year<=2035);
 if(yearColumns.length<20)throw new SourceError('Lista ANL nu mai conține anii de recepție.');
 const sites:AnlSiteRecord[]=[];const counties=new Set<string>();
 let county='',locality='',unitsTotal=0;const yearsTotal:Record<string,number>={};
 for(const row of rows.slice(headerIndex+1)){
  if(!Array.isArray(row))continue;
  const first=cleanCell(row[0]),judet=cleanCell(row[1]);
  if(/^total\s+cumulat/i.test(first))continue;
  if(/^total/i.test(judet)){
   if(/^total\s+general/i.test(judet)){
    unitsTotal=Math.round(Number(row[4]))||0;
    for(const {year,index} of yearColumns){const value=Number(row[index]);if(Number.isFinite(value)&&value>0)yearsTotal[String(year)]=Math.round(value)}
   }
   continue;
  }
  if(judet)county=judet;
  const place=cleanCell(row[2]);if(place)locality=place;
  const site=cleanCell(row[3]);
  if(!site||site===' ')continue;
  const record:AnlSiteRecord={'Nr. crt.':Number(row[0])||null,'Judeţ':county,'Localitate':locality,'Amplasament':site,'Nr. u.l.':Number(row[4])||null};
  let delivered=false;
  for(const {year,index} of yearColumns){const value=Number(row[index]);if(Number.isFinite(value)&&value>0){record[String(year)]=Math.round(value);delivered=true}}
  if(!delivered&&record['Nr. u.l.']===null)continue;
  sites.push(record);counties.add(county);
 } if(sites.length<300||counties.size<30)throw new SourceError('Lista ANL nu conține amplasamentele complet.');
 if(!unitsTotal||Object.keys(yearsTotal).length<10)throw new SourceError('Lista ANL nu conține totalurile naționale publicate.');
 const edition=resourceName.match(/(\d{2})\.(\d{2})\.(20\d{2})/);
 return {publishedAt:edition?edition[3]+'-'+edition[2]+'-'+edition[1]:null,data:{
  title:'Amplasamente locuințe pentru tineri · ANL',period:Math.min(...yearColumns.map(x=>x.year))+'–'+Math.max(...yearColumns.map(x=>x.year)),edition:'ediția '+(edition?edition[0]:'publicată în catalog'),
  publisher:'Agenția Națională pentru Locuințe',program:'Programul „Locuințe pentru tineri, destinate închirierii”',
  note:'Amplasamentele recepționate în programul național de locuințe pentru tineri, cu unitățile livrate pe an. Recepția nu înseamnă locuri libere: repartizarea o face ANL.',
  fields:header.filter(cell=>cell),records:sites,unitsTotal,
  years:Object.entries(yearsTotal).map(([year,value])=>({name:year,value}))
 }};
}

function monthLabel(text:string):string{
 const match=text.match(/(\d{2})\.(\d{2})\.(20\d{2})/);
 if(!match)return text;
 const month=Number(match[2]);
 return (monthNames[month-1]||match[2])+' '+match[3];
}

export function parseAncpiMortgages(bytes:ArrayBuffer):Loaded{
 const rows=workbookRows(bytes);
 const headerIndex=rows.findIndex(row=>Array.isArray(row)&&cleanCell(row[0]).toUpperCase()==='JUDET'&&cleanCell(row[4]).toUpperCase()==='NUMAR_IPOTECI');
 if(headerIndex<0)throw new SourceError('Raportul ANCPI nu mai are coloanele așteptate.');
 if(headerIndex!==0)throw new SourceError('Raportul ANCPI a adăugat rânduri înaintea antetului.');
 const records:Record<string,string|number>[]=[];const counties=new Set<string>();const operations=new Set<string>();
 for(const row of rows.slice(headerIndex+1)){
  if(!Array.isArray(row))continue;
  const county=cleanCell(row[0]);if(!county||/^total/i.test(county))continue;
  const count=Number(row[4]);
  if(!cleanCell(row[2])||!cleanCell(row[3])||!Number.isFinite(count)||count<0)throw new SourceError('Raportul ANCPI conține rânduri care nu pot fi citite.');
  records.push({JUDET:county,LUNA_RAPORTATA:cleanCell(row[1]),TIP_PROPRIETATE:cleanCell(row[2]),TIP_OPERATIUNE:cleanCell(row[3]),NUMAR_IPOTECI:Math.round(count)});
  counties.add(county);operations.add(cleanCell(row[3]));
 }
 if(records.length<120||counties.size<40)throw new SourceError('Raportul ANCPI nu acoperă județele.');
 const monthText=cleanCell(records[0].LUNA_RAPORTATA);
 const byTypeMap=new Map<string,number>(),byCountyMap=new Map<string,AncpiCountyRow>(),byOperation:Record<string,number>={};
 for(const record of records){
  const property=String(record.TIP_PROPRIETATE),operation=String(record.TIP_OPERATIUNE),county=String(record.JUDET),value=Number(record.NUMAR_IPOTECI);
  byTypeMap.set(property,(byTypeMap.get(property)||0)+value);
  byOperation[operation]=(byOperation[operation]||0)+value;
  const row=byCountyMap.get(county)||{county,apartamente:0,agricol:0,'cu constructii':0,'fara constructii':0,neagricol:0,neprecizat:0,total:0};
  if(property==='apartamente')row.apartamente+=value;else if(property==='agricol')row.agricol+=value;else if(property==='cu constructii')row['cu constructii']+=value;else if(property==='fara constructii')row['fara constructii']+=value;else if(property==='neagricol')row.neagricol+=value;else row.neprecizat+=value;
  row.total+=value;byCountyMap.set(county,row);
 }
 const total=Object.values(byOperation).reduce((a,b)=>a+b,0);
 return {publishedAt:null,data:{
  title:'Dinamica ipotecilor imobilelor · ANCPI',monthLabel:monthLabel(monthText),monthText,
  operations:[...operations].sort(),publisher:'Agenția Națională de Cadastru și Publicitate Imobiliară',
  note:'Numărul imobilelor ipotecate, cum îl publică ANCPI în raportul lunar. Indicator de piață, nu anunțuri imobiliare.',
  byType:[...byTypeMap.entries()].map(([name,value])=>({name,nameDisplay:name==='-'?'neprecizat':name,value})).sort((a,b)=>b.value-a.value),
  byCounty:[...byCountyMap.values()].sort((a,b)=>b.total-a.total),countyCount:byCountyMap.size,total,totalByOperation:byOperation,
  categories:['apartamente','cu constructii','fara constructii','agricol','neagricol','neprecizat']
 }};
}

export const anlLoader:Loader={key:'housing:anl',name:'ANL · locuințe pentru tineri',url:'https://data.gov.ro/dataset/'+anlDataset,version:'housing.anl-sites.v1',ttl:86400,load:async()=>{
 const meta=JSON.parse(await getSource('https://data.gov.ro/api/3/action/package_show?id='+anlDataset));
 const candidates=(meta.result?.resources||[]).filter((resource:any)=>/recep[țţiI]ionat/i.test(String(resource.name||''))&&/(?:amplasamente|locuin|obiective)/i.test(String(resource.name||''))&&/tineri/i.test(String(resource.name||''))&&/xls/i.test(String(resource.format||''))).map((resource:any)=>({resource,score:scoreYear(String(resource.name||''))})).sort((a:{score:number},b:{score:number})=>b.score-a.score);
 const chosen=candidates[0];
 if(!chosen||new URL(chosen.resource.url).origin!=='https://data.gov.ro')throw new SourceError('Lista amplasamentelor ANL nu este disponibilă.');
 const bytes=await downloadResource(new URL(chosen.resource.url));
 const loaded=parseAnlSites(bytes.buffer as ArrayBuffer,String(chosen.resource.name||''));
 return {...loaded,publishedAt:loaded.publishedAt||chosen.resource.last_modified||null};
}};

export const ancpiLoader:Loader={key:'housing:ancpi',name:'ANCPI · dinamica ipotecilor',url:'https://data.gov.ro/dataset/'+ancpiDataset,version:'housing.ancpi-mortgages.v1',ttl:86400,load:async()=>{
 const meta=JSON.parse(await getSource('https://data.gov.ro/api/3/action/package_show?id='+ancpiDataset));
 const candidates=(meta.result?.resources||[]).filter((resource:any)=>/ipotec/i.test(String(resource.name||''))&&/xlsx/i.test(String(resource.format||''))).map((resource:any)=>({resource,score:scoreAncpiMonth(String(resource.name||''))})).sort((a:{score:number},b:{score:number})=>b.score-a.score);
 const chosen=candidates[0];
 if(!chosen||new URL(chosen.resource.url).origin!=='https://data.gov.ro')throw new SourceError('Raportul lunar ANCPI nu este disponibil.');
 const bytes=await downloadResource(new URL(chosen.resource.url));
 const loaded=parseAncpiMortgages(bytes.buffer as ArrayBuffer);
 return {...loaded,publishedAt:chosen.resource.last_modified||null};
}};

export const anlRecordId=(record:Record<string,unknown>):string=>{
 const yearKeys=Object.keys(record).filter(key=>/^(19|20)\d{2}$/.test(key)).sort();
 return 'anl-'+String(record['Judeţ']||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+String(record['Amplasament']||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,24)+(yearKeys.length?'-'+yearKeys[yearKeys.length-1]:'');
};
