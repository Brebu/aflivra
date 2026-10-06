// T1.3 follow-up 3: hero <p> zero-size — ancestor chain + style resolution + 1280 check.
import {chromium} from '@playwright/test';
const BASE='http://localhost:5173';
const browser=await chromium.launch();
for(const vp of [{width:390,height:844},{width:1280,height:800}]){
  const context=await browser.newContext({viewport:vp});
  const page=await context.newPage();
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1500);
  const out=await page.evaluate(()=>{
    const all=[...document.querySelectorAll('main p')].filter(p=>p.textContent.includes('Locuri care inspiră'));
    return all.map(p=>{
      const chain=[];
      let n=p;
      for(let i=0;i<8&&n;i++){
        const cs=getComputedStyle(n);
        const r=n.getBoundingClientRect();
        chain.push({n:n.tagName.toLowerCase()+(typeof n.className==='string'?'.'+n.className.trim().split(/\s+/).slice(0,3).join('.'):''),
          display:cs.display,visibility:cs.visibility,opacity:cs.opacity,contentVisibility:cs.contentVisibility,
          w:Math.round(r.width),h:Math.round(r.height),hiddenAttr:n.hidden?true:undefined});
        n=n.parentElement;
      }
      return {chain,textLen:p.textContent.length,dupsInDom:all.length};
    });
  });
  console.log(`\n== hero p @ ${vp.width} ==`);
  console.log(JSON.stringify(out,null,1).slice(0,2200));
  // also: is ANY text visually present inside .hero-content at all?
  const heroInfo=await page.evaluate(()=>{
    const h=document.querySelector('.hero-content');
    if(!h)return null;
    const r=h.getBoundingClientRect();
    const kids=[...h.children].map(c=>{const cr=c.getBoundingClientRect();const cs=getComputedStyle(c);return{tag:c.tagName+'.'+(typeof c.className==='string'?c.className.trim().split(/\s+/)[0]:''),w:Math.round(cr.width),h:Math.round(cr.height),disp:cs.display};});
    return {heroContent:{w:Math.round(r.width),h:Math.round(r.height)},kids,h1:(document.querySelector('.hero h1')?.getBoundingClientRect().height)};
  });
  console.log('hero-content children:',JSON.stringify(heroInfo,null,1).slice(0,900));
  await context.close();
}
await browser.close();
