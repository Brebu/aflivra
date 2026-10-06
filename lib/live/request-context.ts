import {AsyncLocalStorage} from 'node:async_hooks';
const contexts=new AsyncLocalStorage<{waitUntil:(promise:Promise<unknown>)=>void}>();
export const withLiveContext=<T>(ctx:{waitUntil:(promise:Promise<unknown>)=>void},fn:()=>T)=>contexts.run({waitUntil:p=>ctx.waitUntil(p)},fn);
export const liveContext=()=>contexts.getStore();
