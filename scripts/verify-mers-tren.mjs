import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

// Poarta importului de mers tren: parserul edițiilor Infofer se verifică pe
// fixture-uri sintetice, izolat — fără rețea și fără corpusul public. Ancora
// semantică: OraP e PLECAREA din stația de origine a elementului, OraS e SOSIREA
// la destinația lui (dovedit pe StationareSecunde: OraP−OraS = staționarea reală,
// probă 2460−2430=30s). Prinde: tăierea la 400 (D12), destinația reală de traseu
// cu escală separată (D14), N02 — gara de origine nu fabrică sosiri comerciale și
// stațiile intermediare primesc sosirea de pe elementul care sosește în ele,
// markerul de capăt Infofer nu fabrică plecări, circularele se întorc onest.
const root=resolve(import.meta.dirname,'..');
const temp=await mkdtemp(join(tmpdir(),'aflivra-mers-'));
try{
  const source=await readFile(join(root,'scripts/import-mers-tren.mjs'),'utf8');
  const start=source.indexOf('const attrs='),end=source.indexOf('const results=[]');
  assert(start>=0&&end>start,'segmentul de parsare al importului se păstrează identificabil');
  const js=source.slice(start,end);
  await writeFile(join(temp,'parse-mers-tren.mjs'),js+'\nexport {parseMersTren};\n');
  const {parseMersTren}=await import(pathToFileURL(join(temp,'parse-mers-tren.mjs')).href);

  const train=(number,elements,category='IR',zile='127',final='99')=>
    `<Tren Numar="${number}" CategorieTren="${category}"><CalendarTren Zile="${zile}"/><Trasa CodStatieFinala="${final}">${elements}</Trasa></Tren>`;
  // OraP = plecarea din fromCode, OraS = sosirea în toCode — secunde de la miezul
  // nopții, întregi, cum publică Infofer; OraP−OraS la o escală = staționarea.
  const element=(fromCode,fromName,toCode,toName,oraP,oraS)=>`<ElementTrasa CodStaOrigine="${fromCode}" DenStaOrigine="${fromName}" CodStaDest="${toCode}" DenStaDestinatie="${toName}" OraP="${oraP}" OraS="${oraS}" TipOprire="O"/>`;
  const h=(hh,mm,ss=0)=>hh*3600+mm*60+ss;

  // 1. D12 — 401 de trenuri printr-o stație: panoul păstrează toate, fără prag.
  {
    const xml=`<Mt MtValabilDeLa="20261001" MtValabilPinaLa="20261231">${Array.from({length:401},(_,i)=>
      train(10000+i,element(50,'Gara Verificării',60,'Oprirea Verificării',h(0,5)+i,h(0,6)+i)+element(60,'Oprirea Verificării',99,'Capătul Verificării',h(8,12)+i,h(8,20)+i))).join('')}</Mt>`;
    const parsed=parseMersTren(xml),origin=parsed.stations.get(50),via=parsed.stations.get(60);
    assert.ok(via,'stația de tranzit există');
    assert.equal(via.departures.length,401,'401 de plecări reținute integral — fără tăiere la 400 (D12)');
    assert.equal(via.arrivals.length,401,'401 de sosiri reținute integral — fără tăiere la 400 (D12)');
    assert.ok(origin,'stația de origine există');
    assert.equal(origin.departures.length,401,'hub-ul de origine păstrează toate plecările');
    assert.equal(origin.arrivals.length,0,'gara de unde pornesc trenurile nu fabrică sosiri comerciale (N02)');
  }

  // 2. D14 + N02 — originea pleacă fără sosire, intermediarul primește sosirea
  // elementului care sosește în el și plecarea elementului care pleacă din el,
  // iar OraP−OraS consecutive = staționarea reală la escală.
  {
    const xml=`<Mt MtValabilDeLa="20261001" MtValabilPinaLa="20261231">${
      train(500,element(50,'Brașov',60,'Stupini Hm.',h(10,2),h(10,4))+element(60,'Stupini Hm.',70,'Hărman',h(10,8),h(10,10))+element(70,'Hărman',99,'Sfântu Gheorghe',h(10,28),h(10,30)))
    }</Mt>`;
    const parsed=parseMersTren(xml),brasov=parsed.stations.get(50),stupini=parsed.stations.get(60),hărman=parsed.stations.get(70),terminus=parsed.stations.get(99);
    assert.equal(brasov.departures.length,1,'plecarea din stația de origine');
    assert.equal(brasov.departures[0].t,h(10,2),'plecarea poartă OraP reală (10:02), nu OraS elementului');
    assert.equal(brasov.departures[0].d,'Sfântu Gheorghe','Destinația e capătul traseului, nu următoarea escală (D14)');
    assert.equal(brasov.departures[0].nx,'Stupini Hm.','Următoarea escală se păstrează separat, pe nx');
    assert.equal(brasov.arrivals.length,0,'trenul care pornește din Brașov nu apare ca sosire din Brașov (N02)');
    assert.equal(stupini.arrivals.length,1,'escală intermediară cu sosire reală');
    assert.equal(stupini.arrivals[0].t,h(10,4),'sosirea stației intermediare e OraS a elementului care sosește în ea');
    assert.equal(stupini.departures.length,1,'escală intermediară cu plecare reală');
    assert.equal(stupini.departures[0].t,h(10,8),'plecarea stației intermediare e OraP a elementului următor');
    assert.equal(stupini.departures[0].t-stupini.arrivals[0].t,240,'staționarea = plecare − sosire, coerent cu limita reală');
    assert.equal(hărman.arrivals[0].t,h(10,10),'a doua escală primește sosirea elementului ei');
    assert.equal(terminus.arrivals.length,1,'sosirea la capăt cu tip T');
    assert.equal(terminus.arrivals[0].t,h(10,30),'timpul T e OraS a ultimei escale reale');
    assert.equal(terminus.arrivals[0].f,'Brașov','originea sosirii e prima stație a traseului');
    assert.equal(terminus.departures.length,0,'capătul nu fabrică plecare');
  }

  // 3. Tren circular — originea e și capăt: întoarcerea rămâne sosire onestă.
  {
    const xml=`<Mt MtValabilDeLa="20261001" MtValabilPinaLa="20261231">${
      train(600,element(50,'Gara Verificării',60,'Tur Verificare',h(11,0),h(11,10))+element(60,'Tur Verificare',50,'Gara Verificării',h(11,12),h(11,20)),'IR','127','50')
    }</Mt>`;
    const parsed=parseMersTren(xml),circular=parsed.stations.get(50),mid=parsed.stations.get(60);
    assert.equal(circular.departures.length,1,'trenul circular pleacă din origine');
    assert.equal(circular.departures[0].d,'Gara Verificării','capătul traseului circular e originea, onest');
    assert.equal(circular.departures[0].t,h(11,0),'plecarea reală 11:00');
    assert.equal(circular.arrivals.length,1,'întoarcerea la origine rămâne sosire comercială reală');
    assert.equal(circular.arrivals[0].t,h(11,20),'sosirea întoarcerii e OraS ultimei escale (11:20)');
    assert.equal(mid.arrivals[0].t,h(11,10),'stația de tur primește sosirea reală');
    assert.equal(mid.departures[0].t,h(11,12),'stația de tur pleacă la OraP reală');
  }

  // 4. Markerul de capăt Infofer (element Nord→Nord la gara terminală) nu
  // fabrică plecare fantomă din gara de sosire; capătul rămâne destinația.
  {
    const xml=`<Mt MtValabilDeLa="20261001" MtValabilPinaLa="20261231">${
      train(700,element(60,'Oradea',50,'Gara Verificării',h(11,0),h(12,0))+element(50,'Gara Verificării',50,'Gara Verificării','',''),'IR','127','50')
    }</Mt>`;
    const parsed=parseMersTren(xml),terminus=parsed.stations.get(50),origin=parsed.stations.get(60);
    assert.equal(terminus.departures.length,0,'markerul de capăt nu fabrică plecare din gara terminală (D14)');
    assert.equal(terminus.arrivals.length,1,'sosirea reală la capăt se păstrează');
    assert.equal(terminus.arrivals[0].t,h(12,0),'timpul sosirii la capăt e OraS escalei reale');
    assert.equal(origin.departures.length,1,'plecarea din gara de origine rămâne');
    assert.equal(origin.departures[0].t,h(11,0),'plecarea poartă OraP reală');
    assert.equal(origin.departures[0].d,'Gara Verificării','destinația traseului e capătul real');
  }

  console.log('Poarta importului de mers tren a trecut: fără tăiere la 400, OraP plecare / OraS sosire pe limite reale, destinația de traseu onestă, originea fără sosiri fabricate, escală separată pe nx, circularele și markerul de capăt oneste.');
}catch(error){
  console.error(error);
  process.exit(1);
}finally{await rm(temp,{recursive:true,force:true})}
