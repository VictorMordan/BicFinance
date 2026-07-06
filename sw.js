const CACHE_NAME = 'bicfinance-cache-v2';

// Lista de archivos locales y externos que queremos congelar en el dispositivo
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/firebase.js',
  './js/app.js',
  './manifest.json',
  './assets/logo que es.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// 1. Evento de Instalación: Descarga y guarda los archivos en caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('PWA: Archivos guardados en caché con éxito.');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Evento de Activación: Limpia cachés antiguas si actualizas la app en el futuro
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('PWA: Limpiando caché antigua.');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Evento Fetch: Intercepta peticiones para cargar desde el dispositivo antes de ir a internet
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones que no sean del protocolo http o https (como las de Firebase Auth)
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Si el archivo está en el dispositivo, lo sirve de inmediato; si no, va a internet
        return cachedResponse || fetch(event.request);
      })
  );
});