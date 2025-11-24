// Define um nome e uma versão para o cache
const CACHE_NAME = 'onlyup-cache-v1';

// Lista de ficheiros essenciais para o app funcionar offline
const urlsToCache = [
  '/',
  '/index.html',
  '/src/css/main.css',
  '/src/js/main.js',
  '/src/utilites/baymaxicon.jpg',
  '/src/icons/icon-192x192.png',
  '/src/icons/icon-512x512.png'
];

// Evento de Instalação: guarda os ficheiros em cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de Fetch: serve os ficheiros do cache primeiro
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o ficheiro estiver no cache, retorna-o
        if (response) {
          return response;
        }
        // Se não, vai buscá-lo à rede
        return fetch(event.request);
      }
    )
  );
});
