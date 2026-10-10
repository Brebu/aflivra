// LMI row assembly from pdftotext -bbox-layout word coordinates (D07): the v1 parse
// split lines into word panels with a last-word dating heuristic, so dating text
// („sf. sec. XIX", „1702, 1915", „1935 - 1939") landed inside addresses or got cut,
// and a continuation could take the previous row's dating column position. Here the
// printed grid drives everything: words cluster on their y line, anchor lines carry
// the LMI code and the locality marker, the dating column's left edge is derived per
// page from the anchor rows themselves (dating-vocabulary right-walk → median edge →
// geometric re-split), and continuation lines allocate to a column by x coordinates.
// The rotated marginalia of the Monitor strip live in the page's right margin above
// the footer line — recognized per page against the printed-page footer, never by a
// page-28 offset. pdfPage and printedPage stay separate on every row.
const CODE_SHAPE=/^B-(?:I{1,3}|IV|V|VI{0,3}|IX|X{1,3}|XI{0,2})-[a-z]+-(?:A|B)-\d{2,6}(?:\.\d{1,3})?$/;
const MUNICIPALITY_MARKER=/^municipiul$/i;
const LOCALITY_TAIL=/^BUCURE[ȘŞS]TI,?$/i;
const DATING_VOCAB=/^(?:sf\.?|prima|jum\.?|sec\.?|secolul|sec|înc\.?|inc\.?|epoca|post|anul|antichitate|preistorie|neolitic|halstatt|monteoru|latene|-|–|,|\d{3,4},?|X{0,3}(?:IX|IV|V?I{0,3}))$/i;
const HEADER_SHAPE=/^Nr\.?\s+crt\.?\s+Cod\s+LMI\s+Denumire\s+Localitate\s+Adres[ăa]\s+Datare$/i;
const NOISE_SHAPES=[/^MINISTERUL CULTURII$/i,/^LISTA MONUMENTELOR ISTORICE/i,/^-\s*Bucure[șşs]ti\s*-$/i,/MONITORUL OFICIAL/i];
const FOOTER_INTRO=/^INSTITUTUL NA[ȚŢ]IONAL AL PATRIMONIULUI$/i;

const yCluster=(words)=>{
 const sorted=[...words].sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin);
 const clusters=[];let current=null;
 for(const word of sorted){
  if(!current||Math.abs(word.yMin-current.yMin)>5){current={yMin:word.yMin,words:[word]};clusters.push(current);continue}
  current.words.push(word);
 }
 for(const cluster of clusters)cluster.words.sort((a,b)=>a.xMin-b.xMin);
 return clusters;
};
const text=cluster=>cluster.words.map(word=>word.text).join(' ');
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2};

// The dating candidate cut of a rest segment: walk right-to-left while the word stays
// in the dating vocabulary — only an ESTIMATE; the page's geometric edge re-splits it.
const datingWalk=rest=>{
 const collected=[];
 for(let i=rest.length-1;i>=0;i--){if(!DATING_VOCAB.test(rest[i].text))break;collected.unshift(rest[i]);if(collected.length>12)break}
 return collected;
};

