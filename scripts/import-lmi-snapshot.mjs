// Offline corpus import for the LMI 2015 Bucharest historic monuments list: downloads
// the official PDF (Lista Monumentelor Istorice 2015 — București, published inMonitorul
// Oficial Partea I nr. 113 bis/15.II.2016), extracts the text with pdftotext -layout and
// rebuilds the rows from the fixed column bands of each page (Nr. crt. | Cod LMI |
// Denumire | Localitate | Adresă | Datare), detecting the bands from the header line of
// the page itself — never a fixed offset. The corpus is a 2015 base: later ministerial
// orders are a separate update process and the corpus says so. Extraction counts are
// served as counts, never as a validated monument census.
// Run from the repo root: node scripts/import-lmi-snapshot.mjs
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeSnapshotIfChanged,registerPrefix} from './snapshot-register.mjs';
import {validateFixtureManifest} from './lib/fixture-manifest.mjs';
import {assembleMonumentRows} from './lib/lmi-rows.mjs';

const UA='Aflivra-Integration-Evaluation/1.0';
const PAGE_URL='https://patrimoniu.ro/ro/profiles/lista-monumentelor-istorice';
const PDF_LINK_TEXT='București';

// Modul local (N01): --input-dir/--source-dir citește PDF-ul oficial din pachetul de
// probe (bytes+SHA-256 verificate prin --manifest), fără fetch la patrimoniu.ro.
const argValue=flag=>{const i=process.argv.indexOf(flag);return i>=0&&i+1<process.argv.length?process.argv[i+1]:null};
const inputDir=argValue('--input-dir')||argValue('--source-dir');
const manifestPath=argValue('--manifest');
if(inputDir&&!manifestPath)throw Error('Modul local --input-dir cere --manifest (pachetul de probe verificate, cu amprentele SHA-256).');
if(inputDir)await validateFixtureManifest({manifestPath,inputDir,names:['lmi-bucuresti-2015.pdf']});

let pdfBytes;
const temp=await mkdtemp('/tmp/aflivra-lmi-');
const files=[];
try{
 if(inputDir){
  pdfBytes=new Uint8Array(await readFile(join(inputDir,'lmi-bucuresti-2015.pdf')));
 }else{
  const page=await fetch(PAGE_URL,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(55000)});
  if(!page.ok)throw Error('HTTP '+page.status+' de la '+PAGE_URL);
  const html=await page.text();
  const links=[...html.matchAll(/<a[^>]*href="(https:\/\/patrimoniu\.eventya\.net[^"]+)"[^>]*>\s*(București)\s*<\/a>/g)].map(match=>match[1]);
  if(!links.length)throw Error('Legătura oficială către PDF-ul București nu a fost găsită pe pagina LMI.');
  let lastError=null;
  for(const url of links){
   try{const response=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('HTTP '+response.status);const candidate=new Uint8Array(await response.arrayBuffer());
    if(candidate.length>1000000&&candidate[0]===0x25&&candidate[1]===0x50){pdfBytes=candidate;break}lastError=Error('PDF-ul de la '+url+' nu arată ca lista completă ('+candidate.length+' bytes).');
   }catch(error){lastError=error}
  }
  if(!pdfBytes)throw lastError||Error('PDF-ul LMI București nu a putut fi descărcat.');
 }
 const pdfPath=temp+'/lmi-buc.pdf';
 await writeFile(pdfPath,pdfBytes);
 // D07: rândurile se asamblează pe geometria tipărită a tabelului (pdftotext
 // -bbox-layout → helperul Python std-lib → asamblarea pe coloane), nu pe panouri de
 // cuvinte cu euristici de ultim cuvânt — datarea nu se mai scurge în adrese.
 execFileSync('pdftotext',['-bbox-layout',pdfPath,temp+'/lmi-bbox.xml']);
 const extracted=JSON.parse(execFileSync('python3',[join(import.meta.dirname,'lib/lmi-bbox.py'),temp+'/lmi-bbox.xml'],{encoding:'utf8',maxBuffer:128*1024*1024}));
 const {rows:monuments,diagnostics:lmiDiagnostics}=assembleMonumentRows(extracted.pages);
 const distinctCodes=new Set(monuments.map(monument=>monument[0]));
 if(distinctCodes.size<2300)throw Error('Extragerea a produs '+distinctCodes.size+' coduri distincte, sub pragul de gardă față de 2.474 auditate.');
 const goodRows=monuments.filter(monument=>monument[0]&&monument[1]);
 if(goodRows.some(monument=>!Number.isInteger(monument[5])||monument[5]<=0))throw Error('Un rând fără foliul tipărit al Monitorului nu se poate servi.');
 const fetchedAt=new Date().toISOString();
 const payload={schema:'aflivra-lmi-bucuresti-v2',sourceUrl:PAGE_URL,base:'LMI 2015',publishedIn:'Monitorul Oficial al României, Partea I, Nr. 113 bis/15.II.2016',
  updateNote:'Baza este lista 2015; ordinele ministeriale ulterioare de actualizare se obțin de la Ministerul Culturii și nu sunt înglobate. Fiecare rând poartă foliul tipărit al Monitorului Oficial și pagina PDF, separate — foliul nu e indexul PDF-ului.',
  pdfBytes:pdfBytes.length,printedPageMax:goodRows.reduce((max,row)=>Math.max(max,row[5]),0),extractionDiagnostics:lmiDiagnostics,fetchedAt,license:null,
  licenseNote:'Lista Monumentelor Istorice 2015 — București (patrimoniu.ro); licența de reutilizare comercială neconfirmată la '+fetchedAt.slice(0,10)+' — sursă oficială, studiu și verificare personală.',
  counts:{rows:goodRows.length,distinctCodes:distinctCodes.size,extractionNote:'Numerele sunt rezultate de extragere din PDF, nu un recensământ oficial validat de monumente.'},
  rows:goodRows};
 const {skipped}=await writeSnapshotIfChanged(files,'/lmi/monuments-bucuresti.json',payload,{contentKeys:['rows']});
 await registerPrefix(files,'/lmi/');
 console.log(JSON.stringify({result:'ok',rows:goodRows.length,distinctCodes:distinctCodes.size,printedPageMax:payload.printedPageMax,bytes:pdfBytes.length,diagnostics:lmiDiagnostics,skipped}));
}finally{await rm(temp,{recursive:true,force:true})}
