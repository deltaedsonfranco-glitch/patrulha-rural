/* Service worker: guarda o app no aparelho para abrir sem internet.
 * Ao publicar uma nova versão do app, aumente o número em VERSAO. */
var VERSAO = 'pr-v1.1.0';
var ARQUIVOS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'config.js',
  'manifest.webmanifest',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(VERSAO).then(function (c) {
    return c.addAll(ARQUIVOS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== VERSAO; })
      .map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (ev) {
  if (ev.data === 'ativar') self.skipWaiting();
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  var url = new URL(req.url);
  // só arquivos do próprio app; API (Google) e mapas de fundo passam direto
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    ev.respondWith(
      caches.match('index.html').then(function (r) { return r || fetch(req); })
    );
    return;
  }
  // config.js: tenta a rede primeiro (para valer logo uma troca de URL da API)
  if (url.pathname.slice(-9) === 'config.js') {
    ev.respondWith(
      fetch(req).then(function (r) {
        var copia = r.clone();
        caches.open(VERSAO).then(function (c) { c.put('config.js', copia); });
        return r;
      }).catch(function () { return caches.match('config.js'); })
    );
    return;
  }
  ev.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (r) {
      return r || fetch(req);
    })
  );
});
