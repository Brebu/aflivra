import rawSites from '@/public/cinema/cinemas.json';

// Locațiile cinema ale operatorului (registru seed): id-urile externe sunt
// cheia rutei de program /api/cinema — aici se descoperă orașul → id.
export const dynamic='force-dynamic';
const SITES=(rawSites as {items:{externalCode:string;name:string;uri:string;address:{address1:string;city:string;district?:string};latitude:number;longitude:number}[]}).items;

export async function GET(){
 return Response.json({items:SITES.map(site=>({id:site.externalCode,name:site.name,city:site.address.city,address:site.address.address1,uri:site.uri,latitude:site.latitude,longitude:site.longitude})),total:SITES.length,note:'Locațiile operatorului din registru; programul pe o locație se citește cu /api/cinema, cu id-ul locației.'},{headers:{'Cache-Control':'public, max-age=3600'}});
}
