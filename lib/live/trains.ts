import {createHash} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {SourceError} from './adapters';
import {snapshotAssetPath,decodeSnapshotBytes} from '../snapshot-transport';
import {normalizeSearch} from './query';
import proofs from '@/public/data/snapshot-transport.json';

/*
 Mersul trenurilor — the planned-timetable corpus committed by scripts/import-mers-tren.mjs
 from the official Infofer XML editions each operator publishes on data.gov.ro (dataset per
 operator, publisher S.C. Informatică Feroviară S.A., OGL-ROU). One station index
 (/trains/stations.json, gz + SHA-256-proven) plus 128 sharded per-station boards
 (/trains/boards/NN.json). Everything is part of the deployed app (Workers Static Assets),
 never re-fetched per request; boards carry each operator's own edition name and validity.
*/

export type TrainStation={code:number;name:string;search:string;operators:string[];trains:number;shard:number};
export type TrainBoardRow={t:number;tt:string;n:string;c:string;d?:string;f?:string;zl:string;o:string};
export type TrainBoard={station:{code:number;name:string};departures:TrainBoardRow[];arrivals:TrainBoardRow[]};
export type TrainsOperatorInfo={id:string;name:string;edition:string;validFrom:string;validTo:string;status:string;trains:number;stations:number;datasetUrl:string;reason?:string};

// Infofer editions use legacy cedilla diacritics (ş/ţ); fold both legacy and modern
// comma-below forms so any spelling a reader types matches the station name.
export const foldTrainText=(value:unknown)=>normalizeSearch(String(value??'').replace(/[şŞ]/g,'ș').replace(/[ţŢ]/g,'ț'));

type Proof={path:string;file:string;bytes:number;sha256:string};
const proofByPath=new Map((proofs as {items:Proof[]}).items.filter(item=>item.path.startsWith('/trains/')).map(item=>[item.path,item]));

const fetchAsset=async(path:string,base:string)=>{
 const request=new Request(new URL(snapshotAssetPath(path),base));
 const response=env.ASSETS?await env.ASSETS.fetch(request):await fetch(request);
 if(!response.ok)throw new SourceError('Orarul trenurilor nu poate fi citit acum.');
 const bytes=decodeSnapshotBytes(await response.arrayBuffer());
 const proof=proofByPath.get(path);
 if(!proof||bytes.length!==proof.bytes||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==proof.sha256)throw new SourceError('Copia orarului trenurilor nu a trecut verificarea integralității.');
 return JSON.parse(new TextDecoder().decode(bytes));
};

type StationsPayload={items:TrainStation[];count:number;shards:number};
const stationsCache=new Map<string,{at:number;payload:StationsPayload}>();
export async function readTrainsStations(base:string){
 const cached=stationsCache.get(base);
 if(cached&&Date.now()-cached.at<600000)return cached.payload;
 const payload=await fetchAsset('/trains/stations.json',base) as StationsPayload;
 if(!Array.isArray(payload.items)||!payload.items.length||!Number.isInteger(payload.shards))throw new SourceError('Indicele stațiilor de tren nu are structura așteptată.');
 stationsCache.set(base,{at:Date.now(),payload});
 return payload;
}
export async function readTrainStationBoard(station:TrainStation,base:string):Promise<TrainBoard>{
 const payload=await fetchAsset('/trains/boards/'+String(station.shard).padStart(2,'0')+'.json',base) as {stations:{code:number;name:string;departures:TrainBoardRow[];arrivals:TrainBoardRow[]}[]};
 const entry=payload.stations?.find(row=>row.code===station.code&&Array.isArray(row.departures)&&Array.isArray(row.arrivals));
 if(!entry)throw new SourceError('Fișa stației nu se află în copia verificată a orarului.');
 return {station:{code:entry.code,name:entry.name},departures:entry.departures,arrivals:entry.arrivals};
}
// The words „gara/gară/stația/stație" name the corpus itself, not any station — natural
// queries like „gara brașov" still have to find the station, so they are dropped from
// the term list before content matching (terms arrive already folded: ă→a, ț→t).
const stationNouns=new Set(['gara','gari','statia','statie','statii','statiile']);
export function searchTrainStations(payload:StationsPayload,q:string){
 const terms=foldTrainText(q).split(/\s+/).filter(Boolean).filter(term=>!stationNouns.has(term));
 return payload.items.filter(station=>terms.every(term=>station.search.includes(term)));
}