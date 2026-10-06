// QR-2 probe: the first federated search of a fresh mount must fire the network fan-out
// exactly once per planned family — a late-arriving stories corpus re-creates `base` but
// must NOT re-trigger the fan-out (the reviewer's double-fire mechanism).
// LEG 0 (offline): the request plan is a pure function of the settled term alone — options
// (gallery/stories corpora) never change the planned requests.
// LEG 1 (browser): deep-link a term, wait out the corpus arrival, assert every planned
// family URL fired exactly once.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'../../../../..');
const {readSnapshotFile}=await import(pathToFileURL(join(root,'scripts/snapshot-read.mjs')).href);
const term='harap';
const expected=(q=>[
  '/api/places?'+new URLSearchParams({category:'local-all',q,scope:'all',sort:'name',page:'0'}),
  '/api/catalog?'+new URLSearchParams({q,page:'0',geoScope:'national'}),
  '/api/lawyers?'+new URLSearchParams({q,page:'0',sort:'recent',geoScope:'national'}),
  ...['schools','health','pharmacies','hospitals'].map(kind=>'/api/directory?'+new URLSearchParams({kind,q,page:'0',geoScope:'national'})),
  ...['stiri','agricultura'].map(kind=>'/api/domain?'+new URLSearchParams({kind,q,page:'0',sort:'recent',geoScope:'national'}))
])(term);

console.log('LEG 0 — offline: the request plan is independent of the eager corpora');
const temp=await mkdtemp(join(tmpdir(),'aflivra-qr2-'));
let planInvariant='';
try{
  async function compile(name,path,transform=s=>s){const source=transform(readFileSync(join(root,path),'utf8')),js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");await writeFile(join(temp,name+'.mjs'),js);return import(pathToFileURL(join(temp,name+'.mjs')))}
  const query=await compile('query','lib/live/query.ts');
  const topics=await compile('topics','lib/dashboard-topics.ts');
  const federated=await compile('federated','lib/live/federated.ts',s=>s
    .replace("from '@/lib/live/query'","from './query'")
    .replace("from '@/lib/dashboard-topics'","from './topics'"));
  const stories=JSON.parse(await readSnapshotFile(join(root,'public/stories/index.json'),'utf8')).items;
  const gallery=[{id:'peles',name:'Castelul Peleș',kind:'Castel & muzeu',city:'Sinaia',region:'Prahova'}];
  for(const probe of [term,'ab','']){
    const bare=JSON.stringify(federated.federatedSearch(probe).requests);
    const full=JSON.stringify(federated.federatedSearch(probe,{gallery,stories}).requests);
    assert.equal(bare,full,'the planned requests must never depend on the eager corpora: "'+probe+'"');
  }
  planInvariant='requests identical for bare vs full options (harap / ab / blank)';
  console.log('   ' + planInvariant);
}finally{await rm(temp,{recursive:true,force:true})}

console.log('LEG 1 — browser: fresh deep-linked mount, fan-out fired once per family');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:800}});
await context.addInitScript(()=>{try{localStorage.removeItem('aflivra.location.v1')}catch{}});
const page=await context.newPage();
const t0=Date.now(),log=[],counts=new Map(expected.map(u=>[u,0]));
page.on('request',r=>{
  if(r.resourceType()!=='fetch')return;
  const url=new URL(r.url()),key=url.pathname+url.search;
  if(counts.has(key))counts.set(key,counts.get(key)+1);
  log.push({t:Date.now()-t0,type:r.resourceType(),url:key});
});
await page.goto('http://localhost:5173/#view=explore&q='+term,{waitUntil:'domcontentloaded'});
for(let i=0;i<90;i++){if(await page.locator('[data-testid="federated-results"]').count())break;await page.waitForTimeout(500)}
assert.ok(await page.locator('[data-testid="federated-results"]').count()>0,'the federated section must render for the deep-linked term');
await page.waitForTimeout(8000);
const corpusArrived=log.some(r=>r.url==='/stories/index.json.gz');
const rows=await page.locator('[data-testid="federated-row"]').count();
const failures=[...counts].filter(([,n])=>n!==1).map(([u,n])=>u+' fired '+n+'×');
const evidence={term,corpusArrived,rows,counts:Object.fromEntries(counts),failures,log};
const fs=await import('node:fs');
fs.writeFileSync(resolve(import.meta.dirname,'probes/qr2-fanout.json'),JSON.stringify(evidence,null,1));
console.log('   corpus arrived:',corpusArrived,'· rows:',rows);
for(const [url,n] of counts)console.log('   '+n+'× '+url);
if(failures.length){console.error('QR-2 RED: '+failures.join(' | '));process.exit(1)}
if(!corpusArrived){console.error('QR-2 probe invalid: the stories corpus never arrived inside the window — the re-fire trigger was never exercised');process.exit(1)}
console.log('QR-2 GREEN: every planned family URL fired exactly once');
await context.close();await browser.close();
