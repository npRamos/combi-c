// Asigna los nombres de nuestras paradas (horarios de Moovit) a las paradas de la Línea C de Mi Bondi,
// que tienen coordenadas pero no nombre. Genera data/c/ubicaciones.json y herramientas/informe-emparejamiento.md.
//
// Uso: node herramientas/emparejar-mibondi.mjs
//
// Método:
// 1. Se proyecta cada parada de Mi Bondi sobre el recorrido (metros desde el inicio del circuito, en el Valle).
// 2. El circuito se corta en su punto más al sudoeste (12 de Octubre): antes es "hacia-centro", después "hacia-valle".
// 3. La posición esperada de cada parada nuestra sale del tiempo de viaje de la salida de las 12:00 (lunes a viernes).
// 4. Control geográfico: cada punto tiene que estar sobre la calle que nombra la parada (o sobre las dos, si es una esquina),
//    según la geometría de calles de OpenStreetMap (herramientas/osm/calles.json).
// 5. Se alinean ambas listas en orden con programación dinámica y se aplican las correcciones manuales.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizar, parsearHorarios } from '../js/parser.js';
import { proyectarEnRecorrido, largoRecorrido, distanciaMetros } from '../js/geo.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const leerJSON = (ruta) => JSON.parse(readFileSync(raiz + ruta, 'utf8'));

const LINEA_MIBONDI = 720;
const SALIDA_REFERENCIA = 12 * 60;
const MAX_DISTANCIA_AL_RECORRIDO = 100; // m: más lejos, la parada es de otra variante
const TOLERANCIA_CALLE = 35; // m: distancia a la calle que se considera "sobre la calle"
const PESO_POSICION = 0.3; // costo por metro de diferencia con la posición esperada
const PESO_CALLE = 1; // costo por metro fuera de la calle
const SALTEAR_NUESTRA = 400; // costo de dejar una parada nuestra sin punto
const SALTEAR_MIBONDI = 250; // costo de no usar una parada de Mi Bondi
const ALERTA_CALLE = 60; // m: en el informe, marcar con ⚠ si el punto queda más lejos de su calle

const catalogo = leerJSON('data/catalogo.json');
const correcciones = leerJSON('herramientas/correcciones.json');

// ── Mi Bondi ────────────────────────────────────────────────────────────────
const lineaC = leerJSON('herramientas/mibondi/lineas.json').data.find((linea) => linea.id === LINEA_MIBONDI);
const recorrido = lineaC.coordinates.map((c) => [c.latitude, c.longitude]);
const largo = largoRecorrido(recorrido);

let indiceCorte = 0;
recorrido.forEach(([lat, lon], i) => {
  const [latC, lonC] = recorrido[indiceCorte];
  if (lat + lon * 0.58 < latC + lonC * 0.58) indiceCorte = i; // 0.58 ≈ cos(54.8°): pondera la longitud en metros
});
const metrosCorte = largoRecorrido(recorrido.slice(0, indiceCorte + 1));

const paradasMiBondi = leerJSON('herramientas/mibondi/paradas.json')
  .data.filter((p) => p.lineas.includes(LINEA_MIBONDI))
  .filter((p) => p.coordinate.latitude < 0 && p.coordinate.longitude < 0) // hay coordenadas con el signo cambiado
  .map((p) => {
    const punto = { lat: p.coordinate.latitude, lon: p.coordinate.longitude };
    return { id: `${p.id}/${p.numero}`, ...punto, ...proyectarEnRecorrido(punto, recorrido) };
  });
const descartadasLejos = paradasMiBondi.filter((p) => p.distancia > MAX_DISTANCIA_AL_RECORRIDO);
const utilizables = paradasMiBondi.filter((p) => p.distancia <= MAX_DISTANCIA_AL_RECORRIDO).sort((a, b) => a.metros - b.metros);

const tramos = {
  'hacia-centro': { desde: 0, hasta: metrosCorte },
  'hacia-valle': { desde: metrosCorte, hasta: largo },
};

