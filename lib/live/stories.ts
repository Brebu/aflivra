import {getSource,SourceError} from './adapters';
import {sourceText} from './text';
import {stripClasses} from './source-html';
import {feedMedia} from './media';
import type {Loader,Loaded} from './types';
export function parseStory(raw:string):Loaded {
 const response=JSON.parse(raw),page=response.parse;
 if(!page?.pageid||!page.text?.['*'])throw new SourceError('Povestea nu a fost transmisă integral.');
 const url='https://ro.wikisource.org/wiki/'+encodeURIComponent(page.title.replace(/ /g,'_'));
 const html=page.text['*'].replace(/<span\b[^>]*class=["'][^"']*mw-editsection[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,'');
 // Navigația Wikisource — antetul dinamic cu legăturile „proiecte surori” și
 // subsolul de licență care se printează — e marcată onest de sursă cu clasa
 // ws-noexport: structura se scoate întreagă înainte de text, iar autorul,
 // titlul, licența și capitolele rămân câmpuri separate ale fișei.
 const literary=stripClasses(html,/\b(?:ws-noexport|headertemplate|footertemplate|noprint)\b/i);
 const content=sourceText(literary);if(content.length<40)throw new SourceError('Pagina nu conține încă un text de citit.');
 return {publishedAt:null,data:{id:String(page.pageid),title:page.title,content,url,textComplete:true,media:feedMedia(html,url),revision:page.revid,license:'Text original în domeniul public; contribuțiile editoriale sunt publicate sub licența Wikisource.',licenseUrl:'https://ro.wikisource.org/wiki/Wikisource:Drepturi_de_autor',chapters:(page.links||[]).filter((x:any)=>x.ns===0&&x.exists!==undefined&&x['*'].startsWith(page.title+'/')).map((x:any)=>({title:x['*']}))}};
}
export const storyLoader=(id:string):Loader=>({key:'story:'+id,name:'Wikisource · text integral',url:'https://ro.wikisource.org/?curid='+id,version:'wikisource.complete-story.v2',ttl:86400,load:async()=>parseStory(await getSource('https://ro.wikisource.org/w/api.php?'+new URLSearchParams({action:'parse',pageid:id,prop:'text|links|revid|images|categories',format:'json',redirects:'1'}),undefined,{maxBytes:8_000_000,timeoutMs:10000}))});
