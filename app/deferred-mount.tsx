'use client';
import {ReactNode,useEffect,useState} from 'react';
/** Mounts children after the first paint that follows this component: the view
swap itself stays a small commit (the heavy sections mount in their own frame),
so switching between the bar's perspectives paints fast and the content follows. */
export function DeferredMount({children,label='Se încarcă…'}:{children:ReactNode;label?:string}){
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const frame=requestAnimationFrame(()=>{timer=setTimeout(()=>setMounted(true),0)});
    return()=>{cancelAnimationFrame(frame);if(timer)clearTimeout(timer)};
  },[]);
  return mounted?<>{children}</>:<p className="deferred-mount" role="status">{label}</p>;
}
