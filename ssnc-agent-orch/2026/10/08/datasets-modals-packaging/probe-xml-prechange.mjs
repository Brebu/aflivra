// DER probe (one-off, pre-change loader): proves the remaining resource/xml-table matrix
// cells fail on the UNMODIFIED parseResource — the matrix aborts at its first failing cell
// (format-zip-shp, logged in matrix-prechange-RED.log), so the variants below are proven
// directly. Recipe mirrors scripts/verify-downloads.mjs' transpile of lib/live/resources.
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'../../../../..'),temp=await mkdtemp(join(tmpdir(),'aflivra-der-xml-')),require=createRequire(import.meta.url);
const outcomes=[];
try{
 for(const name of ['location-context','geographic-scope','tabular-geography']){
  let source=await readFile(join(root,'lib',name+'.ts'),'utf8');
  for(const [binding,file] of [['countyLookup','public/data/locality-counties.json'],['urbanLocalities','public/data/geographic-localities.json']])source=source.replace("import "+binding+" from '@/"+file+"';",'const '+binding+'='+await readFile(join(root,file),'utf8')+';');
  source=source.replace("from './live/query'","from './query'");
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
  await writeFile(join(temp,name+'.mjs'),js);
 }
 for(const name of ['resource-copy','catalog-metadata','resources','adapters','catalog-categories','records','query','text','media','source-xml']){
  let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
  source=source.replace("import audit from '@/public/catalog/audit.json';",'const audit='+await readFile(join(root,'public/catalog/audit.json'),'utf8')+';')
   .replace("import {env} from 'cloudflare:workers';",'const env={};')
   .replace("from '../tabular-geography'","from './tabular-geography'").replace("from '../geographic-scope'","from './geographic-scope'");
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  js=js.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
  for(const pkg of ['xlsx','fflate'])js=js.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");
  await writeFile(join(temp,name+'.mjs'),js);
 }
 const {parseResource}=await import(pathToFileURL(join(temp,'resources.mjs')));
 const enc=s=>new TextEncoder().encode(s);
 const tableXml=enc('<Contracte><Contract id="1" tip="FARM"><Furnizor>Furnizor public de verificare 1</Furnizor></Contract><Contract id="2"><Furnizor>Furnizor public de verificare 2</Furnizor></Contract></Contracte>');
 const record=(name,fn)=>{try{const r=fn();outcomes.push({cell:name,today:r})}catch(error){outcomes.push({cell:name,today:'thrown: '+error.message})}};
 record('success (XML tabular → tabel)',()=>parseResource(tableXml,'XML').data.kind);
 record('format-xml-dot (XML. → cititor XML)',()=>parseResource(tableXml,'XML.').data.kind);
 record('format-xslx (XSLX → cititor Excel)',()=>parseResource(tableXml,'XSLX').data.kind);
 record("format-json-soap ('JSON, SOAP, XML' → cititor JSON)",()=>parseResource(tableXml,'JSON, SOAP, XML').data.kind);
 console.log(JSON.stringify({probe:'pre-change parseResource',outcomes},null,1));
}catch(e){console.error(String(e&&e.message||e));process.exitCode=1}
finally{await rm(temp,{recursive:true,force:true})}
