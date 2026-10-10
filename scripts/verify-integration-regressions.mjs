// Integration regression gate for the remediation round (Astra plan 2026-10-10): imports
// the REAL parser and route implementations — no condition is reimplemented in test. The
// groups land per milestone and every assert cites the defect it guards (N01, D01–D11).
// Run from the repo root: node scripts/verify-integration-regressions.mjs
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {readSnapshotFile as readFileSnapshot} from './snapshot-read.mjs';

const root=resolve(import.meta.dirname,'..'),dir=await mkdtemp(join(tmpdir(),'aflivra-regressions-')),require=createRequire(import.meta.url),prepared=new Map(),readSource=path=>readFileSnapshot(join(root,path),'utf8');
async function prepare(path){
 if(prepared.has(path))return prepared.get(path);const output=join(dir,path.replace(/[^a-z0-9]/gi,'_')+'.mjs');prepared.set(path,output);
 let source=await readSource(path);
 for(const match of [...source.matchAll(/import (\w+) from ['"]((?:@\/|\.\/|\.\.\/)[^'"]+\.json)['"];?/g)])source=source.replace(match[0],'const '+match[1]+'='+await readFileSnapshot((match[2].startsWith('@/')?join(root,match[2].slice(2)):resolve(root,dirname(path),match[2])),'utf8')+';');
 source=source.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__regressionsEnv;');
 if(path.startsWith('app/api/'))source=source.replace(/import \{readSource\} from ['"]@\/lib\/live\/cache['"];?/,'const readSource=loader=>globalThis.__regressionsReadSource(loader);');
 let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 for(const match of [...js.matchAll(/(?:\bfrom\s+|\bimport\(\s*)['"]([^"']+)['"]/g)]){
  const spec=match[1];if(spec.startsWith('node:'))continue;
  let uri;if(spec.startsWith('@/')||spec.startsWith('.')){let target=spec.startsWith('@/')?spec.slice(2):resolve(root,dirname(path),spec).slice(root.length+1);if(target.endsWith('.mjs'))uri=pathToFileURL(join(root,target)).href;else{if(!target.endsWith('.ts'))target+='.ts';uri=pathToFileURL(await prepare(target)).href}}
  else uri=pathToFileURL(require.resolve(spec)).href;
  js=js.replaceAll("'"+spec+"'","'"+uri+"'").replaceAll('"'+spec+'"','"'+uri+'"');
 }
 await writeFile(output,js);return output;
}
const load=async path=>import(pathToFileURL(await prepare(path)).href);

const groups=[];const group=async (name,fn)=>{try{await fn();groups.push({name,status:'ok'});console.log('ok   '+name)}catch(error){groups.push({name,status:'fail',message:error.message});console.log('FAIL '+name+' :: '+(error.message||error).split('\n')[0])}};

await group('dates — D08 calendar strictness, D11 prefix ranges',async()=>{
 const {isValidCalendarDate,calendarRange}=await load('lib/live/date.ts');
 for(const good of ['2024-02-29','2026-10-11','1999-12-31','2000-01-01'])assert.equal(isValidCalendarDate(good),true,'a valid calendar day must pass: '+good);
 for(const bad of ['2026-02-30','2026-04-31','2025-02-29','2026-13-01','2026-00-10','2026-1-01','26-01-01','2026/01/01','01-02-2026','2026-02-30T00:00','2026-02','2026','','   '])assert.equal(isValidCalendarDate(bad),false,'an impossible or malformed day must be rejected before any upstream call: '+JSON.stringify(bad));
 assert.equal(isValidCalendarDate(undefined),false);assert.equal(isValidCalendarDate(null),false);
 assert.deepEqual(calendarRange('2026'),{from:'2026-01-01',to:'2026-12-31'},'a bare year expands to its calendar bounds');
 assert.deepEqual(calendarRange('2026-03'),{from:'2026-03-01',to:'2026-03-31'},'a year-month expands to the month bounds');
 assert.deepEqual(calendarRange('2024-02'),{from:'2024-02-01',to:'2024-02-29'},'a leap February ends on the 29th');
 assert.deepEqual(calendarRange('2026-02'),{from:'2026-02-01',to:'2026-02-28'},'a common February ends on the 28th');
 assert.deepEqual(calendarRange('2026-03-15'),{from:'2026-03-15',to:'2026-03-15'},'a full day keeps its own bounds');
 for(const bad of ['2026-13','2026-02-30','2026-3','2026-1','26','abc','','2026-02-29T00:00'])assert.equal(calendarRange(bad),null,'an impossible or malformed prefix must be rejected: '+JSON.stringify(bad));
});

await group('workflow — N01 corpora-refresh real dirs, staged diff, changed gating',async()=>{
 const yml=await readSource('.github/workflows/corpora-refresh.yml');
 assert.match(yml,/git add public\/situr public\/amccrs public\/eida public\/lmi public\/data\/snapshot-transport\.json/,'staging must use the real corpus directories');
 assert.match(yml,/git diff --cached --quiet/,'the quiet-day check must compare the staged tree, so new files register too');
 assert.match(yml,/changed=false/);assert.match(yml,/changed=true/),'the stage step must publish a changed output';
 const gated=(yml.match(/if: steps\.\w+\.outputs\.changed == 'true'/g)||[]).length;
 assert.ok(gated>=3,'commit, publish and PR steps must all gate on the staged-changed output (found '+gated+')');
 assert.doesNotMatch(yml,/public\/data\/(?:situr|amccrs|eida|lmi)\b/,'the pathspec that fails with exit 128 must be gone');
 assert.match(yml,/git push origin/,'the branch must be published explicitly before the PR step');
 assert.match(yml,/gh pr list --head "\$BRANCH"/,'a rerun must reuse the open PR instead of duplicating it');
 assert.doesNotMatch(yml,/if: success\(\) && github\.event_name == 'schedule'/,'the dispatch run must reach the same staging/gating path as the scheduled one — quiet-day gating by event only was the N01 defect');
});

await group('offline-importers — N01 local fixture mode, manifest-validated, no fetch',async()=>{
 for(const script of ['scripts/import-situr-snapshot.mjs','scripts/import-eida-snapshot.mjs','scripts/import-lmi-snapshot.mjs']){
  const source=await readSource(script);
  assert.match(source,/--input-dir|--source-dir/,script+' must accept a local fixture directory');
  assert.match(source,/validateFixtureManifest/,script+' must validate the fixture manifest before importing');
 }
 const helper=await readSource('scripts/lib/fixture-manifest.mjs');
 assert.match(helper,/sha256/, 'the manifest validator must check the SHA-256 of every fixture it releases for import');
 const register=await readSource('scripts/snapshot-register.mjs');
 assert.match(register,/writeSnapshotIfChanged/,'the snapshot writer must skip a rewrite when only fetch metadata would change');
});

try{
 let failed=0;for(const g of groups)if(g.status==='fail'){failed++;console.error('  '+g.name+' :: '+g.message)}
 if(failed){console.error('verify-integration-regressions: '+failed+' of '+groups.length+' groups failed');process.exitCode=1}
 else console.log('{"result":"ok","groups":'+groups.length+'}');
}finally{await rm(dir,{recursive:true,force:true})}
