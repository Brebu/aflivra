import assert from 'node:assert/strict';
/** Changing public editions are validated against their contents, not yesterday's totals. */
export function validateRefreshedCorpus(path,payload){
 assert(Number.isFinite(Date.parse(payload.fetchedAt)),path+': retrieval date required');
 if(path.startsWith('/situr/')){
  assert.equal(payload.schema,'aflivra-situr-'+payload.kind+'-v1');assert.equal(payload.license,null);
  assert(payload.rows.length>1000);assert.equal(payload.rows.length,payload.counts.rows);
  assert(payload.columns.length>=10);assert(payload.rows.every(row=>Array.isArray(row)&&row.length===payload.columns.length));
  const cui=payload.columns.indexOf(payload.columns.includes('C.U.I')?'C.U.I':'Cod Unic Înregistrare'),address=payload.columns.findIndex(column=>/detalii adresă|^adres[ăa]$/i.test(column));
  assert(cui>=0&&address>=0,'SITUR: required columns');
  assert.equal(payload.counts.missingCui,payload.rows.filter(row=>!row[cui]).length);
  assert.equal(payload.counts.missingAddressDetail,payload.rows.filter(row=>!row[address]).length);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(payload.exportDate));
 }else if(path.startsWith('/amccrs/')){
  assert.equal(payload.schema,'aflivra-amccrs-v1');assert(payload.rows.length>=2000);
  assert.equal(payload.rows.length,payload.counts.rows);assert.equal(new Set(payload.rows.map(row=>row[0])).size,payload.counts.distinctIds);assert.equal(payload.counts.distinctIds,payload.rows.length);
  assert.equal(new Set(payload.rows.map(row=>row[10])).size,payload.counts.distinctClassForms);
  const classes={};for(const row of payload.rows){assert.equal(row.length,15);assert(row[0]);assert(/^[1-6]$/.test(row[14]));assert(['RsI','RsII','RsIII','RsIV','consolidata','urgenta','neincadrata','neclasificabila'].includes(row[13]));classes[row[13]]=(classes[row[13]]||0)+1}
  assert.deepEqual(classes,payload.counts.normalizedClasses);
 }else if(path.startsWith('/eida/')){
  assert.equal(payload.schema,'aflivra-eida-v2');assert.equal(payload.window.minMagnitude,3);assert.deepEqual(payload.truncatedYears,[]);
  assert.equal(payload.stations.length,payload.counts.stations);assert(payload.stations.length>=100);assert(payload.stations.every(row=>row.station&&row.network!=='#Network'));
  assert.equal(payload.events.length,payload.counts.events);assert(payload.events.length>500);
  const counts={};for(const event of payload.events){assert(Number.isFinite(Date.parse(event.time)));assert(Number(event.magnitude)>=3);assert(Number(event.latitude)>=43&&Number(event.latitude)<=49);assert(Number(event.longitude)>=20&&Number(event.longitude)<=30);assert(event.eventType&&typeof event.magnitudeAuthor==='string');assert.notEqual(event.eventLocationName,event.eventType);const year=event.time.slice(0,4);counts[year]=(counts[year]||0)+1}
  for(const [year,count] of Object.entries(payload.counts.eventsByYear))assert.equal(count,counts[year]||0);
  assert.equal(Object.values(payload.counts.eventsByYear).reduce((a,b)=>a+b,0),payload.events.length);
  assert(Array.isArray(payload.coverageByYear)&&payload.coverageByYear.length>0);
  for(const entry of payload.coverageByYear){assert.equal(entry.rows,counts[entry.year]||0);assert(typeof entry.status==='string'&&entry.status);if(entry.httpStatus===204)assert(/inconclusive/.test(entry.status),'204 is inconclusive, not certified absence of earthquakes')}
 }else if(path.startsWith('/lmi/')){
  assert.equal(payload.schema,'aflivra-lmi-bucuresti-v2');assert.equal(payload.rows.length,2651);assert.equal(payload.counts.rows,payload.rows.length);assert.equal(new Set(payload.rows.map(row=>row[0])).size,payload.counts.distinctCodes);
  for(const row of payload.rows){assert(/^B-[IVX]+-[a-z]+-(?:A|B)-\d{2,6}(?:\.\d{1,3})?$/.test(row[0]));assert(row[1]);assert(Number.isInteger(row[5])&&row[5]>=490&&row[5]<=740);assert(Number.isInteger(row[6])&&row[6]>=1&&row[6]<=233);assert.notEqual(row[3],row[4])}
 }else throw Error('Unknown corpus: '+path);
 return {path,rows:payload.rows?.length??payload.events.length};
}
