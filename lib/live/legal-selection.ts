const titleKey=(value:unknown)=>String(value??'').normalize('NFC').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase('ro-RO');
const headingKey=(value:unknown)=>titleKey(String(value??'').split(/\s+(?:EMITENT(?:UL)?|PUBLICAT(?:\s+ÎN)?)(?:\s|:)/i)[0]);
export type LawSelection={id?:string;title?:string;type?:string;number?:string;date?:string};
/** Resolve a selected record by its identity; never substitute an arbitrary first result. */
export function resolveLawSelection(items:any[],selection:LawSelection){
 const one=(rows:any[])=>rows.length===1?rows[0]:null;
 if(selection.id){const exact=one(items.filter(item=>item.id===selection.id||item.sourceUrl===selection.id));if(exact)return exact}
 if(!selection.title)return !selection.id?one(items):null;
 const exactTitle=items.filter(item=>titleKey(item.title)===titleKey(selection.title));if(exactTitle.length===1)return exactTitle[0];
 const candidates=(exactTitle.length?exactTitle:items.filter(item=>headingKey(item.title)===headingKey(selection.title))).filter(item=>(!selection.type||titleKey(item.type)===titleKey(selection.type))&&(!selection.number||String(item.number)===String(selection.number))&&(!selection.date||String(item.date).split('T')[0]===String(selection.date).split('T')[0]));
 return one(candidates);
}
export function findCodeCopy(items:any[],body:any){return resolveLawSelection(items,{id:body.id,title:body.exactTitle,type:body.selectedType,number:body.selectedNumber,date:body.selectedDate})}
