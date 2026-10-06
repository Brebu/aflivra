import * as XLSX from 'xlsx';
import type {ExportSheet} from './data-export';

/** Real XLSX cells, with additional sheets rather than silently cutting Excel limits. */
export function createExcelExport(sheets:ExportSheet[],title='Aflivra'):Uint8Array{
 const book=XLSX.utils.book_new(),names=new Set<string>(),long:unknown[][]=[];
 book.Props={Title:title,Author:'Aflivra',CreatedDate:new Date()};
 const nameFor=(base:string)=>{const clean=(base.replace(/[\\/?*\[\]:]/g,' ').replace(/^'+|'+$/g,'').trim()||'Date').slice(0,31);let name=clean,n=1;while(names.has(name.toLowerCase())){const suffix=' '+(++n);name=clean.slice(0,31-suffix.length)+suffix}names.add(name.toLowerCase());return name};
 const add=(sheet:ExportSheet,allowLong=true)=>{
  if(sheet.columns.length>16384)throw Error('Tabelul depășește limita de coloane Excel. Descarcă CSV.');
  for(let at=0;at<Math.max(1,sheet.rows.length);at+=1048575){
   const name=nameFor((sheet.name||'Date')+(at?' '+(1+Math.floor(at/1048575)):'')),source=sheet.rows.slice(at,at+1048575);
   const cell=(value:unknown,row:number,col:number)=>{
    if(value===undefined||value===null)return null;
    const v=typeof value==='object'?JSON.stringify(value):value;
    if(typeof v==='string'&&v.length>32767){
     if(!allowLong)throw Error('Text prea lung pentru o celulă Excel.');
     let part=0;for(let start=0;start<v.length;){let end=Math.min(start+30000,v.length);if(end<v.length&&/[\uD800-\uDBFF]/.test(v[end-1]))end--;long.push([name,row,col+1,++part,v.slice(start,end)]);start=end}
     return '[Text integral în foile suplimentare pentru texte lungi: rând '+row+', coloana '+(col+1)+']';
    }return v;
   };
   const values=[sheet.columns.map((v,c)=>cell(v,1,c)),...source.map((row,r)=>row.map((v,c)=>cell(v,r+2,c)))];
   const ws=XLSX.utils.aoa_to_sheet(values);if(ws['!ref'])ws['!autofilter']={ref:ws['!ref']};
   ws['!cols']=sheet.columns.map((c,i)=>({wch:Math.min(64,Math.max(14,c.length+2,...source.slice(0,50).map(r=>Math.min(64,String(r[i]??'').length+2))))}));
   XLSX.utils.book_append_sheet(book,ws,name);
  }
 };
 for(const sheet of sheets)add(sheet);
 if(long.length)add({name:'Texte lungi',columns:['Foaie','Rând Excel','Coloană','Parte','Text integral'],rows:long},false);
 return new Uint8Array(XLSX.write(book,{bookType:'xlsx',type:'array',compression:true}));
}
