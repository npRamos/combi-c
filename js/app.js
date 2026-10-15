// Arranque, navegación por hash y vistas.
// Cada vista tiene montar() (dibuja todo), actualizar() (cada minuto, sin perder estado) y desmontar().

import { construirModelo, buscarSentido, buscarParada, TIPOS_DE_DIA } from './modelo.js';
import { momentoEnUshuaia, tipoDeDia, conjuntoDeFeriados } from './tiempo.js';
import { proximasPasadas, pasadasDelDia, textoFaltan } from './consulta.js';
import { aTexto } from './parser.js';
import { leerFavorita, guardarFavorita, esFavorita } from './favorita.js';
import { buscarParadas } from './busqueda.js';
import { crearVistaMapa } from './mapa.js';

const app = document.getElementById('app');
const reloj = document.querySelector('.barra__reloj');
const volver = document.querySelector('.barra__volver');

const NOMBRE_TIPO = { semana: 'Lun–Vie', sabado: 'Sábado', domingo: 'Domingo y feriados' };
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

let modelo;
let feriados = new Set();
let pestana = null; // tipo de día elegido en el detalle de parada
let vista = null; // { hash, montar, actualizar, desmontar }
let padre = null; // a dónde lleva la flecha si no hay historial propio

const esc = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enlaceParada = (sentidoId, clave) => `#/parada/${encodeURIComponent(sentidoId)}/${encodeURIComponent(clave)}`;
const nombreRamal = (id) => modelo.ramales.find((ramal) => ramal.id === id)?.nombre ?? id;
const ahora = () => {
  const momento = momentoEnUshuaia();
  return { momento, hoy: tipoDeDia(momento, feriados) };
};

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
    const opcional = (ruta) =>
      ruta
        ? cargar(ruta, 'json').catch((error) => {
            console.warn('Sin datos opcionales:', error);
            return null;
          })
        : null;
    const catalogo = await cargar('data/catalogo.json', 'json');
    const archivos = catalogo.ramales.flatMap((ramal) => ramal.sentidos.map((sentido) => sentido.archivo));
    const [datosFeriados, ubicaciones, textos] = await Promise.all([
      opcional('data/feriados.json'),
      opcional(catalogo.linea.ubicaciones),
      Promise.all(archivos.map(async (archivo) => [archivo, await cargar(archivo, 'text')])).then((pares) => new Map(pares)),
    ]);
    modelo = construirModelo(catalogo, textos, { ubicaciones });
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

  // La primera entrada del historial es la de la app: desde ahí, la flecha usa la ruta "padre".
  history.replaceState({ inicioApp: true }, '');
  addEventListener('hashchange', navegar);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) actualizar();
  });
  app.addEventListener('click', manejarClick);
  volver.addEventListener('click', (evento) => {
    evento.preventDefault();
    if (history.state?.inicioApp) location.hash = padre ?? '#/';
    else history.back();
  });
  navegar();
  programarCadaMinuto();
}

function programarCadaMinuto() {
  const hastaElProximoMinuto = 60_000 - (Date.now() % 60_000) + 250;
  setTimeout(() => {
    actualizar();
    programarCadaMinuto();
  }, hastaElProximoMinuto);
}