// ── Calles de OpenStreetMap ─────────────────────────────────────────────────
const VACIAS = new Set(['av', 'avenida', 'calle', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'gral', 'general', 'soldado', 'ara', 'alferez', 'perito', 'pasaje']);
const fichas = (texto) => normalizar(texto.replace(/\(.*?\)/g, ' ')).split(' ').filter((f) => (f.length > 1 || /^\d$/.test(f)) && !VACIAS.has(f));

function distanciaEdicion(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const actual = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = actual;
    }
  }
  return fila[b.length];
}
const fichasParecidas = (a, b) => a === b || (a.length >= 6 && b.length >= 6 && distanciaEdicion(a, b) <= 1) || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b));

const viasPorNombre = new Map();
for (const via of leerJSON('herramientas/osm/calles.json').elements) {
  if (!via.geometry) continue;
  const nombre = via.tags.name;
  if (!viasPorNombre.has(nombre)) viasPorNombre.set(nombre, []);
  viasPorNombre.get(nombre).push(via.geometry.map((g) => [g.lat, g.lon]));
}

/** Nombre de OSM que mejor corresponde a una calle nuestra, o null. */
function resolverCalle(calle) {
  if (correcciones.calles?.[calle] !== undefined) return correcciones.calles[calle];
  const nuestras = fichas(calle);
  if (nuestras.length === 0) return null;
  let mejor = null;
  for (const nombre of viasPorNombre.keys()) {
    const suyas = fichas(nombre);
    if (suyas.length === 0) continue;
    const coinciden = nuestras.filter((f) => suyas.some((s) => fichasParecidas(f, s))).length;
    const sobran = suyas.filter((s) => !nuestras.some((f) => fichasParecidas(f, s))).length;
    if (coinciden === 0 || coinciden < Math.ceil(nuestras.length / 2)) continue;
    const puntaje = coinciden * 10 - sobran;
    if (!mejor || puntaje > mejor.puntaje) mejor = { nombre, puntaje };
  }
  return mejor?.nombre ?? null;
}

/** Calles que nombra una parada: "A Y B" → [A, B]; "A E/ B Y C" → [A]; "A, 123" → [A]. */
function callesDeParada(nombre) {
  const limpio = nombre.replace(/\(.*?\)/g, ' ');
  const [principal] = limpio.split(/\s+E\/\s+/i);
  const partes = principal.split(/\s+Y\s+/i).map((parte) => parte.replace(/[, ]*\d+\s*$/, '').trim());
  return partes.filter((parte) => fichas(parte).length > 0);
}

function distanciaACalle(punto, nombreOSM) {
  let minima = Infinity;
  for (const geometria of viasPorNombre.get(nombreOSM) ?? []) {
    minima = Math.min(minima, geometria.length > 1 ? proyectarEnRecorrido(punto, geometria).distancia : Infinity);
  }
  return minima;
}

// ── Nuestras paradas ────────────────────────────────────────────────────────
function paradasDelSentido(archivo) {
  const [semana] = parsearHorarios(readFileSync(raiz + archivo, 'utf8'), { avisar: () => {} }).filter((s) => s.tipo === 'semana');
  const salida = semana.salidas.find((fila) => fila[0] === SALIDA_REFERENCIA);
  const vistas = new Set();
  const lista = [];
  semana.paradas.forEach((nombre, i) => {
    const clave = normalizar(nombre);
    if (vistas.has(clave)) return;
    vistas.add(clave);
    const calles = callesDeParada(nombre).map((calle) => ({ calle, osm: resolverCalle(calle) }));
    lista.push({ nombre, clave, minuto: salida[i] - salida[0], calles });
  });
  const total = lista.at(-1).minuto || 1;
  for (const parada of lista) parada.fraccion = parada.minuto / total;
  return lista;
}

