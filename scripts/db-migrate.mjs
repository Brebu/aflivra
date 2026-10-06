import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const WRANGLER_BIN='node_modules/wrangler/bin/wrangler.js';
export const MIGRATION_PATH='drizzle/0000_thin_demogoblin.sql';
export const DIST_CONFIG='dist/server/wrangler.json';
export const D1_DATABASE_NAME='aflivra';
const GUARD_SQL="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('source_cache','source_budget') ORDER BY name";
const RUNBOOK='Rulează mai întâi `corepack pnpm exec wrangler login` (o singură dată), apoi `corepack pnpm exec wrangler d1 create aflivra`. / First run wrangler login once, then wrangler d1 create aflivra.';

const wranglerEnv=()=>({...process.env,WRANGLER_SEND_METRICS:process.env.WRANGLER_SEND_METRICS||'false',WRANGLER_WRITE_LOGS:process.env.WRANGLER_WRITE_LOGS||'false'});
export const runWrangler=(args,{capture=false}={})=>spawnSync(process.execPath,[WRANGLER_BIN,...args],{stdio:capture?['inherit','pipe','pipe']:'inherit',env:wranglerEnv()});

const parseWranglerJson=(text)=>{const trimmed=String(text||'').trim();if(!trimmed)return null;try{return JSON.parse(trimmed)}catch{const start=trimmed.search(/[[{]/),end=Math.max(trimmed.lastIndexOf(']'),trimmed.lastIndexOf('}'));try{return start>=0&&end>start?JSON.parse(trimmed.slice(start,end+1)):null}catch{return null}}};

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

const migrationStatements=()=>{const statements=[];for(const sql of readFileSync(MIGRATION_PATH,'utf8').split(/^--> statement-breakpoint.*$/m).map(s=>s.trim()).filter(Boolean)){const table=(/^CREATE TABLE `([A-Za-z0-9_]+)`/.exec(sql)||[])[1];if(!table)throw new Error(`Declarație fără tabel recunoscut în ${MIGRATION_PATH}.`);statements.push({sql,table})}return statements};

const tablesFor=(baseArgs)=>{const guard=runWrangler([...baseArgs,'--command',GUARD_SQL,'--json'],{capture:true});if(guard.status!==0)throw new Error('Interogarea de gardă D1 a eșuat: '+(String(guard.stderr||'').trim().split('\n').filter(Boolean).pop()||'Exit '+(guard.status??'?')));const parsed=parseWranglerJson(guard.stdout),rows=(Array.isArray(parsed)?parsed[0]?.results:parsed?.result?.[0]?.results)||[];return new Set(rows.map(r=>r&&r.name).filter(Boolean))};

const applyTo=(baseArgs,args,label)=>{const applied=runWrangler([...baseArgs,...args,'--yes']);if(applied.status!==0)throw new Error(`Aplicarea migrației ${label} a eșuat (exit ${applied.status??'?'}).`)};

export function migrateRemote(databaseId){return migrate(['d1','execute',databaseId,'--remote'],`remote (D1 ${D1_DATABASE_NAME})`)}
export function migrateLocal(){return migrate(localExecuteArgs(),'local (.wrangler/state, id placeholder din build)')}

function migrate(baseArgs,label){
	const statements=migrationStatements(),existing=tablesFor(baseArgs),missing=statements.filter(s=>!existing.has(s.table));
	if(missing.length===0){console.log(`Migrația ${label} este deja aplicată — nimic de făcut. Tabele: ${[...existing].sort().join(', ')}.`);return {applied:0}}
	console.log(`Aplic migrația ${label}: lipsesc ${missing.map(s=>s.table).join(', ')}.`);
	if(missing.length===statements.length)applyTo(baseArgs,['--file',MIGRATION_PATH],label);
	else for(const statement of missing)applyTo(baseArgs,['--command',statement.sql],label);
	const after=tablesFor(baseArgs),stillMissing=statements.filter(s=>!after.has(s.table));
	if(stillMissing.length)throw new Error(`Migrația ${label} nu s-a aplicat complet: ${stillMissing.map(s=>s.table).join(', ')}.`);
	console.log(`Migrația ${label} aplicată: ${statements.map(s=>s.table).join(', ')}.`);
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
