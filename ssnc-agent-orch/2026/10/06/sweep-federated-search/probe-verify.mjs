// T1.3 follow-up: DOM-verify the candidate findings (cannot view screenshots in this session).
import {chromium} from '@playwright/test';

const BASE='http://localhost:5173';
const browser=await chromium.launch();

async function probe(vp,url,fn){
  const context=await browser.newContext({viewport:vp});
  const cache=new Map();
  await context.route('**/api/**',async route=>{
    const k=route.request().method()+' '+route.request().url()+' '+(route.request().postData()||'');
    if(cache.has(k))return route.fulfill(cache.get(k));
    const r=await route.fetch();const b=await r.body();const e={status:r.status(),headers:r.headers(),body:b};cache.set(k,e);
    return route.fulfill(e);
  });
  const page=await context.newPage();
  await page.goto(BASE+url,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(900);
  const out=await page.evaluate(fn);
  await context.close();
  return out;
}

// 1. Zero-size claim on home hero p + Freshness p
const zeroInspect=await probe({width:390,height:844},'/#view=dashboard',()=>{
  const out=[];
  const targets=['p','h3','div.weather-source-block','article'];
  const seen=new Set();
  for(const el of document.querySelectorAll('main '+targets.join(',main '))){
    const t=el.innerText;
    if(!t||!t.trim())continue;
    const r=el.getBoundingClientRect();
    if(r.width>=2&&r.height>=2)continue;
    if(seen.has(t.slice(0,25)))continue;seen.add(t.slice(0,25));
    const chain=[];
    let n=el;
    for(let i=0;i<6&&n;i++){
      const cs=getComputedStyle(n);
      chain.push(n.tagName.toLowerCase()+(typeof n.className==='string'?'.'+n.className.trim().split(/\s+/).slice(0,2).join('.'):'')+
        `{disp:${cs.display};pos:${cs.position};w:${Math.round(n.getBoundingClientRect().width)};h:${Math.round(n.getBoundingClientRect().height)};hidden:${n.hidden}}`);
      n=n.parentElement;
    }
    out.push({text:t.trim().slice(0,44),chain,offsetParent:!!el.offsetParent,clientRects:el.getClientRects().length});
    if(out.length>=8)break;
  }
  return out;
});
console.log('1. dashboard-390 zero-size element chains:');
console.log(JSON.stringify(zeroInspect,null,1).slice(0,3000));

// 2. city-story clipping — which child exceeds the button, and by how much; is text actually cut?
const cityStory=await probe({width:390,height:844},'/',()=>{
  const out=[];
  document.querySelectorAll('button.city-story').forEach(b=>{
    const br=b.getBoundingClientRect();
    const kids=[...b.children].map(c=>{const r=c.getBoundingClientRect();const cs=getComputedStyle(c);return{tag:c.tagName+(typeof c.className==='string'?'.'+c.className.trim().split(/\s+/).slice(0,2).join('.'):''),offRight:Math.round(r.right-br.right),w:Math.round(r.width),csW:cs.width,txt:(c.textContent||'').trim().slice(0,30)}});
    const cs=getComputedStyle(b);
    out.push({btnW:Math.round(br.width),btnScrollW:b.scrollWidth,cs:GetCS(b),kids});
  });
  function GetCS(b){const cs=getComputedStyle(b);return{overflowX:cs.overflowX,clip:cs.clip,clipPath:cs.clipPath};}
  return out;
});
console.log('\n2. home-390 city-story children overflow:');
console.log(JSON.stringify(cityStory,null,1).slice(0,1800));

// 3. the "34.128 locuri" grammar string — locate in live DOM (munca/news)
const grammar=await probe({width:390,height:844},'/#view=domain&id=munca',async()=>0);
const grammar2=await probe({width:390,height:844},'/#view=domain&id=munca',()=>{
  const p=document.querySelector('.domain-subcategories [data-slot=tabs-trigger]:nth(1)');
  if(p)p.click();
  return 0;
}).catch(e=>e);
const grammarCtx=await probe({width:390,height:844},'/#view=domain&id=munca',()=>{
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const hits=[];
  while(walker.nextNode()){
    const t=walker.currentNode.textContent;
    if(/locuri/.test(t)&&/\d/.test(t))hits.push({node:t.trim().slice(0,80),parentTag:walker.currentNode.parentElement&&(walker.currentNode.parentElement.className+'').slice(0,60)});
    if(hits.length>4)break;
  }
  return hits;
});
console.log('\n3. munca surface "locuri" count text nodes:');
console.log(JSON.stringify(grammarCtx,null,1).slice(0,1200));

// 4. duplicate-key console warning on agricultura/news — full text
const dupKey=await probe({width:390,height:844},'/#view=domain&id=agricultura',()=>0);
const dup=await (async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await page.goto(BASE+'/#view=domain&id=agricultura',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1200);
  const btn=await page.$('.domain-subcategories [data-slot=tabs-trigger]:nth(1)');
  if(btn)await btn.click();
  await page.waitForTimeout(1500);
  await context.close();
  return errs;
})();
console.log('\n4. agricultura/news console errors (full):');
dup.slice(0,3).forEach(e=>console.log(e.slice(0,700)));
await browser.close();
