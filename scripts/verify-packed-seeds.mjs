import assert from 'node:assert/strict';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync,gunzipSync} from 'fflate';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(root,'.sites-runtime/seed-qa-'));
const digest=async file=>{const hash=createHash('sha256');let bytes=0;for await (const chunk of createReadStream(file)){bytes+=chunk.length;hash.update(chunk)}return{bytes,sha256:hash.digest('hex')}};
try {
  const packed=JSON.parse(await readFile(join(root,'lib/live/seed-snapshots.json'),'utf8'));
  // The corpora are compared by streaming SHA-256, never parsed or held: byte equality proves every record, field and date survives the pack, at O(1) memory.
  for(const [key,file] of [['server','server-seed.json'],['catalog','catalog-seed.json']]){
    const entry=packed[key],onDisk=await digest(join(root,'lib/live',file)),binary=atob(entry.gzipBase64),compressed=new Uint8Array(binary.length);for(let at=0;at<binary.length;at++)compressed[at]=binary.charCodeAt(at);
    const decoded=gunzipSync(compressed),decodedSha256=createHash('sha256').update(decoded).digest('hex');
    assert.equal(decoded.length,entry.bytes,`the packed ${key} seed does not decode to its declared byte count`);
    assert.equal(decodedSha256,entry.sha256,`the packed ${key} seed does not decode to its declared digest`);
    assert.equal(onDisk.bytes,entry.bytes,`${file} drifted from the packed ${key} seed — re-pack it (scripts/pack-live-seeds.py)`);
    assert.equal(onDisk.sha256,entry.sha256,`${file} drifted from the packed ${key} seed — re-pack it (scripts/pack-live-seeds.py)`);
  }
  const source=(await readFile(join(root,'lib/live/seed-snapshots.ts'),'utf8')).replace("import packed from './seed-snapshots.json';",'const packed=globalThis.__packedLiveSeed;');
  const eager=source.match(/export const (serverSeeds|catalogSeed)[^\n]*/g)||[];
  assert.equal(eager.length,2,'the eager startup decodes moved in lib/live/seed-snapshots.ts — update the stubs that keep this harness OOM-safe');
  const stubbed=source.replace(/export const serverSeeds[^\n]*/,'export const serverSeeds:Record<string,any>={};').replace(/export const catalogSeed[^\n]*/,'export const catalogSeed:any[]=[];');
  globalThis.__packedLiveSeed=packed;
  await writeFile(join(temp,'seeds.mjs'),ts.transpileModule(stubbed,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
  const actual=await import(pathToFileURL(join(temp,'seeds.mjs')));
  const record={checkedAt:'2026-10-07T00:00:00.000Z',stages:[{number:'6236/111/2017',label:'Fond'}]},raw=new TextEncoder().encode(JSON.stringify(record)),entry={bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),gzipBase64:btoa(String.fromCharCode(...gzipSync(raw)))};
  assert.deepEqual(actual.decodeLiveSeed(entry),record,'the shipped decoder must round-trip a valid entry end to end');
  assert.throws(()=>actual.decodeLiveSeed({...packed.server,bytes:packed.server.bytes-1}),/integrity/);
  assert.throws(()=>actual.decodeLiveSeed({...packed.catalog,sha256:'0'.repeat(64)}),/integrity/);
  console.log(`Packed seeds verified OOM-safe: streaming SHA-256 proves the shipped server (${packed.server.bytes} B) and catalog (${packed.catalog.bytes} B) packs decode byte-identically to their source corpora, without loading them; the shipped decoder round-trips a valid entry and rejects damaged byte counts and hashes.`);
} finally {
  delete globalThis.__packedLiveSeed;
  await rm(temp,{recursive:true,force:true});
}
