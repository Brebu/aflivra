// T1.3 Rendering audit battery — 15 routes x 62 domain surfaces (46 sections + 16 data tabs)
// + place tabs (5) + compare tabs (3) at 390x844 and 1280x800. Findings only, no fixes.
// Dev-server load discipline: sequential pages, one context per viewport with /api/** response
// cache (precedent: search-ux-validation-pass/probe-after.mjs), fixed waits, never networkidle.
import {chromium} from '@playwright/test';
import fs from 'node:fs';

const BASE='http://localhost:5173';
const DIR=import.meta.dirname;
const OUT=DIR+'/probes';
fs.mkdirSync(OUT,{recursive:true});

const topicSections={
  local:['places','weather','transport','registry'],
  vreme:['weather'],
  sanatate:['places','health','pharmacies','hospitals','news'],
  educatie:['places','schools','news'],
  transport:['network','vehicles','arrivals','alerts','places','news'],
  cultura:['places','events','selection'],
  filme:['cinema','places','films'],
  povesti:['stories'],
  bani:['currency','places'],
  firme:['companies','places','compare'],
  munca:['news','places'],
  justitie:['legal','lawyers','places','news'],
  energie:['calculator','places','news'],
  agricultura:['news','places'],
  mediu:['places','weather'],
  stiri:['news','places'],
};
const domains=Object.keys(topicSections);
const domainSurfaceCount=domains.reduce((n,d)=>n+topicSections[d].length+1,0);

const placeTabs=[['overview','Povestea locului'],['gallery','Galerie'],['insights','Date & perspective'],['visit','Planifică vizita'],['sources','Surse']];
const compareTabs=[['places','Locuri'],['firms','Firme'],['cities','Orașe']];

const VPS=[{name:'390',w:390,h:844,dsf:2},{name:'1280',w:1280,h:800,dsf:1}];