export function assembleMonumentRows(pages){
 const diagnostics={pagesWithHeader:0,headerClustersSkipped:0,footerClustersSkipped:0,noiseClustersSkipped:0,marginaliaDropped:0,crossPageContinuations:0,anchorRows:0};
 const rows=[];
 let current=null,footnoteMode=false,lastDatareEdge=null,lastMunicipalityEdge=null,lastAddressEdge=null;
 for(const page of pages){
  const width=page.width||Math.max(842.04,...(page.words||[]).map(word=>word.xMax));
  const rawClusters=yCluster(page.words||[]);
  const footerCluster=rawClusters.find(cluster=>FOOTER_INTRO.test(text(cluster)));
  const footerY=footerCluster?footerCluster.yMin:Infinity;
  // Banda verticală a Monitorului (text rotit pe marginea dreaptă, deasupra liniei de
  // subsol) se recunoaște pe geometria paginii: marginea dreaptă, deasupra footer-ului.
  const words=(page.words||[]).filter(word=>{
   const strip=word.xMin>width-30&&word.yMin<footerY;
   if(strip)diagnostics.marginaliaDropped++;
   return !strip;
  });
  let pageFolio=null;let footerIntro=false;
  const clusters=yCluster(words);
  const staged=[];
  for(const cluster of clusters){
   const line=text(cluster);
   if(HEADER_SHAPE.test(line)){diagnostics.headerClustersSkipped++;diagnostics.pagesWithHeader++;continue}
   if(NOISE_SHAPES.some(shape=>shape.test(line))){diagnostics.noiseClustersSkipped++;continue}
   if(FOOTER_INTRO.test(line)){footerIntro=true;diagnostics.footerClustersSkipped++;continue}
   if(footerIntro){footerIntro=false;const folioMatch=/(\d{1,4})\s*$/.exec(line.trim());if(folioMatch&&/^\d{1,4}$/.test(folioMatch[1])){pageFolio=Number(folioMatch[1]);diagnostics.footerClustersSkipped++;continue}diagnostics.footerClustersSkipped++;continue}
   if(/^\(\*\)/.test(line.trim())){footnoteMode=true;continue}
   if(footnoteMode)continue;
   staged.push(cluster);
  }
  // First pass over the staged clusters: anchors establish the page's column geometry.
  const preRows=[];
  for(const cluster of staged){
   const codeWord=cluster.words.find(word=>CODE_SHAPE.test(word.text)&&word.xMin<200);
   if(!codeWord){preRows.push(null);continue}
   const after=cluster.words.filter(word=>word.xMin>codeWord.xMax);
   const marker=after.find(word=>MUNICIPALITY_MARKER.test(word.text));
   const nameWords=marker?after.slice(0,after.indexOf(marker)):[];
   const localityWords=marker?after.slice(after.indexOf(marker),after.indexOf(marker)+2):[];
   const rest=marker?after.slice(after.indexOf(marker)+2):[];
   preRows.push({code:codeWord.text,nameWords,localityWords,rest,datingGuess:datingWalk(rest),municipalityX:marker?marker.xMin:null,firstRestX:rest.length?rest[0].xMin:null});
  }
  const anchors=preRows.filter(Boolean);
  const municipalityEdge=median(anchors.map(row=>row.municipalityX).filter(value=>value!==null))??lastMunicipalityEdge;
  const addressEdge=median(anchors.map(row=>row.firstRestX).filter(value=>value!==null))??lastAddressEdge;
  const datingEdges=anchors.map(row=>row.datingGuess.length?Math.min(...row.datingGuess.map(word=>word.xMin)):null).filter(value=>value!==null);
  const datareEdge=median(datingEdges)??lastDatareEdge;
  if(median(anchors.map(row=>row.municipalityX).filter(value=>value!==null))!==null)lastMunicipalityEdge=municipalityEdge;
  if(median(anchors.map(row=>row.firstRestX).filter(value=>value!==null))!==null)lastAddressEdge=addressEdge;
  if(median(datingEdges)!==null)lastDatareEdge=datareEdge;
  // Second pass: build and extend rows with the page's geometric edges and folio.
  for(let i=0;i<staged.length;i++){
   const anchor=preRows[i];
   if(anchor){
    const dating=anchor.rest.filter(word=>datareEdge!==null&&word.xMin>=datareEdge-1);
    const addressWords=anchor.rest.filter(word=>!(datareEdge!==null&&word.xMin>=datareEdge-1));
    const locality=anchor.localityWords.map(word=>word.text).join(' ');
    const row=[anchor.code,anchor.nameWords.map(word=>word.text).join(' '),locality||'municipiul BUCUREŞTI',addressWords.map(word=>word.text).join(' '),dating.map(word=>word.text).join(' '),pageFolio||0,page.pdfPage];
    rows.push(row);current=row;diagnostics.anchorRows++;
    continue;
   }
   if(!current)continue;
   if(page.pdfPage!==current[6])diagnostics.crossPageContinuations++;
   for(const [word,slot] of allocate(cluster_words_of(staged[i]),datareEdge,municipalityEdge,addressEdge)){
    const value=word.text;
    if(slot==='name')current[1]+=(current[1]?' ':'')+value;
    else if(slot==='locality')current[2]+=(current[2]?' ':'')+value;
    else if(slot==='address')current[3]+=(current[3]?' ':'')+value;
    else if(slot==='dating')current[4]+=(current[4]?' ':'')+value;
   }
  }
 }
 return {rows,diagnostics};
}

const cluster_words_of=cluster=>cluster.words;

// A continuation cluster allocates each word to a column by its x position against the
// page's edges: name cell → locality marker edge → address cell edge → datare edge.
function allocate(words,datareEdge,municipalityEdge,addressEdge){
 const slots=[];
 for(const word of words){
  const center=(word.xMin+word.xMax)/2;
  if(datareEdge!==null&&word.xMin>=datareEdge-1)slots.push([word,'dating']);
  else if(addressEdge!==null&&center>=addressEdge-1)slots.push([word,'address']);
  else if(municipalityEdge!==null&&center>=municipalityEdge-1)slots.push([word,'locality']);
  else slots.push([word,'name']);
 }
 return slots;
}
