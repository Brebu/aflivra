import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {WRANGLER_BIN,MIGRATION_FILES,runWrangler,parseWranglerJson} from './db-migrate.mjs';

// The dev server boots a local D1 with an empty database: `readSource` fails with
// „no such table: source_cache" before any loader runs, so every e2e leg that pays a
// real first browse — or a gated-source honesty note — dies on the missing schema.
// This script applies the drizzle migration to the SAME local D1 the dev server
// binds (vite.config.ts d1_databases: binding DB, database_name 'site-creator-d1',
// the placeholder database_id), before the e2e suite starts.
const requiredTables=['source_cache','source_budget','watch_items','watch_events','push_subs'];
const PLACEHOLDER_DATABASE_ID='00000000-0000-4000-8000-000000000000';
const files=MIGRATION_FILES();
const stripComments=(sql)=>sql.replace(/^--[^\n]*\n?/gm,'').trim();
const statements=[];for(const file of files)for(const chunk of (await readFile(resolve(import.meta.dirname,'..','drizzle',file),'utf8')).split(/^--> statement-breakpoint.*$/m).map(s=>s.trim()).filter(Boolean)){const sql=stripComments(chunk);const create=/^CREATE TABLE `([A-Za-z0-9_]+)`/.exec(sql),alter=/^ALTER TABLE `([A-Za-z0-9_]+)` ADD (?:COLUMN )?`([A-Za-z0-9_]+)`/.exec(sql);statements.push({sql,file,table:(create||alter)?.[1],column:alter?alter[2]:null})}
const tables=[...new Set(statements.map(s=>s.table))];
for(const table of requiredTables)if(!tables.includes(table))throw new Error(`Migrația nu declara tabela ${table}.`);
if(statements.some(statement=>!statement.table))throw new Error('Declarație fără tabel recunoscut în migrație.');

const temp=await mkdtemp(join(tmpdir(),'aflivra-dev-schema-'));
try{
  const config={name:'aflivra-dev-schema',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:PLACEHOLDER_DATABASE_ID}]};
  await writeFile(join(temp,'wrangler.json'),JSON.stringify(config,null,2));
  const present=runWrangler(['d1','execute','site-creator-d1','--config',join(temp,'wrangler.json'),'--local','--persist-to','.wrangler/state','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+requiredTables.map(t=>`'${t}'`).join(',')+") ORDER BY name --json"],{capture:true});
  const foundSoFar=parseWranglerJson((present.stdout||'')+(present.stderr||''))?.[0]?.results?.map(r=>r.name)||[];
  if(foundSoFar.length===requiredTables.length){
    // Starea locală persistă între rulările locale (CI-ul are stat rece); schema deja
    // aplicată se reutilizează — CREATE-urile din migrație nu sunt idempotente.
    // Starea poate fi anterioară unei migrații de coloană (ALTER): tabelele
    // există, dar coloana nouă nu — ALTER-ul se aplică și aici, idempotent.
    const alterStatements=statements.filter(statement=>statement.column);
    if(alterStatements.length){
      const columns=parseWranglerJson((runWrangler(['d1','execute','site-creator-d1','--config',join(temp,'wrangler.json'),'--local','--persist-to','.wrangler/state','--command','PRAGMA table_info(source_cache) --json'],{capture:true}).stdout||''))?.[0]?.results?.map(r=>r.name)||[];
      const missing=alterStatements.filter(statement=>!columns.includes(statement.column));
      if(missing.length)console.log('Aplic ALTER-urile de coloană lipsă pe starea existentă: '+missing.map(statement=>statement.column).join(', '));
      for(const statement of missing){
        const applied=runWrangler(['d1','execute','site-creator-d1','--config',join(temp,'wrangler.json'),'--local','--persist-to','.wrangler/state','--command',statement.sql],{capture:true});
        if(applied.status!==0)throw new Error('Aplicarea ALTER-ului a eșuat: '+((applied.stderr||'').trim().split('\n').pop()||''));
      }
    }
    console.log('Schema D1 locală era deja aplicată: '+foundSoFar.join(', '));
  }else{
  for(const statement of statements){
    const applied=runWrangler(['d1','execute','site-creator-d1','--config',join(temp,'wrangler.json'),'--local','--persist-to','.wrangler/state','--command',statement.sql],{capture:true});
    const out=(applied.stdout||'')+(applied.stderr||'');
    // ALTER-ul de coloană e idempotent: pe o stare locală care deja o are
    // (rulare repetată fără stat rece), „duplicate column" e succes onest.
    if(applied.status!==0&&!(statement.column&&/duplicate column/i.test(out)))throw new Error(`Aplicarea declarației a eșuat: ${parseWranglerJson(out)?.error?.text||out.slice(0,400)}`);
  }
  const guard=runWrangler(['d1','execute','site-creator-d1','--config',join(temp,'wrangler.json'),'--local','--persist-to','.wrangler/state','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+requiredTables.map(t=>`'${t}'`).join(',')+") ORDER BY name --json"],{capture:true});
  const found=parseWranglerJson((guard.stdout||'')+(guard.stderr||''))?.[0]?.results?.map(r=>r.name)||[];
  if(found.length!==requiredTables.length)throw new Error(`Tabelele așteptate nu există în D1 local: găsite ${found.join(',')||'niciuna'}`);
  console.log('Schema D1 locală aplicată: '+found.join(', '));
  }
}finally{await rm(temp,{recursive:true,force:true})}

// Keep the binary referenced so a missing wrangler install fails loudly here, not mid-suite.
void WRANGLER_BIN;void spawnSync;void pathToFileURL;
