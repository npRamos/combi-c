import { test } from 'node:test';
import assert from 'node:assert/strict';
import { momentoEnUshuaia, tipoDeDia, diaSiguiente } from '../js/tiempo.js';
import { feriadosReales, momento } from './ayuda.mjs';

const feriados = feriadosReales();

test('día hábil, sábado y domingo', () => {
  assert.equal(tipoDeDia(momento('2026-10-13', '9:00'), feriados), 'semana'); // martes
  assert.equal(tipoDeDia(momento('2026-10-17', '9:00'), feriados), 'sabado');
  assert.equal(tipoDeDia(momento('2026-10-18', '9:00'), feriados), 'domingo');
});

test('un feriado en lunes usa el horario de domingo', () => {
  assert.equal(tipoDeDia(momento('2026-10-12', '9:00'), feriados), 'domingo');
  assert.equal(tipoDeDia(momento('2026-10-19', '9:00'), feriados), 'semana');
});

test('usa la hora de Ushuaia aunque en UTC ya sea otro día', () => {
  // 00:30 UTC del sábado 17/10 = 21:30 del viernes 16/10 en Ushuaia (UTC-3).
  const ahora = momentoEnUshuaia(new Date('2026-10-17T00:30:00Z'));
  assert.deepEqual(ahora, { fecha: '2026-10-16', diaSemana: 5, minuto: 21 * 60 + 30 });
  assert.equal(tipoDeDia(ahora, feriados), 'semana');
});

test('medianoche en Ushuaia', () => {
  assert.deepEqual(momentoEnUshuaia(new Date('2026-10-14T03:00:00Z')), { fecha: '2026-10-14', diaSemana: 3, minuto: 0 });
});

test('día siguiente, incluido el cambio de mes y de año', () => {
  assert.deepEqual(diaSiguiente(momento('2026-10-17', '23:30')), { fecha: '2026-10-18', diaSemana: 0, minuto: 0 });
  assert.deepEqual(diaSiguiente(momento('2026-12-31', '23:30')), { fecha: '2027-01-01', diaSemana: 5, minuto: 0 });
});
