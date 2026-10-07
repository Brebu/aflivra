import {test, expect, type Page, type Route} from '@playwright/test';

// Watch („Urmărește") v1 — UI legs against the frozen Builder-A contract:
//   POST   /api/watch            {installId, kind, ref, label?} → {watch:{id,kind,ref,label,createdAt,muted}}
//   DELETE /api/watch?installId&kind&ref → {deleted}
//   GET    /api/watch?installId  → {watches:[{id,kind,ref,label,createdAt,muted,lastEventAt,unseenCount}],
//                                   sweepState:{runsPerDay,timesUtc,lastRunAt,lastEvents,lastPushes,lastOk,note},
//                                   notification:{vapidPublicKey},kinds:[…]}
//   GET    /api/watch-events?installId → {events:[{id,kind,ref,title,body,url,createdAt,seen}],hasMore}
//   POST   /api/watch-events/ack {installId, ids:[…]} → {acked}
//   POST   /api/watch/subscribe  {installId, subscription:{endpoint, keys:{p256dh, auth}}} → {subscribed}
//   DELETE /api/watch/subscribe?installId&endpoint → {removed} (off-toggle clears the server row too)
//   POST   /api/watch/mute       {installId, kind, ref, muted:boolean} → {muted} (v1 addendum)
//   POST   /api/watch/purge      {installId} → {purged:{watches,events,subscriptions}}
// The installId is the client-generated UUIDv4; the badge clears after the feed is viewed (ack).
const installIdRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const seededInstallId = '11111111-2222-4333-a444-555555555555';
const now = () => new Date().toISOString();

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

type WatchCall = {method: string; pathname: string; url: URL; body: any};
type WatchTable = {
  list?: any; add?: any; remove?: any; purge?: any;
  events?: any; ack?: any; subscribe?: any;
  mute?: any; unsubscribe?: any;
};
// One regex covers /api/watch, /api/watch-events(+/ack), /api/watch/subscribe, /api/watch/purge —
// a glob would not (Playwright's `*` does not match '/'). Every watch request is captured;
// default responses follow the contract, per-leg fixtures override.
async function installWatchRoutes(page: Page, table: WatchTable) {
  const calls: WatchCall[] = [];
  const fulfill = (route: Route, payload: any) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(payload)});
  // The stub keeps the active watch set like the real D1 rows: POST adds, DELETE removes,
  // purge clears, GET lists the survivors — the load the client does after its first add
  // must not smuggle back an empty list.
  const activeWatches: any[] = (table.list?.watches ?? []).map((row: any) => ({...row}));
  const echoRow = (body: any) => ({id: 'w-' + String(body.kind) + '-' + String(body.ref).replace(/[^a-zA-Z0-9]/g, ''), kind: body.kind, ref: body.ref, label: body.label ?? null, createdAt: now(), muted: false});
  await page.route(/\/api\/watch/, async route => {
    const request = route.request(), url = new URL(request.url());
    let bodyJson: any = null;
    try {bodyJson = request.postDataJSON();} catch {}
    calls.push({method: request.method(), pathname: url.pathname, url, body: bodyJson});
    const respond = (payload: any) => fulfill(route, payload);
    if (url.pathname === '/api/watch' && request.method() === 'GET') return respond({...watchListState(), ...(table.list ?? {}), watches: activeWatches.map((row: any) => ({...row}))});
    if (url.pathname === '/api/watch' && request.method() === 'POST') {
      if (table.add) return respond(table.add);
      const body = bodyJson ?? {};
      const row = echoRow(body);
      if (!activeWatches.some((existing: any) => existing.kind === body.kind && existing.ref === body.ref)) activeWatches.push({...row});
      return respond({watch: row});
    }
    if (url.pathname === '/api/watch' && request.method() === 'DELETE') {
      if (!table.remove) {
        const index = activeWatches.findIndex((row: any) => row.kind === url.searchParams.get('kind') && row.ref === url.searchParams.get('ref'));
        if (index >= 0) activeWatches.splice(index, 1);
      }
      return respond(table.remove ?? {deleted: true});
    }
    if (url.pathname === '/api/watch-events' && request.method() === 'GET') return respond(table.events ?? watchEventsState());
    if (url.pathname === '/api/watch-events/ack') return respond(table.ack ?? {acked: (bodyJson?.ids ?? []).length});
    if (url.pathname === '/api/watch/subscribe' && request.method() === 'POST') return respond(table.subscribe ?? {subscribed: true});
    // The off toggle clears the server row for THIS device's endpoint, per the v1 addendum.
    if (url.pathname === '/api/watch/subscribe' && request.method() === 'DELETE') return respond(table.unsubscribe ?? {removed: true});
    if (url.pathname === '/api/watch/mute' && request.method() === 'POST') {
      // Stateful like the watch rows: the muted flag lands on the stub row so a later list load stays truthful.
      if (!table.mute) {
        const row = activeWatches.find((existing: any) => existing.kind === bodyJson?.kind && existing.ref === bodyJson?.ref);
        if (row) row.muted = bodyJson?.muted === true;
      }
      return respond(table.mute ?? {muted: bodyJson?.muted === true});
    }
    if (url.pathname === '/api/watch/purge') {
      if (!table.purge) activeWatches.splice(0, activeWatches.length);
      return respond(table.purge ?? {purged: {watches: activeWatches.length + 1, events: 1, subscriptions: 0}});
    }
    return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({error: 'Ruta de urmărire nu există.'})});
  });
  const callsUntil = (predicate: (call: WatchCall) => boolean, timeoutMs = 25_000) => new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const found = calls.find(call => predicate(call));
      if (found) {resolve(); return}
      if (Date.now() - startedAt > timeoutMs) {reject(Error('Ruta de urmărire așteptată nu a fost chemată.')); return}
      setTimeout(check, 50);
    };
    check();
  });
  return {calls, callsUntil};
}

