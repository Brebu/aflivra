// Shared corpus-snapshot writer for the offline import scripts (SITUR, AMCCRS, EIDA,
// LMI): writes the payload under public/data/ (gzip by default, mirroring the
// transport model of scripts/import-mers-tren.mjs) and registers the SHA-256 proofs
// in public/data/snapshot-transport.json so the runtime readers can verify integrity
// exactly like the trains corpus does. Import scripts run offline (local or CI),
// never inside the Worker.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
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

// Registers the proofs under a prefix, replacing any prior entries for that prefix
// so a refresh never leaves stale proofs behind (the trains importer's model).
export async function registerPrefix(files,prefix){
 const registry=JSON.parse(await readFile(new URL('public/data/snapshot-transport.json',here),'utf8'));
 registry.items=registry.items.filter(item=>!item.path.startsWith(prefix));
 registry.items.push(...files);
 registry.originalBytes=registry.items.reduce((n,item)=>n+item.bytes,0);
 await writeFile(new URL('public/data/snapshot-transport.json',here),JSON.stringify(registry)+'\n');
}

export const snapshotHere=here;
