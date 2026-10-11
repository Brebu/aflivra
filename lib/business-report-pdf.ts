import {PDFDocument,rgb,type PDFPage,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {BusinessReport} from './business-report';
const W=841.89,H=595.28,M=42,BOTTOM=50;
const navy=rgb(.08,.19,.30),teal=rgb(0,.47,.49),gray=rgb(.35,.41,.47),light=rgb(.94,.96,.97),rule=rgb(.81,.86,.89);
const palette=[teal,rgb(.17,.39,.70),rgb(.82,.40,.15),rgb(.48,.31,.62),rgb(.20,.55,.35),rgb(.75,.25,.36),rgb(.40,.46,.53),rgb(.65,.55,.10)];
const number=(n:number|null|undefined,dec=0)=>typeof n!=='number'||!Number.isFinite(n)?'n/d':new Intl.NumberFormat('ro-RO',{maximumFractionDigits:dec,minimumFractionDigits:dec}).format(n);
export type ReportMedia={bytes:Uint8Array;caption:string;credit:string;license:string;sourceUrl:string};
export async function createBusinessReportPdf(report:BusinessReport,fonts:{regular:Uint8Array;semibold:Uint8Array},photo?:ReportMedia,signal?:AbortSignal){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 // Full embedding preserves Inter glyphs across PDF viewers and print renderers.
 const regular=await doc.embedFont(fonts.regular,{subset:false}),bold=await doc.embedFont(fonts.semibold,{subset:false});
 const supported=new Set(regular.getCharacterSet());
 const safe=(text:unknown)=>Array.from(String(text??'').replace(/[\u2010-\u2015]/g,'-').replace(/[\r\n\t]+/g,' ')).map(c=>supported.has(c.codePointAt(0)!)?c:'?').join('');
 const wrap=(text:unknown,width:number,size=10,font:PDFFont=regular)=>{
  const lines:string[]=[];let line='';for(const word of safe(text).split(/\s+/)){
   if(font.widthOfTextAtSize(line?line+' '+word:word,size)<=width){line+=(line?' ':'')+word;continue}
   if(line)lines.push(line);line='';let token='';for(const char of word){if(font.widthOfTextAtSize(token+char,size)>width){lines.push(token);token=''}token+=char}line=token;
  }if(line)lines.push(line);return lines.length?lines:[''];
 };
 let page!:PDFPage,y=0;
 const text=(s:unknown,x:number,at:number,size=10,font=regular,color=navy)=>page.drawText(safe(s),{x,y:at,size,font,color});
 function newPage(title:string){signal?.throwIfAborted();page=doc.addPage([W,H]);text('AFLIVRA / RAPORT INTEGRAT',M,H-25,9,bold);text(new Date(report.generatedAt).toLocaleDateString('ro-RO',{timeZone:'Europe/Bucharest'}),W-110,H-25,9,regular,gray);page.drawLine({start:{x:M,y:H-34},end:{x:W-M,y:H-34},thickness:.6,color:rule});y=H-68;for(const line of wrap(title,W-2*M,22,bold)){text(line,M,y,22,bold);y-=28}y-=7;}
 function paragraph(s:string,size=10,color=navy){for(const line of wrap(s,W-2*M,size)){if(y<BOTTOM+18)newPage('Continuare');text(line,M,y,size,regular,color);y-=size+5}y-=9;}
 function heading(s:string){const lines=wrap(s,W-2*M,14,bold);if(y<BOTTOM+42+lines.length*18)newPage('Continuare');for(const line of lines){text(line,M,y,14,bold,teal);y-=18}y-=5;}
 function table(headers:string[],rows:(string|number|null)[][],widths:number[]){
  const head=()=>{if(y<BOTTOM+50)newPage('Continuare - tabel');page.drawRectangle({x:M,y:y-22,width:W-2*M,height:25,color:navy});let x=M+6;headers.forEach((h,i)=>{text(h,x,y-14,9,bold,rgb(1,1,1));x+=widths[i]});y-=29;};head();
  rows.forEach((row,index)=>{const cells=row.map((cell,i)=>wrap(cell===null?'n/d':String(cell),widths[i]-13,9)),height=Math.max(...cells.map(c=>c.length))*13+10;
   if(y-height<BOTTOM+10){newPage('Continuare - tabel');head()}
   if(index%2===0)page.drawRectangle({x:M,y:y-height+3,width:W-2*M,height,color:light});let x=M+6;
   cells.forEach((lines,i)=>{lines.forEach((line,k)=>text(line,x,y-10-k*13,9));x+=widths[i]});y-=height;
  });y-=14;
 }
 function bars(title:string,labels:string[],values:(number|null)[],unit:string){
  heading(title);const available=values.filter((v):v is number=>v!==null),max=Math.max(1,...available.map(Math.abs)),x=M+190,width=W-2*M-285;
  labels.forEach((label,i)=>{if(y<BOTTOM+35)newPage(title);text(wrap(label,175,9)[0],M,y,9);const v=values[i];if(v!==null){page.drawRectangle({x,y:y-3,width:Math.abs(v)/max*width,height:10,color:v<0?rgb(.75,.25,.36):palette[i%palette.length]});text(number(v,1),x+width+10,y,9)}else text('n/d',x,y,9,regular,gray);y-=27});paragraph('Unitate: '+unit+'. Valorile lipsă rămân n/d.',9,gray);
 }
 doc.setTitle(report.request.title);doc.setAuthor('Aflivra');doc.setSubject('Raport integrat din date publice Aflivra și ipoteze explicite');doc.setLanguage('ro-RO');
 const area=report.request.area,scope=area.scope==='national'?'România':area.locality+' / '+number(area.radius)+' km',f=report.financials;
 newPage('Raport integrat de cercetare comercială');
 if(photo){try{const img=await doc.embedJpg(photo.bytes),h=134;page.drawImage(img,{x:M,y:y-h,width:W-2*M,height:h});y-=h+17;text(photo.caption,M,y,8,regular,gray);y-=17;}catch{/* A missing image never fabricates or blocks economic data. */}}
 heading(report.request.title);paragraph('Aria analizată: '+scope+'. Activitate / căutare: '+report.request.activity+'.');
 paragraph('Date observate, calcule și ipoteze sunt prezentate separat. Raportul folosește numai surse deja oferite de Aflivra. Bilanțurile aparțin entității fiscale și nu sunt atribuite automat unei locații sau unei raze geografice.');
 table(['Locuri cartografiate','Firme selectate','Observații firmă-an','Surse degradate'],[[report.placesTotal??'n/d',report.request.cuis.length,f.length,report.sources.filter(s=>['stale','unavailable'].includes(s.status)||s.error).length]],[190,189,189,190]);
 paragraph('Capitole: acoperire și sinteză; geografie și locuri; firme și comparații; context INS / ANCPI / energie; scenarii opționale; metodologia și sursele.',9,gray);
 newPage('1. Acoperirea și concluziile susținute de date');
 paragraph(report.placesTotal===null?'Inventarul geografic nu a putut fi citit.':`${report.places.length} din ${report.placesTotal} rezultate cartografiate incluse. ${report.placesComplete?'Selecția returnată de căutare este completă.':'Selecția este un eșantion de maximum 600 rezultate, nu totalul afișat.'} Căutarea textuală OSM nu este un recensământ al firmelor; zero rezultate nu dovedește absența concurenței.`);
 paragraph(`${report.request.cuis.length} CUI-uri selectate de utilizator; ${new Set(f.map(row=>row.cui)).size} firme cu cel puțin o raportare citită. ${report.comparisonYear?`An comun pentru comparația tuturor firmelor selectate: ${report.comparisonYear}.`:'Nu există un an comun verificat pentru toate firmele selectate. Comparațiile se citesc din tabel cu anul fiecărei valori.'}`);
 table(['Dovadă','Ce poate susține','Ce rămâne de confirmat'],[
  ['Locuri în aria aleasă','Poziție, distanță în linie dreaptă, contacte publicate','Funcționare curentă, trafic pietonal și operator fiscal'],
  ['Bilanțuri ANAF prin Aflivra','Evoluția nominală a aceleiași entități fiscale','Profitul unei singure locații și cererea pentru un nou proiect'],
  ['INS și ANCPI','Context la teritoriul și perioada publicate','Populația unei raze, prețuri cerute și chirii realizabile'],
  ['Scenarii introduse de utilizator','Prag economic și sensibilitatea aritmetică','Încasări realizabile, costuri contractate și autorizare']
 ],[151,303,304]);
 heading('Starea datelor la generare');table(['Sursă','Instrument Aflivra','Stare','Ultima preluare validă'],report.sources.map(s=>[s.id,s.tool,s.status+(s.error?' / eroare':''),s.lastSuccessAt||'n/d']),[60,210,130,358]);
 newPage('2. Aria geografică și punctele observate');
 paragraph(scope+(area.scope==='nearby'?`; centru ${area.lat?.toFixed(5)}, ${area.lon?.toFixed(5)}. Raza folosește distanța în linie dreaptă.`:'. Selecție națională, filtrată după textul activității.'));
 if(report.places.length){
  const pts=report.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)),national=area.scope==='national',box={x:M,y:y-235,w:W-2*M,h:215};
  page.drawRectangle({x:box.x,y:box.y,width:box.w,height:box.h,color:light,borderColor:rule,borderWidth:.6});
  const lat0=national?43:area.lat!-area.radius/111,lat1=national?49:area.lat!+area.radius/111,lonDelta=national?0:area.radius/(111*Math.cos(area.lat!*Math.PI/180)),lon0=national?20:area.lon!-lonDelta,lon1=national?31:area.lon!+lonDelta;
  for(const p of pts){const px=box.x+12+(p.lon-lon0)/(lon1-lon0)*(box.w-24),py=box.y+12+(p.lat-lat0)/(lat1-lat0)*(box.h-24);if(px>=box.x&&px<=box.x+box.w&&py>=box.y&&py<=box.y+box.h)page.drawCircle({x:px,y:py,size:2.8,color:teal,opacity:.65});}
  y=box.y-16;paragraph('Distribuție schematică a punctelor din selecție. Nord în sus; nu este o hartă rutieră și nu demonstrează acoperirea întregii piețe.',9,gray);
 }else paragraph('Nu există puncte cartografiate în datele citite pentru această căutare.');
 heading('Primele 20 locuri din selecție');table(['Loc / înregistrare','Adresă / localitate','Distanță','Referință OSM'],report.places.slice(0,20).map(p=>[p.name||p.id,p.address||p.city||'Nefurnizată',Number.isFinite(p.distance)?number(p.distance,2)+' km':'n/d',p.id]),[220,278,80,180]);
 newPage('3. Identitate fiscală și comparația bilanțurilor');
 paragraph('CUI-urile sunt selectate de utilizator. Asocierea dintre un brand, un punct OSM și o firmă nu este dedusă din asemănarea numelui. Valorile financiare sunt nominale, în RON, pentru întreaga entitate fiscală.');
 table(['Firmă / CUI','An','Cifră de afaceri RON','Rezultat net RON','Salariați','Marjă netă','Sursă'],f.map(row=>[row.name+' / '+row.cui,row.year,number(row.turnover),number(row.net),number(row.employees),row.margin===null?'n/d':number(row.margin,1)+'%',row.sourceId]),[220,45,140,120,65,90,78]);
 for(const cui of report.request.cuis.filter(cui=>!f.some(row=>row.cui===cui)))paragraph('CUI '+cui+': niciun bilanț utilizabil în răspunsul citit. Nu este considerat firmă cu venit sau profit zero.',9,gray);
 if(f.length){
  newPage('4. Evoluția cifrei de afaceri');
  const years=[...new Set(f.map(row=>row.year))].sort(),max=Math.max(1,...f.flatMap(row=>row.turnover!==null?[row.turnover]:[])),plot={x:M+65,y:145,w:W-2*M-90,h:220};
  for(let tick=0;tick<=4;tick++){const at=plot.y+tick*plot.h/4;page.drawLine({start:{x:plot.x,y:at},end:{x:plot.x+plot.w,y:at},color:rule,thickness:.5});text(number(max*tick/4/1e6,1),M,at-3,9,regular,gray)}
  years.forEach((year,i)=>text(year,plot.x+i*plot.w/Math.max(1,years.length-1)-12,plot.y-18,9));
  report.request.cuis.forEach((cui,index)=>{const rows=years.map(year=>f.find(row=>row.cui===cui&&row.year===year)),points=rows.map((row,i)=>row?.turnover===null||row?.turnover===undefined?null:{x:plot.x+i*plot.w/Math.max(1,years.length-1),y:plot.y+row.turnover/max*plot.h});for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a&&b&&years[i]-years[i-1]===1)page.drawLine({start:a,end:b,color:palette[index%palette.length],thickness:1.7})}for(const p of points)if(p)page.drawCircle({...p,size:3,color:palette[index%palette.length]});text((index+1)+'. '+cui+' '+wrap(rows.find(Boolean)?.name||'',310,8)[0],M+(index%2)*370,110-Math.floor(index/2)*14,8,regular,palette[index%palette.length]);});
  paragraph('Grafic în milioane RON. Valorile lipsă nu devin zero; segmentele sunt trasate numai între ani consecutivi publicați.',9,gray);
  newPage('5. Profitabilitate și comparație pe același an');
  if(report.comparisonYear){const rows=f.filter(row=>row.year===report.comparisonYear);paragraph('Anul comun '+report.comparisonYear+'. Marja netă = (I18 - I19) / I13. Cifra de afaceri zero nu permite calculul marjei.');bars('Marja netă a firmelor selectate',rows.map(row=>row.cui),rows.map(row=>row.margin),'procent');}
  else paragraph('Nu se construiește un clasament între ani diferiți. Tabelul bilanțurilor păstrează fiecare perioadă efectivă.');
 }
 newPage('6. Context economic din sursele Aflivra');
 const ins=report.sources.find(s=>s.tool==='ins_series'),ancpi=report.sources.find(s=>s.tool==='ancpi_integrals'),energy=report.sources.find(s=>s.tool==='energy_offers');
 heading('Populație - INS TEMPO');paragraph('Teritoriu interogat: '+(ins?.arguments.territory||'n/d')+'. Seria POP105A este județeană / națională; nu estimează populația cercului de '+number(area.radius)+' km.');
 if(ins?.data){paragraph((ins.data.territoryLabel||'')+' / '+(ins.data.reference||'')+' / '+(ins.data.unit||''),9,gray);table(['An','Populație publicată','Starea valorii'],(ins.data.values||[]).map((v:any)=>[v.year,number(v.value),v.dataStatus||'Publicată']),[130,300,328]);}else paragraph('Seria nu a putut fi citită. '+(ins?.error||''),9,gray);
 heading('Dinamica ipotecilor - ANCPI');paragraph(ancpi?.data?`Raport publicat pentru ${ancpi.data.monthLabel||ancpi.data.referenceMonth||'perioada indicată de sursă'}. ${number(ancpi.data.total??null)} operațiuni în raportul național. Numărul de ipoteci nu este preț de tranzacție, volum de anunțuri sau randament locativ.`:'Raportul nu a putut fi citit. '+(ancpi?.error||''));
 if(ancpi?.data?.byCounty){const rows=area.scope==='national'?ancpi.data.byCounty.slice(0,10):ancpi.data.byCounty.filter((row:any)=>String(row.county).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===area.county.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());table(['Județ','Ipoteci - total','Perioadă'],rows.map((row:any)=>[row.county,number(row.total),ancpi.data.monthLabel||ancpi.data.referenceMonth]),[258,200,300]);}
 heading('Comparator de energie - POSF');paragraph('Comparatorul publicat este pentru clienți casnici. Nu reprezintă o ofertă contractuală pentru spațiul comercial.');paragraph(energy?.data?`Zona ${energy.arguments.county}; ipoteza comparatorului: 200 kWh/lună și factură de referință 300 RON. ${energy.data.total??energy.data.count??energy.data.items?.length??0} oferte returnate. Eligibilitatea, prosumatorul și fereastra fiecărei oferte se verifică separat; raportul nu alege automat un furnizor.`:'Nu există o comparație de energie pentru aria națională sau sursa nu a putut fi citită.');
 newPage('7. Scenarii pe ipotezele utilizatorului');
 if(report.request.assumptions){const a=report.request.assumptions;paragraph(`Ipoteze lunare: venit ${number(a.monthlyRevenue)} RON; costuri fixe ${number(a.fixedCosts)} RON; costuri variabile ${number(a.variableCostPercent,1)}% din venit; investiție inițială ${number(a.investment)} RON. Sumele nu sunt măsurători de piață.`);
  table(['Scenariu','Venit lunar RON','Surplus lunar RON','Surplus anual RON','Recuperare luni'],report.scenarios.map(s=>[s.name,number(s.monthlyRevenue),number(s.monthlyOperating),number(s.annualOperating),number(s.paybackMonths,1)]),[200,140,145,145,128]);
  paragraph('Prag de venit lunar: '+number(report.scenarios[0].breakEven)+' RON. Surplus = venit x (1 - cost variabil %) - cost fix. Recuperare simplă = investiție / surplus lunar pozitiv. Valorile negative nu produc o perioadă de recuperare.');
  bars('Sensibilitatea surplusului lunar',report.scenarios.map(s=>s.name),report.scenarios.map(s=>s.monthlyOperating),'RON / lună');
  paragraph('Scenariile de -20% și +20% sunt sensibilități aritmetice, nu prognoze. Modelul exclude TVA, impozite, amortizare, dobânzi, capital de lucru, sezonalitate și costuri de închidere.',9,gray);
 }else paragraph('Nu au fost introduse ipoteze financiare. Raportul nu inventează chirii, investiție, bon mediu, trafic pietonal sau vânzări viitoare.');
 newPage('8. Metodologie, proveniență și limite');
 paragraph('Cifra de afaceri = I13; rezultatul net = I18 - I19; număr mediu de salariați = I20. Lipsa unui indicator este n/d, separat de zero. Marja se calculează numai când cifra de afaceri este pozitivă și ambii indicatori de rezultat sunt disponibili. Scăderea salariaților medii nu dovedește concedieri.');
 paragraph('Aria geografică se aplică punctelor cartografiate. Firmele selectate prin CUI sunt o cohortă pentru comparație, fără afirmația că toate operează în rază. INS și ANCPI rămân la teritoriul și perioada lor. Ultima preluare validă nu schimbă anul bilanțului sau luna unui raport. Datele stale rămân etichetate.');
 for(const source of report.sources){heading(source.id+' / '+source.tool);paragraph('Argumente: '+JSON.stringify(source.arguments),8.5,gray);paragraph('Stare: '+source.status+'; publicare: '+(source.publishedAt||'n/d')+'; preluare validă: '+(source.lastSuccessAt||'n/d')+'.'+(source.error?' Diagnostic: '+source.error:''),9);paragraph(source.url,8.5,teal);}
 if(photo){heading('Imagine din colecția Aflivra');paragraph(photo.caption+' - '+photo.credit+' - '+photo.license+'. Conversie din WebP în JPEG pentru export. '+photo.sourceUrl,8.5,gray);}
 const pages=doc.getPages();for(const [i,p] of pages.entries()){p.drawLine({start:{x:M,y:36},end:{x:W-M,y:36},color:rule,thickness:.6});p.drawText('Aflivra - date publice, calcule și ipoteze separate',{x:M,y:22,size:8,font:regular,color:gray});p.drawText('Pagina '+(i+1)+' / '+pages.length,{x:W-M-90,y:22,size:8,font:regular,color:gray});}
 signal?.throwIfAborted();return doc.save();
}
