// Wave B polite probes (Builder-C). Two probes total, one per host:
//  P1 CKAN data.gov.ro — the CNAS furnizori FARM export schema (does it carry the CUI column,
//     and in what format?) — the join key evidence for B-1.
//  P2 legislatie.just.ro — one DetaliiDocument page (act sheet facts beyond title/issuer/
//     publication/history) — the act-id metadata evidence for B-4 (and the dosar→act link
//     corroboration for B-2: the portal's programmatic responses carry no act ids).
import {writeFile,appendFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const dir=new URL('.',import.meta.url);
const XLSX=require('xlsx');
const UA='Aflivra/1.0 public-data-source-check';
const results=[];

async function probe(name,url,init={}) {
  const attemptedAt=new Date().toISOString();
  const started=Date.now();
  const response=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/json, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',...init.headers},redirect:'follow',signal:AbortSignal.timeout(30000),...init});
  const buffer=Buffer.from(await response.arrayBuffer());
  const entry={name,attemptedAt,url,method:init.method||'GET',
    httpStatus:response.status,
    headers:Object.fromEntries(['content-type','content-length','server','retry-after','last-modified','cache-control'].map(key=>[key,response.headers.get(key)])),
    finalUrl:response.url,bytes:buffer.length,elapsedMs:Date.now()-started};
  results.push(entry);
  return {entry,buffer,response};
}

// ---------- P1: CNAS furnizori FARM export — the app's own download URL (resource.url from
// package_show, the exact address the production loader fetches; the first attempt without
// the /download segment served the CKAN view page — that attempt is kept in the ledger) ----------
const only=process.argv[2]||'all';
const farmResourceUrl='https://data.gov.ro/dataset/0793fa57-1565-4109-8aae-02d28819e9af/resource/72d0bd2f-c55d-4e8c-8ad3-3ed4f4452287/download/contracte-farm-31.03.2026.xls';
const p1=await probe('ckan-cnas-farm-schema',farmResourceUrl);
if(p1.entry.httpStatus===200&&p1.buffer.length>2048) {
  await writeFile(new URL('fixtures/cnas-farm.xls',dir),p1.buffer);
  const workbook=XLSX.read(p1.buffer,{type:'buffer'});
  const shape={sheetNames:workbook.SheetNames,sheets:workbook.SheetNames.map(sheet=>{
    const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{defval:null,header:1});
    return {header:rows[0]||[],sampleRows:(rows[1]&&rows[2]&&rows[3]?[rows[1],rows[2],rows[3]]:rows.slice(1,4)).map(row=>row.map(cell=>cell===null?null:String(cell).slice(0,120))),rowEstimate:rows.length};
  })};
  p1.entry.shape=shape;
  const cuiColumn=shape.sheets.flatMap(s=>s.header).find(h=>/cui/i.test(String(h)));
  p1.entry.findings=typeof cuiColumn==='string'
    ?`CUI column present: "${cuiColumn}" — join key addressable on this CKAN registry schema`
    :'no CUI column in the FARM export header';
  // CUI value format from the sample rows
  const sheet0=shape.sheets[0];
  const cuiAt=sheet0.header.findIndex(h=>/cui/i.test(String(h)));
  if(cuiAt>=0) {
    const values=sheet0.sampleRows.map(r=>r[cuiAt]).filter(v=>v!==null&&v!==undefined);
    p1.entry.cuiSampleFormat=values.map(v=>[v,/^\d+$/.test(v)?'plain-numeric':/RO/i.test(v)?'RO-prefixed':'other']);
  }
} else p1.entry.findings='FARM export not retrievable right now — honest absence for the CKAN join cell';

if(only!=='act')await new Promise(resolve=>setTimeout(resolve,5000));

// ---------- P2: one DetaliiDocument page (Codul Muncii, the smallest committed code) ----------
const actUrl='https://legislatie.just.ro/Public/DetaliiDocument/41627';
let p2;
if(only==='farm') {
  // P2 was already spent this session (connection refused, UND_ERR_SOCKET) — the ledger keeps
  // that entry; a farm-only re-run must not re-spend the MJ request.
  p2={entry:{name:'mj-legislatie-act-page',attemptedAt:'skipped-this-run (prior entry stands — connection refused, UND_ERR_SOCKET at 2026-10-08T04:56:07Z)',url:actUrl,method:'GET',outcome:'skipped-this-run'}};
} else {
  try {
  p2=await probe('mj-legislatie-act-page',actUrl,{headers:{Accept:'text/html'}});
  const html=p2.buffer.toString('utf8');
  if(p2.entry.httpStatus===200&&html.length>1024) {
    await writeFile(new URL('fixtures/legal-act-page.html',dir),html);
    // The act sheet region: fields the page exposes beyond the classes the loader parses today.
    const factRows=[...html.matchAll(/<span[^>]*class="([^"]*)"[^>]*>([^<]{2,200})<\/span>/g)].map(m=>[m[1],m[2]]);
    p2.entry.sheetClasses=[...new Set([...html.matchAll(/class="(S_[A-Z_]+)"/g)].map(m=>m[1]))];
    p2.entry.factRowSamples=factRows.filter(([,t])=>/:|Data|Monitorul|domeniu|Domeniu|stadiu|Stadiu/i.test(t)).slice(0,40).map(([,t])=>t.trim());
  } else p2.entry.findings=`act page not retrievable now (HTTP ${p2.entry.httpStatus}, ${html.length}B) — honest absence evidence`;
  } catch(error) {
    p2={entry:{name:'mj-legislatie-act-page',attemptedAt:new Date().toISOString(),url:actUrl,method:'GET',outcome:'connection-failed',error:String(error?.cause?.code||error?.message||error)}};
  }
}
results.push(p2.entry);

// Ledger is append-only across runs: a re-run merges its spent probes into the prior file so
// every politeness spend stays recorded (skipped-this-run placeholders are not ledger entries).
let prior={results:[]};
try{prior=JSON.parse(await readFile(new URL('probe-results-wave-b.json',dir),'utf8'))}catch{}
const priorEntries=prior.results||[];
const spent=[...priorEntries,...results.filter(entry=>entry.outcome!=='skipped-this-run')];
if(only==='farm'&&!priorEntries.some(r=>r.name==='mj-legislatie-act-page'))spent.push(p2.entry);
await writeFile(new URL('probe-results-wave-b.json',dir),JSON.stringify({probedAt:new Date().toISOString(),politeness:{window:'Wave B spent every probe this ledger records — no request outside it',note:'P1 rides the app\'s own resource download URL already fetched read-only in production; the first P1 attempt (CKAN view page, HTML) is recorded as spent; P2 is one page GET, no SOAP token spent'},results:spent},null,2));
console.log(JSON.stringify({P1:{status:p1.entry.httpStatus,bytes:p1.entry.bytes,findings:p1.entry.findings,cuiSampleFormat:p1.entry.cuiSampleFormat||null,sheets:p1.entry.shape?.sheetNames},P2:{status:p2.entry.httpStatus||p2.entry.outcome,bytes:p2.entry.bytes||0,sheetClasses:p2.entry.sheetClasses?.slice(0,12),factRowSamples:p2.entry.factRowSamples?.slice(0,10),findings:p2.entry.findings||null}},null,2));
