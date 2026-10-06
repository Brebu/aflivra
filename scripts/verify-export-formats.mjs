import assert from 'node:assert/strict';
import {readSnapshotFile as readFile} from './snapshot-read.mjs';
import {writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';import {execFileSync} from 'node:child_process';import ts from 'typescript';
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=await mkdtemp(join(tmpdir(),'aflivra-exports-'));
const outArg=process.argv.indexOf('--out'),out=outArg<0?temp:resolve(process.argv[outArg+1]);
try{
 await mkdir(out,{recursive:true});
 const modules=['lib/data-export.ts','lib/excel-export.ts','lib/document-pdf.ts','lib/legal-pdf.ts','lib/live/legal-reader.ts','lib/live/resource-download.ts','lib/snapshot-cache.ts','lib/snapshot-checksum.ts','lib/transit-export.ts','lib/transit-csv.ts','app/import-preferences.ts'];
 for(const file of modules){let code=ts.transpileModule(await readFile(join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  code=code.replace(/from '((?:\.\/|@\/lib\/)[^']+)'/g,(_,p)=>"from './"+p.split('/').at(-1)+".mjs'");
  for(const pkg of ['xlsx','fflate','pdf-lib','@pdf-lib/fontkit']){const path=pathToFileURL(require.resolve(pkg)).href;code=code.replaceAll("from '"+pkg+"'","from '"+path+"'").replaceAll("import('"+pkg+"')","import('"+path+"')")}
  await writeFile(join(temp,file.split('/').at(-1).replace('.ts','.mjs')),code);
 }
 const load=name=>import(pathToFileURL(join(temp,name+'.mjs'))),data=await load('data-export'),excel=await load('excel-export'),pdf=await load('document-pdf'),XLSX=require('xlsx');
 const original={version:2,preferences:{city:'București',interests:['justitie','transport'],motion:false,large:true},saved:['peles'],plan:[],number:0,identifier:'000123',literal:'=2+2',missing:null,empty:'',nested:{'a/b~c':'Ș ț î â\n"citat", final'},long:'Text integral cu diacritice. '.repeat(2500)};
 assert.deepEqual(data.fieldsToData(data.fieldRows(original)),original);
 const input={title:'Colecția mea',data:original},csv=data.exportCsv(input),csvBook=XLSX.read(csv,{type:'string',raw:true});
 assert.deepEqual(data.fieldsToData(XLSX.utils.sheet_to_json(csvBook.Sheets[csvBook.SheetNames[0]],{header:1,raw:true,defval:''}).slice(1)),original);
 const bytes=excel.createExcelExport(data.exportSheets(input),input.title),book=XLSX.read(bytes,{type:'array'});
 assert.deepEqual(data.fieldsToData(XLSX.utils.sheet_to_json(book.Sheets.Date,{header:1,raw:true,defval:''}).slice(1)),original);
 const importer=await load('import-preferences');assert.deepEqual(await importer.importPreferences(new File([bytes],'preferinte.xlsx')),original);assert.deepEqual(await importer.importPreferences(new File([csv],'preferinte.csv')),original);
 assert.equal(data.exportFileName({title:'Școală',fileName:'test.json'},'xlsx'),'test.xlsx');
 assert.throws(()=>data.fieldsToData([['','object','',1],['/__proto__','object','',1]]));
 const longText='ș'.repeat(34000)+'🌍'+('Final '+original.long),wide=excel.createExcelExport([{name:'Date / 1',columns:['Cod','Număr','Text'],rows:[['00001',0,longText],['=2+2',42,'Finalul foii']]},{name:'date / 1',columns:['Confirmat'],rows:[[false]]}]);
 const largeBook=XLSX.read(wide,{type:'array'});assert.equal(largeBook.SheetNames.length,3);assert.equal(new Set(largeBook.SheetNames.map(n=>n.toLowerCase())).size,3);
 const longRows=XLSX.utils.sheet_to_json(largeBook.Sheets[largeBook.SheetNames.at(-1)],{header:1,raw:true});assert.equal(longRows.slice(1).map(r=>r[4]).join(''),longText);
 const sheet=largeBook.Sheets[largeBook.SheetNames[0]];assert.equal(sheet.A2.v,'00001');assert.equal(sheet.B2.v,0);assert.equal(sheet.A3.v,'=2+2');assert.equal(sheet.A3.f,undefined);
 const {SnapshotCache}=await load('snapshot-cache'),cache=new SnapshotCache(100,3);cache.set('a',{a:1},40);cache.set('b',{b:1},40);cache.get('a');cache.set('c',{c:1},40);assert.equal(cache.get('b'),undefined);assert.equal(cache.get('a').a,1);cache.set('huge',{},101);assert.equal(cache.get('huge'),undefined);assert(cache.retainedBytes<=100);assert(cache.size<=3);
 const hash=await load('snapshot-checksum');for(const n of [0,1,55,56,63,64,65,127,128,129,1000,300001]){const sample=randomBytes(n);assert.equal(await hash.portableChecksum(sample),createHash('sha256').update(sample).digest('hex'))}
 const abort=new AbortController();abort.abort();await assert.rejects(()=>hash.portableChecksum(new Uint8Array(),abort.signal),{name:'AbortError'});
 const network=JSON.parse(await readFile(join(root,'public/transit/network.json'),'utf8')),route=network.routes.find(r=>r.name==='1'),fflate=require('fflate');
 const routeData=JSON.parse(new TextDecoder().decode(await readFile(join(root,'public/transit',route.file+'.gz')))),transit=await load('transit-export'),sheets=transit.transitExportSheets(routeData);
 assert.equal(sheets.find(s=>s.name==='Opriri și ore').rows.length,22842);assert.equal(sheets.find(s=>s.name==='Curse').rows.length,846);
 const routeBook=XLSX.read(excel.createExcelExport(sheets,'Linia 1'),{type:'array'});const times=XLSX.utils.sheet_to_json(routeBook.Sheets['Opriri și ore'],{header:1,raw:true,defval:''});assert.equal(times.length,22843);assert.deepEqual(times.at(-1),Object.values(routeData.stopTimes).flat().at(-1));
 const zip=new Uint8Array(await readFile(join(root,'public/transit/TPBI_GTFS.zip'))),stream=await load('transit-csv');
 const expected=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',['-c',String.raw`import zipfile,hashlib,json,sys
out={}
with zipfile.ZipFile(sys.argv[1]) as z:
 for info in z.infolist():
  digest=hashlib.sha256();lines=0
  with z.open(info) as f:
   while chunk:=f.read(1048576):digest.update(chunk);lines+=chunk.count(b'\n')
  out[info.filename]={'bytes':info.file_size,'sha256':digest.hexdigest(),'lines':lines}
print(json.dumps(out))`,join(root,'public/transit/TPBI_GTFS.zip')],{encoding:'utf8'}));
 const verified=[];for(const [file] of stream.transitFiles){const reader=stream.transitCsvStream(zip,file+'.txt').getReader(),digest=createHash('sha256');let count=0,lines=0,first=true,maxChunk=0;
  while(true){const part=await reader.read();if(part.done)break;let value=part.value;if(first){assert.deepEqual([...value.slice(0,3)],[239,187,191]);value=value.slice(3);first=false}digest.update(value);count+=value.length;maxChunk=Math.max(maxChunk,value.length);for(const n of value)if(n===10)lines++}
  assert.equal(count,expected[file+'.txt'].bytes);assert.equal(digest.digest('hex'),expected[file+'.txt'].sha256);assert.equal(lines,expected[file+'.txt'].lines);assert(maxChunk<1000000,'CSV decompression must not queue a whole large table');verified.push({file,bytes:count,lines});
 }
 assert.throws(()=>stream.transitCsvStream(zip,'../file'));const cancelled=stream.transitCsvStream(zip,'stop_times.txt').getReader();await cancelled.read();await cancelled.cancel();assert((await cancelled.read()).done);
 const manifest=JSON.parse(await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8')),civil=manifest.items.find(a=>a.type==='CODUL CIVIL');
 const lawReader=await load('legal-reader'),text=lawReader.readableLawText(await readFile(join(root,'public',civil.file),'utf8'));
 const fonts={regular:new Uint8Array(await readFile(join(root,'public/fonts/Inter-Regular.ttf'))),semibold:new Uint8Array(await readFile(join(root,'public/fonts/Inter-Semibold.ttf')))};
 const cases=[{name:'fisa-completa.pdf',input:{title:'Fișa completă · Școală și bibliotecă',subtitle:'Sursa publică · 5 octombrie 2026',data:{nume:'Biblioteca Română',adresă:'Strada Școlii, nr. 42',contact:'https://example.test/'+('identificator'.repeat(25)),telefon:'021 000 000',servicii:[],detalii:{},indisponibil:null,text:original.long}}},{name:'codul-civil-integral.pdf',input:{title:civil.title,subtitle:civil.sourceUrl,text}}];
 for(const item of cases){const path=join(out,item.name);await writeFile(path,await pdf.createDocumentPdf(item.input,fonts));const source=join(temp,'expected.txt');await writeFile(source,item.input.text||original.long);
  const extracted=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8',maxBuffer:12000000}).replace(/^\s*Aflivra\s*$/gm,'').replace(/^\s*\d+\s+\/\s+\d+\s*$/gm,'');
  const norm=value=>value.replace(/\s+/g,'').replaceAll('\uFEFF','');assert(norm(extracted).includes(norm(item.input.text||original.long)),'Every source character, including final article, must be preserved');
  if(item.input.data){assert(extracted.includes('Listă fără înregistrări'));assert(extracted.includes('Obiect fără câmpuri'));assert(extracted.includes('Nefurnizat (null)'))}
  const info=execFileSync('pdfinfo',[path],{encoding:'utf8'}),pages=Number(info.match(/^Pages:\s+(\d+)/m)[1]);console.log(item.name,JSON.stringify({pages,characters:(item.input.text||original.long).length,fullText:true}));
 }
 console.log(JSON.stringify({status:'passed',preferences:'CSV and Excel round-trip',excel:'All sheets, typed values, leading zeros, long text and literal formulas preserved',transit:verified,cache:'byte and count budgets, LRU, abort, SHA-256 fallback verified',out:outArg<0?'temporary':out},null,2));
}finally{await rm(temp,{recursive:true,force:true})}
