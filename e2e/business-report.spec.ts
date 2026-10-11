import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('raportul PDF păstrează sursele indisponibile și se descarcă din Firme',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('aflivra.location.v1',JSON.stringify({mode:'default'})));
 const calls:URL[]=[];
 await page.route('**/api/places?**',async route=>{const url=new URL(route.request().url());calls.push(url);await route.fulfill({json:{status:'cached',data:{total:1,pages:1,items:[{id:'node/1',name:'Cafenea de verificare',address:'București',lat:44.427,lon:26.103,distance:1}]}}})});
 await page.route('**/api/company?**',route=>route.fulfill({json:{status:'cached',data:{cui:'123456',name:'Firmă de verificare',history:[{year:2025,entries:[{code:'I13',value:100000},{code:'I18',value:5000},{code:'I19',value:0},{code:'I20',value:4}]}]}}}));
 await page.route('**/api/ins?**',route=>route.fulfill({json:{status:'unavailable',data:null,error:'INS indisponibil în verificare'}}));
 await page.route('**/api/ancpi?**',route=>route.fulfill({json:{status:'stale',data:{monthLabel:'ianuarie 2024',total:19023,byCounty:[]},error:'Copie istorică'}}));
 await page.route('**/api/energy-offers?**',route=>route.fulfill({json:{status:'unavailable',data:null,error:'POSF indisponibil în verificare'}}));
 await page.goto('/#view=domain&id=firme&tab=report');await expect(page.getByRole('heading',{name:'Raport integrat PDF',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Activitate sau nume de căutat'}).fill('cafenea');await page.getByRole('textbox',{name:'CUI-uri de comparat'}).fill('123456');await page.getByRole('spinbutton',{name:'Rază în km'}).fill('25');await page.getByRole('button',{name:'Generează raportul PDF',exact:true}).click();
 const link=page.getByRole('link',{name:'Descarcă PDF',exact:true});await expect(link).toBeVisible({timeout:60000});const result=page.locator('.report-result');await expect(result).toContainText('unavailable');await expect(result).toContainText('stale');expect(calls.some(url=>url.searchParams.get('radius')==='25'&&url.searchParams.get('scope')==='nearby')).toBe(true);
 const downloaded=page.waitForEvent('download');await link.click();const download=await downloaded;expect(download.suggestedFilename()).toMatch(/^Aflivra_raport_.*\.pdf$/);const file=await download.path();expect(file).not.toBeNull();const bytes=await readFile(file!);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(20000);
 await page.setViewportSize({width:390,height:844});await expect(link).toBeVisible();expect(await page.locator('.business-report').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 await page.goto('/#view=domain&id=bani&tab=report');await expect(page.getByRole('heading',{name:'Raport integrat PDF',exact:true})).toBeVisible();
});