const watchRow = (kind: string, ref: string, over: Record<string, unknown> = {}) => ({
  id: 'w-' + kind + '-' + ref.replace(/[^a-zA-Z0-9]/g, ''),
  kind, ref, label: ref, createdAt: now(), muted: false, lastEventAt: null, unseenCount: 0, ...over,
});
const watchListState = (over: Record<string, unknown> = {}) => ({
  watches: [],
  sweepState: {runsPerDay: 3, timesUtc: '04:28, 10:28, 16:28', lastRunAt: now(), lastEvents: 0, lastPushes: 0, lastOk: true, note: 'verificăm de 3 ori pe zi'},
  notification: {vapidPublicKey: null},
  kinds: ['dosar', 'firma', 'localitate', 'act', 'venue', 'meteo'],
  ...over,
});
const watchEventsState = (events: Record<string, unknown>[] = [], over: Record<string, unknown> = {}) => ({events: [...events], hasMore: false, ...over});

// A minimal court response shaped like the portal loader the Courts workspace serves, for the dosar leg.
const courtDosar = () => ({
  id: '6236/111/2017|CurteaDeApelORADEA|fix', number: '6236/111/2017', court: 'CurteaDeApelORADEA', courtLabel: 'Curtea de Apel Oradea',
  category: 'civil', subject: 'pretenții', stage: 'Apel', department: 'Secția civilă', date: '21.08.2023', modified: '05.10.2026',
  parties: [{name: 'Parte publicată', role: 'Reclamant'}],
  hearings: [{date: '08.11.2023', time: '10:00', panel: 'Complet fix', result: 'Soluție', summary: '', document: '', documentNumber: ''}],
  appeals: [],
});
const courtSourceState = () => ({
  key: 'legal:courts', name: 'Portalul instanțelor · dosare', url: 'https://portal.just.ro', adapterVersion: 'portal.deep-records.v6',
  status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 300,
  data: {items: [courtDosar()], searchScope: 'number-all-courts', note: 'Fișă publică din portalul instanțelor.'},
});

// A minimal act + full-text fixture shaped like the legislative reader loader, for the act leg.
const actSummary = () => ({
  id: 'law-' + 'ab'.repeat(32), title: 'CODUL CIVIL din 17 iulie 2009', type: 'Lege', number: '71/2011',
  date: '2009-07-17', issuer: 'Parlamentul României', publication: 'Monitorul Oficial', sourceUrl: 'https://legislatie.just.ro/Public/DetaliiDocument/123',
});
const actFull = () => ({...actSummary(), text: 'Art. 1\n(1) Legea civilă stabilește regulile.\n\nArt. 2\n(1) Alt text de aplicare.', textProvided: true});
const lawSourceState = (items: Record<string, unknown>[]) => ({
  key: 'law:verified-copy', name: 'Portal Legislativ · căutare', url: 'https://legislatie.just.ro', adapterVersion: 'law.soap.v2',
  status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600,
  data: {items, hasMore: false, pageSize: items.length},
});

