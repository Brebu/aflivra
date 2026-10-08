// Rebuild only registered public-file copies. Failures retain the last verified copy.
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import ts from 'typescript';
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=await mkdtemp(join(tmpdir(),'aflivra-copy-refresh-'));
const registered=[{datasetId:'15cb96b0-984f-4d89-9d04-cd500ba9fd22',id:'1088e792-54f4-43ad-8e4c-9b351b82d31c'},{datasetId:'fa2fee98-7345-450a-8ad9-572d243ebde2',id:'0bfeb08b-73ce-49cb-8f50-dd7a63b9aa27'}];
const report=[],copies=JSON.parse(await readFile(join(root,'lib/live/resource-seed.json'),'utf8'));await mkdir(join(root,'public/resource-copies'),{recursive:true});
try{
 for(const name of ['resources','source-xml','catalog-metadata','adapters','catalog-categories','records','query','text','media']){let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');source=source.replace("import {env} from 'cloudflare:workers';",'const env={};').replace("import audit from '@/public/catalog/audit.json';",'const audit='+await readFile(join(root,'public/catalog/audit.json'),'utf8')+';');let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace(/from '(\.\/[^']+)'/g,(_,path)=>"from '"+path+".mjs'");for(const pkg of ['xlsx','fflate'])js=js.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");await writeFile(join(temp,name+'.mjs'),js)}
 const {parseResource}=await import(pathToFileURL(join(temp,'resources.mjs'))),{verifiedCatalogResource}=await import(pathToFileURL(join(temp,'catalog-metadata.mjs')));
 for(const entry of registered)try{
  const rawDataset=await readFile(join(root,'public/catalog/datasets',entry.datasetId+'.json'),'utf8'),{resource}=verifiedCatalogResource(entry.datasetId,entry.id,rawDataset),url=new URL(resource.url);if(url.protocol!=='https:'||url.hostname!=='data.gov.ro'||url.username||url.password)throw Error('Unapproved copy origin');
  const retrieved=JSON.parse(execFileSync('python3',['-c',`import sys,json,urllib.request,hashlib,base64,datetime
p=json.load(sys.stdin)
with urllib.request.urlopen(urllib.request.Request(p['url'],headers={'User-Agent':'Aflivra/1.0 public-data-reader'}),timeout=45) as r:
 body=r.read(25000001)
 if len(body)>25000000: raise ValueError('File exceeds complete-copy limit')
 if 'html' in r.headers.get('Content-Type','').lower(): raise ValueError('Source returned HTML instead of the requested file')
 print(json.dumps({'base64':base64.b64encode(body).decode(),'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':r.url,'sha256':hashlib.sha256(body).hexdigest()}))`],{input:JSON.stringify({url:url.href}),maxBuffer:35_000_000,timeout:55000}).toString());
  const bytes=Buffer.from(retrieved.base64,'base64'),parsed=parseResource(bytes,String(resource.format||''));if(!['table','pdf'].includes(parsed.data.kind)||parsed.data.binary)throw Error('Copy requires chunked preparation; previous copy retained');
  const data={...parsed.data,title:String(resource.name||entry.id),sourceUrl:url.href,complete:true,copyVerified:true,copyFetchedAt:retrieved.fetchedAt,copyFileSha256:retrieved.sha256,metadataNotice:'Copie integrală verificată a fișierului publicat, păstrată pentru continuitate. Data preluării este afișată separat.'};
  const encoded=JSON.stringify(data);if(Buffer.byteLength(encoded)>1_500_000)throw Error('Prepared copy exceeds seed row budget; previous copy retained');const format=String(resource.format).toLowerCase(),file=entry.id+'.'+format;
  await writeFile(join(root,'public/resource-copies',file),bytes);copies['resource:'+entry.id]={id:entry.id,datasetId:entry.datasetId,fetchedAt:retrieved.fetchedAt,publishedAt:resource.last_modified||resource.created||null,sourceUrl:url.href,file:'/resource-copies/'+file,fileSha256:retrieved.sha256,bytes:bytes.length,dataSha256:createHash('sha256').update(encoded).digest('hex'),data};
  report.push({id:entry.id,status:'verified',kind:data.kind,bytes:bytes.length,rows:data.sheets?.map(s=>s.total),fileSha256:retrieved.sha256});
 }catch(error){report.push({id:entry.id,status:'retained',error:error.message,hasPreviousCopy:!!copies['resource:'+entry.id]})}
 await writeFile(join(root,'lib/live/resource-seed.json'),JSON.stringify(copies)+'\n');await writeFile(join(root,'public/resource-copies/manifest.json'),JSON.stringify({copies:Object.values(copies).map(({data,...item})=>item),checks:report},null,2)+'\n');console.log(JSON.stringify(report));
}finally{await rm(temp,{recursive:true,force:true})}
