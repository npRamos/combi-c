// Interpreta el texto copiado de la página de horarios de Moovit.

const TIPOS_POR_ENCABEZADO = {
  'horarios de la semana': 'semana',
  'horarios de sabado': 'sabado',
  'horarios de domingo': 'domingo',
};

const HORA = /^(\d{1,2}):(\d{2})$/;

/** Minúsculas, sin tildes ni puntuación y con espacios simples: "España, 2152" → "espana 2152". */
export function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "7:05" → 425. Devuelve null si no es un horario válido. */
export function aMinutos(texto) {
  const coincidencia = HORA.exec(texto);
  if (!coincidencia) return null;
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  if (horas > 29 || minutos > 59) return null;
  return horas * 60 + minutos;
}

/** 425 → "7:05". Los minutos después de medianoche se muestran como hora del día siguiente. */
export function aTexto(minutos) {
  const delDia = ((minutos % 1440) + 1440) % 1440;
  return `${Math.floor(delDia / 60)}:${String(delDia % 60).padStart(2, '0')}`;
}

/**
 * Devuelve las secciones del archivo: [{ tipo, paradas: [nombre], salidas: [[minuto | undefined]] }].
 * Cada salida tiene un horario por parada, en el mismo orden; las filas cortadas quedan más cortas.
 */
export function parsearHorarios(texto, { origen = 'horarios', avisar = console.warn } = {}) {
  const secciones = [];
  let actual = null;

  texto.split(/\r?\n/).forEach((cruda, indice) => {
    const linea = cruda.trim();
    const lugar = `${origen}:${indice + 1}`;
    if (!linea || linea.startsWith('#')) return;

    const tipo = TIPOS_POR_ENCABEZADO[normalizar(linea)];
    if (tipo) {
      actual = { tipo, paradas: [], salidas: [] };
      secciones.push(actual);
      return;
    }
    if (!actual) {
      avisar(`${lugar}: línea fuera de una sección de horarios, se ignora`);
      return;
    }

    const partes = linea.split(/\s+/);
    if (!partes.every((parte) => HORA.test(parte))) {
      actual.paradas.push(linea);
      return;
    }

    const salida = partes.map(aMinutos);
    if (salida.includes(null)) {
      avisar(`${lugar} (${actual.tipo}): fila con horarios inválidos, se descarta`);
      return;
    }
    if (salida.length > actual.paradas.length) {
      avisar(`${lugar} (${actual.tipo}): ${salida.length} horarios para ${actual.paradas.length} paradas, se descarta`);
      return;
    }
    if (salida.length < actual.paradas.length) {
      avisar(`${lugar} (${actual.tipo}): fila cortada, ${salida.length} horarios para ${actual.paradas.length} paradas`);
    }
    // Si la fila cruza la medianoche (23:58 → 0:03), los horarios siguen sumando.
    for (let i = 1; i < salida.length; i++) {
      while (salida[i] < salida[i - 1] - 720) salida[i] += 1440;
    }
    actual.salidas.push(salida);
  });

  return secciones;
}
