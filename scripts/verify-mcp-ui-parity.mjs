// MCP↔UI parity gate (U01): every capability exposed through the MCP tools must be
// reachable in the UI. The routes come from the tools' own build targets in
// lib/mcp/tools.ts — never a hand-kept list. A route passes when the UI code
// references it directly (client fetch/URL), or when the route's own committed data
// import is the same file the UI surfaces (offline snapshot architecture), or through
// a declared pairing whose every half is verified mechanically here.
// Run from the repo root: node scripts/verify-mcp-ui-parity.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {glob} from 'node:fs/promises';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFile(join(root,path),'utf8');
const uiFiles=(await Array.fromAsync(glob('app/**/*.tsx'))).filter(file=>!file.includes('/api/')).concat(await Array.fromAsync(glob('components/**/*.tsx')));

// 1. Rutele MCP, extrase din build-urile tool-urilor (nu o listă ținută de mână).
const toolsSource=await read('lib/mcp/tools.ts');
const mcpRoutes=[...new Set([...toolsSource.matchAll(/path:\s*'(\/api\/[a-z-]+)'/g)].map(match=>match[1]))].sort();

// 2. Referințele UI: orice apariție a rutei în codul de interfață.
const uiText=await Promise.all(uiFiles.map(async file=>[file,await readFile(join(root,file),'utf8')]));

// 3. Echivalența mecanică: ruta și interfața citesc același fișier de date comis
// (arhitectura de snapshot-uri offline) — extrasă din import-ul propriei rute.
const routeDataImports=new Map();
for(const route of mcpRoutes){
 const source=await read(join('app/api',route.slice(5),'route.ts')).catch(()=>null);
 if(!source)continue;
 routeDataImports.set(route,[...source.matchAll(/from\s+['"]@\/(public\/[^'"]+\.json)['"]/g)].map(match=>match[1]));
}

// 4. Asocieri declarate: fiecare jumătate se verifică programatic — o asociere fără
// dovadă mecanică e refuzată, nu trecută pe cuvânt.
const pairings={
 '/api/stories':{sibling:'/api/story',note:'lista derivată din același corpus Wikisource pe care UI-ul îl citește integral prin snapshot-uri SHA-verificate',check:()=>uiReferences('/api/story')&&uiText.some(([file,text])=>file.includes('stories-workspace')&&text.includes('/stories/index.json'))},
};

const uiReferences=route=>uiText.some(([,text])=>text.includes(route));
const uiReferencesData=dataPath=>uiText.some(([,text])=>text.includes(dataPath)||text.includes(dataPath.replace(/^public\//,'/')));

const report=[];
let failures=0;
for(const route of mcpRoutes){
 const direct=uiReferences(route);
 if(direct){report.push([route,'direct','referită direct în UI']);continue}
 const dataFiles=routeDataImports.get(route)||[];
 if(dataFiles.length&&dataFiles.some(data=>uiReferencesData(data))){report.push([route,'data','rută și UI citesc același fișier comis: '+dataFiles.join(', ')]);continue}
 const pairing=pairings[route];
 if(pairing&&pairing.check()){report.push([route,'pairing',pairing.note]);continue}
 failures++;report.push([route,'ORPHAN','nici o suprafață UI nu referă ruta, fișierele ei de date sau o asociere verificabilă']);
}

for(const [route,status,detail] of report)console.log((status==='ORPHAN'?'FAIL ':'ok   ')+route+' — '+status+' — '+detail);
assert.equal(failures,0,'MCP↔UI parity: '+(mcpRoutes.length-failures)+'/'+mcpRoutes.length+' rute MCP au suprafață UI; '+failures+' orfane — orice tool nou trebuie livrat cu suprafața lui de interfață');
console.log('{"result":"ok","mcpRoutes":'+mcpRoutes.length+',"mechanisms":{"direct":'+report.filter(r=>r[1]==='direct').length+',"data":'+report.filter(r=>r[1]==='data').length+',"pairing":'+report.filter(r=>r[1]==='pairing').length+'}}');
