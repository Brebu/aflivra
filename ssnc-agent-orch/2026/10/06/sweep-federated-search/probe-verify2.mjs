// T1.3 follow-up 2: agricultura/news duplicate-key console warning source + home hero-p steady state.
import {chromium} from '@playwright/test';
const BASE='http://localhost:5173';
const browser=await chromium.launch();

// agricultura (news is the default first tab) — capture the full console error text
{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warn')errs.push(m.type()+': '+m.text())});
  page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await page.goto(BASE+'/#view=domain&id=agricultura',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2000);
  console.log('== agricultura defaults (news tab) console ==');
  errs.forEach(e=>console.log(e.slice(0,500)));
  // find duplicated keys in DOM: feed cards with identical identity attributes
  const dup=await page.evaluate(()=>{
    const out={};
    for(const sel of['.news-item','.feed-card','article']){
      const els=[...document.querySelectorAll(sel)];
      const texts=new Map();
      for(const el of els){const k=(el.querySelector('h3,h2,strong')?.textContent||'').trim();texts.set(k,(texts.get(k)||0)+1);}
      const d=[...texts.entries()].filter(([k,n])=>k&&n>1);
      if(d.length||els.length)out[sel]={count:els.length,dups:d.slice(0,4)};
    }
    return out;
  });
  console.log('DOM identity check:',JSON.stringify(dup,null,1).slice(0,700));
  await context.close();
}

// home hero p steady-state rect (was 0x0 in battery at ~1s on 390)
{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  const page=await context.newPage();
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
  for(const t of [400,900,1600,2600]){
    await page.waitForTimeout(t===400?400:t-(previous||0));var previous=t;
    const r=await page.evaluate(()=>{
      const hits=[...document.querySelectorAll('main p')].filter(p=>p.textContent.includes('Locuri care inspiră')).map(p=>{const b=p.getBoundingClientRect();return{w:b.width,h:b.height,rects:p.getClientRects().length,txt:p.innerText.slice(0,30)}});
      return hits;
    });
    console.log(`home hero p @${t}ms:`,JSON.stringify(r));
  }
  await context.close();
}
await browser.close();
