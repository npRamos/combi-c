// Vista del mapa: puntos de las paradas, recorrido, panel de parada y parada más cercana.
// Leaflet se carga recién al entrar al mapa.

import { paradasUbicadas } from './modelo.js';
import { masCercana, textoDistancia } from './geo.js';

const COLORES = ['#0f5c6e', '#d9480f', '#7b2cbf', '#2b8a3e'];
let cargandoLeaflet = null;

function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  cargandoLeaflet ??= new Promise((resolver, rechazar) => {
    const estilos = document.createElement('link');
    estilos.rel = 'stylesheet';
    estilos.href = 'vendor/leaflet/leaflet.css';
    document.head.append(estilos);
    const script = document.createElement('script');
    script.src = 'vendor/leaflet/leaflet.js';
    script.onload = () => resolver(window.L);
    script.onerror = () => {
      cargandoLeaflet = null;
      script.remove();
      rechazar(new Error('No se pudo cargar Leaflet'));
    };
    document.head.append(script);
  });
  return cargandoLeaflet;
}

/**
 * @param ctx { app, modelo, ruta: { resto }, esc, enlaceParada, filaProxima(sentido, parada), esFavorita(sentidoId, clave), reemplazarRuta(hash) }
 */
export function crearVistaMapa(ctx) {
  const { app, modelo, esc } = ctx;
  const puntos = paradasUbicadas(modelo);
  const colorDe = new Map(modelo.sentidos.map((sentido, i) => [sentido.id, COLORES[i % COLORES.length]]));
  let mapa = null;
  let abierta = null; // { sentidoId, clave, distancia }
  let capaPosicion = null;
  let temporizadorAviso = null;
  let desmontada = false;

  const panel = () => app.querySelector('.panel-parada');
  const aviso = () => app.querySelector('.mapa__aviso');

  function mostrarAviso(texto, { fijo = false } = {}) {
    const el = aviso();
    if (!el) return;
    el.textContent = texto;
    el.hidden = !texto;
    clearTimeout(temporizadorAviso);
    if (texto && !fijo) temporizadorAviso = setTimeout(() => (el.hidden = true), 8000);
  }

  const SIN_CONEXION = 'Sin conexión, el mapa de fondo no se puede cargar.';
  const avisarSinConexion = () => mostrarAviso(SIN_CONEXION, { fijo: true });
  const quitarAvisoSinConexion = () => {
    if (aviso()?.textContent === SIN_CONEXION) mostrarAviso('');
  };

  function dibujarPanel() {
    const el = panel();
    if (!el) return;
    if (!abierta) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const origen = modelo.sentidos.find((s) => s.id === abierta.sentidoId);
    const parada = origen.paradas.find((p) => p.clave === abierta.clave);
    const sentidos = [origen, ...modelo.sentidos.filter((s) => s !== origen)].filter((s) =>
      s.paradas.some((p) => p.clave === abierta.clave),
    );
    el.innerHTML = `
      <div class="panel-parada__cabecera">
        <h2 class="panel-parada__titulo">${ctx.esFavorita(origen.id, parada.clave) ? '<span class="parada__estrella">★</span> ' : ''}${esc(parada.nombre)}</h2>
        <button type="button" class="panel-parada__cerrar" data-accion="cerrar-panel" aria-label="Cerrar">×</button>
      </div>
      ${abierta.distancia != null ? `<p class="panel-parada__distancia">${textoDistancia(abierta.distancia)} de tu ubicación</p>` : ''}
      <ul class="panel-parada__sentidos">
        ${sentidos.map((s) => `<li>${ctx.filaProxima(s, s.paradas.find((p) => p.clave === abierta.clave), colorDe.get(s.id))}</li>`).join('')}
      </ul>
      <a class="boton boton--lleno" href="${ctx.enlaceParada(origen.id, parada.clave)}">Ver horario completo</a>`;
    el.hidden = false;
  }

  function abrirPanel(sentidoId, clave, { distancia = null, centrar = false } = {}) {
    abierta = { sentidoId, clave, distancia };
    ctx.reemplazarRuta(`#/mapa/${encodeURIComponent(sentidoId)}/${encodeURIComponent(clave)}`);
    dibujarPanel();
    const punto = puntos.find((p) => p.sentido.id === sentidoId && p.parada.clave === clave);
    if (mapa && punto) {
      const { lat, lon } = punto.parada.ubicacion;
      if (centrar) mapa.setView([lat, lon], Math.max(mapa.getZoom() || 0, 16));
      else if (!mapa.getBounds().pad(-0.15).contains([lat, lon])) mapa.panTo([lat, lon]);
    }
  }

  function cerrarPanel() {
    if (!abierta) return;
    abierta = null;
    ctx.reemplazarRuta('#/mapa');
    dibujarPanel();
  }

  function buscarCercana() {
    if (!('geolocation' in navigator)) {
      mostrarAviso('Este navegador no permite obtener la ubicación.');
      return;
    }
    mostrarAviso('Buscando tu ubicación…', { fijo: true });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (desmontada || !mapa) return;
        mostrarAviso('');
        const posicion = { lat: coords.latitude, lon: coords.longitude };
        const cercana = masCercana(puntos, posicion, (p) => p.parada.ubicacion);
        capaPosicion?.remove();
        capaPosicion = window.L.layerGroup([
          window.L.circle([posicion.lat, posicion.lon], { radius: coords.accuracy, color: '#1c7ed6', weight: 1, fillOpacity: 0.1, interactive: false }),
          window.L.circleMarker([posicion.lat, posicion.lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#1c7ed6', fillOpacity: 1, interactive: false }),
        ]).addTo(mapa);
        if (!cercana) return;
        const { lat, lon } = cercana.punto.parada.ubicacion;
        mapa.fitBounds([[posicion.lat, posicion.lon], [lat, lon]], { padding: [60, 60], maxZoom: 17 });
        abrirPanel(cercana.punto.sentido.id, cercana.punto.parada.clave, { distancia: cercana.distancia });
      },
      (error) => {
        if (desmontada) return;
        const mensajes = {
          1: 'Para usar esta función, permití el acceso a la ubicación para este sitio en la configuración del navegador.',
          2: 'No se pudo obtener la ubicación. Revisá que la ubicación del celular esté activada y probá de nuevo.',
          3: 'No se pudo obtener la ubicación a tiempo. Probá de nuevo, mejor al aire libre.',
        };
        mostrarAviso(mensajes[error.code] ?? mensajes[2]);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function alHacerClic(evento) {
    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;
    if (boton.dataset.accion === 'cerrar-panel') cerrarPanel();
    else if (boton.dataset.accion === 'parada-cercana') buscarCercana();
  }

  async function montar() {
    document.body.classList.add('con-mapa');
    if (puntos.length === 0) {
      app.innerHTML = `<section class="tarjeta"><h2 class="tarjeta__titulo">No hay ubicaciones cargadas</h2><p>Las paradas se pueden consultar desde el inicio o con el buscador.</p></section>`;
      document.body.classList.remove('con-mapa');
      return;
    }
    app.innerHTML = `
      <div class="mapa">
        <div class="mapa__lienzo" role="application" aria-label="Mapa de paradas"></div>
        <div class="mapa__leyenda">
          ${modelo.sentidos.map((s) => `<span><i style="background:${colorDe.get(s.id)}"></i>${esc(s.nombre)}</span>`).join('')}
        </div>
        <button type="button" class="mapa__cercana" data-accion="parada-cercana">◎ Parada más cercana</button>
        <p class="mapa__aviso" role="status" hidden></p>
        <section class="panel-parada" aria-live="polite" hidden></section>
      </div>`;
    app.addEventListener('click', alHacerClic);

    let L;
    try {
      L = await cargarLeaflet();
    } catch {
      if (!desmontada) mostrarAviso('No se pudo cargar el mapa. Abrí esta pantalla una vez con conexión para poder usarla sin señal.', { fijo: true });
      return;
    }
    if (desmontada) return;

    mapa = L.map(app.querySelector('.mapa__lienzo'), { zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);
    mapa.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>',
    })
      .on('tileerror', avisarSinConexion)
      .on('tileload', () => {
        if (navigator.onLine) quitarAvisoSinConexion();
      })
      .addTo(mapa);
    addEventListener('offline', avisarSinConexion);
    addEventListener('online', quitarAvisoSinConexion);
    if (!navigator.onLine) avisarSinConexion();

    const capas = [];
    if (modelo.recorrido.length) {
      capas.push(L.polyline(modelo.recorrido, { color: '#495057', weight: 4, opacity: 0.45, interactive: false }).addTo(mapa));
    }
    for (const { sentido, parada } of puntos) {
      const { lat, lon } = parada.ubicacion;
      const favorita = ctx.esFavorita(sentido.id, parada.clave);
      L.circleMarker([lat, lon], {
        radius: favorita ? 11 : 7,
        color: favorita ? '#ffb547' : '#ffffff',
        weight: favorita ? 4 : 2,
        fillColor: colorDe.get(sentido.id),
        fillOpacity: 1,
        interactive: false,
      }).addTo(mapa);
      // Área táctil transparente de 40 px de diámetro.
      L.circleMarker([lat, lon], { radius: 20, stroke: false, fillOpacity: 0, bubblingMouseEvents: false })
        .on('click', () => abrirPanel(sentido.id, parada.clave))
        .addTo(mapa);
    }
    mapa.on('click', cerrarPanel);

    const [sentidoId, clave] = ctx.ruta.resto;
    if (sentidoId && clave && puntos.some((p) => p.sentido.id === sentidoId && p.parada.clave === clave)) {
      abrirPanel(sentidoId, clave, { centrar: true });
    } else if (capas.length) {
      mapa.fitBounds(capas[0].getBounds(), { padding: [20, 20] });
    } else {
      mapa.fitBounds(puntos.map((p) => [p.parada.ubicacion.lat, p.parada.ubicacion.lon]), { padding: [30, 30] });
    }
  }

  return {
    montar,
    actualizar: dibujarPanel,
    desmontar() {
      desmontada = true;
      clearTimeout(temporizadorAviso);
      app.removeEventListener('click', alHacerClic);
      removeEventListener('offline', avisarSinConexion);
      removeEventListener('online', quitarAvisoSinConexion);
      mapa?.remove();
      mapa = null;
      document.body.classList.remove('con-mapa');
    },
  };
}
