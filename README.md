# Combi C · Ushuaia

App web instalable para saber **cuándo pasa la próxima combi de la línea C** por cualquier parada de Ushuaia. Funciona sin conexión una vez abierta, y cada celular guarda su propia parada favorita.

Los horarios son una copia de Moovit y son **estimados**. Las ubicaciones de las paradas son de Mi Bondi (Municipalidad de Ushuaia), y el mapa de fondo es de © colaboradores de OpenStreetMap.

## Usarla en el celular (Android)

1. Abrí la dirección de GitHub Pages en Chrome.
2. Menú ⋮ → **Agregar a pantalla de inicio** o **Instalar app**.
3. Tocá tu parada y elegí **Marcar como favorita**.

## Agregar o actualizar horarios

Los horarios están en `data/`, como texto copiado tal cual de Moovit:

```
data/
  catalogo.json                         ← línea, ramales y sentidos
  feriados.json                         ← fechas que usan el horario de domingo
  c/ramal-a-confirmar/hacia-centro.txt
  c/ramal-a-confirmar/hacia-valle.txt
```

Cada archivo `.txt` tiene una o más secciones con este formato:

```
Horarios de la semana          ← o "Horarios de sábado" / "Horarios de domingo"
Nombre de la primera parada
Nombre de la segunda parada
…
5:00    5:01    …              ← una fila por salida, un horario por parada
```

Las líneas que empiezan con `#` son comentarios.

**Para actualizar un ramal**, en Moovit seleccioná el texto de la tabla (encabezado, paradas y horarios), copialo y reemplazá el contenido del archivo.

**Para agregar un ramal**:
1. Creá una carpeta, por ejemplo `data/c/ramal-3/`, con un archivo por sentido (`hacia-centro.txt`, `hacia-valle.txt`).
2. Agregá el ramal en `data/catalogo.json`, usando los mismos `id` de sentido (`hacia-centro` / `hacia-valle`) para que se combine con los otros ramales.

Las paradas se reconocen por su nombre, sin distinguir mayúsculas, tildes ni puntuación. Si dos ramales tienen la misma parada, la app muestra las pasadas de los dos.

**Ubicaciones de las paradas (mapa):** `data/c/ubicaciones.json` se genera con un script a partir de una copia de Mi Bondi (Municipalidad de Ushuaia), que tiene las coordenadas de las paradas de la Línea C pero no sus nombres:

```sh
node herramientas/emparejar-mibondi.mjs
```

El script asigna los nombres siguiendo el orden del recorrido. Para controlar el resultado mide si cada punto está sobre la calle que nombra la parada, usando las calles de OpenStreetMap (`herramientas/osm/calles.json`), y escribe `herramientas/informe-emparejamiento.md`. Las correcciones manuales van en `herramientas/correcciones.json`, cada una con su motivo. Si se agregan paradas o cambia un horario, hay que volver a correr el script y revisar el informe.

**Feriados:** `data/feriados.json` hay que actualizarlo una vez por año. Los feriados usan el horario de domingo.

Los cambios en `data/` aparecen en los celulares a más tardar la segunda vez que se abre la app con conexión.

## Cambios de código

Si modificás algo en `index.html`, `css/`, `js/`, `iconos/`, `vendor/` o `manifest.webmanifest`, subí la versión de `VERSION` en `sw.js` para que los celulares descarguen la nueva versión.

## Probar localmente

```sh
node --test tests/*.test.mjs      # tests (o npm test)
cd .. && python3 -m http.server    # abrir http://localhost:8000/colectivos/
```

## Publicar

GitHub Pages: *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
