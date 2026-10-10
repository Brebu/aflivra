// Shared corpus-snapshot writer for the offline import scripts (SITUR, AMCCRS, EIDA,
// LMI): writes the payload under public/data/ (gzip by default, mirroring the
// transport model of scripts/import-mers-tren.mjs) and registers the SHA-256 proofs
// in public/data/snapshot-transport.json so the runtime readers can verify integrity
// exactly like the trains corpus does. Import scripts run offline (local or CI),
// never inside the Worker.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {gzipSync} from 'fflate';
import {createHash} from 'node:crypto';

const here=new URL('../',import.meta.url);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function writeSnapshot(files,path,payload,{gzip=true}={}){
 const bytes=new TextEncoder().encode(JSON.stringify(payload));
 const stored=gzip?gzipSync(bytes):bytes;
 const file=gzip?path+'.gz':path;
 const dir='public'+path.slice(0,path.lastIndexOf('/'));
 await mkdir(new URL(dir+'/',here),{recursive:true});
 await writeFile(new URL('public'+file,here),stored);
 const proof={path,file,bytes:bytes.length,sha256:sha256(bytes),storedBytes:stored.length,storedSha256:sha256(stored)};
 files.push(proof);
 return bytes.length;
}

// A quiet day at the source must stay a quiet day in git: `fetchedAt` and its
// license-stamp churn alone are download metadata, not content. The importer hashes
// the content-bearing keys (rows kept whole — duplicates preserved, absorbed only in
// the fingerprint's canonical order, so a registry that reshuffles its rows is not a
// content change) and skips the rewrite when the committed corpus already carries the
// same content under the same schema. The proof registered for a skipped file is the
// committed one, so a partial refresh never drops a sibling's entry.
const canonical=value=>{if(Array.isArray(value))return value.map(canonical).sort((a,b)=>a<b?-1:a>b?1:0);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=canonical(value[key]);return out}return value};

export function dataFingerprint(payload,contentKeys){
 const data={};for(const key of contentKeys)data[key]=payload[key];
 return sha256(new TextEncoder().encode(JSON.stringify(canonical(data))));
}

export async function committedPayload(path,{gzip=true}={}){
 try{const stored=await readFile(new URL('public'+(gzip?path+'.gz':path),here));return JSON.parse(new TextDecoder().decode(gzip?gunzipSync(stored):stored))}catch{return null}
}

export async function committedProof(path){
 try{const registry=JSON.parse(await readFile(new URL('public/data/snapshot-transport.json',here),'utf8'));return registry.items.find(item=>item.path===path)??null}catch{return null}
}

export async function writeSnapshotIfChanged(files,path,payload,{gzip=true,contentKeys=[]}={}){
 const committed=await committedPayload(path,{gzip});
 if(committed&&committed.schema===payload.schema&&dataFingerprint(committed,contentKeys)===dataFingerprint(payload,contentKeys)){
  const proof=await committedProof(path);
  if(proof){files.push(proof);return {bytes:proof.bytes,skipped:true}}
 }
 const bytes=await writeSnapshot(files,path,payload,{gzip});
 return {bytes,skipped:false};
}

// Registers the proofs under a prefix, replacing any prior entries for that prefix
// so a refresh never leaves stale proofs behind (the trains importer's model). The
// registry's item order is the commit history of the corpus set — an unchanged entry
// keeps its place, so a quiet day that skips every rewrite leaves the registry
// byte-identical on disk.
export async function registerPrefix(files,prefix){
 const registryPath=new URL('public/data/snapshot-transport.json',here);
 const rawText=await readFile(registryPath,'utf8');
 const registry=JSON.parse(rawText);
 const incoming=new Map(files.map(proof=>[proof.path,proof]));
 const seen=new Set(),next=[];
 for(const item of registry.items){
  if(!item.path.startsWith(prefix)){next.push(item);continue}
  const replacement=incoming.get(item.path);
  if(replacement){next.push(replacement);seen.add(item.path)}
 }
 for(const [path,proof] of incoming)if(!seen.has(path)){next.push(proof);seen.add(path)}
 registry.items=next;
 registry.originalBytes=registry.items.reduce((n,item)=>n+item.bytes,0);
 registry.storedBytes=registry.items.reduce((n,item)=>n+item.storedBytes,0);
 const candidate=JSON.stringify(registry)+'\n';
 if(candidate!==rawText)await writeFile(registryPath,candidate);
}

export const snapshotHere=here;
