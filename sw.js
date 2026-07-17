// Service Worker - 装修资料库离线缓存
var CACHE_NAME = 'zxlib-v2';
var PRE_CACHE = [
  '/onlinemap/',
  '/onlinemap/index.html',
  '/onlinemap/viewer.html',
  '/onlinemap/css/style.css',
  '/onlinemap/js/app.js',
  '/onlinemap/js/viewer.js',
  '/onlinemap/manifest.json'
];

// 安装：预缓存核心文件
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRE_CACHE);
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存优先，网络更新
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // CDN 资源用缓存优先
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.sheetjs.com') {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        var fetched = fetch(event.request).then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
          return response;
        });
        return cached || fetched;
      })
    );
    return;
  }

  // 大文件（PDF/Excel）：网络优先，失败时回退缓存
  if (url.pathname.match(/\.(pdf|xls)$/i)) {
    event.respondWith(
      fetch(event.request).then(function (response) {
        // 不缓存大文件到 Cache API（有配额限制）
        return response;
      }).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  // 其他资源：缓存优先
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var fetched = fetch(event.request).then(function (response) {
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, response);
        });
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || fetched;
    })
  );
});
