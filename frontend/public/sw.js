/* global self, caches, fetch, console, URL */

const CACHE_NAME = 'electric-chair-arena-v1';
const ASSETS = [
  './',
  './index.html',
  './globals.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Failed to cache assets during install:', err);
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Cache Storage APIのcache.putはGET以外のリクエストをサポートしないため、
  // POST等(/save-match, /ai-move, /generate-commentary等のAPI呼び出し)は
  // 素通しし、ブラウザの通常のネットワーク処理に委ねる。また、クロスオリジンの
  // APIレスポンスをキャッシュ対象にすると、オフライン時に古いAPIデータが
  // 透過的に返ってしまうため、キャッシュ対象は同一オリジンの静的アセットに限定する。
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  // レイアウト側のCache-Controlメタタグ(no-cache, no-store, must-revalidate)は
  // 常に最新のドキュメントを取得する意図だが、以前はここでcaches.matchを優先しており
  // オフライン対応用のキャッシュが常にネットワークより優先され、新しいデプロイ後も
  // 古いHTML/CSSがずっと配信され続けてしまっていた。ネットワークを優先し、
  // 取得できた場合はキャッシュを更新、オフライン等でネットワークが使えない場合のみ
  // キャッシュへフォールバックする。
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, responseClone))
          .catch((err) => console.warn('Failed to update cache:', err));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
