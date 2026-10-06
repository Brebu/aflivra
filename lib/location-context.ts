import {normalizeSearch} from './live/query';
export type GeoPoint={lat:number;lon:number};
export type LocalCity=GeoPoint&{name:string;county?:string;type?:string};
export const defaultCountry='România';
export const defaultCity:LocalCity={name:'București',lat:44.4268,lon:26.1025,county:'București'};
export function validPoint(point:GeoPoint){return Number.isFinite(point.lat)&&Number.isFinite(point.lon)&&Math.abs(point.lat)<=90&&Math.abs(point.lon)<=180}
export function distanceKm(a:GeoPoint,b:GeoPoint){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r,v=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,v))))}
export function nearestLocality(point:GeoPoint,cities:LocalCity[],maxDistance=30){let nearest:LocalCity|null=null,best=maxDistance;for(const city of cities){const d=distanceKm(point,city);if(d<best){nearest=city;best=d}}return nearest}
const words=(s:string)=>normalizeSearch(s).replace(/[^a-z0-9]+/g,' ').trim();
export function mentionsLocation(value:unknown,name:string){if(!name.trim())return false;const text=words(typeof value==='string'?value:JSON.stringify(value)||''),needle=words(name);return !!needle&&(' '+text+' ').includes(' '+needle+' ')}
/** A mention does not certify the geographical coverage of a dataset. */
export function locationMentionScore(value:unknown,city:LocalCity|null){return city?(mentionsLocation(value,city.name)?2:city.county&&mentionsLocation(value,city.county)?1:0):0}
