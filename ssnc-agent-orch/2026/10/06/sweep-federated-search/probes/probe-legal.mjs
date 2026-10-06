// T1.4 probe — legislation/documents structure + dosar chain invariants (offline, snapshot corpora only).
import zlib from 'node:zlib';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = import.meta.dirname.split('/').slice(0, -6).join('/');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const failures = [];
const addFailure = (area, check, detail, samples, cls) => failures.push({ area, check, detail, count: samples.length, samples: samples.slice(0, 3), expectedClass: cls });
const stats = { lawsChecked: 0, referencesChecked: 0, stageChecks: 0 };

// ---------- transpile lib modules ----------
const temp = await mkdtemp(join(tmpdir(), 'aflivra-t14-legal-'));
async function compile(name, path, transform = s => s) {
  const source = transform(fs.readFileSync(join(repo, path), 'utf8'));
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
    .outputText.replace(/from '(\.\/[^']+)'/g, (_, p) => "from '" + p + ".mjs'");
  await writeFile(join(temp, name + '.mjs'), js);
  return import(pathToFileURL(join(temp, name + '.mjs')));
}
const institutionsRaw = fs.readFileSync(join(repo, 'public/courts/institutions.json'), 'utf8');
const text = await compile('text', 'lib/live/text.ts');
const reader = await compile('legal-reader', 'lib/live/legal-reader.ts');
const courtQuery = await compile('court-query', 'lib/court-query.ts');
const courtHistory = await compile('court-history', 'lib/court-history.ts', s =>
  s.replace("import institutions from '@/public/courts/institutions.json';", 'const institutions=' + institutionsRaw + ';')
    .replace("from './court-query'", "from './court-query'"));
const consolidation = await compile('legal-consolidation', 'lib/live/legal-consolidation.ts');

