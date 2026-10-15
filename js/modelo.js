// Arma, a partir del catálogo y los archivos de horarios, las paradas y pasadas de cada sentido.

import { normalizar, parsearHorarios } from './parser.js';

export const TIPOS_DE_DIA = ['semana', 'sabado', 'domingo'];

/**
 * Agrega a `orden` (lista de claves) las claves de `secuencia` que falten, cada una después de
 * la última clave común que la precede en `secuencia`.
 */
function fusionarOrden(orden, secuencia) {
  let posicion = -1;
  for (const clave of secuencia) {
    const existente = orden.indexOf(clave);
    if (existente >= 0) {
      posicion = existente;
    } else {
      orden.splice(posicion + 1, 0, clave);
      posicion += 1;
    }
  }
}

/**
 * @param catalogo contenido de data/catalogo.json
 * @param textos   Map ruta de archivo → texto
 * @returns {{ linea, ramales, variosRamales, avisos, sentidos: Sentido[] }}
 *   Sentido = { id, nombre, paradas: [{ clave, nombre }], pasadas: { [tipo]: Map<clave, [{ minuto, ramal }]> } }
 */
export function construirModelo(catalogo, textos, { avisar = console.warn, ubicaciones = null } = {}) {
  const sentidos = new Map();

  for (const ramal of catalogo.ramales) {
    for (const definicion of ramal.sentidos) {
      if (!sentidos.has(definicion.id)) {
        sentidos.set(definicion.id, {
          id: definicion.id,
          nombre: definicion.nombre,
          orden: [],
          nombres: new Map(),
          pasadas: Object.fromEntries(TIPOS_DE_DIA.map((tipo) => [tipo, new Map()])),
        });
      }
      const sentido = sentidos.get(definicion.id);
      const texto = textos.get(definicion.archivo);
      if (texto == null) {
        avisar(`No se encontró el archivo ${definicion.archivo}`);
        continue;
      }

      for (const seccion of parsearHorarios(texto, { origen: definicion.archivo, avisar })) {
        const claves = seccion.paradas.map(normalizar);
        claves.forEach((clave, i) => {
          if (!sentido.nombres.has(clave)) sentido.nombres.set(clave, seccion.paradas[i]);
        });
        fusionarOrden(sentido.orden, claves);

        // Posiciones de cada parada dentro de la secuencia (una parada puede repetirse).
        const posiciones = new Map();
        claves.forEach((clave, i) => {
          if (!posiciones.has(clave)) posiciones.set(clave, []);
          posiciones.get(clave).push(i);
        });

        const porParada = sentido.pasadas[seccion.tipo];
        for (const salida of seccion.salidas) {
          for (const [clave, indices] of posiciones) {
            const primera = indices.find((i) => salida[i] !== undefined);
            if (primera === undefined) continue;
            if (!porParada.has(clave)) porParada.set(clave, []);
            porParada.get(clave).push({ minuto: salida[primera], ramal: ramal.id });
          }
        }
      }
    }
  }

  for (const sentido of sentidos.values()) {
    for (const porParada of Object.values(sentido.pasadas)) {
      for (const lista of porParada.values()) lista.sort((a, b) => a.minuto - b.minuto);
    }
  }

  // Ubicaciones: "sentido|clave" → { lat, lon }.
  const ubicadas = new Map();
  for (const entrada of ubicaciones?.paradas ?? []) {
    const clave = normalizar(entrada.parada);
    if (!sentidos.get(entrada.sentido)?.nombres.has(clave)) {
      avisar(`Ubicación sin parada en los horarios: ${entrada.sentido} · ${entrada.parada}`);
      continue;
    }
    ubicadas.set(`${entrada.sentido}|${clave}`, { lat: entrada.lat, lon: entrada.lon });
  }

  return {
    linea: catalogo.linea,
    ramales: catalogo.ramales.map(({ id, nombre, confirmado }) => ({ id, nombre, confirmado })),
    variosRamales: catalogo.ramales.length > 1,
    avisos: catalogo.avisos ?? [],
    recorrido: ubicaciones?.recorrido ?? [],
    fuenteUbicaciones: ubicaciones?.fuente ?? null,
    sentidos: [...sentidos.values()].map(({ id, nombre, orden, nombres, pasadas }) => ({
      id,
      nombre,
      paradas: orden.map((clave) => ({ clave, nombre: nombres.get(clave), ubicacion: ubicadas.get(`${id}|${clave}`) ?? null })),
      pasadas,
    })),
  };
}

/** Todas las paradas con ubicación, de todos los sentidos: [{ sentido, parada }]. */
export function paradasUbicadas(modelo) {
  return modelo.sentidos.flatMap((sentido) =>
    sentido.paradas.filter((parada) => parada.ubicacion).map((parada) => ({ sentido, parada })),
  );
}

export function buscarSentido(modelo, id) {
  return modelo.sentidos.find((sentido) => sentido.id === id);
}

export function buscarParada(sentido, clave) {
  return sentido?.paradas.find((parada) => parada.clave === clave);
}
