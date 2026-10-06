import {readFile,writeFile,mkdtemp,rm,rename,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {fetchWithServerRetry} from '../lib/http-retry.mjs';

// The hosted adapter can reuse a complete, checksum-validated D1 record when
// the checkout cannot reach the official origin. Never accept SOAP base text.
async function siteInput(){
 if(process.argv.slice(2).join(' ')!=='--site-api')throw Error('Use --site-api with the exact published Site URL on stdin.');
 const line=await new Promise((resolve,reject)=>{let value='';const tty=process.stdin.isTTY;const finish=error=>{process.stdin.off('data',data);if(tty)process.stdin.setRawMode(false);process.stdin.pause();error?reject(error):resolve(value)};const data=chunk=>{value+=chunk;if(value.includes('\u0003'))finish(Error('Import cancelled'));else if(value.length>16384)finish(Error('Invalid Site input'));else if(/[\r\n]/.test(value))finish()};if(tty){process.stdin.setRawMode(true);process.stderr.write('Ready for published Site JSON on stdin (input is hidden).\n')}process.stdin.setEncoding('utf8');process.stdin.on('data',data);process.stdin.once('end',()=>finish());process.stdin.resume()});
 const input=JSON.parse(line),site=new URL(input.siteUrl);
 if(site.protocol!=='https:'||site.username||site.password||!site.hostname.endsWith('.chatgpt.site')||site.pathname!=='/'||site.search||site.hash)throw Error('Use the exact published Site origin.');
 return {site,headers:{'Content-Type':'application/json',...(input.serviceToken?{'OAI-Sites-Authorization':'Bearer '+input.serviceToken}:{})}};
}

// A failed import leaves the previous text, checksum and verification date intact.
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-current-laws-'));
try{
 for(const name of ['legal-consolidation','legal-portal','adapters','records','catalog-categories','text']){
  const source=(await readFile(join(root,'lib/live',name+'.ts'),'utf8')).replace("import {env} from 'cloudflare:workers';",'const env={};');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace(/from '(\.\/[^']+)'/g,(_,path)=>"from '"+path+".mjs'");
  await writeFile(join(temp,name+'.mjs'),code);
 }
 const {consolidateLaw,verifiedConsolidation,legalToday}=await import(pathToFileURL(join(temp,'legal-consolidation.mjs'))),{portalPage}=await import(pathToFileURL(join(temp,'legal-portal.mjs'))),out=join(root,'public/legal-snapshots'),manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8')),items=[...manifest.items],checks=[];
 const hosted=process.argv.length>2?await siteInput():null;
 let changed=false;
 for(const [index,previous] of manifest.items.entries()){
  try{
   let act;
   if(hosted){
    const response=await fetchWithServerRetry(new URL('/api/legal',hosted.site),{method:'POST',headers:hosted.headers,body:JSON.stringify({kind:'law',title:previous.queryTitle||previous.title.slice(0,160),full:true,id:previous.id,exactTitle:previous.title,selectedType:previous.type,selectedNumber:previous.number,selectedDate:previous.date}),redirect:'error',signal:AbortSignal.timeout(45000)},{retryPost:true,deadlineAt:Date.now()+45000});
    if(!response.ok)throw Error('Site HTTP '+response.status);
    const source=await response.json();act=source.data?.items?.[0];
    if(!act||act.id!==previous.id||!['fresh','cached'].includes(source.status)||source.error||!verifiedConsolidation(act)||act.consolidation.asOf!==legalToday())throw Error(source.error||'The hosted copy was not confirmed for today.');
   }else act=await consolidateLaw({...previous,sourceUrl:previous.baseSourceUrl||previous.id},portalPage);
   if(!verifiedConsolidation(act)||act.text.length<150000)throw Error('Incomplete official code: '+previous.type);
   const text=act.text,sha256=createHash('sha256').update(text).digest('hex');delete act.text;delete act._relatedCodes;delete act.historical;
   const bytes=gzipSync(text),relative='/legal-snapshots/'+previous.id.split('/').at(-1)+'-'+sha256.slice(0,16)+'.txt.gz',item={...act,queryTitle:previous.queryTitle,characters:text.length,bytes:Buffer.byteLength(text),sha256,file:relative,fileBytes:bytes.length,fileSha256:createHash('sha256').update(bytes).digest('hex'),fetchedAt:act.consolidation.checkedAt},stage=join(temp,index+'.gz');
   await writeFile(stage,bytes);const copy=gunzipSync(await readFile(stage)).toString('utf8');if(copy!==text||createHash('sha256').update(copy).digest('hex')!==sha256)throw Error('Code copy round-trip failed');
   // Content addressing keeps the old manifest valid until the new one commits.
   await mkdir(out,{recursive:true});await rename(stage,join(root,'public',relative));items[index]=item;changed=true;
   checks.push({id:item.id,status:'verified',versionId:item.consolidation.versionId,versionDate:item.consolidation.versionDate,asOf:item.consolidation.asOf,characters:item.characters,sha256});
  }catch(error){checks.push({id:previous.id,status:verifiedConsolidation(previous)?'retained':'unverified',previousAsOf:previous.consolidation?.asOf||null,error:error.message,retryAfterSeconds:error.retryAfter||0,diagnostic:error.diagnostic||null})}
 }
 if(changed){const stage=join(out,'manifest.json.staged');await writeFile(stage,JSON.stringify({sourceUrl:manifest.sourceUrl,note:'Ultimele forme oficiale verificate; fiecare copie păstrează data consolidării și verificării. O copie mai veche nu este certificată pentru ziua curentă.',items},null,2)+'\n');await rename(stage,join(out,'manifest.json'));
  const keep=new Set([...items,...manifest.items].map(item=>item.file.split('/').at(-1)));for(const file of await readdir(out))if(/^\d+-[a-f0-9]{16}\.txt\.gz$/.test(file)&&!keep.has(file))await rm(join(out,file));
 }
 console.log(JSON.stringify({asOf:legalToday(),checkedAt:new Date().toISOString(),changed,checks}));
 if(checks.some(check=>check.status!=='verified'))process.exitCode=2;
}finally{await rm(temp,{recursive:true,force:true})}
