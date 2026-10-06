// Phase 1 probe run 2: mobile + saved device location + drifting GPS fixes (watchPosition).
// Reproduces a phone user who granted geolocation: refresh keeps watchPosition alive,
// fixes drift by ~100m, geo.key flips at toFixed(3) granularity -> observe images.
import {chromium} from '@playwright/test';

const BASE='http://localhost:5173';
const OUT=process.argv[2]||'probes/image-reload-run2.json';

const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:44.4368,longitude:26.1025},accuracy:85});

const state={requests:[],apiPlaces:[],geoLog:[],hashLog:[]};

await context.addInitScript(()=>{
  try{localStorage.setItem('aflivra.location.v1',JSON.stringify({mode:'device'}));}catch{}
  window.__imgProbe={serial:0,added:[],removed:[],srcChanged:[],t0:performance.now()};
  const now=()=>Math.round(performance.now()-window.__imgProbe.t0);
  const where=n=>n.closest('.places-workspace')?'places':n.closest('.exploration-gallery')?'gallery':n.closest('.public-media-gallery')?'media':n.closest('.entity-card')?'entity':'other';
  const tag=n=>{if(!n||n.tagName!=='IMG'||n.dataset.__imgSerial)return;n.dataset.__imgSerial=String(++window.__imgProbe.serial);window.__imgProbe.added.push({t:now(),serial:n.dataset.__imgSerial,src:(n.getAttribute('src')||'').slice(0,140),where:where(n)})};
  const untag=n=>{if(!n||n.tagName!=='IMG')return;window.__imgProbe.removed.push({t:now(),serial:n.dataset.__imgSerial||'?',src:(n.getAttribute('src')||'').slice(0,140),where:where(n)})};
  const walk=(n,fn)=>{if(!n||n.nodeType!==1)return;if(n.tagName==='IMG')fn(n);else if(n.querySelectorAll)for(const i of n.querySelectorAll('img'))fn(i)};
  new MutationObserver(muts=>{for(const m of muts){
    if(m.type==='childList'){for(const n of m.addedNodes)walk(n,tag);for(const n of m.removedNodes)walk(n,untag)}
    else if(m.type==='attributes'&&m.attributeName==='src'&&m.target.tagName==='IMG'){window.__imgProbe.srcChanged.push({t:now(),serial:m.target.dataset.__imgSerial||'?',from:(m.oldValue||'').slice(0,140),to:(m.target.getAttribute('src')||'').slice(0,140)})}
  }}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
});

const page=await context.newPage();
const t0=Date.now();
const isImageReq=r=>r.type==='image'||/\.(webp|jpe?g|png|gif|avif)(?:\?|$)/i.test(r.url);
page.on('request',r=>{state.requests.push({t:Date.now()-t0,type:r.resourceType(),method:r.method(),url:r.url().slice(0,180)})});
page.on('response',async r=>{try{if(r.url().includes('/api/places')){const j=await r.json();state.apiPlaces.push({t:Date.now()-t0,status:j.status,next:j.nextAttemptAt||null,total:j.data&&j.data.total||null})}}catch{}});

const snapshot=async label=>{
  const p=await page.evaluate(()=>{
    const imgs=[...document.querySelectorAll('.places-workspace .entity-card img,.exploration-gallery img')].map(i=>({s:i.dataset.__imgSerial||'?',src:(i.currentSrc||i.src||'').slice(0,110),ok:i.complete&&i.naturalWidth>0}));
    const loc=JSON.parse(localStorage.getItem('aflivra.location.v1')||'{}');
    return{serial:window.__imgProbe.serial,added:window.__imgProbe.added.length,removed:window.__imgProbe.removed.length,srcChanged:window.__imgProbe.srcChanged.length,imgs,cards:document.querySelectorAll('.places-workspace .entity-card').length,locMode:loc.mode,hash:location.hash.slice(0,60)};
  });
  console.log(label,JSON.stringify({t:Date.now()-t0,pserial:p.serial,added:p.added,removed:p.removed,srcChanged:p.srcChanged,cards:p.cards,imgsOk:p.imgs.filter(x=>x.ok).length,imgsN:p.imgs.length,hash:p.hash,reqs:state.requests.length,apiPlaces:state.apiPlaces.length}));
  return p;
};

console.log('== load /#view=explore (device mode saved)');
await page.goto(BASE+'/#view=explore',{waitUntil:'domcontentloaded'});
for(let i=0;i<90;i++){if(await page.evaluate(()=>localStorage.getItem('reper.v2.preferences')!==null&&document.querySelectorAll('.places-workspace .entity-card').length>0))break;await page.waitForTimeout(500)}
await snapshot('after mount');

console.log('== phase photos filter');
await page.locator('.places-workspace .entity-filters label').filter({hasText:'Imagini'}).locator('select').selectOption('photos');
await page.waitForTimeout(5000);
await snapshot('photos on');
// scroll to bottom of places workspace to trigger lazy images
await page.locator('.places-workspace').scrollIntoViewIfNeeded();
await page.mouse.wheel(0,1600);
await page.waitForTimeout(4000);
await snapshot('scrolled');

console.log('== refresh (user action)');
await page.reload({waitUntil:'domcontentloaded'});
for(let i=0;i<90;i++){if(await page.evaluate(()=>localStorage.getItem('reper.v2.preferences')!==null&&document.querySelectorAll('.places-workspace .entity-card').length>0))break;await page.waitForTimeout(500)}
await page.evaluate(()=>document.querySelector('.places-workspace')?.scrollIntoView({block:'start'}));
await page.waitForTimeout(3000);
const driftStart=Date.now()-t0;
await snapshot('post-reload');

console.log('== drift phase: geolocation fixes every 3s (~120m jitters) for 66s');
const jitters=[[44.4375,26.1025],[44.4362,26.1019],[44.4377,26.1031],[44.4364,26.1022],[44.4373,26.1016],[44.4366,26.1028],[44.4376,26.1020],[44.4363,26.1030],[44.4374,26.1018],[44.4367,26.1026],[44.4375,26.1024],[44.4364,26.1021],[44.4377,26.1027],[44.4363,26.1019],[44.4374,26.1031],[44.4368,26.1022],[44.4376,26.1029],[44.4365,26.1017],[44.4373,26.1025],[44.4366,26.1023],[44.4372,26.1019],[44.4369,26.1031]];
for(let i=0;i<jitters.length;i++){
  await context.setGeolocation({latitude:jitters[i][0],longitude:jitters[i][1],accuracy:40+i%3*20});
  await page.waitForTimeout(3000);
  if(i%4===3)await snapshot('drift'+(i+1));
}
const probe=await page.evaluate(()=>({serial:window.__imgProbe.serial,added:window.__imgProbe.added,removed:window.__imgProbe.removed,srcChanged:window.__imgProbe.srcChanged}));
const final=await snapshot('final');

const imgsAfterDrift=probe.added.filter(x=>x.t>0&&x.where!=='other');
const images=state.requests.filter(isImageReq);
const per=new Map();for(const r of images)per.set(r.url,(per.get(r.url)||0)+1);
const dup=[...per.entries()].filter(([,n])=>n>2).sort((a,b)=>b[1]-a[1]);

const fs=await import('node:fs');
fs.writeFileSync(OUT,JSON.stringify({state,probe,summary:{driftStart,dupAddedInDrift:imgsAfterDrift.length,removedInDrift:probe.removed.length,srcChangedInDrift:probe.srcChanged.length,duplicates:dup.slice(0,25),apiPlaces:state.apiPlaces}},null,1));
console.log('== img events during run: added',probe.added.length,'removed',probe.removed.length,'srcChanged',probe.srcChanged.length);
console.log('== added serials >1 per url (dup>2):');
for(const [u,n] of dup.slice(0,15))console.log(' ',n+'x',u.slice(0,120));
console.log('== /api/places fetches:',state.apiPlaces.length);
console.log('== written',OUT);
await context.close();await browser.close();
