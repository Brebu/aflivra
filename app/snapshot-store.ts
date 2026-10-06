'use client';
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import {snapshotAssetPath,decodeSnapshotBytes} from '@/lib/snapshot-transport';
import {SnapshotCache} from '@/lib/snapshot-cache';
import {snapshotChecksum} from '@/lib/snapshot-checksum';
const memory=new SnapshotCache();
async function snapshotBytes(path:string,proof?:{sha256:string;bytes:number},signal?:AbortSignal):Promise<Uint8Array>{
 signal?.throwIfAborted();const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(),15000);
 try{
 const response=await fetchWithServerRetry(snapshotAssetPath(path),{signal:controller.signal,cache:proof?'force-cache':'no-cache'});if(!response.ok)throw Error('Datele publicate nu pot fi încărcate acum.');
 const bytes=decodeSnapshotBytes(await response.arrayBuffer());if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(proof){const hash=await snapshotChecksum(bytes,signal);if(bytes.byteLength!==proof.bytes||hash!==proof.sha256)throw Error('Copia nu a trecut verificarea integralității. Reîncearcă încărcarea.');}
 return bytes;
 }catch(e){if(controller.signal.aborted&&!signal?.aborted)throw Error('Încărcarea nu a răspuns la timp. Poți reîncerca.');throw e}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
export async function snapshotText(path:string,proof?:{sha256:string;bytes:number},signal?:AbortSignal):Promise<string>{return new TextDecoder().decode(await snapshotBytes(path,proof,signal))}
export async function snapshotJson<T=any>(path:string,proof?:{sha256:string;bytes:number},signal?:AbortSignal):Promise<T>{
 signal?.throwIfAborted();const key=path+':'+(proof?.sha256||''),cacheable=!!proof&&!path.startsWith('/transit/routes/');
 if(cacheable){const cached=memory.get(key);if(cached!==undefined)return cached}
 const text=await snapshotText(path,proof,signal);signal?.throwIfAborted();const data=JSON.parse(text);
 if(cacheable)memory.set(key,data,proof.bytes);return data;
}
