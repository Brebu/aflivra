import {fetchWithServerRetry} from '../lib/http-retry.mjs';
// Revalidate registered laws through the app without an open browser. Pass the
// exact published Site URL and its optional service token only through stdin.
import {createInterface} from 'node:readline/promises';
import {stdin} from 'node:process';

const reader=createInterface({input:stdin,terminal:false}),line=await reader.question('');reader.close();
const input=JSON.parse(line),site=new URL(input.siteUrl);
if(site.protocol!=='https:'||site.username||site.password||!site.hostname.endsWith('.chatgpt.site')||site.pathname!=='/'||site.search||site.hash)throw Error('Use the exact published Site origin.');
const headers={'Content-Type':'application/json',...(input.serviceToken?{'OAI-Sites-Authorization':'Bearer '+input.serviceToken}:{})},report={asOf:null,checkedAt:new Date().toISOString(),checks:[],deferred:[],nextAttemptAt:null};
async function call(path,body){const response=await fetchWithServerRetry(new URL(path,site),{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(40000)},{retryPost:true,deadlineAt:Date.now()+40000});if(!response.ok)throw Error('Site HTTP '+response.status);return response.json()}
let cursor='',halt=false;
do{
 const registry=await call('/api/legal'+(cursor?'?cursor='+cursor:''));report.asOf=registry.asOf;
 for(const act of registry.items){
  if(halt){report.deferred.push(act.id);continue}
  try{
   const source=await call('/api/legal',{kind:'law',title:act.title.slice(0,160),full:true,id:act.id,exactTitle:act.title,selectedType:act.type,selectedNumber:act.number,selectedDate:act.date,summary:true}),copy=source.data?.items?.[0],current=copy?.consolidation?.asOf===registry.asOf&&['fresh','cached'].includes(source.status)&&!source.error;
   report.checks.push({id:act.id,status:current?'verified':copy?'retained':'unavailable',consolidation:copy?.consolidation||null,characters:copy?.characters||0,lastSuccessAt:source.lastSuccessAt,lastAttemptAt:source.lastAttemptAt,nextAttemptAt:source.nextAttemptAt,error:source.error});
   if(!current&&(source.portalNextAttemptAt&&Date.parse(source.portalNextAttemptAt)>Date.now()||/Limita temporară/.test(source.error||''))){halt=true;report.nextAttemptAt=source.portalNextAttemptAt||source.nextAttemptAt}
  }catch(error){report.checks.push({id:act.id,status:'unavailable',error:error.message});halt=true}
 }
 cursor=registry.nextCursor||'';
}while(cursor);
console.log(JSON.stringify(report));
if(report.deferred.length||report.checks.some(check=>check.status!=='verified'))process.exitCode=2;
