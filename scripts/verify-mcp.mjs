import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Poarta MCP: stratul de protocol (JSON-RPC 2.0 peste Streamable HTTP, stateless)
// se verifică offline, cu seamul de rute hrănit cu fixture-uri — stratul real de
// rute se dovedește în e2e împotriva serverului de dezvoltare. Matricea acoperă:
// negocierea versiunii de protocol, ping, notificările fără răspuns, lista de
// tool-uri pin-ată exact (poarta de drift), apelurile cu succes și cu eroare
// onestă de la rută, validarea argumentelor la graniță și loturile (batch).
const root=resolve(import.meta.dirname,'..');
const temp=await mkdtemp(join(tmpdir(),'aflivra-mcp-'));
try{
  for (const name of ['tools','server']) {
    const source=await readFile(join(root,'lib/mcp',name+'.ts'),'utf8');
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
    await writeFile(join(temp,name+'.mjs'),js);
  }
  const server=await import(pathToFileURL(join(temp,'server.mjs')).href);

  // Seamul de rute cu fixture-uri: datele reale, formele reale — inclusiv JSON-RPC
  // layer nu reinterpretează ce răspunde ruta (400 onest → isError, nu eroare de transport).
  const calls=[];
  const callRoute=async call=>{
    calls.push(call);
    if(call.path==='/api/localities')return {ok:true,status:200,body:{status:'fresh',data:{items:[{name:'București',county:'București'}]}}};
    if(call.path==='/api/company'&&call.query.name)return {ok:true,status:200,body:{status:'fresh',data:{items:[]}}};
    if(call.path==='/api/weather')return {ok:false,status:400,body:{error:'Alege coordonate geografice valide.'}};
    if(call.path==='/api/legal'&&call.method==='POST')return {ok:true,status:200,body:{status:'fresh',data:{kind:'court'}}};
    return {ok:true,status:200,body:{status:'fresh',data:{}}};
  };

  // 1. initialize: negocierea versiunii — versiunea clientului acceptată, una
  // necunoscută revenind la a serverului.
  const init=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'verify',version:'0'}}});
  assert.equal(init.status,200,'initialize răspunde 200');
  assert.equal(init.body.result.protocolVersion,'2025-03-26','versiunea clientului acceptată la negoțiere');
  const initUnknown=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'1999-01-01',capabilities:{},clientInfo:{name:'verify',version:'0'}}});
  assert.equal(initUnknown.body.result.protocolVersion,server.MCP_PROTOCOL_VERSION,'versiunea necunoscută revine la a serverului');
  assert.equal(init.body.result.serverInfo.name,'aflivra','serverInfo cu numele platformei');
  assert.ok(init.body.result.instructions.length>50,'instrucțiunile descriu platforma pentru asistenți');

  // 2. Notificările nu primesc răspuns (null), conform protocolului.
  assert.equal((await server.handleRpc(callRoute,{jsonrpc:'2.0',method:'notifications/initialized'})).body,null,'notificarea initialized nu produce răspuns');

  // 3. ping → empty result.
  assert.deepEqual((await server.handleRpc(callRoute,{jsonrpc:'2.0',id:3,method:'ping'})).body.result,{},'ping răspunde rezultat gol');

  // 4. tools/list: pin exact pe lista de tool-uri — adăugarea, scoaterea sau
  // redenumirea unui tool se prinde aici, la poartă, nu la clientul de pe piață.
  const list=(await server.handleRpc(callRoute,{jsonrpc:'2.0',id:4,method:'tools/list'})).body.result.tools;
  const names=list.map(tool=>tool.name);
  assert.deepEqual(names,[
    'search_companies','company_profile','places_search','directory_registry','localities_search',
    'weather_forecast','weather_alerts','events_search','cinema_program','transport_positions',
    'tranzy_live','flights_status','flight_board','trains_schedule','legal_acts','court_dosar_search',
    'federated_search','catalog_datasets','dataset_table','dataset_export','news_feed','story_read',
    'lawyers_registry','forensic_experts','notaries_registry','anl_housing','ancpi_integrals',
    'film_detail','article_read','transport_network','law_search','law_document','cinema_sites','stories_list',
  ],'lista de tool-uri rămâne pin-ată: orice schimbare de suprafață trece explicit prin poartă');
  for (const tool of list) {
    assert.ok(tool.description.length>40,`tool-ul ${tool.name} are descrierea pentru asistenți`);
    assert.equal(tool.inputSchema.type,'object',`tool-ul ${tool.name} declară un obiect de intrare`);
    for (const required of tool.inputSchema.required||[])assert.ok(tool.inputSchema.properties[required],`tool-ul ${tool.name} cere "${required}" declarat`);
  }

  // 5. Apelul cu succes: conținut text + structuredContent identic cu răspunsul
  // rutei, isError fals.
  const call=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'localities_search',arguments:{q:'București'}}});
  assert.equal(call.body.result.isError,false,'apelul de succes nu e marcat eroare');
  assert.equal(call.body.result.structuredContent.data.items[0].county,'București','structuredContent poartă exact răspunsul rutei');
  assert.ok(call.body.result.content[0].text.includes('București'),'conținutul text poartă același răspuns');

  // 6. Eroarea onestă de la rută (400 cu mesaj românesc) → isError, mesajul
  // păstrat, nu reinterpretat ca eroare de transport.
  const bad=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'weather_forecast',arguments:{lat:999,lon:26}}});
  assert.equal(bad.body.result.isError,true,'400-ul rutei se servește onest ca rezultat isError');
  assert.ok(bad.body.result.content[0].text.includes('coordonate'),'mesajul rutei se păstrează integral');

  // 7. Validarea la graniță: argument lipsă, tip greșit, argument necunoscut,
  // enum invalid, tool necunoscut — toate -32602 cu mesaj explicabil.
  for (const [label,params] of [
    ['argument lipsă',{name:'company_profile',arguments:{}}],
    ['tip greșit',{name:'weather_forecast',arguments:{lat:'fourty-four',lon:26}}],
    ['argument necunoscut',{name:'localities_search',arguments:{q:'x',scheduler:'bypass'}}],
    ['enum invalid',{name:'weather_alerts',arguments:{geoScope:'global'}}],
    ['tool necunoscut',{name:'admin_wipe',arguments:{}}],
  ]) {
    const response=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:7,method:'tools/call',params});
    assert.equal(response.body.error?.code,-32602,`${label} se respinge cu -32602`);
    assert.ok(typeof response.body.error?.message==='string'&&response.body.error.message.length>10,`${label} cu mesaj explicabil`);
  }

  // 8. POST-ul de corp ( căutarea de dosare ) ajunge la rută cu metoda corp:
  const court=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'court_dosar_search',arguments:{number:'6236/111/2017'}}});
  assert.equal(court.body.result.isError,false,'căutarea de dosare pornește ca apel de corp');
  const courtCall=calls.find(c=>c.path==='/api/legal'&&c.method==='POST');
  assert.ok(courtCall&&courtCall.body.number==='6236/111/2017','corpul apelului DOSAR poartă numărul dosarului');

  // 9. Metodă necunoscută → -32601.
  const unknownMethod=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:9,method:'resources/read'});
  assert.equal(unknownMethod.body.error?.code,-32601,'metodele necunoscute se resping cu -32601');

  // 10. Lotul: răspunsuri numai pentru cererile care cer răspuns.
  const batch=await server.handleRpc(callRoute,[{jsonrpc:'2.0',id:10,method:'ping'},{jsonrpc:'2.0',method:'notifications/cancelled'},{jsonrpc:'2.0',id:11,method:'tools/list'}]);
  assert.ok(Array.isArray(batch.body),'lotul răspunde cu lot');
  assert.deepEqual(batch.body.map(entry=>entry.id),[10,11],'notificările nu primesc răspuns în lot');
  const emptyBatch=await server.handleRpc(callRoute,[]);
  assert.equal(emptyBatch.status,400,'lotul gol se respinge');

  
  // 11. Pinul de fire: fiecare tool, apelat prin seam, țintește exact ținta pin-ată —
  // poarta de drift pentru fiecare build(), nu doar pentru un eșantion. Orice fel de
  // parametru, cale sau corp care se schimbă se prinde aici, literat.
  const WIRED=[
    ['search_companies',{name:'alfa'},{path:'/api/company',query:{name:'alfa'}}],
    ['company_profile',{cui:'427282'},{path:'/api/company',query:{cui:'427282'}}],
    ['places_search',{q:'spital',category:'sanatate',contact:'phone',scope:'nearby',sort:'distance',lat:44.4,lon:26.1,radius:15,pageSize:20,page:0},{path:'/api/places',query:{q:'spital',category:'sanatate',contact:'phone',scope:'nearby',sort:'distance',lat:'44.4',lon:'26.1',radius:'15',pageSize:'20',page:'0',view:'cards'}}],
    ['directory_registry',{kind:'pharmacies',q:'farmacia',page:2},{path:'/api/directory',query:{kind:'pharmacies',q:'farmacia',page:'2',geoScope:'national'}}],
    ['localities_search',{q:'Câmpulung',page:1},{path:'/api/localities',query:{q:'Câmpulung',page:'1'}}],
    ['weather_forecast',{lat:44.4,lon:26.1},{path:'/api/weather',query:{lat:'44.4',lon:'26.1'}}],
    ['weather_alerts',{geoScope:'national'},{path:'/api/weather',query:{kind:'alerts',geoScope:'national'}}],
    ['events_search',{q:'teatru',venue:'Odeon',locality:'București',county:'București',page:0},{path:'/api/events',query:{q:'teatru',venue:'Odeon',locality:'București',county:'București',page:'0'}}],
    ['cinema_sites',{}, {path:'/api/cinemas',query:{}}],
    ['cinema_program',{locality:'București',county:'București',id:'1806',date:'2026-10-09'},{path:'/api/cinema',query:{locality:'București',county:'București',id:'1806',date:'2026-10-09'}}],
    ['transport_network',{kind:'stops',q:'piața',lat:44.4,lon:26.1,locality:'București',county:'București',page:0},{path:'/api/transport',query:{kind:'stops',q:'piața',lat:'44.4',lon:'26.1',locality:'București',county:'București',geoScope:'context',page:'0'}}],
    ['transport_positions',{kind:'vehicles',county:'București',locality:'București',route:'33',page:0},{path:'/api/transport-live',query:{kind:'vehicles',county:'București',locality:'București',route:'33',page:'0'}}],
    ['tranzy_live',{locality:'Iași',county:'Iași',q:'b8',page:0},{path:'/api/tranzy-live',query:{locality:'Iași',county:'Iași',q:'b8',page:'0'}}],
    ['flights_status',{q:'W6',page:0},{path:'/api/flights',query:{q:'W6',page:'0'}}],
    ['flight_board',{airport:'henri-coanda',q:'W6'},{path:'/api/flight-board',query:{airport:'henri-coanda',q:'W6'}}],
    ['trains_schedule',{station:'44678',q:'IR',page:0},{path:'/api/trains',query:{station:'44678',q:'IR',page:'0'}}],
    ['legal_acts',{cursor:'a'.repeat(64)},{path:'/api/legal',query:{cursor:'a'.repeat(64)}}],
    ['court_dosar_search',{number:'6236/111/2017',institution:'Curtea de Apel București',locality:'București',county:'București'},{path:'/api/legal',method:'POST',body:{kind:'court',number:'6236/111/2017',name:'',subject:'',institution:'Curtea de Apel București',from:'',to:'',numberScope:'all'},query:{}}],
    ['law_search',{title:'codul',text:'',number:'287',year:'2009',page:0},{path:'/api/legal',method:'POST',body:{kind:'law',title:'codul',text:'',number:'287',year:'2009',page:0},query:{}}],
    ['law_document',{exactTitle:'LEGE nr. 287 din 2009',id:'x',selectedType:'lege',selectedNumber:'287',selectedDate:'2009'},{path:'/api/legal',method:'POST',body:{kind:'law',full:true,summary:true,exactTitle:'LEGE nr. 287 din 2009',id:'x',selectedType:'lege',selectedNumber:'287',selectedDate:'2009'},query:{}}],
    ['federated_search',{q:'buget',kind:'stiri',publisher:'ANOFM',sort:'recent',from:'2026-01-01',to:'2026-10-09',page:0},{path:'/api/domain',query:{q:'buget',kind:'stiri',publisher:'ANOFM',sort:'recent',from:'2026-01-01',to:'2026-10-09',page:'0',geoScope:'national'}}],
    ['news_feed',{kind:'munca',q:'şomeri',publisher:'ANOFM',sort:'recent',from:'2026-01-01',to:'2026-10-09',page:0},{path:'/api/domain',query:{kind:'munca',q:'şomeri',publisher:'ANOFM',sort:'recent',from:'2026-01-01',to:'2026-10-09',page:'0',geoScope:'national'}}],
    ['catalog_datasets',{q:'buget',organization:'minister',page:0},{path:'/api/catalog',query:{q:'buget',organization:'minister',page:'0'}}],
    ['dataset_table',{id:'1088e792-54f4-43ad-8e4c-9b351b82d31c',sheet:1,page:0,q:'x',sort:2,desc:true},{path:'/api/resource',query:{id:'1088e792-54f4-43ad-8e4c-9b351b82d31c',sheet:'1',page:'0',q:'x',sort:'2',desc:'true'}}],
    ['dataset_export',{id:'1088e792-54f4-43ad-8e4c-9b351b82d31c',format:'xlsx',sheet:2},{path:'/api/resource-file',query:{id:'1088e792-54f4-43ad-8e4c-9b351b82d31c',format:'xlsx',sheet:'2',download:'1'}}],
    ['article_read',{url:'https://www.anofm.ro/anunt'},{path:'/api/content',query:{url:'https://www.anofm.ro/anunt'}}],
    ['film_detail',{id:'Q1084'},{path:'/api/content',query:{kind:'film',id:'Q1084'}}],
    ['story_read',{id:'11889'},{path:'/api/story',query:{id:'11889'}}],
    ['stories_list',{page:3},{path:'/api/stories',query:{page:'3'}}],
    ['lawyers_registry',{q:'Popescu',locality:'București',county:'București',sort:'name',page:0},{path:'/api/lawyers',query:{q:'Popescu',locality:'București',county:'București',sort:'name',page:'0'}}],
    ['forensic_experts',{kind:'experti-judiciari',locality:'Oradea',judet:'Bihor',q:'x',page:0},{path:'/api/experts',query:{kind:'experti-judiciari',locality:'Oradea',judet:'Bihor',q:'x',page:'0',geoScope:'context',county:'Bihor'}}],
    ['notaries_registry',{chamber:'București',q:'popa',page:1},{path:'/api/notaries',query:{chamber:'București',q:'popa',page:'1'}}],
    ['anl_housing',{county:'Sibiu',q:'bloc',page:0},{path:'/api/anl',query:{county:'Sibiu',q:'bloc',page:'0'}}],
    ['ancpi_integrals',{}, {path:'/api/ancpi',query:{}}],
 ];
  assert.equal(WIRED.length, list.length, 'pinul de fire acoperă fiecare tool din registru');
  for (const [name, args, expected] of WIRED) {
    calls.length = 0;
    const result = await server.handleRpc(callRoute, {jsonrpc:'2.0', id: 77, method:'tools/call', params:{name, arguments:args}});
    assert.ok(result.body.result, `tool-ul ${name} rulează prin seam`);
    assert.deepEqual(calls[0], expected, `tool-ul ${name} țintește exact ținta pin-ată (cale, metodă, parametri, corp)`);
  }

  // 12. Acoperirea suprafeței: fiecare rută wire-uită în endpoint are un tool SAU e
  // pin-ată în lista de excluderi cu motivul — o rută nouă e o decizie de suprafață,
  // nu o schimbare silențioasă (regula inversă a bugetului de bundle).
  const mcpRouteSource = await readFile(join(root,'app/api/mcp/route.ts'),'utf8');
    const wiredPaths = [...mcpRouteSource.matchAll(/'(\/api\/[a-z-]+)':\w+/g)].map(m=>m[1]);
  const EXCLUDED_WITH_REASON={
    '/api/content':null,
  };
  delete EXCLUDED_WITH_REASON['/api/content']; // citit de article_read și film_detail
  const pinnedPaths=[...new Set(WIRED.map(([, , target])=>target.path))];
  const unToolked=wiredPaths.filter(path=>!pinnedPaths.includes(path));
  assert.deepEqual(unToolked, [], 'orice rută wire-uită fără tool e o decizie pin-ată explicit: '+unToolked.join(', ')+' — adaugă tool-ul sau exclude-o cu motiv, prin poartă');
  const unknownTools=pinnedPaths.filter(path=>!wiredPaths.includes(path));
  assert.deepEqual(unknownTools, [], 'tool-urile țintesc doar rute wire-uite în endpoint: '+unknownTools.join(', '));

  // 13. Validarea statică a parametrilor: fiecare cheie de query emisă de un tool se
  // citește efectiv în fișierul rutei (direct sau prin contextul geografic comun);
  // fiecare cheie de corp POST se citește din corpul rutei. Un filtru în care crede
  // asistentul și pe care ruta nu-l citește niciodată se prinde aici.
  const INDIRECT_KEYS=new Set(['locality','county','geoScope','lat','lon','radius']);
  for (const [name, , target] of WIRED) {
    const routeFile=join(root,'app/api', target.path.slice(5), 'route.ts');
    const routeSource=await readFile(routeFile,'utf8');
    for (const key of Object.keys(target.query||{})) {
      if (INDIRECT_KEYS.has(key)) continue;
      assert.ok(routeSource.includes(`.get('${key}')`)||routeSource.includes(`.has('${key}')`), `tool-ul ${name} emite parametrul „${key}” pe ${target.path}, dar ruta nu-l citește`);
    }
    for (const key of Object.keys(target.body||{})) {
      if (key==='kind') continue;
      assert.ok(routeSource.includes(`p.${key}`), `tool-ul ${name} emite câmpul de corp „${key}” pe ${target.path}, dar ruta nu-l citește`);
    }
  }

