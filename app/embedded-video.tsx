'use client';
import {useEffect,useRef,useState} from 'react';
import {Play,ExternalLink} from 'lucide-react';
import {embeddedMedia,publicUrl,type PublicMedia} from '@/lib/live/media';
import {Button} from '@/components/ui/button';

type Player={destroy:()=>void};
type YouTubeApi={Player:new(element:HTMLElement,options:{events:{onReady:()=>void;onError:(event:{data:number})=>void}})=>Player};
type VideoWindow=Window&{YT?:YouTubeApi;onYouTubeIframeAPIReady?:()=>void};
let apiPromise:Promise<YouTubeApi>|null=null;
function loadYouTubeApi(){
 const win=window as VideoWindow;if(win.YT?.Player)return Promise.resolve(win.YT);
 if(apiPromise)return apiPromise;
 apiPromise=new Promise<YouTubeApi>((resolve,reject)=>{
  const script=document.createElement('script'),previous=win.onYouTubeIframeAPIReady;
  const clean=()=>{clearTimeout(timer);if(win.onYouTubeIframeAPIReady===ready)win.onYouTubeIframeAPIReady=previous};
  const fail=()=>{clean();script.remove();apiPromise=null;reject(Error('Player indisponibil'))};
  const ready=()=>{if(!win.YT?.Player)return;clean();resolve(win.YT);previous?.()};
  const timer=setTimeout(fail,12000);win.onYouTubeIframeAPIReady=ready;
  script.src='https://www.youtube.com/iframe_api';script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.onerror=fail;document.head.appendChild(script);
 });
 return apiPromise;
}
export function EmbeddedVideo({item,title}:{item:PublicMedia;title:string}){
 const media=embeddedMedia(item.url),container=useRef<HTMLDivElement>(null);
 const [active,setActive]=useState(false),[status,setStatus]=useState<'idle'|'loading'|'ready'|'failed'>('idle'),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!active||!media||!container.current)return;
  const host=container.current;let cancelled=false,player:Player|undefined,readyTimer:ReturnType<typeof setTimeout>|undefined;
  const fail=(message:string)=>{if(cancelled)return;setError(message);setStatus('failed');setActive(false)};
  const configured=embeddedMedia(item.url,window.location.origin)!;
  const mount=async()=>{
   try{
    const api=media.provider==='youtube'?await loadYouTubeApi():null;if(cancelled)return;
    const iframe=document.createElement('iframe');iframe.title=item.caption||title+' · video';iframe.src=configured.url;
    iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';iframe.allowFullscreen=true;
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-popups');host.replaceChildren(iframe);
    if(api){
     readyTimer=setTimeout(()=>fail('Playerul nu a răspuns. Poți deschide trailerul direct pe YouTube.'),12000);
     player=new api.Player(iframe,{events:{onReady:()=>{if(cancelled)return;clearTimeout(readyTimer);setStatus('ready')},
      onError:({data})=>{clearTimeout(readyTimer);fail(data===100?'Trailerul a fost retras sau nu este public.':data===101||data===150?'Autorul permite vizionarea doar pe YouTube.':'Trailerul nu poate fi redat în acest browser. Deschide-l direct pe YouTube.')}}});
    }else setStatus('ready');
   }catch{fail('Playerul nu poate fi încărcat în acest browser. Poți viziona materialul la sursă.')}
  };
  void mount();
  return()=>{cancelled=true;clearTimeout(readyTimer);try{player?.destroy()}catch{}host.replaceChildren()};
 },[active,attempt,item.url,title,item.caption]);
 if(!media)return <p>Materialul video este disponibil <a href={publicUrl(item.sourceUrl)||undefined} target="_blank" rel="noopener noreferrer">la sursă</a>.</p>;
 return <div className="embedded-video">
  {(status==='idle'||status==='failed')&&<div className="video-preview"><Play size={36}/>{status==='failed'&&<p role="status">{error}</p>}<Button variant="outline" onClick={()=>{setError('');setStatus('loading');setAttempt(n=>n+1);setActive(true)}}>{status==='failed'?'Reîncearcă în pagină':'Redă trailerul aici'}</Button></div>}
  {status==='loading'&&<p role="status">Se încarcă playerul…</p>}
  <div ref={container} className="video-player-host" hidden={!active}/>
  <a className="text-link video-source-link" href={media.watchUrl} target="_blank" rel="noopener">{media.provider==='youtube'?'Deschide trailerul pe YouTube':'Deschide video pe Vimeo'}<ExternalLink size={16}/></a>
 </div>;
}
