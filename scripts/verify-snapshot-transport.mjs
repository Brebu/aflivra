import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-transport-check-')),require=createRequire(import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const originalFetch=globalThis.fetch;
try{
 const transpile=async(name,file,replace=s=>s)=>{let code=replace(await readFile(join(root,file),'utf8'));let js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("from './text'","from './text.mjs'").replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace("from 'fflate'","from '"+pathToFileURL(require.resolve('fflate')).href+"'");await writeFile(join(temp,name+'.mjs'),js)};
 await transpile('snapshot-transport','lib/snapshot-transport.ts');
 await transpile('snapshot-cache','lib/snapshot-cache.ts');await transpile('snapshot-checksum','lib/snapshot-checksum.ts');
 await transpile('snapshot-store','app/snapshot-store.ts',s=>s.replace("from '@/lib/snapshot-transport'","from './snapshot-transport.mjs'").replace("from '@/lib/snapshot-cache'","from './snapshot-cache.mjs'").replace("from '@/lib/snapshot-checksum'","from './snapshot-checksum.mjs'"));
 const {snapshotAssetPath,decodeSnapshotBytes}=await import(pathToFileURL(join(temp,'snapshot-transport.mjs'))),{snapshotJson,snapshotText}=await import(pathToFileURL(join(temp,'snapshot-store.mjs')));
 const metadata=JSON.parse(await readFile(join(root,'public/data/snapshot-transport.json'),'utf8'));let bytes=0;
 for(const item of metadata.items){const encoded=await readFile(join(root,'public',item.file));assert.equal(encoded.length,item.storedBytes);assert.equal(hash(encoded),item.storedSha256);assert.equal(snapshotAssetPath(item.path),item.file);const raw=decodeSnapshotBytes(encoded);assert.equal(raw.length,item.bytes);assert.equal(hash(raw),item.sha256);bytes+=raw.length;JSON.parse(new TextDecoder().decode(raw))}
 assert.equal(bytes,metadata.originalBytes);assert.equal(snapshotAssetPath('/places/manifest.json'),'/places/manifest.json');assert.equal(snapshotAssetPath('/transit/network.json'),'/transit/network.json');
 let requested=[];globalThis.fetch=async url=>{requested.push(String(url));return new Response(await readFile(join(root,'public',String(url))))};
 for(const prefix of ['/places/records/','/transit/routes/','/stories/texts/','/catalog/datasets/']){const item=metadata.items.find(x=>x.path.startsWith(prefix));assert(item);const data=await snapshotJson(item.path,item);assert.equal(typeof data,'object');assert.equal(requested.at(-1),item.file);const raw=await snapshotText(item.path,item);assert.equal(hash(Buffer.from(raw)),item.sha256);await assert.rejects(()=>snapshotText(item.path,{...item,sha256:'0'.repeat(64)}),/integralității/)}
 const sample=metadata.items.find(x=>x.path.startsWith('/catalog/datasets/')),uncompressed=decodeSnapshotBytes(await readFile(join(root,'public',sample.file)));
 globalThis.fetch=async()=>new Response(uncompressed);assert.equal(hash(Buffer.from(await snapshotText(sample.path,sample))),sample.sha256,'HTTP-decompressed responses must not be decompressed a second time');
 await transpile('query','lib/live/query.ts');
 await transpile('media','lib/live/media.ts');await transpile('text','lib/live/text.ts');
 await transpile('places-query','lib/places-query.ts',s=>s.replace("from './live/query'","from './query.mjs'").replace("from './live/media'","from './media.mjs'"));
 const manifest=await readFile(join(root,'public/places/manifest.json'),'utf8');requested=[];globalThis.__transportAssets={async fetch(request){const path=new URL(request.url).pathname;requested.push(path);return new Response(await readFile(join(root,'public',path)))}};
 await transpile('places-api','app/api/places/route.ts',s=>s.replace("import {env} from 'cloudflare:workers';",'const env={ASSETS:globalThis.__transportAssets};').replace("import rawManifest from '@/public/places/manifest.json';",'const rawManifest='+manifest+';').replace("from '@/lib/places-query'","from './places-query.mjs'").replace("from '@/lib/snapshot-transport'","from './snapshot-transport.mjs'"));
 const {GET}=await import(pathToFileURL(join(temp,'places-api.mjs'))),response=await GET(new Request('https://example.test/api/places?category=local')),result=await response.json();assert.equal(response.status,200);assert.equal(result.data.total,181649);assert.equal(result.data.items.length,18);assert.equal(requested.length,1);assert(requested[0].endsWith('.json.gz'));
 console.log(`Lossless transport verified: all ${metadata.items.length} snapshots and ${bytes} original bytes; unchanged SHA-256 proofs, actual browser reader, original catalog text, damaged-proof rejection and one-shard Worker API.`);
}finally{globalThis.fetch=originalFetch;delete globalThis.__transportAssets;await rm(temp,{recursive:true,force:true})}
