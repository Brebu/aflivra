#!/usr/bin/env node
// Probe (2 API calls): wbgetentities claims for the REMAINING imagery-class entity
// Q-ids (parks tail, all schools, the pharmacy entity row, all courts) — merged with
// the first probe batch into probe-qid-claims-full.json, the candidate ledger for
// the starter attestation set.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseWikidataClaims} from '../../../../../../scripts/relay-imagery.mjs';

const UA='Aflivra/1.0 (contact: contactretetesecrete@gmail.com)';
const dir=path.dirname(fileURLToPath(import.meta.url));
const values=JSON.parse(fs.readFileSync(path.join(dir,'probe-qid-values.json'),'utf8'));
const first=JSON.parse(fs.readFileSync(path.join(dir,'probe-wikidata-imagery.json'),'utf8'));
const probedQids=new Set(first.probed?[]:[]); // the first batch recorded withImage only; recompute the id list
const wk=JSON.parse(fs.readFileSync(path.join(dir,'probe-wikidata-knowledge.json'),'utf8'));
const entityQids=[...new Set([
  ...values.park.wikidata.map(r=>r.qid),
  ...values.school.wikidata.map(r=>r.qid),
  ...values.pharmacy.wikidata.map(r=>r.qid),
  ...values.court.wikidata.map(r=>r.qid),
])];
const brandQids=[...new Set(values.pharmacy['brand:wikidata'].map(r=>r.qid))];
const known=new Set([...wk.probedEntities,...brandQids]);
const remaining=entityQids.filter(qid=>!known.has(qid));
console.log('[probe] entity ids total '+entityQids.length+' · already probed '+[...known].filter(q=>entityQids.includes(q)||brandQids.includes(q)).length+' · remaining '+remaining.length);
const wait=ms=>new Promise(r=>{setTimeout(r,ms)});
const claims=new Map();for(const row of first.withImage)claims.set(row.qid,row);
for(let at=0;at<remaining.length;at+=50){
  const batch=remaining.slice(at,at+50);
  if(batch.length===remaining.length&&at===0&&batch.length<=50){} // single/two batch logic below
  const params=new URLSearchParams({action:'wbgetentities',ids:batch.join('|'),props:'claims|labels',languages:'ro|en',format:'json'});
  const response=await fetch('https://www.wikidata.org/w/api.php?'+params,{headers:{'User-Agent':UA,Accept:'application/json'}});
  console.log('[probe] wbgetentities batch of '+batch.length+' → HTTP '+response.status);
  if(!response.ok)throw Error('HTTP '+response.status);
  const payload=await response.json();
  for(const row of parseWikidataClaims(payload)){
    const raw=payload.entities[row.qid];
    const p158=raw?.claims?.P158?.[0]?.mainsnak?.datavalue?.value||null;
    claims.set(row.qid,{qid:row.qid,label:row.label,p18:row.claim==='P18'?row.image:null,p158});
  }
  if(at+50<remaining.length)await wait(2000);
}
const out={probed:entityQids.length+brandQids.length,claims:[...claims.values()].sort((a,b)=>a.qid.localeCompare(b.qid))};
fs.writeFileSync(path.join(dir,'probe-qid-claims-full.json'),JSON.stringify(out,null,1));
const withImages=[...claims.values()].filter(c=>c.p18||c.p158);
console.log('[probe] entity claims with images: '+withImages.length+' of '+entityQids.length);
const perClass={park:0,school:0,pharmacy:0,court:0};
for(const cls of ['park','school','pharmacy','court'])perClass[cls]=values[cls].wikidata.filter(r=>claims.get(r.qid)&&(claims.get(r.qid).p18||claims.get(r.qid).p158)).length;
console.log('[probe] imaged entity Q-ids per class: '+JSON.stringify(perClass));
console.log('[probe] API calls used this script: '+Math.ceil(remaining.length/50));
