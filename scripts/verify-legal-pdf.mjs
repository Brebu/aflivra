import assert from 'node:assert/strict';
import {readSnapshotFile as readFile} from './snapshot-read.mjs';
import {writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=await mkdtemp(join(tmpdir(),'aflivra-article-pdf-'));
const outArg=process.argv.indexOf('--out'),out=outArg<0?temp:resolve(process.argv[outArg+1]);
try{
 await mkdir(out,{recursive:true});
 for(const [name,path] of [['text','lib/live/text.ts'],['legal-consolidation','lib/live/legal-consolidation.ts'],['legal-reader','lib/live/legal-reader.ts'],['legal-pdf','lib/legal-pdf.ts']]){
  const source=await readFile(join(root,path),'utf8');
  let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,esModuleInterop:true}}).outputText;
  code=code.replace("'./live/legal-reader'","'./legal-reader.mjs'").replace("'./live/legal-consolidation'","'./legal-consolidation.mjs'").replace("'./text'","'./text.mjs'");
  for(const pkg of ['pdf-lib','@pdf-lib/fontkit'])code=code.replace("'"+pkg+"'","'"+pathToFileURL(require.resolve(pkg)).href+"'");
  await writeFile(join(temp,name+'.mjs'),code);
 }
 const reader=await import(pathToFileURL(join(temp,'legal-reader.mjs'))),pdf=await import(pathToFileURL(join(temp,'legal-pdf.mjs')));
 const regularFont=new Uint8Array(await readFile(join(root,'public/fonts/Inter-Regular.ttf'))),semiboldFont=new Uint8Array(await readFile(join(root,'public/fonts/Inter-Semibold.ttf')));
 const manifest=JSON.parse(await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8'));
 const civil=manifest.items.find(item=>item.type==='CODUL CIVIL'),civilSections=reader.lawSections(await readFile(join(root,'public',civil.file),'utf8'));
 const fiscal=manifest.items.find(item=>item.type==='CODUL FISCAL'),fiscalSections=reader.lawSections(await readFile(join(root,'public',fiscal.file),'utf8'));
 const longest=fiscalSections.filter(s=>s.kind==='article').sort((a,b)=>b.body.length-a.body.length)[0];
 const cases=[{act:civil,section:civilSections.find(s=>s.title==='Articolul 1'),file:'civil-articolul-1.pdf'},{act:civil,section:civilSections.find(s=>s.title==='Articolul 58'),file:'civil-articolul-58.pdf'},{act:fiscal,section:longest,file:'fiscal-articol-lung.pdf'}];
 const verified=[];
 for(const item of cases){
  assert(item.section);const bytes=await pdf.createLawArticlePdf({...item,regularFont,semiboldFont,lastSuccessAt:item.act.fetchedAt});
  assert.equal(Buffer.from(bytes.slice(0,5)).toString(),'%PDF-');
  const path=join(out,item.file);await writeFile(path,bytes);
  const expected=join(temp,'expected.txt');await writeFile(expected,item.section.body);
  const summary=JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',['-c',String.raw`import sys,json,re
from pathlib import Path
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);fragments=[]
def collect(value,cm,tm,font,size):
 y=tm[5]*cm[3]+tm[4]*cm[1]+cm[5]
 if 70<y<780:fragments.append(value)
for page in r.pages:page.extract_text(visitor_text=collect)
text='\n'.join(fragments)
norm=lambda s:re.sub(r'\s+','',s).replace('\ufeff','')
expected=Path(sys.argv[2]).read_text()
assert norm(expected) in norm(text),'PDF must preserve every source character, including final clauses and notes'
assert r.trailer['/Root'].get('/Lang')=='ro-RO'
print(json.dumps({'pages':len(r.pages),'complete_body':True,'characters':len(expected)}))
` ,path,expected],{encoding:'utf8'}));
  verified.push({file:item.file,article:item.section.title,...summary});
 }
 const meta=await import(pathToFileURL(join(temp,'legal-consolidation.mjs'))),asOf=meta.legalToday(),testAct={title:'Fixture de verificare PDF — nu este act normativ',textProvided:true,sourceUrl:'https://legislatie.just.ro/Public/DetaliiDocument/999999999',consolidation:{kind:'consolidated',versionId:'999999999',versionDate:'2026-01-01',asOf,checkedAt:new Date().toISOString(),sourceUrl:'https://legislatie.just.ro/Public/DetaliiDocument/999999999',futureVersions:[]}},testSection={id:'test',kind:'article',title:'Articolul 1',body:'Alineat integral cu ș și ț. Ultima propoziție.',text:'Articolul 1\nAlineat integral cu ș și ț. Ultima propoziție.'};
 const stamped=join(out,'fixture-versiune.pdf');await writeFile(stamped,await pdf.createLawArticlePdf({act:testAct,section:testSection,regularFont,semiboldFont}));
 execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',['-c',`import sys,re\nfrom pypdf import PdfReader\ntext=' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages)\ntext=re.sub(r'\\s+',' ',text)\nassert 'Formă consolidată din 01.01.2026' in text\nassert sys.argv[2] in text\nassert 'Versiune oficială: 999999999' in text\nassert 'Forma consolidată la zi nu este certificată' not in text`,stamped,asOf.split('-').reverse().join('.')]);
 const yesterday=new Date(Date.parse(asOf)-86400000).toISOString().slice(0,10),retained=join(out,'fixture-verificare-anterioara.pdf');await writeFile(retained,await pdf.createLawArticlePdf({act:{...testAct,consolidation:{...testAct.consolidation,asOf:yesterday}},section:testSection,regularFont,semiboldFont}));
 execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',['-c',`import sys,re\nfrom pypdf import PdfReader\ntext=re.sub(r'\\s+',' ',' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))\nassert 'Actualitatea pentru astăzi nu este confirmată.' in text\nassert sys.argv[2] in text\nassert 'Ultima propoziție.' in text`,retained,yesterday.split('-').reverse().join('.')]);
 assert(verified[2].pages>1,'Long real article must span multiple complete PDF pages');
 assert.throws(()=>pdf.pdfLines('verylongword',{widthOfTextAtSize:()=>10000},11,500));
 const lines=pdf.pdfLines('abcdefghij',{widthOfTextAtSize:s=>s.length*10},11,35);assert.equal(lines.join(''),'abcdefghij');
 console.log(JSON.stringify({status:'passed',realArticles:verified,unicodeAndFullText:'verified',out:outArg<0?'temporary':out},null,2));
}finally{await rm(temp,{recursive:true,force:true})}
