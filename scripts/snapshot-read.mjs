import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

// Verification uses original bytes, matching the unchanged provenance proofs.
export async function readSnapshotFile(file,encoding){
 let bytes;
 try{bytes=await readFile(file);if(String(file).endsWith('.gz'))bytes=gunzipSync(bytes)}catch(error){
  if(error.code!=='ENOENT'||!String(file).endsWith('.json'))throw error;
  bytes=gunzipSync(await readFile(String(file)+'.gz'));
 }
 return encoding?bytes.toString(encoding):bytes;
}
