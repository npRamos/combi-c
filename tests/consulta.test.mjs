import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proximasPasadas, pasadasDelDia, textoFaltan } from '../js/consulta.js';
import { aTexto } from '../js/parser.js';
import { guardarFavorita, leerFavorita, esFavorita } from '../js/favorita.js';
import { modeloReal, feriadosReales, sentido, clave, momento } from './ayuda.mjs';

const modelo = modeloReal();
const feriados = feriadosReales();
const haciaCentro = sentido(modelo, 'hacia-centro');
const haciaValle = sentido(modelo, 'hacia-valle');
const espana = clave('España, 2152');

const horarios = (resultado) => resultado.pasadas.map((p) => aTexto(p.minuto));

// Fechas de referencia: lunes 19/10/2026, sábado 17/10/2026, domingo 18/10/2026.

test('lunes 14:12 en España hacia el centro → 14:19 (7 min), 14:34, 14:49', () => {
  const r = proximasPasadas(haciaCentro, espana, momento('2026-10-19', '14:12'), feriados);
  assert.equal(r.manana, false);
  assert.deepEqual(horarios(r), ['14:19', '14:34', '14:49']);
  assert.equal(r.pasadas[0].faltan, 7);
});

test('una pasada en el minuto actual es la próxima, "ahora"', () => {
  const r = proximasPasadas(haciaCentro, espana, momento('2026-10-19', '14:19'), feriados);
  assert.equal(aTexto(r.pasadas[0].minuto), '14:19');
  assert.equal(textoFaltan(r.pasadas[0].faltan), 'ahora');
});

test('domingo 10:00 → 10:19, 11:04, 11:49', () => {
  const r = proximasPasadas(haciaCentro, espana, momento('2026-10-18', '10:00'), feriados);
  assert.deepEqual(horarios(r), ['10:19', '11:04', '11:49']);
});

test('lunes 23:10 → mañana 5:04', () => {
  const r = proximasPasadas(haciaCentro, espana, momento('2026-10-19', '23:10'), feriados);
  assert.equal(r.manana, true);
  assert.deepEqual(horarios(r), ['5:04']);
});

test('sábado 23:30 → mañana (domingo) 5:04', () => {
  const r = proximasPasadas(haciaCentro, espana, momento('2026-10-17', '23:30'), feriados);
  assert.equal(r.manana, true);
  assert.deepEqual(horarios(r), ['5:04']);
});

test('con menos de dos siguientes muestra solo las que quedan', () => {
  const r = proximasPasadas(haciaCentro, espana, momento('2026-10-19', '22:50'), feriados);
  assert.deepEqual(horarios(r), ['23:03']);
});

test('vista hacia el Valle, lunes 17:52', () => {
  const ahora = momento('2026-10-19', '17:52');
  const proxima = (nombre) => aTexto(proximasPasadas(haciaValle, clave(nombre), ahora, feriados).pasadas[0].minuto);
  assert.equal(proxima('Av. Prefectura Naval Argentina Y Calle 12 De Octubre'), '18:00');
  assert.equal(proxima('Avenida Maipú, 215'), '18:04');
});

test('detalle de España hacia el centro: sábado y domingo', () => {
  const sabado = pasadasDelDia(haciaCentro, espana, 'sabado').slice(0, 6).map((p) => aTexto(p.minuto));
  assert.deepEqual(sabado, ['5:04', '5:34', '6:04', '6:34', '7:05', '7:35']);
  const domingo = pasadasDelDia(haciaCentro, espana, 'domingo').slice(0, 4).map((p) => aTexto(p.minuto));
  assert.deepEqual(domingo, ['5:04', '5:49', '6:34', '7:20']);
});

test('España hacia el centro un día hábil: 5:04 a 23:03, con minutos fijos por franja', () => {
  const dia = pasadasDelDia(haciaCentro, espana, 'semana').map((p) => p.minuto);
  assert.equal(aTexto(dia[0]), '5:04');
  assert.equal(aTexto(dia.at(-1)), '23:03');
  const minutosEntre = (desde, hasta) =>
    [...new Set(dia.filter((m) => m >= desde * 60 && m < hasta * 60).map((m) => m % 60))].sort((a, b) => a - b);
  assert.deepEqual(minutosEntre(7, 10), [5, 20, 35, 50]);
  assert.deepEqual(minutosEntre(10, 15), [4, 19, 34, 49]);
});

test('la última salida del domingo hacia el Valle es a las 22:15', () => {
  const salidas = pasadasDelDia(haciaValle, clave('Av. Prefectura Naval Argentina Y Calle 12 De Octubre'), 'domingo');
  assert.equal(aTexto(salidas.at(-1).minuto), '22:15');
});

test('la fila corregida de lunes a viernes de las 22:45 llega a Camino del Valle 23:03', () => {
  const llegadas = pasadasDelDia(haciaValle, clave('Camino Del Valle 2700'), 'semana');
  assert.equal(aTexto(llegadas.at(-1).minuto), '23:03');
});

test('textos de minutos restantes', () => {
  assert.equal(textoFaltan(0), 'ahora');
  assert.equal(textoFaltan(7), 'en 7 min');
  assert.equal(textoFaltan(65), 'en 1 h 05 min');
});

test('favorita sin almacenamiento disponible queda en memoria', () => {
  guardarFavorita({ sentido: 'hacia-centro', parada: espana });
  assert.deepEqual(leerFavorita(), { sentido: 'hacia-centro', parada: espana });
  assert.equal(esFavorita('hacia-centro', espana), true);
  guardarFavorita(null);
  assert.equal(leerFavorita(), null);
});
