// Búsqueda de paradas por nombre.

import { normalizar } from './parser.js';

/**
 * Paradas cuyo nombre normalizado contiene todas las palabras de la consulta.
 * Agrupa por nombre y conserva el orden del recorrido: primero las del primer sentido, después las que solo están en otros.
 * @returns {[{ clave, nombre, sentidos: string[] }]}
 */
export function buscarParadas(modelo, consulta) {
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (palabras.length === 0) return [];

  const resultados = new Map();
  for (const sentido of modelo.sentidos) {
    for (const parada of sentido.paradas) {
      if (!palabras.every((palabra) => parada.clave.includes(palabra))) continue;
      if (!resultados.has(parada.clave)) resultados.set(parada.clave, { clave: parada.clave, nombre: parada.nombre, sentidos: [] });
      resultados.get(parada.clave).sentidos.push(sentido.id);
    }
  }
  return [...resultados.values()];
}
