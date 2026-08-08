// Service worker mínimo — o único objetivo nesta fase é tornar os apps
// instaláveis ("Adicionar à tela inicial") em Android/iOS. Não há cache
// offline: todo fetch simplesmente passa direto para a rede.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