const collect=()=>({
  page(){
    const h1=document.querySelector('main h1')||document.querySelector('h1');
    return{title:document.title.slice(0,90),h1:h1?h1.innerText.trim().slice(0,80):null};
  },
  surface(tabbed){
    const desc=el=>el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/).slice(0,2).join('.'):'');
    const out={tabbed:!!tabbed};
    out.overflowX=document.documentElement.scrollWidth-window.innerWidth;
    out.brokenImgs=[];out.oddSrcImgs=[];out.smallInSlot=[];out.noImgCards=[];
    for(const img of document.images){
      if(!img.getClientRects().length)continue;
      const src=img.getAttribute('src')||'';
      if(/undefined|^null$|(^|[^a-z])NaN/i.test(src))out.oddSrcImgs.push(src.slice(0,70));
      if(img.complete&&img.naturalWidth===0&&src&&!src.startsWith('data:')){
        if(out.brokenImgs.length<8)out.brokenImgs.push((img.alt||'').slice(0,30)+'|'+src.slice(0,90));
      }
      const r=img.getBoundingClientRect();
      if(r.width>0&&(r.width<12||r.height<12)&&img.closest('.place-card,.map-result,.gallery-strip,.compare-cards,.entity-card'))out.smallInSlot.push({src:src.slice(0,60),w:Math.round(r.width),h:Math.round(r.height)});
    }
    if(out.noImgCards.length<6)for(const sel of['.place-card','.map-result']){
      for(const el of document.querySelectorAll(sel)){
        if(!el.querySelector('img')&&out.noImgCards.length<6)out.noImgCards.push(sel+'::'+el.innerText.trim().replace(/\s+/g,' ').slice(0,44));
      }
    }
    out.cutoff=[];
    {const seen=new Set();
     const sel='.v2 p,.v2 h1,.v2 h2,.v2 h3,.v2 h4,.v2 strong,.v2 span,.v2 button,.v2 td,.v2 th,.v2 small,.v2 label,.v2 li,.v2 dt,.v2 dd';
     for(const el of document.querySelectorAll(sel)){
       if(out.cutoff.length>=8)break;
       if(el.closest('.sr-only,[hidden],[aria-hidden="true"]'))continue;
       const t=el.textContent&&el.textContent.trim();
       if(!t||t.length<3)continue;
       if(!el.getClientRects().length)continue;
       const cs=getComputedStyle(el);
       if(cs.overflowX!=='hidden'&&cs.overflowX!=='clip')continue;
       if(cs.whiteSpace==='nowrap'&&cs.textOverflow==='ellipsis')continue;
       if(el.scrollWidth<=el.clientWidth+2)continue;
       const key=t.slice(0,28);
       if(seen.has(key))continue;seen.add(key);
       out.cutoff.push({el:desc(el),text:t.replace(/\s+/g,' ').slice(0,46),sw:el.scrollWidth,cw:el.clientWidth,tov:cs.textOverflow});
     }}
    out.zeroSize=[];
    {for(const el of document.querySelectorAll('main p,main h1,main h2,main h3,main h4,main table,main article,main .vpanel,[data-slot=tabs-content]>div,[data-slot=tabs-content]>section,.live-section>*')){
       if(out.zeroSize.length>=6)break;
       if(el.hidden||el.closest('[hidden],[aria-hidden="true"]'))continue;
       if(!el.getClientRects().length)continue;
       const t=el.innerText;
       if(!t||!t.trim())continue;
       const r=el.getBoundingClientRect();
       if(r.width<2||r.height<2)out.zeroSize.push({el:desc(el),text:t.trim().replace(/\s+/g,' ').slice(0,40),w:Math.round(r.width),h:Math.round(r.height)});
     }}
    out.gaps=[];
    {const heroish=el=>!!el.closest('.hero,.place-hero,.wide-story,.weather-scene,.domain-hero,.romap,.photo-dialog,.vempty,.map-preview,.map-sidebar,.pulse-row,.discovery-split,.city-stories,.insight-story,.big-editorial,.map-workspace,.vbottom-nav');
     const containers=[...document.querySelectorAll('main, main .vwrap, main section, main .live-section, main .domain-workspace')];
     for(const c of containers){
       const kids=[...c.children].filter(el=>{
         const cs=getComputedStyle(el);
         if(cs.display==='none'||cs.position==='fixed')return false;
         if(['STYLE','SCRIPT'].includes(el.tagName))return false;
         const r=el.getBoundingClientRect();
         return r.height>40&&r.width>40;
       });
       for(let i=1;i<kids.length;i++){
         if(heroish(kids[i-1])||heroish(kids[i]))continue;
         const a=kids[i-1].getBoundingClientRect(),b=kids[i].getBoundingClientRect();
         const gap=b.top-a.bottom;
         if(gap>140&&out.gaps.length<10)out.gaps.push({container:desc(c),after:desc(kids[i-1]),before:desc(kids[i]),gap:Math.round(gap)});
       }
     }
     out.gaps.sort((a,b)=>b.gap-a.gap);out.gaps=out.gaps.slice(0,6);}
    const text=document.body.innerText||'';
    const noMail=text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g,' ');
    out.snake=[];out.caps=[];out.tokens=[];out.grammar=[];
    {let m;const rx=/[A-Za-zăâîșțĂÂÎȘȚ0-9]+(?:_[A-Za-zăâîșțĂÂÎȘȚ0-9]+)+/g;
     while((m=rx.exec(noMail))&&out.snake.length<8){
       const i=m.index;
       out.snake.push(m[0]+' ⋯ '+noMail.slice(Math.max(0,i-38),i+m[0].length+18).replace(/\s+/g,' ').slice(0,90));
     }
     const rx2=/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
     {let m2=null;while((m2=rx2.exec(noMail))&&out.caps.length<8)out.caps.push(m2[0]);}
     const toks=[['\\bundefined\\b','undefined'],['\\[object Object\\]','[object Object]'],[':r\\d+:','radix-id'],['\\bradix-','radix'],['\\bNaN\\b','NaN'],['\\{"','raw-json'],['"\\s*:','json-key']];
     for(const [re,label] of toks){
       const r=new RegExp(re,'g');let mm;
       while((mm=r.exec(text))&&out.tokens.length<10){
         const i=mm.index;
         out.tokens.push(label+' ⋯ '+text.slice(Math.max(0,i-32),i+34).replace(/\s+/g,' ').slice(0,80));
       }
     }}
    {const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
     const parseN=s=>Number(s.replace(/\./g,'').replace(',','.'));
     const form=n=>{const u=n%10,l=n%100;return u===1&&l!==11?'sg':(n===0||(l>=2&&l<=19))?'pl':'de'};
     const pairs=[['rezultat','rezultate'],['loc','locuri'],['element salvat','elemente salvate'],['înregistrare găsită','înregistrări găsite'],['resursă publicată','resurse publicate'],['set','seturi'],['rând','rânduri'],['film','filme'],['ședință publicată','ședințe publicate'],['stație','stații'],['linie','linii'],['cursă','curse'],['oprire','opriri'],['proiecție','proiecții'],['variabilă disponibilă','variabile disponibile']];
     for(const [sg,pl] of pairs){
       const tests=[['sg',new RegExp('(\\d[\\d.,]*)\\s+'+esc(sg)+'(?![a-zăâîșț])','g')],['pl',new RegExp('(\\d[\\d.,]*)\\s+'+esc(pl)+'(?![a-zăâîșț])','g')],['de',new RegExp('(\\d[\\d.,]*)\\s+de\\s+'+esc(pl)+'(?![a-zăâîșț])','g')]];
       for(const [actual,re] of tests){
         let mm;re.lastIndex=0;
         while((mm=re.exec(text))&&out.grammar.length<8){
           const n=parseN(mm[1]);
           if(!Number.isFinite(n))continue;
           const exp=form(n);
           if(exp!==actual)out.grammar.push({text:mm[0].replace(/\s+/g,' ').slice(0,44),n,exp,actual});
         }
       }
     }}
    out.mapCredit=null;
    {const romap=document.querySelector('.romap');
     const credit=romap&&romap.querySelector('.map-credit');
     if(romap&&credit){
       const cr=credit.getBoundingClientRect(),cs=getComputedStyle(credit);
       let total=0,worst=null;
       for(const el of document.querySelectorAll('.map-country')){
         const svg=el.ownerSVGElement;
         if(!svg||!svg.closest('.romap'))continue;
         const r=el.getBoundingClientRect();
         const ov=Math.max(0,Math.min(r.right,cr.right)-Math.max(r.left,cr.left))*Math.max(0,Math.min(r.bottom,cr.bottom)-Math.max(r.top,cr.top));
         if(ov>0.5){total+=ov;const area=r.width*r.height;if(!worst||ov/(area||1)>worst.frac)worst={label:el.textContent.trim(),ovpx:Math.round(ov),frac:+(ov/(area||1)).toFixed(2)};}
       }
       const rr=romap.getBoundingClientRect();
       out.mapCredit={position:cs.position,totalOcclusion:Math.round(total),worst,withinRomap:cr.right<=rr.right+0.5&&cr.left>=rr.left-0.5&&cr.bottom<=rr.bottom+0.5&&cr.top>=rr.top-0.5};
     }}
    out.vbottomOverlap=[];
    {const nav=document.querySelector('.vbottom-nav');
     if(nav&&getComputedStyle(nav).display!=='none'){
       const nr=nav.getBoundingClientRect();
       for(const el of document.querySelectorAll('.vfooter *')){
         if(el.children.length)continue;
         const t=(el.innerText||'').trim();
         if(!t)continue;
         const r=el.getBoundingClientRect();
         const hit=r.height>0&&r.bottom>nr.top+1&&r.top<nr.bottom-1&&r.right>nr.left&&r.left<nr.right;
         if(hit&&out.vbottomOverlap.length<6)out.vbottomOverlap.push({el:desc(el),text:t.slice(0,30),over:Math.round(r.bottom-nr.top)});
       }
     }}
    out.busy=!!document.querySelector('[role=status],.live-loading,.spin');
    const active=document.querySelector('[data-slot=tabs-content][data-state=active]');
    out.activeEmpty=!!(tabbed&&active&&!(active.innerText&&active.innerText.trim()));
    out.textLen=text.length;
    return out;
  }
});

