'use client';
import {useState} from 'react';
import {Share2,Copy,ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {toast} from 'sonner';

// The reusable share control: the platform share sheet (navigator.share) when
// the device offers one, otherwise a fallback sheet with Copy link and
// share-intent links. The share URL is always computed from location at
// click time, so a share carries exactly the URL the visitor is on.
// SSR rule: location does not exist on the server — the URL is read only
// inside the open sheet (client interaction), never during render.
// Nothing about sharing is tracked — no counters, no redirects, straight
// intent URLs to the chosen app.
export function ShareAction({title,text,url,ariaLabel,label='Partajează',variant='ghost',className}:{title:string;text:string;url:()=>string;ariaLabel:string;label?:string;variant?:'ghost'|'outline';className?:string}){
  const [open,setOpen]=useState(false);
  function trigger(){
    const target=url();
    if(typeof navigator.share==='function'){
      navigator.share({title,text,url:target}).catch(error=>{
        // The user closing the platform sheet is a choice, not a failure;
        // any other failure falls back to our own panel.
        if(error instanceof DOMException&&error.name==='AbortError')return;
        setOpen(true);
      });
      return;
    }
    setOpen(true);
  }
  return <>
    <Button variant={variant} className={className} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={trigger}><Share2 size={17}/>{label}</Button>
    <Sheet open={open} onOpenChange={setOpen}>{open&&<SheetContent className="v2 share-sheet">
      <SheetHeader><SheetTitle>Partajează</SheetTitle><SheetDescription>Copiază linkul sau alege o aplicație. Link-ul se deschide la tine; noi nu urmărim ce partajezi.</SheetDescription></SheetHeader>
      <ShareOptions title={title} text={text} url={url}/>
    </SheetContent>}</Sheet>
  </>;
}

function ShareOptions({title,text,url}:{title:string;text:string;url:()=>string}){
  const target=url();
  function copyLink(){
    if(!navigator.clipboard){toast('Copiază adresa din bara browserului');return}
    navigator.clipboard.writeText(target).then(()=>toast.success('Link copiat')).catch(()=>toast('Copiază adresa din bara browserului'));
  }
  const intents=[
    {label:'Facebook',href:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(target)}`},
    {label:'X',href:`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(target)}`},
    {label:'WhatsApp',href:`https://wa.me/?text=${encodeURIComponent(text+' '+target)}`},
    {label:'Telegram',href:`https://t.me/share/url?url=${encodeURIComponent(target)}&text=${encodeURIComponent(text)}`},
    {label:'LinkedIn',href:`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(target)}`},
  ];
  return <div className="share-options">
    <Button variant="ghost" onClick={copyLink}><Copy size={17}/>Copiază linkul</Button>
    {intents.map(intent=><a key={intent.label} href={intent.href} target="_blank" rel="noreferrer"><span>{intent.label}</span><ArrowUpRight size={16}/></a>)}
  </div>;
}
