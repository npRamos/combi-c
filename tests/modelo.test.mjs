import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirModelo } from '../js/modelo.js';
import { modeloReal, sentido, clave } from './ayuda.mjs';

test('los datos reales tienen dos sentidos', () => {
  const modelo = modeloReal();
  assert.deepEqual(modelo.sentidos.map((s) => s.id), ['hacia-centro', 'hacia-valle']);
  assert.equal(modelo.variosRamales, false);
});

test('Chacra Los Barreto 23 aparece una sola vez hacia el centro, con el horario de su primera posición', () => {
  const haciaCentro = sentido(modeloReal(), 'hacia-centro');
  const chacra = haciaCentro.paradas.filter((p) => p.clave === clave('Chacra Los Barreto, 23'));
  assert.equal(chacra.length, 1);
  assert.equal(chacra[0].nombre, 'Chacra Los Barreto, 23');
  assert.equal(haciaCentro.paradas[0].clave, clave('Chacra Los Barreto, 23'));
  // 34 posiciones en Moovit; Chacra Los Barreto 23 (x3) y Valle de los Coihues 925 (x2) se unifican.
  assert.equal(haciaCentro.paradas.length, 31);
  assert.equal(haciaCentro.pasadas.semana.get(clave('Chacra Los Barreto, 23'))[0].minuto, 5 * 60);
});

test('hacia el Valle unifica "Chacra Los Barreto, 23" y "Chacra Los Barreto 23"', () => {
  const haciaValle = sentido(modeloReal(), 'hacia-valle');
  const claves = haciaValle.paradas.map((p) => p.clave);
  assert.equal(claves.filter((c) => c === clave('Chacra Los Barreto 23')).length, 1);
  assert.equal(haciaValle.paradas.at(-1).nombre, 'Camino Del Valle 2700');
});

test('combina dos ramales en una parada compartida y ubica las paradas propias', () => {
  const catalogo = {
    linea: { id: 'x', nombre: 'X' },
    ramales: [
      { id: 'r1', nombre: 'Uno', sentidos: [{ id: 'ida', nombre: 'Ida', archivo: 'a' }] },
      { id: 'r2', nombre: 'Dos', sentidos: [{ id: 'ida', nombre: 'Ida', archivo: 'b' }] },
    ],
  };
  const textos = new Map([
    ['a', 'Horarios de la semana\nEspaña, 2152\nCentro\n14:19 14:40'],
    ['b', 'Horarios de la semana\nEspaña 2152\nHospital\nCentro\n14:25 14:35 14:50'],
  ]);
  const modelo = construirModelo(catalogo, textos);
  const ida = modelo.sentidos[0];
  assert.equal(modelo.variosRamales, true);
  assert.deepEqual(ida.paradas.map((p) => p.nombre), ['España, 2152', 'Hospital', 'Centro']);
  assert.deepEqual(ida.pasadas.semana.get(clave('España, 2152')), [
    { minuto: 14 * 60 + 19, ramal: 'r1' },
    { minuto: 14 * 60 + 25, ramal: 'r2' },
  ]);
});
