import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

// Poarta importului de mers tren: parserul edițiilor Infofer se verifică pe
// fixture-uri sintetice, izolat — fără rețea și fără corpusul public. Prinde:
// tăierea silențioasă la 400 de înregistrări pe stație (D12), destinația de
// traseu în locul următoarei escală în coloana plecărilor (D14) și trenurile
// circulare (originea e și capăt).
const root=resolve(import.meta.dirname,'..');
const temp=await mkdtemp(join(tmpdir(),'aflivra-mers-'));
try{
  const source=await readFile(join(root,'scripts/import-mers-tren.mjs'),'utf8');
  // Segmentul self-contained al scriptului: helperele de atribute/ore/zile plus
  // parseMersTren, fără lanțul de import/rulare.
  const start=source.indexOf('const attrs='),end=source.indexOf('const results=[]');
  assert(start>=0&&end>start,'segmentul de parsare al importului se păstrează identificabil');
  const js=source.slice(start,end);
  await writeFile(join(temp,'parse-mers-tren.mjs'),js+'\nexport {parseMersTren};\n');
  const {parseMersTren}=await import(pathToFileURL(join(temp,'parse-mers-tren.mjs')).href);

  const train=(number,elements,category='IR',zile='127',final='99')=>
    `<Tren Numar="${number}" CategorieTren="${category}"><CalendarTren Zile="${zile}"/><Trasa CodStatieFinala="${final}">${elements}</Trasa></Tren>`;
  const element=(fromCode,fromName,toCode,toName,p='08:00:00',s='08:02:00')=>
    `<ElementTrasa CodStaOrigine="${fromCode}" DenStaOrigine="${fromName}" CodStaDest="${toCode}" DenStaDestinatie="${toName}" OraP="${p}" OraS="${s}" TipOprire="O"/>`;

  // 1. D12 — 401 de trenuri printr-o stație: panoul păstrează toate, fără prag.
  {
    const xml=`<Mt MtValabilDeLa="20261001" MtValabilPinaLa="20261231">${Array.from({length:401},(_,i)=>
      train(10000+i,element(50,'Gara Verificării',60,'Oprirea Verificării','08:06:00','08:05:00')+element(60,'Oprirea Verificării',99,'Capătul Verificării','08:20:00','08:12:00'))).join('')}</Mt>`;
    const parsed=parseMersTren(xml),station=parsed.stations.get(60);
    assert.ok(station,'stația de tranzit există');
    assert.equal(station.departures.length,401,'401 de plecări reținute integral — fără tăiere la 400 (D12)');
    assert.equal(station.arrivals.length,401,'401 de sosiri reținute integral — fără tăiere la 400 (D12)');
    const hub=parsed.stations.get(50);
    assert.equal(hub.departures.length,401,'hub-ul de origine păstrează toate plecările');
  }

  // 2. D14 — coloana Destinație e capătul traseului, următoarea escală merge pe nx.
  {
    const xml=`<Mt MtValabilDeLa="20261001" MtValabilPinaLa="20261231">${
      train(500,element(50,'Brașov',60,'Stupini Hm.','10:04:00','10:02:00')+element(60,'Stupini Hm.',70,'Hărman','10:10:00','10:08:00')+element(70,'Hărman',99,'Sfântu Gheorghe','10:30:00','10:28:00'))
    }</Mt>`;
    const parsed=parseMersTren(xml),brasov=parsed.stations.get(50);
    assert.equal(brasov.departures.length,1,'plecarea din stația de origine');
    const row=brasov.departures[0];
    assert.equal(row.d,'Sfântu Gheorghe','Destinația e capătul traseului, nu următoarea escală (D14)');
    assert.equal(row.nx,'Stupini Hm.','Următoarea escală se păstrează separat, pe nx');
    const stop=parseMersTren(xml).stations.get(60);
    assert.equal(stop.departures[0].d,'Sfântu Gheorghe','și din stația de tranzit destinația rămâne capătul');
    assert.equal(stop.departures[0].nx,'Hărman','escală separată din stația de tranzit');
    const arrivals=parsed.stations.get(99);
    assert.equal(arrivals.arrivals.length,1,'sosirea la capăt cu tip T');
    assert.equal(arrivals.arrivals[0].f,'Brașov','originea sosirii e prima stație a traseului');
  }

  // 3. Tren circular — originea e și capăt: destinația rămâne onestă.
  {
    const xml=`<Mt MtValabilDeLa="20261001" MtValabilPinaLa="20261231">${
      train(600,element(50,'Gara Verificării',60,'Tur Verificare','11:10:00','11:00:00')+element(60,'Tur Verificare',50,'Gara Verificării','11:20:00','11:12:00'))
    }</Mt>`;
    const parsed=parseMersTren(xml),circular=parsed.stations.get(50);
    assert.equal(circular.departures.length,1,'trenul circular pleacă din origine');
    assert.equal(circular.departures[0].d,'Gara Verificării','capătul traseului circular e originea, onest');
    assert.ok(circular.arrivals.length>=1,'trenul circular și sosește la origine');
  }

  // 4. Markerul de capăt Infofer (element Nord→Nord la gara terminală) nu
  // fabrică plecare fantomă din gara de sosire; capătul rămâne destinația.
  {
    const xml=`<Mt MtValabilDeLa="20261001" MtValabilPinaLa="20261231">${
      train(700,element(60,'Oradea',50,'Gara Verificării','12:00:00','11:00:00')+element(50,'Gara Verificării',50,'Gara Verificării','','12:05:00'),'IR','127','50')
    }</Mt>`;
    const parsed=parseMersTren(xml),terminus=parsed.stations.get(50);
    assert.equal(terminus.departures.length,0,'markerul de capăt nu fabrică plecare din gara terminală (D14)');
    assert.ok(terminus.arrivals.length>=1,'sosirea reală la capăt se păstrează');
    const via=parsed.stations.get(60);
    assert.equal(via.departures.length,1,'plecarea din gara de origine rămâne');
    assert.equal(via.departures[0].d,'Gara Verificării','destinația traseului e capătul real');
  }

  console.log('Poarta importului de mers tren a trecut: fără tăiere la 400, destinația de traseu onestă în plecări, escală separată pe nx, circularele oneste, markerul de capăt fără plecări fantomă.');
}catch(error){
  console.error(error);
  process.exit(1);
}finally{await rm(temp,{recursive:true,force:true})}
