import assert from 'node:assert/strict';
import {fetchWithServerRetry,retryAfterSeconds} from '../lib/http-retry.mjs';

const originalFetch=globalThis.fetch,originalWindow=globalThis.window,tick=()=>new Promise(resolve=>setImmediate(resolve));
try{
 globalThis.window={};
 let calls=0;globalThis.fetch=async()=>new Response(++calls<3?'temporary':'complete',{status:calls===1?520:calls===2?502:200});
 assert.equal(await (await fetchWithServerRetry('https://source.test/data')).text(),'complete');assert.equal(calls,3,'A third attempt recovers the original request');
 calls=0;globalThis.fetch=async()=>new Response('final-'+(++calls),{status:503});
 const exhausted=await fetchWithServerRetry('https://source.test/data');assert.equal(calls,3);assert.equal(await exhausted.text(),'final-3','The final error body must remain readable');
 for(const status of [400,429]){calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status})};assert.equal((await fetchWithServerRetry('https://source.test/data')).status,status);assert.equal(calls,1)}
 calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:503,headers:{'Retry-After':'120'}})};await fetchWithServerRetry('https://source.test/data',{}, {deadlineAt:Date.now()+18000});assert.equal(calls,1,'A long Retry-After must be left to the scheduled refresh');
 assert.equal(retryAfterSeconds('120'),120);assert.equal(retryAfterSeconds('invalid'),0);assert(retryAfterSeconds(new Date(Date.now()+30000).toUTCString())>28);
 calls=0;const aborted=new AbortController();globalThis.fetch=async()=>{calls++;return new Response(null,{status:502})};const interrupted=fetchWithServerRetry('https://source.test/data',{signal:aborted.signal});await tick();aborted.abort();await assert.rejects(interrupted,{name:'AbortError'});assert.equal(calls,1,'Cancelling a retry delay must prevent another network request');
 calls=0;const bodies=[];globalThis.fetch=async(url,init)=>{calls++;bodies.push(init.body);return new Response('ok',{status:calls===1?502:200})};await fetchWithServerRetry('https://source.test/query',{method:'POST',body:'same query'});assert.equal(calls,1,'POST retries require explicit read-only opt-in');calls=0;bodies.length=0;await fetchWithServerRetry('https://source.test/query',{method:'POST',body:'same query'},{retryPost:true});assert.equal(calls,2);assert.deepEqual(bodies,['same query','same query']);

 const pending=[];let active=0,maximum=0;globalThis.fetch=url=>new Promise(resolve=>{active++;maximum=Math.max(maximum,active);pending.push(()=>{active--;resolve(new Response('ok'))})});
 const queued=Array.from({length:9},(_,i)=>fetchWithServerRetry('https://source.test/data/'+i));await tick();assert.equal(pending.length,3);while(pending.length){pending.splice(0).forEach(resolve=>resolve());await tick()}await Promise.all(queued);assert.equal(maximum,3,'At most three data fetches may run simultaneously');
 pending.length=0;active=0;maximum=0;const weatherAbort=new AbortController();const weather=[fetchWithServerRetry('https://api.open-meteo.com/v1/forecast?latitude=1'),fetchWithServerRetry('https://api.open-meteo.com/v1/forecast?latitude=2',{signal:weatherAbort.signal}),fetchWithServerRetry('https://api.open-meteo.com/v1/forecast?latitude=3')];await tick();assert.equal(pending.length,1);weatherAbort.abort();await assert.rejects(weather[1],{name:'AbortError'});pending.shift()();await tick();assert.equal(pending.length,1);pending.shift()();await Promise.all([weather[0],weather[2]]);assert.equal(maximum,1,'Weather requests must run one at a time, and abandoned queued locations must never fetch');
 console.log('Verified real HTTP helper: three total 5xx attempts, complete final errors, read-only POST replay, Retry-After, cancellation, no 4xx retries, at most three parallel data requests and one weather request.');
}finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow}
