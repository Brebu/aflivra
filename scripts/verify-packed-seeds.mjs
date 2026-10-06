import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(root,'.sites-runtime/seed-qa-'));
try {
 const packed=JSON.parse(await readFile(join(root,'lib/live/seed-snapshots.json'),'utf8'));
 const source=(await readFile(join(root,'lib/live/seed-snapshots.ts'),'utf8')).replace("import packed from './seed-snapshots.json';",'const packed=globalThis.__packedLiveSeed;');
 globalThis.__packedLiveSeed=packed;
 await writeFile(join(temp,'seeds.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
 const actual=await import(pathToFileURL(join(temp,'seeds.mjs')));
 assert.deepEqual(actual.serverSeeds,JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8')));
 assert.deepEqual(actual.catalogSeed,JSON.parse(await readFile(join(root,'lib/live/catalog-seed.json'),'utf8')));
 assert.throws(()=>actual.decodeLiveSeed({...packed.server,bytes:packed.server.bytes-1}),/integrity/);
 assert.throws(()=>actual.decodeLiveSeed({...packed.catalog,sha256:'0'.repeat(64)}),/integrity/);
 console.log('Actual startup decoder verified: all server/catalog records, fields and dates preserved; damaged byte counts and hashes rejected.');
} finally {
 delete globalThis.__packedLiveSeed;
 await rm(temp,{recursive:true,force:true});
}
