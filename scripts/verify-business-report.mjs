import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-report-')),require=createRequire(import.meta.url);
try{
 for(const file of ['business-report','business-report-pdf']){let code=ts.transpileModule(await readFile(join(root,'lib',file+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  for(const pkg of ['pdf-lib','@pdf-lib/fontkit'])code=code.replaceAll("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");await writeFile(join(temp,file+'.mjs'),code);
 }
 const core=await import(pathToFileURL(join(temp,'business-report.mjs'))),pdf=await import(pathToFileURL(join(temp,'business-report-pdf.mjs')));
 const request={title:'Cercetare comercială în Brașov',activity:'cafenea',cuis:['123456','234567'],area:{scope:'nearby',locality:'Brașov',county:'Brașov',lat:45.65,lon:25.6,radius:15},assumptions:{monthlyRevenue:30000,fixedCosts:15000,variableCostPercent:40,investment:120000}};
 const source=(id,cui,years)=>({id,tool:'company_profile',url:'https://webservicesp.anaf.ro/bilant',arguments:{cui},status:'cached',publishedAt:null,lastSuccessAt:'2026-10-11T08:00:00Z',error:null,data:{cui,name:'Firmă cu diacritice ȘȚÎÂ '+cui,history:years.map(([year,revenue,profit,loss,staff])=>({year,entries:[['I13',revenue],['I18',profit],['I19',loss],['I20',staff]].filter(([,v])=>v!==null).map(([code,value])=>({code,value}))}))}});
 const a=source('S01','123456',[[2023,0,0,0,0],[2024,100000,0,2000,4],[2025,120000,2000,null,5]]),b=source('S02','234567',[[2023,90000,900,0,2],[2024,110000,1100,0,2]]);
 const report=core.assembleReport(request,[a,b]);assert.equal(report.comparisonYear,2024);assert.equal(report.financials[0].turnover,0);assert.equal(report.financials[0].margin,null);assert.equal(report.financials[1].net,-2000);assert.equal(report.financials[2].net,null,'Missing loss does not become zero');assert.equal(report.scenarios[1].monthlyOperating,3000);assert.equal(report.scenarios[1].paybackMonths,40);assert.equal(report.scenarios[0].paybackMonths,null);
 assert.equal(core.assembleReport({...request,cuis:[...request.cuis,'345678']},[a,b]).comparisonYear,null,'Unavailable selected firms cannot disappear from the comparison cohort');
 for(const area of [{...request.area,radius:0},{...request.area,lat:NaN},{...request.area,radius:101}])assert.throws(()=>core.validateReportRequest({...request,area}));assert.throws(()=>core.validateReportRequest({...request,cuis:['12x']}));assert.throws(()=>core.validateReportRequest({...request,assumptions:{...request.assumptions,variableCostPercent:100}}));
 const calls=[],read=async(path,args)=>{calls.push({path,args});if(path==='/api/places'){const page=Number(args.page||0);return {status:'cached',data:{total:800,pages:4,items:Array.from({length:200},(_,i)=>({id:'p'+(page*200+i),name:'Cafenea '+i,lat:45.65,lon:25.6,address:'Brașov',distance:1}))}}}if(path==='/api/company')return args.cui==='123456'?a:b;if(path==='/api/ins')throw Error('Sursă indisponibilă în verificare');return {status:'stale',error:'Copie istorică',data:null}};
 const collected=await core.collectReport(request,read,new AbortController().signal);assert.equal(collected.places.length,600);assert.equal(collected.placesTotal,800);assert.equal(collected.placesComplete,false);assert.equal(calls.filter(c=>c.path==='/api/places').length,3);assert(calls.filter(c=>c.path==='/api/places').every(c=>c.args.lat==='45.65'&&c.args.lon==='25.6'&&c.args.radius==='15'));assert.equal(collected.sources.find(s=>s.tool==='ins_series').status,'unavailable');assert.equal(collected.financials.length,5);
 calls.length=0;await core.collectReport({...request,area:{...request.area,scope:'national'}},read,new AbortController().signal);assert(calls.filter(c=>c.path==='/api/places').every(c=>c.args.scope==='all'&&!('lat' in c.args)&&!('radius' in c.args)));assert(!calls.some(c=>c.path==='/api/energy-offers'),'No county assumed for national report');
 const aborted=new AbortController();aborted.abort();await assert.rejects(()=>core.collectReport(request,read,aborted.signal),{name:'AbortError'});
 const outIndex=process.argv.indexOf('--out'),out=outIndex>=0?resolve(process.argv[outIndex+1]):temp;await mkdir(out,{recursive:true});
 const fonts={regular:new Uint8Array(await readFile(join(root,'public/fonts/Inter-Regular.ttf'))),semibold:new Uint8Array(await readFile(join(root,'public/fonts/Inter-Semibold.ttf')))};
 const bytes=await pdf.createBusinessReportPdf(collected,fonts),path=join(out,'Raport_Aflivra_verificare.pdf');await writeFile(path,bytes);const text=execFileSync('pdftotext',[path,'-'],{encoding:'utf8'});assert(text.includes('Cercetare comercială în Brașov'));assert(text.includes('ȘȚÎÂ'));assert(text.includes('Pagina 1 /'));assert(text.includes('n/d'));assert(text.includes('Sursă indisponibilă în verificare'));assert(!text.includes('NaN'));assert(!text.includes('undefined'));assert(bytes.length>20000);
 console.log('Raport verificat: arie locală / națională, eșantion limitat, lipsă distinctă de zero, an comun, ipoteze, anulare și PDF cu diacritice.');
}finally{await rm(temp,{recursive:true,force:true})}
