/* Ebb offline worker. Code and pages come from the network first so a new build shows at once, and from this
 * device's cache when offline; art is served from the cache first. Each build has its own cache name, and an
 * upgrade deletes every older Ebb cache once the new one is complete. The cache holds app files only, never her data. */
'use strict';
var VERSION = 'ebb-shell-2026-10-22a';
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

function keep(req, res) {
  if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
  return res;
}
function networkFirst(req) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () { caches.match(req, { ignoreSearch: true }).then(function (hit) { if (hit && !settled) { settled = true; resolve(hit); } }); }, NETWORK_TIMEOUT);
    fetch(req).then(function (res) { clearTimeout(timer); keep(req, res); if (!settled) { settled = true; resolve(res); } }, function (err) {
      clearTimeout(timer);
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (settled) return;
        settled = true;
        if (hit) resolve(hit);
        else if (req.mode === 'navigate') caches.match('index.html').then(function (h) { h ? resolve(h) : reject(err); });
        else reject(err);
      });
    });
  });
}
function cacheFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || fetch(req).then(function (res) { return keep(req, res); }); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(/\.(png|webp|jpe?g|svg|gif|mp3|m4a|ogg|woff2?)$/i.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
