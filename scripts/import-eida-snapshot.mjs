// Offline corpus import for INFP/EIDA seismic data: the RO network station list
// (FDSN station service, text format) and the felt-earthquake history (FDSN event
// service, magnitude ≥ 3 inside the audited bbox 43–49°N / 20–30°E, sliced per year
// because the service caps responses at the limit parameter). The committed window is
// declared in the corpus and served verbatim — the 2026 rows to date are empty but the
// import never infers "no earthquakes" beyond what the slices returned. Current-alert
// querying is NOT served from this corpus: the 204 responses on recent windows were
// inconclusive at audit, so this stays history and infrastructure only.
// Run from the repo root: node scripts/import-eida-snapshot.mjs
import {writeSnapshot,registerPrefix} from './snapshot-register.mjs';

const UA='Aflivra-Integration-Evaluation/1.0';
const STATION_URL='https://eida-sc3.infp.ro/fdsnws/station/1/query?net=RO&level=station&format=text';
const EVENTS_URL='https://eida-sc3.infp.ro/fdsnws/event/1/query';
const YEARS=[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];
const LIMIT=1000;

const fetchText=async url=>{const response=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(55000)});if(!response.ok)throw Error('HTTP '+response.status+' de la '+url);return response.text()};

const parseFdsnText=(text,columns)=>{
 if(!text.trim())return [];
 return text.trim().split('\n').map(line=>line.split('|').map(field=>field.trim())).filter(fields=>fields.length>=columns.length).map(fields=>Object.fromEntries(columns.map((column,i)=>[column,fields[i]??''])));
};

const stationsText=await fetchText(STATION_URL);
const stations=parseFdsnText(stationsText,['network','station','latitude','longitude','elevation','siteName','startTime','endTime']);
if(stations.length<100)throw Error('Lista stațiilor RO are '+stations.length+' rânduri, sub pragul de gardă față de 150 auditate.');

const events=[];const truncatedYears=[];
for(const year of YEARS){
 const url=EVENTS_URL+'?starttime='+year+'-01-01&endtime='+(year+1)+'-01-01&minlatitude=43&maxlatitude=49&minlongitude=20&maxlongitude=30&minmagnitude=3&format=text&limit='+LIMIT;
 const text=await fetchText(url);
 const rows=parseFdsnText(text,['eventIdentifier','time','latitude','longitude','depthKm','author','catalog','contributor','contributorIdentifier','eventType','magnitude','magnitudeType','magnitudeAuthor','eventLocationName']);
 const yearRows=rows.filter(row=>row.time.slice(0,4)===String(year));
 if(rows.length>=LIMIT)truncatedYears.push(year);
 events.push(...yearRows);
}
if(events.length<700)throw Error('Evenimentele istorice M3+ sunt '+events.length+', sub pragul de gardă față de ~1.100 auditate.');

const fetchedAt=new Date().toISOString();
const files=[];
const payload={schema:'aflivra-eida-v1',sourceUrl:'https://infp.ro/ — FDSN web services (EIDA)',stationUrl:STATION_URL,eventUrlPattern:EVENTS_URL+'?starttime=…&minmagnitude=3&limit='+LIMIT,
 window:{from:YEARS[0]+'-01-01',to:YEARS.at(-1)+'-12-31',minMagnitude:3,minLatitude:43,maxLatitude:49,minLongitude:20,maxLongitude:30,note:'Fereastra commit-ată; evenimentele în afara ei nu se pretind inexistente.'},
 bboxNote:'Dreptunghiul 43–49°N / 20–30°E nu definește exclusiv teritoriul României.',
 truncatedYears,fetchedAt,license:'parțial — licențele rețelelor se păstrează separat',
 licenseNote:'Date seismologice INFP/EIDA (eida-sc3.infp.ro); licențele rețelelor și produselor se păstrează separat; reutilizarea comercială neconfirmată la '+fetchedAt.slice(0,10)+'.',
 counts:{stations:stations.length,events:events.length,eventsByYear:Object.fromEntries(YEARS.map(year=>[year,events.filter(event=>event.time.slice(0,4)===String(year)).length]))},
 stations,events};
await writeSnapshot(files,'/eida/seismic.json',payload);
await registerPrefix(files,'/eida/');
console.log(JSON.stringify({result:'ok',stations:stations.length,events:events.length,truncatedYears}));
