// Service Worker - 装修资料库离线缓存
var CACHE_NAME = 'zxlib-v3';

// 安装时预缓存核心页面（使用相对路径，适配不同部署环境）
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      var base = self.location.pathname.replace(/sw\.js$/, '');
      return cache.addAll([
        base,
        base + 'index.html',
        base + 'viewer.html',
        base + 'css/style.css',
        base + 'js/app.js',
        base + 'js/viewer.js',
        base + 'manifest.json'
      ]).catch(function () { /* 部分失败不阻塞安装 */ });
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

// 请求拦截
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // CDN 资源：缓存优先
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.sheetjs.com') {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        var fetched = fetch(event.request).then(function (res) {
          caches.open(CACHE_NAME).then(function (c) { c.put(event.request, res.clone()); });
          return res;
        });
        return cached || fetched;
      })
    );
    return;
  }

  // PDF / Excel：网络优先，成功后缓存（第二次秒开）
  if (url.pathname.match(/\.(pdf|xls)$/i)) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        var fetched = fetch(event.request).then(function (res) {
          if (res.ok) {
            caches.open(CACHE_NAME).then(function (c) { c.put(event.request, res.clone()); });
          }
          return res;
        });
        return cached || fetched;
      })
    );
    return;
  }

  // 其他：缓存优先，后台更新
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var fetched = fetch(event.request).then(function (res) {
        caches.open(CACHE_NAME).then(function (c) { c.put(event.request, res.clone()); });
        return res;
      }).catch(function () { return cached; });
      return cached || fetched;
    })
  );
});
