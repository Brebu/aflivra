// T2.2 AFTER battery — single run. Map labels (post-fix) + bounded re-audit of this pass's own
// surfaces (home chips, place detail, About guides, courts/legal) at 390 + 1280.
// Numeric discipline from the design-alignment pass: overflow/viewport/midY/font-size/overlap.
import {chromium} from '@playwright/test';
import fs from 'node:fs';

const BASE='http://127.0.0.1:5173';
const OUT=import.meta.dirname;
const targets=[
  {name:'home-390',url:'/',vp:{width:390,height:844},dsf:2,checks:['map','chips','global']},
  {name:'map-390',url:'/#view=map',vp:{width:390,height:844},dsf:2,checks:['map','global']},
  {name:'place-390',url:'/#view=place&id=peles',vp:{width:390,height:844},dsf:2,checks:['map','tabs','global']},
  {name:'about-390',url:'/#view=about',vp:{width:390,height:844},dsf:2,checks:['guides','global']},
  {name:'justitie-390',url:'/#view=domain&id=justitie',vp:{width:390,height:844},dsf:2,checks:['global']},
  {name:'map-1280',url:'/#view=map',vp:{width:1280,height:800},dsf:1,checks:['map','global']},
  {name:'about-1280',url:'/#view=about',vp:{width:1280,height:800},dsf:1,checks:['guides','global']},
  {name:'home-1280',url:'/',vp:{width:1280,height:800},dsf:1,checks:['map','chips','global']},
];
const collect=()=>({
  map:()=>{
    const out={labels:[],credit:null,romap:null};
    document.querySelectorAll('.map-country').forEach(el=>{
      const svg=el.ownerSVGElement;if(!svg||!svg.closest('.romap'))return;
      const bb=el.getBBox(),r=el.getBoundingClientRect(),sr=svg.getBoundingClientRect();
      out.labels.push({text:el.textContent.trim(),x:+el.getAttribute('x'),advance:el.getComputedTextLength(),bb:{x:bb.x,y:bb.y,w:bb.width,h:bb.height},rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},svg:{left:sr.left,top:sr.top,w:sr.width,h:sr.height},scale:svg.getScreenCTM()?.a});
    });
    const credit=document.querySelector('.romap .map-credit'),romap=document.querySelector('.romap');
    if(credit){const cs=getComputedStyle(credit),cr=credit.getBoundingClientRect(),rr=romap.getBoundingClientRect();
      out.credit={position:cs.position,fontSize:cs.fontSize,rect:{left:cr.left,top:cr.top,right:cr.right,bottom:cr.bottom,width:cr.width,height:cr.height},topOverlapSvg:cr.top-rr.top,withinRomap:cr.right<=rr.right+0.5&&cr.left>=rr.left-0.5&&cr.bottom<=rr.bottom+0.5&&cr.top>=rr.top-0.5};}
    if(romap){const rr=romap.getBoundingClientRect();out.romap={left:rr.left,top:rr.top,w:rr.width,h:rr.height};}
    return out;
  },
  chips:()=>{
    const row=document.querySelector('.hero-suggestions');
    if(!row)return null;
    const rr=row.getBoundingClientRect();
    return {row:{left:rr.left,right:rr.right,top:rr.top,bottom:rr.bottom,width:rr.width,height:rr.height,midY:rr.top+rr.height/2},buttons:[...row.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return{label:b.textContent.trim(),left:r.left,right:r.right,width:r.width,height:r.height,midY:r.top+r.height/2,inViewport:r.right<=innerWidth+0.5&&r.left>=-0.5}})};
  },
  tabs:()=>{
    const lists=[...document.querySelectorAll('[data-slot=tabs-list]')];
    return lists.map(l=>({cw:l.clientWidth,sw:l.scrollWidth,triggers:[...l.querySelectorAll('[data-slot=tabs-trigger]')].map(t=>{const r=t.getBoundingClientRect(),lr=l.getBoundingClientRect();return{label:t.textContent.trim(),right:r.right,listRight:lr.right,withinList:r.right<=lr.right+0.5}})}));
  },
  guides:()=>{
    const grid=document.querySelector('.source-downloads');
    if(!grid)return null;
    const cards=[...grid.querySelectorAll('.source-download')].map(c=>{const cs=getComputedStyle(c),r=c.getBoundingClientRect(),link=c.querySelector('.text-link'),lr=link?link.getBoundingClientRect():null;return{borderColor:cs.borderColor,backgroundColor:cs.backgroundColor,borderRadius:cs.borderRadius,fontSize:cs.fontSize,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},linkRect:lr?{left:lr.left,right:lr.right,height:lr.height,midY:lr.top+lr.height/2,inCard:lr.right<=r.right+0.5&&lr.bottom<=r.bottom+0.5}:null,cardMidY:r.top+r.height/2}});
    const kick=document.querySelector('.source-downloads')?.closest('section')?.querySelector('.kicker');
    return {cards,kickerStyle:kick?{fontSize:getComputedStyle(kick).fontSize,letterSpacing:getComputedStyle(kick).letterSpacing}:null,columns:getComputedStyle(grid).gridTemplateColumns,gridRight:grid.getBoundingClientRect().right};
  },
  global:()=>{
    const broken=[...document.images].filter(i=>i.complete&&i.naturalWidth===0).length;
    const tinyContent=[];
    const selectors=['.v2 p','.v2 h1','.v2 h2','.v2 h3','.v2 td','.v2 th','.v2 label','.v2 [data-slot=button]'];
    const seen=new Set();
    for(const sel of selectors)for(const el of document.querySelectorAll(sel)){const fs=getComputedStyle(el).fontSize;const r=el.getBoundingClientRect();if(r.width>40&&r.height>10&&parseFloat(fs)<9){const key=sel+'|'+fs+'|'+el.textContent.trim().slice(0,25);if(!seen.has(key)){seen.add(key);tinyContent.push({sel,fs,text:el.textContent.trim().slice(0,40)})}}}
    return {scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,overflowX:document.documentElement.scrollWidth-window.innerWidth,brokenImages:broken,fontsLoaded:document.fonts.size,contentTiny:tinyContent.slice(0,12)};
  }
});
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
  const consoleErrors=[];
  page.on('pageerror',e=>consoleErrors.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,120))});
  await page.goto(BASE+t.url,{waitUntil:'domcontentloaded'});
  try{await page.waitForSelector('.romap svg',{timeout:45000});}catch{}
  try{await page.waitForSelector('.romap svg path',{timeout:15000});}catch{}
  await page.waitForTimeout(600);
  const data={name:t.name,checks:{}};
  for(const c of t.checks)data.checks[c]=await page.evaluate(`((${collect.toString()})()).${c}()`);
  data.consoleErrors=consoleErrors.slice(0,5);
  if(t.checks.includes('map')){const el=await page.$('.romap');if(el)await el.screenshot({path:`${OUT}/screens/map-after-${t.name}.png`});}
  if(t.checks.includes('guides')){const el=await page.$('.source-downloads');if(el)await el.screenshot({path:`${OUT}/screens/guides-after-${t.name}.png`});}
  if(t.checks.includes('chips')){const el=await page.$('.hero-suggestions');if(el)await el.screenshot({path:`${OUT}/screens/chips-after-${t.name}.png`});}
  results.push(data);
  await context.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/probe-after.json`,JSON.stringify(results,null,1));
// Verdict report.
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
for(const r of results){
  console.log(`\n== ${r.name}`);
  const g=r.checks.global;
  if(g)console.log(`  global: overflowX=${g.overflowX}px brokenImages=${g.brokenImages} fonts=${g.fontsLoaded} contentTiny(<9px)=${g.contentTiny.length}${g.contentTiny.length?' → '+JSON.stringify(g.contentTiny):''}`);
  const m=r.checks.map;
  if(m&&m.labels.length&&m.credit){const svgBottom=m.labels[0].svg.top+m.labels[0].svg.h;console.log(`  map: romap ${m.romap.w.toFixed(0)}x${m.romap.h.toFixed(0)} scale=${m.labels[0].scale.toFixed(3)} credit=${m.credit.position}/${m.credit.fontSize} withinRomap=${m.credit.withinRomap} creditBelowArtwork=${m.credit.rect.top>=svgBottom-1}(topΔ=${(m.credit.rect.top-svgBottom).toFixed(1)}px)`);
    for(const l of m.labels){const ov=overlap(l.rect,m.credit.rect);console.log(`    ${l.text.padEnd(9)} adv=${l.advance.toFixed(1)}u bb[${l.bb.x.toFixed(1)},${l.bb.y.toFixed(1)} ${l.bb.w.toFixed(1)}x${l.bb.h.toFixed(1)}u] uRight=${(l.bb.x+l.bb.w).toFixed(1)}/640 uBottom=${(l.bb.y+l.bb.h).toFixed(1)}/490 creditOverlapPx=${ov.toFixed(2)}`);}
    const maxR=Math.max(...m.labels.map(l=>l.bb.x+l.bb.w)),maxB=Math.max(...m.labels.map(l=>l.bb.y+l.bb.h));
    console.log(`    labels all-inside-viewBox: ${maxR<=640&&Math.min(...m.labels.map(l=>l.bb.x))>=0&&maxB<=490} (maxRight=${maxR.toFixed(1)} maxBottom=${maxB.toFixed(1)}) occlusion total=${m.labels.reduce((s,l)=>s+overlap(l.rect,m.credit.rect),0).toFixed(2)}px²`);}
  const ch=r.checks.chips;
  if(ch&&ch.buttons.length)console.log(`  chips: ${ch.buttons.length} buttons midYΔ=${Math.max(...ch.buttons.map(b=>Math.abs(b.midY-ch.row.midY))).toFixed(1)}px allInViewport=${ch.buttons.every(b=>b.inViewport)} labels=[${ch.buttons.map(b=>b.label).join(' | ')}]`);
  const tb=r.checks.tabs;
  if(tb&&tb.length)for(const l of tb)console.log(`  tabs: cw=${l.cw} sw=${l.sw} triggers=[${l.triggers.map(t=>t.label+':'+(t.withinList?'in':'OUT')).join(', ')}]`);
  const gd=r.checks.guides;
  if(gd&&gd.cards.length){const c=gd.cards[0];console.log(`  guides: ${gd.cards.length} cards cols=[${gd.columns}] borderColor=${c.borderColor} bg=${c.backgroundColor} radius=${c.borderRadius} cardW=${c.rect.width.toFixed(0)}px linkMidYΔ=${c.linkRect?(c.linkRect.midY-c.cardMidY).toFixed(1):'n/a'}px kicker=${gd.kickerStyle?gd.kickerStyle.fontSize+'/'+gd.kickerStyle.letterSpacing:'n/a'}`);
    const inVp=gd.cards.every(x=>x.rect.right<=r.checks.global.innerWidth+0.5);console.log(`    cards within viewport=${inVp}`);}
  if(r.consoleErrors.length)console.log(`  console: ${JSON.stringify(r.consoleErrors)}`);
}
