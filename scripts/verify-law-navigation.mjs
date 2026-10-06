import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {readSnapshotFile} from './snapshot-read.mjs';

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime');
const walk=node=>[node,...React.Children.toArray(node?.props?.children).flatMap(child=>React.isValidElement(child)?walk(child):[])];
const text=node=>typeof node==='string'?node:React.Children.toArray(node?.props?.children).map(text).join(' ').trim();
function compile(file,hooks=React){
 const module={exports:{}},source=fs.readFileSync(file,'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const imports=name=>{
  if(name==='react')return hooks;
  if(name==='react/jsx-runtime')return jsx;
  if(name==='lucide-react')return new Proxy({},{get:(_,key)=>String(key)});
  if(name.startsWith('@/lib/live/'))return compile('lib/live/'+name.split('/').at(-1)+'.ts');
  if(name==='./text')return compile('lib/live/text.ts');
  if(name==='./v2-model')return{norm:query.normalizeSearch};
  if(name==='./live-data')return{Freshness:'Freshness',dateText:value=>String(value||'')};
  if(name==='@/public/legal-snapshots/manifest.json')return JSON.parse(fs.readFileSync('public/legal-snapshots/manifest.json'));
  if(name==='@/lib/http-retry.mjs')return{fetchWithServerRetry(){throw Error('Reading navigation must not fetch')}};
  const components={'@/components/ui/button':['Button'],'@/components/ui/input':['Input'],'@/components/ui/dialog':['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription'],'@/components/ui/tabs':['Tabs','TabsList','TabsTrigger','TabsContent'],'./draft-form':['DraftForm'],'./select-field':['SelectField'],'./search-input':['SearchInput'],'./export-actions':['ExportActions'],'./courts-workspace':['Courts'],'./control-hints':['InfoHint'],'./pagination':['Pagination']};
  if(components[name])return Object.fromEntries(components[name].map(key=>[key,key]));
  return require(name);
 };
 new Function('require','module','exports',code)(imports,module,module.exports);return module.exports;
}
const reader=compile('lib/live/legal-reader.ts'),query=compile('lib/live/query.ts');
function host(){let slots=[],cursor=0,effects=[],cleanups=[],focused=0,scrolled=0;return{
 hooks:{...React,
  useState(initial){const at=cursor++;if(!(at in slots))slots[at]=typeof initial==='function'?initial():initial;return[slots[at],next=>slots[at]=typeof next==='function'?next(slots[at]):next]},
  useRef(initial){const at=cursor++;return slots[at]??={current:initial}},
  useMemo(fn,deps){const at=cursor++,old=slots[at];if(!old||deps.some((d,i)=>!Object.is(d,old.deps[i])))slots[at]={deps,value:fn()};return slots[at].value},
  useEffect(fn,deps){const at=cursor++,old=slots[at];if(!old||deps.some((d,i)=>!Object.is(d,old[i]))){slots[at]=deps;effects.push(()=>{cleanups[at]?.();cleanups[at]=fn()})}}
 },
 render(fn){cursor=0;const result=fn();for(const node of walk(result))if(node.props?.ref&&!node.props.ref.current)node.props.ref.current={focus(){focused++},scrollIntoView(){scrolled++}};const pending=effects;effects=[];pending.forEach(fn=>fn());return result},
 destroy(){cleanups.forEach(fn=>fn?.())},get focused(){return focused},get scrolled(){return scrolled}
}}

