// Arranque, navegación por hash y dibujo de las vistas.

import { construirModelo, buscarSentido, buscarParada, TIPOS_DE_DIA } from './modelo.js';
import { momentoEnUshuaia, tipoDeDia, conjuntoDeFeriados } from './tiempo.js';
import { proximasPasadas, pasadasDelDia, textoFaltan } from './consulta.js';
import { aTexto } from './parser.js';
import { leerFavorita, guardarFavorita, esFavorita } from './favorita.js';

const app = document.getElementById('app');
const reloj = document.querySelector('.barra__reloj');
const volver = document.querySelector('.barra__volver');

const NOMBRE_TIPO = { semana: 'Lun–Vie', sabado: 'Sábado', domingo: 'Domingo y feriados' };
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

let modelo;
let feriados = new Set();
let pestana = null; // tipo de día elegido en el detalle de parada

const esc = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enlaceParada = (sentidoId, clave) => `#/parada/${encodeURIComponent(sentidoId)}/${encodeURIComponent(clave)}`;
const nombreRamal = (id) => modelo.ramales.find((ramal) => ramal.id === id)?.nombre ?? id;

async function cargar(ruta, como) {
  const respuesta = await fetch(ruta);
  if (!respuesta.ok) throw new Error(`${ruta}: ${respuesta.status}`);
  return respuesta[como]();
}

async function iniciar() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker:', error));
  }
  try {
    const [catalogo, datosFeriados] = await Promise.all([
      cargar('data/catalogo.json', 'json'),
      cargar('data/feriados.json', 'json').catch((error) => {
        console.warn('Sin feriados:', error);
        return null;
      }),
    ]);
    const archivos = catalogo.ramales.flatMap((ramal) => ramal.sentidos.map((sentido) => sentido.archivo));
    const textos = new Map(await Promise.all(archivos.map(async (archivo) => [archivo, await cargar(archivo, 'text')])));
    modelo = construirModelo(catalogo, textos);
    feriados = conjuntoDeFeriados(datosFeriados);
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <section class="tarjeta tarjeta--error">
        <h2>No se pudieron cargar los horarios</h2>
        <p>Revisá la conexión y volvé a intentar. Después de abrirla una vez con señal, la app funciona sin conexión.</p>
        <button type="button" class="boton" data-accion="recargar">Reintentar</button>
      </section>`;
    app.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-accion="recargar"]')) location.reload();
    });
    return;
  }

  addEventListener('hashchange', () => dibujar({ rutaNueva: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) dibujar();
  });
  app.addEventListener('click', manejarClick);
  dibujar({ rutaNueva: true });
  programarCadaMinuto();
}

function programarCadaMinuto() {
  const hastaElProximoMinuto = 60_000 - (Date.now() % 60_000) + 250;
  setTimeout(() => {
    dibujar();
    programarCadaMinuto();
  }, hastaElProximoMinuto);
}

function rutaActual() {
  const [vista = '', ...resto] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { vista, resto };
}

function dibujar({ rutaNueva = false } = {}) {
  const ahora = momentoEnUshuaia();
  const hoy = tipoDeDia(ahora, feriados);
  reloj.textContent = `${DIA_CORTO[ahora.diaSemana]} ${aTexto(ahora.minuto)}`;
  if (rutaNueva) pestana = null;

  const { vista, resto } = rutaActual();
  let html;
  let padre = '#/';
  if (vista === 'sentido' && buscarSentido(modelo, resto[0])) {
    html = vistaSentido(buscarSentido(modelo, resto[0]), ahora, hoy);
  } else if (vista === 'parada' && buscarParada(buscarSentido(modelo, resto[0]), resto[1])) {
    const sentido = buscarSentido(modelo, resto[0]);
    html = vistaParada(sentido, buscarParada(sentido, resto[1]), ahora, hoy);
    padre = `#/sentido/${encodeURIComponent(sentido.id)}`;
  } else if (vista === 'info') {
    html = vistaInfo();
  } else {
    html = vistaInicio(ahora, hoy);
    padre = null;
  }

  app.innerHTML = html;
  volver.hidden = padre === null;
  if (padre) volver.href = padre;

  if (rutaNueva) {
    const proxima = app.querySelector('.pasada--proxima');
    if (proxima) proxima.scrollIntoView({ block: 'center' });
    else scrollTo(0, 0);
  }
}

