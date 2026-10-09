import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';

// Poarta de integritate a corpusului de mers tren: legătura manifest ↔ plăci
// pe care nicio poartă nu o aserta — un parser care pierde rânduri sau o placă
// coruptă trecea neobservată cât timp bytes/SHA rămâneau valide. Numărul „corect"
// per operator e mulțimea distinctă a numerelor de tren din plăci, egală cu
// ediția publicată la sursă (un tren fără nicio escală reală nu există în
// corpusul de acum; dacă o ediție viitoare aduce astfel de trenuri, poarta le
// semnalează explicit, nu le ascunde).
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(join(root,'public/trains/manifest.json'),'utf8'));
const stationsIndex=JSON.parse(gunzipSync(await readFile(join(root,'public/trains/stations.json.gz'))));
assert.equal(manifest.counts.stations,stationsIndex.items.length,'manifestul numără exact stațiile indicelui');
assert.equal(manifest.counts.operators,manifest.operators.filter(operator=>operator.status==='verified').length,'operatorii verificați se numără onest');
const operatorIds=new Set(manifest.operators.map(operator=>operator.id));
const stationCodes=new Set(stationsIndex.items.map(item=>item.code));
const boardNumbers=new Map([...operatorIds].map(id=>[id,new Set()]));
let rows=0,stationsSeen=0;
for(let shard=0;shard<manifest.shards;shard++){
 const payload=JSON.parse(gunzipSync(await readFile(join(root,'public/trains/boards/'+String(shard).padStart(2,'0')+'.json.gz'))));
 for(const entry of payload.stations){
  assert(stationCodes.has(entry.code),`stația ${entry.code} din placa ${shard} există în indice`);
  stationsSeen+=1;
  for(const row of [...entry.departures,...entry.arrivals]){
   assert(operatorIds.has(row.o),`rândul trenului ${row.n} din placa ${shard} are operatorul ${row.o} din manifest`);
   assert(Number.isInteger(row.t)&&row.t>=0&&row.t<86400*2,`timpul rândului trenului ${row.n} e un moment al zilei`);
   boardNumbers.get(row.o).add(row.n);
   rows+=1;
  }
 }
}
assert.equal(stationsSeen,stationsIndex.items.length,'fiecare stație a indicelui are fișa în plăci');
for(const operator of manifest.operators){
 if(operator.status!=='verified'){assert.equal(boardNumbers.get(operator.id).size,0,`operatorul neverificat ${operator.id} nu are rânduri în plăci`);continue}
 assert.equal(boardNumbers.get(operator.id).size,operator.trains,`operatorul ${operator.id}: ${boardNumbers.get(operator.id).size} trenuri distincte în plăci vs ${operator.trains} în manifest — ediția sursă se servește integral, fără tăieri silențioase și fără fantome`);
}
assert.equal(manifest.counts.trains,manifest.operators.filter(operator=>operator.status==='verified').reduce((n,operator)=>n+operator.trains,0),'totalul de trenuri e suma edițiilor operatorilor');
console.log(`Corpusul de mers tren e integru: ${stationsSeen} stații în ${manifest.shards} plăci, ${manifest.counts.trains} trenuri — numerele distincte din plăci egale cu edițiile din manifest, operator cu operator (${rows} rânduri).`);
