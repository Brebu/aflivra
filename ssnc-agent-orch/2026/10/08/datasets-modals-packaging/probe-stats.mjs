// Flattening stats on synthetic fixtures (offline; mission report evidence).
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'../../../../..'),temp=await mkdtemp(join(tmpdir(),'aflivra-stats-')),require=createRequire(import.meta.url);
try{
 for(const name of ['records','text','media','query','catalog-categories','adapters','source-xml']){
  let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
  source=source.replace("import {env} from 'cloudflare:workers';",'const env={};').replace("import baseSeeds from './seed.json';",'const baseSeeds={};');
  let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  output=output.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
  await writeFile(join(temp,name+'.mjs'),output);
 }
 const {xmlTableRowSet}=await import(pathToFileURL(join(temp,'source-xml.mjs')));
 const stat=(name,raw)=>{
  const started=process.hrtime.bigint();
  let result,threw=null;
  try{result=xmlTableRowSet(raw)}catch(e){threw=e.message}
  const ms=Number(process.hrtime.bigint()-started)/1e6;
  console.log(name.padEnd(34),threw?('THROW: '+threw):result?('tabel '+result.name.padEnd(12)+' rows='+String(result.rows.length).padStart(6)+' cols='+String(result.columns.length).padStart(4)+' dimensiune='+(raw.length/1048576).toFixed(2)+'MB  '+ms.toFixed(0)+'ms'):'document (null)',ms>0?(''):'');
 };
 // CNAS-like registry export: 50k contract rows, attributes + leaf children + one nested address.
 const contracts=Array.from({length:50000},(_,i)=>' <Contract id="'+(i+1)+'" tip="'+(i%2?'FARM':'SPITAL')+'" status="activ"><Furnizor>Furnizor public '+i+'</Furnizor><CUI>'+(100000+i)+'</CUI><Localitate>'+(i%42?'Cluj-Napoca':'București')+'</Localitate><Adresa><Strada>Str. Exemplu '+i+'</Strada><Judet>Cluj</Judet></Adresa></Contract>').join('\n');
 stat('registry 50k rows', '<?xml version="1.0"?>\n<Contracte>\n'+contracts+'\n</Contracte>');
 // Wide row: 40 columns × 5k rows.
 const wide=Array.from({length:5000},(_,i)=>' <Rand id="'+i+'">'+Array.from({length:40},(_,c)=>'<Col'+c+'>v'+i+'-'+c+'</Col'+c+'>').join('')+'</Rand>').join('\n');
 stat('wide 5k×40', '<Randuri>\n'+wide+'\n</Randuri>');
 // KML-like: nested folders with placemarks (attributes + nested Point/coordinates).
 const folders=Array.from({length:20},(_,f)=>' <Folder><name>Sector '+(f+1)+'</name>'+Array.from({length:250},(_,p)=>'<Placemark id="pm-'+f+'-'+p+'"><name>Punct '+(f*250+p)+'</name><Point><coordinates>26.1,44.4,0</coordinates></Point></Placemark>').join('')+'</Folder>').join('\n');
 stat('KML 5k placemarks/20 foldere', '<kml>\n<Document>\n'+folders+'\n</Document>\n</kml>');
 // RSS-like: items in a channel.
 const items=Array.from({length:2000},(_,i)=>'<item><title>Anunț '+i+'</title><link>https://exemplu.ro/'+i+'</link><pubDate>Tue, 06 Oct 2026 08:00:00 GMT</pubDate><description>Descriere '+i+'</description></item>').join('');
 stat('RSS 2k items', '<rss><channel>'+items+'</channel></rss>');
 // Root-level row fragment (no wrapper).
 stat('fragment 3 root rows', '<Rand id="a"/><Rand id="b"/><Rand id="c"/>');
 // Repeats storm: 200 same-name children per row, 3 rows → over the 128-column cap → document.
 const storm=Array.from({length:3},(_,i)=>'<Rand id="'+i+'">'+Array.from({length:200},(_,c)=>'<X>x'+c+'</X>').join('')+'</Rand>').join('');
 stat('repeats 3×200 (peste cap)', '<Randuri>'+storm+'</Randuri>');
 // Pathological unterminated (CPU guard observation, small size).
 stat('pathologic <a fara >', '<a '+'x'.repeat(200000));
}catch(e){console.error(e)}finally{await rm(temp,{recursive:true,force:true})}
