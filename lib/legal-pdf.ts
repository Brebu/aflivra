import {PDFDocument,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {lawDialogTitle,type LawSection} from './live/legal-reader';
import {lawVersionText,type LawConsolidation} from './live/legal-consolidation';

export type ArticlePdfInput={act:{title:string;type?:string;number?:string;issuer?:string;publication?:string;sourceUrl?:string;textProvided?:boolean;consolidation?:LawConsolidation};section:LawSection;lastSuccessAt?:string|null;regularFont:Uint8Array;semiboldFont:Uint8Array};

/** Wrap every word and oversized token; no excerpt, character limit or ellipsis is used. */
export function pdfLines(text:string,font:PDFFont,size:number,width:number):string[]{
 const lines:string[]=[];
 for(const hardLine of text.replace(/\r\n?/g,'\n').split('\n')){
  const words=hardLine.trim().split(/[\t \u00a0]+/).filter(Boolean);let line='';
  for(const word of words){
   const candidate=line?line+' '+word:word;
   if(font.widthOfTextAtSize(candidate,size)<=width){line=candidate;continue}
   if(line){lines.push(line);line=''}
   let characters=Array.from(word);
   while(characters.length&&font.widthOfTextAtSize(characters.join(''),size)>width){
    let low=1,high=characters.length;
    while(low<high){const mid=Math.ceil((low+high)/2);if(font.widthOfTextAtSize(characters.slice(0,mid).join(''),size)<=width)low=mid;else high=mid-1}
    const part=characters.slice(0,low).join('');
    if(font.widthOfTextAtSize(part,size)>width)throw Error('Un caracter nu încape în pagina PDF.');
    lines.push(part);characters=characters.slice(low);
   }
   line=characters.join('');
  }
  if(line)lines.push(line);else if(!words.length)lines.push('');
 }
 return lines;
}

export async function createLawArticlePdf(input:ArticlePdfInput):Promise<Uint8Array>{
 const {act,section}=input;
 if(section.kind!=='article'||!section.body.trim())throw Error('Articolul nu conține un text integral care poate fi exportat.');
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const regular=await doc.embedFont(input.regularFont,{subset:false}),semibold=await doc.embedFont(input.semiboldFont,{subset:false});
 const supported=new Set(regular.getCharacterSet());
 const content=[section.title,section.body,act.title,act.issuer,act.publication,act.sourceUrl].filter(Boolean).join('\n');
 const missing=[...new Set(Array.from(content).filter(c=>!/[\s\uFEFF]/u.test(c)&&!supported.has(c.codePointAt(0)!)))];
 if(missing.length)throw Error('Fontul PDF nu poate reda integral unele caractere din acest articol. Reîncearcă exportul după actualizarea fontului.');
 doc.setTitle(section.title+' - '+lawDialogTitle(act));doc.setAuthor('Aflivra');doc.setSubject('Textul integral al articolului din sursa oficială');doc.setLanguage('ro-RO');doc.setCreator('Aflivra');
 const width=595.28,height=841.89,margin=48,bottom=82,available=width-margin*2;
 const ink=rgb(.14,.18,.25),muted=rgb(.34,.39,.47),blue=rgb(0,.39,.8),rule=rgb(.83,.87,.93);
 let page:PDFPage,y=0;
 const addPage=()=>{page=doc.addPage([width,height]);page.drawText('Aflivra  /  Legislație',{x:margin,y:height-42,size:10,font:semibold,color:blue});page.drawLine({start:{x:margin,y:height-54},end:{x:width-margin,y:height-54},thickness:.7,color:rule});y=height-82};
 const write=(text:string,size=11.5,font=regular,color=ink,leading=18)=>{
  const lines=pdfLines(text.replace(/\uFEFF/g,''),font,size,available);
  if(lines.length>1&&y-bottom<leading*2)addPage();
  for(const line of lines){if(y<bottom)addPage();if(line)page.drawText(line,{x:margin,y,size,font,color});y-=leading}
 };
 addPage();write(section.title,23,semibold,blue,31);y-=7;
 write(act.title,10.5,semibold,ink,16);y-=7;
 if(act.issuer)write('Emitent: '+act.issuer,9.5,regular,muted,14);
 if(act.publication)write('Publicație: '+act.publication,9.5,regular,muted,14);
 write(lawVersionText(act),9.5,regular,muted,14);
 if(input.lastSuccessAt){const date=new Date(input.lastSuccessAt);write('Preluat din sursă: '+(Number.isNaN(date.getTime())?input.lastSuccessAt:date.toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'})),9.5,regular,muted,14)}
 y-=13;
 for(const paragraph of section.body.split(/\n{2,}/).filter(p=>p.trim())){write(paragraph);y-=9}
 y-=8;if(y<bottom+75)addPage();
 write('Proveniență',11,semibold,blue,18);
 write('Portal Legislativ - Ministerul Justiției',9.5,regular,muted,14);
 if(act.sourceUrl)write(act.sourceUrl,9.5,regular,muted,14);
 if(act.consolidation)write('Versiune oficială: '+act.consolidation.versionId+' · verificare: '+new Date(act.consolidation.checkedAt).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'}),9,regular,muted,14);
 const pages=doc.getPages();
 pages.forEach((p,index)=>{p.drawLine({start:{x:margin,y:60},end:{x:width-margin,y:60},thickness:.7,color:rule});p.drawText('Text integral din sursa oficială',{x:margin,y:43,size:8.5,font:regular,color:muted});const label=(index+1)+' / '+pages.length;p.drawText(label,{x:width-margin-regular.widthOfTextAtSize(label,9),y:43,size:9,font:regular,color:muted})});
 return doc.save();
}

export function lawArticlePdfName(act:ArticlePdfInput['act'],section:LawSection){return ('Aflivra_'+lawDialogTitle(act)+'_'+section.title).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_')+'.pdf'}
