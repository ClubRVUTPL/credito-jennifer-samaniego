# Estado del proyecto

> **Histórico (agosto 2026).** Este informe describe el estado del 17–24 de
> agosto. El despliegue actual es **solo Vercel** (ya no Netlify). El vídeo
> anclado en 3D, la narración `.mp3` y los subtítulos `.vtt` se retiraron.
> Para el pipeline de alfa empaquetada vigente, ver `src/video-transparente.js`.

Informe redactado leyendo **solo** el contenido de esta carpeta, sin contexto
externo. Lo *verificado* se comprobó ejecutando el proyecto (compilación,
servidor, navegador headless con cámara falsa); lo *inferido* es deducción mía a
partir del código o de los documentos, no un hecho establecido.

Auditoría del 17 de agosto de 2026. Rama `main`, commit `c6bc42a`.

---

## 0 · Actualización del 24 de agosto de 2026

Lo que sigue en este documento describe el proyecto tal y como estaba el 17 de
agosto. Estos son los cambios posteriores, todos sobre el mismo commit
`c6bc42a` (nada commiteado todavía):

- **El sujeto y el tema quedaron fijados.** No es una obra conmemorativa por
  los 50 años de la MAD: es la **placa del primer lugar de la convocatoria
  Innova Docente Inter Universidades (UTPL, 2026)**, y quien aparece en RA es
  **el docente premiado**. `contenido.json` se reescribió entero: encabezado,
  textos de entrada y pestañas nuevas (Premio · Proyecto · Docente · Contacto),
  con el relleno marcado. La clave `artista` pasó a llamarse `docente` en el
  JSON y en el código que la lee (§12 de este informe queda resuelto en ese
  punto).
- **La RA dejó de ser opcional en la intención del proyecto.** La página sigue
  funcionando sin cámara y los dos caminos siguen existiendo, pero la capa de
  RA es el centro y así hay que tratarla al priorizar trabajo.
- **El vídeo va a la derecha de la placa.** `src/ar.js` admite ahora
  `lado: "derecha" | "izquierda" | "centro"`, `margenCm` y `placaAltoCm`. El
  desplazamiento lateral se calcula en ejecución (media placa + media figura +
  margen) en cuanto se conocen los metadatos del vídeo, así que cambiar el
  clip no obliga a recalcular nada a mano.
- **Hay material de ensayo real.** `public/media/prueba-docente-720.mp4` y
  `-480.mp4`: un actor de banco de vídeos grabado sobre croma, recortado con
  el nuevo `scripts/quitar-fondo-verde.sh`, encuadre vertical 9:16 y alfa
  empaquetada. Sin audio. `ar.video` apunta a ellos.
- **La escala ya no es una estimación.** Medida sobre la lámina de pruebas
  (`placa con qr.pdf`, maquetada a tamaño real 15,3 × 25,7 cm):
  chapa dorada 10,15 × 3,7 cm; **recorte del marcador 12,3 × 5,2 cm**. De ahí
  salen `placaAnchoCm: 12.3` y `placaAltoCm: 5.2`, con `alturaFiguraCm: 26`.
