// Read-only connection evidence. No credentials, full exports or WAF bypass.
// node scripts/probe-sources.mjs --output /tmp/aflivra-source-probes.json
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest'}).format(new Date());
let sources=[
 ['ANM observations','https://www.meteoromania.ro/wp-json/meteoapi/v2/starea-vremii','json'],
 ['ANM alerts','https://www.meteoromania.ro/avertizari-xml.php','xml'],
 ['Open-Meteo','https://api.open-meteo.com/v1/forecast?latitude=44.43&longitude=26.1&current=temperature_2m&forecast_days=1','json'],
 ['BNR','https://curs.bnr.ro/nbrfxrates10days.xml','xml'],
 ['CKAN catalog','https://data.gov.ro/api/3/action/package_search?rows=1&sort=metadata_modified%20desc','json'],
 ['Schools datastore','https://data.gov.ro/api/3/action/datastore_search?resource_id=280d52b6-4c5e-489d-9b48-3dd8961f56e0&limit=1','json'],
 ['CNAS suppliers metadata','https://data.gov.ro/api/3/action/package_show?id=lista-furnizori','json'],
 ['ANCPI metadata','https://data.gov.ro/api/3/action/package_show?id=62410f25-a155-40fd-9aa9-ae54bdc96f42','json'],
 ['ANL metadata','https://data.gov.ro/api/3/action/package_show?id=04ab4208-d17f-4f9b-ba81-7778f373344d','json'],
 ['SIRUTA metadata','https://data.gov.ro/api/3/action/package_show?id=siruta_s1-2026','json'],
 ['ANAF balance','https://webservicesp.anaf.ro/bilant?an=2025&cui=427282','json'],
 ['ANOFM RSS','https://www.anofm.ro/feed/','xml'],['MAI RSS','https://www.mai.gov.ro/feed/','xml'],
 ['CNAS RSS','https://cnas.ro/feed/','xml'],['Education RSS','https://www.edu.ro/rss.xml','xml'],
 ['Justice RSS','https://www.just.ro/feed/','xml'],['Energy RSS','https://energie.gov.ro/feed/','xml'],
 ['TPBI RSS','https://tpbi.ro/feed/','xml'],['AFIR index','https://www.afir.ro/','html'],
 ['Transelectrica SEN','https://www.transelectrica.ro/sen-filter','json'],
 ['POSF counties','https://posf.ro/comparator/api/index.php?request=get-judete','json'],
 ['INS TEMPO metadata','http://statistici.insse.ro:8077/tempo-ins/matrix/POP105A','json'],
 ['Legislation WSDL','http://legislatie.just.ro/apiws/FreeWebService.svc?wsdl','xml'],
 ['Courts WSDL','http://portalquery.just.ro/Query.asmx?WSDL','xml'],
 ['IFEP lawyers','https://www.ifep.ro/Justice/Lawyers/LawyersPanel.aspx','html'],
 ['Wikidata search','https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Dedeman&language=ro&limit=1&type=item&format=json','json'],
 ['Wikisource API','https://ro.wikisource.org/w/api.php?action=query&format=json&titles=Ion%20Creang%C4%83','json'],
 ['Cinema City program','https://www.cinemacity.ro/ro/data-api-service/v1/quickbook/10107/film-events/in-cinema/1824/at-date/'+today+'?attr=','json'],
 ['Odeon calendar','https://teatrul-odeon.ro/','html'],['Teatrul de Arta','https://teatruldearta.ro/','html'],
 ['TPBI positions','https://gtfs.tpbi.ro/api/gtfs-rt/vehiclePositions','binary'],
 ['TPBI arrivals','https://gtfs.tpbi.ro/api/gtfs-rt/tripUpdates','binary'],
 ['TPBI alerts','https://gtfs.tpbi.ro/api/gtfs-rt/serviceAlerts','binary'],
 ['SITUR index','https://se.situr.gov.ro/OpenData/OpenDataMain','html'],
 ['AMCCRS index','https://amccrs-pmb.ro/lista-imobile-2/','html'],
 ['EIDA stations','https://eida-sc3.infp.ro/fdsnws/station/1/query?net=RO&level=station&format=text','text'],
 ['LMI index','https://patrimoniu.ro/ro/profiles/lista-monumentelor-istorice','html'],
 ['ADSB Romania','https://api.adsb.lol/v2/lat/44.4/lon/26.1/dist/100','json'],
 ['Bucharest airport board','https://bucharestairports.ro/wp-json/fds/v1/flights?airport=henri-coanda&language=ro','json'],
];
const onlyAt=process.argv.indexOf('--only');
if(onlyAt>=0){const selected=process.argv[onlyAt+1];sources=sources.filter(source=>source[0]===selected);if(!sources.length)throw Error('Unknown source name for --only')}
const startedAt=new Date().toISOString(),results=Array(sources.length);let cursor=0;
async function probe([name,url,expected]){
 const start=performance.now();
 try{
  const response=await fetch(url,{headers:{'User-Agent':'Aflivra/1.0 public-data-source-check'},signal:AbortSignal.timeout(15000),redirect:'follow'});
  const reader=response.body?.getReader(),parts=[];let bytes=0,complete=true;
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;parts.push(value);bytes+=value.length;if(bytes>1_000_000){complete=false;await reader.cancel();break}}
  const buffer=Buffer.concat(parts),text=buffer.toString('utf8');let shape='not-checked';
  if(response.ok){if(expected==='json'){try{const parsed=JSON.parse(text);shape=parsed?.success===false?'api-error':typeof parsed==='object'&&parsed!==null?'json':'invalid-json'}catch{shape='invalid-json'}}else if(expected==='xml')shape=/<(?:\w+:)?(?:rss|feed|definitions|Envelope|DataSet|avertizari)\b/i.test(text)?'xml':'unexpected-document';else shape=bytes?'non-empty':'empty'}
  return {name,url,expected,httpStatus:response.status,ok:response.ok&&['json','xml','non-empty'].includes(shape),shape,contentType:response.headers.get('content-type'),server:response.headers.get('server'),retryAfter:response.headers.get('retry-after'),durationMs:Math.round(performance.now()-start),sampleBytes:bytes,complete,sha256:createHash('sha256').update(buffer).digest('hex'),observedAt:new Date().toISOString()};
 }catch(error){return {name,url,expected,ok:false,httpStatus:null,category:error.name==='TimeoutError'?'timeout':'connection',code:error.cause?.code||null,durationMs:Math.round(performance.now()-start),observedAt:new Date().toISOString()}}
}
await Promise.all(Array.from({length:3},async()=>{while(cursor<sources.length){const index=cursor++;results[index]=await probe(sources[index]);console.log(JSON.stringify(results[index]))}}));
const output={startedAt,finishedAt:new Date().toISOString(),environment:'local audit egress; not Cloudflare Workers',mode:'one bounded read per endpoint; metadata/samples, not an end-to-end import',results};
const at=process.argv.indexOf('--output');if(at>=0){if(!process.argv[at+1])throw Error('Missing --output path');await writeFile(process.argv[at+1],JSON.stringify(output,null,2)+'\n')}
console.log(JSON.stringify({total:results.length,ok:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length}));
