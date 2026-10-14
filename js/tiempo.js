// Fecha y hora en Ushuaia, sin importar la zona horaria configurada en el celular.

export const ZONA = 'America/Argentina/Ushuaia';

const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** @returns {{ fecha: 'AAAA-MM-DD', diaSemana: 0..6 (0 = domingo), minuto: minutos desde medianoche }} */
export function momentoEnUshuaia(instante = new Date()) {
  const partes = Object.fromEntries(formato.formatToParts(instante).map(({ type, value }) => [type, value]));
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    diaSemana: DIAS[partes.weekday],
    minuto: (Number(partes.hour) % 24) * 60 + Number(partes.minute),
  };
}

/** Tipo de horario de una fecha: los feriados usan el de domingo. */
export function tipoDeDia({ fecha, diaSemana }, feriados = new Set()) {
  if (feriados.has(fecha) || diaSemana === 0) return 'domingo';
  if (diaSemana === 6) return 'sabado';
  return 'semana';
}

/** El día siguiente a `momento`, a las 0:00. */
export function diaSiguiente({ fecha, diaSemana }) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const manana = new Date(Date.UTC(anio, mes - 1, dia + 1));
  return {
    fecha: manana.toISOString().slice(0, 10),
    diaSemana: (diaSemana + 1) % 7,
    minuto: 0,
  };
}

export function conjuntoDeFeriados(datos) {
  return new Set((datos?.feriados ?? []).map((feriado) => feriado.fecha));
}
