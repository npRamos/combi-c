import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { construirModelo, buscarSentido } from '../js/modelo.js';
import { conjuntoDeFeriados } from '../js/tiempo.js';
import { normalizar } from '../js/parser.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
export const leer = (ruta) => readFileSync(raiz + ruta, 'utf8');

export function modeloReal() {
  const catalogo = JSON.parse(leer('data/catalogo.json'));
  const textos = new Map();
  for (const ramal of catalogo.ramales) {
    for (const sentido of ramal.sentidos) textos.set(sentido.archivo, leer(sentido.archivo));
  }
  const ubicaciones = catalogo.linea.ubicaciones ? JSON.parse(leer(catalogo.linea.ubicaciones)) : null;
  return construirModelo(catalogo, textos, { avisar: () => {}, ubicaciones });
}

export const feriadosReales = () => conjuntoDeFeriados(JSON.parse(leer('data/feriados.json')));
export const sentido = (modelo, id) => buscarSentido(modelo, id);
export const clave = normalizar;

/** Momento en Ushuaia a partir de "AAAA-MM-DD" y "H:MM". */
export function momento(fecha, hora) {
  const [h, m] = hora.split(':').map(Number);
  const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return { fecha, diaSemana, minuto: h * 60 + m };
}
