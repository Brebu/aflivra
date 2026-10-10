import {createHash} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {SourceError} from './adapters';
import {snapshotAssetPath,decodeSnapshotBytes} from '../snapshot-transport';
import {normalizeSearch,paginate} from './query';
import {foldTrainText} from './trains';
import proofs from '@/public/data/snapshot-transport.json';

/*
 Lista Monumentelor Istorice 2015 — secțiunea București — corpusul static comis de
 scripts/import-lmi-snapshot.mjs din PDF-ul oficial al Ministerului Culturii
 (Monitorul Oficial, Partea I, Nr. 113 bis/15.II.2016). Baza este lista 2015:
 ordinele ministeriale ulterioare de actualizare se obțin de la minister și nu sunt
 înglobate. Semnalarea unei posibile apartenențe la patrimoniu nu e un verdict
 juridic actual automat. Fiecare rând poartă foliul tipărit al Monitorului Oficial,
 nu numărul de pagină al PDF-ului.
*/

type Proof={path:string;file:string;bytes:number;sha256:string};
const proofByPath=new Map((proofs as {items:Proof[]}).items.filter(item=>item.path.startsWith('/lmi/')).map(item=>[item.path,item]));

export type MonumentRow=[code:string,name:string,locality:string,address:string,dating:string,printedPage:number];
type LmiPayload={schema:string;sourceUrl:string;base:string;publishedIn:string;updateNote:string;pdfBytes:number;printedPageMax:number|null;fetchedAt:string;license:null;licenseNote:string;counts:{rows:number;distinctCodes:number;extractionNote:string};rows:MonumentRow[]};

let corpus:{at:number;payload:LmiPayload}|null=null;

const fetchAsset=async(path:string,base:string)=>{
 const request=new Request(new URL(snapshotAssetPath(path),base));
 const response=env.ASSETS?await env.ASSETS.fetch(request):await fetch(request);
 if(!response.ok)throw new SourceError('Lista monumentelor nu poate fi citită acum.');
 const bytes=decodeSnapshotBytes(await response.arrayBuffer());
 const proof=proofByPath.get(path);
 if(!proof||bytes.length!==proof.bytes||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==proof.sha256)throw new SourceError('Copia listei monumentelor nu a trecut verificarea integralității.');
 return JSON.parse(new TextDecoder().decode(bytes)) as LmiPayload;
};

export const readLmiCorpus=async(base:string)=>{
 if(corpus&&Date.now()-corpus.at<600000)return corpus.payload;
 const payload=await fetchAsset('/lmi/monuments-bucuresti.json',base);
 corpus={at:Date.now(),payload};
 return payload;
};

export type LmiQuery={q?:string;page?:number};

export async function readMonuments(query:LmiQuery,base:string){
 const payload=await readLmiCorpus(base);
 const term=foldTrainText(query.q||'');
 const filtered=term?payload.rows.filter(row=>foldTrainText(row[0]+' '+row[1]+' '+row[3]).includes(term)):payload.rows;
 const page=paginate(filtered,query.page,20);
 return {
  sourceUrl:payload.sourceUrl,base:payload.base,publishedIn:payload.publishedIn,updateNote:payload.updateNote,license:payload.license,licenseNote:payload.licenseNote,
  profile:{extractionNote:payload.counts.extractionNote,printedPageNote:'Fiecare rând poartă foliul tipărit al Monitorului Oficial, nu numărul de pagină al PDF-ului.'},
  filters:{q:query.q||'',applied:!!term},
  ...page,
  items:page.items.map(row=>({codLmi:row[0],denumire:row[1],localitate:row[2],adresa:row[3],datare:row[4],folioMof:row[5]})),
 };
}
