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

  console.log(`Poarta MCP a trecut: protocol JSON-RPC stateless, ${list.length} tool-uri pin-ate (drift prin poartă), apeluri cu succes și eroare onestă de la rută, validare la graniță, loturi`);
}finally{await rm(temp,{recursive:true,force:true})}
