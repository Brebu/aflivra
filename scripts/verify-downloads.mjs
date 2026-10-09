import {readSnapshotFile as readFile} from './snapshot-read.mjs';
import assert from 'node:assert/strict';
import {writeFile,mkdtemp,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import ts from 'typescript';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-downloads-')),require=createRequire(import.meta.url),sqlite=new DatabaseSync(':memory:');
sqlite.exec(await readFile(join(root,'drizzle/0000_thin_demogoblin.sql'),'utf8'));
const db={prepare(sql){let args=[];return{bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async run(){const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}}}}}};
globalThis.__aflivraDownloadEnv={DB:db};
const checksum=data=>createHash('sha256').update(data).digest('hex');
const insert=(key,data)=>sqlite.prepare('INSERT INTO source_cache (key,data,adapter_version) VALUES (?,?,?)').run(key,data,'download-test');
try{
 const guideList=(await readFile(join(root,'app/source-packages.tsx'),'utf8')).match(/const GUIDES=\[([\s\S]*?)\];/);
 assert(guideList,'The About section must keep its GUIDES list of guide PDFs.');
 const listedGuides=[...guideList[1].matchAll(/file:'([^']+)'/g)].map(match=>match[1]);
 assert(listedGuides.length>0,'The About section must name a PDF file for every guide card.');
 const diskGuides=(await readdir(join(root,'public/downloads'))).filter(name=>/^Aflivra_v\d+_Documentatie\.pdf$/.test(name)).sort();
 assert.equal(new Set(listedGuides).size,listedGuides.length,'Each guide file must be listed in the About section only once.');
 const deadLinks=[...new Set(listedGuides)].filter(file=>!diskGuides.includes(file)),unlistedGuides=diskGuides.filter(file=>!listedGuides.includes(file));
 assert.deepEqual({deadLinks,unlistedGuides},{deadLinks:[],unlistedGuides:[]},'Every guide listed in „Ghidurile platformei” must exist in public/downloads/ and every published guide PDF must be listed — deadLinks: listed but missing from public/downloads/; unlistedGuides: present in public/downloads/ but missing from the About section.');
 console.log(`Guide manifest verified: ${listedGuides.length} guide PDFs in „Ghidurile platformei” match public/downloads/ in both directions.`);
 // APK-ul publicat pe site (instalarea directă, fără magazin): secțiunea „Aplicația
 // Android” din About leagă exact public/downloads/aflivra.apk, fișierul există, e
 // un pachet ZIP real (semnătura PK) cu dimensiunea pachetului semnat — și niciun
 // alt .apk nu se publică nelistat.
 const aboutSection=await readFile(join(root,'app/source-packages.tsx'),'utf8');
 assert(aboutSection.includes('href="/downloads/aflivra.apk"'),'The About section must link the Android app at /downloads/aflivra.apk.');
 assert(aboutSection.includes('download="aflivra.apk"'),'The APK link must carry the download attribute so browsers save it, not navigate it.');
 const diskApks=(await readdir(join(root,'public/downloads'))).filter(name=>name.endsWith('.apk'));
 assert.deepEqual(diskApks,['aflivra.apk'],'Only the published app APK may exist in public/downloads/ — every published APK is exactly aflivra.apk.');
 const apkBytes=await readFile(join(root,'public/downloads/aflivra.apk'));
 assert(apkBytes.length>1_000_000&&apkBytes.length<50_000_000,`The published APK must be a real signed bundle (got ${(apkBytes.length/1024/1024).toFixed(2)} MB).`);
 assert(apkBytes[0]===0x50&&apkBytes[1]===0x4b&&apkBytes[2]===0x03&&apkBytes[3]===0x04,'The published APK must start with the ZIP magic bytes (PK\\x03\\x04) — anything else is not an Android package.');
 console.log(`Published APK verified: aflivra.apk ${'('+(apkBytes.length/1024/1024).toFixed(2)+' MB)'}, ZIP package, linked from „Aplicația Android” in the About section.`);
 // iOS-ul se instalează fără App Store doar prin gestul „Adaugă la ecranul de start” al
 // Safari-ului — fără fișier descărcabil. Publicarea iOS e deci suprafața care face
 // gestul posibil: pictograma apple-touch (180×180, legată în layout), manifestul în
 // mod standalone și cardul din About care spune pașii reali (Safari · Distribuie ·
 // Adaugă), fără link fals de descărcare.
 assert(aboutSection.includes('source-download-ios'),'The About section must carry the iOS install card (source-download-ios).');
 assert(aboutSection.includes('Adaugă la ecranul de start'),'The iOS card must name Safari’s own gesture: Adaugă la ecranul de start.');
 assert(aboutSection.includes('Distribuie'),'The iOS card must name the Share button: Distribuie.');
 const iosCardSrc=aboutSection.slice(aboutSection.indexOf('source-download-ios'));
 assert(!/href="/.test(iosCardSrc.slice(0,iosCardSrc.indexOf('</article>'))),'The iOS card must not offer a download link — installation is Safari’s gesture, not a file.');
 const touchIcon=await readFile(join(root,'public/apple-touch-icon.png'));
 assert(touchIcon[0]===0x89&&touchIcon[1]===0x50,'apple-touch-icon.png must be a real PNG.');
 assert(touchIcon.readUInt32BE(16)===180&&touchIcon.readUInt32BE(20)===180,`apple-touch-icon.png must be 180×180 for the iOS home screen (got ${touchIcon.readUInt32BE(16)}×${touchIcon.readUInt32BE(20)}).`);
 const layout=await readFile(join(root,'app/layout.tsx'),'utf8');
 assert(layout.includes('"/apple-touch-icon.png"'),'app/layout.tsx must link the apple-touch-icon so Safari picks it up for the home screen.');
 const manifest=JSON.parse(await readFile(join(root,'public/manifest.webmanifest'),'utf8'));
 assert.equal(manifest.display,'standalone','The web manifest must declare display standalone — the installed app opens full screen, without browser bars.');
 console.log(`iOS publication verified: Safari Add to Home Surface — apple-touch-icon 180×180 linked in layout, manifest standalone, install card in „Ghidurile platformei” with the real steps.`);
 for(const name of ['location-context','geographic-scope','tabular-geography']){
  let source=await readFile(join(root,'lib',name+'.ts'),'utf8');for(const [binding,file] of [['countyLookup','public/data/locality-counties.json'],['urbanLocalities','public/data/geographic-localities.json']])source=source.replace("import "+binding+" from '@/"+file+"';",'const '+binding+'='+await readFile(join(root,file),'utf8')+';');source=source.replace("from './live/query'","from './query'");
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");await writeFile(join(temp,name+'.mjs'),js);
 }
 for(const name of ['resource-copy','catalog-metadata','source-xml','resources','resource-download','adapters','catalog-categories','records','query','text','media']){
   let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');source=source.replace("import audit from '@/public/catalog/audit.json';",'const audit='+await readFile(join(root,'public/catalog/audit.json'),'utf8')+';');source=source.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraDownloadEnv;');source=source.replace("from '../tabular-geography'","from './tabular-geography'").replace("from '../geographic-scope'","from './geographic-scope'");
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
  for(const pkg of ['xlsx','fflate'])js=js.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");await writeFile(join(temp,name+'.mjs'),js);
 }
 let route=await readFile(join(root,'app/api/resource-file/route.ts'),'utf8');
 let excel=ts.transpileModule(await readFile(join(root,'lib/excel-export.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace("from 'xlsx'","from '"+pathToFileURL(require.resolve('xlsx')).href+"'");await writeFile(join(temp,'excel-export.mjs'),excel);
 route=route.replace("from '@/lib/excel-export'","from './excel-export.mjs'");
 route=route.replace("import {readSource} from '@/lib/live/cache';",'const readSource=async()=>globalThis.__aflivraDownloadState;').replace("from '@/lib/live/resources'","from './resources.mjs'").replace("from '@/lib/live/resource-download'","from './resource-download.mjs'");
 await writeFile(join(temp,'route.mjs'),ts.transpileModule(route,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href));
 const {GET}=await import(pathToFileURL(join(temp,'route.mjs'))),{chunkRows}=await import(pathToFileURL(join(temp,'resources.mjs')));
 const metadata=await import(pathToFileURL(join(temp,'catalog-metadata.mjs'))),resourceModule=await import(pathToFileURL(join(temp,'resources.mjs')));
 const datasetId='15cb96b0-984f-4d89-9d04-cd500ba9fd22',resourceId='1088e792-54f4-43ad-8e4c-9b351b82d31c',rawDataset=await readFile(join(root,'public/catalog/datasets',datasetId+'.json'),'utf8');
 const record=metadata.verifiedCatalogResource(datasetId,resourceId,rawDataset);assert.equal(record.resource.id,resourceId);assert.throws(()=>metadata.verifiedCatalogResource(datasetId,resourceId,rawDataset+' '));assert.throws(()=>metadata.verifiedCatalogResource(datasetId,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',rawDataset));
 insert('resource:'+resourceId,null);sqlite.prepare('UPDATE source_cache SET next_attempt_at=?,expires_at=? WHERE key=?').run(Date.now()+3600000,Date.now()+3600000,'resource:'+resourceId);await metadata.saveResourceMetadata(record);assert.equal(sqlite.prepare('SELECT next_attempt_at FROM source_cache WHERE key=?').get('resource:'+resourceId).next_attempt_at,0);assert.equal((await metadata.savedResourceMetadata(resourceId)).resource.id,resourceId);
 const originalFetch=globalThis.fetch,downloadFixture=Array.from({length:2101},(_,n)=>n+',valoare '+n).join('\n');let fileRequested=false;globalThis.fetch=async(url)=>{if(String(url).includes('/api/3/action/'))throw Error('metadata endpoint unavailable');assert.equal(String(url),record.resource.url);fileRequested=true;return new Response('id,text\n'+downloadFixture,{headers:{'Content-Type':'text/csv'}})};
 try{const imported=await resourceModule.resourceLoader(resourceId).load();assert(fileRequested);assert.equal(imported.data.kind,'table');assert.equal(imported.data.complete,true);assert.equal(imported.data.sheets[0].total,2101);assert(imported.data.metadataNotice.includes('SHA-256'));const fullRows=await resourceModule.resourceSheetRows(imported.data,0);assert.equal(fullRows.at(-1)[0],'2100');const paged=await resourceModule.resourcePage({data:imported.data},{q:'2100',page:0,sheet:0,sort:-1,desc:false});assert.equal(paged.data.navigation.total,1)}finally{globalThis.fetch=originalFetch}
 console.log('Verified catalog recovery passed: original dataset SHA-256 and membership, immediate retry after failed metadata, all 2,101 rows imported from an available file while metadata API fails.');
 const id='12345678-1234-1234-1234-123456789abc',request=(params='',headers={})=>new Request('https://example.test/api/resource-file?id='+id+params,{headers});
 const rows=Array.from({length:2101},(_,i)=>[String(i),'Valoare cu „diacritice”, "ghilimele"\nși rând nou',i===2100?'ULTIMA ÎNREGISTRARE':'']);
 const chunks=chunkRows(rows,10000),keys=chunks.map((_,i)=>'download:table:'+i),checksums=chunks.map((rows,i)=>{const encoded=JSON.stringify(rows);insert(keys[i],encoded);return checksum(encoded)});
 globalThis.__aflivraDownloadState={status:'stale',data:{kind:'table',indexed:true,complete:true,title:'Școală\r\nX-Test: invalid',sheets:[{columns:['ID','Text','Ultima'],rows:[],total:rows.length,chunks:keys,checksums}]}};
 let response=await GET(request('&format=csv&download=1'));assert.equal(response.status,200);assert.equal(response.headers.get('X-Aflivra-Rows'),'2101');assert.match(response.headers.get('content-disposition'),/^attachment;/);assert(!/[\r\n]/.test(response.headers.get('content-disposition')));
 const csv=await response.text();assert(csv.includes('ULTIMA ÎNREGISTRARE'));assert(csv.includes('""ghilimele""'));assert.equal((csv.match(/^"\d+",/gm)||[]).length,2101,'Export must contain the full verified sheet, beyond the former row/page limit');
 const XLSX=require('xlsx');
 globalThis.__aflivraDownloadState.data.sheets.push({name:'A doua foaie',columns:['Cod','Valoare'],rows:[['000001',42]],total:1,chunks:['download:second'],checksums:[checksum(JSON.stringify([['000001',42]]))]});insert('download:second',JSON.stringify([['000001',42]]));
 response=await GET(request('&format=xlsx'));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/spreadsheetml/);assert.equal(response.headers.get('x-aflivra-rows'),'2101');assert.equal(response.headers.get('x-aflivra-sheets'),'1','XLSX exportează foia cerută, nu toate foile');const sheetZero=XLSX.read(new Uint8Array(await response.arrayBuffer()),{type:'array'});assert.equal(sheetZero.SheetNames.length,1);assert.equal(XLSX.utils.sheet_to_json(sheetZero.Sheets[sheetZero.SheetNames[0]],{header:1,raw:true}).length,2102,'foaia implicită, cu antet, integrală');
 response=await GET(request('&format=xlsx&sheet=1'));assert.equal(response.status,200);assert.equal(response.headers.get('x-aflivra-rows'),'1','a doua foaie se exportează la cerere');const sheetOne=XLSX.read(new Uint8Array(await response.arrayBuffer()),{type:'array'});assert.equal(XLSX.utils.sheet_to_json(sheetOne.Sheets[sheetOne.SheetNames[0]],{header:1,raw:true}).length,2);
 response=await GET(request('&format=xlsx&sheet=999'));assert.equal(response.status,400,'foaia inexistentă se respinge onest, nu se exportă workbook-ul altor foi');
 sqlite.prepare('UPDATE source_cache SET data=? WHERE key=?').run('[]',keys.at(-1));response=await GET(request('&format=csv'));assert.equal(response.status,503,'An incomplete or damaged sheet must never be downloaded as complete');
 assert.equal((await GET(request('&format=xlsx'))).status,503,'A damaged sheet must also block a workbook export');
 const bytes=Buffer.from('%PDF-1.7\nverified byte-range regression\n%%EOF');globalThis.__aflivraDownloadState={data:{kind:'pdf',title:'Document public',size:bytes.length,base64:bytes.toString('base64')}};
 response=await GET(request('&download=1'));assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 response=await GET(request('',{range:'bytes=5-11'}));assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(5,12));assert.match(response.headers.get('content-disposition'),/^inline;/);
 const large=Buffer.alloc(650000,65);large.write('%PDF-1.7\n');const documentChunks=[],documentChecksums=[];
 for(let at=0;at<large.length;at+=300000){const key='download:pdf:'+at,encoded=JSON.stringify(large.subarray(at,at+300000).toString('base64'));insert(key,encoded);documentChunks.push(key);documentChecksums.push(checksum(encoded))}
 globalThis.__aflivraDownloadState={data:{kind:'pdf',title:'Document mare',size:large.length,snapshot:checksum(large),documentChunks,documentChecksums}};
 response=await GET(request('&download=1',{range:'bytes=299999-300002'}));assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),large.subarray(299999,300003),'Range must cross document chunks without missing/duplicating bytes');
 response=await GET(request('',{range:'bytes=-5'}));assert.deepEqual(Buffer.from(await response.arrayBuffer()),large.subarray(-5));
 for(const range of ['bytes=-0','bytes=650000-','bytes=8-2','bytes=1-2,5-6'])assert.equal((await GET(request('',{range}))).status,416);
 assert.equal((await GET(new Request('https://example.test/api/resource-file?id=bad'))).status,400);
 const actualCopies=JSON.parse(await readFile(join(root,'lib/live/resource-seed.json'),'utf8')),copyValidator=await import(pathToFileURL(join(temp,'resource-copy.mjs')));for(const [key,copy] of Object.entries(actualCopies)){assert(copyValidator.validatedResourceCopy(copy));const resourceId=key.slice(9);globalThis.__aflivraDownloadState={status:'stale',error:'HTTP 522',data:copy.data};const format=copy.data.kind==='table'?'csv':'pdf';const result=await GET(new Request('https://example.test/api/resource-file?id='+resourceId+(format==='csv'?'&format=csv&download=1':'&download=1')));assert.equal(result.status,200);assert.match(result.headers.get('content-disposition'),/^attachment;/);const body=Buffer.from(await result.arrayBuffer());if(format==='csv'){assert.equal(Number(result.headers.get('x-aflivra-rows')),copy.data.sheets[0].total);const roundTrip=resourceModule.parseResource(body,'CSV');assert.deepEqual(roundTrip.data.sheets[0].rows,copy.data.sheets[0].rows);assert.deepEqual(roundTrip.data.sheets[0].columns,copy.data.sheets[0].columns);const page=await resourceModule.resourcePage({data:copy.data},{q:'',page:0,sheet:0,sort:-1,desc:false});assert.equal(page.data.navigation.total,copy.data.sheets[0].total)}else assert.deepEqual(body,await readFile(join(root,'public',copy.file)))}console.log('Actual source copies verified for downloads: all six published CSV records and every one of 37,488 PDF bytes preserved while live source is unavailable.');
 console.log('Download regressions passed: all 2,101 CSV rows with quoting/Unicode, checksum rejection, attachment headers, full PDF bytes, inline/suffix/cross-chunk ranges and invalid-input handling. No upstream or browser session was used.');
}finally{sqlite.close();delete globalThis.__aflivraDownloadEnv;delete globalThis.__aflivraDownloadState;await rm(temp,{recursive:true,force:true})}
