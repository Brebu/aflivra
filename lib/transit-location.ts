import coverage from '@/public/transit/coverage.json';
import {defaultCity,validPoint,type GeoPoint} from './location-context';
import type {SourceState} from './live/types';
export function transitCovers(point:GeoPoint=defaultCity){const b=coverage.bounds;return validPoint(point)&&point.lat>=b.south-.035&&point.lat<=b.north+.035&&point.lon>=b.west-.05&&point.lon<=b.east+.05}
export function outsideTransitCoverage(location:string):SourceState{return{key:'transport:outside-coverage:'+location,name:coverage.source,url:coverage.sourceUrl,adapterVersion:'transport.geographic.v1',status:'cached',publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:86400,data:{items:[],total:0,page:0,pages:1,outOfCoverage:true,location,coverage:coverage.source,note:'Nu avem o rețea de linii și orare validată pentru '+location+'. Rețeaua TPBI acoperă București–Ilfov.'}}}
