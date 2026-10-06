export const SERVER_ATTEMPTS = 3;
const pending = [];
let active = 0, weatherActive = 0;
const requestLimit = 3;

function drain() {
 while (active < requestLimit) {
  const at = pending.findIndex(entry => !entry.weather || weatherActive === 0);
  if (at < 0) return;
  const [entry] = pending.splice(at, 1);entry.started = true;active++;if(entry.weather)weatherActive++;
  entry.run();
 }
}

/** @param {string | URL} url @param {RequestInit} init */
function queuedFetch(url, init) {
 // Worker requests keep their I/O isolated; the server weather slot lives in D1.
 // The shared UI queue bounds parallel requests from this browser only.
 if(typeof window==='undefined')return fetch(url,init);
 init.signal?.throwIfAborted();
 return new Promise((resolve, reject) => {
  const entry = {weather:/^https:\/\/api\.open-meteo\.com\//.test(String(url)),started:false,finished:false,run:()=>{}};
  const finish = (value, error) => {
   if (entry.finished) {if(value?.body)value.body.cancel().catch(()=>{});return}
   entry.finished=true;init.signal?.removeEventListener('abort',aborted);
   if(entry.started){active--;if(entry.weather)weatherActive--}else{const at=pending.indexOf(entry);if(at>=0)pending.splice(at,1)}
   if(error)reject(error);else resolve(value);drain();
  };
  const aborted = () => finish(null,init.signal?.reason || new DOMException('Aborted','AbortError'));
  entry.run = () => {try{Promise.resolve(fetch(url,init)).then(response=>finish(response,null),error=>finish(null,error))}catch(error){finish(null,error)}};
  init.signal?.addEventListener('abort',aborted,{once:true});pending.push(entry);drain();
 });
}

/** @param {string | null} value */
export function retryAfterSeconds(value) {
 if (!value) return 0;
 const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
 return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

/** @param {number} ms @param {AbortSignal | null | undefined} signal */
function pause(ms, signal) {
 signal?.throwIfAborted();
 return new Promise((resolve, reject) => {
  const aborted = () => { clearTimeout(timer); reject(signal?.reason || new DOMException('Aborted', 'AbortError')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(undefined); }, ms);
  signal?.addEventListener('abort', aborted, {once:true});
 });
}

/**
 * Three total attempts for server errors. Read-only POST queries opt in;
 * cancelled requests, client errors and non-replayable bodies are not retried.
 * A longer Retry-After is returned to the caller for scheduled revalidation.
 * @param {string | URL} url
 * @param {RequestInit} [init]
 * @param {{retryPost?:boolean; deadlineAt?:number; onAttempt?:(attempt:number)=>void}} [options]
 */
export async function fetchWithServerRetry(url, init = {}, options = {}) {
 const method = (init.method || 'GET').toUpperCase();
 const replayable = !(typeof ReadableStream !== 'undefined' && init.body instanceof ReadableStream);
 const allowed = method === 'GET' || method === 'HEAD' || (method === 'POST' && options.retryPost && replayable);
 const deadline = options.deadlineAt ?? Date.now() + 60000;
 for (let attempt = 1; ; attempt++) {
  init.signal?.throwIfAborted();
  options.onAttempt?.(attempt);
  const response = await queuedFetch(url, init);
  if (!allowed || response.status < 500 || response.status > 599 || attempt === SERVER_ATTEMPTS) return response;
  const delay = Math.max(attempt * 1000, retryAfterSeconds(response.headers.get('retry-after')) * 1000);
  if (Date.now() + delay >= deadline) return response;
  try { await response.body?.cancel(); } catch {}
  await pause(delay, init.signal);
 }
}
