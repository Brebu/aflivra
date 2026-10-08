#!/usr/bin/env node
// Probe (1 API call + 14 spaced image downloads): builds the STARTER attestation set
// for the imagery register — one honest pass over the chosen Q-ids of the four classes
// (parks, schools, pharmacy brands, courts), reusing the relay's own exported pieces
// (corpus reader with sha256 proofs, classifier, claims/info parsers, download guard,
// asset-row builder) so the starter rows are byte-identical to what the weekly relay
// produces. This is a one-time session probe, NOT a relay run: no caps, no exit-class
// protocol, no workflow — the weekly tour owns the register from here on.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readCorpusRecords,classifyImageryRecords,parseCommonsImageinfo,buildAssetRow,downloadImage,IMAGERY_UA,THUMB_WIDTH,REGISTER_SCHEMA,REGISTER_RELATIVE_PATH,MANIFEST_RELATIVE_PATH,CLASS_ORDER} from '../../../../../../scripts/relay-imagery.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../../../..','../..');
const wait=ms=>new Promise(r=>{setTimeout(r,ms)});
const claims=new Map(JSON.parse(fs.readFileSync(path.join(dir,'probe-qid-claims-merged.json'),'utf8')).claims.map(c=>[c.qid,c]));
// Starter selection: 6 parks, 3 schools, 2 pharmacy brands, 3 courts (see STATUS probe ledger).
const CHOSEN=['Q959632','Q2052075','Q2074133','Q715958','Q4118458','Q2284372','Q12744205','Q3067523','Q18539127','Q56317371','Q117706903','Q5755230','Q43113639','Q18548695'];
const corpus=readCorpusRecords(root);
const rows=classifyImageryRecords(corpus);
console.log('[probe] corpus rows with exact Q-id keys: '+rows.length);
const COMMONS='https://commons.wikimedia.org';
const wanted=CHOSEN.map(qid=>({qid,claim:claims.get(qid)})).filter(x=>x.claim&&(x.claim.p18||x.claim.p158));
console.log('[probe] chosen Q-ids with an image claim: '+wanted.length+' of '+CHOSEN.length);
if(wanted.length!==CHOSEN.length){for(const qid of CHOSEN)if(!claims.get(qid)?.p18&&!claims.get(qid)?.p158)console.log('   fără revendicare: '+qid)}

// ── API call: Commons imageinfo extmetadata for all titles in one batch
const titles=wanted.map(x=>'File:'+(x.claim.p18||x.claim.p158));
const params=new URLSearchParams({action:'query',prop:'imageinfo',iiprop:'url|size|extmetadata',iiurlwidth:String(THUMB_WIDTH),titles:titles.join('|'),format:'json'});
const response=await fetch(COMMONS+'/w/api.php?'+params,{headers:{'User-Agent':IMAGERY_UA,Accept:'application/json'}});
console.log('[probe] Commons imageinfo of '+titles.length+' titles → HTTP '+response.status);
if(!response.ok)throw Error('HTTP '+response.status);
const metas=new Map(parseCommonsImageinfo(await response.json()).map(meta=>[meta.title,meta]));
console.log('[probe] API calls used this script: 1 (total session: 5)');

// ── Downloads: Special:FilePath 800px thumbnails, spaced, guarded — exact bytes, sha256
const applied=[];
for(const qid of CHOSEN){
  const claim=claims.get(qid);if(!claim||(!claim.p18&&!claim.p158))continue;
  const title=claim.p18||claim.p158;
  let meta=metas.get(title);
  if(!meta){console.log('[omis] '+qid+' «'+title+'» fără informații de fișier la Commons');continue}
  if(!meta.license||!meta.author){console.log('[omis] '+qid+' «'+title+'» fără licență sau autor publicat');continue}
  const url=COMMONS+'/wiki/Special:FilePath/'+encodeURIComponent(title)+'?width='+THUMB_WIDTH;
  const result=await downloadImage(url,'commons.wikimedia.org');
  if(result.kind!=='ok'){console.log('[omis] '+qid+' «'+title+'» descărcarea a eșuat ('+result.kind+(result.status||result.detail||'')+')');continue}
  const sha256=createHash('sha256').update(result.bytes).digest('hex');
  const classRows=rows.filter(row=>row.qid===qid),kind=classRows[0];
  const asset=buildAssetRow({qid,claim:claim.p18?'P18':'P158',role:kind.role,classes:[...new Set(classRows.map(row=>row.cls))],label:claim.label,title,meta,bytes:result.bytes,sha256,extension:result.extension,commonsOrigin:COMMONS});
  fs.writeFileSync(path.join(root,'public/media',asset.app_file.replace('/media/','')),result.bytes);
  applied.push(asset);
  console.log('[atestare] '+asset.app_id+' «'+asset.title+'» — '+asset.license+' · '+result.bytes.length+' octeți · '+(asset.role==='brand'?'brand':kind.cls));
  await wait(1000);
}
if(!applied.length)throw Error('no starter asset applied');

// ── Register state, same derivation as the relay: assets + records map + class stats
const appByQid=new Map(applied.map(asset=>[asset.qid,asset.app_id]));
const records={};
for(const row of rows){const appId=appByQid.get(row.qid);if(appId)records[row.id]={a:appId,c:row.cls,t:row.tag}}
const byClass={};for(const cls of CLASS_ORDER)byClass[cls]=rows.filter(row=>row.cls===cls);
const classes={};for(const cls of CLASS_ORDER)classes[cls]={records:byClass[cls].length,imaged:byClass[cls].filter(row=>appByQid.has(row.qid)).length};
const manifest=JSON.parse(fs.readFileSync(path.join(root,MANIFEST_RELATIVE_PATH),'utf8'));
const manifestIds=new Set(manifest.assets.map(a=>a.app_id));
for(const asset of applied)if(!manifestIds.has(asset.app_id))manifest.assets.push(asset);
fs.writeFileSync(path.join(root,MANIFEST_RELATIVE_PATH),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,REGISTER_RELATIVE_PATH),JSON.stringify({schema:REGISTER_SCHEMA,generatedAt:new Date().toISOString(),source:'Wikidata (P18/P158) · Wikimedia Commons',classes,assets:applied,records},null,2)+'\n');
console.log('[probe] manifest rows: '+manifest.assets.length+' · register assets: '+applied.length+' · mapped records: '+Object.keys(records).length);
console.log('[probe] classes: '+JSON.stringify(classes));