const hasFinding=(s,consoleErrs)=>{
  if(s.overflowX>1)return true;
  if(s.brokenImgs.length||s.oddSrcImgs.length||s.smallInSlot.length||s.noImgCards.length)return true;
  if(s.zeroSize.length)return true;
  if(s.gaps.length)return true;
  if(s.snake.length||s.caps.length||s.tokens.length)return true;
  if(s.grammar.length)return true;
  if(s.mapCredit&&(s.mapCredit.totalOcclusion>2||!s.mapCredit.withinRomap))return true;
  if(s.vbottomOverlap.length)return true;
  if(s.activeEmpty&&!s.busy)return true;
  if(consoleErrs&&consoleErrs.length)return true;
  return false;
};

async function auditSurface(page,label,tabbed,vpName){
  const s=await page.evaluate(`((${collect.toString()})()).surface(${!!tabbed})`);
  return {label,vp:vpName,surface:s};
}

function shotName(vp,key,surface){return `${OUT}/sweep-${vp}-${key}${surface?`-${surface}`:''}.png`}

const browser=await chromium.launch();
const results=[];
const ssr=[];
// ---------- Part 1: SSR sanity (15 route URLs; hashes never reach the server) ----------
{
  const urls=[['home','/'],['explore','/#view=explore'],['map','/#view=map'],['place','/#view=place&id=peles'],['dashboard','/#view=dashboard'],['company','/#view=company'],['money','/#view=money'],['domain','/#view=domain&id=local'],['compare','/#view=compare'],['recommendations','/#view=recommendations'],['saved','/#view=saved'],['planner','/#view=planner'],['about','/#view=about'],['catalog','/catalog'],['design','/design.html']];
  for(const [name,url] of urls){
    try{
      const res=await fetch(BASE+url);
      const body=await res.text();
      const title=(body.match(/<title>([^<]*)<\/title>/)||[])[1]||'';
      const markers={shellMain:body.includes('id="vcontent"'),brand:body.includes('aria-label="Aflivra acasă"'),footer:body.includes('vfooter')};
      if(url==='/catalog')markers.catalogHome=body.includes('catalog-home');
      if(url==='/design.html')markers.metaRedirect=body.includes('http-equiv="refresh"');
      const errorDoc=/Internal Server Error|SyntaxError|at \/|vinext error/i.test(body);
      ssr.push({name,url,status:res.status,title,markers,errorDoc});
    }catch(e){ssr.push({name,url,error:String(e).slice(0,80)})}
  }
}
// ---------- Part 2: browser battery ----------
for(const vp of VPS){
  const context=await browser.newContext({viewport:{width:vp.w,height:vp.h},deviceScaleFactor:vp.dsf});
  const cache=new Map();
  await context.route('**/api/**',async route=>{
    const req=route.request();const key=req.method()+' '+req.url()+' '+(req.postData()||'');
    if(cache.has(key))return route.fulfill(cache.get(key));
    const resp=await route.fetch();const body=await resp.body();
    const entry={status:resp.status(),headers:resp.headers(),body};cache.set(key,entry);
    return route.fulfill(entry);
  });
  async function newPage(url,waitFor){
    const page=await context.newPage();
    const errs=[];
    page.on('pageerror',e=>errs.push('pageerror: '+String(e.message).slice(0,110)));
    page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,110))});
    await page.goto(BASE+url,{waitUntil:'domcontentloaded'});
    if(waitFor){try{await page.waitForSelector(waitFor,{timeout:20000});}catch{}}
    try{await page.waitForFunction(()=>document.querySelector('main')&&document.body.innerText.trim().length>10,{timeout:6000});}catch{}
    await page.waitForTimeout(500);
    return {page,errs};
  }
  async function waitSettled(page){
    try{await page.waitForFunction(()=>{const a=document.querySelector('[data-slot=tabs-content][data-state=active]');return !a||(a.innerText&&a.innerText.trim().length>0)||document.querySelector('[role=status],.live-loading')},{timeout:3500});}catch{}
    await page.waitForTimeout(450);
  }

  // --- simple routes (no tabs) ---
  const simple=[
    ['home','/','main#vcontent,.romap svg'],
    ['explore','/#view=explore','main'],
    ['map','/#view=map','.romap svg'],
    ['dashboard','/#view=dashboard','main'],
    ['company','/#view=company','main'],
    ['money','/#view=money','main'],
    ['recommendations','/#view=recommendations','main'],
    ['saved','/#view=saved','main'],
    ['planner','/#view=planner','.romap svg'],
    ['about','/#view=about','main'],
  ];
  for(const [key,url,waitFor] of simple){
    const {page,errs}=await newPage(url,waitFor);
    await waitSettled(page);
    const meta=await page.evaluate(`((${collect.toString()})()).page()`);
    const r=await auditSurface(page,key,false,vp.name);
    r.meta=meta;r.consoleErrs=[...new Set(errs)].slice(0,6);
    if(hasFinding(r.surface,r.consoleErrs)){try{await page.screenshot({path:shotName(vp.name,key)});}catch{}}
    results.push(r);
    await page.close();
  }

  // --- catalog public page ---
  {
    const {page,errs}=await newPage('/catalog','main');
    await waitSettled(page);
    const meta=await page.evaluate(`((${collect.toString()})()).page()`);
    const r=await auditSurface(page,'catalog',false,vp.name);
    r.meta=meta;r.consoleErrs=[...new Set(errs)].slice(0,6);
    if(hasFinding(r.surface,r.consoleErrs)){try{await page.screenshot({path:shotName(vp.name,'catalog')});}catch{}}
    results.push(r);
    await page.close();
  }

  // --- place route (5 tabs) ---
  {
    const {page,errs}=await newPage('/#view=place&id=peles','main [data-slot=tabs-trigger]');
    for(let i=0;i<placeTabs.length;i++){
      if(i>0){
        try{
          await page.locator('main .entity-tabs [data-slot=tabs-trigger]').nth(i).click({timeout:4000});
        }catch(e){results.push({label:'place/'+placeTabs[i][0],clickError:String(e).slice(0,90),consoleErrs:[]});continue;}
        await waitSettled(page);
      }
      const key='place';const surface=placeTabs[i][0];
      const r=await auditSurface(page,key+'/'+surface,true,vp.name);
      r.consoleErrs=[...new Set(errs)].slice(0,6);
      if(hasFinding(r.surface,r.consoleErrs)){try{await page.screenshot({path:shotName(vp.name,key,surface)});}catch{}}
      results.push(r);
    }
    await page.close();
  }

  // --- compare route (3 tabs) ---
  {
    const {page,errs}=await newPage('/#view=compare','main [data-slot=tabs-trigger]');
    for(let i=0;i<compareTabs.length;i++){
      if(i>0){
        try{
          await page.locator('main .entity-tabs [data-slot=tabs-trigger]').nth(i).click({timeout:4000});
        }catch(e){results.push({label:'compare/'+compareTabs[i][0],clickError:String(e).slice(0,90),consoleErrs:[]});continue;}
        await waitSettled(page);
      }
      const key='compare';const surface=compareTabs[i][0];
      const r=await auditSurface(page,key+'/'+surface,true,vp.name);
      r.consoleErrs=[...new Set(errs)].slice(0,6);
      if(hasFinding(r.surface,r.consoleErrs)){try{await page.screenshot({path:shotName(vp.name,key,surface)});}catch{}}
      results.push(r);
    }
    await page.close();
  }

  // --- 16 domains x (sections + data tab) = 62 surfaces ---
  for(const d of domains){
    const sections=topicSections[d];
    const {page,errs}=await newPage('/#view=domain&id='+d,'.domain-subcategories [data-slot=tabs-trigger]');
    const total=sections.length+1;
    for(let i=0;i<total;i++){
      const surface=i<sections.length?sections[i]:'data';
      if(i>0){
        try{
          await page.locator('.domain-subcategories [data-slot=tabs-trigger]').nth(i).click({timeout:4000});
        }catch(e){results.push({label:d+'/'+surface,clickError:String(e).slice(0,90),consoleErrs:[]});continue;}
        await waitSettled(page);
      }
      const r=await auditSurface(page,d+'/'+surface,true,vp.name);
      if(i===0){const meta=await page.evaluate(`((${collect.toString()})()).page()`);r.meta=meta;}
      r.consoleErrs=[...new Set(errs)].slice(0,6);
      if(hasFinding(r.surface,r.consoleErrs)){
        if(r.surface.gaps&&r.surface.gaps.length){
          try{await page.evaluate(sel=>{const el=document.querySelector(sel);el&&el.scrollIntoView({block:'center'})},r.surface.gaps[0].before);}catch{}
          await page.waitForTimeout(250);
        }
        try{await page.screenshot({path:shotName(vp.name,d,surface)});}catch{}
      }
      results.push(r);
    }
    await page.close();
    process.stdout.write(`\r[${vp.name}] domains ${domains.indexOf(d)+1}/16 done   `);
  }
  await context.close();
  console.log('');
}
await browser.close();

