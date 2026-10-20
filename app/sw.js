// 간단한 오프라인 캐시: 네트워크 우선(항상 서버에 재확인해 배포 직후에도 새 파일을 받음), 실패 시 캐시
const CACHE = 'pt-sim-v2';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // GitHub Pages 는 max-age=600 을 보내므로 같은 출처 파일은 HTTP 캐시를 건너뛰고(cache: 'no-cache' = 재검증) 받는다
  const req = url.origin === location.origin ? new Request(e.request, { cache: 'no-cache' }) : e.request;
  e.respondWith(fetch(req).then(res => { if (res.ok && url.origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; }).catch(() => caches.match(e.request)));
});