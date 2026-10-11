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

/** Only temporary transport failures are replayed; certificate/DNS configuration errors are final. */
function transientConnection(error) {
 const code=String(error?.cause?.code||error?.code||'');
 if(/CERT|TLS|SSL|ENOTFOUND|ERR_INVALID_URL/i.test(code))return false;
 return /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|UND_ERR_(SOCKET|CONNECT_TIMEOUT|HEADERS_TIMEOUT))$/.test(code)||
  (error instanceof TypeError&&/fetch failed|failed to fetch|networkerror|network request failed|load failed/i.test(error.message));
}

/**
 * Three total attempts for transient failures. Read-only POST queries opt in;
 * cancelled requests, permanent client errors and streams are not retried.
 * A longer Retry-After is returned to the caller for scheduled revalidation.
 * @param {string | URL | Request} url
 * @param {RequestInit} [init]
 * @param {{retryPost?:boolean; deadlineAt?:number; onAttempt?:(attempt:number)=>void; random?:()=>number}} [options]
 */
export async function fetchWithServerRetry(url, init = {}, options = {}) {
 const request=typeof Request!=='undefined'&&url instanceof Request?url:null;
 const method = (init.method || request?.method || 'GET').toUpperCase();
 const body=init.body??request?.body;
 const replayable = !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream);
 const allowed = replayable&&(method === 'GET' || method === 'HEAD' || (method === 'POST' && options.retryPost));
 const deadline = options.deadlineAt ?? Date.now() + 60000;
 // The absolute deadline covers a stalled fetch as well as the retry delay.
 const timeout=AbortSignal.timeout(Math.max(0,Math.ceil(deadline-Date.now())));
 const parentSignal=init.signal??request?.signal;
 const signal=parentSignal?AbortSignal.any([parentSignal,timeout]):timeout;
 const boundedInit={...init,signal};
 for (let attempt = 1; ; attempt++) {
  signal.throwIfAborted();
  options.onAttempt?.(attempt);
  let response,error;
  try { response=await queuedFetch(url,boundedInit); }
  catch(e) {
   signal.throwIfAborted();
   if(!allowed||attempt===SERVER_ATTEMPTS||!transientConnection(e))throw e;
   error=e;
  }
  if(response&&(!allowed||!(response.status===408||response.status===429||response.status>=500&&response.status<=599)||attempt===SERVER_ATTEMPTS))return response;
  const delay=Math.max(attempt*1000+Math.floor((options.random?.()??Math.random())*250),retryAfterSeconds(response?.headers.get('retry-after'))*1000);
  if(Date.now()+delay>=deadline){if(response)return response;throw error;}
  try { await response?.body?.cancel(); } catch {}
  await pause(delay,signal);
 }
}
