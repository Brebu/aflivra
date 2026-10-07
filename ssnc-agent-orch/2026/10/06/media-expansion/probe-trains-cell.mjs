import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const R='/Users/cbrebu/Projects/alfivra';
const temp=await mkdtemp(join(tmpdir(),'aflivra-dbg-'));
const require=createRequire(import.meta.url);
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(await readFile(R+'/drizzle/0000_thin_demogoblin.sql','utf8'));
const db={prepare(sql){let args=[];const w={bind(...v){args=v;return w},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}}}};return w},async batch(sts){const out=[];for(const s of sts)out.push(await s.run());return out}};
const assetsFetch=async request=>{const path=new URL(request.url).pathname;console.log('  ASSETS fetch:',path);try{const f=await readFile(R+'/public'+path);return new Response(f)}catch(e){console.log('  ASSETS miss:',path,e.message);return new Response(null,{status:404})}};
globalThis.__aflivraTestEnv={DB:db,ASSETS:{fetch:assetsFetch}};
const httpRetry=pathToFileURL(R+'/lib/http-retry.mjs').href;
const compile=async(name,file)=>{let source=await readFile(R+'/'+file,'utf8');
 if(file.startsWith('app/'))source=source.replaceAll('@/lib/live/','./');
 source=source
  .replace("from '../snapshot-transport'","from './snapshot-transport'")
  .replace("from '../geographic-scope'","from './geographic-scope")
  .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;')
  .replace("import {serverSeeds,catalogSeed} from './seed-snapshots';",'const serverSeeds={};const catalogSeed=[];')
  .replace("import baseSeeds from './seed.json';",'const baseSeeds='+await readFile(R+'/lib/live/seed.json','utf8')+';')
  .replace("import resourceCopies from './resource-seed.json';",'const resourceCopies=globalThis.__aflivraResourceCopies;')
  .replace("import proofs from '@/public/data/snapshot-transport.json';",'const proofs='+await readFile(R+'/public/data/snapshot-transport.json','utf8')+';')
  .replace("import manifest from '@/public/trains/manifest.json';",'const manifest='+await readFile(R+'/public/trains/manifest.json','utf8')+';');
 let out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 out=out.replaceAll('@/lib/http-retry.mjs',httpRetry).replace(/from '\.\/([^'.][^']*)'/g,(_,p)=>"from './"+p+".mjs'");
 for(const pkg of ['xlsx','fflate'])out=out.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");
 const f=join(temp,name+'.mjs');await writeFile(f,out);return f};
await compile('snapshot-transport','lib/snapshot-transport.ts');
await compile('query','lib/live/query.ts');
await compile('adapters','lib/live/adapters.ts');
await compile('text','lib/live/text.ts');
await compile('media','lib/live/media.ts');
await compile('trains','lib/live/trains.ts');
const routeFile=await compile('route-trains','app/api/trains/route.ts');
const mod=await import(pathToFileURL(routeFile));
const response=await mod.GET(new Request('https://verify.test/api/trains?q=bra%C8%99ov'));
const payload=await response.json();
console.log('status',payload.status,'| error:',payload.error,'| total:',payload.data?.total,'| items:',payload.data?.items?.length);
if(payload.data?.items?.length)console.log('first:',JSON.stringify(payload.data.items.slice(0,2)));
await rm(temp,{recursive:true,force:true});
