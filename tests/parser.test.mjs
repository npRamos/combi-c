import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearHorarios, normalizar, aMinutos, aTexto } from '../js/parser.js';

const avisos = () => {
  const lista = [];
  return { lista, avisar: (mensaje) => lista.push(mensaje) };
};

test('interpreta una sección completa', () => {
  const texto = ['Horarios de sábado', 'Parada A', 'Yaganes, 248', '5:00\t5:03', '5:30    5:33'].join('\n');
  const [seccion] = parsearHorarios(texto, { avisar: () => {} });
  assert.equal(seccion.tipo, 'sabado');
  assert.deepEqual(seccion.paradas, ['Parada A', 'Yaganes, 248']);
  assert.deepEqual(seccion.salidas, [[300, 303], [330, 333]]);
});

test('ignora comentarios y líneas vacías', () => {
  const con = '# comentario\n\nHorarios de la semana\n# otro\nA\n\nB\n5:00 5:01\n';
  const sin = 'Horarios de la semana\nA\nB\n5:00 5:01';
  assert.deepEqual(parsearHorarios(con), parsearHorarios(sin));
});

test('reconoce las tres secciones', () => {
  const texto = 'Horarios de la semana\nA\n5:00\nHorarios de sábado\nA\n6:00\nHorarios de domingo\nA\n7:00';
  assert.deepEqual(parsearHorarios(texto).map((s) => s.tipo), ['semana', 'sabado', 'domingo']);
});

test('los nombres de parada con números no se confunden con horarios', () => {
  const [seccion] = parsearHorarios('Horarios de la semana\nYaganes, 248\nCamino Del Valle 2700\n5:00 5:01');
  assert.deepEqual(seccion.paradas, ['Yaganes, 248', 'Camino Del Valle 2700']);
});

test('acepta una fila cortada y avisa', () => {
  const { lista, avisar } = avisos();
  const [seccion] = parsearHorarios('Horarios de la semana\nA\nB\nC\n22:45 22:46', { avisar });
  assert.deepEqual(seccion.salidas, [[1365, 1366]]);
  assert.equal(lista.length, 1);
  assert.match(lista[0], /cortada/);
});

test('descarta una fila con más horarios que paradas y avisa', () => {
  const { lista, avisar } = avisos();
  const [seccion] = parsearHorarios('Horarios de la semana\nA\nB\n5:00 5:01 5:02', { avisar });
  assert.deepEqual(seccion.salidas, []);
  assert.equal(lista.length, 1);
});

test('descarta horarios inválidos', () => {
  const { lista, avisar } = avisos();
  const [seccion] = parsearHorarios('Horarios de la semana\nA\nB\n5:00 5:75', { avisar });
  assert.deepEqual(seccion.salidas, []);
  assert.equal(lista.length, 1);
});

test('una fila que cruza la medianoche sigue sumando minutos', () => {
  const [seccion] = parsearHorarios('Horarios de la semana\nA\nB\n23:58 0:03');
  assert.deepEqual(seccion.salidas, [[1438, 1443]]);
  assert.equal(aTexto(1443), '0:03');
});

test('normaliza nombres de parada', () => {
  assert.equal(normalizar('Chacra Los Barreto, 23'), normalizar('Chacra Los Barreto 23'));
  assert.equal(normalizar('España, 2152'), 'espana 2152');
  assert.equal(normalizar('Bahía  Paraiso'), normalizar('Bahia Paraíso'));
});

test('convierte horarios', () => {
  assert.equal(aMinutos('7:05'), 425);
  assert.equal(aMinutos('07:05'), 425);
  assert.equal(aMinutos('7:5'), null);
  assert.equal(aTexto(425), '7:05');
});
