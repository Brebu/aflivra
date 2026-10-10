/** Derive the D1-fallback catalog seed from the verified inventory:
 * canonical multi-label categories from public/catalog/index.json, no legacy
 * aliases, dataset URLs rebuilt from ids, resources kept from the prior seed
 * when the dataset was there before. One-shot: run after a snapshot import. */
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const inventory=JSON.parse(gunzipSync(readFileSync('public/catalog/index.json.gz')));
const previous=JSON.parse(readFileSync('lib/live/catalog-seed.json','utf8'));
const priorById=new Map(previous.map(row=>[row.id,row]));
const seed=inventory.items
 .map(row=>({id:row.id,title:row.title,organization:row.organization,notes:row.notes,modified:row.modified,url:'https://data.gov.ro/dataset/'+row.id,license:row.license,resourceCount:row.resourceCount,formats:row.formats,categories:Array.isArray(row.categories)?row.categories:[],resources:priorById.get(row.id)?.resources||[]}))
 .filter(row=>row.id&&row.title);
const legacyCategories=seed.filter(row=>!row.categories.length);
writeFileSync('lib/live/catalog-seed.json',JSON.stringify(seed));
console.log(JSON.stringify({seedRows:seed.length,fromInventory:inventory.items.length,priorRows:previous.length,withoutCategories:legacyCategories.length,sample:seed.filter(r=>r.categories.includes('agricultura')).length+' sets on agricultura'}));
