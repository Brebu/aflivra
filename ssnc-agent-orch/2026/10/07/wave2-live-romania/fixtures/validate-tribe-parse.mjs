import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {pathToFileURL} from 'node:url';import ts from 'typescript';
const root='/Users/cbrebu/Projects/alfivra',temp=await mkdtemp(join(tmpdir(),'aflivra-events-parse-'));
try{
 for(const name of ['text','media','records','catalog-categories','query','adapters']){
  let src=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
  const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
  await writeFile(join(temp,name+'.mjs'),out);
 }
 let events=await readFile(join(root,'lib/live/events.ts'),'utf8');
 events=events.replace("import venuesCatalog from '@/public/events/venues.json';",'const venuesCatalog='+await readFile(join(root,'public/events/venues.json'),'utf8')+';');
 const out=ts.transpileModule(events,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('@/lib/http-retry.mjs',pathToFileURL(join(root,'lib/http-retry.mjs')).href).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
 await writeFile(join(temp,'events.mjs'),out);
 const mod=await import(pathToFileURL(join(temp,'events.mjs')));
 const venue=mod.eventVenue('operacluj');
 console.log('venue resolved:',!!venue,venue&&venue.name);
 const raw=await readFile('/Users/cbrebu/Projects/alfivra/ssnc-agent-orch/2026/10/07/wave2-live-romania/fixtures/operacluj-tribe-events-v1.txt','utf8');
 const body=raw.slice(raw.indexOf('{"events"'));
 const loaded=mod.parseTribeEvents(body,venue);
 const d=loaded.data;
 console.log('parsed items:',d.items.length,'| publishedTotal:',d.publishedTotal);
 console.log('first 3:',JSON.stringify(d.items.slice(0,3).map(x=>({id:x.id,title:x.title,start:x.start,end:x.end,url:x.url.slice(0,70),ticketUrl:x.ticketUrl||null,category:x.category||null,image:x.media[0]&&x.media[0].url.slice(0,60),credit:x.media[0]&&x.media[0].credit})),null,1).slice(0,1300));
 const en=d.items.filter(x=>x.url.includes('/en/')).length;
 console.log('EN editions filtered:',en,'(fixture page had both languages present)');
 const odeonHtml='<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Spectacol de verificare","startDate":"2026-10-06T19:30:00","url":"https://teatrul-odeon.ro/spectacol/verificare","location":{"@type":"Place","name":"Sala Mare"}}</script></head><body></body></html>';
 const odeonLoaded=mod.parseEvents(odeonHtml);
 console.log('odeon single-arg parse: items='+odeonLoaded.data.items.length,'start='+odeonLoaded.data.items[0].start,'venue='+odeonLoaded.data.venue.id,'key='+mod.odeonLoader.key,'version='+mod.odeonLoader.version);
 console.log('eventsLoader keys:',mod.eventVenues.map(v=>mod.eventsLoader(v).key).join(', '));
}finally{await rm(temp,{recursive:true,force:true})}
