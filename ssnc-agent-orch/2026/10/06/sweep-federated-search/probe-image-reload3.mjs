// Phase 1 probe run 3 (isolation, no geolocation): prove the mechanism.
// A) CONTROL: PlacesWorkspace-internal state (sort select) must NOT remount gallery imgs.
// B) ONE Aflivra state change (search input -> setQ) MUST remount all 12 gallery imgs
//    if and only if PlaceCard/SaveButton component identity churns per render.
// C) reload, then 75s still observation: spontaneous burst census (api/live arrival,
//    useLiveData 60s interval poll) without device geolocation.
import {chromium} from '@playwright/test';

const BASE='http://localhost:5173';
const OUT=process.argv[2]||'probes/image-reload-run3.json';

const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:800}});
await context.addInitScript(()=>{
  try{localStorage.removeItem('aflivra.location.v1')}catch{}
  window.__imgProbe={serial:0,added:[],removed:[],srcChanged:[],t0:performance.now()};
  const now=()=>Math.round(performance.now()-window.__imgProbe.t0);
  const where=n=>n.closest('.places-workspace')?'places':n.closest('.exploration-gallery')?'gallery':n.closest('.public-media-gallery')?'media':'other';
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
const requests=[];
page.on('request',r=>requests.push({t:Date.now()-t0,type:r.resourceType(),url:r.url().slice(0,180)}));
const counts=()=>page.evaluate(()=>({serial:window.__imgProbe.serial,added:window.__imgProbe.added.length,removed:window.__imgProbe.removed.length,srcChanged:window.__imgProbe.srcChanged.length,gallery:window.__imgProbe.added.filter(x=>x.where==='gallery').length,places:window.__imgProbe.added.filter(x=>x.where==='places').length}));
const delta=(a,b)=>({added:b.added-a.added,removed:b.removed-a.removed,srcChanged:b.srcChanged-a.srcChanged,galleryAdded:b.gallery-a.gallery,placesAdded:b.places-a.places});

await page.goto(BASE+'/#view=explore',{waitUntil:'domcontentloaded'});
for(let i=0;i<90;i++){if(await page.evaluate(()=>localStorage.getItem('reper.v2.preferences')!==null&&document.querySelectorAll('.places-workspace .entity-card').length>0))break;await page.waitForTimeout(500)}
await page.waitForTimeout(3000);
console.log('== settled at t=',Date.now()-t0);

console.log('== A) CONTROL: PlacesWorkspace sort select (internal state, no Aflivra render)');
let c0=await counts();
await page.locator('.places-workspace .entity-filters label').filter({hasText:'Ordonare'}).locator('select').selectOption('recent');
await page.waitForTimeout(5000);
let c1=await counts();
console.log('   control delta:',JSON.stringify(delta(c0,c1)));

console.log('== B) Aflivra-state change: explore search -> setQ');
c0=await counts();
await page.locator('.explore-search input').fill('bis');
await page.waitForTimeout(1500);
c1=await counts();
console.log('   setQ delta:',JSON.stringify(delta(c0,c1)),'  <- expect gallery re-created if inline-component churn holds');
c0=await counts();
await page.locator('.explore-search input').fill('');
await page.waitForTimeout(350);
c1=await counts();
console.log('   setQ-clear delta:',JSON.stringify(delta(c0,c1)));

console.log('== C) reload + 75s still (no geo, no interaction)');
await page.reload({waitUntil:'domcontentloaded'});
for(let i=0;i<90;i++){if(await page.evaluate(()=>localStorage.getItem('reper.v2.preferences')!==null&&document.querySelectorAll('.places-workspace .entity-card').length>0))break;await page.waitForTimeout(500)}
let prev=await counts();
const census=[];
for(let i=0;i<15;i++){
  await page.waitForTimeout(5000);
  const c=await counts();
  census.push({t:Date.now()-t0,d:delta(prev,c)});
  prev=c;
  console.log(`   still t+${census[i].t}ms ${JSON.stringify(census[i].d)}`);
}
const probe=await page.evaluate(()=>({added:window.__imgProbe.added,removed:window.__imgProbe.removed,srcChanged:window.__imgProbe.srcChanged,serial:window.__imgProbe.serial}));
const fs=await import('node:fs');
fs.writeFileSync(OUT,JSON.stringify({requests,census,probe},null,1));
const galleryBursts=probe.added.filter(x=>x.where==='gallery');
const galleryBurstTimeline=galleryBursts.map(x=>x.t);
console.log('== total gallery img creations after reload:',galleryBursts.length,'serial reuses:',probe.serial);
console.log('== written',OUT);
await context.close();await browser.close();
