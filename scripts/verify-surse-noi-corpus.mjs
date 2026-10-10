import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';

// Poarta de integritate a corpusurilor „surse românești” comise: rândurile,
// numărătorile oneste de lipsuri și probele SHA-256 din snapshot-transport sunt
// un singur contract — un import care pierde rânduri, ascunde un CUI lipsă sau
// lasă o dovadă moartă trece numai dacă poarta minte. Numerele pin-ate sunt cele
// auditate la sursă (Aflivra_Surse_Romanesti_Testate_2026-10-10_3070.md); un
// export nou le poate schimba — poarta se actualizează atunci explicit, prin
// commit, nu prin tăcere.
const root=resolve(import.meta.dirname,'..');
const readCorpus=async path=>JSON.parse(gunzipSync(await readFile(join(root,'public',path+'.json.gz'))));
const registry=JSON.parse(await readFile(join(root,'public/data/snapshot-transport.json'),'utf8'));
const proof=path=>{const item=registry.items.find(item=>item.path===path);assert.ok(item,'corpusul '+path+' are dovada SHA-256 înregistrată');return item};

// SITUR: trei registre, antetul original, numărătorile de lipsă pin-ate la audit.
const siturKinds=[['cazare',32058,7259,2443],['alimentatie',9063,23,1806],['agentii',3104,124,33]];
for(const [kind,rows,missingCui,missingAddress] of siturKinds){
 const payload=await readCorpus('/situr/'+kind);
 assert.equal(payload.schema,'aflivra-situr-'+kind+'-v1',kind+': schema corpusului');
 assert.equal(payload.counts.rows,rows,kind+': rândurile auditate se servesc integral');
 assert.equal(payload.counts.missingCui,missingCui,kind+': CUI lipsă numărat onest, nu ascuns');
 assert.equal(payload.counts.missingAddressDetail,missingAddress,kind+': detaliul de adresă lipsă numărat onest');
 assert.ok(payload.exportDate&&/^\d{4}-\d{2}-\d{2}$/.test(payload.exportDate),kind+': data exportului din titlul sursei');
 assert.equal(payload.license,null,kind+': licența rămâne neconfirmată, niciodată presupusă');
 assert.equal(payload.rows.length,rows,kind+': rândurile fizice egalează numărătoarea declarată');
 const width=payload.columns.length;
 assert.ok(payload.rows.every(row=>Array.isArray(row)&&row.length===width),kind+': fiecare rând poartă toate coloanele originale');
 proof('/situr/'+kind+'.json');
}

// AMCCRS: 2.798 rânduri cu id-uri unice, 48 de forme text de clasă, numărătorile
// normalizate exact cele auditate (RsI 415, RsII 491, RsIII 163, RsIV 11,
// consolidată 118, urgență 1454, neîncadrată 144, neclasificabilă 2).
const amccrs=await readCorpus('/amccrs/buildings');
assert.equal(amccrs.counts.rows,2798,'AMCCRS: rândurile auditate');
assert.equal(amccrs.counts.distinctIds,2798,'AMCCRS: id-urile sursei unice');
assert.equal(amccrs.counts.distinctClassForms,48,'AMCCRS: cele 48 de forme text păstrate integral');
assert.equal(amccrs.counts.normalizedClasses.RsI,415,'AMCCRS: RsI 415 (audit)');
assert.equal(amccrs.counts.normalizedClasses.RsII,491,'AMCCRS: RsII 491 (audit)');
assert.equal(amccrs.counts.normalizedClasses.RsIII,163,'AMCCRS: RsIII 163 (audit)');
assert.equal(amccrs.counts.normalizedClasses.RsIV,11,'AMCCRS: RsIV 11 (audit)');
assert.equal(amccrs.counts.normalizedClasses.consolidata,118,'AMCCRS: consolidată 118 (audit)');
assert.equal(amccrs.counts.normalizedClasses.urgenta,1454,'AMCCRS: urgență 1454 (audit)');
assert.equal(amccrs.counts.normalizedClasses.neincadrata,144,'AMCCRS: neîncadrată 144 (audit)');
assert.equal(amccrs.counts.normalizedClasses.neclasificabila,2,'AMCCRS: neclasificabilă 2 (audit)');
assert.equal(Object.values(amccrs.counts.normalizedClasses).reduce((a,b)=>a+b,0),2798,'AMCCRS: clasele normalizate însumează registrul');
const amccrsIds=new Set();
for(const row of amccrs.rows){
 assert.ok(row[0]&&!amccrsIds.has(row[0]),'id-ul sursei nu se repetă');
 amccrsIds.add(row[0]);
 assert.ok(['1','2','3','4','5','6'].includes(row[14]),'sectorul normalizat e un sector 1–6 al Bucureștiului');
 assert.ok(typeof row[4]==='string'&&row[4].length>0,'textul original al sectorului se păstrează');
 assert.ok(['RsI','RsII','RsIII','RsIV','consolidata','urgenta','neincadrata','neclasificabila'].includes(row[13]),'clasa normalizată din enum-ul declarat');
}
proof('/amccrs/buildings.json');

