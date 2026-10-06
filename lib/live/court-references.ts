import {env} from 'cloudflare:workers';
import {createHash} from 'node:crypto';
import confirmed from '@/public/courts/confirmed-references.json';
import {extractCourtReferences,uniqueCourtReferences,type CourtReference} from '../court-history';
const seed=confirmed.items as CourtReference[];
const prefix=(number:string)=>'court-reference:v1:'+createHash('sha256').update(number).digest('hex')+':';

// Persist only the public numeric linkage and judgment metadata. Party names
// and the rest of the hearing summary are neither indexed nor searched here.
export async function rememberCourtReferences(items:any[],verifiedAt:string){
 const references=extractCourtReferences(items,verifiedAt);
 const db=env.DB;if(!db)return references;
 for(let at=0;at<references.length;at+=25){const statements=references.slice(at,at+25).map(reference=>{const key=prefix(reference.number)+createHash('sha256').update(reference.id).digest('hex');return db.prepare('INSERT INTO source_cache (key,data,last_success_at,adapter_version) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,last_success_at=excluded.last_success_at').bind(key,JSON.stringify(reference),verifiedAt,'court.reference.v1')});await db.batch(statements)}
 return references;
}
export async function courtReferences(items:any[],requestedNumber:string,verifiedAt:string){
 const references=[...seed,...extractCourtReferences(items,verifiedAt)];
 let lookupAvailable=true;
 if(requestedNumber&&env.DB)try{const start=prefix(requestedNumber),rows=(await env.DB.prepare('SELECT data FROM source_cache WHERE key>=? AND key<? ORDER BY key').bind(start,start+'~').all<{data:string}>()).results;for(const row of rows){try{const r=JSON.parse(row.data) as CourtReference;if(r.number===requestedNumber)references.push(r)}catch{/* Corrupt metadata cannot certify an additional stage. */}}}catch{lookupAvailable=false}
 return{references:uniqueCourtReferences(references),lookupAvailable};
}
