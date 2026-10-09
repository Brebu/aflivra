import {readSource} from '@/lib/live/cache';import {resourceLoader,documentPart,resourceSheetRows} from '@/lib/live/resources';
import {csvLine,fileDisposition,pdfByteRange} from '@/lib/live/resource-download';
import {createExcelExport} from '@/lib/excel-export';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,id=p.get('id')||'';
 if(!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))return Response.json({error:'Identificator invalid.'},{status:400});
 const state=await readSource(resourceLoader(id)),d=state.data,download=p.get('download')==='1';
 if(p.get('format')==='xml'){
  if(d?.kind!=='text'||d.sourceShape!=='word-flat-opc'||typeof d.xmlDocument!=='string')return Response.json({error:'Documentul XML integral nu este disponibil pentru această resursă.'},{status:503});
  return new Response(d.xmlDocument,{headers:{'Content-Type':'application/xml','Content-Disposition':fileDisposition(id,d.title||'document','xml',download),'Cache-Control':'private, max-age=60','X-Aflivra-Characters':String(d.originalCharacters||d.xmlDocument.length)}});
 }
 if(p.get('format')==='csv'||p.get('format')==='xlsx'){
  const sheet=Number(p.get('sheet')||'0');if(!Number.isInteger(sheet)||sheet<0)return Response.json({error:'Foaie invalidă.'},{status:400});
  if(d?.kind!=='table'||d.complete!==true||!d.indexed&&d.copyVerified!==true)return Response.json({error:'Exportul integral este disponibil pentru tabelele importate și verificate integral.'},{status:409});
  try{
   if(p.get('format')==='xlsx'){
    if(sheet>=d.sheets.length)return Response.json({error:'Foaie invalidă.'},{status:400});
    const one={name:d.sheets[sheet].name,columns:d.sheets[sheet].columns,rows:await resourceSheetRows(d,sheet)};
    const bytes=createExcelExport([one],d.title);
    return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':fileDisposition(id,d.title,'xlsx',true),'Cache-Control':'private, max-age=60','X-Aflivra-Rows':String(one.rows.length),'X-Aflivra-Sheets':'1'}});
   }
   const rows=await resourceSheetRows(d,sheet),columns=d.sheets[sheet].columns,encoder=new TextEncoder();let index=0;
   const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(encoder.encode('\uFEFF'+csvLine(columns)))},pull(controller){const next=rows.slice(index,index+200);index+=next.length;if(next.length)controller.enqueue(encoder.encode(next.map(csvLine).join('')));if(index>=rows.length)controller.close()}});
   return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':fileDisposition(id,d.title,'csv',true),'Cache-Control':'private, max-age=60','X-Aflivra-Rows':String(rows.length)}});
  }catch{return Response.json({error:'Exportul integral nu a trecut verificarea. Reîncearcă mai târziu; datele afișate rămân disponibile.'},{status:503})}
 }
 if(d?.kind!=='pdf')return Response.json({error:state.error||'Documentul PDF nu este disponibil.'},{status:503});
 const size=d.size,range=pdfByteRange(request.headers.get('range'),size);if(!range)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
 const {start,end,status}=range,headers={'Content-Type':'application/pdf','Content-Disposition':fileDisposition(id,d.title,'pdf',download),'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, max-age=60',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})};
 if(d.base64){const bytes=Uint8Array.from(atob(d.base64),c=>c.charCodeAt(0));if(bytes.length!==size)return Response.json({error:'Dimensiunea PDF-ului nu a trecut verificarea.'},{status:503});return new Response(bytes.slice(start,end+1),{status,headers})}
 let index=Math.floor(start/300000),cancelled=false;
 const stream=new ReadableStream<Uint8Array>({async pull(controller){try{if(cancelled)return;const base=index*300000,part=await documentPart(d,index);controller.enqueue(part.slice(Math.max(0,start-base),Math.min(part.length,end-base+1)));index++;if(index*300000>end)controller.close()}catch(e){controller.error(e)}},cancel(){cancelled=true}});
 return new Response(stream,{status,headers:{...headers,ETag:'"'+d.snapshot+'"'}});
}