function bloqueProxima(resultado) {
  if (resultado.pasadas.length === 0) {
    return `<p class="proxima proxima--sin">Sin servicio</p>`;
  }
  const [primera, ...siguientes] = resultado.pasadas;
  const ramal = modelo.variosRamales ? `<span class="proxima__ramal">${esc(nombreRamal(primera.ramal))}</span>` : '';
  const faltan = resultado.manana ? 'mañana' : textoFaltan(primera.faltan);
  const despues = siguientes.length
    ? `<p class="siguientes">Después: ${siguientes
        .map((p) => aTexto(p.minuto) + (modelo.variosRamales ? ` <small>(${esc(nombreRamal(p.ramal))})</small>` : ''))
        .join(' · ')}</p>`
    : resultado.manana
      ? `<p class="siguientes">Ya no pasa más hoy</p>`
      : `<p class="siguientes">Es la última de hoy</p>`;
  return `
    <p class="proxima${primera.faltan <= 0 ? ' proxima--ahora' : ''}">
      <span class="proxima__hora">${aTexto(primera.minuto)}</span>
      <span class="proxima__faltan">${faltan}</span>
      ${ramal}
    </p>
    ${despues}`;
}

function accesosSentidos() {
  return `
    <nav class="sentidos" aria-label="Sentidos">
      ${modelo.sentidos
        .map(
          (sentido) => `
        <a class="sentido" href="#/sentido/${encodeURIComponent(sentido.id)}">
          <span class="sentido__nombre">${esc(sentido.nombre)}</span>
          <span class="sentido__recorrido">${esc(sentido.paradas[0]?.nombre ?? '')} → ${esc(sentido.paradas.at(-1)?.nombre ?? '')}</span>
        </a>`,
        )
        .join('')}
    </nav>`;
}

function vistaInicio(ahora, hoy) {
  const favorita = leerFavorita();
  const sentido = favorita && buscarSentido(modelo, favorita.sentido);
  const parada = sentido && buscarParada(sentido, favorita.parada);

  const tarjeta = parada
    ? `
      <a class="tarjeta tarjeta--favorita" href="${enlaceParada(sentido.id, parada.clave)}">
        <p class="tarjeta__etiqueta">★ Tu parada · ${esc(sentido.nombre)}</p>
        <h2 class="tarjeta__titulo">${esc(parada.nombre)}</h2>
        ${bloqueProxima(proximasPasadas(sentido, parada.clave, ahora, feriados))}
      </a>`
    : `
      <section class="tarjeta tarjeta--invitacion">
        <h2 class="tarjeta__titulo">Elegí tu parada</h2>
        <p>Entrá a un sentido, tocá tu parada y marcala como <strong>favorita</strong>. Se guarda solo en este celular.</p>
      </section>`;

  return `
    ${tarjeta}
    <p class="hoy">Hoy rige el horario de <strong>${NOMBRE_TIPO[hoy]}</strong></p>
    ${accesosSentidos()}
    <a class="enlace-info" href="#/info">ⓘ Sobre estos horarios</a>`;
}

function vistaSentido(sentido, ahora, hoy) {
  const filas = sentido.paradas
    .map((parada) => {
      const resultado = proximasPasadas(sentido, parada.clave, ahora, feriados, 1);
      const pasada = resultado.pasadas[0];
      const hora = pasada ? aTexto(pasada.minuto) : '—';
      const faltan = !pasada ? 'sin servicio' : resultado.manana ? 'mañana' : textoFaltan(pasada.faltan);
      const estrella = esFavorita(sentido.id, parada.clave) ? '<span class="parada__estrella" aria-label="Favorita">★</span> ' : '';
      return `
        <li>
          <a class="parada" href="${enlaceParada(sentido.id, parada.clave)}">
            <span class="parada__nombre">${estrella}${esc(parada.nombre)}</span>
            <span class="parada__hora">${hora}</span>
            <span class="parada__faltan">${faltan}</span>
          </a>
        </li>`;
    })
    .join('');

  return `
    <h2 class="titulo-vista">${esc(sentido.nombre)}</h2>
    <p class="subtitulo">Horario de ${NOMBRE_TIPO[hoy]} · tocá una parada para ver todo su horario</p>
    <ol class="recorrido">${filas}</ol>`;
}

