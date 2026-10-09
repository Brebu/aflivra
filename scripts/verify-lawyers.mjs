import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-lawyers-'));
const stub="const getSource=(...args)=>globalThis.__lawyersSource(...args);class SourceError extends Error{};";
try{
 for(const name of ['text','source-html','lawyers','query']){
   const source=(await readFile(join(root,'lib/live',name+'.ts'),'utf8')).replace("import {getSource,SourceError} from './adapters';",stub);
   const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,path)=>"from '"+path+".mjs'");
   await writeFile(join(temp,name+'.mjs'),js);
  }
 for(const name of ['location-context','geographic-scope']){
   let source=await readFile(join(root,'lib',name+'.ts'),'utf8');for(const [binding,file] of [['countyLookup','public/data/locality-counties.json'],['urbanLocalities','public/data/geographic-localities.json']])source=source.replace("import "+binding+" from '@/"+file+"';",'const '+binding+'='+await readFile(join(root,file),'utf8')+';');source=source.replace("from './live/query'","from './query'");
   const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,path)=>"from '"+path+".mjs'");await writeFile(join(temp,name+'.mjs'),js);
  }
 const {parseLawyers,normalizeLawyerData,lawyerLoader,resolveCompanyId}=await import(pathToFileURL(join(temp,'lawyers.mjs')));
 const {sourceElements}=await import(pathToFileURL(join(temp,'source-html.mjs'))),{sourceText}=await import(pathToFileURL(join(temp,'text.mjs')));
 const rights='Drept de concluzii la: Judecătorii, Tribunale, Curți de Apel';
 const pager=(total=1,page=1)=>`<span id="MainContent_PagerTop_lblRecords">Înregistrări 1–1 din ${total}</span><span id="MainContent_PagerTop_lblPages">Pagina ${page} din 2</span>`;
 const card=content=>`<a href='LawyerFile.aspx?RecordId=fixture-1&amp;Panel=public'><p><span title="Ultima actualizare"><em>05-10-2026 12:12</em></span><span class="pop" data-html="true" ${content}><img src="level.gif"></span><span>Fișă</span></p><h4>Avocat definitiv <font>POPESCU Ana</font>, Baroul Cluj [inactiv]</h4><p>Sediu principal: Cluj-Napoca, Strada Exemplu nr. 3</p><p>0700 000 000</p></a>`;
 for(const tooltip of [`data-content='<p>${rights}</p>'`,`data-content="&lt;p&gt;${rights}&lt;/p&gt;"`]){
  const body=card(tooltip),fixture=pager()+body;
  const oldParagraph=sourceText(body.match(/<p[^>]*>([\s\S]*?)<\/p>/)[1]);
  if(tooltip.includes("'<p>"))assert(oldParagraph.includes('<span'),'The fixture must reproduce the reported old parser failure.');
  const loaded=parseLawyers(fixture),item=loaded.data.items[0];
  assert.equal(loaded.publishedAt,null);assert.equal(item.name,'POPESCU Ana');assert.equal(item.updatedAt,'05-10-2026 12:12');assert.equal(item.rights,rights);
  assert.deepEqual(item.paragraphs,['Sediu principal: Cluj-Napoca, Strada Exemplu nr. 3','0700 000 000']);
  assert.equal(item.url,'https://www.ifep.ro/Justice/Lawyers/LawyerFile.aspx?RecordId=fixture-1&Panel=public');
  assert(!/<\/?(?:span|p|div)\b/i.test(JSON.stringify(loaded.data)));
  assert.equal(sourceElements(body,'p').length,3,'The tooltip paragraph is an attribute, not a visible paragraph.');
 }
 const misleading=`<!-- ${card("data-content='ignored'")} --><script>const fake=${JSON.stringify(card("data-content='ignored'"))};</script>`;
 assert.equal(parseLawyers(pager()+misleading+card(`data-content='<p>${rights}</p>'`)).data.items.length,1);
 assert.equal(parseLawyers(pager(16,2)+card(`data-content='<p>${rights}</p>'`)).data.page,1);
 assert.equal(parseLawyers(pager(0)).data.items.length,0);
 assert.throws(()=>parseLawyers('<span>Structure changed</span>'),/numărul/);
 const legacy={items:[{id:'old',name:'POPESCU Ana',title:'Avocat',details:'1 < 2 și 3 > 0',paragraphs:[`05-10-2026 12:12 <span class="pop" data-content="${rights}`,'Adresa completă','0700 000 000'],rights}],total:40149,page:0,pages:2677,pageSize:15};
 const clean=normalizeLawyerData(legacy);assert.equal(clean.total,40149);assert.equal(clean.items[0].updatedAt,'05-10-2026 12:12');assert.deepEqual(clean.items[0].paragraphs,['Adresa completă','0700 000 000']);assert.equal(clean.items[0].details,'1 < 2 și 3 > 0');assert(legacy.items[0].paragraphs[0].includes('<span'),'Reading an old copy must not mutate stored data.');
  // Loaderul de căutare: textul cere __EVENTTARGET pe câmp (AutoPostBack), baroul
 // se aplică server-side pe ddlCompany, dimensiunea paginii pe ddlRecords — și o
 // pagină de rezultate fără termenul cerut nu se servește drept căutare reușită.
 {
  const hidden='<input type="hidden" name="__VIEWSTATE" value="fixture"><input type="hidden" name="__EVENTVALIDATION" value="v">';
  const companySelect='<select name="ctl00$MainContent$ddlCompany"><option value="0">---Alegeţi---</option><option value="1105">B Bihor</option><option value="1100">B Bucureşti</option></select>';
  const landing=hidden+companySelect;
  const searchResult=pager(16,1)+card(`data-content='<p>${rights}</p>'`);
  const posts=[];
  globalThis.__lawyersSource=async (url,init)=>{posts.push({url,method:init?.method||'GET',form:new URLSearchParams(String(init?.body||''))});return init&&init.method?searchResult:landing};
  assert.equal(resolveCompanyId(landing,'Bihor'),'1105','baroul se rezolvă după județ');
  assert.equal(resolveCompanyId(landing,'București'),'1100','diacriticele și cedilla rezolvă la același bar');
  posts.length=0;
  const scoped=await lawyerLoader('Popescu',0,'name','Bihor').load();
  const scopedPost=posts.find(p=>p.method==='POST');
  assert.ok(scopedPost,'căutarea face POST');
  assert.equal(scopedPost.form.get('__EVENTTARGET'),'ctl00$MainContent$tbSearch','căutarea pornește pe postback-ul câmpului (D09)');
  assert.equal(scopedPost.form.get('ctl00$MainContent$tbSearch'),'Popescu');
  assert.equal(scopedPost.form.get('ctl00$MainContent$ddlRecords'),'15','dimensiunea paginii călătorește');
  assert.equal(scopedPost.form.get('ctl00$MainContent$ddlCompany'),'1105','baroul se aplică pe serverul sursei (D10)');
  assert.equal(scoped.data.barScope,'Bihor','răspunsul poartă barScope onest');
  assert.equal(scoped.data.total,16);
  posts.length=0;
  const national=await lawyerLoader('Popescu',0,'name').load();
  const nationalPost=posts.find(p=>p.method==='POST');
  assert.equal(nationalPost.form.get('ctl00$MainContent$ddlCompany'),null,'fără bar, POST-ul rămâne național');
  assert.ok(!national.data.barScope,'fără bar, răspunsul rămâne național');
  const pagerFlat=pager(542,1)+`<a href='LawyerFile.aspx?RecordId=x&Panel=public'><h4>Avocat <font>SERSEA VASILE</font>, Baroul Constanța</h4></a>`;
  globalThis.__lawyersSource=async (url,init)=>init&&init.method?pagerFlat:landing;
  await assert.rejects(()=>lawyerLoader('Popescu',0,'name').load(),/nu a confirmat filtrarea pe nume/,'o pagină fără termen nu se servește drept căutare');
 }
 let route=(await readFile(join(root,'app/api/lawyers/route.ts'),'utf8')).replace("from '@/lib/geographic-scope'","from './geographic-scope.mjs'").replace("from '@/lib/live/lawyers'","from './lawyers.mjs'").replace("import {readSource} from '@/lib/live/cache';",'const readSource=(loader)=>globalThis.__lawyersReadSource(loader);');
 await writeFile(join(temp,'route.mjs'),ts.transpileModule(route,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
 const prior={status:'stale',data:legacy,lastSuccessAt:'2026-10-05T09:00:00Z',error:'HTTP 429',nextAttemptAt:'2026-10-05T10:00:00Z'};
 globalThis.__lawyersReadSource=async loader=>{assert.equal(loader.version,'ifep.public-search.v2');return prior};
 const {GET}=await import(pathToFileURL(join(temp,'route.mjs'))),response=await GET(new Request('https://example.test/api/lawyers?q=&page=0&sort=recent&v=2')),shown=await response.json();
 assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(shown.status,'stale');assert.equal(shown.lastSuccessAt,prior.lastSuccessAt);assert.equal(shown.error,'HTTP 429');assert.equal(shown.nextAttemptAt,prior.nextAttemptAt);assert(!JSON.stringify(shown).includes('<span'));
  const workspace=await readFile(join(root,'app/lawyers-workspace.tsx'),'utf8');assert(workspace.includes("v:'3'"));assert(workspace.includes('Ultima actualizare a fișei: {dateText(item.updatedAt)}'));
 const position=process.argv.indexOf('--html');
 if(position>=0){
  const actual=parseLawyers(await readFile(process.argv[position+1],'utf8'));
  assert.equal(actual.data.items.length,15);assert(actual.data.total>actual.data.items.length);
  for(const item of actual.data.items){assert(item.id&&item.name&&item.updatedAt);assert.equal(item.url.startsWith('https://www.ifep.ro/Justice/Lawyers/LawyerFile.aspx?'),true);for(const value of [item.name,item.title,item.details,item.rights,...item.paragraphs])assert(!/<\/?[a-z][\w:.-]*\b(?:\s|>)/i.test(value), 'No source markup reaches professional fields.');}
  console.log('Actual IFEP response verified: 15 complete records with source update dates, rights, contact paragraphs and official links; no visible HTML.');
 }
 assert.equal(lawyerLoader('',0,'recent').version,'ifep.public-search.v2');
 console.log('Lawyer regression checks passed: quoted/escaped tooltip HTML, pagination, comments/scripts, complete professional fields, and old cached 429 copies cleaned without changing retrieval dates or cooldowns.');
}finally{delete globalThis.__lawyersSource;delete globalThis.__lawyersReadSource;await rm(temp,{recursive:true,force:true})}
