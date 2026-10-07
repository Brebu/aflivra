// Aflivra service worker: offline page + fonts + /data/ caching (see the README's
// offline-friendly contract), plus Web Push receiving for the „Urmărește" watch
// center — the payload is {title, body, url} with the same deep link as the event
// feed (/#view=watch&event=<id>, which the centru routes onward per kind).
const CACHE='aflivra-static-v21';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html','/favicon.svg','/fonts/InterVariable.woff2'])));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('reper-static-')||k.startsWith('aflivra-static-'))&&k!==CACHE).map(k=>caches.delete(k))))]));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/offline.html')));return;}if(u.pathname==='/fonts/InterVariable.woff2'){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));return;}if(u.pathname.startsWith('/data/'))e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||Response.error())));});
self.addEventListener('push',e=>{
  let data={};
  try{if(e.data)data=e.data.json()}catch{}
  e.waitUntil(self.registration.showNotification(data.title||'Aflivra — Ce s-a schimbat',{body:data.body||'',icon:'/icon-192.png',badge:'/icon-192.png',tag:data.url||undefined,requireInteraction:false,data:{url:data.url||'/'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=e.notification.data&&e.notification.data.url||'/';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){if('focus' in client)return client.focus().then(()=>client.navigate(url));}
    return self.clients.openWindow(url);
  }));
});
