'use client';
import * as React from 'react';

const mq='(max-width: 767px)',subscribe=(onChange:()=>void)=>{const mql=window.matchMedia(mq);mql.addEventListener('change',onChange);return()=>mql.removeEventListener('change',onChange)},snapshot=():boolean=>window.matchMedia(mq).matches,serverSnapshot=():boolean=>false;

export function useIsMobile(){return React.useSyncExternalStore(subscribe,snapshot,serverSnapshot)}
