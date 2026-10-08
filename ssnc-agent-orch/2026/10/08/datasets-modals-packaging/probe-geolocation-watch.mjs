import {chromium} from '@playwright/test';

const watchCode = () => {
  window.__geoLog = [];
  navigator.geolocation.watchPosition(p => window.__geoLog.push('fix ' + p.coords.latitude.toFixed(4) + ',' + p.coords.longitude.toFixed(4) + ' acc ' + p.coords.accuracy), e => window.__geoLog.push('error ' + e.code + ' ' + e.message), {enableHighAccuracy: false, timeout: 12000, maximumAge: 60000});
};

const log = page => page.evaluate(() => window.__geoLog);

// Variant A: initial position via CDP only (no context-level geolocation), update via one direct CDP call.
const cdpOnly = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({permissions: ['geolocation']});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setGeolocationOverride', {latitude: 44.4268, longitude: 26.1025, accuracy: 65});
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(watchCode);
  await page.waitForTimeout(1200);
  const before = await log(page);
  await cdp.send('Emulation.setGeolocationOverride', {latitude: 44.4288, longitude: 26.1025, accuracy: 80});
  await page.waitForTimeout(2500);
  console.log('cdp-single-call:', JSON.stringify({before, after: await log(page)}));
  await browser.close();
};

// Variant B: context geolocation at creation, then a second direct CDP call for the drift.
const contextThenCdp = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({permissions: ['geolocation'], geolocation: {latitude: 44.4268, longitude: 26.1025, accuracy: 65}});
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(watchCode);
  await page.waitForTimeout(1200);
  const before = await log(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setGeolocationOverride', {latitude: 44.4288, longitude: 26.1025, accuracy: 80});
  await page.waitForTimeout(2500);
  console.log('context-then-cdp:', JSON.stringify({before, after: await log(page)}));
  await browser.close();
};

await cdpOnly();
await contextThenCdp();
