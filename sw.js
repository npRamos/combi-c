// Service worker: la app funciona sin conexión después de la primera visita.
// Subí VERSION cada vez que cambie algo de la interfaz (HTML, CSS, JS, íconos, manifiesto).

const VERSION = 'v2';
const CACHE_INTERFAZ = `combi-interfaz-${VERSION}`;
const CACHE_DATOS = 'combi-datos';

const INTERFAZ = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/estilos.css',
  'js/app.js',
  'js/busqueda.js',
  'js/consulta.js',
  'js/favorita.js',
  'js/geo.js',
  'js/mapa.js',
  'js/modelo.js',
  'js/parser.js',
  'js/tiempo.js',
  'iconos/icono.svg',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
  'iconos/icono-maskable-512.png',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
];

async function precargarDatos() {
  const cache = await caches.open(CACHE_DATOS);
  const catalogo = await fetch('data/catalogo.json', { cache: 'no-cache' });
  await cache.put('data/catalogo.json', catalogo.clone());
  const { linea, ramales } = await catalogo.json();
  const archivos = ramales.flatMap((ramal) => ramal.sentidos.map((sentido) => sentido.archivo));
  if (linea.ubicaciones) archivos.push(linea.ubicaciones);
  await cache.addAll(['data/feriados.json', ...archivos]);
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    Promise.all([caches.open(CACHE_INTERFAZ).then((cache) => cache.addAll(INTERFAZ)), precargarDatos()]).then(() =>
      self.skipWaiting(),
    ),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith('combi-interfaz-') && nombre !== CACHE_INTERFAZ)
            .map((nombre) => caches.delete(nombre)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Datos: se responde con lo guardado y se actualiza en segundo plano.
async function datosActualizados(evento) {
  const cache = await caches.open(CACHE_DATOS);
  const guardado = await cache.match(evento.request, { ignoreSearch: true });
  const deLaRed = fetch(evento.request, { cache: 'no-cache' })
    .then((respuesta) => {
      if (respuesta.ok) cache.put(evento.request, respuesta.clone());
      return respuesta;
    })
    .catch(() => guardado);
  if (guardado) {
    evento.waitUntil(deLaRed);
    return guardado;
  }
  return deLaRed;
}

// Interfaz: primero lo guardado; si no está, la red.
async function interfaz(evento) {
  const guardado = await caches.match(evento.request, { ignoreSearch: true });
  if (guardado) return guardado;
  try {
    return await fetch(evento.request);
  } catch (error) {
    if (evento.request.mode === 'navigate') return caches.match('./');
    throw error;
  }
}

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const ruta = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  evento.respondWith(ruta.startsWith('data/') ? datosActualizados(evento) : interfaz(evento));
});