// Company view fixture for the push deep-link leg (ANAF shape the CompanyView reads).
const companyState = () => ({
  key: 'company:427282', name: 'Firme · ANAF', url: 'https://webservicesp.anaf.ro', adapterVersion: 'anaf.public-search.v2',
  status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 86400,
  data: {
    name: 'Monitorul Oficial RA', cui: '427282', address: 'București', inactive: false, vat: true, year: 2024,
    history: [{year: 2024, entries: [{label: 'Cifra de afaceri', value: 123456789}, {label: 'Profit net', value: 1000}, {label: 'Număr mediu de salariați', value: 120}]}],
    sources: [],
  },
});

async function openCenter(page: Page) {
  await page.goto('/#view=watch');
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'watch');
  await waitForClientReady(page);
}

test.describe('Watch — „Urmărește" butoane pe suprafețe', () => {
  test('dosar: căutarea dosarului oferă „Urmărește dosarul", adăugarea trimite installId UUIDv4 + kind + ref + label', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {});
    await page.route('**/api/legal', async route => {
      if (route.request().method() === 'POST') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(courtSourceState())});
      return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({error: 'necunoscut'})});
    });

    await page.goto('/#view=domain&id=justitie&tab=legal');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    await page.getByRole('tab', {name: 'Dosare în instanță'}).click();
    await page.getByLabel('Număr dosar', {exact: true}).fill('6236/111/2017');
    await page.getByRole('button', {name: 'Caută dosare'}).click();

    // The dosar-level „parcurs" panel carries the watch button for the whole case number.
    const panel = page.locator('.court-history-panel', {hasText: 'Parcursul dosarului 6236/111/2017'});
    await expect(panel).toBeVisible({timeout: 30_000});
    const follow = panel.getByRole('button', {name: 'Urmărește dosarul 6236/111/2017'});
    await expect(follow).toBeVisible();
    expect(await follow.getAttribute('aria-pressed')).toBe('false');
    await follow.click();

    // The POST body is exactly the contract shape; the installId is a fresh client UUIDv4.
    await watch.callsUntil(call => call.method === 'POST' && call.pathname === '/api/watch');
    const add = watch.calls.find(call => call.method === 'POST' && call.pathname === '/api/watch')!;
    expect(add.body.kind).toBe('dosar');
    expect(add.body.ref).toBe('6236/111/2017');
    expect(add.body.label).toBe('Dosar 6236/111/2017');
    expect(add.body.installId, 'installId must be the client UUIDv4').toMatch(installIdRe);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('aflivra.install.v1'))).toMatch(installIdRe);

    // The button toggles like the SaveButton precedent: pressed state + state word on the unfollow identity.

    const followed = panel.getByRole('button', {name: 'Nu mai urmări dosarul 6236/111/2017'});
    await expect(followed).toHaveAttribute('aria-pressed', 'true', {timeout: 25_000});
    await expect(followed).toContainText('Dosar urmărit');

    // The center lists the watch, scoped to the same installId (hash navigation; the bottom bar is mobile-only CSS).
    await page.goto('/#view=watch');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'watch');
    await watch.callsUntil(call => call.method === 'GET' && call.pathname === '/api/watch');
    const list = watch.calls.find(call => call.method === 'GET' && call.pathname === '/api/watch');
    expect(list?.url.searchParams.get('installId')).toBe(add.body.installId);
    await expect(page.getByRole('heading', {level: 1, name: 'Ce s-a schimbat.'})).toBeVisible();
    await expect(page.locator('.watch-item', {hasText: '6236/111/2017'})).toBeVisible();
    // Honest sweep cadence from the backend sweep state.
    await expect(page.locator('.watch-sweep')).toContainText('de 3 ori pe zi');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('localitate: comutatorul de localitate din preferințe oferă „Urmărește localitatea Cluj-Napoca"', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {});
    await page.goto('/');
    await waitForClientReady(page);

    await page.getByRole('button', {name: 'Pentru tine: localitate, interese și aspect'}).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Localitate', {exact: true}).fill('Cluj-Napoca');
    await sheet.getByRole('button', {name: 'Aplică localitatea'}).click();
    await page.keyboard.press('Escape');

    // Reopen the sheet: the watch row references the active locality.
    await page.getByRole('button', {name: 'Pentru tine: localitate, interese și aspect'}).click();
    const follow = page.getByRole('dialog').getByRole('button', {name: 'Urmărește localitatea Cluj-Napoca'});
    await expect(follow).toBeVisible();
    await follow.click();

    await watch.callsUntil(call => call.method === 'POST' && call.pathname === '/api/watch');
    const add = watch.calls.find(call => call.method === 'POST' && call.pathname === '/api/watch')!;
    expect(add.body).toMatchObject({kind: 'localitate', ref: 'Cluj-Napoca', label: 'Cluj-Napoca'});
    expect(add.body.installId).toMatch(installIdRe);
    const followed = page.getByRole('dialog').getByRole('button', {name: 'Nu mai urmări localitatea Cluj-Napoca'});
    await expect(followed).toHaveAttribute('aria-pressed', 'true', {timeout: 25_000});
    await expect(followed).toContainText('Localitate urmărită');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('venue: calendarul instituției oferă „Urmărește spectacolele de la <venue>" și trimite kind venue + ref din registru', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {});
    await page.route('**/api/events*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
      key: 'events:odeon', name: 'Teatrul Odeon · calendarul public', url: 'https://teatrul-odeon.ro/', adapterVersion: 'events.jsonld.v2',
      status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600,
      data: {venue: {id: 'odeon', name: 'Teatrul Odeon', city: 'București', county: 'București', latitude: 44.43667, longitude: 26.09738, url: 'https://teatrul-odeon.ro/', kind: 'jsonld'}, items: [], venueCount: 1, sourceUrl: 'https://teatrul-odeon.ro/', note: 'Program publicat de Teatrul Odeon.'},
    })}));
    await page.goto('/#view=domain&id=cultura&tab=events');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);

    const follow = page.getByRole('button', {name: 'Urmărește spectacolele de la Teatrul Odeon'});
    await expect(follow).toBeVisible({timeout: 30_000});
    await follow.click();

    await watch.callsUntil(call => call.method === 'POST' && call.pathname === '/api/watch');
    const add = watch.calls.find(call => call.method === 'POST' && call.pathname === '/api/watch')!;
    expect(add.body).toMatchObject({kind: 'venue', ref: 'odeon', label: 'Teatrul Odeon'});
    const followed = page.getByRole('button', {name: 'Nu mai urmări spectacolele de la Teatrul Odeon'});
    await expect(followed).toHaveAttribute('aria-pressed', 'true', {timeout: 25_000});
    await expect(followed).toContainText('Spectacole urmărite');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('act: cititorul actului normativ oferă „Urmărește actul" cu ref-ul actului și titlul ca label', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {});
    await page.route('**/api/legal', async route => {
      if (route.request().method() !== 'POST') return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({error: 'necunoscut'})});
      const body = route.request().postDataJSON();
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(lawSourceState([body.full ? actFull() : actSummary()]))});
    });
    await page.goto('/#view=domain&id=justitie&tab=legal');
    await waitForClientReady(page);
    await page.getByLabel('Titlul sau subiectul actului').fill('codul civil');
    await page.getByRole('button', {name: 'Caută acte normative'}).click();
    await expect(page.locator('.law-result', {hasText: 'CODUL CIVIL din 17 iulie 2009'})).toBeVisible({timeout: 30_000});
    await page.locator('.law-result', {hasText: 'CODUL CIVIL din 17 iulie 2009'}).getByRole('button', {name: 'Citește actul'}).click();

    const reader = page.locator('.reader-dialog');
    await expect(reader).toBeVisible({timeout: 30_000});
    const follow = reader.getByRole('button', {name: 'Urmărește actul CODUL CIVIL din 17 iulie 2009'});
    await expect(follow).toBeVisible();
    await follow.click();

    await watch.callsUntil(call => call.method === 'POST' && call.pathname === '/api/watch');
    const add = watch.calls.find(call => call.method === 'POST' && call.pathname === '/api/watch')!;
    expect(add.body).toMatchObject({kind: 'act', ref: 'law-' + 'ab'.repeat(32), label: 'CODUL CIVIL din 17 iulie 2009'});
    expect(add.body.installId).toMatch(installIdRe);
    const followed = reader.getByRole('button', {name: 'Nu mai urmări actul CODUL CIVIL din 17 iulie 2009'});
    await expect(followed).toHaveAttribute('aria-pressed', 'true', {timeout: 25_000});
    await expect(followed).toContainText('Act urmărit');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Watch — centru „Ce s-a schimbat"', () => {
  test('lista cu numărători nevizivate, badge pe bara de jos, ack la vizionare și deep-link spre dosar', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {
      list: watchListState({watches: [
        watchRow('dosar', '6236/111/2017', {label: 'Dosar 6236/111/2017', unseenCount: 2, lastEventAt: now()}),
        watchRow('venue', 'odeon', {label: 'Teatrul Odeon'}),
      ]}),
      events: watchEventsState([
        {id: 'evt-2', kind: 'dosar', ref: '6236/111/2017', title: 'Ședință nouă în dosarul 6236/111/2017', body: 'Soluție pronunțată la Curtea de Apel Oradea.', url: '/#view=watch&event=evt-2', createdAt: now(), seen: false},
        {id: 'evt-1', kind: 'dosar', ref: '6236/111/2017', title: 'Termen nou în dosarul 6236/111/2017', body: 'Ședință programată.', url: '/#view=watch&event=evt-1', createdAt: now(), seen: false},
        {id: 'evt-3', kind: 'venue', ref: 'odeon', title: 'Spectacol nou în calendarul Teatrului Odeon', body: 'Spectacol adăugat în calendarul public.', url: '/#view=watch&event=evt-3', createdAt: now(), seen: true},
      ]),
    });
    await page.route('**/api/events*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
      key: 'events:odeon', name: 'Teatrul Odeon · calendarul public', url: 'https://teatrul-odeon.ro/', adapterVersion: 'events.jsonld.v2',
      status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600,
      data: {venue: {id: 'odeon', name: 'Teatrul Odeon', city: 'București', county: 'București', latitude: 44.43667, longitude: 26.09738, url: 'https://teatrul-odeon.ro/', kind: 'jsonld'}, items: [], venueCount: 1, sourceUrl: 'https://teatrul-odeon.ro/', note: 'Program publicat de Teatrul Odeon.'},
    })}));
    // A prior install exists (the user has watched before): badge truth comes from the server list.
    await page.addInitScript(id => {
      if (!sessionStorage.getItem('aflivra.watch.no-seed')) localStorage.setItem('aflivra.install.v1', id);
    }, seededInstallId);

    await page.goto('/');
    await waitForClientReady(page);
    // The bottom-nav badge shows the server-unseen total while the center was not visited.
    await expect(page.locator('.vbottom-nav button', {hasText: 'Urmărite'})).toContainText('2', {timeout: 30_000});

    await openCenter(page);
    // Honest sweep cadence + times, rendered as UTC.
    const sweep = page.locator('.watch-sweep');
    await expect(sweep).toContainText('de 3 ori pe zi');
    await expect(sweep).toContainText('04:28, 10:28, 16:28');
    await expect(sweep).toContainText('UTC');

    // One row per watch, with the unseen counts that arrived with the last events (dosar: 2).
    const dosarRow = page.locator('.watch-item', {hasText: '6236/111/2017'});
    await expect(dosarRow).toBeVisible({timeout: 30_000});
    await expect(dosarRow).toContainText('Dosar');
    await expect(dosarRow).toContainText('2 schimbări nevizitate');
    const venueRow = page.locator('.watch-item', {hasText: 'Teatrul Odeon'});
    await expect(venueRow).toBeVisible();
    await expect(venueRow).not.toContainText('nevizultat');

    // The feed: title, body and the „Nou" marker stay on the rows that arrived unseen.
    const feed = page.locator('.watch-event');
    await expect(feed.filter({hasText: 'Termen nou în dosarul 6236/111/2017'}).locator('.watch-unseen')).toHaveCount(1);
    await expect(feed.filter({hasText: 'Spectacol nou în calendarul Teatrului Odeon'}).locator('.watch-unseen')).toHaveCount(0);

    // Viewing the feed acks exactly the unseen events, scoped to the install.
    await watch.callsUntil(call => call.pathname === '/api/watch-events/ack');
    const ack = watch.calls.find(call => call.pathname === '/api/watch-events/ack')!;
    expect(ack.body.installId).toBe(seededInstallId);
    expect(new Set(ack.body.ids)).toEqual(new Set(['evt-1', 'evt-2']));
    // After ack, the nav badge clears (live counts only).
    await expect(page.locator('.vbottom-nav button', {hasText: 'Urmărite'})).not.toContainText('2', {timeout: 15_000});
    await expect(page.locator('.vb-badge')).toHaveCount(0);

    // Clicking an event deep-links to its surface: the dosar leg seeds the courts form (no auto-submit).
    await feed.filter({hasText: 'Ședință nouă în dosarul 6236/111/2017'}).getByRole('button', {name: 'Deschide dosarul 6236/111/2017'}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('#view=domain&id=justitie');
    await expect(page.locator('.domain-workspace')).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('legătura de notificare /#view=watch&event=<id> deschide schimbarea și navighează pe suprafața ei', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {
      list: watchListState({watches: [watchRow('firma', '427282', {label: 'Monitorul Oficial RA'})]}),
      events: watchEventsState([
        {id: 'evt-f', kind: 'firma', ref: '427282', title: 'Bilanț nou la Monitorul Oficial RA', body: 'Raportare financiară publicată.', url: '/#view=watch&event=evt-f', createdAt: now(), seen: false},
      ]),
    });
    await page.route('**/api/company*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(companyState())}));
    await page.addInitScript(id => {
      if (!sessionStorage.getItem('aflivra.watch.no-seed')) localStorage.setItem('aflivra.install.v1', id);
    }, seededInstallId);

    await page.goto('/#view=watch&event=evt-f');
    await waitForClientReady(page);
    // The push deep link acks the event and routes onward to the firma surface.
    await watch.callsUntil(call => call.pathname === '/api/watch-events/ack');
    const ack = watch.calls.find(call => call.pathname === '/api/watch-events/ack')!;
    expect(ack.body.installId).toBe(seededInstallId);
    expect(ack.body.ids).toEqual(['evt-f']);
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'company', {timeout: 30_000});
    await expect(page.getByRole('heading', {level: 2, name: 'Monitorul Oficial RA'})).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('#view=company&id=427282');
    // The firma watch button shows the pressed state for the existing watch from the list.
    const followedFirma = page.getByRole('button', {name: 'Nu mai urmări firma 427282'});
    await expect(followedFirma).toHaveAttribute('aria-pressed', 'true', {timeout: 15_000});
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('eliminarea unei urmăriri cheamă DELETE cu query-urile contractului; „Șterge-mi datele" curăță tot și resetează identitatea', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {
      list: watchListState({watches: [
        watchRow('dosar', '6236/111/2017', {label: 'Dosar 6236/111/2017'}),
        watchRow('localitate', 'Cluj-Napoca', {label: 'Cluj-Napoca'}),
      ]}),
      purge: {purged: {watches: 2, events: 0, subscriptions: 0}},
    });
    await page.addInitScript(id => {
      if (!sessionStorage.getItem('aflivra.watch.no-seed')) localStorage.setItem('aflivra.install.v1', id);
    }, seededInstallId);

    await openCenter(page);
    const dosarRow = page.locator('.watch-item', {hasText: '6236/111/2017'});
    await expect(dosarRow).toBeVisible({timeout: 30_000});
    await dosarRow.getByRole('button', {name: 'Nu mai urmări dosarul 6236/111/2017'}).click();
    await watch.callsUntil(call => call.method === 'DELETE' && call.pathname === '/api/watch');
    const remove = watch.calls.find(call => call.method === 'DELETE' && call.pathname === '/api/watch')!;
    expect(remove.url.searchParams.get('installId')).toBe(seededInstallId);
    expect(remove.url.searchParams.get('kind')).toBe('dosar');
    expect(remove.url.searchParams.get('ref')).toBe('6236/111/2017');
    await expect(page.locator('.watch-item', {hasText: '6236/111/2017'})).toHaveCount(0);
    await expect(page.locator('.watch-item', {hasText: 'Cluj-Napoca'})).toBeVisible();

    // „Șterge-mi datele" confirms first, then purges the install and resets the local identity.
    await page.locator('main').getByRole('button', {name: 'Șterge-mi datele'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {name: 'Păstrează'}).click();
    await expect(dialog).toBeHidden();
    await expect(watch.calls.find(call => call.pathname === '/api/watch/purge')).toBeUndefined();
    await page.locator('main').getByRole('button', {name: 'Șterge-mi datele'}).click();
    await dialog.getByRole('button', {name: 'Șterge-mi datele'}).click();
    await watch.callsUntil(call => call.pathname === '/api/watch/purge');
    const purge = watch.calls.find(call => call.pathname === '/api/watch/purge')!;
    expect(purge.body).toEqual({installId: seededInstallId});
    await expect(page.locator('.watch-item')).toHaveCount(0);
    // Honest empty state.
    await expect(page.getByText('Nu urmărești nimic încă')).toBeVisible();
    // Local reset: the stored install identity is cleared, not reused.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('aflivra.install.v1'))).toBe(null);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('comutarea notificărilor per element: „Mutează” oprește notificările rândului, „Reia” le aduce înapoi', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {
      list: watchListState({watches: [watchRow('dosar', '6236/111/2017', {label: 'Dosar 6236/111/2017'})]}),
    });
    await page.addInitScript(id => {
      if (!sessionStorage.getItem('aflivra.watch.no-seed')) localStorage.setItem('aflivra.install.v1', id);
    }, seededInstallId);

    await openCenter(page);
    const row = page.locator('.watch-item', {hasText: '6236/111/2017'});
    await expect(row).toBeVisible({timeout: 30_000});
    await expect(row).not.toContainText('notificările sunt oprite');

    // Mutează: the exact addendum body — installId, kind, ref, muted:true — scoped to the install.
    await row.getByRole('button', {name: 'Mutează notificările pentru dosarul 6236/111/2017'}).click();
    await watch.callsUntil(call => call.method === 'POST' && call.pathname === '/api/watch/mute');
    const mute = watch.calls.find(call => call.method === 'POST' && call.pathname === '/api/watch/mute')!;
    expect(mute.body).toEqual({installId: seededInstallId, kind: 'dosar', ref: '6236/111/2017', muted: true});
    await expect(row).toContainText('notificările sunt oprite pentru acest element');

    // Reia: the same toggle with muted:false brings the notifications back.
    await row.getByRole('button', {name: 'Reia notificările pentru dosarul 6236/111/2017'}).click();
    await watch.callsUntil(call => call.pathname === '/api/watch/mute' && call.body?.muted === false);
    const resume = watch.calls.filter(call => call.pathname === '/api/watch/mute').at(-1)!;
    expect(resume.body).toEqual({installId: seededInstallId, kind: 'dosar', ref: '6236/111/2017', muted: false});
    await expect(row).not.toContainText('notificările sunt oprite');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Watch — notificări push, onest pe platformă', () => {
  const vapidKeyBytes = Buffer.from('04' + '11'.repeat(64), 'hex').toString('base64url');
  const fakeSubscription = () => ({
    endpoint: 'https://push.aflivra.example/sub/6236-111',
    keys: {p256dh: 'B' + 'a'.repeat(86), auth: 'bK'.repeat(11)},
  });

  test('abonarea pornește doar din gestul explicit și trimite abonamentul exact în forma contractului', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {list: watchListState({notification: {vapidPublicKey: vapidKeyBytes}, watches: [watchRow('dosar', '6236/111/2017')]})});
    await page.addInitScript(id => {
      if (!sessionStorage.getItem('aflivra.watch.no-seed')) localStorage.setItem('aflivra.install.v1', id);
    }, seededInstallId);
    // pushManager.subscribe is stubbed at document start: no real push backend in e2e.
    await page.addInitScript(() => {
      (window as any).__watchSubOpts = null;
      (window as any).__unsubscribed = false;
      const fake = {
        endpoint: 'https://push.aflivra.example/sub/6236-111',
        toJSON: () => ({endpoint: 'https://push.aflivra.example/sub/6236-111', keys: {p256dh: 'B' + 'a'.repeat(86), auth: 'bK'.repeat(11)}}),
        unsubscribe: () => {(window as any).__unsubscribed = true; return Promise.resolve(true);},
      };
      const manager = (window as any).PushManager?.prototype;
      if (manager) {
        manager.subscribe = function(opts: any) {(window as any).__watchSubOpts = opts; return Promise.resolve(fake);};
        manager.getSubscription = () => Promise.resolve((window as any).__watchSubOpts && !(window as any).__unsubscribed ? fake : null);
      }
    });
    await page.context().grantPermissions(['notifications'], {origin: 'http://127.0.0.1:5173'});

    await openCenter(page);
    const enable = page.getByRole('button', {name: 'Activează notificările'});
    await expect(enable).toBeVisible({timeout: 30_000});
    await enable.click();

    await watch.callsUntil(call => call.pathname === '/api/watch/subscribe');
    const subscribe = watch.calls.find(call => call.pathname === '/api/watch/subscribe')!;
    expect(subscribe.body.installId).toBe(seededInstallId);
    expect(subscribe.body.subscription).toEqual(fakeSubscription());
    // The applicationServerKey the browser received is the server's VAPID key, decoded to 65 raw bytes (0x04 + point).
    const key = await page.evaluate(() => Array.from((((window as any).__watchSubOpts as any)?.applicationServerKey ?? []) as Uint8Array));
    expect(Buffer.from(key).toString('hex')).toBe('04' + '11'.repeat(64));
    await expect(page.getByText('Notificările sunt active pe acest dispozitiv.')).toBeVisible();

    // The off toggle unsubscribes on this device without deleting the watches.
    await page.getByRole('button', {name: 'Oprește notificările pe acest dispozitiv'}).click();
    await expect(page.getByRole('button', {name: 'Activează notificările'})).toBeVisible({timeout: 15_000});
    expect(await page.evaluate(() => (window as any).__unsubscribed)).toBe(true);
    // v1 addendum: the off toggle also clears THIS device's server row — endpoint-scoped, install-scoped.
    await watch.callsUntil(call => call.method === 'DELETE' && call.pathname === '/api/watch/subscribe');
    const unsub = watch.calls.find(call => call.method === 'DELETE' && call.pathname === '/api/watch/subscribe')!;
    expect(unsub.url.searchParams.get('installId')).toBe(seededInstallId);
    expect(unsub.url.searchParams.get('endpoint')).toBe('https://push.aflivra.example/sub/6236-111');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('pe iPhone, în browserul neinstalat, mesajul onest cere instalarea aplicației și nu cere permisiunea', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await installWatchRoutes(page, {
      list: watchListState({
        notification: {vapidPublicKey: vapidKeyBytes},
        watches: [watchRow('dosar', '6236/111/2017')],
      }),
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1', configurable: true});
      Object.defineProperty(navigator, 'standalone', {value: false, configurable: true});
      (window as any).__permissionRequested = false;
      (window as any).Notification = Object.assign(function Notification() {} as any, {permission: 'default', requestPermission: () => {(window as any).__permissionRequested = true; return Promise.resolve('granted');}});
    });
    await page.addInitScript(id => {
      if (!sessionStorage.getItem('aflivra.watch.no-seed')) localStorage.setItem('aflivra.install.v1', id);
    }, seededInstallId);

    await openCenter(page);
    await expect(page.getByText('Pe iPhone și iPad, notificările sosesc în aplicația instalată pe ecranul de start.')).toBeVisible({timeout: 30_000});
    await expect(page.getByText('Instalează aplicația și activează notificările')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Activează notificările'})).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__permissionRequested)).toBe(false);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('fără cheie VAPID pe server, abonarea este dezactivată onest; fără instalare anterioară, nimic nu se cere de la server', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const watch = await installWatchRoutes(page, {list: watchListState({watches: [watchRow('dosar', '6236/111/2017')]}), events: watchEventsState()});
    await page.addInitScript(id => {
      if (!sessionStorage.getItem('aflivra.watch.no-seed')) localStorage.setItem('aflivra.install.v1', id);
    }, seededInstallId);

    await openCenter(page);
    await expect(page.getByText('Notificările push nu sunt configurate pe server acum.')).toBeVisible({timeout: 30_000});
    await expect(page.getByText('Schimbările rămân vizibile aici, în centru.')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Activează notificările'})).toHaveCount(0);

    // A first-ever visit without a stored install creates no identity and asks nothing of the server.
    await page.evaluate(() => {sessionStorage.setItem('aflivra.watch.no-seed', '1'); localStorage.removeItem('aflivra.install.v1')});
    await page.goto('/');
    await page.reload();
    await waitForClientReady(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('aflivra.install.v1'))).toBe(null);
    expect(watch.calls.filter(call => call.method === 'GET' && call.pathname === '/api/watch')).toHaveLength(1); // only the seeded-install load
    await page.goto('/#view=watch');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'watch');
    await expect(page.getByText('Nu urmărești nimic încă')).toBeVisible();
    // Honest guidance: where the follow buttons live.
    await expect(page.getByText(/dosar|firmă|localitate/i).first()).toBeVisible();
    // Pre-identity state says the device has no anonymous identifier yet — not that the server is unconfigured.
    await expect(page.getByText(/abia atunci se creează identificatorul anonim al dispozitivului/)).toBeVisible();
    await expect(page.getByText('Notificările push nu sunt configurate pe server acum.')).toHaveCount(0);
    expect(watch.calls.filter(call => call.method === 'GET' && call.pathname === '/api/watch')).toHaveLength(1); // still no extra identity calls
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

// PICIORUL DE LIVRARE SW PUSH — LACUNĂ ÎNREGISTRATĂ (2026-10-07): handlerul din public/sw.js
// (payload {title,body,url} → showNotification cu tag/data.url; notificationclick → focus sau
// openWindow) nu poate fi exercitat onest de această suită: în Chromium headless,
// `Notification.permission` citește „denied” chiar și după `grantPermissions(['notifications'])`,
// `permissions.query({name:'notifications'})` raportează „granted”, iar `showNotification` din
// service worker este respins cu „No notification permission has been granted for this origin”
// (probă rulată cu grant pe origin și fără origin, după `requestPermission()` real „granted”);
// în plus `waitUntil` pe un eveniment PushEvent construit în script aruncă InvalidStateError.
// Confirmarea reală rămâne pe un dispozitiv abonat la deploy (pereche cu nota RFC 8291 din
// Builder-A Findings). Fără test fals — handlerul respectă litera contractului și e verificat
// la citirea codului + istoricul CACHE (v20→v21).
