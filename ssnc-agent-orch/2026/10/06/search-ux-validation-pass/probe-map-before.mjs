// Map country-label geometry probe — BEFORE state (T2.2). Numeric evidence only.
// 4 page loads: home@390, map@390, place@390, map@1280. /api/* memoized per URL (rate-budget lesson).
import {chromium} from '@playwright/test';
import fs from 'node:fs';

const BASE='http://127.0.0.1:5173';
const OUT=import.meta.dirname;
const targets=[
  {name:'home-390',url:'/',vp:{width:390,height:844},dsf:2,sel:'.discovery-split .romap svg'},
  {name:'map-390',url:'/#view=map',vp:{width:390,height:844},dsf:2,sel:'.map-workspace .romap svg'},
  {name:'place-390',url:'/#view=place&id=peles',vp:{width:390,height:844},dsf:2,sel:'.place-map-layout .romap svg'},
  {name:'map-1280',url:'/#view=map',vp:{width:1280,height:800},dsf:1,sel:'.map-workspace .romap svg'},
];
const browser=await chromium.launch();
const results=[];
for(const t of targets){
  const context=await browser.newContext({viewport:t.vp,deviceScaleFactor:t.dsf});
  const cache=new Map();
  await context.route('**/api/**',async route=>{
    const req=route.request();const key=req.method()+' '+req.url()+' '+(req.postData()||'');
    if(cache.has(key))return route.fulfill(cache.get(key));
    const resp=await route.fetch();const body=await resp.body();
    const entry={status:resp.status(),headers:resp.headers(),body};cache.set(key,entry);
    return route.fulfill(entry);
  });
  const page=await context.newPage();
  await page.goto(BASE+t.url,{waitUntil:'domcontentloaded'});
  try{await page.waitForSelector(t.sel,{timeout:45000});}catch{results.push({name:t.name,error:'selector timeout: '+t.sel});await context.close();continue;}
  try{await page.waitForSelector(t.sel+' path',{timeout:20000});}catch{}
  await page.waitForTimeout(300);
  const data=await page.evaluate(()=>{
    const labels=[];
    document.querySelectorAll('.map-country').forEach(el=>{
      const svg=el.ownerSVGElement;if(!svg||!svg.closest('.romap'))return;
      const cs=getComputedStyle(el);const sr=svg.getBoundingClientRect();const vb=svg.viewBox.baseVal;const ctm=svg.getScreenCTM();
      let lastChar=null;try{const n=el.getNumberOfChars();lastChar={x:el.getExtentOfChar(n-1).x,w:el.getExtentOfChar(n-1).width};}catch{}
      labels.push({text:el.textContent.trim(),x:+el.getAttribute('x'),y:+el.getAttribute('y'),fontSize:cs.fontSize,letterSpacing:cs.letterSpacing,advance:el.getComputedTextLength(),bbox:{...el.getBBox()},rect:el.getBoundingClientRect().toJSON(),lastChar,svgRect:{width:sr.width,height:sr.height,left:sr.left,top:sr.top},viewBox:{w:vb.width,h:vb.height},scale:ctm?ctm.a:null});
    });
    const romap=document.querySelector('.romap');
    const credit=document.querySelector('.map-credit');
    const controls=document.querySelector('.map-controls');
    return {labels,romap:romap?romap.getBoundingClientRect().toJSON():null,credit:credit?credit.getBoundingClientRect().toJSON():null,controls:controls?controls.getBoundingClientRect().toJSON():null};
  });
  const clip=await page.$('.romap');
  await clip.screenshot({path:`${OUT}/screens/map-before-${t.name}.png`});
  results.push({name:t.name,...data});
  await context.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/probe-map-before.json`,JSON.stringify(results,null,1));
// Compact report: viewBox-unit geometry (scale-invariant) + per-instance scale + screen edges.
for(const r of results){
  if(r.error){console.log(`\n== ${r.name}: ERROR ${r.error}`);continue;}
  console.log(`\n== ${r.name} — romap ${r.romap.width.toFixed(0)}x${r.romap.height.toFixed(0)}px`);
  for(const l of r.labels){
    const uRight=l.bbox.x+l.bbox.width,uBottom=l.bbox.y+l.bbox.height;
    const draw={w:640*l.scale,h:490*l.scale};
    const offX=l.svgRect.width-draw.w,offY=l.svgRect.height-draw.h;
    const screenInSvg=l.rect.right<=l.svgRect.left+l.svgRect.width+0.5&&l.rect.left>=l.svgRect.left-0.5;
    console.log(`${l.text.padEnd(10)} fs${l.fontSize} ls${l.letterSpacing} adv=${l.advance.toFixed(1)}u bbox[${l.bbox.x.toFixed(1)},${l.bbox.y.toFixed(1)} ${l.bbox.width.toFixed(1)}x${l.bbox.height.toFixed(1)}u] right=${uRight.toFixed(1)}u bottom=${uBottom.toFixed(1)}u scale=${l.scale.toFixed(3)} screenW=${l.rect.width.toFixed(1)}px right-edge svgΔ=${(l.rect.right-(l.svgRect.left+l.svgRect.width)).toFixed(1)}px bottomΔ=${(l.rect.bottom-(l.svgRect.top+l.svgRect.height)).toFixed(1)}px insideSvg=${screenInSvg}`);
  }
}
console.log('\nJSON written to probe-map-before.json');