// ---------- 1. legal snapshots: proofs + consolidation shape + section/clause structure ----------
const legalDir = join(repo, 'public/legal-snapshots');
const manifests = [['manifest.json', false], ['historical-manifest.json', true]];
for (const [mf, historical] of manifests) {
  const m = JSON.parse(fs.readFileSync(join(legalDir, mf), 'utf8'));
  for (const item of m.items) {
    stats.lawsChecked++;
    const path = join(repo, 'public' + (item.file || ''));
    if (!item.file || !fs.existsSync(path)) { addFailure('legal', 'file-missing', item.id, [item.id], 'OUR-BUG'); continue; }
    const gz = fs.readFileSync(path);
    if (item.fileSha256 && (gz.length !== item.fileBytes || sha256(gz) !== item.fileSha256)) addFailure('legal', 'stored-file-proof', item.file + ' compressed proof mismatch', [item.file], 'OUR-BUG');
    const textContent = zlib.gunzipSync(gz).toString('utf8');
    const bytes = Buffer.from(textContent, 'utf8');
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) addFailure('legal', 'text-proof', item.file + ' decompressed proof mismatch', [item.file], 'OUR-BUG');
    if (item.characters !== undefined && item.characters !== textContent.length) addFailure('legal', 'characters-count', item.file + ' characters ' + item.characters + ' vs ' + textContent.length, [item.file], 'OUR-BUG');
    if (item.textProvided === true && !textContent.trim()) addFailure('legal', 'empty-text', item.file, [item.file], 'OUR-BUG');
    if (item.consolidation) {
      if (!consolidation.verifiedConsolidation(item)) addFailure('legal', 'consolidation-shape', item.id + ' fails verifiedConsolidation', [item.id], 'OUR-BUG');
      if (!(item.consolidation.versionDate <= item.consolidation.asOf)) addFailure('legal', 'consolidation-order', item.id + ' versionDate > asOf', [item.id], 'OUR-BUG');
    }
    // sections / clauses structure on the full text
    if (!historical) {
      const sections = reader.lawSections(textContent);
      if (!sections.length) { addFailure('legal', 'lawSections-empty', item.file, [item.file], 'OUR-BUG'); continue; }
      const articles = sections.filter(s => s.kind === 'article');
      if (item.type && /^COD/i.test(item.type) && articles.length < 50) addFailure('legal', 'lawSections-articles', item.type + ' only ' + articles.length + ' articles parsed', [item.type + ':' + articles.length], 'data-gap');
      const nav = reader.lawNavigation(sections);
      const sectionIds = new Set(sections.map(s => s.id));
      if (nav.length !== sections.length) addFailure('legal', 'navigation-coverage', item.file + ' nav ' + nav.length + ' vs sections ' + sections.length, [item.file], 'OUR-BUG');
      const navIds = new Set();
      for (const entry of nav) {
        if (navIds.has(entry.id)) addFailure('legal', 'navigation-duplicate', item.file + ' duplicated nav id ' + entry.id, [entry.id], 'OUR-BUG');
        navIds.add(entry.id);
        for (const sid of entry.sectionIds) if (!sectionIds.has(sid)) addFailure('legal', 'navigation-dangling', item.file + ' nav references missing section ' + sid, [sid], 'OUR-BUG');
        if (entry.firstArticleId && !sectionIds.has(entry.firstArticleId)) addFailure('legal', 'navigation-first-article', item.file + ' ' + entry.id, [entry.id], 'OUR-BUG');
        if (entry.lastArticleId && !sectionIds.has(entry.lastArticleId)) addFailure('legal', 'navigation-last-article', item.file + ' ' + entry.id, [entry.id], 'OUR-BUG');
      }
      // pagination sanity: every page walk covers all sections exactly once
      const seen = [];
      let page = 0, guard = 0;
      while (true) {
        const p = reader.lawPage(sections, page);
        seen.push(...p.items.map(s => s.id));
        if (p.page >= p.pages - 1 || guard++ > 2000) break;
        page = p.page + 1;
      }
      if (seen.length !== sections.length || new Set(seen).size !== sections.length) addFailure('legal', 'lawPage-coverage', item.file + ' pages cover ' + seen.length + ' of ' + sections.length, [item.file], 'OUR-BUG');
      // clauses: paragraphs of representative articles
      let clauseCount = 0, textCount = 0, noteCount = 0, listCount = 0;
      for (const s of sections.slice(0, 400)) for (const p of reader.lawParagraphs(s.body)) { if (p.kind === 'clause') clauseCount++; else if (p.kind === 'note') noteCount++; else if (p.kind === 'list') listCount++; else textCount++; }
      if (articles.length && clauseCount === 0) addFailure('legal', 'lawParagraphs-clauses', item.file + ' no clause paragraphs found in first 400 sections', [item.file], 'data-gap');
    }
  }
}

// ---------- 2. courts registry + confirmed references + dosar chain invariants ----------
const institutions = JSON.parse(institutionsRaw);
if (!Array.isArray(institutions.items) || !institutions.items.length) addFailure('dosar', 'institutions-empty', 'courts registry empty', ['institutions.json'], 'OUR-BUG');
const instIds = new Set(institutions.items.map(i => i.id));
const badInst = institutions.items.filter(i => typeof i.id !== 'string' || !i.id || typeof i.label !== 'string' || !i.label);
if (badInst.length) addFailure('dosar', 'institutions-shape', badInst.length + ' malformed registry entries', badInst.map(i => i.id), 'OUR-BUG');
if (instIds.size !== institutions.items.length) addFailure('dosar', 'institutions-duplicate', 'duplicate court ids', [institutions.items.length + ' vs ' + instIds.size], 'OUR-BUG');

const confirmed = JSON.parse(fs.readFileSync(join(repo, 'public/courts/confirmed-references.json'), 'utf8'));
const validNumber = v => /^\d{1,8}\/\d{1,5}\/\d{4}(?:\/[a-zA-Z0-9.]{1,20})?$/.test(v);
const badRef = [];
for (const r of confirmed.items) {
  stats.referencesChecked++;
  if (!r.id || !validNumber(r.number) || !validNumber(r.source?.number || '') || !r.court || !instIds.has(r.court) || !r.courtLabel || !r.document || !r.documentNumber || !r.documentDate || !r.verifiedAt || !r.source?.hearingDate || !r.source?.url) badRef.push(r.id || '(no id)');
  else if (!courtQuery.normalizeCourtNumber(String(r.number)) === r.number) badRef.push(r.id + ' non-normalized number');
}
if (badRef.length) addFailure('dosar', 'confirmed-reference-shape', badRef.length + ' references fail the CourtReference contract', badRef, 'OUR-BUG');
const unique = courtHistory.uniqueCourtReferences(confirmed.items);
if (unique.length !== confirmed.items.length) addFailure('dosar', 'confirmed-reference-unique', 'dedupe dropped entries: ' + confirmed.items.length + ' -> ' + unique.length, [String(unique.length)], 'OUR-BUG');

