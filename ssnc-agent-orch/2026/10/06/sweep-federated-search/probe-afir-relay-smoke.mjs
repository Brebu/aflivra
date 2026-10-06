import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';

// Smoke pe serverul de dev (:5173, preexistent — pornit de altcineva, refolosit, nu oprit):
// relay-ul round-trip cu fixtures derivate din copia de rezervă a semnului AFIR.
const root=resolve(fileURLToPath(new URL('../../../../..',import.meta.url)),'.');
const sessionDir=resolve(fileURLToPath(new URL('.',import.meta.url)),'.');
const base='http://127.0.0.1:5173';
const devVars=await readFile(join(root,'.dev.vars'),'utf8');
const devToken=(devVars.match(/^REFRESH_TOKEN=(.+)$/m)||[])[1]?.trim();
assert(devToken,'.dev.vars fără REFRESH_TOKEN');
const seedEntry=JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8'))['feed:agricultura'];
const seedItems=seedEntry.data.items;
const months=['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];
const feedHtml=items=>'<html><body>'+items.map(item=>{const [y,m,d]=String(item.publishedAt||'').split('-');const href=item.url.replace('https://www.afir.ro','');return '<div class="card-body news-content"><h4><a href="'+href+'">'+item.title+'</a></h4><p class="item-date">'+d+' '+months[Number(m)-1]+' '+y+'</p></div><div class="news-border"></div>'}).join('')+'</body></html>';
const articleHtml=item=>'<!doctype html><html><head><meta property="article:published_time" content="'+(item.publishedAt||'2026-10-01')+'T10:30:00+03:00"></head><body><h1>'+item.title+'</h1><div class="entry-content"><p>Primul paragraf integral al comunicatului de verificare.</p><p>Al doilea paragraf cu detalii despre finanțare.</p><a href="https://www.afir.ro/documente/anexa-verificare.pdf">Anexa comunicatului</a></div></body></html>';
const startedAt=Date.now();
const post=(payload,authorization)=>fetch(base+'/api/seed/afir',{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:JSON.stringify(payload)});
const results={};
console.log('1) poarta de acces:');
{
 const noToken=await post({phase:'feed',body:'<html></html>'});
 assert.equal(noToken.status,401);assert.deepEqual(await noToken.json(),{error:'Acces interzis.'});
 const wrongToken=await post({phase:'feed',body:'<html></html>'},'Bearer token-gresit');
 assert.equal(wrongToken.status,401);assert.deepEqual(await wrongToken.json(),{error:'Acces interzis.'});
 const malformed=await fetch(base+'/api/seed/afir',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+devToken},body:'{nu este json'});
 assert.equal(malformed.status,400);
 results.authGate='401 fără token / cu token greșit; 400 pe JSON invalid';
}
console.log('  '+results.authGate);
console.log('2) faza feed — want complet pentru comunicatele fără text integral în starea locală:');
{
 const response=await post({phase:'feed',body:feedHtml(seedItems)},'Bearer '+devToken);
 assert.equal(response.status,200,'faza feed răspunde 200 pe serverul de dev');
 const payload=await response.json();
 assert.equal(payload.result,'ok');assert.equal(payload.phase,'feed');
 assert.equal(payload.items,seedItems.length,'8 comunicate parsee din fixture');
 assert.deepEqual(payload.want,seedItems.map(item=>item.url),'want = toate cele 8 adrese seed, în ordinea fluxului');
 assert.equal(payload.feedStored,true);
 results.firstWant=[...payload.want];
}
console.log('  want: '+results.firstWant.length+' adrese, egale cu lista seed, în ordine.');
console.log('3) faza articles — publicarea textului integral pe cheile cititorului:');
{
 const items=results.firstWant.map(url=>({url,html:articleHtml(seedItems.find(item=>item.url===url))}));
 const response=await post({phase:'articles',items},'Bearer '+devToken);
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.result,'ok');assert.deepEqual(payload.stored,results.firstWant);assert.deepEqual(payload.failed,[]);
 results.articlesStored=[...payload.stored];
}
console.log('  stocate: '+results.articlesStored.length+' articole, zero eșecuri.');
console.log('4) ciclul se închide + cititorul servește fără să atingă sursa:');
{
 const closed=await (await post({phase:'feed',body:feedHtml(seedItems)},'Bearer '+devToken)).json();
 assert.deepEqual(closed.want,[],'want devine gol după preluarea completă');
 const read=await fetch(base+'/api/content?url='+encodeURIComponent(results.firstWant[0]));
 assert.equal(read.status,200,'cititorul de articole răspunde 200');
 const state=await read.json();
 assert(['fresh','cached'].includes(state.status),'cititorul servește copia relay-uită: '+state.status);
 assert.equal(state.data.title,seedItems[0].title);
 assert.equal(state.data.textComplete,true);
 assert(state.data.content.includes('Primul paragraf integral'));
 assert.equal(state.data.attachments.length,1);
 assert(state.lastSuccessAt&&Date.parse(state.lastSuccessAt)>startedAt,'ultima preluare validă = momentul relay-ului');
 const broken=await (await post({phase:'articles',items:[{url:results.firstWant[1],html:'<p>nu este o pagină</p>'}]},'Bearer '+devToken)).json();
 assert.equal(broken.result,'partial');assert.deepEqual(broken.failed,[{url:results.firstWant[1],error:'Publicația nu a furnizat o pagină validă.'}]);
 results.readerServe=state.status+' / '+state.lastSuccessAt;
}
console.log('  want gol; cititorul /api/content servește „'+seedItems[0].title.slice(0,40)+'…” stare '+results.readerServe+'; pagina invalidă raportată per articol.');
console.log('5) fluxul Agricultura servește comunicatele publicate prin relay:');
{
 const domain=await fetch(base+'/api/domain?kind=agricultura');
 assert.equal(domain.status,200);
 const state=await domain.json();
 assert(['fresh','cached'].includes(state.status),'fluxul servește copia publicată: '+state.status);
 const titles=(state.data.items||[]).map(item=>item.title);
 assert.deepEqual(titles,seedItems.map(item=>item.title),'cele 8 comunicate seed servite prin /api/domain, în ordine');
 results.feedServe=state.status+' · '+titles.length+' comunicate';
}
console.log('  /api/domain stare '+results.feedServe+'.');
await writeFile(join(sessionDir,'probes/relay-smoke.json'),JSON.stringify({startedAt:new Date(startedAt).toISOString(),...results},{},1));
console.log('SMOKE PASS — rezultat scris în probes/relay-smoke.json');
