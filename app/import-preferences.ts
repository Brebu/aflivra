'use client';
import {fieldsToData} from '@/lib/data-export';
export async function importPreferences(file:File){
 if(file.size>1000000)throw Error('Fișier prea mare.');
 if(/\.json$/i.test(file.name))return JSON.parse(await file.text());
 const XLSX=await import('xlsx');
 const book=XLSX.read(await file.arrayBuffer(),{type:'array',raw:true,cellDates:false});
 const sheet=book.Sheets.Date||book.Sheets[book.SheetNames[0]];
 const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:''});
 if(rows[0]?.join('|')!=='Câmp|Tip|Valoare|Parte')throw Error('Export Aflivra invalid.');
 return fieldsToData(rows.slice(1));
}
