// T1.3 follow-up 4: DOM owner of the "2026 rezultate" grammar hits on educatie/news.
import {chromium} from '@playwright/test';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:800}});
const cache=new Map();
await context.route('**/api/**',async r=>{
  const k=r.request().method()+' '+r.request().url();
  if(cache.has(k))return r.fulfill(cache.get(k));
  const resp=await r.fetch();const bd=await resp.body();
  const e={status:resp.status(),headers:resp.headers(),body:bd};cache.set(k,e);
  return r.fulfill(e);
});
const page=await context.newPage();
await page.goto('http://localhost:5173/#view=domain&id=educatie',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(900);
// news is educatie's first tab — active by default
const hits=await page.evaluate(()=>{
  const out=[];
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const t=walker.currentNode.textContent;
    if(/2026\s+rezultate/.test(t)){
      const el=walker.currentNode.parentElement;
      let n=el;const chain=[];
      for(let i=0;i<6&&n;i++){chain.push(n.tagName.toLowerCase()+(typeof n.className==='string'&&n.className.trim()?'.'+n.className.trim().split(/\s+/).slice(0,2).join('.'):''));n=n.parentElement;}
      out.push({text:t.trim().slice(0,120),owner:chain.join(' > ')});
    }
    if(out.length>4)break;
  }
  return out;
});
console.log(JSON.stringify(hits,null,1).slice(0,1500));
await browser.close();
