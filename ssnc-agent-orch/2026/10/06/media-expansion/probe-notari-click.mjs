import {chromium} from '@playwright/test';
const browser=await chromium.launch();
const page=await browser.newPage();
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE-ERR:',m.text().slice(0,200))});
page.on('pageerror',e=>console.log('PAGE-ERR:',String(e).slice(0,200)));
await page.goto('http://127.0.0.1:5173/#view=domain&id=justitie&tab=notari');
await page.waitForFunction(()=>localStorage.getItem('reper.v2.preferences')!==null);
const box=page.getByLabel('Caută notar în registrul profesional');
await box.fill('cazacu');
await box.press('Enter');
await page.waitForSelector('.record-list article .record-heading',{timeout:60000});
await page.waitForTimeout(1000);
const before=await page.locator('.record-list article').count();
console.log('articles before click:',before);
await page.locator('.record-list article .record-heading').first().click();
await page.waitForTimeout(1200);
const after=await page.evaluate(()=>{
  const arts=[...document.querySelectorAll('.record-list article')];
  return arts.map(a=>({heading:a.querySelector('.record-heading')?.textContent?.trim().slice(0,60),expanded:a.querySelector('.record-heading')?.getAttribute('aria-expanded'),fields:!!a.querySelector('.record-fields'),dtCount:a.querySelectorAll('.record-fields dt').length}));
});
console.log('after click:',JSON.stringify(after,null,1));
const buttons=await page.evaluate(()=>{
  const btn=document.querySelector('.record-list article .record-heading');
  return btn?{html:btn.outerHTML.slice(0,300)}:null;
});
console.log('button html:',JSON.stringify(buttons));
await browser.close();