- **El despliegue dejó de ser ambiguo: es Netlify**
  (<https://proyecto-ar-creditos-docente.netlify.app>), que es además a donde
  apunta el QR de la lámina impresa. Hay `netlify.toml` en la raíz y la
  documentación ya no habla de Cloudflare Pages salvo para el túnel de
  pruebas. El punto 2 de §14 queda resuelto.
- **Verificado en navegador headless** con cámara falsa alimentada con la
  lámina: la placa se detecta, el estado llega a `encontrado`, el vídeo se
  reproduce, la transparencia funciona con material alfa real —lo que confirma
  la apuesta de orientación del shader que §11.5 daba por no verificada— y la
  figura aparece a la derecha, apoyada en el borde inferior de la placa.
  Medidas obtenidas: plano de 1,186 × 2,114 unidades (14,6 × 26 cm) en
  x = 1,215 (≈15 cm a la derecha del centro de la placa).

Lo que sigue pendiente: el rodaje real, los textos definitivos, la fotografía
de la placa metálica ya grabada, la dirección corta bajo dominio UTPL para el
QR, la prueba en un iPhone real y la integración continua.

---

## 1 · Qué es este proyecto

Es un **sitio web estático de una sola página** que muestra los créditos del
artista que creó una placa/trofeo conmemorativo por los cincuenta años de la
Modalidad Abierta y a Distancia (MAD) de la UTPL, y que opcionalmente superpone
una capa de **realidad aumentada**: la cámara del móvil reconoce la placa grabada
de la pieza y ancla sobre ella un vídeo del artista con narración y subtítulos.

Lo que consta en el repositorio: la página se abre **escaneando un código QR
grabado en la placa del trofeo** (`README.md:3`); el público es quien está
físicamente delante de la pieza —el texto de entrada dice *«Necesitas tener la
pieza delante»* (`contenido.json:14`)—; y hay un criterio editorial explícito:
acredita **a quien creó físicamente la pieza y a nadie más** (`README.md:18-23`).
El año de la ficha es **2026** y la placa de prueba lleva grabado **1976 — 2026**.

Lo que **no** se puede determinar desde el repositorio: quién encarga el
proyecto, quién es el artista, si existe ya la pieza física y si hay fecha de
entrega. Ver la sección 13.

---

## 2 · Cómo está construido

Sin framework de interfaz. JavaScript ESM plano, DOM construido a mano, CSS
propio. Solo dos dependencias de ejecución.

| Pieza | Versión | Papel |
|---|---|---|
| **Vite** | `^5.4.0` (5.4.21 en uso) | Servidor de desarrollo y empaquetador. Genera `dist/`. |
| **A-Frame** | `~1.5.0` | Framework declarativo para escenas 3D en el navegador: se escriben etiquetas HTML (`<a-scene>`, `<a-plane>`) en vez de código de three.js. |
| **MindAR** | `^1.2.5` | Biblioteca de RA por seguimiento de imagen: reconoce una imagen impresa con la cámara y calcula su posición para anclar contenido encima. Se ejecuta enteramente en el navegador. |

Elementos poco habituales:

- **`targets.mind`** — MindAR no usa la foto directamente: necesita un binario
  precompilado con los puntos característicos de la imagen (417 KB, verificado).
- **Alfa empaquetada** — el vídeo lleva el color en la mitad *superior* del
  fotograma y la máscara de opacidad, en gris, en la *inferior*: es la forma de
  tener transparencia en `.mp4`, que no admite canal alfa. El shader
  `alfa-empaquetada` (`src/alpha-video.js`) recompone ambas mitades.
- **`stubs/canvas/`** — paquete falso y vacío que sustituye al paquete nativo
  `canvas` vía `overrides`. MindAR lo declara pero solo lo usa su herramental de
  Node, y el real exige compilar código nativo y rompe `npm install` en Windows.
- **`src/shims/`** — dos módulos de una línea que neutralizan ramas de
  TensorFlow.js (dentro de MindAR) pensadas para Node.

Sin backend, sin base de datos, sin telemetría, sin peticiones a terceros.

---

## 3 · Arquitectura

Dos capas con una frontera dura entre ellas, y esa frontera es la decisión
estructural central del proyecto.

**Capa de contenido** (`src/main.js` + `src/ui.js` + `contenido/contenido.json`):
es la página. Funciona siempre, sin cámara ni permisos. Pesa, verificado,
10,3 KB de JS + 8,7 KB de CSS + 3,4 KB de JSON.

**Capa de RA** (`src/ar.js` + `src/alpha-video.js` + A-Frame + MindAR): se importa
con `import()` dinámico **dentro del clic** del usuario. Verificado en `dist/`:
son dos chunks de 1,48 MB y 1,74 MB (≈705 KB combinados en gzip) que no se
descargan nunca si el visitante no pulsa el botón.

Flujo de datos en ejecución:

1. `index.html` carga `src/main.js`. El `<title>` ya viene resuelto desde el JSON
   en compilación (plugin `titulo-desde-contenido`, `vite.config.js:28`).
2. `main.js` hace `fetch('/contenido/contenido.json')`; si falla → `renderLoadError`.
   `hayRelleno()` decide si añadir la banda naranja «Contenido de prueba».
3. `renderPage()` pinta cabecera, dos botones, pestañas y paneles. **Ningún texto
   visible está escrito en el JS**: todo sale del JSON, siempre como nodo de
   texto, nunca con `innerHTML`.
4. `setupArButton()` muestra el botón de RA solo si hay `navigator.mediaDevices`,
   `ar.marcador` y `ar.video`.
5. Al aceptar el permiso se crean `<video>` y `<audio>` y se llama a `play()`
   **dentro del gesto** (requisito de iOS); después, `import('./ar.js')`.
6. `openAR()` monta el overlay, importa A-Frame y MindAR, registra el shader y
   construye la escena. MindAR emite `arReady`, `targetFound`, `targetLost`.

El estado de la RA vive en un único `setState()` dentro de `buildOverlay`
(`src/ar.js:353`), que escribe `data-estado` en el nodo raíz y decide mensaje,
retículo, subtítulo y temporizador de rescate.

---

## 4 · Estructura de archivos

```
index.html                  arranque; solo carga src/main.js
banco-shader.html           herramienta de desarrollo: valida el shader sin cámara
compilador-marcador.html    herramienta de desarrollo: compila placa.jpg → targets.mind
vite.config.js              base '/', alias de shims, dos plugins propios
package.json                2 dependencias, 1 devDependency, override de 'canvas'

src/
  main.js                   entrada, permiso, elección de vídeo, carga diferida
  ui.js                     cabecera, botones, diálogo de permiso, pestañas ARIA
  ar.js                     overlay, máquina de estados, escenas A-Frame
  alpha-video.js            shader 'alfa-empaquetada'
  contenido-relleno.js      lista de marcadores; compartida navegador ↔ guardián
  debug.js                  panel ?debug=1 (fuera de producción)
  styles.css / fuentes.css  estilos; fuentes.css está GENERADO
  dev.css                   estilos solo de desarrollo
  shims/                    parches de util y node-fetch para MindAR

contenido/
  contenido.json            TODOS los textos visibles + configuración de la RA
  guion.txt                 lo que narra el artista (una línea = un subtítulo)

public/
  _headers                  política de caché (formato Cloudflare Pages)
  ar/placa.jpg              marcador provisional dibujado por código (1200×900)
  ar/targets.mind           marcador compilado
  media/                    prueba.mp4, artista-narracion.mp3, subtitulos.vtt
  fonts/                    6 woff2 autoalojados + licencia

scripts/                    generación de placa, marcador, narración, vídeo;
                            guardián de contenido; cliente CDP compartido
docs/capturas/              capturas; 380/900 automáticas, entrada/ manuales
stubs/canvas/               paquete falso para no compilar 'canvas' nativo
assets-src/                 material en bruto — EXCLUIDO de git (ver §11)
.netlify/                   estado local de Netlify — no versionado (ver §12)
dist/                       build; no versionado
```

---

## 5 · El recorrido del usuario (verificado ejecutando)

Compilé con `PERMITIR_RELLENO=1 npm run build`, serví `dist/` y recorrí la
aplicación en Edge headless a 390×844, con la cámara falsa alimentada con la
propia `placa.jpg` convertida a vídeo. Esto es lo que ocurre de verdad:

**Entrada.** Banda naranja «Contenido de prueba: esta no es la versión final.»,
etiqueta dorada, qué es la pieza, el nombre («Nombre del artista»), el rol, qué
ofrece la RA y su duración. Dos botones del mismo peso visual: *Ver la obra en
realidad aumentada* y *Leer los créditos sin cámara*. Debajo, cuatro pestañas.
Consola limpia, sin desbordamiento horizontal a 390 px.

**Pestañas.** Verificado con eventos de teclado: `→` avanza, `End` va a la última,
`Home` vuelve a la primera; `aria-selected` y `hidden` se actualizan y el foco
sigue a la pestaña activa. *Leer los créditos sin cámara* lleva el foco a la
primera pestaña; no abre nada nuevo.

**Camino de RA.** El botón solo aparece en contexto seguro. Al pulsarlo **no se
pide la cámara**: se abre un diálogo modal («Vamos a usar la cámara») con tres
puntos y los botones *Activar cámara* / *Volver*; el foco entra en el botón
principal y `Escape` equivale a *Volver*.

Al aceptar, la secuencia observada fue `cargando` → `buscando` (retículo pulsante
+ «Apunta a la placa del trofeo») → `encontrado`: mensaje vacío, retículo oculto,
audio reproduciéndose y subtítulos sincronizados con el `.vtt`. El plano anclado
se creó con `width=3.3778`, `height=1.9`, `position="0 0.95 0.05"` y el shader
`alfa-empaquetada` registrado.

**Rescate.** A los 15 s en `buscando` aparece «¿No tienes la pieza delante? Puedes
leer los créditos sin cámara» con un botón que cierra la capa. Verificado.

**Errores** (los tres, verificados bloqueando red o denegando permisos):

| Camino | Qué ocurre |
|---|---|
| `contenido.json` no carga | Página sustituida por un aviso con `role="alert"`. La página queda inservible pero no en blanco. |
| A-Frame/MindAR no descargan | Estado `error-motor` dentro de la capa, con mensaje y botón *Cerrar* funcional. |
| Cámara denegada | Estado `error-camara` con mensaje sobre permisos; al cerrar, la página vuelve intacta (4 pestañas, sin `sin-scroll` colgado). |

---

## 6 · Estado de cada componente

| Componente | Estado | Qué le falta |
|---|---|---|
| Capa de contenido (`ui.js`, `styles.css`) | **Terminado** | Nada estructural; solo los textos reales |
| Máquina de estados de RA (`ar.js`) | **Terminado** | — |
| Diálogo de permiso y rescate | **Terminado** | — |
| Shader de alfa empaquetada | **Terminado, orientación no confirmada con vídeo real** | Ver §11 |
| Guardián de publicación | **Terminado** | No revisa `subtitulos.vtt` (§12) |
| Carga diferida del motor | **Terminado y verificado** | — |
| Textos de `contenido.json` | **Provisional** | Casi todo |
| `guion.txt` | **Provisional** | Marcado `# BORRADOR` |
| `placa.jpg` + `targets.mind` | **Provisional** | Foto de la placa real + recompilar |
| Vídeo anclado (`prueba.mp4`) | **De relleno** | Rodaje real |
| Narración + subtítulos | **Roto conceptualmente** | Corresponden a un guion anterior (§7, §12) |
| `scripts/generar-narracion.mjs` | **Roto** | Escribe en una ruta que la página no lee (§12) |
| Despliegue | **Ambiguo** | Documentado Cloudflare, configurado Netlify (§9) |
| Pruebas automáticas / CI | **Pendiente** | No hay `.github/`; solo dos scripts locales |

---

## 7 · Qué es provisional o de relleno

| Elemento | Texto o ruta literal |
|---|---|
| Nombre del artista | `"nombre": "Nombre del artista"` |
| Ficha técnica | `"Título de la obra (por definir)"`, `"Materiales de la pieza (por definir)"`, `"Técnica empleada (por definir)"`, `"Alto × ancho × fondo (por definir)"` |
| Proceso | `"Primera etapa del proceso (por definir)."` … cuatro pasos |
| Contacto | `mailto:correo@ejemplo.com`, `https://ejemplo.com`, `https://instagram.com/ejemplo` |
| Guion | primera línea `# BORRADOR — sustituir por el texto real del artista` |
| Vídeo anclado | `/media/prueba.mp4` — 8 s, 640×720, cuadrado dorado sintético |
| Marcador | `public/ar/placa.jpg` — placa **dibujada por código**, no fotografiada |
| Ancho de placa | `"placaAnchoCm": 10` — declarado *estimación provisional* en `SUSTITUIR.md:221` |
| Narración | `artista-narracion.mp3` (50,97 s) y `subtitulos.vtt` — de un guion anterior |

**Mecanismo de contención.** `scripts/comprobar-contenido.mjs` corre en `prebuild`
y detiene la compilación. Verificado: `npm run comprobar:contenido` sale con
código 1 y lista `Nombre del artista, ejemplo.com, por definir, prueba.mp4` y
`BORRADOR`. El escape es `PERMITIR_RELLENO=1`, que además obliga a que el sitio
muestre la banda naranja. Es un buen diseño: el escape es ruidoso y visible.

---

## 8 · Cómo se sustituye el contenido

`SUSTITUIR.md` documenta esto para alguien que no programa y es, en general,
correcto. Resumen con las correcciones necesarias:

1. **Textos** → `contenido/contenido.json`. Enlaces: `mailto:`, `tel:` o
   `https://` completos; cualquier otro esquema se degrada a texto plano
   (`src/ui.js:426`).
2. **Guion** → `contenido/guion.txt`, una frase por línea, borrar la línea
   `# BORRADOR`. Después, `GEMINI_API_KEY=… node scripts/generar-narracion.mjs`.
   ⚠ **El script escribe en `public/media/docente-narracion.mp3`, no en
   `artista-narracion.mp3`**, que es lo que el JSON carga. Hay que renombrar a
   mano o corregir el script (`scripts/generar-narracion.mjs:117`).
3. **Vídeo** → grabar sobre fondo liso, exportar con canal alfa (ProRes 4444
   `.mov`), `bash scripts/encode-video.sh master.mov artista` → produce
   `artista-720.mp4` y `-480.mp4`. Apuntar `"video": {"720": …, "480": …}`.
4. **Placa** → fotografiar de frente, guardar como `public/ar/placa.jpg` y
   ejecutar `node scripts/compilar-marcador-headless.mjs`. Obligatorio: el
   guardián compara fechas y se detiene si `targets.mind` es más antiguo.
5. **Medidas** → medir el **ancho de la placa grabada** y escribirlo en
   `placaAnchoCm`: es el único dato que convierte proporciones en centímetros.
6. **Comprobar** → `npm run comprobar:contenido` sin avisos.
7. **Retirar `PERMITIR_RELLENO`** del panel de despliegue.

---

## 9 · Despliegue

Aquí el repositorio se contradice. `vite.config.js:49` y todo el `README.md`
documentan **Cloudflare Pages** (con tabla de campos exactos, `NODE_VERSION=20` y
`PERMITIR_RELLENO=1`), y `public/_headers` está en formato de Cloudflare. Pero
existe `.netlify/state.json` con `siteId: b1c7aa99-…` y `.netlify/netlify.toml`
con `command = "npm run build"`, `publish` apuntando a la ruta absoluta local de
`dist/` y **las mismas reglas de caché traducidas al TOML de Netlify**. `.netlify`
se añadió a `.gitignore` en un cambio **sin commitear** —el único pendiente.

**Inferencia:** el sitio se conectó a Netlify después del último commit, mientras
la documentación seguía describiendo Cloudflare. No se puede determinar desde el
repositorio si está publicado ahora mismo, ni en qué URL.

Debe servirse en la **raíz** de un dominio (`base: '/'`, rutas absolutas) y bajo
**HTTPS**: sin contexto seguro no existe `getUserMedia` y el botón de RA no
aparece, aunque la página siga funcionando.

---

## 10 · Decisiones de diseño detectadas

**Documentadas explícitamente** (en comentarios o README):

- *La RA es opcional y secundaria.* La página funciona entera sin cámara, y los
  dos botones tienen el mismo peso visual (`src/ui.js:140-142`).
- *Contexto antes que permiso.* Se explica para qué se usa la cámara antes de
  dispararse el diálogo del navegador — y se hace conservando el mismo gesto de
  usuario para no romper el desbloqueo de audio de iOS (`src/ui.js:180-186`).
- *Ningún texto visible en el código.* Todo sale del JSON, para que el contenido
  se pueda cambiar sin programar. Las herramientas de desarrollo están exentas.
- *Un solo sujeto acreditado.* Criterio editorial declarado en `README.md:18`.
- *Cero CDN externos.* Fuentes autoalojadas; el sitio no contacta terceros.
- *Herramientas de desarrollo fuera de producción.* `?debug` y `?simular` van
  tras `import.meta.env.DEV`. **Verificado**: cero coincidencias de `simular`,
  `Simular:`, `panel-diagnostico` o `ar-simular` en `dist/`.
- *Geometría en centímetros reales.* El ancho del plano se deduce de la
  proporción del vídeo, para que sustituir el clip no obligue a recalcular nada.

**Inferidas por mí, no documentadas como decisión:** la ausencia de framework
parece buscar que el proyecto siga siendo legible y compilable dentro de años; el
guardián con escape ruidoso sugiere que se esperaba que alguien publicara sin
recordar qué quedaba pendiente; y el rescate a los 15 s anticipa que mucha gente
abrirá el enlace **sin tener la pieza delante**.

---

## 11 · Deuda técnica, riesgos y fragilidades

1. **La narración publicada no dice lo que dice el guion.** `subtitulos.vtt` y
   `artista-narracion.mp3` proceden de una versión anterior del guion. El
   subtítulo que se ve en pantalla hoy empieza: *«Bienvenidos. Soy parte del
   equipo que impulsó esta obra conmemorativa»* — exactamente lo contrario del
   criterio del proyecto. Verificado en ejecución, no leído.
2. **Esa misma narración inventa datos.** Afirma *«bronce fundido, base de madera
   de nogal y una placa de acero grabada»* y describe un proceso de modelado en
   cera y fundición artesanal, cuando la ficha técnica dice «por definir». Si el
   sitio se publicara así, estaría atribuyendo materiales y técnica falsos a una
   obra real.
3. **`generar-narracion.mjs` escribe en la ruta equivocada** (`docente-narracion.mp3`).
   Quien siga `SUSTITUIR.md` al pie de la letra regenerará la voz y no verá ningún
   cambio, sin ningún error que lo avise.
4. **El guardián no revisa `subtitulos.vtt`.** Los puntos 1 y 2 pasan el control
   sin levantar una sola alarma.
5. **La orientación del shader es una apuesta no confirmada con material real.**
   `MASCARA_ARRIBA_DEFECTO = 0` está razonada en el comentario, pero solo se ha
   validado contra una textura sintética. No pude confirmarla visualmente con un
   vídeo con alfa real.
6. **La escala está calculada sobre una estimación.** Con `placaAnchoCm: 10` y el
   clip apaisado actual, el plano mide 33,8 × 19 cm (verificado) — más del doble
   de ancho que la pieza entera (15,3 cm). No es un error del código, pero nadie
   ha visto todavía la escala real sobre la placa real.
7. **`mind-ar` está declarado con `^1.2.5`.** Un `npm install` limpio en el futuro
   puede traer una versión menor distinta contra un `aframe` fijado a `~1.5.0`.
   No hay CI que detecte esa rotura.
8. **No hay integración continua.** `comprobar-contenido.mjs` dice estar pensado
   para CI, pero no existe `.github/`.
9. **`assets-src/` contiene fotografías de una persona identificable** (5,4 MB) y
   audio en bruto. Está bien excluido de git y el primer commit lo documenta,
   pero sigue en disco: una línea borrada del `.gitignore` lo pondría en el
   historial público.
10. **Subtítulo visible en el estado equivocado.** Verificado: durante `cargando`
    ya se pinta el primer subtítulo, porque `cuechange` llama a `setCaption` sin
    consultar el estado; solo se limpia en el siguiente `setState`.

---

## 12 · Incoherencias internas

- **Cloudflare vs Netlify**: `README.md`, `vite.config.js:49` y `public/_headers`
  dicen Cloudflare Pages; `.netlify/` dice Netlify. §9.
- **`scripts/compilar-marcador.md:8-11`** afirma: *«`public/ar/placa.jpg` no
  existe todavía, así que `ar.marcador` está en `null`»*. Ambas cosas son falsas
  hoy: el archivo existe y `ar.marcador` vale `/ar/targets.mind`. Documento no
  actualizado desde el primer commit.
- **Umbral de puntos contradictorio**: `SUSTITUIR.md:261` dice que menos de ~300
  puntos es poco fiable; `scripts/compilar-marcador.md:53` dice menos de ~100.
- **`index.html:6`**: *«El título se sobreescribe desde contenido.json al
  cargar»*. Ya no: se resuelve en compilación (`vite.config.js:28`), como el
  propio `README.md:209` explica.
- **`src/main.js:195`** remite a `contenido-relleno.mjs`; el archivo es
  `contenido-relleno.js`.
- **Clave muerta**: `ar.requisito` (`contenido.json:77`) duplica el texto de
  `entrada.requisito` y **nunca se lee** — `ui.js:164` solo consulta la segunda.
- **Nombres heredados del sujeto anterior**: `package.json` se llama
  `ar-creditos-docente`, el repositorio remoto es `Proyecto-AR-creditos-Docente`,
  `debug.js:25` y `main.js:86` hablan de *«la narración del avatar»* y
  `generar-narracion.mjs:1` de *«la narración del avatar»* — pero el avatar se
  retiró en el commit `b9e4dcc` y el sujeto pasó de «docente» a «artista».
- **`docs/capturas/entrada/*.png` no las genera ningún script del repositorio**:
  `comprobar-ui.mjs` solo produce `380.png` y `900.png`. Las cuatro capturas de
  `entrada/` no son reproducibles y `README.md` ni siquiera menciona `docs/`.
- **`SUSTITUIR.md:88`** promete que el script reescribe `artista-narracion.mp3`.
  No lo hace. §11.3.

---

## 13 · Lo que no se puede saber desde el repositorio

Preguntas abiertas, no defectos. Ninguna tiene respuesta en la carpeta.

1. **¿Quién es el artista?** No hay nombre, contacto, contrato ni nota interna.
2. **¿Existe la pieza física?** `SUSTITUIR.md` da medidas «ya confirmadas»
   (20,7 × 15,3 cm + 5 cm de base), lo que sugiere que sí; pero la placa grabada
   no está medida ni fotografiada.
3. **¿Quién encarga esto y con qué autoridad?** No consta acuerdo con la UTPL,
   departamento responsable ni presupuesto.
4. **¿Está el sitio publicado ahora mismo, y dónde?** Hay un `siteId` de Netlify,
   pero ninguna URL ni registro de despliegue.
5. **¿Se ha pedido la dirección corta bajo dominio UTPL para el QR?**
   `SUSTITUIR.md:317` la exige antes de grabar el metal. Sin rastro de la gestión.
6. **¿Hay consentimiento del artista** para grabarlo, usar su voz o sintetizarla
   con Gemini TTS? Nada lo documenta.
7. **¿Voz real o sintética?** El código admite ambas; `SUSTITUIR.md:90` deja la
   elección abierta sin decir quién decide.
8. **¿Por qué se retiraron el avatar 2.5D y el modelo GLB?** El commit dice *«al
   decidirse la grabación real»*, pero no quién lo decidió ni si es reversible.
9. **¿Cuándo hay que entregar?** Ninguna fecha, hito ni acto conmemorativo.
10. **¿Quién mantendrá esto?** El proyecto está escrito para un relevo, pero no
    dice a quién.
11. **¿Se probó alguna vez en un iPhone real?** El código está lleno de
    precauciones para iOS y no hay ningún registro de una prueba en dispositivo.

Los tres commits están coautorados por `Claude Opus 5`, lo que indica que el
código se escribió con asistencia de IA. Quién revisó el resultado, y con qué
criterio, no consta.

---

## 14 · Si retomas este proyecto, empieza por aquí

1. **Arregla la narración antes que nada.** Es el único fallo que puede publicar
   afirmaciones falsas sobre una obra y una persona reales. Corrige la ruta de
   salida en `scripts/generar-narracion.mjs:117`, regenera voz y subtítulos desde
   el `guion.txt` actual, y añade `subtitulos.vtt` a lo que revisa
   `scripts/comprobar-contenido.mjs`.
2. **Aclara dónde se publica.** Decide Cloudflare Pages o Netlify, borra la
   configuración del que descartes, actualiza `README.md` y `vite.config.js:49`,
   y commitea el cambio pendiente de `.gitignore`. Hasta entonces nadie sabe qué
   pasa al hacer `git push`.
3. **Consigue la placa real: fotografíala y mídela.** Es el cuello de botella de
   todo lo demás — el marcador, la escala del vídeo y la única prueba real de que
   la RA funciona dependen de ese único objeto. Sustituye `placa.jpg`, ejecuta
   `node scripts/compilar-marcador-headless.mjs`, escribe el ancho medido en
   `placaAnchoCm` y pruébalo en un teléfono con HTTPS.
