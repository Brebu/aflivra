// Hero provenance removal probe: visual + SSR proof for the decluttered home hero.
// A) SSR: the server-rendered homepage HTML carries none of the removed inline-provenance
//    strings (caption stack, "Fotografia originală" button, the "Proveniență și
//    transformări" export widget) and no reference to hero-style.json.
// B) DOM after hydration: section.hero keeps image + heading + search + chips +
//    scroll hint, with zero provenance strings; the CategoryDirectory licenses panel
//    keeps its "Format pentru surse și licențe" export trigger.
// C) The exported licenses manifest carries the moved hero credit: xulescu_g,
//    CC BY-SA 2.0, the Commons file page and the original-photograph link.
import {chromium} from '@playwright/test';

const BASE='http://localhost:5173';
const OUT=process.argv[2]||'probes/hero-provenance.json';
const removed=['ILUSTRAȚIE EDITORIALĂ','După o fotografie de xulescu_g','Fotografia originală','Proveniență și transformări','Format pentru proveniență','hero-style.json'];

const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));

// A) SSR HTML as served.
const ssrResponse=await context.request.get(BASE+'/');
const ssr=ssrResponse.ok()?(await ssrResponse.text()):'';
const ssrLeaks=removed.filter(text=>ssr.includes(text));
const ssrPanels=ssr.includes('Surse și licențe')&&ssr.includes('Format pentru surse și licențe');

// B) Rendered DOM.
await page.goto(BASE+'/');
await page.waitForSelector('section.hero');
const heroText=await page.locator('section.hero').innerText();
const heroDomLeaks=removed.filter(text=>heroText.includes(text));
const heroEssentials=await page.evaluate(()=>{
  const hero=document.querySelector('section.hero');
  const img=hero?.querySelector('img.hero-photo');
  return {
    heroImage:(img?.getAttribute('src')||'')+' | alt: '+(img?.getAttribute('alt')||''),
    heading:hero?.querySelector('h1')?.textContent?.trim()||'',
    searchLabel:document.querySelector('label[for="home-query"]')?.textContent?.trim()||'',
    suggestionChips:hero?Array.from(hero.querySelectorAll('.hero-suggestions button')).map(b=>b.textContent?.trim()):[],
    scrollHint:hero?.querySelector('.hero-scroll')?.textContent?.trim()||''
  };
});
const licensesPanel=await page.evaluate(()=>{
  const footer=document.querySelector('.category-directory-footer');
  const select=footer?.querySelector('select');
  const button=footer?.querySelector('button');
  return {
    panelText:footer?.textContent?.replace(/\s+/g,' ').trim()||'',
    selectAriaLabel:select?.getAttribute('aria-label')||'',
    selectOptions:select?Array.from(select.options).map(o=>o.textContent?.trim()):[],
    exportButton:button?.textContent?.replace(/\s+/g,' ').trim()||''
  };
});
const heroSideCount=await page.locator('.hero-side').count();

// C) The moved credit in the manifest the licenses panel exports.
const manifestResponse=await context.request.get(BASE+'/media/category-manifest.json');
const manifest=manifestResponse.ok()?await manifestResponse.json():[];
const heroCredit=manifest.find(entry=>entry&&entry.category==='editorial-hero');

const result={
  when:new Date().toISOString(),
  url:BASE+'/',
  ssr:{
    status:ssrResponse.status(),
    provenanceStringsInSsr:ssrLeaks,
    surrogatePairsChecked:removed,
    licensesPanelInSsr:ssrPanels
  },
  dom:{
    heroProvenanceLeaks:heroDomLeaks,
    heroSideElements:heroSideCount,
    heroEssentials,
    licensesPanel,
    pageErrors:errors
  },
  movedCredit:{
    manifestStatus:manifestResponse.status(),
    manifestEntries:Array.isArray(manifest)?manifest.length:-1,
    heroCredit
  },
  verdict:''
};

const ok=ssrResponse.status()===200
  &&ssrLeaks.length===0&&ssrPanels
  &&heroDomLeaks.length===0&&heroSideCount===0
  &&errors.length===0
  &&heroEssentials.heroImage.includes('hero-graphite-blue.webp')
  &&heroEssentials.searchLabel==='Caută în Aflivra'
  &&heroEssentials.suggestionChips.length===3
  &&licensesPanel.selectAriaLabel==='Format pentru surse și licențe'
  &&manifestResponse.status()===200
  &&manifest.length===29
  &&heroCredit&&heroCredit.credit==='xulescu_g / Wikimedia Commons'
  &&heroCredit.license==='CC BY-SA 2.0'
  &&String(heroCredit.sourceUrl).startsWith('https://commons.wikimedia.org/wiki/File:Bucegi')
  &&String(heroCredit.originalUrl).startsWith('https://upload.wikimedia.org/');
result.verdict=ok?'PASS — hero provenance hidden; credit exported in the licenses panel':'FAIL — see fields above';
console.log(result.verdict);
console.log(JSON.stringify({ssrProvenanceLeaks:ssrLeaks,domHeroLeaks:heroDomLeaks,heroSideElements:heroSideCount,licensesSelect:licensesPanel.selectAriaLabel,manifestEntries:manifest.length,heroCredit},null,1));
const {writeFile}=await import('node:fs/promises');
await writeFile(OUT,JSON.stringify(result,null,1)+'\n');
await browser.close();
process.exit(ok?0:1);
