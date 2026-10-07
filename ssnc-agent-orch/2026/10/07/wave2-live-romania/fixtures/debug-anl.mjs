// DevOps probe: prove the harness ANL/ANCPI fixture workbooks satisfy the real
// parsers' structure gates (same generation code as scripts/verify-source-errors.mjs).
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {pathToFileURL} from 'node:url';import ts from 'typescript';
const root='/Users/cbrebu/Projects/alfivra';
const temp=await mkdtemp(join(tmpdir(),'aflivra-housing-'));
try{
 const xlsxUrl=pathToFileURL(root+'/node_modules/xlsx/xlsx.mjs').href;
 let src=await readFile(join(root,'lib/live/housing.ts'),'utf8');
 src=src.replace("import {getSource,SourceError} from './adapters';","const getSource=async()=>'';class SourceError extends Error{}")
  .replace("import {downloadResource} from './resources';","const downloadResource=async()=>new ArrayBuffer(0);");
 const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
  .replace("from 'xlsx'","from '"+xlsxUrl+"'");
 await writeFile(join(temp,'housing.mjs'),out);
 const housing=await import(pathToFileURL(join(temp,'housing.mjs')));
 const {default:XLSX}=await import(xlsxUrl);
 const harness=await readFile(join(root,'scripts/verify-source-errors.mjs'),'utf8');
 const anlCounties=eval('['+harness.match(/const anlCounties=\[(.*?)\];/s)[1]+']');
 const anlYears=eval(harness.match(/const anlYears=(Array\.from\([^;]*?\);)/)[1]);
 const ancpiTypes=eval('['+harness.match(/const ancpiTypes=\[(.*?)\];/s)[1]+']');
 // ANL fixture (same generation as the harness anlXlsx)
 const rows=[['Nr. crt','JUDET','LOCALITATE','AMPLASAMENT','NR. U.L.',...anlYears]];let crt=0,unitsTotal=0;const perYear=Object.fromEntries(anlYears.map(year=>[year,0]));
 for(const [ci,county] of anlCounties.entries())for(let s=1;s<=8;s++){crt++;const units=30+s*4+(ci%7);unitsTotal+=units;const delivery=anlYears[(ci+s)%20];perYear[delivery]+=units;rows.push([crt,county,'Localitatea de verificare '+ci,'Amplasamentul de verificare '+county+' '+s,units,...anlYears.map(year=>year===delivery?units:null)])}
 rows.push(['','TOTAL GENERAL','','',unitsTotal,...anlYears.map(year=>perYear[year])]);
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'obiective');
 const anlBytes=new Uint8Array(XLSX.write(wb,{type:'buffer',bookType:'xlsx'})).buffer;
 try{
  const d=housing.parseAnlSites(anlBytes,'Lista amplasamentelor obiectivelor de locuințe pentru tineri recepționate 11.03.2025');
  console.log('ANL parse OK:',d.data.records.length,'records,','units',d.data.unitsTotal,'years',d.data.years.length,'counties',new Set(d.data.records.map(r=>r['Judeţ'])).size,'years-sum',d.data.years.reduce((a,y)=>a+y.value,0));
 }catch(e){console.log('ANL parse FAILED:',e.message);
  const reread=XLSX.read(anlBytes,{type:'array',cellDates:false,raw:false});
  const sheetRows=XLSX.utils.sheet_to_json(reread.Sheets[reread.SheetNames[0]],{header:1,defval:null,blankrows:false});
  console.log('sheet rows:',sheetRows.length,'header row0:',JSON.stringify(sheetRows[0]));
  const hi=sheetRows.findIndex(row=>Array.isArray(row)&&/^nr\.?\s*crt/i.test(String(row[0]??'').trim())&&/amplasament/i.test(String(row[3]??'').trim()));
  console.log('headerIndex:',hi);
  console.log('TOTAL rows:',JSON.stringify(sheetRows.slice(-2)));
  const header=sheetRows[hi].map(c=>String(c??'').trim());
  const yearCols=header.map((cell,index)=>({year:Number(cell),index})).filter(x=>Number.isInteger(x.year)&&x.year>=1990&&x.year<=2035);
  console.log('yearColumns:',yearCols.length,'first:',JSON.stringify(yearCols.slice(0,3)),'last idx:',yearCols[yearCols.length-1].index,'header len:',header.length);
  const cleanCell=v=>v===null||v===undefined?'':String(v).trim();
  const sites=[];const counties=new Set();let county='',locality='',unitsTotal=0;const yearsTotal={};
  for(const row of sheetRows.slice(hi+1)){
   if(!Array.isArray(row))continue;
   const first=cleanCell(row[0]),judet=cleanCell(row[1]);
   if(/^total\s+cumulat/i.test(first))continue;
   if(/^total/i.test(judet)){
    console.log('TOTAL branch row[0..6]:',JSON.stringify(row.slice(0,7)));
    if(/^total\s+general/i.test(judet)){unitsTotal=Math.round(Number(row[4]))||0;
     console.log('unitsTotal computed:',unitsTotal,'row[4] raw:',JSON.stringify(row[4]));
     for(const {year,index} of yearCols){const value=Number(row[index]);if(Number.isFinite(value)&&value>0)yearsTotal[String(year)]=Math.round(value)}
     console.log('yearsTotal keys:',Object.keys(yearsTotal).length);
    }
    continue;
   }
   if(judet)county=judet;
   const place=cleanCell(row[2]);if(place)locality=place;
   const site=cleanCell(row[3]);
   if(!site||site===' ')continue;
   sites.push(row);counties.add(county);
  }
  console.log('replica: sites',sites.length,'counties',counties.size,'unitsTotal',unitsTotal,'yearsKeys',Object.keys(yearsTotal).length);
 }
 // ANCPI fixture
 const crows=[['JUDET','LUNA_RAPORTATA','TIP_PROPRIETATE','TIP_OPERATIUNE','NUMAR_IPOTECI']];
 for(const [ci,county] of anlCounties.entries())for(const [ti,type] of ancpiTypes.entries())crows.push([county,'31.01.2024',type,'Ipoteca înscrisă',(county==='BUCUREŞTI'?30:8)+((ci*5+ti*3)%20)]);
 const wb2=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb2,XLSX.utils.aoa_to_sheet(crows),'ipoteci');
 const ancpiBytes=new Uint8Array(XLSX.write(wb2,{type:'buffer',bookType:'xlsx'})).buffer;
 try{
  const d=housing.parseAncpiMortgages(ancpiBytes);
  console.log('ANCPI parse OK:',d.data.countyCount,'județe, total',d.data.total,'luna',d.data.monthLabel,'tipuri',d.data.byType.length,'top county',d.data.byCounty[0].county,'suma județe',d.data.byCounty.reduce((a,c)=>a+c.total,0));
 }catch(e){console.log('ANCPI parse FAILED:',e.message)}
}finally{await rm(temp,{recursive:true,force:true})}
