import {chromium} from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
const responses = [];
page.on('response', r => { if (r.url().includes('stories')) responses.push(`${r.status()} ${r.url().slice(-42)} ${r.headers()['content-encoding']||'-'} ${r.headers()['content-type']}`); });
page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0,120)));
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,160)); });
await page.goto('http://127.0.0.1:5173/#view=explore');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000}).catch(()=>{});
await page.getByLabel('Caută în locuri și domenii').fill('harap');
await page.waitForTimeout(4000);
const state = await page.evaluate(async () => {
  const fetches = {};
  for (const url of ['/stories/manifest.json','/stories/index.json.gz']) {
    try { const r = await fetch(url); fetches[url] = r.status + ' enc=' + (r.headers.get('content-encoding')||'-') + ' type=' + (r.headers.get('content-type')||'-'); }
    catch (e) { fetches[url] = 'ERR ' + e.message; }
  }
  const groups = Array.from(document.querySelectorAll('[data-testid="federated-group"]')).map(g => g.getAttribute('data-group') + ':' + g.querySelectorAll('[data-testid="federated-row"]').length);
  return {groups, fetches};
});
console.log('GROUPS', state.groups.join(' '));
console.log('FETCHES', JSON.stringify(state.fetches, null, 1));
console.log('STORIES RESPONSES SEEN', responses.join(' | '));
await browser.close();
