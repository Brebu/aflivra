'use client';
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import {createLawArticlePdf,lawArticlePdfName,type ArticlePdfInput} from '@/lib/legal-pdf';
import {downloadFile} from './download-file';
import {verifiedConsolidation} from '@/lib/live/legal-consolidation';

export async function downloadLawArticlePdf(input:Omit<ArticlePdfInput,'regularFont'|'semiboldFont'>,signal:AbortSignal){
 if(!verifiedConsolidation(input.act))throw Error('Articolul nu aparține unei forme oficiale verificate.');
 const fonts=await Promise.all(['/fonts/Inter-Regular.ttf','/fonts/Inter-Semibold.ttf'].map(async url=>{const response=await fetchWithServerRetry(url,{signal});if(!response.ok)throw Error('Fontul pentru PDF nu este disponibil acum. Reîncearcă descărcarea.');return new Uint8Array(await response.arrayBuffer())}));
 const bytes=await createLawArticlePdf({...input,regularFont:fonts[0],semiboldFont:fonts[1]});
 if(signal.aborted)return;
 downloadFile(new Blob([bytes as BlobPart],{type:'application/pdf'}),lawArticlePdfName(input.act,input.section),'application/pdf');
}
