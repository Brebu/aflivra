import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
// The D3 per-family recency policy table (ADVOCATE-REVIEW.md, accepted by the
// orchestrator) is a contract, not prose. This gate pins every table row to its
// exact coded anchor so a future edit cannot quietly change the policy: the
// rolling 3-year windows stay exactly where and what they are, legislation stays
// in-force-governed (no year filter), the exempt families carry no age
// predicate, and the nightly staleness reset keeps its semantics. Moving an
// anchor is a deliberate policy change that must update this pin together with
// the table in the session/PLAN documentation.
const root=resolve(import.meta.dirname,'..');
const atLine=(name,line,pin,label)=>assert.ok(name.length>=line&&name[line-1].includes(pin),label+' — pinned at '+pinPath+':'+line);
let pinPath='';
const pin=(lines,path,line,pin,label)=>{pinPath=path;atLine(lines,line,pin,label)};
const read=async(relative)=>(await readFile(join(root,relative),'utf8')).split('\n');
const rollingWindow=/(3\s*\*\s*)?365\.25\s*\*\s*86400000|getUTCFullYear\(\)\s*-\s*\d+|Date\.now\(\)\s*-\s*\d+\s*\*\s*86400000/;
const cache=await read('lib/live/cache.ts');
// Row 1 — CKAN dataset browsing: catalog seeds keep the 3-year modified window.
pin(cache,'lib/live/cache.ts',15,'r.modified>=new Date(Date.now()-3*365.25*86400000).toISOString().slice(0,10)','D3 row „CKAN dataset browsing — modified >= 3y"');
// Row 2 — ANAF company history: the rolling merge keeps the last 3 fiscal years
// (full existence is exempt; the rolling window is only the balance history).
// The anchor moved 70 → 72 with the Wikidata host-budget lines this row keeps
// sitting above the merge; the pinned content is unchanged.
pin(cache,'lib/live/cache.ts',73,'h.year>=new Date().getUTCFullYear()-3','D3 row „ANAF company history — last 3 fiscal years"');
const directories=await read('lib/live/directories.ts');
// Row 3 — CNAS/registry resource editions: latest edition within 3 years.
pin(directories,'lib/live/directories.ts',11,'r.date>=new Date(Date.now()-3*365.25*86400000).toISOString().slice(0,10)','D3 row „CNAS resource editions — latest within 3y"');
// Recency machinery — the nightly-boundary staleness reset that expires served
// copies when their day rolls over in Bucharest, and the law consolidation
// exemption from that reset (in-force acts verify per open, never by age).
pin(cache,'lib/live/cache.ts',19,'const afterNightBoundary=()','D3 machinery — nightly boundary helper');
pin(cache,'lib/live/cache.ts',19,'hourCycle:\'h23\'}).format(new Date()))>=3','D3 machinery — the 03:00 Bucharest night boundary');
pin(cache,'lib/live/cache.ts',26,'afterNightBoundary()&&roDate(','D3 machinery — nightly staleness detection');
pin(cache,'lib/live/cache.ts',27,'return Date.now()<(nightly?0:row.expires_at);','D3 machinery — nightly reset drops only the served copy, never the data');
pin(cache,'lib/live/cache.ts',60,'(afterNightBoundary()||loader.key.startsWith(\'law:consolidated.v2:\'))','D3 row „Legislation — in-force regardless of year": consolidated texts are not age-cycled');
const noRollingWindow=async(file,label)=>{const text=(await readFile(join(root,file),'utf8'));assert.ok(!rollingWindow.test(text),label+' — the exempt family must not gain a rolling age window');return text};
// Row 4 — legislation / legal acts: in-force semantics only. No year window in
// the consolidation chain, and court dosare keep the full period.
const legal=await noRollingWindow('lib/live/legal-consolidation.ts','D3 row „Legislation"');
assert.ok(!rollingWindow.test(await readFile(join(root,'lib/live/legal.ts'),'utf8')),'D3 row „Legislation / dosare — full period": no rolling age window in the court/legal chain');
assert.ok(legal.includes('asOf'),'D3 row „Legislation" — consolidation tracks the applicable form by date, not by age');
// Row 5 — news feeds: the reader applies no age deletion; the source's own feed
// window governs, the items are ordered recent-first by default.
const domainRoute=await noRollingWindow('app/api/domain/route.ts','D3 row „News feeds"');
assert.ok(domainRoute.includes("from=p.get('from')||''")&&domainRoute.includes("to=p.get('to')||''"),'D3 row „News feeds" — date bounds are user filters, never a default age window');
assert.ok(domainRoute.includes("sort=p.get('sort')||'recent'"),'D3 row „News feeds" — future-first ordering is the coded default');
// Row 6 — events / cinema: future-facing at display level, the full published
// calendar stays available ("Întregul calendar publicat").
const eventsWorkspace=await readFile(join(root,'app/events-workspace.tsx'),'utf8');
assert.ok(eventsWorkspace.includes("scope==='all'||x.start.slice(0,10)>=bucharestDate()"),'D3 row „Events — future-facing": upcoming filter is display-level, never a data deletion');
// Row 7 — exempt families: places/geography, films, professional registries,
// trains, stories, housing carry no age semantics in their readers.
await noRollingWindow('lib/live/justice.ts','D3 row „Professional registries (notari/experți/traducători)"');
await noRollingWindow('lib/live/lawyers.ts','D3 row „Professional registries (avocați)"');
await noRollingWindow('lib/live/feeds.ts','D3 rows „Films corpus / feeds parser" — the Wikidata film catalog is all-years by design');
await noRollingWindow('lib/live/trains.ts','D3 row „Transport network — edition-governed, not age-governed"');
await noRollingWindow('lib/live/stories.ts','D3 row „Stories corpus"');
await noRollingWindow('lib/live/housing.ts','D3 row „Housing registries"');
const placesManifest=await readFile(join(root,'public/places/manifest.json'),'utf8');
assert.ok(placesManifest.length>0,'D3 row „Places corpus — exempt": the geography corpus stays present (no age semantics)');
console.log('Trecut: politica de prospețime pe familie rămâne fixată pe ancorele codificate — fereastra de 3 ani doar la catalog, istoric firme și ediții CNAS; legislația guvernată de actualitate, dosarele pe toată perioada; locurile, filmele, registrele profesionale, trenurile, povestirile și registrele imobiliare fără semantică de vârstă; evenimentele orientate spre viitor la afișare, nu prin ștergerea calendarului.');
console.log(JSON.stringify({result:'ok',rows:7,anchors:['cache.ts:15','cache.ts:70','directories.ts:11','cache.ts:19/26/27/60','legal chain (no window)','domain route (no default window)','events display filter'],exemptReaders:['legal.ts','legal-consolidation.ts','justice.ts','lawyers.ts','feeds.ts','trains.ts','stories.ts','housing.ts','places corpus']}));
