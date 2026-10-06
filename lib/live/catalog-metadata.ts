import {createHash} from 'node:crypto';
import {env} from 'cloudflare:workers';
import audit from '@/public/catalog/audit.json';
import {SourceError} from './adapters';
export function verifiedCatalogResource(datasetId:string,resourceId:string,raw:string){
 const expected=(audit.datasetChecksums as Record<string,string>)[datasetId];
 if(!expected||createHash('sha256').update(raw).digest('hex')!==expected)throw new SourceError('Fișa catalogului nu a trecut verificarea integralității.');
 const dataset=JSON.parse(raw);if(dataset.id!==datasetId||!Array.isArray(dataset.resources))throw new SourceError('Fișa setului nu este validă.');
 const resource=dataset.resources.find((item:any)=>item.id===resourceId);if(!resource?.url)throw new SourceError('Resursa nu aparține setului selectat.');
 return{resource,datasetId,datasetChecksum:expected,metadataFetchedAt:audit.fetchedAt||null};
}
export async function saveResourceMetadata(record:ReturnType<typeof verifiedCatalogResource>){
 if(!env.DB)throw new SourceError('Stocarea metadatelor este temporar indisponibilă.');const encoded=JSON.stringify(record);if(new TextEncoder().encode(encoded).length>1_500_000)throw new SourceError('Fișa resursei este prea mare pentru această recuperare.');
 await env.DB.prepare('INSERT INTO source_cache (key,data,last_success_at,adapter_version) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,last_success_at=excluded.last_success_at,adapter_version=excluded.adapter_version').bind('resource-metadata:'+record.resource.id,encoded,new Date().toISOString(),'catalog.metadata.sha256.v1').run();
 // A validated metadata recovery may retry a never-imported file immediately.
 await env.DB.prepare("UPDATE source_cache SET next_attempt_at=0,expires_at=0 WHERE key=? AND (data IS NULL OR data='null')").bind('resource:'+record.resource.id).run();
}
export async function savedResourceMetadata(id:string){if(!env.DB)return null;const row=await env.DB.prepare('SELECT data FROM source_cache WHERE key=?').bind('resource-metadata:'+id).first<{data:string}>();if(!row?.data)return null;const record=JSON.parse(row.data);if(record.resource?.id!==id||(audit.datasetChecksums as Record<string,string>)[record.datasetId]!==record.datasetChecksum)return null;return record}
