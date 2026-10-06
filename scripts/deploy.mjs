import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolveDatabaseId,migrateRemote,runWrangler} from './db-migrate.mjs';

const GROUPS_PATH='lib/live/refresh-groups.json',DIST_CONFIG='dist/server/wrangler.json',DEPLOY_COPY='dist/server/wrangler.deploy.json',WORKER_NAME='aflivra',PLACEHOLDER_ID='00000000-0000-4000-8000-000000000000';
const EXPECTED={name:'site-creator-vinext-starter',main:'index.js',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],triggers:{},assets:{binding:'ASSETS',directory:'../client'},no_bundle:true};

const assertBuildConfig=(config)=>{const failures=[],eq=(label,actual,expected)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))failures.push(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`)};for(const key of Object.keys(EXPECTED))eq(key,config[key],EXPECTED[key]);const d1=config.d1_databases;if(!Array.isArray(d1)||d1.length!==1)failures.push(`d1_databases: expected exactly 1 binding, found ${JSON.stringify(d1)}`);else{eq('d1_databases[].binding',d1[0].binding,'DB');eq('d1_databases[].database_name',d1[0].database_name,'site-creator-d1');eq('d1_databases[].database_id',d1[0].database_id,PLACEHOLDER_ID)}return failures};

const loadGroups=()=>{let text;try{text=readFileSync(GROUPS_PATH,'utf8')}catch(error){if(error.code==='ENOENT')return {missing:true};throw error}let raw;try{raw=JSON.parse(text)}catch(error){throw new Error(`${GROUPS_PATH}: JSON invalid — ${error.message}`)}const source=Array.isArray(raw?.groups)?raw.groups.map(g=>({name:g.name,cron:g.cron})):raw?.groups&&typeof raw.groups==='object'?Object.entries(raw.groups).map(([name,g])=>({name,cron:g?.cron})):null;if(!source)throw new Error(`${GROUPS_PATH}: contract „groups" (name + cron per grup) lipsă sau invalid.`);for(const group of source)if(typeof group.cron!=='string'||!group.cron.trim())throw new Error(`${GROUPS_PATH}: grupul „${group.name}" nu are expresie cron validă.`);if(source.length>5)throw new Error(`${GROUPS_PATH}: planul gratuit Cloudflare permite maximum 5 crons — găsite ${source.length}.`);const seen=new Map();for(const group of source){if(seen.has(group.cron))throw new Error(`${GROUPS_PATH}: cronul „${group.cron}" apare și la „${seen.get(group.cron)}" și la „${group.name}" — un cron = un singur grup.`);seen.set(group.cron,group.name)}return {missing:false,groups:source}};

const printPlan=(config,crons,databaseId,databaseIdSource)=>{const lines=['Pachet de aplicare (deploy patch plan):',`  name:            ${JSON.stringify(config.name)} → ${JSON.stringify(WORKER_NAME)}`,`  database_name:   ${JSON.stringify(config.d1_databases[0].database_name)} → ${JSON.stringify(WORKER_NAME)}`,databaseId?`  database_id:     ${JSON.stringify(config.d1_databases[0].database_id)} → ${JSON.stringify(databaseId)} (rezolvat din ${databaseIdSource})`:`  database_id:     ⚠️ PLACEHOLDER ${JSON.stringify(config.d1_databases[0].database_id)} — NEREZOLVAT (necesită wrangler login + d1 create aflivra)`,crons.missing?`  triggers.crons:  ⚠️ LIPSĂ — ${GROUPS_PATH} nu există (un deploy fără lista completă ar șterge toate crons)`:crons.groups.length?`  triggers.crons:  ${JSON.stringify(config.triggers)} → ${JSON.stringify(crons.groups.map(g=>g.cron))} (${crons.groups.map(g=>`${g.name} ${g.cron}`).join('; ')})`:`  triggers.crons:  ⚠️ Gol — ${GROUPS_PATH} există dar nu are niciun grup`,`  neschimbate:     main ${JSON.stringify(config.main)}, compatibility_date ${JSON.stringify(config.compatibility_date)}, compatibility_flags ${JSON.stringify(config.compatibility_flags)},`,`                   assets ${JSON.stringify(config.assets)}, no_bundle ${JSON.stringify(config.no_bundle)} — copia: ${DEPLOY_COPY} (același director, căile relative rămân valide)`];console.log(lines.join('\n'))};

function main(){
	const argv=process.argv.slice(2),dryRun=argv.includes('--dry-run'),explicit=argv.includes('--database-id')?argv[argv.indexOf('--database-id')+1]:null;
	if(argv.some(a=>a.startsWith('-')&&!['--dry-run','--database-id'].includes(a))){console.error('Folosire: node scripts/deploy.mjs [--dry-run] [--database-id <uuid>] (sau env AFLIVRA_D1_DATABASE_ID)');process.exit(2)}
	if(!existsSync(DIST_CONFIG)){console.error(`Lipsește ${DIST_CONFIG} — rulează \`corepack pnpm build\` întâi. / Build output missing, run corepack pnpm build first.`);process.exit(1)}
	const config=JSON.parse(readFileSync(DIST_CONFIG,'utf8')),failures=assertBuildConfig(config);
	if(failures.length){console.error(`Forma output-ului de build s-a schimbat — deploy blocat (niciodată placeholder silențios):\n  ${failures.join('\n  ')}`);process.exit(1)}
	const crons=loadGroups(),resolved=resolveDatabaseId(explicit);
	if(!dryRun){
		if(!resolved.id){console.error(`Deploy oprit: id-ul bazei D1 „aflivra" nerezolvat — nu deployim placeholder. ${resolved.reason}${resolved.detail?' Detaliu: '+resolved.detail:''}`);process.exit(1)}
		if(crons.missing){console.error(`${GROUPS_PATH} lipsește — un deploy înlocuiește TOATE crons, deci fără lista completă s-ar dezarma toate grupurile. Creează fișierul (contract: groups cu name+cron) și rulează din nou.`);process.exit(1)}
		if(!crons.groups.length){console.error(`${GROUPS_PATH} nu are niciun grup — un deploy ar dezarma toate crons. Populează groups și rulează din nou.`);process.exit(1)}
	}
	printPlan(config,crons,resolved.id,resolved.source);
	const copy={...config,name:WORKER_NAME,d1_databases:[{...config.d1_databases[0],database_name:WORKER_NAME,database_id:resolved.id||config.d1_databases[0].database_id}],triggers:crons.missing?config.triggers:{crons:crons.groups.map(g=>g.cron)}};
	writeFileSync(DEPLOY_COPY,JSON.stringify(copy));
	console.log(`Configurația patch-uită scrisă: ${DEPLOY_COPY}${resolved.id?'':' (database_id rămâne PLACEHOLDER — exclusiv pentru dry-run)'}.`);
	if(crons.missing){console.log('Dry-run fără validare wrangler: lista cron lipsește (vezi planul de mai sus — run fără --dry-run ar fi blocat).');process.exit(0)}
	if(dryRun){const validated=runWrangler(['deploy','--dry-run','--config',DEPLOY_COPY]);console.log(`wrangler deploy --dry-run exit ${(validated.status??'?')}.`);process.exit(validated.status??1)}
	migrateRemote(resolved.id);
	const deployed=runWrangler(['deploy','--config',DEPLOY_COPY]);
	if(deployed.status!==0)process.exit(deployed.status??1);
	console.log(`✅ Publicat. URL: https://${WORKER_NAME}.<subdomeniul-tău>.workers.dev (vezi output-ul wrangler de mai sus).\nPași următori (o singură dată): corepack pnpm exec wrangler secret put REFRESH_TOKEN --name ${WORKER_NAME} (valoare aleatorie reală).\nCron activate: ${crons.groups.map(g=>`${g.name} ${g.cron}`).join('; ')} (UTC).`);
}

try{main()}catch(error){console.error(String(error?.message||error));process.exit(1)}