function rutaActual() {
  const [camino, consulta = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [nombre = '', ...resto] = camino.split('/').map(decodeURIComponent);
  return { nombre, resto, parametros: new URLSearchParams(consulta) };
}

/** Cambia la dirección sin agregar una entrada al historial ni volver a montar la vista. */
function reemplazarRuta(hash) {
  history.replaceState(history.state, '', hash);
  if (vista) vista.hash = location.hash;
}

function navegar() {
  if (vista && vista.hash === location.hash) return;
  vista?.desmontar?.();
  pestana = null;
  const ruta = rutaActual();
  vista = crearVista(ruta);
  vista.hash = location.hash;
  volver.hidden = padre === null;
  if (padre) volver.href = padre;
  dibujarReloj();
  vista.montar();
}

function actualizar() {
  dibujarReloj();
  vista?.actualizar();
}

function dibujarReloj() {
  const { momento } = ahora();
  reloj.textContent = `${DIA_CORTO[momento.diaSemana]} ${aTexto(momento.minuto)}`;
}

/** Vista que se redibuja entera con cada actualización. */
function vistaSimple(dibujar, alMontar) {
  return {
    montar() {
      app.innerHTML = dibujar();
      alMontar?.();
    },
    actualizar() {
      app.innerHTML = dibujar();
    },
  };
}

function crearVista(ruta) {
  const sentido = buscarSentido(modelo, ruta.resto[0]);
  if (ruta.nombre === 'sentido' && sentido) {
    padre = '#/';
    return vistaSimple(() => vistaSentido(sentido), () => scrollTo(0, 0));
  }
  if (ruta.nombre === 'parada' && buscarParada(sentido, ruta.resto[1])) {
    padre = `#/sentido/${encodeURIComponent(sentido.id)}`;
    const parada = buscarParada(sentido, ruta.resto[1]);
    return vistaSimple(
      () => vistaParada(sentido, parada),
      () => {
        const proxima = app.querySelector('.pasada--proxima');
        if (proxima) proxima.scrollIntoView({ block: 'center' });
        else scrollTo(0, 0);
      },
    );
  }
  if (ruta.nombre === 'buscar') {
    padre = '#/';
    return vistaBuscar(ruta.parametros.get('q') ?? '');
  }
  if (ruta.nombre === 'mapa') {
    padre = '#/';
    return crearVistaMapa({
      app,
      modelo,
      ruta,
      esc,
      enlaceParada,
      esFavorita,
      reemplazarRuta,
      filaProxima,
    });
  }
  if (ruta.nombre === 'info') {
    padre = '#/';
    return vistaSimple(vistaInfo, () => scrollTo(0, 0));
  }
  padre = null;
  return vistaSimple(vistaInicio, () => scrollTo(0, 0));
}

// ── Bloques compartidos ─────────────────────────────────────────────────────

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

/** Fila "Sentido · hora · faltan" que lleva al detalle de la parada en ese sentido. */
function filaProxima(sentido, parada, color = null) {
  const { momento } = ahora();
  const resultado = proximasPasadas(sentido, parada.clave, momento, feriados, 1);
  const pasada = resultado.pasadas[0];
  const hora = pasada ? aTexto(pasada.minuto) : '—';
  const faltan = !pasada ? 'sin servicio' : resultado.manana ? 'mañana' : textoFaltan(pasada.faltan);
  const marca = color ? `<i class="fila-sentido__color" style="background:${color}"></i>` : '';
  return `
    <a class="fila-sentido" href="${enlaceParada(sentido.id, parada.clave)}">
      <span class="fila-sentido__nombre">${marca}${esc(sentido.nombre)}</span>
      <span class="fila-sentido__hora">${hora}</span>
      <span class="fila-sentido__faltan">${faltan}</span>
    </a>`;
}

// ── Vistas ──────────────────────────────────────────────────────────────────

function vistaInicio() {
  const { momento, hoy } = ahora();
  const favorita = leerFavorita();
  const sentido = favorita && buscarSentido(modelo, favorita.sentido);
  const parada = sentido && buscarParada(sentido, favorita.parada);

  const tarjeta = parada
    ? `
      <a class="tarjeta tarjeta--favorita" href="${enlaceParada(sentido.id, parada.clave)}">
        <p class="tarjeta__etiqueta">★ Tu parada · ${esc(sentido.nombre)}</p>
        <h2 class="tarjeta__titulo">${esc(parada.nombre)}</h2>
        ${bloqueProxima(proximasPasadas(sentido, parada.clave, momento, feriados))}
      </a>`
    : `
      <section class="tarjeta tarjeta--invitacion">
        <h2 class="tarjeta__titulo">Elegí tu parada</h2>
        <p>Buscala por nombre o en el mapa, tocala y marcala como <strong>favorita</strong>. Se guarda solo en este celular.</p>
      </section>`;

  const sentidos = modelo.sentidos
    .map(
      (s) => `
      <a class="sentido" href="#/sentido/${encodeURIComponent(s.id)}">
        <span class="sentido__nombre">${esc(s.nombre)}</span>
        <span class="sentido__recorrido">${esc(s.paradas[0]?.nombre ?? '')} → ${esc(s.paradas.at(-1)?.nombre ?? '')}</span>
      </a>`,
    )
    .join('');

  return `
    ${tarjeta}
    <div class="accesos">
      <a class="acceso acceso--buscar" href="#/buscar" data-accion="abrir-buscador"><span aria-hidden="true">⌕</span> Buscar parada</a>
      <a class="acceso" href="#/mapa"><span aria-hidden="true">◉</span> Ver mapa</a>
    </div>
    <p class="hoy">Hoy rige el horario de <strong>${NOMBRE_TIPO[hoy]}</strong></p>
    <nav class="sentidos" aria-label="Sentidos">${sentidos}</nav>
    <a class="enlace-info" href="#/info">ⓘ Sobre estos horarios</a>`;
}

function vistaSentido(sentido) {
  const { hoy } = ahora();
  const filas = sentido.paradas
    .map((parada) => {
      const { momento } = ahora();
      const resultado = proximasPasadas(sentido, parada.clave, momento, feriados, 1);
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

function vistaParada(sentido, parada) {
  const { momento, hoy } = ahora();
  const tipo = pestana ?? hoy;
  const favorita = esFavorita(sentido.id, parada.clave);
  const pasadas = pasadasDelDia(sentido, parada.clave, tipo);
  const proximaMinuto = tipo === hoy ? pasadas.find((p) => p.minuto >= momento.minuto)?.minuto : undefined;

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
                  tipo !== hoy ? '' : p.minuto === proximaMinuto ? ' pasada--proxima' : p.minuto < momento.minuto ? ' pasada--ida' : '';
                const ramal = modelo.variosRamales ? `<small>${esc(nombreRamal(p.ramal))}</small>` : '';
                return `<span class="pasada${clase}">${aTexto(p.minuto)}${ramal}</span>`;
              })
              .join('')}
          </span>
        </div>`,
        )
        .join('')
    : `<p class="vacio">No pasa por esta parada en este tipo de día.</p>`;

  const enMapa = parada.ubicacion
    ? `<a class="enlace-mapa" href="#/mapa/${encodeURIComponent(sentido.id)}/${encodeURIComponent(parada.clave)}">◉ Ver en el mapa</a>`
    : '';

  return `
    <h2 class="titulo-vista">${esc(parada.nombre)}</h2>
    <p class="subtitulo">${esc(sentido.nombre)} ${enMapa}</p>
    <button type="button" class="boton boton--favorita${favorita ? ' es-favorita' : ''}" data-accion="favorita"
      data-sentido="${esc(sentido.id)}" data-parada="${esc(parada.clave)}" aria-pressed="${favorita}">
      ${favorita ? '★ Es tu parada favorita' : '☆ Marcar como favorita'}
    </button>
    <section class="tarjeta">
      <p class="tarjeta__etiqueta">Próxima</p>
      ${bloqueProxima(proximasPasadas(sentido, parada.clave, momento, feriados))}
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

function vistaBuscar(consultaInicial) {
  let consulta = consultaInicial;

  function dibujarResultados() {
    const contenedor = app.querySelector('.resultados');
    if (!contenedor) return;
    if (!consulta.trim()) {
      contenedor.innerHTML = `<p class="ayuda">Escribí parte del nombre: una calle, un número o un lugar (por ejemplo, <em>museo</em> o <em>yaganes 408</em>).</p>`;
      return;
    }
    const resultados = buscarParadas(modelo, consulta);
    if (resultados.length === 0) {
      contenedor.innerHTML = `<p class="ayuda">No hay paradas con “${esc(consulta.trim())}”.</p>`;
      return;
    }
    contenedor.innerHTML = resultados
      .map((resultado) => {
        const favorita = resultado.sentidos.some((id) => esFavorita(id, resultado.clave));
        const filas = resultado.sentidos
          .map((id) => {
            const sentido = buscarSentido(modelo, id);
            return filaProxima(sentido, buscarParada(sentido, resultado.clave));
          })
          .join('');
        return `
          <section class="resultado">
            <h3 class="resultado__nombre">${favorita ? '<span class="parada__estrella">★</span> ' : ''}${esc(resultado.nombre)}</h3>
            ${filas}
          </section>`;
      })
      .join('');
  }

  return {
    montar() {
      app.innerHTML = `
        <h2 class="titulo-vista">Buscar parada</h2>
        <label class="buscador">
          <span class="visualmente-oculto">Nombre de la parada</span>
          <input type="search" class="buscador__campo" placeholder="Calle, número o lugar" autocomplete="off"
            autocapitalize="off" spellcheck="false" enterkeyhint="search" value="${esc(consulta)}">
        </label>
        <div class="resultados" aria-live="polite"></div>`;
      const campo = app.querySelector('.buscador__campo');
      campo.addEventListener('input', () => {
        consulta = campo.value;
        reemplazarRuta(consulta ? `#/buscar?q=${encodeURIComponent(consulta)}` : '#/buscar');
        dibujarResultados();
      });
      campo.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') campo.blur(); // cierra el teclado para ver los resultados
      });
      dibujarResultados();
      campo.focus();
      campo.setSelectionRange(campo.value.length, campo.value.length);
      scrollTo(0, 0);
    },
    actualizar: dibujarResultados,
  };
}

