// Service Worker: интерфейс открывается мгновенно и даже без сети.
// ВАЖНО: кэшируется только оболочка приложения (html/manifest/иконка). Запросы к Apps Script (данные карт)
// сюда не попадают — они всегда идут напрямую, чтобы никогда не показать устаревший статус подписки.
//
// Стратегия «сеть, а при медленной сети — кэш»: если сайт ответил за 2,5 с — показываем свежую версию (после обновления
// на GitHub она появляется сразу); если сеть тормозит или её нет — открываем сохранённую копию, не заставляя ждать.

var CACHE_NAME = 'loyalty-shell-v2';
var SHELL_FILES = ['./', './index.html', './manifest.json', './icon.svg'];
var SLOW_NETWORK_MS = 2500;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL_FILES); })
      .catch(function () { /* если что-то не закэшировалось — не блокируем установку */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);

  // Не трогаем ничего чужого (запросы к script.google.com и т.п.) и не-GET запросы
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(new Promise(function (resolve) {
    var settled = false;

    var timer = setTimeout(function () {
      caches.match(req).then(function (cached) {
        if (cached && !settled) { settled = true; resolve(cached); }
      });
    }, SLOW_NETWORK_MS);

    fetch(req).then(function (resp) {
      clearTimeout(timer);
      if (resp && resp.ok) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
      }
      if (!settled) { settled = true; resolve(resp); }
    }).catch(function () {
      clearTimeout(timer);
      if (settled) return;
      caches.match(req).then(function (cached) {
        if (cached) { settled = true; resolve(cached); return; }
        caches.match('./index.html').then(function (shell) {
          settled = true;
          resolve(shell || Response.error());
        });
      });
    });
  }));
});
