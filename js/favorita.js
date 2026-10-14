// Parada favorita de este dispositivo. Nunca se guarda en el repositorio.

const CLAVE = 'combi.favorita';
let enMemoria = null;

/** @returns {{ sentido: string, parada: string } | null} */
export function leerFavorita() {
  try {
    const guardada = localStorage.getItem(CLAVE);
    if (guardada) return JSON.parse(guardada);
  } catch {
    // Almacenamiento bloqueado o dato corrupto: seguimos con lo que haya en memoria.
  }
  return enMemoria;
}

export function guardarFavorita(favorita) {
  enMemoria = favorita;
  try {
    if (favorita) localStorage.setItem(CLAVE, JSON.stringify(favorita));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento la favorita dura solo esta sesión.
  }
}

export function esFavorita(sentido, parada) {
  const favorita = leerFavorita();
  return favorita?.sentido === sentido && favorita?.parada === parada;
}
