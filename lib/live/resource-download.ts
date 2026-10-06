export function pdfByteRange(range:string|null,size:number){
 if(!Number.isSafeInteger(size)||size<=0)return null;
 let start=0,end=size-1,status=200;
 if(range){const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match||!match[1]&&!match[2])return null;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return null;start=Math.max(0,size-suffix)}
  else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]))}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;status=206;
 }return{start,end,status};
}
export function fileDisposition(id:string,title:string,extension:string,download:boolean){
 const safeTitle=(title||'Aflivra').replace(/[\r\n\u0000-\u001f\u007f]/g,' ').trim().replace(new RegExp('\\.'+extension+'$','i'),'');
 const filename=encodeURIComponent(safeTitle+'.'+extension).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return (download?'attachment':'inline')+'; filename="Aflivra_'+id+'.'+extension+'"; filename*=UTF-8\'\''+filename;
}
export const csvLine=(row:unknown[])=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')+'\r\n';
