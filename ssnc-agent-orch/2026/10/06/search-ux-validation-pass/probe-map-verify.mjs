// T2.2 map-fix verification — compact trio + full-view regression, 4 loads, /api/* memoized.
import {chromium} from '@playwright/test';
import fs from 'node:fs';
const BASE='http://127.0.0.1:5173';
const OUT=import.meta.dirname;
const targets=[
  {name:'home-390',url:'/',vp:{width:390,height:844},dsf:2},
  {name:'place-390',url:'/#view=place&id=peles',vp:{width:390,height:844},dsf:2},
  {name:'home-1280',url:'/',vp:{width:1280,height:800},dsf:1},
  {name:'map-390',url:'/#view=map',vp:{width:390,height:844},dsf:2},
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
    const entry={status:resp.status(),headers:resp.headers(),body};cache.set(key,entry);return route.fulfill(entry);
  });
  const page=await context.newPage();
  await page.goto(BASE+t.url,{waitUntil:'domcontentloaded'});
  try{await page.waitForSelector('.romap svg path',{timeout:45000});}catch{}
  await page.waitForTimeout(400);
  const data=await page.evaluate(()=>{
    const labels=[];
    document.querySelectorAll('.map-country').forEach(el=>{
      const svg=el.ownerSVGElement;if(!svg||!svg.closest('.romap'))return;
      const bb=el.getBBox(),r=el.getBoundingClientRect(),sr=svg.getBoundingClientRect();
      labels.push({text:el.textContent.trim(),advance:el.getComputedTextLength(),bb:{x:bb.x,y:bb.y,w:bb.width,h:bb.height},rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},svg:{top:sr.top,h:sr.height,w:sr.width},scale:svg.getScreenCTM()?.a});
    });
    const credit=document.querySelector('.romap .map-credit'),romap=document.querySelector('.romap');
    const cr=credit.getBoundingClientRect(),rr=romap.getBoundingClientRect(),cs=getComputedStyle(credit);
    return {labels,romap:{left:rr.left,top:rr.top,right:rr.right,bottom:rr.bottom,w:rr.width,h:rr.height},
      credit:{position:cs.position,fontSize:cs.fontSize,rect:{left:cr.left,top:cr.top,right:cr.right,bottom:cr.bottom,h:cr.height},
      withinRomap:cr.right<=rr.right+0.5&&cr.left>=rr.left-0.5&&cr.bottom<=rr.bottom+0.5&&cr.top>=rr.top-0.5}};
  });
  const clip=await page.$('.romap');
  await clip.screenshot({path:`${OUT}/screens/map-verify-${t.name}.png`});
  results.push({name:t.name,...data});
  await context.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/probe-map-verify.json`,JSON.stringify(results,null,1));
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
for(const r of results){
  const svgBottom=r.labels[0].svg.top+r.labels[0].svg.h;
  const occ=r.labels.reduce((s,l)=>s+overlap(l.rect,r.credit.rect),0);
  const maxR=Math.max(...r.labels.map(l=>l.bb.x+l.bb.w)),minL=Math.min(...r.labels.map(l=>l.bb.x)),maxB=Math.max(...r.labels.map(l=>l.bb.y+l.bb.h));
  console.log(`${r.name}: romap ${r.romap.w.toFixed(0)}x${r.romap.h.toFixed(0)} svgH=${r.labels[0].svg.h.toFixed(1)} scale=${r.labels[0].scale.toFixed(3)} credit[${r.credit.position}/${r.credit.fontSize}] withinRomap=${r.credit.withinRomap} belowArtwork=${r.credit.rect.top>=svgBottom-1}(Δ${(r.credit.rect.top-svgBottom).toFixed(1)}) occlusion=${occ.toFixed(2)}px² labelsInside=${minL>=0&&maxR<=640&&maxB<=490} (L${minL.toFixed(1)} R${maxR.toFixed(1)}/640 B${maxB.toFixed(1)}/490) docOverflow=?`);
}
