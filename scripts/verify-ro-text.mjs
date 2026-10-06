import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-ro-text-'));
try{
const source=await readFile(join(root,'lib/live/query.ts'),'utf8');
await writeFile(join(temp,'query.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
const {countText,countNoun}=await import(pathToFileURL(join(temp,'query.mjs')));
const cases=[[1,'1 rezultat'],[2,'2 rezultate'],[0,'0 rezultate'],[11,'11 rezultate'],[19,'19 rezultate'],[20,'20 de rezultate'],[21,'21 rezultat'],[34,'34 de rezultate'],[100,'100 de rezultate'],[101,'101 rezultat'],[111,'111 rezultate'],[119,'119 rezultate'],[120,'120 de rezultate'],[1000,'1.000 de rezultate'],[2001,'2.001 rezultat'],[8655,'8.655 de rezultate'],[178868,'178.868 de rezultate']];
for(const [n,expected] of cases)assert.equal(countText(n,'rezultat','rezultate'),expected,n+' must read "'+expected+'"');
assert.equal(countText(1,'ședință publicată','ședințe publicate'),'1 ședință publicată');
assert.equal(countText(2,'ședință publicată','ședințe publicate'),'2 ședințe publicate');
assert.equal(countText(34,'ședință publicată','ședințe publicate'),'34 de ședințe publicate');
assert.equal(countText(1,'cursă a variantei circulă','curse ale variantei circulă'),'1 cursă a variantei circulă');
assert.equal(countText(1,'sursă are copii vechi','surse au copii vechi'),'1 sursă are copii vechi');
assert.equal(countNoun(1,'rezultat','rezultate'),'rezultat');
assert.equal(countNoun(0,'rezultat','rezultate'),'rezultate');
assert.equal(countNoun(2,'rezultat','rezultate'),'rezultate');
assert.equal(countNoun(11,'rezultat','rezultate'),'rezultate');
assert.equal(countNoun(101,'rezultat','rezultate'),'rezultat');
assert.equal(countNoun(21,'rezultat','rezultate'),'rezultat');
assert.equal(countNoun(20,'rezultat','rezultate'),'de rezultate');
assert.equal(countNoun(100,'rezultat','rezultate'),'de rezultate');
assert.equal(countNoun(178868,'rezultat','rezultate'),'de rezultate');
console.log('Romanian count agreement verified: counts ending in 1 (1, 21, 101) take the singular; 0 and 2-19 the plain plural; the rest (20-99 and exact hundreds such as 100 or 1.000) take "de" + plural, with full-phrase agreement for adjectives and verbs and ro-RO thousands separators.');
}finally{await rm(temp,{recursive:true,force:true})}
