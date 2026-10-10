// FDSN text services (INFP/EIDA) — the header line is the column contract: parsing maps
// every column by the header's own labels, a changed header stops the import instead of
// parsing on a silent band shift, comment lines (#) never become rows, and an invalid
// row is reported (line + reason), never dropped unobserved. Standard library only.
const STATION={labels:['Network','Station','Latitude','Longitude','Elevation','SiteName','StartTime','EndTime'],keys:['network','station','latitude','longitude','elevation','siteName','startTime','endTime'],lineLabel:'stații',numeric:['latitude','longitude','elevation'],required:['network','station']};
const EVENT={labels:['EventID','Time','Latitude','Longitude','Depth/km','Author','Catalog','Contributor','ContributorID','MagType','Magnitude','MagAuthor','EventLocationName','EventType'],keys:['eventIdentifier','time','latitude','longitude','depthKm','author','catalog','contributor','contributorIdentifier','magnitudeType','magnitude','magnitudeAuthor','eventLocationName','eventType'],lineLabel:'evenimente',numeric:['latitude','longitude','depthKm','magnitude',],required:['eventIdentifier','time']};
const TIME_SHAPE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function parseFdsnText(text,spec){
 const lines=String(text??'').split('\n');
 let headerSeen=false;
 const rows=[],invalid=[];
 for(let index=0;index<lines.length;index++){
  const line=lines[index].trimEnd();
  if(!line.trim())continue;
  if(line.startsWith('#')){
   if(headerSeen)continue;
   const labels=line.slice(1).split('|').map(field=>field.trim());
   if(labels.join('|')!==spec.labels.join('|'))throw Error('Antetul serviciului FDSN de '+spec.lineLabel+' s-a schimbat („'+labels.join('|')+'”) — importul se oprește până la revizuirea mapării.');
   headerSeen=true;continue;
  }
  if(!headerSeen){invalid.push({line:index+1,reason:'rând de date înainte de antet'});continue}
  const fields=line.split('|').map(field=>field.trim());
  if(fields.length!==spec.labels.length){invalid.push({line:index+1,reason:fields.length+' coloane în loc de '+spec.labels.length});continue}
  const row=Object.fromEntries(spec.keys.map((key,position)=>[key,fields[position]??'']));
  const badNumber=spec.numeric.find(key=>row[key]!==''&&!Number.isFinite(Number(row[key])));
  if(badNumber||spec.required.some(key=>!row[key])||!TIME_SHAPE.test(row.time??'1970-01-01T00:00:00')){
   invalid.push({line:index+1,reason:badNumber?'coloana '+badNumber+' nu este numerică ('+row[badNumber]+')':'rândul nu conține identificatorul, timpul sau forma de timp așteptată'});
   continue;
  }
  rows.push(row);
 }
 return {rows,invalid};
}

export function parseFdsnStations(text){return parseFdsnText(text,STATION)}
export function parseFdsnEvents(text){return parseFdsnText(text,EVENT)}
