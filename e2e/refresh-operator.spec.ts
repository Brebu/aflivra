import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
const token=readFileSync('.dev.vars','utf8').match(/^REFRESH_TOKEN=(.+)$/m)?.[1]?.trim()||'';
const headers={authorization:'Bearer '+token};
const call=(name:string,args:Record<string,unknown>={})=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});

test('private refresh tools require auth on every MCP request',async({request})=>{
 const publicList=await request.post('/api/mcp',{data:{jsonrpc:'2.0',id:1,method:'tools/list'}});
 const publicNames=(await publicList.json()).result.tools.map((tool:{name:string})=>tool.name);
 expect(publicNames).toHaveLength(41);expect(publicNames).not.toContain('refresh_sources');
 const privateList=await request.post('/api/mcp',{headers,data:{jsonrpc:'2.0',id:2,method:'tools/list'}});
 const privateNames=(await privateList.json()).result.tools.map((tool:{name:string})=>tool.name);
 expect(privateNames).toHaveLength(44);expect(privateNames).toEqual(expect.arrayContaining(['refresh_sources','refresh_status','refresh_corpora']));
 const denied=await request.post('/api/mcp',{data:call('refresh_sources',{member:'weather.alerts'})});expect((await denied.json()).error.code).toBe(-32602);
 expect((await request.get('/api/refresh/status')).status()).toBe(401);
 const valid=await request.post('/api/mcp',{headers,data:call('refresh_status')});const status=(await valid.json()).result;
 expect(status.isError).toBe(false);expect(status.structuredContent.queueAvailable).toBe(true);expect(status.structuredContent.members).toHaveLength(25);
 expect(status.structuredContent.manualTriggerLimits).toEqual({sources:20,corpora:4,window:'UTC day',exhaustedStatus:429});
});

test('MCP refresh returns a persisted job, with observable progress through the real routes',async({request})=>{
 const response=await request.post('/api/mcp',{headers,data:call('refresh_sources',{member:'weather.alerts'})});expect(response.status()).toBe(200);
 const result=(await response.json()).result;expect(result.isError).toBe(false);expect(result.structuredContent.accepted).toBe(true);
 const jobs=result.structuredContent.jobs;expect(jobs).toHaveLength(1);expect(jobs[0].member).toBe('weather.alerts');const id=jobs[0].id;
 expect(id).toMatch(/^[\da-f-]{36}$/i);
 const direct=await request.get('/api/refresh/status?jobId='+id,{headers});expect(direct.status()).toBe(200);
 expect((await direct.json()).jobs[0].id).toBe(id);
 const throughMcp=await request.post('/api/mcp',{headers,data:call('refresh_status',{jobId:id})});const job=(await throughMcp.json()).result.structuredContent.jobs[0];
 expect(['queued','running','completed','failed']).toContain(job.status);expect(job.result?.data).toBeUndefined();
 // Outcome is upstream-dependent. Persistence/auth/routing are deterministic assertions.
 expect((await request.post('/api/refresh?async=true&member=unknown',{headers})).status()).toBe(400);
 expect((await request.post('/api/refresh?async=maybe',{headers})).status()).toBe(400);
 expect((await request.get('/api/refresh/status?jobId=invalid',{headers})).status()).toBe(400);
 expect((await request.get('/api/refresh/status?jobId=00000000-0000-0000-0000-000000000000',{headers})).status()).toBe(404);
});

test('corpus dispatch errors are honest and do not require a real workflow run',async({request})=>{
 expect((await request.post('/api/refresh/corpora')).status()).toBe(401);
 expect((await request.post('/api/refresh/corpora?source=unknown',{headers})).status()).toBe(400);
 const missing=await request.post('/api/mcp',{headers,data:call('refresh_corpora',{source:'amccrs'})});const result=(await missing.json()).result;
 expect(result.isError).toBe(true);expect(JSON.parse(result.content[0].text).error).toContain('CORPORA_GITHUB_TOKEN');
 const invalid=await request.post('/api/mcp',{headers,data:call('refresh_corpora',{source:'arbitrary'})});expect((await invalid.json()).error.code).toBe(-32602);
});

test('bundled registries expose the retrieval timestamp and age while keeping their data readable',async({request})=>{
 for(const path of ['/api/tourism?kind=cazare&county=Bra%C8%99ov','/api/seismic?q=Academiei','/api/earthquakes?from=2023&to=2023-12-31','/api/monuments?q=Biserica']){
  const response=await request.get(path);expect(response.status()).toBe(200);const state=await response.json();
  expect(state.data).not.toBeNull();expect(state.lastSuccessAt).toBe(state.data.fetchedAt);expect(state.lastSuccessAt).toContain('T');
  expect(state.corpusAgeSeconds).toBeGreaterThanOrEqual(0);expect(state.updateRequired).toBe(state.status==='stale');
  expect(['cached','stale']).toContain(state.status);expect(state.data.total).toBeGreaterThan(0);
 }
});

test('the daily manual budget returns 429 across the real HTTP and MCP routes',async({request})=>{
 let stopped=false;
 for(let attempt=0;attempt<=20;attempt++){
  const response=await request.post('/api/refresh?async=true&member=bnr',{headers});
  if(response.status()===429){expect((await response.json()).limit).toBe(20);expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);stopped=true;break}
  expect(response.status()).toBe(202);
 }
 expect(stopped).toBe(true);
 const throughMcp=await request.post('/api/mcp',{headers,data:call('refresh_sources',{member:'bnr'})});
 const result=(await throughMcp.json()).result;expect(result.isError).toBe(true);expect(JSON.parse(result.content[0].text).limit).toBe(20);
});
