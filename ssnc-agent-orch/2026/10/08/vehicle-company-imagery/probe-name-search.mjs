// T2 name-search probes — polite, one request per step (run stepwise so the next
// request can depend on the last). Budget: ≤5 probes per host (data.gov.ro,
// webservicesp.anaf.ro), ≥5 s between probes, UA of the app. Evidence saved as
// fixtures in this session dir; the probe ledger is registered in STATUS.md.
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const here = import.meta.dirname;
const UA = 'Aflivra/1.0 public-data-source-check';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = process.argv[2];
const get = async (url) => {
  const at = new Date().toISOString();
  const r = await fetch(url, {headers: {'User-Agent': UA, Accept: 'application/json'}, signal: AbortSignal.timeout(30000)});
  const text = await r.text();
  return {at, url, status: r.status, contentType: r.headers.get('content-type'), rateLimit: r.headers.get('x-ratelimit-limit') || r.headers.get('retry-after') || null, bytes: text.length, text};
};

if (step === 'k1') {
  // The newest quarterly ONRC 'Firme înregistrate la Registrul Comerțului' dataset
  // (02.09.2026 edition, 6 resources per the committed catalog seed).
  const out = await get('https://data.gov.ro/api/3/action/package_show?id=firme-02-09-2026');
  const parsed = JSON.parse(out.text);
  const rows = (parsed.result?.resources || []).map(r => ({id: r.id, name: r.name, format: r.format, datastore_active: r.datastore_active, size: r.size, last_modified: r.last_modified, url: String(r.url).slice(0, 120)}));
  console.log(JSON.stringify({status: out.status, title: parsed.result?.title, organization: parsed.result?.organization?.title, num_resources: parsed.result?.num_resources, resources: rows}, null, 1));
  await writeFile(join(here, 'fixtures', 'onrc-firme-package-show.json'), JSON.stringify(out, null, 1));
} else if (step === 'k2') {
  // Range probe: first bytes of OD_REPREZENTANTI_LEGALI.CSV (336 MB, no datastore) —
  // the ONRC legal representatives registry. Column names + first rows only; the
  // file is far over every fetch cap, so the header row is all we can read politely.
  await sleep(5200);
  const r = await fetch('https://data.gov.ro/dataset/937617a7-6070-4edc-9d39-e790596dca37/resource/73378c11-9109-48de-875f-f662fe615552/download/OD_REPREZENTANTI_LEGALI.CSV', {headers: {'User-Agent': UA, Accept: 'text/csv', Range: 'bytes=0-4095'}, signal: AbortSignal.timeout(60000)});
  let text = '';
  try { const reader = r.body.getReader(); const {value} = await reader.read(); text = new TextDecoder().decode(value || new Uint8Array()); await reader.cancel(); } catch {}
  console.log(r.status, 'accept-ranges:', r.headers.get('accept-ranges'), 'content-range:', r.headers.get('content-range'), 'read', text.length);
  console.log(text.slice(0, 3000));
  await writeFile(join(here, 'fixtures', 'onrc-reprezentanti-legali-head.csv'), text);
} else if (step === 'k4') {
  // Range probe: first bytes of OD_FIRME.CSV (693 MB) — the ONRC firm registry.
  // Column evidence (does the registry itself carry the CUI beside the name?).
  await sleep(5200);
  const r = await fetch('https://data.gov.ro/dataset/937617a7-6070-4edc-9d39-e790596dca37/resource/5cfc3113-413d-4524-8e8c-1a5e9fa5faa0/download/OD_FIRME.CSV', {headers: {'User-Agent': UA, Accept: 'text/csv', Range: 'bytes=0-4095'}, signal: AbortSignal.timeout(60000)});
  let text = '';
  try { const reader = r.body.getReader(); const {value} = await reader.read(); text = new TextDecoder().decode(value || new Uint8Array()); await reader.cancel(); } catch {}
  console.log(r.status, 'content-range:', r.headers.get('content-range'), 'read', text.length);
  console.log(text.slice(0, 3000));
  await writeFile(join(here, 'fixtures', 'onrc-firme-head.csv'), text);
} else if (step === 'k5') {
  // MFP 'Date de identificare plătitori' (iunie 2026) — the other official identity
  // registry (denumire + CUI per taxpayer). The one design-changing question: does
  // any of its resources ride the CKAN datastore (server-side search)?
  await sleep(5200);
  const out = await get('https://data.gov.ro/api/3/action/package_show?id=date_de_identificare_platitori_actualizate_iunie_2026');
  const parsed = JSON.parse(out.text);
  console.log(JSON.stringify({status: out.status, title: parsed.result?.title, organization: parsed.result?.organization?.title, num_resources: parsed.result?.num_resources, resources: (parsed.result?.resources || []).map(r => ({id: r.id, name: r.name, format: r.format, datastore_active: r.datastore_active, size: r.size, url: String(r.url).slice(0, 120)}))}, null, 1));
  await writeFile(join(here, 'fixtures', 'mfp-platitori-package-show.json'), JSON.stringify(out, null, 1));
} else if (step === 'fp1') {
  // finantepublice.ro — MFP public-entities lists (the mission's tertiary lead).
  // TLS reset from this egress on https; one plain-HTTP attempt for the record.
  try {
    const out = await get('https://www.finantepublice.ro/');
    console.log('https:', out.status, out.contentType, out.bytes);
    console.log(out.text.slice(0, 1500).replace(/\r/g, ''));
    await writeFile(join(here, 'fixtures', 'finantepublice-root.html'), out.text.slice(0, 50000));
  } catch (e) {
    console.log('https failed:', e.cause?.code || e.message);
    await sleep(5200);
    try {
      const r = await fetch('http://www.finantepublice.ro/', {headers: {'User-Agent': UA, Accept: 'text/html'}, signal: AbortSignal.timeout(30000), redirect: 'manual'});
      const text = await r.text();
      console.log('http:', r.status, r.headers.get('content-type'), text.length, 'redirect:', r.headers.get('location'));
      console.log(text.slice(0, 1200).replace(/\r/g, ''));
      await writeFile(join(here, 'fixtures', 'finantepublice-root.html'), 'HTTP ' + r.status + ' → ' + (r.headers.get('location') || '-') + '\n' + text.slice(0, 20000));
    } catch (e2) { console.log('http failed:', e2.cause?.code || e2.message); }
  }
} else if (step === 'dg1') {
  // The directors leads the mission names: K-Reports (private aggregator) and the
  // Official Gazette — one landing GET each, for the honest record of what is public.
  const url = process.argv[3];
  const out = await get(url);
  console.log(out.status, out.contentType, out.bytes);
  const text = out.text.replace(/\r/g, '');
  console.log(text.slice(0, 1800).replace(/\n{2,}/g, '\n'));
  const name = new URL(url).host.replace('www.', '');
  await writeFile(join(here, 'fixtures', 'directors-' + name + '.html'), text.slice(0, 30000));
} else if (step === 'a1') {
  // ANAF web services root — what the host itself publishes (evidence for the
  // 'no name-search endpoint' finding; the two CUI endpoints are probe-pinned
  // already in the wave fixtures).
  await sleep(5200);
  const out = await get('https://webservicesp.anaf.ro/');
  console.log(out.status, out.contentType, out.bytes, out.text.slice(0, 400).replace(/\s+/g, ' '));
  await writeFile(join(here, 'fixtures', 'anaf-root.txt'), JSON.stringify(out, null, 1));
}
