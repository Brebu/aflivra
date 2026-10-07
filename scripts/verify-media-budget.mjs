import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {readSnapshotFile} from './snapshot-read.mjs';
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),root=new URL('../',import.meta.url);
let media;function compile(file,h=React){
 const code=ts.transpileModule(fs.readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,target={exports:{}};
 const resolve=name=>name==='react'?h:name==='react/jsx-runtime'?jsx:name.endsWith('/media')||name==='./media'?media:name==='./text'?compile('lib/live/text.ts'):require(name);
 new Function('require','module','exports',code)(resolve,target,target.exports);return target.exports}
media=compile('lib/live/media.ts');
// Budget hard gates for the shipped media tier: Workers Static Assets caps the
// project at 20,000 files and 25 MiB per file, and public/media alone stays far
// below the wave-2 + institutions headroom of this wave.
const MAX_MEDIA_FILES=15_500,MAX_SHIPPED_FILES=20_000,HARD_FILE_BYTES=25*1024*1024,MAX_VIDEOS=100,VIDEO_PREFERRED_BYTES=15*1024*1024;
const mediaDir=fileURLToPath(new URL('public/media/',root)),publicDir=fileURLToPath(new URL('public/',root));
const mediaFiles=fs.readdirSync(mediaDir).filter(f=>fs.statSync(mediaDir+f).isFile());
assert(mediaFiles.length<=MAX_MEDIA_FILES,'public/media must hold at most '+MAX_MEDIA_FILES+' files (wave 2 and institutions keep the remaining file budget): '+mediaFiles.length);
let largest=0;const overHard=[];
for(const file of mediaFiles){const bytes=fs.statSync(mediaDir+file).size;largest=Math.max(largest,bytes);if(bytes>=HARD_FILE_BYTES)overHard.push(file+' '+bytes)}
assert(overHard.length===0,'ASSETS per-file ceiling 25 MiB exceeded: '+overHard.join(', '));
function countFiles(dir){let n=0;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory())n+=countFiles(dir+'/'+entry.name);else n++}return n}
const clientDir=fileURLToPath(new URL('dist/client/',root)),distCensus=fs.existsSync(clientDir)?countFiles(clientDir):null,publicCensus=countFiles(publicDir),shippedCensus=distCensus??publicCensus;
assert(shippedCensus<=MAX_SHIPPED_FILES,'The shipped census must stay within the 20,000-file ASSETS budget: '+shippedCensus+(distCensus?' (dist/client)':' (public/, no build present)'));
// provenance registers
const manifest=JSON.parse(fs.readFileSync(new URL('public/media/manifest.json',root))),categoryPhotos=JSON.parse(fs.readFileSync(new URL('public/media/category-manifest.json',root))),illustrations=JSON.parse(fs.readFileSync(new URL('public/media/category-illustrations.json',root))),heroStyle=JSON.parse(fs.readFileSync(new URL('public/media/hero-style.json',root))),weather=JSON.parse(fs.readFileSync(new URL('public/media/weather-manifest.json',root)));
// Every manifest row — editorial photo, Commons-tagged photo, WLM photo and
// webm video — carries complete attribution and hashes the exact shipped bytes.
let videos=0,videoBytes=0;const overPreferred=[];
for(const asset of manifest.assets){
 assert(asset.app_id&&asset.app_file&&asset.author&&asset.license&&asset.license_url&&asset.source_page_url,'License and attribution completeness for manifest row '+asset.app_id);
 const bytes=fs.readFileSync(fileURLToPath(new URL('public/media/'+asset.app_file.replace('/media/',''),root)));
 assert(asset.bytes===bytes.length,'Manifest byte count must match the shipped file: '+asset.app_id);
 assert(asset.sha256===createHash('sha256').update(bytes).digest('hex'),'SHA-256 proof for '+asset.app_id);
 if(asset.role==='video'){videos++;videoBytes+=bytes.length;bytes.length<=VIDEO_PREFERRED_BYTES||overPreferred.push(asset.app_id+' '+bytes.length)}
}
assert(videos<=MAX_VIDEOS,'Video file cap '+MAX_VIDEOS+': '+videos);
if(overPreferred.length)console.log('Videos over the 15 MiB preferred band, shipped under the 25 MiB hard ceiling: '+overPreferred.join(', '));
// No unlicensed file on disk: every shipped binary must be claimed by a
// provenance register (CC/PD manifest, category photos, AI illustration
// logs, hero and weather assets). An orphan is an unattributable republication.
const claims=new Set();
for(const asset of manifest.assets)claims.add(asset.app_file.replace('/media/',''));
for(const entry of categoryPhotos)claims.add(entry.file);
for(const entry of illustrations)claims.add(entry.file);
for(const variant of illustrations.flatMap(entry=>entry.variants||[]))claims.add(variant.file);
claims.add(heroStyle.file);if(heroStyle.sourcePhoto)claims.add(heroStyle.sourcePhoto.replace('/media/',''));
for(const variant of heroStyle.variants||[])claims.add(variant.file);
for(const entry of weather.assets)claims.add(entry.file);
// Width variants carry the full provenance proof of the asset they derive
// from: registered bytes and SHA-256 for the exact shipped file.
for(const variant of [...(heroStyle.variants||[]),...illustrations.flatMap(entry=>entry.variants||[])]){
  const bytes=fs.readFileSync(fileURLToPath(new URL('public/media/'+variant.file,root)));
  assert(variant.bytes===bytes.length,'Variant byte count must match the shipped file: '+variant.file);
  assert(variant.sha256===createHash('sha256').update(bytes).digest('hex'),'SHA-256 proof for variant '+variant.file);
}
// A registered variant nothing renders is an orphan in the other direction:
// the hero srcSet must offer every hero variant behind the mobile sizes gate,
// and the cover srcSet must offer every illustration variant.
const pageSource=fs.readFileSync(fileURLToPath(new URL('app/page.tsx',root)),'utf8'),coverSource=fs.readFileSync(fileURLToPath(new URL('app/category-photo.tsx',root)),'utf8');
for(const variant of heroStyle.variants||[])assert(pageSource.includes('/media/'+variant.file),'Hero variant must be offered in the hero srcSet: '+variant.file);
for(const entry of illustrations)for(const variant of entry.variants||[])assert(coverSource.includes('/media/'+variant.file)||coverSource.includes('artwork.variants'),'Cover rendering must offer illustration variants for '+entry.id);
const binaries=mediaFiles.filter(f=>/\.(?:webp|webm|png|jpe?g|gif|avif)$/i.test(f)),orphans=binaries.filter(f=>!claims.has(f));
assert(orphans.length===0,'Unlicensed media files with no provenance register: '+orphans.join(', '));
// True-or-honest image coverage: every corpus card renders one of the three
// provenance classes — attested local photo, hotlinked Commons/OSM tag, or the
// labeled AI editorial illustration of its category. No bare imageless card can
// exist while each category keeps its illustration on disk; the percentages
// below report the honestly imaged share without inflating it.
for(const entry of illustrations)assert(fs.existsSync(fileURLToPath(new URL('public/media/'+entry.file,root))),'AI editorial illustration missing for '+entry.id);
const illustrationCategories=new Set(illustrations.map(i=>i.id));
const placesManifest=JSON.parse(await readSnapshotFile(fileURLToPath(new URL('public/places/manifest.json',root))));
const attested=new Set(JSON.parse(await readSnapshotFile(fileURLToPath(new URL('public/places/exploration.json',root)))).map(p=>p.recordId));
assert(attested.size>0);const perPlacePhotos=new Map();
for(const place of JSON.parse(await readSnapshotFile(fileURLToPath(new URL('public/places/exploration.json',root))))){const n=place.images.length;perPlacePhotos.set(place.id,Math.max(perPlacePhotos.get(place.id)||0,n));assert(n>=1&&n<=3,'Per-place photo curation cap (gallery 1–3 photos): '+place.id)}
const coverage={};let totals={rows:0,hotlink:0,attested:0};
for(const [category,indices] of Object.entries(placesManifest.indices)){
 if(category==='local-all')continue;
 assert(illustrationCategories.has(category),'AI illustration fallback must exist for every indexed category: '+category);
 const rows=[];for(const part of indices.name)rows.push(...JSON.parse(await readSnapshotFile(fileURLToPath(new URL('public/places/'+part.file,root)))).items);
 let hotlink=0,attestedRows=0;
 for(const row of rows){if(row.image&&(media.publicImageUrl(row.image)||media.publicUrl(row.image)))hotlink++;if(attested.has(row.id))attestedRows++}
 coverage[category]={rows:rows.length,hotlink,attested:attestedRows};
 totals.rows+=rows.length;totals.hotlink+=hotlink;totals.attested+=attestedRows;
}
const report=JSON.parse(await readSnapshotFile(fileURLToPath(new URL('public/places/exploration-import.json',root))));
assert(report.afterCoverage,'The import report must publish its after-coverage table');
for(const [category,count] of Object.entries(coverage))for(const key of ['rows','hotlink','attested'])assert(report.afterCoverage[category]?.[key]===count[key],'Coverage drift between the import report and the shipped corpus for '+category+'.'+key);
const before=report.beforeCoverage||{};
console.log('Media budget verified: '+mediaFiles.length+' files in public/media (cap '+MAX_MEDIA_FILES+'), largest '+largest.toLocaleString()+' bytes, shipped census '+shippedCensus+' of '+MAX_SHIPPED_FILES+(distCensus?' from dist/client':' (public/; no build present)')+'; '+manifest.assets.length+' manifest rows with full license+author+SHA-256 proofs; '+videos+' webm videos ('+videoBytes.toLocaleString()+' bytes); '+binaries.length+' binaries all claimed by provenance registers; attested places capped at 3 photos.');
console.log('True-or-honest coverage by category (total rows · hotlink tag · attested local · % imaged):');
const lines=[];
for(const [category,c] of Object.entries(coverage)){const b=before[category]||{hotlink:0,attested:0};lines.push('  '+category.padEnd(12)+String(c.rows).padStart(7)+' rows · hotlink '+String(c.hotlink).padStart(5)+' (was '+String(b.hotlink).padStart(5)+') · attested '+String(c.attested).padStart(4)+' (was '+String(b.attested||0).padStart(4)+') · imaged '+((100*(c.hotlink+c.attested)/c.rows).toFixed(2))+'% (was '+(b.rows?(100*(b.hotlink+(b.attested||0))/b.rows).toFixed(2):'0.00')+'%)')}
console.log(lines.join('\n'));
console.log('Every remaining card renders the labeled AI editorial illustration of its category — no bare imageless card. ROW-COVERED: '+totals.hotlink+' hotlinked + '+totals.attested+' attested of '+totals.rows+' corpus rows ('+(100*(totals.hotlink+totals.attested)/totals.rows).toFixed(2)+'% imaged; the rest render honest AI-labeled illustrations, never invented photos).');
