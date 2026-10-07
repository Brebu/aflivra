import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {readSnapshotFile} from './snapshot-read.mjs';
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),root=new URL('../',import.meta.url);
let media;
function compile(file,h=React){
 const code=ts.transpileModule(fs.readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,module={exports:{}};
 const resolve=name=>name==='react'?h:name==='react/jsx-runtime'?jsx:name.endsWith('/media')||name==='./media'?media:name==='./text'?compile('lib/live/text.ts'):name==='./adapters'?{getSource(){throw Error('Fixture must not fetch')},SourceError:Error}:name.endsWith('/cinemas.json')?require('../public/cinema/cinemas.json'):name==='lucide-react'?new Proxy({},{get:(_,key)=>String(key)}):name.endsWith('/button')?{Button:'Button'}:require(name);
 new Function('require','module','exports',code)(resolve,module,module.exports);return module.exports;
}
media=compile('lib/live/media.ts');
for(const url of ['https://youtu.be/seiqJySc2Wg','https://www.youtube.com/watch?v=seiqJySc2Wg','https://m.youtube.com/watch?v=seiqJySc2Wg','https://www.youtube-nocookie.com/embed/seiqJySc2Wg','https://www.youtube.com/shorts/seiqJySc2Wg'])assert.equal(media.youtubeVideoId(url),'seiqJySc2Wg');
for(const url of ['https://youtube.com.evil.test/watch?v=seiqJySc2Wg','javascript:alert(1)','https://user:password@youtube.com/watch?v=seiqJySc2Wg','https://www.youtube.com/watch?v=invalid'])assert.equal(media.embeddedMedia(url),null);
const tagged=media.recordMedia({wikimedia_commons:'File:Cascada Bigar.JPG',name:'Cascada Bigăr'},'https://www.openstreetmap.org/way/1201727812');
assert.equal(tagged.length,1,'A record tagged with a Commons File: must yield exactly one gallery image');assert.equal(tagged[0].kind,'image');assert(tagged[0].url.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/Cascada%20Bigar.JPG?width=720'),'The Commons File: tag must render as a Special:FilePath thumbnail');assert.equal(tagged[0].sourceUrl,'https://www.openstreetmap.org/way/1201727812');
assert.equal(media.recordMedia({wikimedia_commons:'Category:Bigăr waterfall'},'').length,0,'A Commons Category: tag is a link, not gallery media');
assert.equal(media.recordMedia({'Nume furnizor':'Spital X','Judet PJ':'Alba'},'').length,0,'Registry rows without remote media stay unchanged');
const embedded=media.embeddedMedia('https://www.youtube.com/watch?v=seiqJySc2Wg','https://reper-romania.xywex.chatgpt.site/path'),url=new URL(embedded.url);
assert.equal(url.searchParams.get('origin'),'https://reper-romania.xywex.chatgpt.site');assert.equal(url.searchParams.get('enablejsapi'),'1');assert.equal(embedded.watchUrl,'https://www.youtube.com/watch?v=seiqJySc2Wg');
const {parseCinema}=compile('lib/live/cinema.ts'),seed=JSON.parse(await readSnapshotFile(fileURLToPath(new URL('lib/live/server-seed.json',root)),'utf8'));let projections=0;
for(const [key,source]of Object.entries(seed).filter(([k])=>k.startsWith('cinema:'))){
 const [,id,date]=key.split(':'),data=parseCinema(JSON.stringify({body:source.data.metadata}),id,date).data;
 assert.equal(data.eventCount,source.data.eventCount);projections+=data.eventCount;
 for(const film of data.films)for(const item of film.media.filter(m=>m.kind==='embed')){assert.equal(item.watchUrl,media.embeddedMedia(film.videoLink).watchUrl);assert(item.url.includes('enablejsapi=1'))}
}
console.log('Exact current cinema snapshots verified: '+projections+' projections; trailer identifiers, canonical watch links, provider allowlist and origin configuration.');
const walk=node=>[node,...React.Children.toArray(node?.props?.children).flatMap(c=>React.isValidElement(c)?walk(c):[])];
const timers=new Map();let timerId=0;
const saved={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
globalThis.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId};globalThis.clearTimeout=id=>timers.delete(id);
const scripts=[],players=[];
globalThis.document={createElement(tag){return{tag,attributes:{},setAttribute(k,v){this.attributes[k]=v},remove(){this.removed=true}}},head:{appendChild(script){scripts.push(script)}}};
globalThis.window={location:{origin:'https://reper-romania.xywex.chatgpt.site'},YT:{Player:class{constructor(iframe,options){this.iframe=iframe;this.events=options.events;players.push(this)}destroy(){this.destroyed=true}}}};
function host(){let slots=[],cursor=0,effects=[],cleanups=[];const h={...React,
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next]},
 useRef(initial){const i=cursor++;return slots[i]??={current:initial}},
 useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,k)=>!Object.is(d,old[k]))){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}},
 render(fn){cursor=0;const result=fn();for(const node of walk(result))if(node?.props?.ref&&!node.props.ref.current)node.props.ref.current={children:[],replaceChildren(...nodes){this.children=nodes}};const pending=effects;effects=[];pending.forEach(fn=>fn());return result},
 destroy(){cleanups.forEach(fn=>fn?.())}};return h;
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};
try{
 const h=host(),{EmbeddedVideo}=compile('app/embedded-video.tsx',h),item={kind:'embed',url:'https://www.youtube-nocookie.com/embed/seiqJySc2Wg',sourceUrl:'https://www.cinemacity.ro/films/coyote-vs-acme/8352s2r',caption:'Trailer'};
 const render=()=>h.render(()=>EmbeddedVideo({item,title:'Coyote vs. Acme'})),button=()=>walk(render()).find(n=>n.type==='Button'),hostNode=()=>walk(render()).find(n=>n.props?.className==='video-player-host').props.ref.current;
 render();assert.equal(players.length,0,'Opening the dialog must not start a third-party player');
 button().props.onClick();render();await flush();assert.equal(players.length,1);
 assert.equal(players[0].iframe.referrerPolicy,'strict-origin-when-cross-origin');assert(players[0].iframe.allow.includes('encrypted-media'));players[0].events.onReady();render();assert.equal(timers.size,0);
 players[0].events.onError({data:101});const failed=render();assert(players[0].destroyed);assert.equal(hostNode().children.length,0);assert(walk(failed).some(n=>n.props?.role==='status'));assert(walk(failed).some(n=>n.type==='a'&&n.props.href==='https://www.youtube.com/watch?v=seiqJySc2Wg'));
 button().props.onClick();render();await flush();assert.equal(players.length,2);const pending=[...timers.values()].find(t=>t.ms===12000);pending.fn();render();assert(players[1].destroyed,'Timed-out player must be released');assert.equal(hostNode().children.length,0);
 button().props.onClick();render();await flush();h.destroy();assert(players[2].destroyed);players[2].events.onReady();assert.equal(timers.size,0);
 delete window.YT;const h2=host(),module2=compile('app/embedded-video.tsx',h2),render2=()=>h2.render(()=>module2.EmbeddedVideo({item,title:'Coyote vs. Acme'}));walk(render2()).find(n=>n.type==='Button').props.onClick();render2();assert.equal(scripts.length,1);h2.destroy();window.YT={Player:class{constructor(){throw Error('Closed dialog must not mount a late player')}}};window.onYouTubeIframeAPIReady();await flush();assert.equal(timers.size,0);
 console.log('Actual player hook verified: no initial external request; ready/error/timeout, explicit retry, close cleanup and cancelled late API response. React never owns the provider iframe.');
}finally{Object.assign(globalThis,saved)}
const places=JSON.parse(fs.readFileSync(new URL('public/places/exploration.json',root))),manifest=JSON.parse(fs.readFileSync(new URL('public/media/manifest.json',root))),report=JSON.parse(fs.readFileSync(new URL('public/places/exploration-import.json',root))),ids=new Set(),recordsSeen=new Set(),photoBytes=new Map(manifest.assets.map(a=>[a.app_id,a]));
const MAX_PHOTOS_PER_PLACE=3,MAX_VIDEO_FILES=100,MAX_VIDEO_BYTES=15*1024*1024,HARD_FILE_BYTES=25*1024*1024;
assert.equal(places.length,report.places,'The import report and the exported selection must state one place count');
assert(places.length>=267,'The widened all-category Commons selection must anchor at least 267 photographed places');
assert(manifest.assets.length>=610,'The widened selection with the WLM curation must keep at least 610 full-attribution manifest rows');
assert(places.length===new Set(places.map(p=>p.recordId)).size,'One anchored record per exported place');
let photoTotal=0,videoTotal=0,videoBytes=0;const videosByPlace=[],overPreferred=[];
for(const place of places){
  assert(!ids.has(place.id));ids.add(place.id);const record=JSON.parse(await readSnapshotFile(fileURLToPath(new URL('public/places/records/'+place.recordChunk+'.json',root)))).items.find(r=>r.id===place.recordId);
  assert(record);recordsSeen.add(record.id);assert.equal(place.name,record.name);assert.equal(place.lat,record.lat);assert.equal(place.lon,record.lon);assert.equal(place.sourceUrl,record.sourceUrl);
  assert(place.images.length>=1&&place.images.length<=MAX_PHOTOS_PER_PLACE,'Per-place photo curation cap of '+MAX_PHOTOS_PER_PLACE);
  for(const id of place.images){const asset=photoBytes.get(id);assert(asset?.author&&asset.license&&asset.license_url&&asset.source_page_url,'Attribution completeness for '+id);const bytes=fs.readFileSync(new URL('public/media/'+id+'.webp',root));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert(asset.bytes===bytes.length);photoTotal++;
    if(asset.wlm){assert(asset.wlm.monument&&asset.wlm.lmi&&asset.wlm.dataset&&asset.wlm.datasetLicense,'WLM provenance completeness for '+id);assert.equal(asset.source_record,place.sourceUrl)}}
  for(const id of place.videos||[]){const asset=photoBytes.get(id);assert(asset?.role==='video'&&asset.author&&asset.license&&asset.license_url&&asset.source_page_url,'Video provenance completeness for '+id);const bytes=fs.readFileSync(new URL('public/media/'+asset.app_file.replace('/media/',''),root));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert(asset.bytes===bytes.length);assert(bytes.length<HARD_FILE_BYTES,'ASSETS hard ceiling 25 MiB for '+id);videoTotal++;videoBytes+=bytes.length;videosByPlace.push({place:place.id,video:id,bytes:asset.bytes,license:asset.license});if(bytes.length>MAX_VIDEO_BYTES)overPreferred.push(id+' '+bytes.length)}
  assert((place.videos||[]).length<=1,'At most one video per place this wave');
}
assert(videoTotal>=1,'The webm video tier must ship at least one licensed clip');assert(videoTotal<=MAX_VIDEO_FILES,'Video file cap of '+MAX_VIDEO_FILES);
const wlmAssets=manifest.assets.filter(a=>a.wlm);
assert(wlmAssets.length>=50,'The WLM curation tier must contribute at least 50 attested photos');
const localAssets=manifest.assets.filter(a=>/^(?:explore|wlm|video)-/.test(a.app_id)),referenced=new Set(places.flatMap(p=>[...p.images,...(p.videos||[])]));
for(const asset of localAssets)assert(referenced.has(asset.app_id),'No orphan local asset without a render path: '+asset.app_id);
const model=fs.readFileSync(new URL('app/v2-model.ts',root),'utf8'),page=fs.readFileSync(new URL('app/page.tsx',root),'utf8');
assert(model.includes('[...originalPlaces,...expandedPlaces]'));assert(page.includes('Locuri cu galerii'));assert(!page.includes('<PlacesWorkspace category="cultura" photosDefault'));
console.log(places.length+' anchored photographed destinations verified against exact national records ('+photoTotal+' local photos, '+wlmAssets.length+' from the Wiki Loves Monuments curation, '+videoTotal+' webm clips · '+videoBytes.toLocaleString()+' bytes); per-place caps, video size ceiling, authors, licenses, SHA-256 proofs and explorer navigation. Original editorial selection: 6. Total with editorial: '+(places.length+6)+'.');
if(videosByPlace.length)console.log('Video clips: '+videosByPlace.map(v=>v.video+' '+v.bytes+' bytes ('+v.license+')').join(' · '));
if(overPreferred.length)console.log('Videos over the 15 MiB preferred band, shipped under the 25 MiB hard ceiling (smallest relevant clip per place): '+overPreferred.join(', '));
