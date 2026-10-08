#!/usr/bin/env node
// Probe (offline): corpus rows for the starter attestation set — one lookup per chosen
// Q-id across the four classes, plus pharmacies WITHOUT any image key (the honest AI
// illustration leg of the e2e) and the locality match for the tourism teaser.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {classifyImageryRecords} from '../../../../../../scripts/relay-imagery.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..','../..');
const recordsDir=path.join(root,'public/places/records');
const QID=/^Q[1-9]\d{0,9}$/;
const classes={park:{category:'mediu',match:t=>t.leisure==='park'},school:{category:'educatie',match:t=>t.amenity==='school'},pharmacy:{category:'sanatate',match:t=>t.amenity==='pharmacy'},court:{category:'justitie',match:t=>t.amenity==='courthouse'}};
// The chosen starter Q-ids: parks (6), schools (3), pharmacy brands (2), courts (3).
const chosen=['Q959632','Q2052075','Q2074133','Q715958','Q4118458','Q2284372','Q12744205','Q3067523','Q18539127','Q56317371','Q117706903','Q5755230','Q43113639','Q18548695'];
const found=new Map(chosen.map(q=>[q,[]]));const aiPharmacies=[];const citiesWithGalleries=new Set(['Sibiu','Brașov','București','Iași','Galați','Constanța','Timișoara','Cluj-Napoca','Sighișoara','Sinaia']);
const cityProbe={};
for(const file of fs.readdirSync(recordsDir).filter(f=>f.endsWith('.json.gz')).sort()){
  const items=JSON.parse(gunzipSync(fs.readFileSync(path.join(recordsDir,file)))).items;
  for(const item of items){
    const tags=item.tags||{};
    for(const [name,cls] of Object.entries(classes)){
      if(!item.categories.includes(cls.category)||!cls.match(tags))continue;
      for(const tag of ['wikidata','brand:wikidata']){
        const value=String(tags[tag]||'').trim();
        if(QID.test(value)&&found.has(value))found.get(value).push({id:item.id,name:item.name,city:tags['addr:city']||item.address?.split(',').at(-2)?.trim()||'',tag});
      }
      if(name==='pharmacy'&&!QID.test(String(tags.wikidata||''))&&!QID.test(String(tags['brand:wikidata']||''))&&aiPharmacies.length<8&&item.name)
        aiPharmacies.push({id:item.id,name:item.name,city:tags['addr:city']||''});
      const city=String(tags['addr:city']||'').trim();
      if(name==='court'&&city&&citiesWithGalleries.has(city)&&(cityProbe[city]?.length??0)<3)
        (cityProbe[city]??=[]).push({id:item.id,name:item.name});
      break;
    }
  }
}
const out={qids:{},aiPharmacies,cityProbe};
for(const qid of chosen){const rows=found.get(qid);out.qids[qid]={rows:rows.length,records:rows.slice(0,5)}}
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'probe-starter-rows.json'),JSON.stringify(out,null,1));
for(const qid of chosen)console.log(qid.padEnd(10),'rows '+String(out.qids[qid].rows).padStart(4)+' · first: '+out.qids[qid].records[0]?.name+' ('+out.qids[qid].records[0]?.city+') ['+out.qids[qid].records[0]?.tag+']');
console.log('pharmacies without any Q-id (AI illustration leg):');
for(const p of aiPharmacies)console.log('   '+p.id+' · '+p.name+' ('+p.city+')');
console.log('court rows in gallery cities (tourism teaser leg): '+JSON.stringify(cityProbe));
