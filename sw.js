var CACHE_NAME = 'wichanzao-v137';
var PRECACHE = [
  './manifest.json',
  './manifest-pc.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

// Install: cache only small static files — NEVER fail install
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Cache each file individually — don't let one failure kill the install
      return Promise.allSettled(PRECACHE.map(function(url) {
        return cache.add(url).catch(function() { /* skip */ });
      }));
    }).then(function() {
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// Activate: clean old caches, take control immediately
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
              .map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim(); // Take over all open tabs NOW
    })
  );
});

// Fetch: ONLY intercept GET requests for static assets
self.addEventListener('fetch', function(e) {
  // NEVER intercept non-GET requests (POST, DELETE, PUT)
  if (e.request.method !== 'GET') return;

  var url = new URL(e.request.url);

  // NEVER intercept Supabase calls — always go to network
  if (url.hostname.includes('supabase.co')) return;

  // HTML files & navigation: ALWAYS network first, cache fallback for offline only
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Static assets (icons, manifests, fonts, CDN libs): cache-first
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        if (response && response.status === 200 && (
          response.type === 'basic' ||
          url.hostname.includes('fonts.googleapis.com') ||
          url.hostname.includes('fonts.gstatic.com') ||
          url.hostname.includes('cdnjs.cloudflare.com') ||
          url.hostname.includes('cdn.jsdelivr.net')
        )) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(e.request);
      });
    })
  );
});
