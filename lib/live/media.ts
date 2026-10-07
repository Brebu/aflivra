import {decodeEntities,sourceText} from './text';
export type PublicMedia={kind:'image'|'video'|'embed';url:string;caption:string;sourceUrl:string;credit?:string;license?:string;licenseUrl?:string;watchUrl?:string;poster?:string};
export function publicUrl(value:unknown,base?:string){if(!String(value||'').trim())return null;try{const url=new URL(String(value),base);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}}
/** Only verified provider URL shapes can become an embedded player. */
export function youtubeVideoId(value:unknown){
 const href=publicUrl(value);if(!href)return null;const u=new URL(href);let id:string|null=null;
 if(u.hostname==='youtu.be')id=u.pathname.slice(1);
 else if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(u.hostname))
  id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)\/?$/)?.[1]||null;
 return id&&/^[\w-]{11}$/.test(id)?id:null;
}
export function embeddedMedia(value:unknown,origin?:string){
 const href=publicUrl(value);if(!href)return null;const id=youtubeVideoId(href);
 if(id){const url=new URL('https://www.youtube-nocookie.com/embed/'+id);url.searchParams.set('playsinline','1');url.searchParams.set('enablejsapi','1');
  if(origin){try{const host=new URL(origin);if(['http:','https:'].includes(host.protocol))url.searchParams.set('origin',host.origin)}catch{}}
  return{provider:'youtube' as const,url:url.href,watchUrl:'https://www.youtube.com/watch?v='+id,id};
 }
 const u=new URL(href),match=u.hostname==='player.vimeo.com'?u.pathname.match(/^\/video\/(\d+)\/?$/):null;
 return match?{provider:'vimeo' as const,url:href,watchUrl:'https://vimeo.com/'+match[1],id:match[1]}:null;
}
/** Album pages are links, not images suitable for an img element. */
export function publicImageUrl(value:unknown){const href=publicUrl(value);if(!href)return null;const url=new URL(href);if(url.hostname==='photos.app.goo.gl'||url.hostname==='photos.google.com')return null;
 if(url.hostname==='commons.wikimedia.org'&&/^\/wiki\/Special:FilePath\//i.test(url.pathname)){url.searchParams.set('width','720');return url.href}
 if(url.hostname==='commons.wikimedia.org'&&/^\/wiki\/File:/i.test(url.pathname)){url.pathname='/wiki/Special:FilePath/'+url.pathname.slice('/wiki/File:'.length);url.searchParams.set('width','720');return url.href}
 if(url.hostname==='upload.wikimedia.org'&&/^\/wikipedia\/commons\/(?:[a-f0-9]\/[^/]+\/)/i.test(url.pathname)){const file=url.pathname.split('/').at(-1)!;return 'https://commons.wikimedia.org/wiki/Special:FilePath/'+file+'?width=720'}
 return /\.(?:jpe?g|png|webp|gif|avif)(?:$)/i.test(url.pathname)?url.href:null;
}
const attribute=(tag:string,name:string)=>tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\x27]([^"\x27]*)["\x27]','i'))?.[1]||'';
const plain=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim();
export function recordMedia(data:unknown,sourceUrl=''):PublicMedia[]{const found:PublicMedia[]=[];const add=(kind:'image'|'video',value:unknown,label:string,context:any)=>{const url=publicUrl(value,sourceUrl||undefined);if(url&&!found.some(x=>x.url===url))found.push({kind,url,caption:plain(String(context?.caption||context?.name||context?.title||label)),sourceUrl:publicUrl(context?.sourceUrl)||sourceUrl||url,...(context?.credit?{credit:String(context.credit)}:{}),...(context?.license?{license:String(context.license)}:{})})};const scan=(value:any,label='Material oferit de sursă',context:any={})=>{if(Array.isArray(value)){for(const item of value)scan(item,label,context)}else if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value)){if(typeof v==='string'){if(k==='wikimedia_commons'&&/^File:[^\s]/.test(v)){const title=v.slice('File:'.length);try{const url='https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(title)+'?width=720';if(!found.some(x=>x.url===url))found.push({kind:'image',url,caption:value?.name?plain(String(value.name)):context?.name?plain(String(context.name)):'Fotografia indicată de sursă',sourceUrl:publicUrl(context?.sourceUrl)||sourceUrl||url})}catch{}}
 const format=String(value.format||'');if(/\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(v)||/^https:\/\//i.test(v)&&/image|photo|thumbnail|imagine|fotograf/i.test(k)||k==='url'&&/^(?:JPG|JPEG|PNG|WEBP|GIF)$/i.test(format))add('image',v,k,value);else if(/\.(?:mp4|webm|ogv)(?:\?|$)/i.test(v)||k==='url'&&/^(?:MP4|WEBM|OGV)$/i.test(format))add('video',v,k,value)}else scan(v,k,value)}}};scan(data);return found}
export function feedMedia(raw:string,sourceUrl:string):PublicMedia[]{raw=decodeEntities(raw);const found:PublicMedia[]=[];const add=(kind:'image'|'video'|'embed',value:string,caption='')=>{const url=publicUrl(value.replace(/&amp;/g,'&'),sourceUrl);if(url&&!found.some(x=>x.url===url))found.push({kind,url,caption:plain(caption),sourceUrl})};for(const match of raw.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi)){const tag=match[0],type=attribute(tag,'type'),value=attribute(tag,'url');if(type.startsWith('video/')||/\.(?:mp4|webm|ogv)(?:\?|$)/i.test(value))add('video',value);else if(type.startsWith('image/')||/media:thumbnail/i.test(tag)||/\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(value))add('image',value)}for(const match of raw.matchAll(/<img\b[^>]*>/gi)){const tag=match[0];add('image',attribute(tag,'src')||attribute(tag,'data-src'),attribute(tag,'alt'))}for(const match of raw.matchAll(/<video\b[^>]*>[^]*?<\/video>/gi)){add('video',attribute(match[0],'src'));for(const child of match[0].matchAll(/<source\b[^>]*>/gi))add('video',attribute(child[0],'src'))}for(const m of raw.matchAll(/<iframe\b[^>]*>/gi)){const u=publicUrl(attribute(m[0],'src'),sourceUrl);if(u){const parsed=new URL(u);if((['www.youtube.com','www.youtube-nocookie.com','youtube.com'].includes(parsed.hostname)&&/^\/embed\/[\w-]+$/.test(parsed.pathname))||parsed.hostname==='player.vimeo.com'&&/^\/video\/\d+$/.test(parsed.pathname))add('embed',u,attribute(m[0],'title'))}}return found}
