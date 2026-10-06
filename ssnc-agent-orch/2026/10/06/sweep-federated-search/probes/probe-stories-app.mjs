import {chromium} from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0,200)));
page.on('console', m => { if (m.type()==='error' || /warn/i.test(m.type())) console.log('CONSOLE', m.type(), m.text().slice(0,200)); });

// 1. The stories workspace itself: does the corpus load app-wide?
await page.goto('http://127.0.0.1:5173/#view=domain&id=povesti');
await page.waitForTimeout(4500);
const manifestLine = await page.locator('.stories-workspace .small-muted').first().innerText().catch(()=> 'NO MANIFEST LINE');
console.log('WORKSPACE:', manifestLine);

// 2. Federated search for a story term
await page.goto('http://127.0.0.1:5173/#view=explore');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000}).catch(()=>{});
await page.getByLabel('Caută în locuri și domenii').fill('harap');
await page.waitForTimeout(8000);
const groups = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="federated-group"]')).map(g => g.getAttribute('data-group') + ':' + g.querySelectorAll('[data-testid="federated-row"]').length + ':[' + Array.from(g.querySelectorAll('[data-testid="federated-row"] strong')).map(s => s.textContent).join(',').slice(0,80) + ']'));
console.log('FEDERATED GROUPS:', JSON.stringify(groups));
await browser.close();
