import {gunzipSync} from 'fflate';

// Logical snapshot paths and their original SHA-256 proofs remain unchanged.
// Only the stored transport representation is compressed.
export function snapshotAssetPath(path:string):string {
 const compressed=/^\/(?:places\/(?:records|indices|spatial)\/.+|transit\/routes\/.+|stories\/(?:texts\/.+|index)|catalog\/(?:datasets\/.+|index)|trains\/(?:stations|boards\/.+))\.json$/;
 return compressed.test(path)?path+'.gz':path;
}

export function decodeSnapshotBytes(input:ArrayBuffer|Uint8Array):Uint8Array {
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 // Accept bytes already decompressed by HTTP as well as raw gzip assets.
 return bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes):bytes;
}
