import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),originalFetch=globalThis.fetch;
const walk=node=>[node,...React.Children.toArray(node?.props?.children).flatMap(child=>React.isValidElement(child)?walk(child):[])];
const text=node=>typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node?.props?.children).map(text).join(' ').replace(/\s+/g,' ').trim();
const components={'@/components/ui/button':['Button'],'@/components/ui/input':['Input'],'@/components/ui/tabs':['Tabs','TabsList','TabsTrigger','TabsContent'],'./draft-form':['DraftForm'],'./select-field':['SelectField'],'./search-input':['SearchInput'],'./export-actions':['ExportActions'],'./pagination':['Pagination']};
let activeGeo={key:'manual:Cluj',label:'Cluj-Napoca',hasLocal:true,locality:{name:'Cluj-Napoca',county:'Cluj',lat:46.771,lon:23.624},center:{lat:46.771,lon:23.624}};
function host(){let slots=[],cursor=0,effects=[],cleanups=[];return{
 hooks:{...React,memo:fn=>fn,
  useState(initial){const at=cursor++;if(!(at in slots))slots[at]=typeof initial==='function'?initial():initial;return[slots[at],next=>slots[at]=typeof next==='function'?next(slots[at]):next]},
  useRef(initial){const at=cursor++;return slots[at]??={current:initial}},
  useMemo(fn,deps){const at=cursor++,old=slots[at];if(!old||deps.some((d,i)=>!Object.is(d,old.deps[i])))slots[at]={deps,value:fn()};return slots[at].value},
  useEffect(fn,deps){const at=cursor++,old=slots[at];if(!old||deps.some((d,i)=>!Object.is(d,old[i]))){slots[at]=deps;effects.push(()=>{cleanups[at]?.();cleanups[at]=fn()})}}
 },render(fn){cursor=0;const tree=fn(),pending=effects;effects=[];pending.forEach(fn=>fn());return tree},destroy(){cleanups.forEach(fn=>fn?.())}
}}
function compile(file,hooks){const module={exports:{}},source=fs.readFileSync(file,'utf8')+(file==='app/courts-workspace.tsx'?'\nexport {CourtCase};':''),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const imports=name=>{
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;
  if(name==='lucide-react')return new Proxy({},{get:(_,key)=>String(key)});
  if(name==='./location')return{useLocation:()=>activeGeo};
  if(name==='./live-data')return{Freshness:'Freshness',dateText:value=>String(value||'')};
  if(name==='@/lib/http-retry.mjs')return{fetchWithServerRetry:(...args)=>globalThis.fetch(...args)};
  if(components[name])return Object.fromEntries(components[name].map(key=>[key,key]));
  if(name.startsWith('@/public/'))return JSON.parse(fs.readFileSync(name.slice(2),'utf8'));
  if(name.startsWith('@/lib/'))return compile(name.slice(2)+'.ts',hooks);
  if(name.startsWith('.')){let path=resolve(dirname(file),name);path+=name.endsWith('.tsx')||name.endsWith('.ts')?'':fs.existsSync(path+'.ts')?'.ts':'.tsx';return compile(path,hooks)}
  return require(name);
 };new Function('require','module','exports',code)(imports,module,module.exports);return module.exports;
}
const pending=[],tick=()=>new Promise(resolve=>setImmediate(resolve));
const hearing=date=>({date,time:'09:00',panel:'Complet test',result:'Soluție test',summary:'Text integral',pronouncementDate:date,document:'Hotărâre',documentNumber:'1',documentDate:date});
const item=(court,stage,n)=>({id:court+'|'+stage,number:'6236/111/2017',court,courtLabel:court,department:'Secție test',category:'Litigii de muncă',stage,date:'2017-12-01',modified:'2026-10-05',parties:[],appeals:[],hearings:Array.from({length:n},(_,i)=>hearing('2023-01-'+String(i+1).padStart(2,'0')))});
const returned=[item('TribunalulBIHOR','Fond',20),item('CurteadeApelORADEA','Apel',2)];
globalThis.fetch=(url,options)=>new Promise(resolve=>pending.push({url,options,resolve}));
const answer=call=>call.resolve(Response.json({status:'fresh',data:{items:returned,hearingCount:22,searchScope:'number-all-courts',historyComplete:false,note:'Istoricul complet nu este garantat de sursă.'}}));
try{
 const h=host(),{Courts}=compile('app/courts-workspace.tsx',h.hooks),render=()=>h.render(()=>Courts()),form=()=>walk(render()).find(n=>n.type==='DraftForm');
 render();assert.equal(pending.length,0,'Opening or editing the search form must not call the portal');
 const q={...form().props.value,number:'6236/111/2017'};
 const fields=walk(form().props.children(q,()=>{}));assert(fields.some(n=>n.type==='SelectField'&&n.props.value==='all'));assert(fields.filter(n=>n.type==='Input'&&n.props.disabled).length>=4,'All-court number mode visibly disables restrictive criteria');
 form().props.onSearch(q);assert.equal(pending.length,1);const first=pending[0],payload=JSON.parse(first.options.body);assert.equal(payload.numberScope,'all');assert.equal(payload.locality,'Cluj-Napoca');answer(first);await tick();
 let tree=render(),cards=walk(tree).filter(n=>typeof n.type==='function'&&n.props.item);assert.equal(cards.length,2,'Both proceedings from other cities must remain visible for an explicit case number');assert(/22\s+ședințe/.test(text(tree)));
 const historyPanel=walk(tree).find(n=>typeof n.type==='function'&&n.props.history);assert(historyPanel,'Returned stages share one journey');assert.deepEqual(historyPanel.props.history.stages.map(stage=>stage.label),['Fond','Apel']);historyPanel.props.onOpenRecord(returned[0].id);tree=render();assert(walk(tree).find(n=>n.props?.item?.id===returned[0].id).props.expanded,'Stage navigation opens the corresponding record');
 const panelHost=host(),Panel=compile('app/court-history-panel.tsx',panelHost.hooks).CourtHistoryPanel,linking=compile('lib/court-history.ts',panelHost.hooks),proof=JSON.parse(fs.readFileSync('public/courts/confirmed-references.json','utf8')).items,referenceJourney=linking.buildCourtHistories([returned[1]],proof)[0];let opened='',searched='';const panel=()=>panelHost.render(()=>Panel({history:referenceJourney,onOpenRecord:id=>opened=id,onSearchNumber:number=>searched=number}));
 let stages=panel();assert(text(stages).includes('Confirmat prin trimitere oficială'));assert(text(stages).includes('Fișa și ședințele de la această etapă nu sunt disponibile'));assert.equal(walk(stages).filter(n=>n.type==='Button'&&text(n).includes('Vezi fișa de fond')).length,0,'A reference-only stage never offers an invented record');walk(stages).find(n=>n.type==='Button'&&text(n)==='Vezi fișa de apel').props.onClick();assert.equal(opened,returned[1].id);walk(stages).find(n=>n.type==='Button'&&text(n)==='Vezi confirmarea').props.onClick();stages=panel();assert(text(stages).includes('2403/111/2025'));walk(stages).find(n=>n.type==='Button'&&text(n).includes('Deschide dosarul sursei')).props.onClick();assert.equal(searched,'2403/111/2025');const journeyExport=walk(stages).find(n=>n.type==='ExportActions');assert.deepEqual(journeyExport.props.formats,['pdf','csv','xlsx']);assert(journeyExport.props.input.text.includes('476/LM/2023'));assert(journeyExport.props.input.text.includes('2403/111/2025'));assert.equal(journeyExport.props.input.data.stages[0].hearingCount,0);panelHost.destroy();
 const detailHost=host(),Case=compile('app/courts-workspace.tsx',detailHost.hooks).CourtCase,detail=()=>detailHost.render(()=>Case({item:returned[0]}));
 walk(detail()).find(n=>n.type==='Button').props.onClick();let expanded=detail();assert.equal(walk(expanded).filter(n=>n.type==='article').length,21,'Every hearing is rendered, beyond list-page size');
 const exports=walk(expanded).filter(n=>n.type==='ExportActions');assert(exports.some(n=>n.props.input?.data?.hearings.length===20));assert(exports.some(n=>n.props.input?.text?.includes('Data pronunțării:')));detailHost.destroy();
 form().props.onSearch(q);const late=pending[1];assert(late);
 activeGeo={key:'manual:București',label:'București',hasLocal:true,locality:{name:'București',county:'București',lat:44.427,lon:26.103},center:{lat:44.427,lon:26.103}};
 render();const current=pending[2];assert(current);assert(late.options.signal.aborted);answer(current);await tick();render();
 late.resolve(Response.json({status:'fresh',data:{items:[item('JudecatoriaCLUJNAPOCA','Fond',1)],searchScope:'filters'}}));await tick();tree=render();cards=walk(tree).filter(n=>typeof n.type==='function'&&n.props.item);assert.equal(cards.length,2);assert(cards.every(n=>n.props.item.court!=='JudecatoriaCLUJNAPOCA'),'A late old-location response must not replace the complete number lookup');
 h.destroy();console.log(JSON.stringify({status:'passed',actualComponent:'Courts',locations:['Cluj-Napoca','București'],proceedings:2,hearingsPreserved:22,checks:['all-court default','restrictive criteria disabled','all details and exports','linked stage navigation','reference-only fond confirmation','source-case navigation','PDF CSV Excel journey export','automatic location refresh','late-response rejection']}));
}finally{globalThis.fetch=originalFetch}