function vistaParada(sentido, parada, ahora, hoy) {
  const tipo = pestana ?? hoy;
  const favorita = esFavorita(sentido.id, parada.clave);
  const pasadas = pasadasDelDia(sentido, parada.clave, tipo);
  const proximaMinuto = tipo === hoy ? pasadas.find((p) => p.minuto >= ahora.minuto)?.minuto : undefined;

  const porHora = new Map();
  for (const pasada of pasadas) {
    const hora = Math.floor(pasada.minuto / 60) % 24;
    if (!porHora.has(hora)) porHora.set(hora, []);
    porHora.get(hora).push(pasada);
  }
  const grilla = pasadas.length
    ? [...porHora]
        .map(
          ([hora, lista]) => `
        <div class="horario__fila">
          <span class="horario__hora">${hora}</span>
          <span class="horario__minutos">
            ${lista
              .map((p) => {
                const clase =
                  tipo !== hoy ? '' : p.minuto === proximaMinuto ? ' pasada--proxima' : p.minuto < ahora.minuto ? ' pasada--ida' : '';
                const ramal = modelo.variosRamales ? `<small>${esc(nombreRamal(p.ramal))}</small>` : '';
                return `<span class="pasada${clase}" title="${aTexto(p.minuto)}">${aTexto(p.minuto)}${ramal}</span>`;
              })
              .join('')}
          </span>
        </div>`,
        )
        .join('')
    : `<p class="vacio">No pasa por esta parada en este tipo de día.</p>`;

  return `
    <h2 class="titulo-vista">${esc(parada.nombre)}</h2>
    <p class="subtitulo">${esc(sentido.nombre)}</p>
    <button type="button" class="boton boton--favorita${favorita ? ' es-favorita' : ''}" data-accion="favorita"
      data-sentido="${esc(sentido.id)}" data-parada="${esc(parada.clave)}" aria-pressed="${favorita}">
      ${favorita ? '★ Es tu parada favorita' : '☆ Marcar como favorita'}
    </button>
    <section class="tarjeta">
      <p class="tarjeta__etiqueta">Próxima</p>
      ${bloqueProxima(proximasPasadas(sentido, parada.clave, ahora, feriados))}
    </section>
    <div class="pestanas" role="tablist" aria-label="Tipo de día">
      ${TIPOS_DE_DIA.map(
        (t) => `
        <button type="button" role="tab" class="pestana" data-accion="pestana" data-tipo="${t}"
          aria-selected="${t === tipo}">${NOMBRE_TIPO[t]}${t === hoy ? ' <small>(hoy)</small>' : ''}</button>`,
      ).join('')}
    </div>
    <div class="horario" role="tabpanel">${grilla}</div>`;
}

function vistaInfo() {
  const ramales = modelo.ramales
    .map((ramal) => `<li>${esc(ramal.nombre)}${ramal.confirmado ? '' : ' — <em>sin confirmar</em>'}</li>`)
    .join('');
  return `
    <h2 class="titulo-vista">Sobre estos horarios</h2>
    <section class="tarjeta texto">
      <ul class="avisos">${modelo.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('')}</ul>
      <h3>Ramales cargados</h3>
      <ul>${ramales}</ul>
      <h3>Tu parada favorita</h3>
      <p>Se guarda solo en este celular. Cada persona elige la suya.</p>
      <h3>Instalar</h3>
      <p>En Chrome: menú ⋮ → <strong>Agregar a pantalla de inicio</strong>. Después de abrirla una vez, funciona sin señal.</p>
    </section>`;
}

function manejarClick(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton) return;
  if (boton.dataset.accion === 'favorita') {
    const { sentido, parada } = boton.dataset;
    guardarFavorita(esFavorita(sentido, parada) ? null : { sentido, parada });
    dibujar();
  } else if (boton.dataset.accion === 'pestana') {
    pestana = boton.dataset.tipo;
    dibujar();
  }
}

iniciar();
