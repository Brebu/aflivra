// Offline corpus import for the AMCCRS Bucharest seismic classification register:
// executes the two-step public Ninja Tables flow (page first — the nonce and the
// table id live in the page's own config, never hardcoded — then the full-data AJAX),
// records every original column plus both the source classification text and its
// normalized form, and writes the corpus under public/data/amccrs/. The nonce's
// lifetime is unknown and it stays in this offline script, never in the Worker.
// Run from the repo root: node scripts/import-amccrs-snapshot.mjs
import {writeSnapshot,registerPrefix} from './snapshot-register.mjs';

const UA='Aflivra-Integration-Evaluation/1.0';
const PAGE_URL='https://amccrs-pmb.ro/lista-imobile-2/';
const fetchWith=async url=>{const response=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('HTTP '+response.status+' de la '+url);return response};

const roDateFromText=text=>{const m=/(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(text));return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):null};

// The register publishes 48 distinct text forms for the latest classification
// (spacing, case, typos and one person name); the original is kept verbatim and
// normalized separately. The categories of emergency stay distinct — they are never
// equated with the Rs classes. The exploration rule (order matters: NEINCADRAT
// before URGEN, RSIV before RSIII before RSII before RSI) reproduces the audited
// totals: RsI 415, RsII 491, RsIII 163, RsIV 11, consolidată 118, urgență 1454,
// neîncadrată 144, neclasificabilă 2.
const normalizeClass=raw=>{
 const text=String(raw??'').replace(/[\t ]+/g,' ').trim();
 if(!text)return 'neclasificabila';
 // „ÎNCADRARE ÎN CATEGORIE DE URGENȚĂ; NEÎNCADRATĂ ÎN CLASE…" e o încadrare de urgență
 // (clauza secundară nu o schimbă), pe când „NEÎNCADRAT ÎN …" e starea neîncadrării:
 // marcatorul contează la începutul textului, cu diacriticele pliate.
 const upper=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/^[-.\s\d]+/,'');
 if(upper.startsWith('NEINCADRAT'))return 'neincadrata';
 if(upper.includes('CONSOLIDAT'))return 'consolidata';
 if(upper.includes('URGEN'))return 'urgenta';
 if(/RS\s*IV/.test(upper))return 'RsIV';
 if(/RS\s*III/.test(upper))return 'RsIII';
 if(/RS\s*II/.test(upper))return 'RsII';
 if(/RS\s*I/.test(upper))return 'RsI';
 return 'neclasificabila';
};

const page=await fetchWith(PAGE_URL);
const html=await page.text();
const nonce=/"ninja_table_public_nonce"\s*:\s*"([0-9a-f]+)"/.exec(html)?.[1]||/ninja_table_public_nonce['"]?\s*[:=]\s*['"]([0-9a-f]+)/.exec(html)?.[1];
const tableId=/"table_id"\s*:\s*"?(\d+)"?/.exec(html)?.[1];
if(!nonce||!tableId)throw Error('Configurația Ninja Tables (nonce/tabel) nu a putut fi extrasă din pagina curentă.');
const pageUpdated=roDateFromText(/actualiza\w*[^<>\n]{0,60}/i.exec(html)?.[0]||'');

const dataResponse=await fetchWith('https://amccrs-pmb.ro/wp-admin/admin-ajax.php?action=wp_ajax_ninja_tables_public_action&table_id='+tableId+'&target_action=get-all-data&default_sorting=old_first&skip_rows=0&limit_rows=-1&ninja_table_public_nonce='+nonce);
const raw=JSON.parse(await dataResponse.text());
if(!Array.isArray(raw)||!raw.length)throw Error('Răspunsul Ninja Tables nu conține înregistrări.');
const fetchedAt=new Date().toISOString();
const rows=raw.map(entry=>{
 const v=entry.value||{};
 const id=String(v['___id___']??'').trim()||null;
 if(!id)throw Error('O înregistrare fără id-ul sursei nu se poate servi.');
 // Sectorul se servește ca cifră (formele sursei — „Sector 2\t”, „sector 3”,
 // „Sector 5(bloc 1)”) iar textul original rămâne coloană separată.
 const sectorRaw=String(v.sector??'');
 const sectorDigit=(/([1-6])/.exec(sectorRaw)||[])[1]||'';
 return [id,v.nrcrt??'',v.adresa??'',v.nr??'',sectorRaw,v.anulconstruirii??'',v.regimuldeinaltime??'',v.numardeapartamente??'',v.anulelaborariiexpertizeitehnice??'',v['expertultehnicatestatpentrucerintaesentialadecalitaterezistentamecanicasistabilitatemdrap']??'',v.ultimaincadrareinclasaderisc??'',v.incadrarianterioareinclasaderisc??'',v.observatii??'',normalizeClass(v.ultimaincadrareinclasaderisc??''),sectorDigit];
});
const ids=new Set(rows.map(row=>row[0]));
if(ids.size!==rows.length)throw Error('Id-urile sursei nu sunt unice: '+rows.length+' rânduri, '+ids.size+' id-uri.');
if(rows.length<2000)throw Error('Registrul are '+rows.length+' rânduri, sub pragul de gardă față de 2.798 auditate.');
const columns=['___id___','nrcrt','adresa','nr','sectorsursa','anulconstruirii','regimuldeinaltime','numardeapartamente','anulelaborariiexpertizeitehnice','expert','ultimaincadrareinclasaderisc','incadrarianterioareinclasaderisc','observatii','clasanormalizata','sectornormalizat'];
const classForms={};
for(const row of rows){const original=row[10];classForms[original]=(classForms[original]||0)+1}
const normalized={};
for(const row of rows){const n=normalizeClass(row[10]);normalized[n]=(normalized[n]||0)+1}

const files=[];
const payload={schema:'aflivra-amccrs-v1',sourceUrl:PAGE_URL,tableName:'Lista Cladiri 2026',pageUpdated,fetchedAt,license:null,
 licenseNote:'Registru oficial al AMCCRS (amccrs-pmb.ro); licența de reutilizare comercială neconfirmată la '+fetchedAt.slice(0,10)+' — sursă oficială, studiu și verificare personală.',
 columns,normalizationRule:'Textul original se păstrează integral; clasa normalizată urmează regula auditată (NEINCADRAT înainte de URGEN; RSIV→RSIII→RSII→RSI; categoriile de urgență rămân distincte de clasele Rs).',
 coverage:'Municipiul București',counts:{rows:rows.length,distinctIds:ids.size,distinctClassForms:Object.keys(classForms).length,normalizedClasses:normalized},
 rows};
const bytes=await writeSnapshot(files,'/amccrs/buildings.json',payload);
await registerPrefix(files,'/amccrs/');
console.log(JSON.stringify({result:'ok',rows:rows.length,classForms:Object.keys(classForms).length,normalized,pageUpdated,bytes}));
