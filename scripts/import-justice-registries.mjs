// Rebuild only the bundled justice-registry seeds (notari, experți judiciari, experți tehnici).
// Uses the real lib/live/justice.ts parsers transpiled offline (the harness pattern), verifies
// every published structure before accepting it, and keeps the previous verified seed on any
// failure. The traducători registry (≈38.000 de înregistrări) is deliberately not bundled —
// it is fetched once and served from the persistent copy; its refresh story lives in
// lib/live/refresh-groups.json.
import {readFile,writeFile,mkdtemp,rm,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=await mkdtemp(join(root,'.sites-runtime/justice-seeds-'));
const cacheDir=resolve(root,'ssnc-agent-orch/2026/10/06/media-expansion/probes');
const datasets={notari:'bc69c898-b356-4e2c-9251-1833857d1a6e','experti-judiciari':'476a8363-7c91-43e2-99d2-4fbe144c8e2a','experti-tehnici':'3f26ecb7-df7e-454e-a029-89dbd6d82c3f'};
const fixturePath={notari:'notari.xlsx','experti-judiciari':'experti-judiciari.xlsx','experti-tehnici':'experti-tehnici.xlsx'};
const resourceNames={notari:'Notari 23.01.2025','experti-judiciari':'Experti judiciari 23.01.2025','experti-tehnici':'Lista experților tehnici atestați până la data de 08 iunie 2026.xlsx'};
const report=[];
try{
 let source=await readFile(join(root,'lib/live/justice.ts'),'utf8');
 source=source
  .replace("import {getSource,SourceError} from './adapters';","const getSource=async()=>{throw Error('offline')};class SourceError extends Error{}")
  .replace("import {downloadResource} from './resources';","const downloadResource=async()=>{throw Error('offline')};");
 const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("from 'xlsx'","from '"+pathToFileURL(require.resolve('xlsx')).href+"'");
 await writeFile(join(temp,'justice.mjs'),output);
 const {parseJusticeRegistry}=await import(pathToFileURL(join(temp,'justice.mjs')));
 const seeds=JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8'));
 for(const kind of Object.keys(datasets)){
  let bytes=null;
  try{await access(join(cacheDir,fixturePath[kind]));bytes=await readFile(join(cacheDir,fixturePath[kind]))}catch{}
  if(!bytes){
   const meta=JSON.parse(await (await fetch('https://data.gov.ro/api/3/action/package_show?id='+datasets[kind],{headers:{'User-Agent':'Aflivra/1.0 public-data-reader'},signal:AbortSignal.timeout(30000)})).text());
   const resource=(meta.result?.resources||[]).find(resource=>String(resource.name||'').trim()===resourceNames[kind]);
   if(!resource||new URL(resource.url).origin!=='https://data.gov.ro')throw Error('Exportul registrului nu este disponibil.');
   const response=await fetch(resource.url,{headers:{'User-Agent':'Aflivra/1.0 public-data-reader'},signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   bytes=Buffer.from(await response.arrayBuffer());
   await writeFile(join(cacheDir,fixturePath[kind]),bytes);
  }
  try{
   const loaded=parseJusticeRegistry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),kind,resourceNames[kind]);
   seeds['justice:'+kind]={fetchedAt:new Date().toISOString(),publishedAt:loaded.publishedAt,sourceUrl:'https://data.gov.ro/dataset/'+datasets[kind],data:loaded.data};
   report.push({kind,status:'verified',records:loaded.data.total,period:loaded.data.period,publishedAt:loaded.publishedAt});
  }catch(error){report.push({kind,status:'retained',error:error.message,hasPreviousSeed:!!seeds['justice:'+kind]})}
  await new Promise(r=>setTimeout(r,1000));
 }
 await writeFile(join(root,'lib/live/server-seed.json'),JSON.stringify(seeds)+'\n');
 console.log(JSON.stringify(report));
}finally{await rm(temp,{recursive:true,force:true})}
