import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarParadas } from '../js/busqueda.js';
import { construirModelo, paradasUbicadas } from '../js/modelo.js';
import { modeloReal, sentido, clave, leer } from './ayuda.mjs';

const modelo = modeloReal();
const nombres = (consulta) => buscarParadas(modelo, consulta).map((r) => r.nombre);

test('buscar parte del nombre: "espa"', () => {
  const [espana] = buscarParadas(modelo, 'espa');
  assert.equal(espana.nombre, 'España, 2152');
  assert.deepEqual(espana.sentidos, ['hacia-centro', 'hacia-valle']);
});

test('sin tildes ni mayúsculas: "heroes malvinas"', () => {
  const r = nombres('heroes malvinas');
  assert.ok(r.includes('Av. Héroes De Malvinas Y Av. Leandro N. Alem'));
  assert.ok(r.includes('Heroes De Malvinas, 1440'));
});

test('varias palabras: "yaganes 408"', () => {
  assert.deepEqual(nombres('yaganes 408'), ['Yaganes, 408']);
});

test('sin resultados y consulta vacía', () => {
  assert.deepEqual(nombres('aeropuerto'), []);
  assert.deepEqual(nombres('   '), []);
});

test('orden del recorrido: primero hacia el centro, después las que solo están hacia el Valle', () => {
  const r = nombres('maipu');
  assert.equal(r[0], 'Av. Maipú Y Calle Yaganes');
  assert.equal(r.at(-1), 'Avenida Maipú, 215');
});

test('ubicaciones reales: España ubicada en los dos sentidos', () => {
  const espana = clave('España, 2152');
  for (const id of ['hacia-centro', 'hacia-valle']) {
    const { ubicacion } = sentido(modelo, id).paradas.find((p) => p.clave === espana);
    assert.ok(ubicacion && ubicacion.lat < -54.7 && ubicacion.lon < -68.2, id);
  }
  assert.ok(modelo.recorrido.length > 100);
});

test('ubicaciones reales: una parada sin punto queda con ubicacion null', () => {
  const gendarme = sentido(modelo, 'hacia-centro').paradas.find((p) => p.clave === clave('Gendarme Argentino, 1269'));
  assert.equal(gendarme.ubicacion, null);
  const total = JSON.parse(leer('data/c/ubicaciones.json')).paradas.length;
  assert.equal(paradasUbicadas(modelo).length, total);
});

test('una ubicación sin parada en los horarios se ignora y avisa', () => {
  const avisos = [];
  const m = construirModelo(
    { linea: { id: 'x' }, ramales: [{ id: 'r', sentidos: [{ id: 'ida', nombre: 'Ida', archivo: 'a' }] }] },
    new Map([['a', 'Horarios de la semana\nChacra Los Barreto, 23\n5:00']]),
    {
      avisar: (m) => avisos.push(m),
      ubicaciones: {
        recorrido: [],
        paradas: [
          { sentido: 'ida', parada: 'Chacra Los Barreto 23', lat: -54.77, lon: -68.27 },
          { sentido: 'ida', parada: 'No existe', lat: 0, lon: 0 },
          { sentido: 'vuelta', parada: 'Chacra Los Barreto, 23', lat: 0, lon: 0 },
        ],
      },
    },
  );
  assert.deepEqual(m.sentidos[0].paradas[0].ubicacion, { lat: -54.77, lon: -68.27 });
  assert.equal(avisos.length, 2);
});

test('sin archivo de ubicaciones todo sigue funcionando', () => {
  const m = construirModelo(
    { linea: { id: 'x' }, ramales: [{ id: 'r', sentidos: [{ id: 'ida', nombre: 'Ida', archivo: 'a' }] }] },
    new Map([['a', 'Horarios de la semana\nA\n5:00']]),
  );
  assert.equal(m.sentidos[0].paradas[0].ubicacion, null);
  assert.deepEqual(m.recorrido, []);
});
