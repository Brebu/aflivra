import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
// inspect the covering element from a non-home entry + what the first home tap hits
for (const hash of ['#view=dashboard', '#view=place&id=peles', '#view=watch']) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
  const page = await context.newPage();
  await page.goto(base + '/' + hash);
  await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
  await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === hash.includes('id=') ? (hash.split('&')[0].includes('place') ? 'place' : 'watch') : 'dashboard', null, {timeout: 20000}).catch(()=>{});
  for (const at of [200, 1200, 3000]) {
    await page.waitForTimeout(at === 200 ? 200 : at - 200);
    const info = await page.evaluate(() => {
      const nav = document.querySelector('.vbottom-nav');
      const r0 = nav.querySelectorAll('button')[0].getBoundingClientRect();
      const el = document.elementFromPoint(Math.round(r0.left + r0.width/2), Math.round(r0.top + r0.height/2));
      const chain = [];
      let n = el;
      for (let i = 0; i < 4 && n; i++) {chain.push({tag: n.tagName, cls: (n.className||'').toString().slice(0,80), pe: getComputedStyle(n).pointerEvents, z: getComputedStyle(n).zIndex, rect: JSON.parse(JSON.stringify(n.getBoundingClientRect()))}); n = n.parentElement;}
      return {at: performance.now(), el: {tag: el.tagName, cls: el.className?.toString().slice(0,80), pe: getComputedStyle(el).pointerEvents, z: getComputedStyle(el).zIndex}, chain};
    });
    console.log(hash, '@'+Math.round(info.at)+'ms', 'elementFromPoint(btn0):', info.el.tag, info.el.cls || '(no class)', 'pe=' + info.el.pe, 'z=' + info.el.z);
    if (info.el.tag !== 'BUTTON') console.log('   covering chain:', JSON.stringify(info.chain.map(c => c.tag + '.' + (c.cls||'').split(' ')[0] + '[pe:' + c.pe + ',z:' + c.z + ']')));
  }
  await context.close();
}
await browser.close();
