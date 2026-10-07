import {env} from 'cloudflare:workers';

// Notificările Web Push către telefoane: VAPID (RFC 8292) semnează cererea cu ES256 prin
// WebCrypto, iar corpul se criptează aes128gcm (RFC 8291) — ECDH efemer + HKDF cu sarea din
// secretul de autentificare al abonamentului. Zero dependențe noi: totul din WebCrypto-ul Workerului.
const encoder=new TextEncoder();
const b64url=(bytes:Uint8Array<ArrayBuffer>):string=>{let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const unb64=(value:string):Uint8Array<ArrayBuffer>=>{const normalized=value.replace(/-/g,'+').replace(/_/g,'/'),padded=normalized+'='.repeat((4-normalized.length%4)%4),binary=atob(padded),bytes=new Uint8Array(new ArrayBuffer(binary.length));for(let at=0;at<binary.length;at++)bytes[at]=binary.charCodeAt(at);return bytes};
export type PushPayload={title:string;body:string;url:string};
export type PushSubscriptionLike={endpoint:string;p256dh:string;auth:string};

const VAPID_CONTACT='mailto:contact@aflivra.brebu.workers.dev';
let signingKey:CryptoKey|null|undefined;
/** Cheia publică expusă clienților la abonare; null când push-ul nu este configurat onest. */
export const vapidPublicKey=():string|null=>env.VAPID_PUBLIC&&env.VAPID_PRIVATE?env.VAPID_PUBLIC:null;
async function vapidSigner():Promise<CryptoKey|null>{
  if(signingKey!==undefined)return signingKey;
  signingKey=null;
  try{
    const publicKey=env.VAPID_PUBLIC||'',privateKey=env.VAPID_PRIVATE||'';
    if(!publicKey||!privateKey)return null;
    const raw=unb64(publicKey);
    if(raw.length!==65||raw[0]!==4)return console.warn(JSON.stringify({event:'watch_vapid_malformed_public'})),null;
    const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',d:privateKey,x:b64url(raw.subarray(1,33)),y:b64url(raw.subarray(33))},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    // Perechea se auto-verifică la prima folosire: o secretă înlocuită fără cheia publică
    // corespunzătoare se semnalează onest, nu se trimite niciodată semnat strâmb.
    const probe=encoder.encode('aflivra-vapid-pair-check');
    const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,probe);
    const verified=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await crypto.subtle.importKey('raw',raw,{name:'ECDSA',namedCurve:'P-256'},false,['verify']),signature,probe);
    if(!verified)return console.warn(JSON.stringify({event:'watch_vapid_pair_mismatch'})),null;
    signingKey=key;
  }catch{console.warn(JSON.stringify({event:'watch_vapid_config_error'}))}
  return signingKey;
}
async function vapidAuthorization(audience:string):Promise<string|null>{
  const key=await vapidSigner();
  if(!key)return null;
  // Ordinea câmpurilor din antetul JWT face parte din contractul VAPID, nu un detaliu de serializare.
  const header=encoder.encode('{"typ":"JWT","alg":"ES256"}');
  const payload=encoder.encode(JSON.stringify({aud:audience,exp:Math.floor(Date.now()/1000)+12*3600,sub:VAPID_CONTACT}));
  const unsigned=b64url(header)+'.'+b64url(payload);
  // Semnătura ES256 din JOSE este forma brută r||s (RFC 7515), nu împachetarea DER.
  const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(unsigned)));
  return 'vapid t='+unsigned+'.'+b64url(signature)+', k='+env.VAPID_PUBLIC;
}
const concat=(...parts:Uint8Array<ArrayBuffer>[])=>{const total=parts.reduce((sum,part)=>sum+part.length,0),body=new Uint8Array(new ArrayBuffer(total));let at=0;for(const part of parts){body.set(part,at);at+=part.length}return body};
const bytes=(length:number)=>new Uint8Array(new ArrayBuffer(length));
const fromValues=(values:number[])=>{const out=bytes(values.length);out.set(values);return out};
export async function encryptPushPayload(payload:PushPayload,p256dh:string,auth:string):Promise<Uint8Array<ArrayBuffer>>{
  const content=concat(encoder.encode(JSON.stringify(payload)),fromValues([2]));
  const uaPublic=await crypto.subtle.importKey('raw',unb64(p256dh),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const ikm=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaPublic},ephemeral.privateKey,256));
  const hkdf=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);
  const cek=new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:unb64(auth),info:encoder.encode('WebPush: info aes128gcm')},hkdf,128));
  const salt=crypto.getRandomValues(bytes(16));
  const nonce=bytes(12);
  for(let at=0;at<4;at++)nonce[8+at]=salt[12+at]^(at===3?1:0);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt']),content));
  const ephemeralPublic=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
  return concat(salt,fromValues([0,0,0x10,0]),fromValues([65]),ephemeralPublic,ciphertext);
}
export type PushOutcome='sent'|'gone'|'failed'|'skipped';
/** Trimite o notificare criptată; 404/410 înseamnă abonamentul a dispărut și trebuie curățat. */
export async function sendPush(subscription:PushSubscriptionLike,payload:PushPayload):Promise<PushOutcome>{
  try{
    const authorization=await vapidAuthorization(new URL(subscription.endpoint).origin);
    if(!authorization)return 'skipped';
    const body=await encryptPushPayload(payload,subscription.p256dh,subscription.auth);
    const response=await fetch(subscription.endpoint,{method:'POST',headers:{'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'86400',Urgency:'normal',Authorization:authorization},body});
    if(response.status===404||response.status===410){try{await response.body?.cancel()}catch{}return 'gone'}
    if(response.ok)return 'sent';
    try{await response.body?.cancel()}catch{}
    console.warn(JSON.stringify({event:'watch_push_error',status:response.status}));
    return 'failed';
  }catch(e){console.warn(JSON.stringify({event:'watch_push_failure',message:e instanceof Error?e.message:'Trimiterea notificării a eșuat.'}));return 'failed'}
}
