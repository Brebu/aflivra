import packed from './seed-snapshots.json';
import {gunzipSync,strFromU8} from 'fflate';
import {createHash} from 'node:crypto';

export function decodeLiveSeed(item:{gzipBase64:string;bytes:number;sha256:string}):any {
 const compressed=Uint8Array.from(atob(item.gzipBase64),char=>char.charCodeAt(0));
 const bytes=gunzipSync(compressed);
 if(bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Startup snapshot integrity check failed.');
 return JSON.parse(strFromU8(bytes));
}

export const serverSeeds:Record<string,any>=decodeLiveSeed(packed.server);
export const catalogSeed:any[]=decodeLiveSeed(packed.catalog);
