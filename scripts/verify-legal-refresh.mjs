import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const directory=await mkdtemp(join(tmpdir(),'aflivra-legal-job-')),script=resolve(import.meta.dirname,'refresh-legal.mjs');
try{
 for(const blocked of [true,false]){
  const fixture=join(directory,blocked?'blocked.mjs':'partial.mjs');
  await writeFile(fixture,`const today='2026-10-05',next=new Date(Date.now()+120000).toISOString();let count=0;globalThis.fetch=async(url,init)=>{if(!init.body)return Response.json({asOf:today,items:['1','2'].map(id=>({id:'https://legislatie.just.ro/Public/DetaliiDocument/'+id,title:'Law '+id})),nextCursor:null});count++;if(count===1)return Response.json({status:'unavailable',error:'One failed law',data:null,nextAttemptAt:next,portalNextAttemptAt:${blocked?'next':'null'}});return Response.json({status:'fresh',error:null,data:{items:[{id:JSON.parse(init.body).id,characters:100,consolidation:{asOf:today}}]}})};`);
  const result=spawnSync(process.execPath,['--import',fixture,script],{input:JSON.stringify({siteUrl:'https://fixture.chatgpt.site'})+'\n',encoding:'utf8',timeout:10000});assert.equal(result.status,2);const report=JSON.parse(result.stdout);
  if(blocked){assert.equal(report.checks.length,1);assert.equal(report.deferred.length,1);assert(report.nextAttemptAt)}
  else{assert.equal(report.checks.length,2);assert.equal(report.checks[1].status,'verified');assert.equal(report.deferred.length,0,'One bad document does not stop healthy documents')}
 }
 console.log('Daily legal updater verified: shared source pauses defer safely; an isolated document failure does not stop the other consolidations; no failure is counted as a verified update. Controlled fixtures only.');
}finally{await rm(directory,{recursive:true,force:true})}
