import {createHash} from 'node:crypto';import {getSource,SourceError} from './adapters';import {sourceText,decodeEntities} from './text';import type {Loader,Loaded} from './types';
import {sourceElements,sourceAttributes} from './source-html';
const base='https://www.ifep.ro/Justice/Lawyers/LawyersPanel.aspx';
function hiddenFields(html:string){const fields=new URLSearchParams();for(const input of html.matchAll(/<input\b[^>]*>/gi)){const a=Object.fromEntries([...input[0].matchAll(/([\w$-]+)=["']([^"']*)["']/g)].map(m=>[m[1],decodeEntities(m[2])]));if(a.type==='hidden'&&a.name)fields.set(a.name,a.value||'')}if(!fields.has('__VIEWSTATE'))throw new SourceError('Formularul registrului profesional s-a schimbat.');return fields}
function professionalText(value:unknown):string{
 // Old cached records can end inside a quoted tooltip tag. Retain the visible
 // prefix; the separately published rights, address and contacts remain intact.
 return sourceText(value).replace(/<\/?(?:span|div|p|a|button|em|img|font|small|strong|i|b)\b(?=\s|\/?$)[\s\S]*$/i,'').trim();
}

export function normalizeLawyerData(data:any){
 if(!data||!Array.isArray(data.items))return data;
 return{...data,items:data.items.map((item:any)=>{
  const paragraphs=(Array.isArray(item.paragraphs)?item.paragraphs:[]).map(professionalText).filter(Boolean);
  const updatedAt=professionalText(item.updatedAt)||paragraphs[0]?.match(/^\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}/)?.[0]||'';
  return{...item,name:professionalText(item.name),title:professionalText(item.title),details:professionalText(item.details),rights:professionalText(item.rights),updatedAt,
   paragraphs:paragraphs.filter((p:string)=>!updatedAt||!p.startsWith(updatedAt))};
 })};
}

export function parseLawyers(html:string):Loaded{
 const spans=sourceElements(html,'span'),pager=(id:string)=>sourceText(spans.find(s=>sourceAttributes(s.openTag).id===id)?.html||'');
 const total=Number(pager('MainContent_PagerTop_lblRecords').match(/din\s+(\d+)/i)?.[1]);
 if(!Number.isInteger(total))throw new SourceError('Registrul nu a oferit numărul rezultatelor.');
 const page=Number(pager('MainContent_PagerTop_lblPages').match(/pagina\s+(\d+)/i)?.[1]||1)-1;
 const items=sourceElements(html,'a').flatMap(record=>{
  const href=sourceAttributes(record.openTag).href;
  if(!href||!/^LawyerFile\.aspx\?[^"<>\s]+$/.test(href))return[];
  const link=new URL(decodeEntities(href),base),body=record.html,header=sourceElements(body,'h4')[0]?.html||'';
  const name=sourceText(sourceElements(header,'font')[0]?.html||header),parts=sourceElements(body,'span');
  const updatedAt=sourceText(parts.find(s=>decodeEntities(sourceAttributes(s.openTag).title||'')==='Ultima actualizare')?.html||'');
  const rights=[...new Set(parts.map(s=>sourceText(sourceAttributes(s.openTag)['data-content']||'')).filter(s=>/^Drept de concluzii la:/i.test(s)))].join('\n');
  return[{id:link.searchParams.get('RecordId'),name,title:sourceText(header),url:link.href,details:sourceText(body),updatedAt,
   paragraphs:sourceElements(body,'p').map(p=>sourceText(p.html)).filter(Boolean),rights}];
 });
 if(total>0&&!items.length)throw new SourceError('Fișele registrului nu pot fi citite în structura primită.');
 return{publishedAt:null,data:normalizeLawyerData({items,total,page,pages:Math.max(1,Math.ceil(total/15)),pageSize:15,
  note:'Tabloul profesional este actualizat de barouri. Prezența unui avocat în registru nu dovedește reprezentarea unei părți într-un anumit dosar.',sourceUrl:base})};
}
export const lawyerLoader=(q:string,page:number,sort:string):Loader=>({key:'lawyers:'+createHash('sha256').update(JSON.stringify({q,page,sort})).digest('hex'),name:'IFEP / UNBR · tabloul național al avocaților',url:base,version:'ifep.public-search.v2',ttl:3600,load:async()=>{let html=await getSource(base,undefined,{timeoutMs:8000});if(q||sort!=='recent'){const form=hiddenFields(html);form.set('ctl00$MainContent$tbSearch',q);form.set('ctl00$MainContent$ddlOrderBy',sort==='name'?'full_name':'last_update');form.set('ctl00$MainContent$ddlOrderType',sort==='name'?'ASC':'DESC');html=await getSource(base,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()},{timeoutMs:8000})}const first=parseLawyers(html),target=Math.min(page,first.data.pages-1);if(target>0){const form=hiddenFields(html);form.set('__EVENTTARGET','ctl00$MainContent$PagerTop$NavGoToPage');form.set('__EVENTARGUMENT','');form.set('ctl00$MainContent$tbSearch',q);form.set('ctl00$MainContent$ddlOrderBy',sort==='name'?'full_name':'last_update');form.set('ctl00$MainContent$ddlOrderType',sort==='name'?'ASC':'DESC');form.set('ctl00$MainContent$PagerTop$tbPage',String(target+1));html=await getSource(base,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()},{timeoutMs:8000});const actual=parseLawyers(html);if(actual.data.page!==target)throw new SourceError('Pagina solicitată nu a fost confirmată de registru.');return actual}return first}});
