import {createHash,timingSafeEqual} from 'node:crypto';
/** Constant-time comparison; callers never put the operator secret in tool arguments. */
export function refreshAuthorized(token:string|undefined,header:string|null){
 if(!token||!header?.startsWith('Bearer '))return false;
 const digest=(value:string)=>createHash('sha256').update(value).digest();
 return timingSafeEqual(digest(header.slice(7)),digest(token));
}
