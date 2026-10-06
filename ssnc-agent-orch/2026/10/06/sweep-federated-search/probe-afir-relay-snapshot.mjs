import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../../../..',import.meta.url)),'.');
const sessionDir=resolve(fileURLToPath(new URL('.',import.meta.url)),'.');
const seedEntry=JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8'))['feed:agricultura'];
const keys=['feed:agricultura',...seedEntry.data.items.map(item=>'article:'+createHash('sha256').update(item.url).digest('hex'))];
const d1=(sql)=>{const out=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--command',sql,'--json'],{cwd:root,capture:true});if(out.status!==0)throw Error('D1 CLI a eșuat: '+String(out.stderr));const raw=JSON.parse(out.stdout);return Array.isArray(raw)?raw[0].results:raw.result[0].results};
const rowsFor=(keys)=>keys.length?d1(`SELECT key,data,published_at,last_success_at,last_attempt_at,expires_at,next_attempt_at,failures,lock_until,error,adapter_version FROM source_cache WHERE key IN (${keys.map(k=>"'"+k+"'").join(',')})`):[];
const existing=rowsFor(keys);
const budget=d1('SELECT key,window_start,used FROM source_budget')
console.log('articole existente din cele 8 seed:',existing.filter(r=>r.key.startsWith('article:')).length,'| budget rows:',budget.length);
await writeFile(join(sessionDir,'probes/relay-smoke-snapshot.json'),JSON.stringify({rows:existing,budget},{},1));
console.log('snapshot scris: probes/relay-smoke-snapshot.json ('+existing.length+' rânduri)');