const originalFetch=globalThis.fetch;let requests=0;globalThis.fetch=()=>{requests++;throw Error('Local navigation may not call the server')};
try{
 const manifest=JSON.parse(fs.readFileSync('public/legal-snapshots/manifest.json'));let headingCount=0;
 for(const act of manifest.items){
  const original=await readSnapshotFile('public'+act.file,'utf8'),sections=reader.lawSections(original),navigation=reader.lawNavigation(sections),reading=reader.lawReadingSections(sections,navigation);
  assert.equal(reading.filter(s=>s.kind==='article').length,sections.filter(s=>s.kind==='article').length,'The compact outline must not remove any article');
  for(const entry of navigation.filter(e=>sections.find(s=>s.id===e.id)?.kind==='heading')){
   const scope=reader.lawReadingSections(sections,navigation,entry.id),articles=scope.filter(s=>s.kind==='article');
   if(entry.firstArticleId)assert.equal(articles[0]?.id,entry.firstArticleId);
   if(entry.lastArticleId)assert.equal(articles.at(-1)?.id,entry.lastArticleId);
   assert(!scope.some(s=>navigation.find(e=>e.id===s.id)?.outline));headingCount++;
  }
  if(act.type!=='CODUL PENAL')continue;
  assert.equal(reader.lawPage(reading,0).items.find(s=>s.kind==='article')?.title,'Articolul 1');
  assert(!reader.lawPage(reading,0).items.some(s=>s.title==='Titlul XIII'),'An outline for the final title cannot appear before Article 1');
  const outline=navigation.filter(e=>e.outline),titleOne=outline.filter(e=>sections.find(s=>s.id===e.id)?.title==='Titlul I');
  assert(titleOne.length>=2);
  assert.equal(sections.find(s=>s.id===titleOne[0].firstArticleId).title,'Articolul 1');
  assert.equal(sections.find(s=>s.id===titleOne[1].firstArticleId).title,'Articolul 188','The repeated title in the special part has its own destination');
  const h=host(),{LawText}=compile('app/legal-workspace.tsx',h.hooks),render=()=>h.render(()=>LawText({act:{...act,text:original,textProvided:true},source:{status:'stale'}}));
  const main=()=>walk(render()).find(n=>n.type==='article'&&n.props.className==='law-text');
  const articleTitles=()=>walk(main()).filter(n=>n.type==='h3'&&/^Articolul/.test(text(n))).map(text);
  const click=label=>{const node=walk(render()).find(n=>n.type==='Button'&&text(n)===label);assert(node,'Button exists: '+label);node.props.onClick();render()};
  const entry=outline.find(e=>e.label.includes('Aplicarea legii penale în timp'));
  const target=walk(render()).find(n=>n.type==='button'&&n.props['aria-label']==='Deschide '+entry.label);assert(target);target.props.onClick();render();
  assert.deepEqual(articleTitles(),['Articolul 3','Articolul 4','Articolul 5','Articolul 6','Articolul 7'],'Clicking the actual outline button opens the complete section');
  assert(h.focused>0&&h.scrolled>0,'Touch/keyboard selection brings the reading surface into view');
  click('Revino la act');assert.equal(articleTitles()[0],'Articolul 1');
  const chooser=walk(render()).find(n=>n.type==='SelectField');chooser.props.onChange({target:{value:titleOne[1].id}});render();assert.equal(articleTitles()[0],'Articolul 188');
  click('Revino la act');
  const chapter=walk(render()).find(n=>n.type==='button'&&n.props.className==='law-heading-link'&&text(n).includes('Capitolul II'));assert(chapter);chapter.props.onClick();render();
  assert.equal(articleTitles()[0],'Articolul 3');assert.equal(articleTitles().at(-1),'Articolul 14');
  click('Deschide articolul');assert.deepEqual(articleTitles(),['Articolul 3']);click('Articolul următor');assert.deepEqual(articleTitles(),['Articolul 4']);click('Revino la act');
  const search=walk(render()).find(n=>n.type==='SearchInput');search.props.onValueChange('Legalitatea incriminării');render();const before=articleTitles();assert(before.includes('Articolul 1'));
  click('Deschide articolul');assert.equal(articleTitles().length,1);click('Revino la act');assert.deepEqual(articleTitles(),before,'Back restores the previous search');
  h.destroy();
 }
 assert.equal(requests,0);
 console.log(JSON.stringify({status:'passed',realCodeCopies:6,headingDestinations:headingCount,interaction:'actual component clicks, dropdown, complete section/article, next, back, search restoration and focus',serverRequests:requests}));
}finally{globalThis.fetch=originalFetch}
