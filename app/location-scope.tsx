'use client';
import {useRef,useState} from 'react';
import {useLocation} from './location';
import {SelectField} from './select-field';
import type {GeographicScope} from '@/lib/geographic-scope';
/** A new location uses local defaults in the very first render. The identity that
    resets this state is the semantic area key (resolved locality / manual city),
    never the ~100 m quantization cell — a same-locality GPS drift keeps it. */
export function useLocationState<T>(initial:T|(()=>T)):[T,(value:T|((old:T)=>T))=>void]{const geo=useLocation(),activeKey=useRef(geo.areaKey),[state,setState]=useState(()=>({key:geo.areaKey,value:typeof initial==='function'?(initial as ()=>T)():initial})),value=state.key===geo.areaKey?state.value:typeof initial==='function'?(initial as ()=>T)():initial;activeKey.current=geo.areaKey;return[value,next=>setState(old=>activeKey.current!==geo.areaKey?old:{key:geo.areaKey,value:typeof next==='function'?(next as (old:T)=>T)(old.key===geo.areaKey?old.value:value):next})]}
export function useGeographicScope(){return useLocationState<GeographicScope>('context')}
export function GeographicScopeField({value,onChange,localOnly=false}:{value:GeographicScope;onChange:(value:GeographicScope)=>void;localOnly?:boolean}){const geo=useLocation();return <label><span className="control-label">Locație</span><SelectField value={value} onChange={e=>onChange(e.target.value as GeographicScope)}><option value="context">{geo.hasLocal?geo.label:'România · implicit'}</option>{geo.hasLocal&&localOnly&&<option value="local">Doar localitatea / județul</option>}<option value="national">Toată România</option></SelectField></label>}
