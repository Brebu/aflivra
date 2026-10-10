import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const WRANGLER_BIN='node_modules/wrangler/bin/wrangler.js';
export const MIGRATION_PATH='drizzle/0000_thin_demogoblin.sql';
export const MIGRATION_FILES=()=>readdirSync('drizzle').filter(file=>/\.sql$/.test(file)).sort();
export const DIST_CONFIG='dist/server/wrangler.json';
export const D1_DATABASE_NAME='aflivra';
// Garda listează exact tabelele din fișierul de migrație: o declarație nou adăugată la un
// fișier deja aplicat parțial trebuie văzută și de verificarea de după aplicare, nu doar de cea dinainte.
const guardSql=(tables)=>`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${tables.map(table=>`'${table}'`).join(',')}) ORDER BY name`;
const RUNBOOK='Rulează mai întâi `corepack pnpm exec wrangler login` (o singură dată), apoi `corepack pnpm exec wrangler d1 create aflivra`. / First run wrangler login once, then wrangler d1 create aflivra.';

const wranglerEnv=()=>({...process.env,WRANGLER_SEND_METRICS:process.env.WRANGLER_SEND_METRICS||'false',WRANGLER_WRITE_LOGS:process.env.WRANGLER_WRITE_LOGS||'false'});
export const runWrangler=(args,{capture=false}={})=>spawnSync(process.execPath,[WRANGLER_BIN,...args],{stdio:capture?['inherit','pipe','pipe']:'inherit',env:wranglerEnv()});

