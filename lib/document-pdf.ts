import {PDFDocument,rgb,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {exportSheets,type ExportInput} from './data-export';

export async function createDocumentPdf(input:ExportInput,fonts:{regular:Uint8Array;semibold:Uint8Array},signal?:AbortSignal):Promise<Uint8Array>{
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const regular=await doc.embedFont(fonts.regular,{subset:false}),bold=await doc.embedFont(fonts.semibold,{subset:false});
 const supported=new Set(regular.getCharacterSet());let escaped=false;
 const printable=(text:string)=>Array.from(text.replace(/\r\n?/g,'\n').replace(/\uFEFF/g,'')).map(c=>{
  if(/[\n\t ]/.test(c)||supported.has(c.codePointAt(0)!))return c;
  escaped=true;return '[U+'+c.codePointAt(0)!.toString(16).toUpperCase()+']';
 }).join('');
 const width=595.28,height=841.89,margin=46,bottom=78;
 const measures=new Map<string,number>();
 const linesFor=(text:string,font:typeof regular,size:number)=>{
  const available=width-2*margin-3,lines:string[]=[],keyPrefix=(font===bold?'b':'r')+size+':';
  const measure=(word:string)=>{const key=keyPrefix+word;let value=measures.get(key);if(value===undefined){value=font.widthOfTextAtSize(word,size);measures.set(key,value)}return value};
  const space=measure(' ');
  for(const hardLine of text.split('\n')){
   const words=hardLine.trim().split(/[\t \u00a0]+/).filter(Boolean);let line='',length=0;
   for(const word of words){
    const wordLength=measure(word);
    if(wordLength<=available){if(line&&length+space+wordLength>available){lines.push(line);line='';length=0}line+=(line?' ':'')+word;length+=(length?space:0)+wordLength;continue}
    if(line){lines.push(line);line='';length=0}
    let token=Array.from(word);
    while(token.length&&measure(token.join(''))>available){let low=1,high=token.length;while(low<high){const mid=Math.ceil((low+high)/2);if(measure(token.slice(0,mid).join(''))<=available)low=mid;else high=mid-1}if(measure(token.slice(0,low).join(''))>available)throw Error('Un caracter nu încape în pagina PDF.');lines.push(token.slice(0,low).join(''));token=token.slice(low)}
    line=token.join('');length=measure(line);
   }if(line)lines.push(line);else if(!words.length)lines.push('');
  }return lines;
 };
 const ink=rgb(.12,.17,.24),blue=rgb(0,.39,.8),muted=rgb(.35,.4,.48),rule=rgb(.83,.87,.93);
 let page:PDFPage,y=0,written=0;
 const addPage=()=>{signal?.throwIfAborted();page=doc.addPage([width,height]);page.drawText('Aflivra',{x:margin,y:height-38,size:10,font:bold,color:blue});page.drawLine({start:{x:margin,y:height-49},end:{x:width-margin,y:height-49},thickness:.7,color:rule});y=height-77};
 const write=async(text:string,size=10.5,font=regular,color=ink,leading=16)=>{
  for(const line of linesFor(printable(text),font,size)){
   signal?.throwIfAborted();if(y<bottom)addPage();if(line)page.drawText(line,{x:margin,y,size,font,color});y-=leading;
   if(++written%200===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
 };
 doc.setTitle(input.title);doc.setAuthor('Aflivra');doc.setCreator('Aflivra');doc.setLanguage('ro-RO');
 addPage();await write(input.title,22,bold,blue,29);y-=8;
 if(input.subtitle){await write(input.subtitle,9,regular,muted,14);y-=12}
 if(input.text!==undefined){for(const paragraph of input.text.split(/\n{2,}/)){await write(paragraph);y-=7}}
 if(input.data!==undefined||input.sheets?.length){
  for(const sheet of exportSheets(input)){
   if(y<bottom+80)addPage();y-=9;await write(sheet.name,14,bold,blue,22);
   for(const [index,row] of sheet.rows.entries()){
    const container=sheet.columns[0]==='Câmp'&&['object','array'].includes(String(row[1]));
    if(container&&String(sheet.rows[index+1]?.[0]??'').startsWith(String(row[0])+'/'))continue;
    if(y<bottom+40)addPage();
    if(sheet.columns[0]==='Câmp'){if(Number(row[3]||1)===1)await write(String(row[0]||'Valoare').replace(/^\//,''),9,bold,muted,14);await write(container?(row[1]==='array'?'Listă fără înregistrări':'Obiect fără câmpuri'):row[1]==='undefined'?'Nefurnizat (undefined)':row[2]===null?'Nefurnizat (null)':String(row[2]??''));}
    else {await write('Înregistrarea '+(index+1),9,bold,blue,15);for(const [i,column] of sheet.columns.entries())await write(column+': '+(row[i]===null?'Nefurnizat (null)':typeof row[i]==='object'?JSON.stringify(row[i]):String(row[i]??'')));}
    y-=8;
   }
  }
 }
 if(escaped){y-=12;await write('Caracterele indisponibile în font sunt indicate prin codul lor Unicode [U+…]. Valorile originale se păstrează în exportul CSV sau Excel.',8.5,regular,muted,13)}
 const pages=doc.getPages();for(const [index,p] of pages.entries()){
  p.drawLine({start:{x:margin,y:55},end:{x:width-margin,y:55},thickness:.7,color:rule});
  const label=(index+1)+' / '+pages.length;p.drawText(label,{x:width-margin-regular.widthOfTextAtSize(label,9),y:38,size:9,font:regular,color:muted});
 }signal?.throwIfAborted();return doc.save();
}
