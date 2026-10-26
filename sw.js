/* Ebb offline worker. Code and pages come from the network first so a new build shows at once, and from this
 * device's cache when offline; art is served from the cache first. Each build has its own cache name, and an
 * upgrade deletes every older Ebb cache once the new one is complete. The cache holds app files only, never her data. */
'use strict';
var VERSION = 'ebb-shell-2026-10-26m';
var SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/ebb.css',
  'js/ebb-puppet.js', 'js/ebb-world.js', 'js/ebb-farm.js', 'js/ebb-store.js', 'js/ebb-props.js', 'js/ebb-ui.js', 'js/ebb-game.js',
  'js/settings/core.js',
  'art/plates/bedroom.webp', 'art/plates/farm.webp', 'art/plates/waterfall.webp',
  'art/icons/icon-192.png', 'art/icons/icon-512.png', 'art/icons/icon-maskable-512.png', 'art/icons/apple-touch-icon.png'
];
/* each workstream's entry file and style; a missing one must not stop the install */
var OPTIONAL = ['log', 'safety', 'world', 'course', 'settings'].reduce(function (a, n) { return a.concat('js/ext/' + n + '.js', 'css/ext/' + n + '.css'); }, []);
var NETWORK_TIMEOUT = 3500;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL).then(function () {
      return Promise.all(OPTIONAL.map(function (u) { return c.add(u).catch(function () { }); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^ebb-shell-/.test(k) && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'version' && e.ports && e.ports[0]) e.ports[0].postMessage({ version: VERSION });
});

/* store a good same-origin response; the returned promise ends when the cache write does */
function keep(req, res) {
  if (!(res && res.ok && res.type === 'basic')) return Promise.resolve();
  var copy = res.clone();
  return caches.open(VERSION).then(function (c) { return c.put(req, copy); }).catch(function () { });
}
function fallback(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined);
  });
}
/* the network refresh is handed to waitUntil so the worker lives until the new copy is cached, even after a slow
   network has lost the race to the cache */
function networkFirst(e) {
  var req = e.request, net = fetch(req);
  e.waitUntil(net.then(function (res) { return keep(req, res); }, function () { }));
  return new Promise(function (resolve, reject) {
    var settled = false;
    function give(res) { if (!settled && res) { settled = true; resolve(res); } return !!res; }
    var timer = setTimeout(function () { fallback(req).then(give); }, NETWORK_TIMEOUT);
    net.then(function (res) { clearTimeout(timer); give(res); }, function (err) {
      clearTimeout(timer);
      fallback(req).then(function (hit) { if (!give(hit) && !settled) { settled = true; reject(err); } });
    });
  });
}
function cacheFirst(e) {
  var req = e.request;
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    var net = fetch(req);
    e.waitUntil(net.then(function (res) { return keep(req, res); }, function () { }));
    return net;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  /* video and any byte-range request go straight to the network: Safari streams video with Range headers, and a cached
     whole-file answer to a Range request breaks playback */
  if (/\.(mp4|webm)$/i.test(url.pathname) || (req.headers && req.headers.get && req.headers.get('range'))) return;
  e.respondWith(/\.(png|webp|jpe?g|svg|gif|mp3|m4a|ogg|woff2?)$/i.test(url.pathname) ? cacheFirst(e) : networkFirst(e));
});