// instance-ordering invariant: fond < apel < recurs must hold in every built history
const rank = { Fond: 0, Apel: 1, Recurs: 2 };
const orderViolations = [];
const checkOrder = h => {
  for (let i = 1; i < h.stages.length; i++) {
    const a = h.stages[i - 1], b = h.stages[i];
    const ra = rank[a.label] ?? 3, rb = rank[b.label] ?? 3;
    if (ra > rb) orderViolations.push(h.number + ' ' + a.label + ' before ' + b.label);
    if (ra === rb && a.courtLabel.localeCompare(b.courtLabel, 'ro') > 0) orderViolations.push(h.number + ' same-rank court order ' + a.courtLabel + '/' + b.courtLabel);
  }
};
// (a) over the seeded corpus itself
for (const h of courtHistory.buildCourtHistories([], confirmed.items, '')) { stats.stageChecks++; checkOrder(h); }
// (b) over a synthetic full-chain corpus where record stages + evidence-only stages coexist
const mkRecord = (id, number, stage, court, courtLabel, hearings) => ({ id, number, stage, court, courtLabel, hearings });
const synthetic = [
  mkRecord('r1', '111/2/2020', 'Fond', 'TribunalulBIHOR', 'Tribunalul Bihor', [{ date: '2020-06-01', summary: '' }, { date: '2020-07-01', summary: '' }]),
  mkRecord('r2', '111/2/2020', 'Apel', 'CurteadeApelORADEA', 'Curtea de Apel Oradea', [{ date: '2021-01-11', summary: 'Sentința civilă nr. 5/2021 din 11.01.2021 pronunțată de Tribunalul Bihor în dosarul nr. 111/2/2020' }]),
  mkRecord('r3', '111/2/2020', 'Recurs', 'InaltaCurteCasatiesiJustitie', 'Înalta Curte de Casație și Justiție', [{ date: '2022-02-02', summary: 'Sentința civilă nr. 7/2022 din 02.02.2022 pronunțată de Curtea de Apel Oradea în dosarul 111/2/2020' }]),
  mkRecord('r4', '222/3/2021', 'fond', 'TribunalulBIHOR', 'Tribunalul Bihor', []),
];
const extracted = courtHistory.extractCourtReferences(synthetic, '2026-10-05T00:00:00Z');
const histories = courtHistory.buildCourtHistories(synthetic, [...confirmed.items, ...extracted], '');
for (const h of histories) { stats.stageChecks++; checkOrder(h); }
const h111 = histories.find(h => h.number === '111/2/2020');
if (!h111) addFailure('dosar', 'synthetic-history-missing', 'buildCourtHistories dropped 111/2/2020', ['111/2/2020'], 'OUR-BUG');
else {
  const labels = h111.stages.map(s => s.label);
  const ranks = labels.map(l => rank[l] ?? 3);
  if (ranks.some((r, i) => i && r < ranks[i - 1])) addFailure('dosar', 'fond-apel-recurs-order', '111/2/2020 stages out of instance order: ' + labels.join(','), [labels.join(',')], 'OUR-BUG');
  if (!labels.includes('Fond') || !labels.includes('Apel') || !labels.includes('Recurs')) addFailure('dosar', 'fond-apel-recurs-presence', '111/2/2020 missing a stage: ' + labels.join(','), [labels.join(',')], 'OUR-BUG');
  const fondRecord = h111.stages.find(s => s.label === 'Fond' && s.availability === 'record');
  if (!fondRecord || fondRecord.recordIds.join(',') !== 'r1' || fondRecord.hearingCount !== 2) addFailure('dosar', 'fond-stage-record', 'fond record stage wrong', [JSON.stringify(fondRecord)], 'OUR-BUG');
  // evidence-only: a judgment in another dosar can confirm an extra Fond stage without any record
  const fondEvidence = h111.stages.find(s => s.label === 'Fond' && s.availability === 'reference');
  if (!fondEvidence) addFailure('dosar', 'evidence-only-stage', 'no reference-only Fond stage produced from synthetic judgments', ['111/2/2020'], 'OUR-BUG');
  for (const s of h111.stages.filter(s => s.availability === 'reference')) if (s.recordIds.length || s.hearingCount) addFailure('dosar', 'evidence-only-purity', s.label + ' reference stage carries records', [s.label], 'OUR-BUG');
  const related = h111.relatedCases.map(r => r.number + '<-' + r.source.number);
  if (h111.relatedCases.some(r => r.number === '111/2/2020')) addFailure('dosar', 'related-self', 'history lists itself as related', ['111/2/2020'], 'OUR-BUG');
  if (h111.historyComplete !== false) addFailure('dosar', 'historyComplete-flag', 'historyComplete must stay false', ['111/2/2020'], 'OUR-BUG');
  // courtHistoryText renders every stage + evidence without crashing
  const textOut = courtHistory.courtHistoryText(h111);
  for (const s of h111.stages) if (!textOut.includes(s.label)) addFailure('dosar', 'history-text-stages', 'missing stage label in rendered text', [s.label], 'OUR-BUG');
}
// every extracted reference must be evidence-backed: explicit judgment + court + valid number only
for (const r of extracted) {
  if (r.stage !== 'Fond') addFailure('dosar', 'reference-stage-only-fond', 'extract produced non-Fond reference ' + r.stage, [r.stage], 'OUR-BUG');
  if (!instIds.has(r.court)) addFailure('dosar', 'reference-court-unknown', r.court, [r.court], 'OUR-BUG');
}
// known-bad extraction probes: party-name / bare-number must NOT create a stage (evidence-only rule)
const badExtraction = courtHistory.extractCourtReferences([
  mkRecord('x1', '333/4/2022', 'Recurs', 'TribunalulBIHOR', 'Tribunalul Bihor', [{ date: '2023-01-01', summary: 'S-a admis apelul reclamantului John Doe în dosarul 444/5/2023' }]),
  mkRecord('x2', 'bad/number', 'Fond', 'TribunalulBIHOR', 'Tribunalul Bihor', [{ date: '2023-01-01', summary: 'Sentința civilă nr. 9/2023 din 01.01.2023 pronunțată de Tribunalul Bihor în dosarul nr. 555/6/2023' }]),
  mkRecord('x3', '666/7/2023', 'Fond', 'TribunalulBIHOR', 'Tribunalul Bihor', [{ date: '2023-01-01', summary: 'Sentința din 01.01.2023 pronunțată de Tribunalul București în dosarul 777/8/2023' }]),
], '2026-10-05T00:00:00Z');
if (badExtraction.some(r => r.number === '444/5/2023')) addFailure('dosar', 'extraction-party-name', 'party-name mention created a reference', ['444/5/2023'], 'OUR-BUG');
if (badExtraction.some(r => r.number === '555/6/2023')) addFailure('dosar', 'extraction-invalid-source', 'reference created from a record with invalid dosar number', ['555/6/2023'], 'OUR-BUG');
if (badExtraction.some(r => r.number === '777/8/2023')) addFailure('dosar', 'extraction-unknown-court', 'reference created for a court outside the registry', ['777/8/2023'], 'OUR-BUG');
if (orderViolations.length) addFailure('dosar', 'stage-order', orderViolations.length + ' fond<apel<recurs ordering violations', orderViolations, 'OUR-BUG');

console.log(JSON.stringify({ probe: 'legal-dosar', lawsChecked: stats.lawsChecked, referencesChecked: stats.referencesChecked, stageChecks: stats.stageChecks, failures }, null, 1));