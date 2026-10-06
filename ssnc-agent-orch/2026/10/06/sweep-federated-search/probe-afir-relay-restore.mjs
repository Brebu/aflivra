import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(fileURLToPath(new URL('../../../../..',import.meta.url)),'.');
const sessionDir=resolve(fileURLToPath(new URL('.',import.meta.url)),'.');
const snapshot=JSON.parse(await readFile(join(sessionDir,'probes/relay-smoke-snapshot.json'),'utf8'));
const d1=(sql)=>{const out=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--command',sql,'--json'],{cwd:root,capture:true});if(out.status!==0)throw Error('D1 CLI a eșuat: '+String(out.stderr));const raw=JSON.parse(out.stdout);return Array.isArray(raw)?raw[0].results:raw.result[0].results};
const q=value=>"'"+String(value===null||value===undefined?'':value).replace(/'/g,"''")+"'";
const seedEntry=JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8'))['feed:agricultura'];
const articleKeys=seedEntry.data.items.map(item=>'article:'+createHash('sha256').update(item.url).digest('hex'));
const beforeRestore=d1(`SELECT key FROM source_cache WHERE key IN (${[...articleKeys,'feed:agricultura'].map(k=>q(k)).join(',')})`);
console.log('înainte de restaurare: '+beforeRestore.length+' rânduri atinse de smoke');
for(const key of articleKeys)d1('DELETE FROM source_cache WHERE key='+q(key));
const feedRow=snapshot.rows.find(row=>row.key==='feed:agricultura');
if(feedRow){
 d1('UPDATE source_cache SET data='+q(feedRow.data)+',published_at='+q(feedRow.published_at)+',last_success_at='+q(feedRow.last_success_at)+',last_attempt_at='+q(feedRow.last_attempt_at)+',expires_at='+feedRow.expires_at+',next_attempt_at='+feedRow.next_attempt_at+',failures='+feedRow.failures+',lock_until='+feedRow.lock_until+',error='+q(feedRow.error)+',adapter_version='+q(feedRow.adapter_version)+' WHERE key='+q(feedRow.key));
}
const after=d1(`SELECT key,substr(ifnull(data,''),1,70) AS head,last_success_at,expires_at FROM source_cache WHERE key IN (${[...articleKeys,'feed:agricultura'].map(k=>q(k)).join(',')})`);
assert.equal(after.length,1,'după restaurare rămâne doar rândul de flux');
assert(after[0].key==='feed:agricultura'&&after[0].head===snapshot.rows[0].data.slice(0,70),'rândul de flux restaurat byte-la-byte');
const budgetNow=d1('SELECT key,window_start,used FROM source_budget');
assert.equal(JSON.stringify(budgetNow),JSON.stringify(snapshot.budget),'tabela de buget rămâne neatinsă de smoke');
console.log('restaurat: feed:agricultura byte-identic ('+String(feedRow.data).length+' octeți), '+articleKeys.length+' rânduri de articole de test șterse, buget neatins.');
