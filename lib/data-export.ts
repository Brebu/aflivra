import {csvLine} from './live/resource-download';

export type ExportFormat='pdf'|'csv'|'xlsx';
export type ExportSheet={name:string;columns:string[];rows:unknown[][]};
export type ExportInput={title:string;fileName?:string;subtitle?:string;text?:string;data?:unknown;sheets?:ExportSheet[]};
const pointer=(key:string)=>key.replaceAll('~','~0').replaceAll('/','~1');
export function fieldRows(data:unknown):unknown[][]{
 const rows:unknown[][]=[];
 const visit=(value:unknown,path:string)=>{
  if(value!==null&&typeof value==='object'){
   const entries=Object.entries(value);rows.push([path,Array.isArray(value)?'array':'object','',1]);
   for(const [key,item] of entries)visit(item,path+'/'+pointer(key));
  }else{
   const type=value===null?'null':typeof value,raw=value===undefined?'':value;
   if(typeof raw==='string'&&raw.length>30000){let part=0;for(let at=0;at<raw.length;){let end=Math.min(at+30000,raw.length);if(end<raw.length&&/[\uD800-\uDBFF]/.test(raw[end-1]))end--;rows.push([path,type,raw.slice(at,end),++part]);at=end}}
   else rows.push([path,type,raw,1]);
  }
 };visit(data,'');return rows;
}
export function exportSheets(input:ExportInput):ExportSheet[]{
 if(input.sheets?.length)return input.sheets;
 if(input.data!==undefined)return[{name:'Date',columns:['Câmp','Tip','Valoare','Parte'],rows:fieldRows(input.data)}];
 return[{name:'Document',columns:['Titlu','Text','Sursă'],rows:[[input.title,input.text||'',input.subtitle||'']]}];
}
export function exportCsv(input:ExportInput):string{
 const sheets=exportSheets(input);
 if(sheets.length===1)return '\uFEFF'+csvLine(sheets[0].columns)+sheets[0].rows.map(csvLine).join('');
 const rows:unknown[][]=[];
 for(const sheet of sheets)for(const [i,row] of sheet.rows.entries())for(const [j,value] of row.entries())rows.push([sheet.name,i+1,sheet.columns[j]??String(j+1),value===null?'null':typeof value,value,1]);
 return '\uFEFF'+csvLine(['Foaie','Rând','Câmp','Tip','Valoare','Parte'])+rows.map(csvLine).join('');
}
export function exportFileName(input:ExportInput,format:ExportFormat){
 const name=(input.fileName||'Aflivra_'+input.title).replace(/\.(json|txt|xml|zip|csv|xlsx|pdf)$/i,'');
 return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,160)+'.'+format;
}
/** Restore the typed field ledger used for device-preference exports. */
export function fieldsToData(rows:unknown[][]):any{
 let root:any;const chunks=new Map<string,{type:string;parts:Map<number,unknown>}>();
 for(const row of rows){const [path,type,value,part]=row;if(typeof path!=='string'||!['object','array','string','number','boolean','null','undefined'].includes(String(type)))throw Error('Câmp de import invalid.');const item=chunks.get(path)||{type:String(type),parts:new Map()};if(item.type!==type||item.parts.has(Number(part)))throw Error('Câmp duplicat.');item.parts.set(Number(part),value);chunks.set(path,item)}
 for(const [path,item] of chunks){
  const parts=[...item.parts].sort((a,b)=>a[0]-b[0]);if(parts.some(([n],i)=>n!==i+1))throw Error('Text incomplet.');
  const raw=parts.map(([,v])=>v??'').join(''),value=item.type==='object'?{}:item.type==='array'?[]:item.type==='number'?Number(raw):item.type==='boolean'?raw==='true':item.type==='null'?null:item.type==='undefined'?undefined:raw;
  if(item.type==='number'&&!Number.isFinite(value))throw Error('Număr invalid.');
  if(!path){root=value;continue}if(!path.startsWith('/'))throw Error('Câmp invalid.');
  const keys=path.slice(1).split('/').map(k=>k.replaceAll('~1','/').replaceAll('~0','~'));
  if(keys.some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('Câmp invalid.');
  let parent=root;for(const key of keys.slice(0,-1)){if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,key))throw Error('Structură incompletă.');parent=parent[key]}
  if(!parent||typeof parent!=='object')throw Error('Structură incompletă.');parent[keys.at(-1)!]=value;
 }return root;
}
