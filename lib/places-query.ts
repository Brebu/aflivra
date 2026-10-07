import type {PlaceIndex} from './places-view';
import {normalizeSearch} from './live/query';
import {publicImageUrl} from './live/media';
export type AssetProof={file:string;bytes:number;sha256:string;start?:number;count?:number};
export type PlacesManifest={schema:string;count:number;fetchedAt:string;dataAsOf:string;note:string;sourceUrl:string;licenseUrl:string;attribution:string;categories:Record<string,number>;subcategories:Record<string,string[]>;cities:AssetProof;chunks:Record<string,AssetProof>;indices:Record<string,{name:AssetProof[];recent:AssetProof[]}>;spatial:{lat:number;lon:number;parts:AssetProof[]}[]};
export type PlacesQuery={category:string;q:string;sub:string;contact:string;scope:string;lat:number;lon:number;radius:number;sort:string;page:number;photos?:boolean;pageSize?:number};
export function km(a:{lat:number;lon:number},b:{lat:number;lon:number}){const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad,x=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)))}
export async function queryPlaces(manifest:PlacesManifest,query:PlacesQuery,read:(proof:AssetProof)=>Promise<{items:PlaceIndex[]}>) {
 // The page size is the caller's honest choice: 18 per page for the card lists,
 // a bounded larger page (200) when the consuming surface is the map layer.
 const size=query.pageSize??18,category=query.category==='local'?'local-all':query.category,terms=[...normalizeSearch(query.q).matchAll(/"([^"]+)"|(\S+)/g)].map(m=>m[1]||m[2]),center={lat:query.lat,lon:query.lon};
 let parts=manifest.indices[category][query.sort==='recent'?'recent':'name'];
 if(query.scope==='nearby'){const dy=query.radius/110,dx=query.radius/(110*Math.cos(query.lat*Math.PI/180));parts=manifest.spatial.filter(c=>c.lat+1>=query.lat-dy&&c.lat<=query.lat+dy&&c.lon+1>=query.lon-dx&&c.lon<=query.lon+dx).flatMap(c=>c.parts)}
 const bare=query.scope==='all'&&!query.sub&&!query.contact&&!query.photos&&!terms.length&&query.sort!=='distance';
 if(bare){const total=manifest.categories[category],pages=Math.max(1,Math.ceil(total/size)),page=Math.min(query.page,pages-1),start=page*size;const items:PlaceIndex[]=[];for(const part of parts.filter(p=>(p.start||0)<start+size&&(p.start||0)+(p.count||0)>start)){const d=await read(part);items.push(...d.items.slice(Math.max(0,start-(part.start||0)),start+size-(part.start||0)))}return {items,total,page,pages,pageSize:size}}
 const chosen:PlaceIndex[]=[],tail:PlaceIndex[]=[],distanceOrder:{id:string;chunk:string;name:string;updatedAt:string;distance:number;part:AssetProof}[]=[];let total=0;
 // Shards are read in bounded batches; the full national index never occupies browser or Worker memory.
 for(let at=0;at<parts.length;at+=3){const batch=await Promise.all(parts.slice(at,at+3).map(read));for(let bi=0;bi<batch.length;bi++)for(const r of batch[bi].items){if(category!=='local-all'&&!r.categories.includes(category)||query.sub&&!r.types.some(t=>t.label===query.sub&&(category==='local-all'||t.category===category))||query.contact&&!r[query.contact as keyof PlaceIndex]||query.photos&&!publicImageUrl(r.image)||!terms.every(t=>normalizeSearch(r.search+' '+r.name+' '+r.address).includes(t)))continue;const distance=Number.isFinite(query.lat)&&Number.isFinite(query.lon)?km(center,r):null;if(query.scope==='nearby'&&(distance===null||distance>query.radius))continue;
  if(query.sort==='distance'||query.scope==='nearby')distanceOrder.push({id:r.id,chunk:r.chunk,name:r.name,updatedAt:r.updatedAt,distance:distance??Infinity,part:parts[at+bi]});
  else{if(total>=query.page*size&&total<(query.page+1)*size)chosen.push(r);tail.push(r);if(tail.length>size)tail.shift()}total++;
 }}
 const pages=Math.max(1,Math.ceil(total/size)),page=Math.min(query.page,pages-1);
 if(distanceOrder.length){distanceOrder.sort((a,b)=>query.sort==='name'?a.name.localeCompare(b.name,'ro',{numeric:true}):query.sort==='recent'?b.updatedAt.localeCompare(a.updatedAt)||a.name.localeCompare(b.name,'ro'):a.distance-b.distance||a.name.localeCompare(b.name,'ro',{numeric:true}));const selection=distanceOrder.slice(page*size,(page+1)*size),ids=new Set(selection.map(r=>r.id)),selected:PlaceIndex[]=[];
  const selectedParts=[...new Map(selection.map(r=>[r.part.file,r.part])).values()];
  for(let at=0;at<selectedParts.length;at+=3)for(const d of await Promise.all(selectedParts.slice(at,at+3).map(read)))for(const r of d.items)if(ids.has(r.id))selected.push(r);
  const byId=new Map(selected.map(r=>[r.id,r]));return{items:selection.map(r=>({...byId.get(r.id)!,distance:r.distance})),total,page,pages,pageSize:size};
 }
 return{items:page===query.page?chosen:tail.slice(tail.length-(total-page*size)),total,page,pages,pageSize:size};
}
