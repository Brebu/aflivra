'use client';
import * as React from 'react';
export function useIsMobile(){const [isMobile,setIsMobile]=React.useState<boolean|undefined>(undefined);React.useEffect(()=>{const mql=window.matchMedia('(max-width: 767px)'),onChange=()=>setIsMobile(mql.matches);mql.addEventListener('change',onChange);setIsMobile(mql.matches);return()=>mql.removeEventListener('change',onChange)},[]);return !!isMobile}
