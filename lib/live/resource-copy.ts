import {createHash} from 'node:crypto';
/** Only complete, checksum-verified copies prepared from public source files are seedable. */
export function validatedResourceCopy(record:any){
 try{
 if(!record?.data||!Number.isFinite(Date.parse(record.fetchedAt))||!record.fileSha256||record.data.copyVerified!==true)return null;
 if(createHash('sha256').update(JSON.stringify(record.data)).digest('hex')!==record.dataSha256)return null;
 const d=record.data;if(d.kind==='pdf'){const bytes=Uint8Array.from(atob(d.base64||''),character=>character.charCodeAt(0));if(bytes.length!==record.bytes||bytes.length!==d.size||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==record.fileSha256)return null}
 else if(d.kind==='table'){if(d.complete!==true||!d.sheets?.length||d.sheets.some((sheet:any)=>sheet.truncated||sheet.rows?.length!==sheet.total||!sheet.columns?.length))return null}
 else return null;
 return record;
 }catch{return null}
}