function vistaInfo() {
  const ramales = modelo.ramales
    .map((ramal) => `<li>${esc(ramal.nombre)}${ramal.confirmado ? '' : ' — <em>sin confirmar</em>'}</li>`)
    .join('');
  const ubicaciones = modelo.fuenteUbicaciones
    ? `<p>Ubicación de las paradas y recorrido: <strong>Mi Bondi</strong>, Municipalidad de Ushuaia. Algunas paradas no tienen punto en el mapa.</p>`
    : '';
  return `
    <h2 class="titulo-vista">Sobre estos horarios</h2>
    <section class="tarjeta texto">
      <ul class="avisos">${modelo.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('')}</ul>
      <h3>Ramales cargados</h3>
      <ul>${ramales}</ul>
      <h3>Mapa</h3>
      ${ubicaciones}
      <p>Mapa de fondo: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>. Necesita conexión.</p>
      <p>"Parada más cercana" usa tu ubicación solo en el celular: no se guarda ni se envía.</p>
      <h3>Tu parada favorita</h3>
      <p>Se guarda solo en este celular. Cada persona elige la suya.</p>
      <h3>Instalar</h3>
      <p>En Chrome: menú ⋮ → <strong>Agregar a la pantalla principal</strong>. Después de abrirla una vez, funciona sin señal.</p>
    </section>`;
}

function manejarClick(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton) return;
  const accion = boton.dataset.accion;
  if (accion === 'favorita') {
    const { sentido, parada } = boton.dataset;
    guardarFavorita(esFavorita(sentido, parada) ? null : { sentido, parada });
    vista.actualizar();
  } else if (accion === 'pestana') {
    pestana = boton.dataset.tipo;
    vista.actualizar();
  } else if (accion === 'abrir-buscador') {
    // Se monta en el mismo toque para que Android abra el teclado al enfocar el campo.
    evento.preventDefault();
    history.pushState(null, '', '#/buscar');
    navegar();
  }
}

iniciar();
