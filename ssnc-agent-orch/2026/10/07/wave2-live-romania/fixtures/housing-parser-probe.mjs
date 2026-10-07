import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';

const root=new URL(process.cwd()+'/',import.meta.url),require=createRequire(import.meta.url);
const temp=await mkdtemp(join(tmpdir(),'aflivra-housing-probe-'));
try{
 const stubs=`
export class SourceError extends Error{constructor(message,retryAfter=0,diagnostic){super(message);this.retryAfter=retryAfter;this.diagnostic=diagnostic}}
`;
 await writeFile(join(temp,'adapters.mjs'),stubs);
 await writeFile(join(temp,'resources.mjs'),'export async function downloadResource(){throw Error("probe");}');
 let source=await readFile(new URL('lib/live/housing.ts',root),'utf8');
 source=source.replace(/import \{getSource,SourceError\} from '\.\/adapters';/,"import {SourceError} from './adapters.mjs';")
  .replace(/import \{downloadResource\} from '\.\/resources';/,"import {downloadResource} from './resources.mjs';")
  .replace(/import \{read,utils\} from 'xlsx';/,"import {read,utils} from "+JSON.stringify(require.resolve('xlsx'))+";");
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 await writeFile(join(temp,'housing.mjs'),js);
 const housing=await import(pathToFileURL(join(temp,'housing.mjs')));
 const bytesFor=path=>{const b=require('fs').readFileSync(new URL(path,root));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
 const anl=housing.parseAnlSites(bytesFor('ssnc-agent-orch/2026/10/07/wave2-live-romania/fixtures/anl-obiective-2025.xls'),'Listaobiectiverecepionatelocuintetineri_11.03.2025.xls');
 console.log('ANL sites:',anl.data.records.length,'| counties:',new Set(anl.data.records.map(r=>r['Judeţ'])).size,'| unitsTotal:',anl.data.unitsTotal,'| edition:',anl.data.edition,'| period:',anl.data.period,'| publishedAt:',anl.publishedAt);
 console.log('ANL years series:',anl.data.years.length,'first:',JSON.stringify(anl.data.years.slice(0,3)),'sum years:',anl.data.years.reduce((a,y)=>a+y.value,0));
 console.log('ANL first record:',JSON.stringify(anl.data.records[0]));
 const idx=anl.data.records.findIndex(r=>String(r['Amplasament']).includes('Lalelelor'));
 console.log('ANL lalelelor record:',idx>=0?JSON.stringify(anl.data.records[idx]):'NOT FOUND');
 const ancpi=housing.parseAncpiMortgages(bytesFor('ssnc-agent-orch/2026/10/07/wave2-live-romania/fixtures/ancpi-ipoteci-ianuarie-2024.xlsx'));
 console.log('ANCPI monthLabel:',ancpi.data.monthLabel,'| counties:',ancpi.data.countyCount,'| total:',ancpi.data.total,'| operations:',JSON.stringify(ancpi.data.operations));
 console.log('ANCPI byType:',JSON.stringify(ancpi.data.byType));
 console.log('ANCPI top county:',JSON.stringify(ancpi.data.byCounty[0]));
 console.log('PROBE OK');
}catch(e){console.error('PROBE FAILED:',e.message);process.exit(1)}finally{await rm(temp,{recursive:true,force:true})}
