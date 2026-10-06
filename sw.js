// Service Worker — offline + lembretes
const CACHE = 'hidrata-v2';
const ASSETS = ['/', '/index.html', '/app.js', '/style.css', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
const STATE_URL = '/__state'; // estado salvo no Cache API (SW não acessa localStorage)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k === CACHE) continue;
      const st = await (await caches.open(k)).match(STATE_URL);
      if (st) await (await caches.open(CACHE)).put(STATE_URL, st);
      await caches.delete(k);
    }
  })());
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).pathname === '/__state') return;
  // Stale-while-revalidate: abre instantâneo do cache e atualiza em segundo plano
  e.respondWith(caches.open(CACHE).then(async c => {
    const cached = await c.match(e.request);
    const rede = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => cached);
    return cached || rede;
  }));
});

// Mesmo cálculo do app (duplicado de propósito: o SW roda isolado)
function avaliar(s, agora = new Date()) {
  const hoje = agora.toLocaleDateString('sv');
  const bebido = s.dia === hoje ? s.total : 0;
  const h = agora.getHours() + agora.getMinutes() / 60;
  if (h < s.inicio || h > s.fim || bebido >= s.meta) return null;
  const esperado = s.meta * (h - s.inicio) / (s.fim - s.inicio);
  const atraso = esperado - bebido;
  if (atraso < s.meta * s.tolerancia) return null;
  return { bebido, esperado: Math.round(esperado), atraso: Math.round(atraso) };
}

async function checar() {
  const res = await caches.open(CACHE).then(c => c.match(STATE_URL));
  if (!res) return;
  const s = await res.json();
  const r = avaliar(s);
  if (!r) return;
  // não spammar: respeita o intervalo mínimo
  if (s.ultimoAviso && Date.now() - s.ultimoAviso < s.intervaloMin * 60000) return;
  s.ultimoAviso = Date.now();
  await caches.open(CACHE).then(c => c.put(STATE_URL, new Response(JSON.stringify(s))));
  await self.registration.showNotification('💧 Hora de beber água', {
    body: `Você está ${r.atraso} ml atrás do ritmo. Um copo agora te coloca de volta no jogo.`,
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'lembrete-agua', renotify: true
  });
}

self.addEventListener('message', e => { if (e.data === 'checar') e.waitUntil(checar()); });
// Android/Chrome com PWA instalado: roda em background mesmo com app fechado
self.addEventListener('periodicsync', e => { if (e.tag === 'lembrete-agua') e.waitUntil(checar()); });
// Web Push (opcional, se adicionar backend depois)
self.addEventListener('push', e => e.waitUntil(checar()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => ws[0] ? ws[0].focus() : clients.openWindow('/')));
});