// ── Alineación ──────────────────────────────────────────────────────────────
function alinear(nuestras, candidatas, tramo) {
  const largoTramo = tramo.hasta - tramo.desde;
  const costoPar = (parada, mb) => {
    const esperado = tramo.desde + parada.fraccion * largoTramo;
    const posicion = Math.abs(mb.metros - esperado) * PESO_POSICION;
    const resueltas = parada.calles.filter((c) => c.osm);
    const distCalle = resueltas.length ? Math.max(...resueltas.map((c) => distanciaACalle(mb, c.osm))) : null;
    const calle = distCalle === null ? 0 : Math.max(0, distCalle - TOLERANCIA_CALLE) * PESO_CALLE;
    return { costo: posicion + calle, esperado, distCalle };
  };

  const n = nuestras.length;
  const m = candidatas.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const paso = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 par, 2 saltea nuestra, 3 saltea Mi Bondi
  for (let i = 1; i <= n; i++) { dp[i][0] = dp[i - 1][0] + SALTEAR_NUESTRA; paso[i][0] = 2; }
  for (let j = 1; j <= m; j++) { dp[0][j] = dp[0][j - 1] + SALTEAR_MIBONDI; paso[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const opciones = [
        [dp[i - 1][j - 1] + costoPar(nuestras[i - 1], candidatas[j - 1]).costo, 1],
        [dp[i - 1][j] + SALTEAR_NUESTRA, 2],
        [dp[i][j - 1] + SALTEAR_MIBONDI, 3],
      ];
      const [costo, desde] = opciones.reduce((a, b) => (b[0] < a[0] ? b : a));
      dp[i][j] = costo;
      paso[i][j] = desde;
    }
  }

  const pares = new Map();
  const sobrantes = [];
  for (let i = n, j = m; i > 0 || j > 0; ) {
    if (paso[i][j] === 1) { pares.set(nuestras[i - 1].clave, { mb: candidatas[j - 1], ...costoPar(nuestras[i - 1], candidatas[j - 1]) }); i--; j--; }
    else if (paso[i][j] === 2) i--;
    else { sobrantes.unshift(candidatas[j - 1]); j--; }
  }
  return { pares, sobrantes };
}

// ── Ejecución ───────────────────────────────────────────────────────────────
const linea = catalogo.ramales[0];
const resultado = [];
const informe = [
  '# Informe de emparejamiento Moovit ↔ Mi Bondi (Línea C)',
  '',
  `Generado por \`herramientas/emparejar-mibondi.mjs\`. Recorrido de ${Math.round(largo)} m; corte entre sentidos a los ${Math.round(metrosCorte)} m.`,
  `Paradas de Mi Bondi de la línea ${LINEA_MIBONDI}: ${paradasMiBondi.length}; descartadas por estar a más de ${MAX_DISTANCIA_AL_RECORRIDO} m del recorrido: ${descartadasLejos.map((p) => `#${p.id} (${Math.round(p.distancia)} m)`).join(', ') || 'ninguna'}.`,
  '',
  `"Dist. calle" es la distancia del punto a la calle (o a la más lejana de las dos, en una esquina) según OpenStreetMap. ⚠ = más de ${ALERTA_CALLE} m o calle no encontrada. ✎ = corrección manual.`,
];

const porClave = new Map(paradasMiBondi.map((p) => [p.id, p]));