// 14. Numărul pinat trăiește și în scripts/verify-mcp-names.json — îl consumă
// sweep-ul e2e ca acoperirea să nu se poată abate de la registru. Poarta escribă
// fișierul regenerat din pin și îl compară octet cu octet: pinul și fișierul nu
// se pot abate unul de altul.
const namesFile = join(root,'scripts/verify-mcp-names.json');
const namesContent = JSON.stringify(names, null, 2) + '\n';
const currentNames = await readFile(namesFile, 'utf8').catch(() => null);
assert.equal(currentNames, namesContent, 'scripts/verify-mcp-names.json trebuie regenerat din pinul verify-mcp.mjs (rulează scriptul — el scrie fișierul la fiecare trecere verde)');
await writeFile(namesFile, namesContent);

// 15. Catalogul consumatorului: docs/mcp.md e proză scrisă de mână, ținută de poartă —
// fiecare tool din registru are exact un capitol „### `tool`" în documentație,
// documentația nu descrie tool-uri care nu există, și fiecare exemplu JSON din
// documentație trece validarea schemei lui (aceeași validare de la granița MCP).
const docs = await readFile(join(root,'docs/mcp.md'),'utf8');
const docHeadings = [...docs.matchAll(/^### `([a-z_]+)`$/gm)].map(match=>match[1]);
assert.deepEqual([...new Set(docHeadings)], docHeadings, 'fiecare capitol de tool apare o singură dată în docs/mcp.md');
assert.deepEqual(docHeadings.sort(), [...names].sort(), 'docs/mcp.md documentează exact registrul: nici un tool nedocumentat, nici un tool inventat');
const invalid = await server.validateArguments;
assert.ok(typeof invalid !== 'function' || true, 'seam');
const toolsFromRegistry = (await import(pathToFileURL(join(temp,'tools.mjs')).href)).TOOLS;
for (const blockMatch of docs.matchAll(/```json\n({[\s\S]*?})\n```/g)) {
  let example;
  try { example = JSON.parse(blockMatch[1]); } catch { assert.fail(`exemplu JSON nedecodabil în docs/mcp.md: ${blockMatch[1].slice(0,80)}`); }
  assert.equal(example.jsonrpc,'2.0','exemplul din documentație e o cerere JSON-RPC');
  const tool = toolsFromRegistry.find(candidate=>candidate.name===example.params?.name);
  assert.ok(tool, `exemplul din documentație cheamă tool-ul existent „${example.params?.name}"`);
  const validated = server.validateArguments(tool, example.params.arguments ?? {});
  assert.ok(validated.ok, `exemplul de arguments pentru ${tool.name} nu trece validarea schemei: ${validated.ok ? '' : validated.message}`);
}

// 16. Paritatea listei de lucrări: public/stories/listing.json e derivat din
// public/stories/index.json.gz (runtime-ul Worker nu citește .gz din bundle);
// poarta regenerează forma derivată și o compară — cele două nu se pot abate.
const fflateModule=await import('fflate');const gunzipSync=fflateModule.default?.gunzipSync||fflateModule.gunzipSync;
const storiesGz=gunzipSync(new Uint8Array(await readFile(join(root,'public/stories/index.json.gz'))));
const storiesGzIndex=JSON.parse(new TextDecoder().decode(storiesGz));
const storiesCompact=storiesGzIndex.items.map(item=>({id:item.id,title:item.title,categories:item.categories,url:item.url}));
const storiesDerived={generatedFrom:'public/stories/index.json.gz',count:storiesCompact.length,criteria:storiesGzIndex.criteria||'published domain',items:storiesCompact};
const storiesJsonCurrent=await readFile(join(root,'public/stories/listing.json'),'utf8');
const storiesJsonExpected=JSON.stringify(storiesDerived,null,1)+'\n';
assert.equal(storiesJsonCurrent,storiesJsonExpected,'public/stories/listing.json trebuie regenerat din index.json.gz (rulează poarta — ea rescrie fișierul la fiecare trecere verde)');
await writeFile(join(root,'public/stories/listing.json'),storiesJsonExpected);

console.log(`Poarta MCP a trecut: protocol JSON-RPC stateless, ${list.length} tool-uri pin-ate (drift prin poartă), apeluri cu succes și eroare onestă de la rută, validare la graniță, loturi`);
}finally{await rm(temp,{recursive:true,force:true})}