// ---------- Verdict report ----------
fs.writeFileSync(OUT+'/sweep-render.json',JSON.stringify({ssr,results},null,1));
console.log('SSR sanity:');
for(const s of ssr){
  const ok=s.status===200&&!s.errorDoc&&s.title&&(s.url!=='/design.html'||s.markers.metaRedirect)&&(s.url!=='/catalog'||s.markers.catalogHome);
  console.log(`  ${ok?'ok ':'FAIL'} ${s.name.padEnd(16)} status=${s.status} title="${(s.title||'').slice(0,45)}" markers=${JSON.stringify(s.markers)}${s.errorDoc?' ERRORDOC':''}`);
}
const issues=[];
for(const r of results){
  const s=r.surface;
  if(!s){if(r.clickError)issues.push({route:r.label,kind:'tab-click-failed',detail:r.clickError,sev:'blocks-usability'});continue;}
  if(s.overflowX>1)issues.push({route:r.label,detail:'overflowX='+s.overflowX,sev:'blocks-usability'});
  for(const k of['brokenImgs','oddSrcImgs','noImgCards','zeroSize'])for(const it of s[k])issues.push({route:r.label,vp:r.vp,kind:k,detail:JSON.stringify(it).slice(0,140),sev:'blocks-usability'});
  for(const it of s.smallInSlot)issues.push({route:r.label,kind:'smallInSlot',detail:JSON.stringify(it).slice(0,90),sev:'polish'});
  for(const it of s.cutoff)issues.push({route:r.label,kind:'cutoff-text',detail:JSON.stringify(it).slice(0,110),sev:it.tov==='ellipsis'?'polish':'blocks-usability'});
  for(const g of s.gaps)issues.push({route:r.label,kind:'whitespace-gap',detail:JSON.stringify(g).slice(0,140),sev:'polish'});
  for(const t of s.snake)issues.push({route:r.label,kind:'snake_case',detail:t.slice(0,100),sev:'polish'});
  for(const t of s.caps)issues.push({route:r.label,kind:'CAPS_TOKEN',detail:t.slice(0,40),sev:'polish'});
  for(const t of s.tokens)issues.push({route:r.label,kind:'programmatic-token',detail:t.slice(0,100),sev:'blocks-usability'});
  for(const t of s.grammar)issues.push({route:r.label,kind:'count-grammar',detail:JSON.stringify(t).slice(0,100),sev:'polish'});
  if(s.mapCredit&&(s.mapCredit.totalOcclusion>2||!s.mapCredit.withinRomap))issues.push({route:r.label,kind:'map-credit-occlusion',detail:JSON.stringify(s.mapCredit).slice(0,140),sev:'polish'});
  for(const t of s.vbottomOverlap)issues.push({route:r.label,kind:'vbottom-nav-overlap',detail:JSON.stringify(t).slice(0,100),sev:'polish'});
  if(s.activeEmpty&&!s.busy)issues.push({route:r.label,kind:'active-section-empty',detail:'no text in active tab (not loading)',sev:'blocks-usability'});
  for(const e of(r.consoleErrs||[]))issues.push({route:r.label,kind:'console',detail:e.slice(0,110),sev:'polish'});
}
console.log(`\nSurfaces audited: ${results.length} (domain surface count ${domainSurfaceCount})`);
const bySev={};for(const i of issues)bySev[i.sev]=(bySev[i.sev]||0)+1;
console.log('Issues: '+issues.length+' '+JSON.stringify(bySev));
const byRoute={};for(const i of issues)byRoute[i.route]=(byRoute[i.route]||0)+1;
const routes=Object.entries(byRoute).sort((a,b)=>b[1]-a[1]);
console.log('Top routes by issue count:');
for(const [r,n] of routes.slice(0,18))console.log(`  ${r} — ${n}`);
console.log('\nWorst findings (first 25):');
for(const i of issues.slice(0,25))console.log(`  [${i.sev}] ${i.route} ${i.kind?`(${i.kind})`:''} ${i.detail}`);
