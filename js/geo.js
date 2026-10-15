// Cálculos geográficos simples. Los puntos son { lat, lon } en grados.

const RADIO_TIERRA = 6_371_000;
const rad = (grados) => (grados * Math.PI) / 180;

/** Distancia en metros sobre la superficie terrestre (haversine). */
export function distanciaMetros(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA * Math.asin(Math.sqrt(h));
}

/** El elemento de `puntos` más cercano a `posicion`, con su distancia. `ubicar` obtiene { lat, lon } de cada elemento. */
export function masCercana(puntos, posicion, ubicar = (punto) => punto) {
  let mejor = null;
  for (const punto of puntos) {
    const distancia = distanciaMetros(ubicar(punto), posicion);
    if (!mejor || distancia < mejor.distancia) mejor = { punto, distancia };
  }
  return mejor;
}

/**
 * Proyecta `punto` sobre la polilínea `recorrido` ([[lat, lon], …]).
 * @returns {{ metros: number, distancia: number }} metros recorridos desde el inicio hasta la proyección
 *   y distancia del punto a la polilínea. Usa una aproximación plana local, suficiente a escala de ciudad.
 */
export function proyectarEnRecorrido(punto, recorrido) {
  const escalaLon = Math.cos(rad(punto.lat));
  const plano = ([lat, lon]) => [rad(lon) * escalaLon * RADIO_TIERRA, rad(lat) * RADIO_TIERRA];
  const [px, py] = plano([punto.lat, punto.lon]);
  let acumulado = 0;
  let mejor = { metros: 0, distancia: Infinity };
  for (let i = 0; i < recorrido.length - 1; i++) {
    const [ax, ay] = plano(recorrido[i]);
    const [bx, by] = plano(recorrido[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo2));
    const distancia = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (distancia < mejor.distancia) mejor = { metros: acumulado + t * Math.sqrt(largo2), distancia };
    acumulado += Math.sqrt(largo2);
  }
  return mejor;
}

/** Largo total de la polilínea en metros. */
export function largoRecorrido(recorrido) {
  let total = 0;
  for (let i = 0; i < recorrido.length - 1; i++) {
    total += distanciaMetros(
      { lat: recorrido[i][0], lon: recorrido[i][1] },
      { lat: recorrido[i + 1][0], lon: recorrido[i + 1][1] },
    );
  }
  return total;
}

/** "a 80 m", "a 1,2 km". */
export function textoDistancia(metros) {
  if (metros < 1000) return `a ${Math.max(10, Math.round(metros / 10) * 10)} m`;
  return `a ${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}
