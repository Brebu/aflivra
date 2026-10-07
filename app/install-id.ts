'use client';
// Anonymous per-install identity for the watch endpoints: a client-generated UUIDv4,
// persisted per install. Zero PII — the id carries no user, device or account data,
// only what `crypto.randomUUID` produces. Created lazily on the first watch action,
// and cleared by „Șterge-mi datele" so nothing links an old install to a new one.
const storageKey='aflivra.install.v1';
const uuidv4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function randomUuidv4():string{
  // Non-secure contexts lack crypto.randomUUID; a v4 from getRandomValues keeps the same shape.
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=new Uint8Array(16);
  if(typeof crypto==='undefined'||!crypto.getRandomValues)throw Error('Identificatorul dispozitivului nu poate fi generat.');
  crypto.getRandomValues(bytes);
  bytes[6]=bytes[6]&0x0f|0x40;
  bytes[8]=bytes[8]&0x3f|0x80;
  const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export function readInstallId():string|null{
  try{const saved=localStorage.getItem(storageKey);return saved&&uuidv4.test(saved)?saved:null}catch{return null}
}
export function clearInstallId():void{
  try{localStorage.removeItem(storageKey)}catch{}
}
// Returns the persisted id, creating and persisting one on first need. Without
// persistent storage the id lives only for this session — the app already surfaces
// the storage failure in its status banner.
export function ensureInstallId():string{
  try{
    const saved=localStorage.getItem(storageKey);
    if(saved&&uuidv4.test(saved))return saved;
    const made=randomUuidv4();
    if(!uuidv4.test(made))throw Error('Identificator invalid.');
    localStorage.setItem(storageKey,made);
    return made;
  }catch{
    return randomUuidv4();
  }
}
