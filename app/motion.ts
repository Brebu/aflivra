'use client';
import {useEffect} from 'react';
export function useExperienceMotion(enabled:boolean,view:string,entity:string){useEffect(()=>{
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');let stop=()=>{};
 function setup(){stop();const root=document.getElementById('vcontent');if(!root)return;if(!enabled||media.matches){root.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el=>delete el.dataset.reveal);root.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el=>el.style.removeProperty('--scene-y'));return}
 const nodes=Array.from(root.querySelectorAll<HTMLElement>('.place-card,.domain-card,.news-card,.live-resource,.home-analytics>article,.section-head,.wide-story,.discovery-split,.vstat,.locality-grid>article,.weather-live-grid>article,.city-story,.law-result,.court-case,.category-banner,.contacts-panel'));
 const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){(e.target as HTMLElement).dataset.reveal='visible';observer?.unobserve(e.target)}},{threshold:.08,rootMargin:'0px 0px 24px 0px'}):null;
 if(observer)nodes.forEach((el,i)=>{const rect=el.getBoundingClientRect();if(rect.top>window.innerHeight){el.dataset.reveal='waiting';el.style.setProperty('--reveal-delay',String((i%3)*65)+'ms');observer.observe(el)}});
 let frame=0;const scenes=Array.from(root.querySelectorAll<HTMLElement>('[data-parallax]'));const update=()=>{frame=0;for(const el of scenes){const r=el.parentElement?.getBoundingClientRect();if(!r||r.bottom<0||r.top>innerHeight)continue;const y=Math.max(-45,Math.min(45,(innerHeight/2-r.top-r.height/2)*.085));el.style.setProperty('--scene-y',y+'px')}};const scroll=()=>{if(!frame)frame=requestAnimationFrame(update)};window.addEventListener('scroll',scroll,{passive:true});update();stop=()=>{observer?.disconnect();window.removeEventListener('scroll',scroll);cancelAnimationFrame(frame);nodes.forEach(el=>{delete el.dataset.reveal;el.style.removeProperty('--reveal-delay')});scenes.forEach(el=>el.style.removeProperty('--scene-y'))};
 }
 setup();media.addEventListener('change',setup);return()=>{stop();media.removeEventListener('change',setup)};
},[enabled,view,entity]);}
