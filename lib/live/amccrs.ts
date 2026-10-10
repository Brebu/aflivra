import {createHash} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {SourceError} from './adapters';
import {snapshotAssetPath,decodeSnapshotBytes} from '../snapshot-transport';
import {normalizeSearch,paginate} from './query';
import proofs from '@/public/data/snapshot-transport.json';

/*
 Registrul seismic AMCCRS al municipiului București — corpusul static comis de
 scripts/import-amccrs-snapshot.mjs din fluxul public Ninja Tables al paginii
 amccrs-pmb.ro (Lista Cladiri 2026). Clasele de risc seismic publicate (RsI–RsIV,
 consolidate, categorii de urgență) se servesc ambele — textul original integral și
 forma normalizată — fără echivalare între categoriile de urgență și clasele Rs.
 O adresă care nu apare în registru înseamnă „nu am găsit o înregistrare”, niciodată
 „clădire sigură”; registrul nu spune nimic despre situația cadastrală sau juridică
 a apartamentului. Acoperirea testată este municipiul București.
*/

type Proof={path:string;file:string;bytes:number;sha256:string};
const proofByPath=new Map((proofs as {items:Proof[]}).items.filter(item=>item.path.startsWith('/amccrs/')).map(item=>[item.path,item]));

type AmccrsPayload={schema:string;sourceUrl:string;tableName:string;pageUpdated:string|null;fetchedAt:string;license:null;licenseNote:string;columns:string[];normalizationRule:string;coverage:string;counts:{rows:number;distinctIds:number;distinctClassForms:number;normalizedClasses:Record<string,number>};rows:string[][]};

let corpus:{at:number;payload:AmccrsPayload}|null=null;

const fetchAsset=async(path:string,base:string)=>{
 const request=new Request(new URL(snapshotAssetPath(path),base));
 const response=env.ASSETS?await env.ASSETS.fetch(request):await fetch(request);
 if(!response.ok)throw new SourceError('Registrul seismic nu poate fi citit acum.');
 const bytes=decodeSnapshotBytes(await response.arrayBuffer());
 const proof=proofByPath.get(path);
 if(!proof||bytes.length!==proof.bytes||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==proof.sha256)throw new SourceError('Copia registrului seismic nu a trecut verificarea integralității.');
 return JSON.parse(new TextDecoder().decode(bytes)) as AmccrsPayload;
};

export const readAmccrsCorpus=async(base:string)=>{
 if(corpus&&Date.now()-corpus.at<600000)return corpus.payload;
 const payload=await fetchAsset('/amccrs/buildings.json',base);
 corpus={at:Date.now(),payload};
 return payload;
};

export const foldAddress=(value:unknown)=>normalizeSearch(String(value??'').replace(/[şŞ]/g,'ș').replace(/[ţŢ]/g,'ț')).replace(/[^a-z0-9]+/g,' ').trim();

export type BuildingRecord={id:string;nrcrt:string;adresa:string;nr:string;sectorsursa:string;sector:string;anulconstruirii:string;regimuldeinaltime:string;numardeapartamente:string;anulelaborariiexpertizei:string;expert:string;clasaOriginala:string;clasaNormalizata:string;incadrareAnterioara:string;observatii:string};

const record=(row:string[]):BuildingRecord=>({id:row[0],nrcrt:row[1],adresa:row[2],nr:row[3],sectorsursa:row[4],anulconstruirii:row[5],regimuldeinaltime:row[6],numardeapartamente:row[7],anulelaborariiexpertizei:row[8],expert:row[9],clasaOriginala:row[10],incadrareAnterioara:row[11],observatii:row[12],clasaNormalizata:row[13],sector:row[14]});

export type AmccrsQuery={q:string;sector?:string;page?:number};

export async function readAmccrsBuildings(query:AmccrsQuery,base:string){
 const payload=await readAmccrsCorpus(base);
 const sector=(query.sector||'').replace(/[^1-6]/g,'');
 const records=payload.rows.map(record);
 const scoped=sector?records.filter(r=>r.sector===sector):records;
 // Căutarea liberă potrivește adresa pliată (stradă + număr + sector, diacriticele
 // cedilla incluse); potrivirea rămâne textuală, nu cartografică.
 const term=foldAddress(query.q);
 const matched=term?scoped.filter(r=>foldAddress(r.adresa+' '+r.nr+' sector '+r.sector).includes(term)):scoped;
 const page=paginate(matched,query.page,20);
 return {
  sourceUrl:payload.sourceUrl,tableName:payload.tableName,pageUpdated:payload.pageUpdated,license:payload.license,licenseNote:payload.licenseNote,
  coverage:payload.coverage,
  classes:payload.counts.normalizedClasses,
  normalizationRule:payload.normalizationRule,
  profile:{distinctClassFormsText:payload.counts.distinctClassForms,acoperire:'doar municipiul București'},
  message:matched.length?'':'Nu am găsit o înregistrare pentru adresa cerută — absenta din registru nu înseamnă clădire sigură.',
  filters:{q:query.q,sector:sector||'',applied:!!(sector||term)},
  ...page,
  items:page.items.map(r=>({...r,sectorSursa:r.sectorsursa,adresaCompleta:r.adresa+' '+r.nr+', sector '+r.sector})),
 };
}
