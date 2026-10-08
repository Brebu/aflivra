import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {WRANGLER_BIN,MIGRATION_PATH,runWrangler,parseWranglerJson} from './db-migrate.mjs';

// The dev server boots a local D1 with an empty database: `readSource` fails with
// „no such table: source_cache" before any loader runs, so every e2e leg that pays a
// real first browse — or a gated-source honesty note — dies on the missing schema.
// This script applies the drizzle migration to the SAME local D1 the dev server
// binds (vite.config.ts d1_databases: binding DB, database_name 'site-creator-d1',
// the placeholder database_id), before the e2e suite starts.
const requiredTables=['source_cache','source_budget','watch_items','watch_events','push_subs'];
const PLACEHOLDER_DATABASE_ID='00000000-0000-4000-8000-000000000000';
const sql=await readFile(resolve(import.meta.dirname,'..',MIGRATION_PATH),'utf8');
const statements=sql.split(/^--> statement-breakpoint.*$/m).map(s=>s.trim()).filter(Boolean);
const tables=statements.map(s=>(/^CREATE TABLE `([A-Za-z0-9_]+)`/.exec(s)||[])[1]).filter(Boolean);
for(const table of requiredTables)if(!tables.includes(table))throw new Error(`Migrația nu declara tabela ${table}.`);
if(statements.length!==tables.length)throw new Error('Declarație fără tabel recunoscut în migrație.');

const temp=await mkdtemp(join(tmpdir(),'aflivra-dev-schema-'));
try{
  const config={name:'aflivra-dev-schema',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:PLACEHOLDER_DATABASE_ID}]};
  await writeFile(join(temp,'wrangler.json'),JSON.stringify(config,null,2));
  for(const statement of statements){
    const applied=runWrangler(['d1','execute','site-creator-d1','--config',join(temp,'wrangler.json'),'--local','--persist-to','.wrangler/state','--command',statement],{capture:true});
    const out=(applied.stdout||'')+(applied.stderr||'');
    if(applied.status!==0)throw new Error(`Aplicarea declarației a eșuat: ${parseWranglerJson(out)?.error?.text||out.slice(0,400)}`);
  }
  const guard=runWrangler(['d1','execute','site-creator-d1','--config',join(temp,'wrangler.json'),'--local','--persist-to','.wrangler/state','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+requiredTables.map(t=>`'${t}'`).join(',')+") ORDER BY name --json"],{capture:true});
  const found=parseWranglerJson((guard.stdout||'')+(guard.stderr||''))?.[0]?.results?.map(r=>r.name)||[];
  if(found.length!==requiredTables.length)throw new Error(`Tabelele așteptate nu există în D1 local: găsite ${found.join(',')||'niciuna'}`);
  console.log('Schema D1 locală aplicată: '+found.join(', '));
}finally{await rm(temp,{recursive:true,force:true})}

// Keep the binary referenced so a missing wrangler install fails loudly here, not mid-suite.
void WRANGLER_BIN;void spawnSync;void pathToFileURL;
