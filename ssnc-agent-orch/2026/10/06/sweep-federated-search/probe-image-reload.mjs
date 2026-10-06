// Phase 1 probe: reproduce the explore-view image reload loop after page refresh.
// Instruments network (per-URL image request counts over time) and DOM (img element
// add/remove serials + src attribute mutations) to classify the loop:
// (a) same <img> re-fetching, (b) remount loop, (c) onError retry, (d) state loop,
// (e) poll re-keying, (f) CSS-only flicker, (g) search/geo re-key interaction.
import {chromium} from '@playwright/test';

const BASE='http://localhost:5173';
const OUT=process.argv[2]||'probes/image-reload-run1.json';

const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:800}});

// Script state, re-checked at every phase boundary.
const events={requests:[],imgAdded:[],imgRemoved:[],srcChanged:[],apiPlaces:[]};

await context.addInitScript(()=>{
  window.__imgProbe={serial:0,added:[],removed:[],srcChanged:[],t0:performance.now()};
  const now=()=>Math.round(performance.now()-window.__imgProbe.t0);
  const where=n=>n.closest('.places-workspace')?'places':n.closest('.exploration-gallery')?'gallery':n.closest('.public-media-gallery')?'media':n.closest('.entity-card')?'entity':'other';
  const tag=n=>{if(!n||n.tagName!=='IMG'||n.dataset.__imgSerial)return;n.dataset.__imgSerial=String(++window.__imgProbe.serial);window.__imgProbe.added.push({t:now(),serial:n.dataset.__imgSerial,src:(n.getAttribute('src')||'').slice(0,140),where:where(n)})};
  const untag=n=>{if(!n||n.tagName!=='IMG')return;window.__imgProbe.removed.push({t:now(),serial:n.dataset.__imgSerial||'?',src:(n.getAttribute('src')||'').slice(0,140),where:where(n)})};
  const walk=(n,fn)=>{if(!n||n.nodeType!==1)return;if(n.tagName==='IMG')fn(n);else if(n.querySelectorAll)for(const i of n.querySelectorAll('img'))fn(i)};
  new MutationObserver(muts=>{for(const m of muts){
    if(m.type==='childList'){for(const n of m.addedNodes)walk(n,tag);for(const n of m.removedNodes)walk(n,untag)}
    else if(m.type==='attributes'&&m.attributeName==='src'&&m.target.tagName==='IMG'){window.__imgProbe.srcChanged.push({t:now(),serial:m.target.dataset.__imgSerial||'?',from:(m.oldValue||'').slice(0,140),to:(m.target.getAttribute('src')||'').slice(0,140)})}
  }}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
});

const page=await context.newPage();
const t0=Date.now();
const isImageReq=r=>r.type==='image'||/\.(webp|jpe?g|png|gif|avif)(?:\?|$)/i.test(r.url);
page.on('request',r=>{events.requests.push({t:Date.now()-t0,type:r.resourceType(),method:r.method(),url:r.url().slice(0,180)})});
page.on('response',async r=>{try{if(r.url().includes('/api/places')){const j=await r.json();events.apiPlaces.push({t:Date.now()-t0,status:j.status,dataStatus:j.data&&j.data.status||null,nextAttemptAt:j.nextAttemptAt,err:j.error||null})}}catch{}});

const imgState=()=>page.evaluate(()=>{const out={gallery:[],entity:[]};
  for(const img of document.querySelectorAll('.exploration-gallery img'))out.gallery.push({s:img.dataset.__imgSerial||'?',src:(img.currentSrc||img.src||'').slice(0,120),w:img.naturalWidth,ok:img.complete&&img.naturalWidth>0});
  for(const img of document.querySelectorAll('.places-workspace .entity-card img'))out.entity.push({s:img.dataset.__imgSerial||'?',src:(img.currentSrc||img.src||'').slice(0,120),w:img.naturalWidth,ok:img.complete&&img.naturalWidth>0});
  out.cards=document.querySelectorAll('.places-workspace .entity-card').length;out.busy=!!document.querySelector('.places-workspace [role=status]');
  return out});

async function settle(label,timeout=45000){
  const start=Date.now();
  while(Date.now()-start<timeout){
    if(await page.evaluate(()=>localStorage.getItem('reper.v2.preferences')!==null&&document.querySelectorAll('.places-workspace .entity-card').length>0))return true;
    await page.waitForTimeout(500);
  }
  console.log('SETTLE TIMEOUT',label);return false;
}

console.log('== phase A: load /#view=explore');
await page.goto(BASE+'/#view=explore',{waitUntil:'domcontentloaded'});
await settle('A-load');
// The user's surface: places with images — the "Cu fotografii publicate" photos filter.
const filter=page.locator('.places-workspace .entity-filters label').filter({hasText:'Imagini'});
await filter.locator('select').selectOption('photos');
await page.waitForTimeout(4000);
console.log('== phase B: refresh (the reported trigger)');
const beforeReload=await page.evaluate(()=>({serial:window.__imgProbe.serial,added:window.__imgProbe.added.length}));
await page.reload({waitUntil:'domcontentloaded'});
await settle('B-post-reload');
await page.waitForTimeout(2500);
const settleT=Date.now()-t0;
console.log('== phase C: observation window (75s) from t='+settleT+'ms');

const samples=[];
for(let i=0;i<15;i++){
  await page.waitForTimeout(5000);
  const s=await imgState();samples.push({t:Date.now()-t0,...s});
  const images=events.requests.filter(isImageReq);
  console.log(`t+${samples[i].t}ms cards=${s.cards} galleryImgs=${s.gallery.length} entityImgs=${s.entity.length} imgsOk=${s.entity.filter(x=>x.ok).length}/${s.entity.length} imgReqs=${images.length} apiPlaces=${events.apiPlaces.length}`);
}
const probe=await page.evaluate(()=>({serial:window.__imgProbe.serial,added:window.__imgProbe.added,removed:window.__imgProbe.removed,srcChanged:window.__imgProbe.srcChanged}));
const summary={
  settleT,beforeReload,
  requestTotals:{all:events.requests.length,images:events.requests.filter(isImageReq).length,api:events.requests.filter(r=>r.url.includes('/api/')).length},
  apiPlaces:events.apiPlaces,
  imgAddedInWindow:probe.added.filter(x=>x.t>settleT-5000),
  imgRemovedInWindow:probe.removed.filter(x=>x.t>settleT-5000),
  srcChanged:probe.srcChanged,
  imgAddedAll:probe.added.slice(-80),imgRemovedTail:probe.removed.slice(-40),
  duplicateImageRequests:(()=>{
    const c=new Map();
    for(const r of events.requests)if(isImageReq(r))c.set(r.url,(c.get(r.url)||0)+1);
    return [...c.entries()].filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]);
  })(),
  apiRequestTimeline:events.requests.filter(r=>r.url.includes('/api/')).map(r=>({t:r.t,url:r.url.slice(0,120)})),
  samples
};
const fs=await import('node:fs');
fs.writeFileSync(OUT,JSON.stringify({events,probe,summary},null,1));
console.log('== duplicated image URLs (count>1):');
for(const [url,n] of summary.duplicateImageRequests.slice(0,15))console.log(' ',n+'x',url.slice(0,130));
console.log('== img added total:',probe.added.length,'removed total:',probe.removed.length,'srcChanged total:',probe.srcChanged.length);
console.log('== img added after settle:',summary.imgAddedInWindow.length,'removed after settle:',summary.imgRemovedInWindow.length);
console.log('== written',OUT);
await context.close();await browser.close();
