import {env} from 'cloudflare:workers';
import {createHash} from 'node:crypto';
import {officialLawUrl,legalToday} from './legal-consolidation';
import codes from '@/public/legal-snapshots/manifest.json';

export type TrackedLaw={id:string;title:string;type:string;number:string;date:string};
const prefix='law-tracked:v1:',upper='law-tracked:v2:';
const metadata=(act:any):TrackedLaw|null=>{const id=officialLawUrl(act.id||'');return id?{id,title:String(act.title||'Act normativ').slice(0,1200),type:String(act.type||'').slice(0,80),number:String(act.number||'').slice(0,20),date:String(act.date||'').slice(0,40)}:null};
export async function rememberLaw(act:any){const entry=metadata(act);if(!entry||!env.DB||codes.items.some(code=>code.id===entry.id))return;const key=prefix+createHash('sha256').update(entry.id).digest('hex');await env.DB.prepare('INSERT INTO source_cache (key,data,last_success_at,adapter_version) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,last_success_at=excluded.last_success_at').bind(key,JSON.stringify(entry),new Date().toISOString(),'law.tracked.v1').run()}
export async function trackedLaws(cursor=''){
 if(cursor&&!/^[a-f0-9]{64}$/.test(cursor))throw Error('Cursor invalid.');
 const initial=cursor?[]:codes.items.map(metadata).filter((act):act is TrackedLaw=>!!act),rows=env.DB?(await env.DB.prepare('SELECT key,data FROM source_cache WHERE key>? AND key<? ORDER BY key LIMIT 41').bind(prefix+cursor,upper).all<{key:string;data:string}>()).results:[],page=rows.slice(0,40),items=[...initial];
 for(const row of page){try{const entry=metadata(JSON.parse(row.data));if(entry&&!items.some(act=>act.id===entry.id))items.push(entry)}catch{/* A corrupt metadata row cannot provide a law or certify a version. */}}
 return{asOf:legalToday(),items,nextCursor:rows.length>40?page.at(-1)!.key.slice(prefix.length):null,scope:'Cele șase coduri și actele deschise în Legal; orice alt rezultat se verifică la prima deschidere.'};
}
