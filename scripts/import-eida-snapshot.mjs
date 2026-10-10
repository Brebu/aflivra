// Offline corpus import for INFP/EIDA seismic data: the RO network station list
// (FDSN station service, text format) and the felt-earthquake history (FDSN event
// service, magnitude ≥ 3 inside the audited bbox 43–49°N / 20–30°E, sliced per year
// because the service caps responses at the limit parameter). The columns come from
// each service's own header line (scripts/lib/fdsn-text.mjs) — the 2026-10-10
// verification found the previous fixed mapping served four columns under the wrong
// keys, so the corpus is aflivra-eida-v2 and the migration is Astra-verified. The
// committed window is declared in the corpus and served verbatim; the 2026 slice
// answered HTTP 204 at the source, which stays recorded as inconclusive (never
// „no earthquakes"). Current-alert querying is NOT served from this corpus.
// Run from the repo root: node scripts/import-eida-snapshot.mjs
import {writeSnapshotIfChanged,registerPrefix} from './snapshot-register.mjs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateFixtureManifest} from './lib/fixture-manifest.mjs';
import {parseFdsnStations,parseFdsnEvents} from './lib/fdsn-text.mjs';

const UA='Aflivra-Integration-Evaluation/1.0';
const STATION_URL='https://eida-sc3.infp.ro/fdsnws/station/1/query?net=RO&level=station&format=text';
const EVENTS_URL='https://eida-sc3.infp.ro/fdsnws/event/1/query';
const YEARS=[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];
const LIMIT=1000;

// Modul local (N01): --input-dir/--source-dir citește textele FDSN din pachetul de probe
// (stațiile + câte o felie pe an), cu bytes+SHA-256 verificate prin --manifest înainte
// de import — fără fetch la INFP. În pachet, felia 2026 este fișierul vid al răspunsului
// 204, deci offline o felie vidă se înregistrează inconcludentă, nu „fără cutremure".
const argValue=flag=>{const i=process.argv.indexOf(flag);return i>=0&&i+1<process.argv.length?process.argv[i+1]:null};
const inputDir=argValue('--input-dir')||argValue('--source-dir');
const manifestPath=argValue('--manifest');
if(inputDir&&!manifestPath)throw Error('Modul local --input-dir cere --manifest (pachetul de probe verificate, cu amprentele SHA-256).');
if(inputDir)await validateFixtureManifest({manifestPath,inputDir,names:['eida-stations.txt',...YEARS.map(year=>'eida-events-'+year+'.txt')]});

const fetchSlice=async url=>{const response=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(55000)});if(!response.ok)throw Error('HTTP '+response.status+' de la '+url);return {httpStatus:response.status,text:await response.text()}};
const readFixture=name=>readFile(join(inputDir,name),'utf8');

const stationsText=inputDir?await readFixture('eida-stations.txt'):await fetchSlice(STATION_URL).then(slice=>slice.text);
const parsedStations=parseFdsnStations(stationsText);
if(parsedStations.invalid.length)throw Error('Lista stațiilor RO are rânduri invalide: '+parsedStations.invalid.map(row=>'linie '+row.line+' — '+row.reason).join('; ')+'.');
const stations=parsedStations.rows;
if(stations.length<140)throw Error('Lista stațiilor RO are '+stations.length+' rânduri, sub pragul de gardă față de 150 auditate.');

const events=[];const truncatedYears=[];const coverageByYear=[];
for(const year of YEARS){
  const url=EVENTS_URL+'?starttime='+year+'-01-01&endtime='+(year+1)+'-01-01&minlatitude=43&maxlatitude=49&minlongitude=20&maxlongitude=30&minmagnitude=3&format=text&limit='+LIMIT;
  let slice={httpStatus:0,text:''};
  if(inputDir)slice={httpStatus:0,text:await readFixture('eida-events-'+year+'.txt')};
  else slice=await fetchSlice(url);
  const parsed=parseFdsnEvents(slice.text);
  if(parsed.invalid.length)throw Error('Felia '+year+' are rânduri invalide: '+parsed.invalid.map(row=>'linie '+row.line+' — '+row.reason).join('; ')+'.');
  const yearRows=parsed.rows.filter(row=>row.time.slice(0,4)===String(year));
  if(parsed.rows.length>=LIMIT)truncatedYears.push(year);
  const inconclusive=slice.httpStatus===204||(inputDir&&!slice.text.trim());
  coverageByYear.push({year,status:inconclusive?'inconclusive_204':'returned_rows',rows:yearRows.length,...(slice.httpStatus?{httpStatus:slice.httpStatus}:{})});
  events.push(...yearRows);
}
if(events.length<700)throw Error('Evenimentele istorice M3+ sunt '+events.length+', sub pragul de gardă față de ~1.100 auditate.');

const fetchedAt=new Date().toISOString();
const files=[];
const payload={schema:'aflivra-eida-v2',sourceUrl:'https://infp.ro/ — FDSN web services (EIDA)',stationUrl:STATION_URL,eventUrlPattern:EVENTS_URL+'?starttime=…&minmagnitude=3&limit='+LIMIT,
 window:{from:YEARS[0]+'-01-01',to:YEARS.at(-1)+'-12-31',minMagnitude:3,minLatitude:43,maxLatitude:49,minLongitude:20,maxLongitude:30,note:'Fereastra commit-ată; evenimentele în afara ei nu se pretind inexistente.'},
 coverageByYear,
 bboxNote:'Dreptunghiul 43–49°N / 20–30°E nu definește exclusiv teritoriul României.',
 truncatedYears,fetchedAt,license:'parțial — licențele rețelelor se păstrează separat',
 licenseNote:'Date seismologice INFP/EIDA (eida-sc3.infp.ro); licențele rețelelor și produselor se păstrează separat; reutilizarea comercială neconfirmată la '+fetchedAt.slice(0,10)+'.',
 counts:{stations:stations.length,events:events.length,eventsByYear:Object.fromEntries(YEARS.map(year=>[year,events.filter(event=>event.time.slice(0,4)===String(year)).length]))},
 stations,events};
const {skipped}=await writeSnapshotIfChanged(files,'/eida/seismic.json',payload,{contentKeys:['stations','events','truncatedYears']});
await registerPrefix(files,'/eida/');
console.log(JSON.stringify({result:'ok',stations:stations.length,events:events.length,truncatedYears,coverageByYear,skipped}));