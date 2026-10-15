import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanciaMetros, masCercana, proyectarEnRecorrido, largoRecorrido, textoDistancia } from '../js/geo.js';

const cerca = (real, esperado, tolerancia) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${real} no está a ±${tolerancia} de ${esperado}`);

test('distancia: un grado de latitud son ~111 km', () => {
  cerca(distanciaMetros({ lat: -54, lon: -68 }, { lat: -55, lon: -68 }), 111_195, 50);
});

test('distancia: en Ushuaia un grado de longitud mide menos (~64 km)', () => {
  cerca(distanciaMetros({ lat: -54.8, lon: -68 }, { lat: -54.8, lon: -69 }), 64_110, 200);
});

test('distancia a sí mismo es cero', () => {
  assert.equal(distanciaMetros({ lat: -54.8, lon: -68.3 }, { lat: -54.8, lon: -68.3 }), 0);
});

test('parada más cercana', () => {
  const paradas = [
    { nombre: 'A', ubicacion: { lat: -54.78, lon: -68.27 } },
    { nombre: 'B', ubicacion: { lat: -54.80, lon: -68.30 } },
  ];
  const r = masCercana(paradas, { lat: -54.799, lon: -68.301 }, (p) => p.ubicacion);
  assert.equal(r.punto.nombre, 'B');
  cerca(r.distancia, 128, 5);
  assert.equal(masCercana([], { lat: 0, lon: 0 }), null);
});

test('proyección sobre un recorrido en L', () => {
  // Hacia el este ~640 m y después hacia el norte ~1110 m.
  const recorrido = [[-54.81, -68.31], [-54.81, -68.30], [-54.80, -68.30]];
  const largo = largoRecorrido(recorrido);
  cerca(largo, 641 + 1112, 5);
  // Un punto al sur del primer tramo, a mitad de camino.
  const p1 = proyectarEnRecorrido({ lat: -54.811, lon: -68.305 }, recorrido);
  cerca(p1.metros, 320, 5);
  cerca(p1.distancia, 111, 3);
  // Un punto al este del segundo tramo, a mitad de camino.
  const p2 = proyectarEnRecorrido({ lat: -54.805, lon: -68.299 }, recorrido);
  cerca(p2.metros, 641 + 556, 5);
  cerca(p2.distancia, 64, 3);
});

test('formato de distancia', () => {
  assert.equal(textoDistancia(3), 'a 10 m');
  assert.equal(textoDistancia(84), 'a 80 m');
  assert.equal(textoDistancia(1234), 'a 1,2 km');
});
