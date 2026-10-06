import assert from 'node:assert/strict';
import {readSnapshotFile as readFile} from './snapshot-read.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-law-reader-'));
const compact=text=>text.replace(/\s+/g,'');
try{
 for(const name of ['text','legal-reader','legal-consolidation']){
  const source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
  await writeFile(join(temp,name+'.mjs'),compiled);
 }
 const reader=await import(pathToFileURL(join(temp,'legal-reader.mjs'))),versions=await import(pathToFileURL(join(temp,'legal-consolidation.mjs')));
 const fixture='Fișa actului\nTitlul PRELIMINAR\nDespre lege\nArticolul 1\nDenumirea articolului\n(1) Un alineat citează Articolul 99 și păstrează valoarea 1 + 2.\n(2) Alt alineat, inclusiv citarea art. 2 alin. (1).\na) Prima literă.\nb) Ultima literă.\nNotă\nTextul notei finale.\nSecțiunea a 2-a\nReguli în spațiu\nArticolul 2\nText integral.\nPartea SPECIALĂ\nArticolul 3\nText final.';
 const sections=reader.lawSections(fixture);
 assert.deepEqual(sections.filter(s=>s.kind==='article').map(s=>s.title),['Articolul 1','Articolul 2','Articolul 3']);
 for(const label of ['Titlul PRELIMINAR','Secțiunea a 2-a','Partea SPECIALĂ'])assert(sections.some(s=>s.kind==='heading'&&s.title===label));
 assert(!sections.find(s=>s.title==='Articolul 1').body.includes('Reguli în spațiu'));
 const paragraphs=reader.lawParagraphs(sections.find(s=>s.title==='Articolul 1').body);
 assert.deepEqual(paragraphs.map(p=>p.kind),['title','clause','clause','list','list','note']);
 assert.equal(compact(paragraphs.map(p=>p.text).join('\n')),compact(sections.find(s=>s.title==='Articolul 1').body));
 assert(paragraphs[2].text.includes('art. 2 alin. (1).'),'Inline cross-references cannot create another clause');
 assert.equal(reader.lawSections('Articolul 112^1\nText întreg.')[0].title,'Articolul 112^1');
 assert.equal(reader.lawSections('Secțiunea UNICĂ\nText întreg.')[0].title,'Secțiunea UNICĂ');

 const boundary=reader.lawSections(Array.from({length:13},(_,i)=>(i===12?'Capitolul II\nCapitol nou\n':'')+'Articolul '+(i+1)+'\n(1) Textul '+(i+1)+'.\n(2) Final.').join('\n'));
 assert.equal(reader.lawPage(boundary,0).items.filter(s=>s.kind==='article').length,12);
 assert.equal(reader.lawPage(boundary,1).items[0].title,'Capitolul II');
 assert.equal(reader.lawPage(boundary,99).page,1);
 assert.equal(reader.lawPage([],0).items.length,0);
 assert.equal(reader.lawPage(sections.filter(s=>s.kind==='heading'),0).items.length,3);

 const manifest=JSON.parse(await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8'));
 let articles=0;
 for(const act of manifest.items){
  const original=await readFile(join(root,'public',act.file),'utf8'),clean=reader.readableLawText(original),parts=reader.lawSections(original),count=reader.lawPage(parts,0).pages;
  assert.equal(compact(parts.map(s=>s.text).join('\n')),compact(clean),'Every source character must remain in the reader');
  const pages=Array.from({length:count},(_,page)=>reader.lawPage(parts,page).items);
  assert.deepEqual(pages.flat(),parts,'Pagination must preserve all sections in source order');
  for(const page of pages)assert(page.filter(s=>s.kind==='article').length<=12);
  for(const part of parts)assert.equal(compact(reader.lawParagraphs(part.body).map(p=>p.text).join('\n')),compact(part.body),'Every clause and note must survive paragraph layout');
  if(act.type==='CODUL CIVIL')assert(parts.some(s=>s.title==='Titlul PRELIMINAR'&&s.kind==='heading'));
  if(act.type==='CODUL PENAL'){
   assert(parts.some(s=>s.title==='Partea GENERALĂ'&&s.kind==='heading'));
   assert(parts.some(s=>s.title==='Secţiunea a 2-a'||s.title==='Secțiunea a 2-a'));
   assert(!parts.find(s=>s.title==='Articolul 7').body.includes('Secţiunea a 2-a'));
  }
  articles+=parts.filter(s=>s.kind==='article').length;
 }
 const asOf=versions.legalToday(),currentAct={textProvided:true,consolidation:{kind:'consolidated',versionId:'70000',versionDate:'2026-01-01',asOf,checkedAt:new Date().toISOString(),sourceUrl:'https://legislatie.just.ro/Public/DetaliiDocument/70000',futureVersions:[]}};
 assert(versions.lawReadingStatus(currentAct,{status:'fresh',error:null}).current);
 assert(versions.lawReadingStatus(currentAct,{status:'cached',error:null}).current);
 assert(!versions.lawReadingStatus(currentAct,{status:'stale',error:'HTTP 502'}).current);
 assert(!versions.lawReadingStatus(currentAct,{status:'cached',error:'HTTP 429'}).current);
 const yesterday=new Date(Date.parse(asOf)-86400000).toISOString().slice(0,10);
 assert(!versions.lawReadingStatus({...currentAct,consolidation:{...currentAct.consolidation,asOf:yesterday}},{status:'fresh'}).current);
 assert(!versions.lawReadingStatus({textProvided:true,historical:true,fetchedAt:new Date().toISOString()},{status:'fresh'}).current);
 assert(!versions.lawReadingStatus(currentAct,null).current);
 console.log(JSON.stringify({status:'passed',realSnapshots:manifest.items.length,completeArticles:articles,paragraphText:'all source characters preserved',pagination:'12 articles with their headings',freshness:'historical/stale/error responses never certified for today'}));
}finally{await rm(temp,{recursive:true,force:true})}
