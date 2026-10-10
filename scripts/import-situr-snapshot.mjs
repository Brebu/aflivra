// Offline corpus import for the SITUR tourist structure registries (unități de
// cazare/alimentație publică și agenții de turism licențiate): downloads the three
// official Excel exports from se.situr.gov.ro, detects the header by content (the
// sheet carries 4 blank rows, a title row and then the header — the offset is never
// trusted, the labels are), keeps every original column and writes one corpus file
// per kind plus the profile of the honest gaps (CUI lipsă, detaliu de adresă lipsă)
// under public/data/situr/. The Worker never re-fetches the exports; it serves the
// verified corpus. License of commercial reuse: unconfirmed — recorded in the corpus.
// Run from the repo root: node scripts/import-situr-snapshot.mjs
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import XLSX from 'xlsx';
import {writeSnapshot,registerPrefix} from './snapshot-register.mjs';

const UA='Aflivra-Integration-Evaluation/1.0';
const KINDS=[
 {kind:'cazare',type:'listaCazari',labels:['Tip unitate','Nume unitate','Tip categorie','Număr spații','Număr locuri','Alte detalii adresă','Tip localitate','Localitate componentă','Localitate','Județ','Email','Web','Tip Operator Economic','Operator Economic','Număr Înregistrare','Cod Unic Înregistrare','Număr autorizație','Dată emitere autorizație'],documentedRows:32058},
 {kind:'alimentatie',type:'listaAlimentatie',labels:['Tip structură','Denumirea unității','Categoria','Nr. locuri','Detalii adresă','Localitate/Sector','Județ','Tip Operator Economic','Operator Economic','Număr Ordine în Registrul Comerțului','Cod Unic Înregistrare','Număr certificat','Data emiterii'],documentedRows:9063},
 {kind:'agentii',type:'listaAgentii',labels:['Număr LICENȚĂ','LICENȚĂ/ANEXĂ','Data emiterii','Operator economic','Număr Ordine în Registrul Comerțului','Denumirea agenției','C.U.I','Adresă','Localitate','Județ','Tip agenție','Site Web','Email'],documentedRows:3104}];

const cellText=cell=>{if(cell==null)return '';const v=cell.w??cell.v;return v==null?'':String(v).trim()};

async function download(url,dest){
 try{const response=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  return new Uint8Array(await response.arrayBuffer());
 }catch(error){if(dest){await writeFile(dest,new Uint8Array());throw error}throw error}
}

// The index page carries its own "actualizată la" date, which can disagree with the
// export titles (10.10 vs 09.10 observed): both are kept, never reconciled.
const roDateFromText=text=>{const m=/(?:actualizat[ăa][^。\n]{0,40}?|ACTUALIZAT[ĂA][^。\n]{0,40}?)(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text)||/(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(text));if(!m)return null;return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0')};

const temp=await mkdtemp('/tmp/aflivra-situr-');
const files=[];
try{
 let pageDate=null;
 try{const page=await download('https://se.situr.gov.ro/OpenData/OpenDataMain');pageDate=roDateFromText(new TextDecoder().decode(page));}catch{pageDate=null}
 const fetchedAt=new Date().toISOString();
 for(const spec of KINDS){
  const xlsxBytes=await download('https://se.situr.gov.ro/OpenData/ExportToExcel?type='+spec.type);
  const wb=XLSX.read(xlsxBytes,{dense:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=ws['!data']||[];
  const headerIndex=rows.findIndex(row=>{const cells=(row||[]).map(cellText);return spec.labels.every((label,i)=>cells[i]===label)});
  if(headerIndex<0)throw Error('Antetul așteptat nu a fost găsit în exportul '+spec.type+'.');
  const titleRows=rows.slice(0,headerIndex).filter(row=>(row||[]).some(cell=>cellText(cell)));
  if(!titleRows.length)throw Error('Titlul exportului lipsește pentru '+spec.type+'.');
  const title=titleRows.map(row=>(row||[]).map(cellText).filter(Boolean).join(' ')).join(' ');
  const exportDate=roDateFromText(title.split(' - ')[0])||roDateFromText(title);
  const dataRows=rows.slice(headerIndex+1).filter(row=>(row||[]).some(cell=>cellText(cell))).map(row=>spec.labels.map((_,i)=>cellText((row||[])[i])));
  if(dataRows.length<Math.floor(spec.documentedRows*0.6))throw Error('Exportul '+spec.type+' are '+dataRows.length+' rânduri, sub pragul de gardă față de '+spec.documentedRows+' documentate.');
  const idx=Object.fromEntries(spec.labels.map((label,i)=>[label,i]));
  const missingCui=dataRows.filter(row=>!row[idx['Cod Unic Înregistrare']??idx['C.U.I']]).length;
  const addressDetailLabel=spec.labels.find(label=>/detalii adresă/i.test(label))||spec.labels.find(label=>/^Adresa/i.test(label))||spec.labels.find(label=>/^Adresă/.test(label));
  const missingAddressDetail=dataRows.filter(row=>!row[idx[addressDetailLabel]]).length;
  const payload={schema:'aflivra-situr-'+spec.kind+'-v1',kind:spec.kind,sourceUrl:'https://se.situr.gov.ro/OpenData/ExportToExcel?type='+spec.type,exportTitle:title,exportDate,pageDate,fetchedAt,license:null,
   licenseNote:'Registru oficial de clasificare/licențiere (se.situr.gov.ro); licența de reutilizare comercială neconfirmată la '+fetchedAt.slice(0,10)+' — sursă oficială, studiu și verificare personală.',
   columns:spec.labels,counts:{rows:dataRows.length,documentedRows:spec.documentedRows,missingCui,missingAddressDetail},rows:dataRows};
  const bytes=await writeSnapshot(files,'/situr/'+spec.kind+'.json',payload);
  console.log(spec.kind+': rows='+dataRows.length+' bytes='+bytes+' exportDate='+exportDate+' pageDate='+pageDate+' missingCui='+missingCui);
 }
 await registerPrefix(files,'/situr/');
 console.log(JSON.stringify({result:'ok',files:files.map(f=>f.path),pageDate}));
}finally{await rm(temp,{recursive:true,force:true})}
