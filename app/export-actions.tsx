'use client';
import {SelectField} from './select-field';
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import {useEffect,useId,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {exportCsv,exportFileName,exportSheets,type ExportFormat,type ExportInput} from '@/lib/data-export';
import {downloadFile} from './download-file';
import {snapshotJson} from './snapshot-store';

const labels={pdf:'PDF',csv:'CSV',xlsx:'Excel (.xlsx)'};
const types={pdf:'application/pdf',csv:'text/csv;charset=utf-8',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
export function ExportActions({input,formats=['pdf','csv','xlsx'],label='Descarcă',disabled=false,load,onDownload}:{input:ExportInput;formats?:ExportFormat[];label?:string;disabled?:boolean;load?:(signal:AbortSignal)=>Promise<ExportInput>;onDownload?:(format:ExportFormat,signal:AbortSignal)=>Promise<{blob:Blob;name:string}>}){
 const id=useId(),[format,setFormat]=useState<ExportFormat>(formats[0]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState<{url:string;name:string;format:ExportFormat}|null>(null),controller=useRef<AbortController|null>(null),fileUrl=useRef('');
 useEffect(()=>()=>{controller.current?.abort();if(fileUrl.current)URL.revokeObjectURL(fileUrl.current)},[]);
 const selected=formats.includes(format)?format:formats[0];
 async function run(){
  if(busy)return;const c=new AbortController();controller.current=c;setBusy(true);setError('');
  try{
   const save=(blob:Blob,name:string)=>{c.signal.throwIfAborted();if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);fileUrl.current=URL.createObjectURL(blob);setReady({url:fileUrl.current,name,format:selected});downloadFile(blob,name,types[selected])};
   if(onDownload){const result=await onDownload(selected,c.signal);save(result.blob,result.name);return}
   const data=load?await load(c.signal):input;c.signal.throwIfAborted();let bytes:BlobPart;
   if(selected==='csv')bytes=exportCsv(data);
   else if(selected==='xlsx'){const {createExcelExport}=await import('@/lib/excel-export');c.signal.throwIfAborted();bytes=createExcelExport(exportSheets(data),data.title) as BlobPart;}
   else {
    const {createDocumentPdf}=await import('@/lib/document-pdf');
    const fonts=await Promise.all(['/fonts/Inter-Regular.ttf','/fonts/Inter-Semibold.ttf'].map(async url=>{const r=await fetchWithServerRetry(url,{signal:c.signal});if(!r.ok)throw Error('Fontul PDF nu poate fi încărcat. Reîncearcă.');return new Uint8Array(await r.arrayBuffer())}));
    bytes=await createDocumentPdf(data,{regular:fonts[0],semibold:fonts[1]},c.signal) as BlobPart;
   }
   save(new Blob([bytes],{type:types[selected]}),exportFileName(data,selected));
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Exportul nu poate fi creat acum. Reîncearcă.')}
  finally{if(!c.signal.aborted){setBusy(false);controller.current=null}}
 }
 return <div className="export-actions">{formats.length>1&&<><label className="sr-only" htmlFor={id}>Format pentru {label.toLowerCase()}</label><SelectField id={id} aria-label={'Format pentru '+label.toLowerCase()} value={selected} onChange={e=>setFormat(e.target.value as ExportFormat)} disabled={busy||disabled}>{formats.map(f=><option key={f} value={f}>{labels[f]}</option>)}</SelectField></>}<Button type="button" variant="outline" disabled={busy||disabled} onClick={()=>void run()}><Download size={16}/>{busy?'Se pregătește…':label+(formats.length===1?' '+labels[selected]:'')}</Button>{busy&&<><span className="small-muted" role="status">Se pregătește fișierul {labels[selected]}…</span><Button type="button" variant="ghost" onClick={()=>{controller.current?.abort();controller.current=null;setBusy(false)}}>Anulează exportul</Button></>}{ready&&<a className="text-link export-ready" href={ready.url} download={ready.name}>Salvează fișierul {labels[ready.format]}</a>}{error&&<p role="alert">{error}</p>}</div>;
}
export function ResourceTableDownload({id,title,sheet}:{id:string;title:string;sheet:number}){
 return <ExportActions input={{title}} formats={['csv','xlsx']} label="Descarcă setul complet" onDownload={async(format,signal)=>{
  const response=await fetchWithServerRetry('/api/resource-file?'+new URLSearchParams({id,format,sheet:String(sheet),download:'1'}),{signal});
  if(!response.ok){const result:any=await response.json();throw Error(result.error||'Exportul integral nu poate fi verificat acum.')}
  const blob=await response.blob();signal.throwIfAborted();return{blob,name:exportFileName({title},format)};
 }}/>
}
export function AssetExport({path,title}:{path:string;title:string}){
 return <ExportActions input={{title}} label={title} load={async signal=>({title,data:await snapshotJson(path,undefined,signal)})}/>;
}
