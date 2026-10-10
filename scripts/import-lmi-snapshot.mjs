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
import {execFileSync} from 'node:child_process';
import {writeSnapshot,registerPrefix} from './snapshot-register.mjs';

const UA='Aflivra-Integration-Evaluation/1.0';
const PAGE_URL='https://patrimoniu.ro/ro/profiles/lista-monumentelor-istorice';
const PDF_LINK_TEXT='București';

const page=await fetch(PAGE_URL,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(55000)});
if(!page.ok)throw Error('HTTP '+page.status+' de la '+PAGE_URL);
const html=await page.text();
const links=[...html.matchAll(/<a[^>]*href="(https:\/\/patrimoniu\.eventya\.net[^"]+)"[^>]*>\s*(București)\s*<\/a>/g)].map(match=>match[1]);
if(!links.length)throw Error('Legătura oficială către PDF-ul București nu a fost găsită pe pagina LMI.');
const temp=await mkdtemp('/tmp/aflivra-lmi-');
const files=[];
try{
 let pdfBytes,lastError=null;
 for(const url of links){
  try{const response=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('HTTP '+response.status);pdfBytes=new Uint8Array(await response.arrayBuffer());
   if(pdfBytes.length>1000000&&pdfBytes[0]===0x25&&pdfBytes[1]===0x50)break;lastError=Error('PDF-ul de la '+url+' nu arată ca lista completă ('+pdfBytes.length+' bytes).');pdfBytes=null;
  }catch(error){lastError=error}
 }
 if(!pdfBytes)throw lastError||Error('PDF-ul LMI București nu a putut fi descărcat.');
 const pdfPath=temp+'/lmi-buc.pdf';
 await writeFile(pdfPath,pdfBytes);
 execFileSync('pdftotext',['-layout',pdfPath,temp+'/lmi-buc.txt']);
 const src=await readFile(temp+'/lmi-buc.txt','utf8');

 // The -layout text keeps the table's visual bands only approximately: column offsets
 // differ between pages and even between rows, so the parse anchors on markers instead
 // of fixed positions — the register prints the locality as `municipiul BUCUREŞTI` /
 // `municipiul BUCUREȘTI` (both diacritic variants occur) in every audited row, and the
 // dating column carries recognizable historiographic shapes. Continuation lines are
 // assigned to a column by their indent relative to the current row's anchors.
 const localityRe=/municipiul BUCURE(?:Ş|Ș)TI/;
 const datingShaped=text=>/^(?:sf\.\s|prima\s|sec\.?\s|înc\.\s|epoca\s|post\s|jum\.\s|anul\s|secolul\s|antichitate|preistor|neolitic|cucuteni|gumelni|sântandrei|petreşti|halstatt|monteoru|costeş|cerneahov|lat[eè]ne|sec$|\d{3,4}\b)/i.test(text.trim());
 const panels=line=>{const out=[];let start=-1;for(let i=0;i<=line.length;i++){const boundary=i===line.length||/\s/.test(line[i]);if(!boundary)if(start<0)start=i;else continue;if(start>=0&&(boundary&&!(i===line.length&&!/\s/.test(line[i-1]||' '))||i===line.length)){out.push({start,text:line.substring(start,i)});start=-1}}return out.filter(panel=>panel.text.length>0)};
 const monuments=[];let stickyDatingX=null,printedPage=null,footerExpected=false,footerOpen=0,footnoteMode=false;
 const codeRe=/^\s*(\d{1,5})\s+(B-(?:I{1,3}|IV|V|VI{0,3}|IX|X{1,3}|XI{0,2})-[a-z]+-(?:A|B)-\d{2,6}(?:\.\d{1,3})?)\s/;
 const headerRe=/Nr\.\s+crt\.?\s+Cod\s+LMI\s+Denumire\s+Localitate\s+Adres[ăa]\s+Datare/;
 for(const line of src.split('\n')){
  if(/^\s*$/.test(line))continue;
  if(headerRe.test(line))continue;
  if(/^\s*MINISTERUL CULTURII\s*$/.test(line)||/^\s*LISTA MONUMENTELOR ISTORICE 2015/.test(line)||/^\s*- Bucureşti -\s*$/.test(line)||/MONITORUL OFICIAL/.test(line))continue;
  if(/^\s*INSTITUTUL NAŢIONAL AL PATRIMONIULUI\s*$/.test(line)){footerExpected=true;continue}
  if(footerExpected){footerExpected=false;if(/^\s*\d{1,3}\s*$/.test(line)){printedPage=Number(line.trim());for(let i=footerOpen;i<monuments.length;i++)monuments[i].printedPage=printedPage;footerOpen=monuments.length;continue}}
  const stripped=line.trim();
  if(stripped.startsWith('(*)')){footnoteMode=true;continue}
  if(footnoteMode){if(codeRe.test(line))footnoteMode=false;else continue}
  const match=codeRe.exec(line);
  if(match&&localityRe.test(line)){
   const codeEnd=match[0].length;
   const localityStart=line.search(localityRe);
   const namePart=line.substring(codeEnd,localityStart).trim();
   const afterLocality=localityStart+line.match(localityRe)[0].length;
   const rest=line.substring(afterLocality);
   const restPanels=panels(rest).map(panel=>({start:afterLocality+panel.start,text:panel.text}));
   let address='',dating='',datingX=null;
   const last=restPanels.at(-1);
   if(last&&restPanels.length>1&&datingShaped(last.text)){address=restPanels.slice(0,-1).map(panel=>panel.text).join(' ').trim();dating=last.text.trim();datingX=last.start;stickyDatingX=datingX}
   else address=restPanels.map(panel=>panel.text).join(' ').trim();
   if(!datingX)datingX=stickyDatingX;
   monuments.push({crt:match[1],code:match[2],name:namePart,locality:'municipiul BUCUREŞTI',address,dating,printedPage,nameX:codeEnd,localityX:localityStart,datingX});
   continue;
  }
  if(!monuments.length)continue;
  const current=monuments.at(-1);
  for(const panel of panels(line)){
   if(panel.start<current.localityX-1){if(panel.text.trim())current.name+=(current.name?' ':'')+panel.text.trim()}
   else if(current.datingX!=null&&panel.start>=current.datingX-2){if(panel.text.trim())current.dating+=(current.dating?' ':'')+panel.text.trim()}
   else if(panel.text.trim())current.address+=(current.address?' ':'')+panel.text.trim();
  }
 }
 for(let i=footerOpen;i<monuments.length;i++)monuments[i].printedPage=printedPage;
 const distinctCodes=new Set(monuments.map(monument=>monument.code));
 if(distinctCodes.size<2300)throw Error('Extragerea a produs '+distinctCodes.size+' coduri distincte, sub pragul de gardă față de 2.474 auditate.');
 const goodRows=monuments.filter(monument=>monument.code&&monument.name);
 const fetchedAt=new Date().toISOString();
 const payload={schema:'aflivra-lmi-bucuresti-v1',sourceUrl:PAGE_URL,base:'LMI 2015',publishedIn:'Monitorul Oficial al României, Partea I, Nr. 113 bis/15.II.2016',
  updateNote:'Baza este lista 2015; ordinele ministeriale ulterioare de actualizare se obțin de la Ministerul Culturii și nu sunt înglobate. Fiecare rând poartă foliul tipărit al Monitorului Oficial, nu numărul de pagină al PDF-ului.',
  pdfBytes:pdfBytes.length,printedPageMax:printedPage,fetchedAt,license:null,
  licenseNote:'Lista Monumentelor Istorice 2015 — București (patrimoniu.ro); licența de reutilizare comercială neconfirmată la '+fetchedAt.slice(0,10)+' — sursă oficială, studiu și verificare personală.',
  counts:{rows:goodRows.length,distinctCodes:distinctCodes.size,extractionNote:'Numerele sunt rezultate de extragere din PDF, nu un recensământ oficial validat de monumente.'},
  rows:goodRows.map(monument=>[monument.code,monument.name,monument.locality,monument.address,monument.dating,monument.printedPage])};
 await writeSnapshot(files,'/lmi/monuments-bucuresti.json',payload);
 await registerPrefix(files,'/lmi/');
 console.log(JSON.stringify({result:'ok',rows:goodRows.length,distinctCodes:distinctCodes.size,printedPageMax:printedPage,bytes:pdfBytes.length}));
}finally{await rm(temp,{recursive:true,force:true})}
