const CACHE_NAME = "growth-os-cache-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/manifest.json"
];

// 安装事件：预缓存基础骨架
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 激活事件：清理旧缓存
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch 事件拦截：离线缓存策略 (Stale-While-Revalidate)
self.addEventListener("fetch", (event) => {
  // 只拦截 HTTP(S) 请求，忽略 chrome-extension 等协议
  if (!event.request.url.startsWith("http")) return;
  // 忽略 API 请求和大模型请求，这些请求不能走缓存
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // 如果命中缓存，立刻返回，但在后台发起网络请求默默更新缓存 (Stale-While-Revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            // 后台更新失败无所谓，因为用户已经拿到了旧缓存
          });
        return cachedResponse;
      }

      // 如果未命中缓存，发起真实网络请求并进行动态缓存
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // 断网且未缓存时的后备策略
          return caches.match("/");
        });
    })
  );
});
