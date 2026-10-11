import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import ts from 'typescript';import XLSX from 'xlsx';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-housing-editions-')),require=createRequire(import.meta.url);
try{
 let source=await readFile(join(root,'lib/live/housing.ts'),'utf8');
 source=source.replace("import {getSource,SourceError} from './adapters';",'const getSource=(...args)=>globalThis.__housingSource(...args);class SourceError extends Error{}').replace("import {downloadResource} from './resources';",'const downloadResource=(...args)=>globalThis.__housingDownload(...args);').replace("from 'xlsx'","from '"+pathToFileURL(require.resolve('xlsx')).href+"'");
 await writeFile(join(temp,'housing.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
 const housing=await import(pathToFileURL(join(temp,'housing.mjs')));
 for(const name of ['Ipoteci Septembrie 2026','Ipoteci 30.09.2026','Ipoteci 2026-09','Ipoteci 2026-09-30'])assert.equal(housing.scoreAncpiMonth(name),202609);
 for(const name of ['Ipoteci 31.02.2026','Ipoteci 2026-13','unrecognizable'])assert.equal(housing.scoreAncpiMonth(name),0);
 assert(housing.scoreAncpiMonth('Ipoteci 2026-09')>housing.scoreAncpiMonth('Ipoteci Ianuarie 2024'));
 const oldResource={name:'Ipoteci Ianuarie 2024',format:'XLSX',url:'https://data.gov.ro/old.xlsx'},newResource={name:'Ipoteci 30.09.2026',format:'XLSX',url:'https://data.gov.ro/new.xlsx',last_modified:'2026-10-01T00:00:00Z'},organization={id:'ancpi-org',name:'ancpi'};
 globalThis.__housingSource=async url=>{if(url.includes('package_search'))assert.equal(new URL(url).searchParams.get('fq'),'organization:"ancpi"','CKAN organization facets use the verified publisher name');return JSON.stringify(url.includes('package_show')?{success:true,result:{id:'old-dataset',organization,resources:[oldResource]}}:{success:true,result:{count:1,results:[{id:'new-dataset',organization,title:'Dinamica ipotecilor 2026',resources:[newResource]}]}})};
 const workbook=month=>{const rows=[['JUDET','LUNA_RAPORTATA','TIP_PROPRIETATE','TIP_OPERATIUNE','NUMAR_IPOTECI']];for(let county=1;county<=42;county++)for(const type of ['apartamente','agricol','cu constructii'])rows.push(['County '+county,month,type,'inscriere',10]);const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Ipoteci');return new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'}))};
 let downloads=0;globalThis.__housingDownload=async url=>{downloads++;assert.equal(url.href,newResource.url);return workbook('30.09.2026')};
 const latest=await housing.ancpiLoader.load();assert.equal(latest.data.datasetId,'new-dataset');assert.equal(latest.data.referenceMonth,'2026-09');assert.equal(latest.publishedAt,'2026-09-01');assert.equal(latest.data.total,1260);assert.equal(downloads,1,'Discovery downloads only the latest verified candidate');
 globalThis.__housingDownload=async()=>workbook('31.08.2026');await assert.rejects(()=>housing.ancpiLoader.load(),/diferă/,'A mislabeled workbook cannot replace the prior validated month');
 console.log('Verified ANCPI numeric/Romanian editions, annual-dataset discovery, one selected download, reference month versus catalog timestamp, and rejection of a mismatched workbook.');
}finally{delete globalThis.__housingSource;delete globalThis.__housingDownload;await rm(temp,{recursive:true,force:true})}