for (const sentido of linea.sentidos) {
  const nuestras = paradasDelSentido(sentido.archivo);
  const tramo = tramos[sentido.id];
  const candidatas = utilizables.filter((p) => p.metros >= tramo.desde && p.metros < tramo.hasta);
  const { pares, sobrantes } = alinear(nuestras, candidatas, tramo);

  informe.push('', `## ${sentido.nombre} (${nuestras.length} paradas nuestras, ${candidatas.length} de Mi Bondi)`, '');
  informe.push('| # | Parada | Mi Bondi | Posición esperada → real (m) | Dist. calle | Calles OSM | |', '|---|---|---|---|---|---|---|');
  nuestras.forEach((parada, i) => {
    const claveCorreccion = `${sentido.id}|${parada.nombre}`;
    let par = pares.get(parada.clave);
    let manual = false;
    if (claveCorreccion in (correcciones.asignaciones ?? {})) {
      manual = true;
      const id = correcciones.asignaciones[claveCorreccion];
      const mb = id === null ? null : porClave.get(id);
      if (id !== null && !mb) throw new Error(`Corrección con parada inexistente: ${claveCorreccion} → ${id}`);
      par = mb ? { mb, esperado: tramo.desde + parada.fraccion * (tramo.hasta - tramo.desde), distCalle: Math.max(...parada.calles.filter((c) => c.osm).map((c) => distanciaACalle(mb, c.osm)), -Infinity) } : null;
      if (par && par.distCalle === -Infinity) par.distCalle = null;
    }
    const calles = parada.calles.map((c) => (c.osm ? c.osm : `¿${c.calle}?`)).join(' / ') || '—';
    const alerta = par && (par.distCalle === null || par.distCalle > ALERTA_CALLE) ? '⚠' : '';
    informe.push(
      par
        ? `| ${i + 1} | ${parada.nombre} | #${par.mb.id} | ${Math.round(par.esperado)} → ${Math.round(par.mb.metros)} | ${par.distCalle === null ? '—' : Math.round(par.distCalle) + ' m'} | ${calles} | ${alerta}${manual ? '✎' : ''} |`
        : `| ${i + 1} | ${parada.nombre} | sin punto | | | ${calles} | ${manual ? '✎' : ''} |`,
    );
    if (par) {
      resultado.push({
        sentido: sentido.id,
        parada: parada.nombre,
        lat: Number(par.mb.lat.toFixed(5)),
        lon: Number(par.mb.lon.toFixed(5)),
        mibondi: par.mb.id,
      });
    }
  });
  const usadas = new Set(resultado.filter((r) => r.sentido === sentido.id).map((r) => r.mibondi));
  const libres = candidatas.filter((p) => !usadas.has(p.id));
  informe.push('', `Paradas de Mi Bondi sin asignar en este tramo: ${libres.map((p) => `#${p.id} (${Math.round(p.metros)} m)`).join(', ') || 'ninguna'}.`);
  void sobrantes;
}

// Control cruzado: una parada con el mismo nombre en los dos sentidos suele estar frente a frente.
const ALERTA_CRUCE = 80;
const porNombre = new Map();
for (const r of resultado) {
  const clave = normalizar(r.parada);
  if (!porNombre.has(clave)) porNombre.set(clave, []);
  porNombre.get(clave).push(r);
}
informe.push('', '## Control cruzado entre sentidos', '', `Paradas con el mismo nombre en los dos sentidos: distancia entre sus puntos. ⚠ = más de ${ALERTA_CRUCE} m.`, '');
informe.push('| Parada | Hacia el centro | Hacia el Valle | Distancia | |', '|---|---|---|---|---|');
for (const [, lista] of porNombre) {
  if (lista.length < 2) continue;
  const [a, b] = lista;
  const distancia = distanciaMetros(a, b);
  informe.push(`| ${a.parada} | #${a.mibondi} | #${b.mibondi} | ${Math.round(distancia)} m | ${distancia > ALERTA_CRUCE ? '⚠' : ''} |`);
}

const salida = {
  fuente: `Mi Bondi, Municipalidad de Ushuaia (https://uise.com.ar/ushuaia-integral/api/v1), línea ${LINEA_MIBONDI}`,
  obtenido: correcciones.obtenido,
  recorrido: recorrido.map(([lat, lon]) => [Number(lat.toFixed(5)), Number(lon.toFixed(5))]),
  paradas: resultado,
};
writeFileSync(raiz + 'data/c/ubicaciones.json', JSON.stringify(salida, null, 1).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, '[$1, $2]') + '\n');
writeFileSync(raiz + 'herramientas/informe-emparejamiento.md', informe.join('\n') + '\n');
console.log(`Ubicadas ${resultado.length} paradas. Informe en herramientas/informe-emparejamiento.md`);
