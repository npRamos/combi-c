// Cuándo pasa la próxima combi por una parada.

import { diaSiguiente, tipoDeDia } from './tiempo.js';

export function pasadasDelDia(sentido, clave, tipo) {
  return sentido.pasadas[tipo]?.get(clave) ?? [];
}

/**
 * Próxima pasada y hasta `cantidad - 1` siguientes, del día actual.
 * Si ya no quedan, la primera del día siguiente (con `manana: true`).
 * @returns {{ manana: boolean, pasadas: [{ minuto, ramal, faltan }] }}
 */
export function proximasPasadas(sentido, clave, momento, feriados, cantidad = 3) {
  const hoy = pasadasDelDia(sentido, clave, tipoDeDia(momento, feriados));
  const restantes = hoy.filter((pasada) => pasada.minuto >= momento.minuto).slice(0, cantidad);
  if (restantes.length > 0) {
    return {
      manana: false,
      pasadas: restantes.map((pasada) => ({ ...pasada, faltan: pasada.minuto - momento.minuto })),
    };
  }

  const manana = diaSiguiente(momento);
  const primera = pasadasDelDia(sentido, clave, tipoDeDia(manana, feriados))[0];
  return {
    manana: true,
    pasadas: primera ? [{ ...primera, faltan: primera.minuto + 1440 - momento.minuto }] : [],
  };
}

/** "ahora", "en 7 min", "en 1 h 05 min". */
export function textoFaltan(minutos) {
  if (minutos <= 0) return 'ahora';
  if (minutos < 60) return `en ${minutos} min`;
  return `en ${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}
