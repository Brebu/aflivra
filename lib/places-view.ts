import {sourceText} from './live/text';
import type {PublicMedia} from './live/media';
export type PlaceIndex={id:string;name:string;categories:string[];types:{category:string;label:string}[];lat:number;lon:number;address:string;city:string;phone:string;email:string;website:string;openingHours:string;updatedAt:string;sourceUrl:string;chunk:string;search:string;image?:string};
/* Registrul de imagini Wikidata/Commons: fotografiile entităților cu Q-id exact, descărcate
   săptămânal de relaia GitHub și atestate cu autor, licență și sha256. Rolul „brand” este
   onest: fotografia brandului lanțului, nu a farmaciei respective. */
export type ImageryAsset={app_id:string;app_file:string;qid:string;claim:string;role:string;classes:string[];subject:string;title:string;author:string;license:string;license_url:string;source_page_url:string;bytes:number;sha256:string};
export type ImageryRecordRow={a:string;c:string;t:string};
export type ImageryRegister={schema:'aflivra-imagery-v1';generatedAt:string;source:string;classes:Record<string,{records:number;imaged:number}>;assets:ImageryAsset[];records:Record<string,ImageryRecordRow>};
export function imageryFor(register:ImageryRegister|null,id:string):{asset:ImageryAsset;row:ImageryRecordRow}|null{
 if(!register||!id)return null;
 const row=register.records[id];
 if(!row)return null;
 const asset=register.assets.find(entry=>entry.app_id===row.a);
 return asset?{asset,row}:null;
}
export function imageryChip(asset:ImageryAsset){return asset.role==='brand'?'Fotografie de brand · Wikidata/Commons':'Fotografie atestată local · Wikidata/Commons'}
export function imageryGalleryItem(asset:ImageryAsset):PublicMedia{const brand=asset.role==='brand';return {kind:'image',url:asset.app_file,caption:asset.subject+(brand?' — fotografie de brand Wikidata':' — fotografie de entitate Wikidata'),sourceUrl:asset.source_page_url,credit:asset.author,license:asset.license,licenseUrl:asset.license_url}}
const dayNames:Record<string,string>={Mo:'luni',Tu:'marți',We:'miercuri',Th:'joi',Fr:'vineri',Sa:'sâmbătă',Su:'duminică',PH:'sărbători legale',SH:'vacanțe școlare'};
export function readableHours(value:string){return value==='24/7'?'Non-stop · 24 de ore, în fiecare zi':value.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b/g,x=>dayNames[x]).replace(/\boff\b/g,'închis').replace(/\bopen\b/g,'deschis').replace(/;/g,' · ')}
const readableValues:Record<string,string>={yes:'Da',no:'Nu',limited:'Acces limitat',designated:'Amenajat',public:'Public',private:'Privat',customers:'Pentru clienți',permissive:'Acces permis',general:'Medicină generală',general_practice:'Medicină de familie',dentistry:'Stomatologie',orthodontics:'Ortodonție',cardiology:'Cardiologie',gynaecology:'Ginecologie',paediatrics:'Pediatrie',radiology:'Radiologie',physiotherapy:'Fizioterapie',dermatology:'Dermatologie',ophthalmology:'Oftalmologie',emergency:'Urgențe',psychiatry:'Psihiatrie',neurology:'Neurologie',psychology:'Psihologie',surgery:'Chirurgie',laboratory:'Analize de laborator'};
export function readableValue(value:unknown){return sourceText(value).split(';').map(x=>readableValues[x.trim()]||x.trim().replace(/_/g,' ')).join(' · ')}
const common:[string,string][]=[['operator','Operator'],['wheelchair','Acces în scaun rulant'],['fee','Taxă de acces'],['access','Condiții de acces']];
const fields:Record<string,[string,string][]>= {
 sanatate:[['healthcare:speciality','Specialități'],['emergency','Servicii de urgență'],['dispensing','Eliberare medicamente'],['healthcare:operator','Operator medical'],['healthcare:bed_count','Număr de paturi']],
 educatie:[['isced:level','Nivel educațional ISCED'],['grades','Clase / niveluri'],['capacity','Capacitate'],['school:language','Limba de predare']],
 cultura:[['museum','Tip muzeu'],['theatre:type','Tip teatru'],['heritage','Statut de patrimoniu'],['guided_tour','Tururi ghidate']],
 filme:[['screen','Ecrane'],['cinema:3D','Proiecții 3D']],
 transport:[['capacity','Capacitate'],['parking','Tip parcare'],['maxstay','Durată maximă de staționare'],['bicycle_parking','Parcare biciclete'],['public_transport','Tip stație']],
 energie:[['capacity','Puncte de încărcare'],['socket:type2','Prize Type 2'],['socket:type2:output','Putere Type 2'],['socket:type2_combo','Prize CCS'],['socket:type2_combo:output','Putere CCS'],['socket:chademo','Prize CHAdeMO'],['payment:contactless','Plată contactless']],
 bani:[['currency','Valute'],['atm','Bancomat disponibil'],['payment:cash','Numerar'],['payment:cards','Carduri']],
 firme:[['shop','Activitate publicată'],['brand','Brand'],['delivery','Livrare'],['payment:cards','Plată cu cardul']],
 agricultura:[['produce','Produse'],['crop','Culturi'],['organic','Produse bio'],['seasonal','Sezonier']],
 local:[['social_facility','Serviciu social'],['government','Serviciu administrativ'],['service','Servicii']],
 justitie:[['government','Instituție'],['office','Tip serviciu']],munca:[['office','Tip serviciu']],mediu:[['leisure','Tip loc'],['natural','Tip obiectiv'],['ele','Altitudine (m)']],stiri:[['office','Tip redacție']]
};
export function placeFacts(tags:Record<string,string>,category:string){return [...(fields[category]||[]),...common].filter(([key])=>tags[key]!==undefined&&tags[key]!=='').map(([key,label])=>({label,value:readableValue(tags[key])}));}
