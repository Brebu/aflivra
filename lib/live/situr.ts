import {createHash} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {SourceError} from './adapters';
import {snapshotAssetPath,decodeSnapshotBytes} from '../snapshot-transport';
import {normalizeSearch,paginate} from './query';
import {countyName} from '../geographic-scope';
import {foldTrainText} from './trains'
import proofs from '@/public/data/snapshot-transport.json';

/*
 Registrele turistice SITUR — corpusul static comis de scripts/import-situr-snapshot.mjs
 din exporturile Excel oficiale ale se.situr.gov.ro (cazare/alimentație publică/agenții de
 turism licențiate). Registrul e de clasificare și licențiere: spune cine e autorizat și
 cu ce capacitate declarată, nu prețuri de camere, rezervări, grad de ocupare sau dovada
 funcționării în ziua cerută. Coloanele rămân cele originale ale exportului, rândurile
 se servesc paginat din copia verificată SHA-256 — Worker-ul nu re-descarcă exporturile.
*/

export type SiturRow=(string)[];

type Proof={path:string;file:string;bytes:number;sha256:string};
const proofByPath=new Map((proofs as {items:Proof[]}).items.filter(item=>item.path.startsWith('/situr/')).map(item=>[item.path,item]));

type SiturPayload={schema:string;kind:SiturKind;sourceUrl:string;exportDate:string|null;pageDate:string|null;fetchedAt:string;license:null;licenseNote:string;columns:string[];counts:{rows:number;documentedRows:number;missingCui:number;missingAddressDetail:number};rows:SiturRow[]};
export type SiturKind='cazare'|'alimentatie'|'agentii';

export const SITUR_KINDS:SiturKind[]=['cazare','alimentatie','agentii'];

const kindUrl=(kind:SiturKind)=>'/situr/'+kind+'.json';
const corpusCache=new Map<SiturKind,{at:number;payload:SiturPayload}>();

const fetchAsset=async(path:string,base:string)=>{
 const request=new Request(new URL(snapshotAssetPath(path),base));
 const response=env.ASSETS?await env.ASSETS.fetch(request):await fetch(request);
 if(!response.ok)throw new SourceError('Registrul turistic nu poate fi citit acum.');
 const bytes=decodeSnapshotBytes(await response.arrayBuffer());
 const proof=proofByPath.get(path);
 if(!proof||bytes.length!==proof.bytes||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==proof.sha256)throw new SourceError('Copia registrului turistic nu a trecut verificarea integralității.');
 return JSON.parse(new TextDecoder().decode(bytes)) as SiturPayload;
};

export const readSiturKind=async(kind:SiturKind,base:string)=>{
 const cached=corpusCache.get(kind);
 if(cached&&Date.now()-cached.at<600000)return cached.payload;
 const payload=await fetchAsset(kindUrl(kind),base);
 corpusCache.set(kind,{at:Date.now(),payload});
 return payload;
};

const columnIndex=(payload:SiturPayload,label:string)=>payload.columns.indexOf(label);

// Un rând se servește ca obiect denumit pe câmpurile semantice comune, cu denumirea
// originală a coloanei de tezaur păstrată alături — descrierea tool-urilor numește
// câmpurile exact așa.
export const siturRecord=(payload:SiturPayload,row:SiturRow)=>{
 const at=(label:string)=>row[columnIndex(payload,label)]??'';
 const cuiLabel=payload.columns.includes('Cod Unic Înregistrare')?'Cod Unic Înregistrare':'C.U.I';
 const localityLabel=payload.columns.includes('Localitate')?'Localitate':'Localitate/Sector';
 const addressDetailLabel=payload.columns.find(label=>/detalii adresă/i.test(label))||'';
 return {
  tipUnitate:at('Tip unitate')||at('Tip structură')||'',
  denumire:at('Nume unitate')||at('Denumirea unității')||at('Denumirea agenției')||'',
  categorie:at('Tip categorie')||at('Categoria')||at('LICENȚĂ/ANEXĂ')||'',
  spatii:at('Număr spații'),locuri:at('Număr locuri')||at('Nr. locuri'),
  localitate:at(localityLabel),componenta:at('Localitate componentă'),judet:at('Județ'),
  adresaDetaliu:addressDetailLabel?at(addressDetailLabel):'',
  operatorTip:at('Tip Operator Economic'),operator:at('Operator Economic')||at('Operator economic')||'',
  cui:at(cuiLabel)||null,
  autorizatie:at('Număr autorizație')||at('Număr certificat')||at('Număr LICENȚĂ')||'',
  autorizatieData:at('Dată emitere autorizație')||at('Data emiterii')||at('Data emiterii')||'',
  ordin:at('Număr Înregistrare')||at('Număr Ordine în Registrul Comerțului')||'',
  email:at('Email')||'',web:at('Web')||at('Site Web')||'',
 };
};

export type SiturQuery={kind:SiturKind;q?:string;locality?:string;county?:string;page?:number};

export async function readSitur(query:SiturQuery,base:string){
 const payload=await readSiturKind(query.kind,base);
 const records=payload.rows.map(row=>siturRecord(payload,row));
 const county=query.county?countyName(query.county):'';
 const term=foldTrainText(query.q||''),locality=foldTrainText(query.locality||'');
 const filtered=records.filter(record=>{
  if(county&&foldTrainText(record.judet)!==normalizeSearch(county))return false;
  if(locality&&!foldTrainText(record.localitate).includes(locality)&&!foldTrainText(record.componenta).includes(locality))return false;
  if(term&&!foldTrainText(record.denumire+' '+record.operator+' '+record.localitate+' '+record.componenta+' '+record.judet+' '+(record.cui??'')).includes(term))return false;
  return true;
 });
 const page=paginate(filtered,query.page,20);
 return {
  sourceUrl:payload.sourceUrl,exportDate:payload.exportDate,pageDate:payload.pageDate,fetchedAt:payload.fetchedAt,license:payload.license,licenseNote:payload.licenseNote,
  columns:payload.columns,counts:payload.counts,
  profile:{tipRegistrului:'clasificare și licențiere — nu prețuri, rezervări sau grad de ocupare',cuiLipsa:payload.counts.missingCui,adresaDetaliuLipsa:payload.counts.missingAddressDetail},
  filters:{kind:query.kind,q:query.q||'',locality:query.locality||'',county:query.county||'',applied:!!(term||locality||county)},
  ...page,
 };
}