export const parseWranglerJson=(text)=>{const trimmed=String(text||'').trim();if(!trimmed)return null;try{return JSON.parse(trimmed)}catch{const start=trimmed.search(/[[{]/),end=Math.max(trimmed.lastIndexOf(']'),trimmed.lastIndexOf('}'));try{return start>=0&&end>start?JSON.parse(trimmed.slice(start,end+1)):null}catch{return null}}};

export const localExecuteArgs=()=>{if(!existsSync(DIST_CONFIG))throw new Error(`Lipsește ${DIST_CONFIG} — rulează \`corepack pnpm build\` întâi. / Build output missing, run corepack pnpm build first.`);return ['d1','execute','DB','--config',DIST_CONFIG,'--local','--persist-to','.wrangler/state']};

export function resolveDatabaseId(explicit){
	if(explicit)return {id:explicit,source:'flag'};
	if(process.env.AFLIVRA_D1_DATABASE_ID)return {id:process.env.AFLIVRA_D1_DATABASE_ID,source:'env'};
	const list=runWrangler(['d1','list','--json'],{capture:true});
	if(list.status!==0)return {id:null,reason:'wrangler d1 list a eșuat (probabil fără autentificare). '+RUNBOOK,detail:String(list.stderr||'').trim().split('\n').filter(Boolean).pop()||''};
	const parsed=parseWranglerJson(list.stdout),databases=Array.isArray(parsed)?parsed:Array.isArray(parsed?.result)?parsed.result:[],match=databases.find(d=>d&&d.name===D1_DATABASE_NAME);
	if(match)return {id:match.uuid||match.id,source:'d1-list'};
	return {id:null,reason:`Nicio bază D1 numită „${D1_DATABASE_NAME}" în cont. ${RUNBOOK}`,detail:databases.map(d=>d?.name).filter(Boolean).join(', ')||'(cont fără baze D1)'};
}

const stripComments=(sql)=>sql.replace(/^--[^\n]*\n?/gm,'').trim();
const migrationStatements=()=>{const statements=[];for(const file of MIGRATION_FILES())for(const chunk of readFileSync(join('drizzle',file),'utf8').split(/^--> statement-breakpoint.*$/m).map(s=>s.trim()).filter(Boolean)){const sql=stripComments(chunk);const create=/^CREATE TABLE `([A-Za-z0-9_]+)`/.exec(sql);if(create){statements.push({sql,file,table:create[1]});continue}const alter=/^ALTER TABLE `([A-Za-z0-9_]+)` ADD (?:COLUMN )?`([A-Za-z0-9_]+)`/.exec(sql);if(alter){statements.push({sql,file,table:alter[1],column:alter[2]});continue}throw new Error(`Declarație fără tabel recunoscut în ${file}.`)}return statements};

const tablesFor=(baseArgs,tables)=>{const guard=runWrangler([...baseArgs,'--command',guardSql(tables),'--json'],{capture:true});if(guard.status!==0)throw new Error('Interogarea de gardă D1 a eșuat: '+(String(guard.stderr||'').trim().split('\n').filter(Boolean).pop()||'Exit '+(guard.status??'?')));const parsed=parseWranglerJson(guard.stdout),rows=(Array.isArray(parsed)?parsed[0]?.results:parsed?.result?.[0]?.results)||[];return new Set(rows.map(r=>r&&r.name).filter(Boolean))};
const columnsCache=new Map();
const columnsFor=(baseArgs,table)=>{if(columnsCache.has(table))return columnsCache.get(table);const guard=runWrangler([...baseArgs,'--command',`PRAGMA table_info(${table})`,'--json'],{capture:true});if(guard.status!==0)throw new Error('Interogarea de gardă a coloanelor D1 a eșuat: '+(String(guard.stderr||'').trim().split('\n').filter(Boolean).pop()||'Exit '+(guard.status??'?')));const parsed=parseWranglerJson(guard.stdout),rows=(Array.isArray(parsed)?parsed[0]?.results:parsed?.result?.[0]?.results)||[],columns=new Set(rows.map(r=>r&&r.name).filter(Boolean));columnsCache.set(table,columns);return columns};

const applyTo=(baseArgs,args,label)=>{const applied=runWrangler([...baseArgs,...args,'--yes']);if(applied.status!==0)throw new Error(`Aplicarea migrației ${label} a eșuat (exit ${applied.status??'?'}).`)};

export function migrateRemote(databaseId){return migrate(['d1','execute',D1_DATABASE_NAME,'--remote'],`remote (D1 ${D1_DATABASE_NAME}${databaseId?' '+databaseId:''})`)}
export function migrateLocal(){return migrate(localExecuteArgs(),'local (.wrangler/state, id placeholder din build)')}

function migrate(baseArgs,label){
	const statements=migrationStatements(),tables=[...new Set(statements.map(statement=>statement.table))],existing=tablesFor(baseArgs,tables);
	// CREATE-urile lipsă și ALTER-urile cu coloană lipsă se aplică fiecare cu
	// garda ei: o bază veche primește ALTER-ul, o bază nouă îl sărește deja
	// acoperit de CREATE — migrația rămâne idempotentă pe ambele.
	const missing=statements.filter(statement=>statement.column?existing.has(statement.table)&&!columnsFor(baseArgs,statement.table).has(statement.column):!existing.has(statement.table));
	if(missing.length===0){console.log(`Migrația ${label} este deja aplicată — nimic de făcut. Tabele: ${[...existing].sort().join(', ')}.`);return {applied:0}}
	console.log(`Aplic migrația ${label}: lipsesc ${missing.map(statement=>statement.table+(statement.column?'.'+statement.column:'')).join(', ')}.`);
	for(const statement of missing)applyTo(baseArgs,['--command',statement.sql],label);
	for(const table of new Set(missing.filter(statement=>statement.column).map(statement=>statement.table)))columnsCache.delete(table);
	const afterTables=tablesFor(baseArgs,tables),stillMissing=statements.filter(statement=>statement.column?!columnsFor(baseArgs,statement.table).has(statement.column):!afterTables.has(statement.table));
	if(stillMissing.length)throw new Error(`Migrația ${label} nu s-a aplicat complet: ${stillMissing.map(statement=>statement.table+(statement.column?'.'+statement.column:'')).join(', ')}.`);
	console.log(`Migrația ${label} aplicată: ${statements.map(statement=>statement.table+(statement.column?'.'+statement.column:'')).join(', ')}.`);
	return {applied:missing.length};
}

const usage='Folosire: node scripts/db-migrate.mjs [--local | --remote] [--database-id <uuid>]';

async function main(){
	const argv=process.argv.slice(2),modes=argv.filter(a=>a==='--local'||a==='--remote'),explicit=argv.includes('--database-id')?argv[argv.indexOf('--database-id')+1]:null;
	if(modes.length>1||argv.some(a=>a.startsWith('-')&&!['--local','--remote','--database-id'].includes(a))){console.error(usage);process.exit(2)}
	const mode=modes[0]||'--local';
	if(mode==='--local'){migrateLocal();return}
	const resolved=resolveDatabaseId(explicit);
	if(!resolved.id){console.error(`Nu am putut rezolva id-ul bazei D1 „${D1_DATABASE_NAME}". ${resolved.reason}${resolved.detail?' Detaliu: '+resolved.detail:''}`);process.exit(1)}
	console.log(`Baza D1 rezolvată din ${resolved.source}: ${resolved.id}.`);
	migrateRemote(resolved.id);
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){try{await main()}catch(error){console.error(String(error?.message||error));process.exit(1)}}