// EIDA: rețeaua RO și istoricul M3+ — suma pe ani egalează totalul, ferestrele
// declarate, niciun an trunchiat la limita serviciului. Corpusul e aflivra-eida-v2:
// cele 150 de înregistrări de stație/perioadă (antetul FDSN nu e niciodată rând),
// cele 1.157 de evenimente cu câmpurile sub cheile corecte — tipul chiar în
// eventType, locația reală (vid sau nume) în eventLocationName, autorul magnitudinii
// în magnitudeAuthor — și felia 2026 înregistrată inconcludentă (204 la sursă),
// nu „fără cutremure”.
const eida=await readCorpus('/eida/seismic');
assert.equal(eida.schema,'aflivra-eida-v2','EIDA: corpusul v2 după remedierea mapării pe antet');
assert.equal(eida.counts.stations,150,'EIDA: rețeaua RO — 150 înregistrări stație/perioadă, fără antet');
assert.equal(eida.counts.events,1157,'EIDA: istoricul M3+ comis integral (audit: 1.157)');
assert.equal(eida.window.minMagnitude,3,'EIDA: baza de magnitudine 3 declarată');
assert.deepEqual(eida.truncatedYears,[],'EIDA: niciun an tăiat la limita de 1000 a serviciului');
const eidaCoverage2026=(eida.coverageByYear||[]).find(entry=>entry.year===2026);
assert.ok(eidaCoverage2026&&String(eidaCoverage2026.status).includes('inconclusive'),'EIDA: felia 2026 rămâne înregistrată inconcludentă (204 la sursă)');
assert.ok(eida.stations.every(station=>station.network!=='#Network'&&station.station.length>0),'EIDA: niciun antet servit drept stație');
const byYear=eida.events.reduce((map,event)=>{const year=event.time.slice(0,4);map.set(year,(map.get(year)||0)+1);return map},new Map());
for(const [year,count] of Object.entries(eida.counts.eventsByYear))assert.equal(byYear.get(year)||0,Number(count),'EIDA: anul '+year+' numărat onest în countsByYear');
assert.equal([...byYear.values()].reduce((a,b)=>a+b,0),eida.counts.events,'EIDA: totalul declarat = suma anilor reali');
assert.equal(eida.events.length,eida.counts.events,'EIDA: rândurile fizice = totalul declarat');
for(const event of eida.events){
 assert.ok(Number(event.latitude)>=43&&Number(event.latitude)<=49&&Number(event.longitude)>=20&&Number(event.longitude)<=30,'EIDA: evenimentul rămâne în dreptunghiul auditat');
 assert.ok(Number(event.magnitude)>=3,'EIDA: evenimentul respectă baza de magnitudine');
 assert.ok(event.eventLocationName!==event.eventType,'EIDA: câmpul locației nu poartă artificial tipul evenimentului (v1 deplasa patru chei)');
 assert.ok(event.eventType.length>0&&typeof event.magnitudeAuthor==='string','EIDA: tipul și autorul magnitudinii sub cheile lor');
}
proof('/eida/seismic.json');

// LMI 2015 București: 2.651 de rânduri cu coduri LMI distincte, extras pe geometria
// tipărită a tabelului (aflivra-lmi-bucuresti-v2). Fiecare rând poartă foliul tipărit
// al Monitorului ȘI pagina PDF, separate; datarea nu se mai scurge în adrese — v1
// îngropa textul datării în adresa a ~2.000 de rânduri și lăsa 1.715 de datări goale.
const lmi=await readCorpus('/lmi/monuments-bucuresti');
assert.equal(lmi.schema,'aflivra-lmi-bucuresti-v2','LMI: corpusul v2, extras pe coloane');
assert.equal(lmi.counts.rows,2651,'LMI: rândurile extrase');
assert.equal(lmi.counts.distinctCodes,2651,'LMI: codurile distincte');
assert.ok(lmi.publishedIn.includes('113 bis'),'LMI: publicarea în Monitorul Oficial declarată');
assert.ok(lmi.updateNote.includes('2015'),'LMI: baza 2015 declarată, fără înglobarea ordinelor ulterioare');
const lmiGolden=JSON.parse(await readFile(join(root,'ssnc-agent-orch/2026/10/10/fixuri-astra/fixtures/validated/lmi-golden-corrections.json'),'utf8'));
const lmiByCode=new Map(lmi.rows.map(row=>[row[0],row]));
for(const expected of lmiGolden){
 const found=lmiByCode.get(expected[0]);
 assert.ok(found,'LMI: rândul de referință vizuală '+expected[0]+' există în corpus');
 assert.deepEqual(found.slice(0,6),expected,'LMI: rândul '+expected[0]+' reproduce corecția vizuală livrată, întreg');
}
const emptyDating=lmi.rows.filter(row=>!row[4]).length;
assert.equal(emptyDating,337,'LMI: rândurile fără datare sunt cele reale (situri și monumente fără datări), nu 1.715 de datări pierdute în adrese');
const codes=new Set();
for(const row of lmi.rows){
 assert.ok(/^B-[IVX]+-[a-z]+-(?:A|B)-\d{2,6}(?:\.\d{1,3})?$/.test(row[0]),'LMI: codul are forma codului LMI');
 assert.ok(row[1]&&row[1].length>1,'LMI: denumirea monumentului prezentă');
 codes.add(row[0]);
 assert.ok(Number.isInteger(row[5])&&row[5]>=490&&row[5]<=740,'LMI: foliul Monitorului Oficial în intervalul tipărit');
 assert.ok(Number.isInteger(row[6])&&row[6]>=1&&row[6]<=233,'LMI: pagina PDF separată de foliu, în intervalul documentului');
 assert.ok(row[5]!==row[6],'LMI: foliul tipărit nu este indexul PDF-ului');
 assert.ok(row[3]!==row[4],'LMI: adresa nu este datarea');
}
assert.equal(codes.size,2651,'LMI: fiecare rând e un cod distinct');
proof('/lmi/monuments-bucuresti.json');
console.log('Trecut: corpusurile „surse românești” rămân integre — SITUR 32.058/9.063/3.104 cu lipsurile numărate, AMCCRS 2.798 cu cele 48 de forme păstrate integral și clasele normalizate exact cele auditate, EIDA v2 cu 1.157 de evenimente pe câmpurile antetului și 150 de stații, LMI v2 cu 2.651 de coduri, cele 12 corecții vizuale întregi și datarea separată de adresă.');
