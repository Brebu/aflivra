import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateRefreshedCorpus} from './lib/corpus-integrity.mjs';
const registry=JSON.parse(await readFile('public/data/snapshot-transport.json','utf8'));
const results=[];
for(const path of ['/situr/cazare.json','/situr/alimentatie.json','/situr/agentii.json','/amccrs/buildings.json','/eida/seismic.json','/lmi/monuments-bucuresti.json']){
 const proof=registry.items.find(item=>item.path===path);assert(proof,'Missing proof for '+path);
 assert.equal(proof.file,path+'.gz');const raw=gunzipSync(await readFile('public'+proof.file)),payload=JSON.parse(raw);
 assert.equal(raw.length,proof.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),proof.sha256);
 const result=validateRefreshedCorpus(path,payload),at=process.argv.indexOf('--base-ref');
 if(at>=0){const ref=process.argv[at+1];assert(ref&&/^[\w./-]+$/.test(ref),'Invalid base ref');const baseline=JSON.parse(gunzipSync(execFileSync('git',['show',ref+':public'+proof.file],{maxBuffer:25_000_000})));const oldRows=baseline.rows?.length??baseline.events.length;assert(result.rows>=oldRows*.9,path+': unexpected loss of more than 10% of rows');result.previousRows=oldRows}
 if(path.startsWith('/lmi/')){const golden=JSON.parse(await readFile('ssnc-agent-orch/2026/10/10/fixuri-astra/fixtures/validated/lmi-golden-corrections.json','utf8'));const byCode=new Map(payload.rows.map(row=>[row[0],row]));for(const expected of golden)assert.deepEqual(byCode.get(expected[0])?.slice(0,6),expected)}
 results.push(result);
}
console.log(JSON.stringify({result:'ok',mode:'dynamic counts, recomputed gaps/classes, byte hashes, EIDA coverage, LMI visual goldens',corpora:results}));
