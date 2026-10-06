'use client';
/** Keep the anchor attached and the URL alive while Safari hands the file to its download manager. */
export function downloadFile(data:BlobPart,name:string,type='text/plain;charset=utf-8'){
 if(!/\.(pdf|csv|xlsx)$/i.test(name))throw Error('Descărcările aplicației sunt disponibile în PDF, CSV sau Excel.');
 const blob=data instanceof Blob?data:new Blob([data],{type});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=name;link.style.display='none';link.setAttribute('aria-hidden','true');document.body.appendChild(link);
 link.click();setTimeout(()=>{link.remove();URL.revokeObjectURL(url)},30000);
}
