# Créditos del docente · Realidad aumentada

Página web que se abre al escanear el código QR grabado en la placa del
trofeo. Muestra los créditos de quien creó la pieza (concepto, ficha técnica,
proceso y contacto) y, de forma opcional, una capa de realidad aumentada que
reconoce la placa y ancla sobre ella un vídeo del docente contando la obra.

- **Capa de contenido**: funciona siempre, sin cámara ni permisos.
- **Capa de RA**: se activa desde un botón, tras una pantalla que explica para
  qué se usará la cámara. El motor (A-Frame + MindAR) solo se descarga en ese
  momento — salvo con `?qr=1`, que lo adelanta (ver más abajo).

El vídeo anclado es **un único `.mp4` vertical con el audio incrustado**. No
hay pista de narración aparte ni subtítulos: la narración en `.mp3`, el `.vtt`
y el script que los generaba se retiraron y quedan en el historial de git.

> **¿Vienes a cambiar textos, el vídeo o la foto de la placa?**
> No necesitas este archivo: sigue **[SUSTITUIR.md](SUSTITUIR.md)**, escrito
> para quien no programa.

## A quién acredita

La experiencia acredita **a quien creó físicamente la pieza**, y a nadie más.
Los textos y el vídeo deben mantener ese criterio: si en algún momento se
quiere reconocer también al equipo o a la institución, hay que decidirlo
explícitamente y reescribir el conjunto, no mezclarlo.

Ahora que la voz va dentro del vídeo, ese criterio se cumple o se incumple
**en el rodaje**: quien aparece hablando es quien queda acreditado, y no hay
forma de matizarlo después desde el JSON.

## Requisitos

- Node.js 18 o superior.
- FFmpeg (solo para preparar el vídeo): `winget install Gyan.FFmpeg`

## Arrancar

```
npm install
npm run dev
```

El servidor queda expuesto a la red local (`--host`); Vite imprime las URL
disponibles al arrancar.

## Probar en un teléfono real

La cámara (`getUserMedia`) exige HTTPS: no basta con abrir la IP local.

**Opción recomendada — túnel de Cloudflare.** Con el servidor de desarrollo en
marcha, en **otra terminal**:

```
npm run tunel
```

Imprime una URL `https://…trycloudflare.com` con certificado válido. Requiere
`cloudflared` (`winget install Cloudflare.cloudflared`).

**Si la red bloquea los túneles.** En algunas redes institucionales el puerto
7844 (saliente) está cerrado y `cloudflared` no conecta; `localtunnel` suele
estar bloqueado también. En ese caso, sirve por HTTPS directamente en la IP
local con un certificado autofirmado:

```
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 7 -nodes \
  -subj "/CN=localhost" -addext "subjectAltName=IP:TU.IP.LOCAL"
```

y arranca Vite con esa pareja de archivos (`server.https`). El móvil avisará
de "conexión no privada": es esperado con un certificado propio, y basta
aceptar para continuar. Sigue siendo HTTPS real, así que la cámara funciona.

Nota: la capa de contenido sí puede probarse por HTTP con la IP local; sin
HTTPS el navegador no ofrece cámara, así que el botón de RA no aparece (es el
comportamiento previsto, no un fallo).

## El vídeo del docente

El contenido anclado a la placa es **siempre** el vídeo de `ar.video`: un
único `.mp4` vertical, con el docente hablando y **su audio dentro del propio
archivo**. Durante el prototipo existieron un avatar recorte 2.5D, un modelo
GLB de respaldo y una pista de narración con subtítulos aparte; todo eso se
retiró. Queda en el historial de git.

Consecuencias de que el audio vaya incrustado:

- El elemento `<video>` **no se silencia**. Por eso su `play()` tiene que
  ocurrir dentro del gesto del usuario (el clic en "Activar cámara"): un vídeo
  con sonido no arranca solo ni en iOS ni en Chrome. `playsinline` sigue
  puesto, pero eso es otra cosa: es lo que evita que Safari se lleve el vídeo
  a pantalla completa.
- Si aun así el navegador bloquea la reproducción, la capa de RA muestra el
  botón **"Activar sonido"** (`ar.activarSonido`). Un clic ahí es un gesto
  nuevo y desbloquea.
- El vídeo va **en bucle**. Al perder la placa se **pausa**, y al recuperarla
  **reanuda donde estaba**, no desde el principio. Solo se rebobina una vez,
  al arrancar la cámara.

El vídeo usa **alfa empaquetada**: el color ocupa la mitad superior del
fotograma y la máscara de opacidad, en escala de grises, la inferior. El
compositor vigente es `src/video-transparente.js` (WebGL crudo). El encode
correcto en Windows es `scripts\encode-jennifer-alfa.bat` (color arriba, máscara
abajo, `vstack`). No hay otro pipeline de vídeo para producción.

- Comprobar recorte con el MP4 real: `http://localhost:5173/banco-video-transparente.html`
  y `npm run comprobar:transparencia`.
- Fondo verde → alfa empaquetada (Git Bash): `bash scripts/quitar-fondo-verde.sh croma.mp4 docente`
- Máster que ya trae alfa: `bash scripts/encode-video.sh master.mov docente`
  produce las versiones de 720 y 480 con las banderas de compatibilidad de iOS
  (`-pix_fmt yuv420p`, `+faststart`) y **conserva la pista de audio del máster**
  (AAC 128k). Si el máster viene mudo, el script avisa por pantalla.
- La página elige entre 720 y 480 según `navigator.connection`; en Safari, que
  no implementa esa API, sirve siempre 720.

En Windows, los scripts `.sh` se ejecutan desde Git Bash.

## El marcador

`public/ar/placa.jpg` es la imagen que la cámara debe reconocer; hoy es una
placa **dibujada por código** (`node scripts/generar-placa.mjs`), provisional
hasta que exista la pieza real. Se compila a `public/ar/targets.mind` con:

```
node scripts/compilar-marcador-headless.mjs
```

**Sustituir la imagen obliga a recompilar el marcador.** Si no se hace, la RA
seguirá buscando la placa antigua y no reconocerá nada. Para que no pase por
descuido, `npm run comprobar:contenido` compara las fechas de los dos archivos
y detiene la compilación si `targets.mind` es más antiguo que `placa.jpg`.

## Guardián de contenido

`npm run build` ejecuta antes `scripts/comprobar-contenido.mjs`, que **detiene
la compilación** en cinco casos:

1. Quedan palabras de relleno en `contenido/contenido.json`.
2. `ar.video` sigue apuntando a `prueba.mp4`, el clip sintético.
3. `ar.geometria.placaAnchoCm` sigue en **10**, que es la estimación inicial y
   no una medida de la placa real.
4. `targets.mind` es más antiguo que `placa.jpg` (marcador sin recompilar).
5. El JSON apunta a archivos que no existen en `public/`.

Palabras vigiladas: `Nombre del docente`, `ejemplo.com`, `por definir`,
`Edita este texto`, `prueba.mp4`. La lista vive en
`src/contenido-relleno.js` y la comparten el guardián y el navegador, que con
ella decide si pintar la banda **"Contenido de prueba"**.

La comprobación 3 es la menos obvia y la más cara de equivocar: MindAR toma el
ancho de la placa como unidad de escena, así que de ese número depende el
tamaño con el que aparece la figura sobre la pieza. Ver el apartado 3 bis de
[SUSTITUIR.md](SUSTITUIR.md).

Para compilar igualmente una versión de pruebas:

```
npm run build:prototipo
```

Ese script pone `PERMITIR_RELLENO=1` con **cross-env**, así que funciona igual
en bash, en PowerShell y en `cmd`. No escribas `PERMITIR_RELLENO=1 npm run
build`: esa sintaxis es solo de bash y en PowerShell falla con
`CommandNotFoundException`.

`build:prototipo` trae su propio `prebuild:prototipo`, de modo que el guardián
sigue ejecutándose y sigue imprimiendo la lista de lo que queda por sustituir;
lo único que cambia es que no detiene la compilación. `npm run build`, el de
producción, no lleva la variable y por tanto sí se detiene.

El guardián es Node puro y no abre ningún navegador, a propósito: el contenedor
de compilación de Vercel no trae Chrome ni Edge.

## Herramientas de desarrollo

Ninguna entra en el build de producción.

- **Banco del compositor WebGL** — `http://localhost:5173/banco-video-transparente.html`
  Sube el MP4 real (`jennifer-samaniego-720.mp4`) al compositor de `src/video-transparente.js`.
  Correcto = docente a color sobre damero, sin silueta blanca.

- **Banco de pruebas del shader A-Frame** — `http://localhost:5173/banco-shader.html`
  Valida el shader `alfa-empaquetada` (legado, no usa la RA actual) con una
  textura generada por código.

- **Generador de la placa** — `node scripts/generar-placa.mjs`

- **Compilador del marcador** — `node scripts/compilar-marcador-headless.mjs`
  Necesita `--use-angle=swiftshader` (ya incluido): sin esa bandera,
  TensorFlow no encuentra WebGL en headless y la compilación se cuelga.

- **Panel de diagnóstico** — `?debug=1`. Estado de la RA, FPS, resolución de
  cámara, tiempos de carga y últimos mensajes de consola.

- **Seguimiento simulado** — `?simular=1`. Monta la escena con la cámara real
  y un botón que dispara encontrado/perdido a mano. Combinable: `?simular=1&debug=1`.

- **Comprobaciones automáticas** — `npm run comprobar` (usa navegador, solo local).
  `npm run comprobar:contenido` (Node puro, corre también en CI).

> `?debug` y `?simular` están encerrados tras `import.meta.env.DEV`. Vite
> sustituye esa constante por `false` al compilar, de modo que Rollup elimina
> las ramas enteras: **en `dist/` los parámetros no existen y no hacen nada**,
> ni el JS ni el CSS (que vive aparte en `src/dev.css`).

## El parámetro `?qr=1`

A diferencia de los dos anteriores, **este sí funciona en producción**: es el
que debe llevar la URL grabada en el código QR de la placa.

Indica que la visita viene de escanear la pieza, es decir, que la persona la
tiene delante. Con él:

- Los textos de entrada cambian. Las claves de `entrada.qr` en
  `contenido/contenido.json` pisan a las de `entrada`, de modo que la página
  deja de preguntar si tiene la pieza y pasa a decirle dónde está la placa.
- **Se adelanta la descarga del motor de RA** (A-Frame + MindAR, unos 3 MB)
  con un `import()` dentro de `requestIdleCallback`, mientras el usuario lee
  la cabecera. Al pulsar el botón, el módulo ya está en caché y la cámara
  abre casi al instante.

Sin `?qr=1` no se precarga nada: quien llega por un enlace compartido no paga
esa descarga si no va a usar la RA. La precarga tampoco se lanza si el botón
de RA no llega a mostrarse.

## Navegadores embebidos

Dentro del navegador de Instagram, Facebook o WhatsApp, `getUserMedia` no
está disponible en varios dispositivos y la RA es imposible por mucho que el
usuario acepte el permiso. Antes el botón simplemente no aparecía, y eso se
leía como que la página estaba rota.

Ahora, si se detecta uno de esos navegadores **y** además falta
`getUserMedia`, en lugar del botón se muestra el texto de
`entrada.navegadorEmbebido`, que invita a abrir la página en Safari o Chrome.
La lectura sin cámara sigue disponible igual.

En HTTP plano (probando en la IP local) el botón se sigue ocultando sin
mensaje: ahí es el comportamiento correcto y no hay nada que explicar.

## Tipografías

Montserrat autoalojada en `public/fonts/`
(subconjuntos latín y latín extendido, `font-display: swap`, licencia OFL).
Para cambiar pesos o familias: editar y ejecutar
`node scripts/descargar-fuentes.mjs`, que regenera `src/fuentes.css`.
**Ningún asset se carga desde CDN externos**: el sitio no contacta ningún
dominio de terceros, ni al cargar ni al abrir la RA.

## Estructura

```
index.html                    arranque (solo carga src/main.js)
banco-shader.html             herramienta de desarrollo: valida el shader
compilador-marcador.html      herramienta de desarrollo: compila el marcador
src/main.js                   punto de entrada, permiso, ?qr=1, precarga
src/ui.js                     entrada, pantalla de permiso, pestañas y paneles
src/ar.js                     escena de RA y máquina de estados
src/alpha-video.js            shader de transparencia 'alfa-empaquetada'
src/contenido-relleno.js      detección de relleno (navegador + guardián)
src/debug.js                  panel de diagnóstico (?debug=1)
src/styles.css                estilos
src/dev.css                   estilos solo de desarrollo (no van a producción)
contenido/contenido.json      todos los textos de la página
vercel.json                   build, output y cabeceras de caché (Vercel)
public/ar/                    placa.jpg + targets.mind
public/media/                 el vídeo del docente (con su audio dentro)
scripts/                      generación de placa, marcador y vídeo
scripts/lib-cdp.mjs           cliente DevTools compartido por las herramientas
```

`assets-src/` (material en bruto: fotografías y audio sin procesar) está
**excluido del control de versiones** en `.gitignore`. Contiene imágenes de
personas identificables y no debe entrar en el historial.

## Build de producción

```
npm run build
```

Genera `dist/` autocontenida (incluye `contenido/`). Se sirve desde cualquier
hosting estático con HTTPS; no hay backend.

El `<title>` se resuelve **en tiempo de compilación** desde `contenido.json`
(plugin `titulo-desde-contenido` en `vite.config.js`), no en tiempo de
ejecución: así no se ve un título provisional durante el primer pintado.

## Despliegue en Vercel

La única plataforma de publicación es **Vercel**. La configuración vive en
`vercel.json`: `npm run build`, salida `dist/`, y cabeceras de caché.

Se publica en la **raíz** del dominio: `base` está fijado a `/` en
`vite.config.js` y todas las rutas son absolutas (`/contenido/…`, `/fonts/…`,
`/ar/…`, `/media/…`), así que **no funcionaría colgado de un subdirectorio**.

El comando de producción es `npm run build`. El guardián de contenido corre en
`prebuild` y detiene la compilación si queda relleno. `build:prototipo` existe
solo para pruebas locales, no para el deploy.

### Publicar

Con el repositorio conectado a Vercel, cada `git push` a `main` compila y
publica. No uses URLs de un deployment concreto (`…-hash-….vercel.app`); usa el
dominio estable del proyecto.

### Caché

Las cabeceras están en `vercel.json` (Vercel no lee `public/_headers`):

- `/assets/*` y `/fonts/*` → `max-age=31536000, immutable`
- `/contenido/*` y `/ar/*` → `max-age=0, must-revalidate`
- `/media/*` → `max-age=300, must-revalidate` (no altera Range requests del MP4)
- El HTML nunca se cachea

### El código QR

El QR grabado en la placa **no debe apuntar a una URL de preview de Vercel**
(`…-hash-….vercel.app`), sino a una dirección corta bajo dominio de la UTPL que
redirija al dominio de producción. Ver el apartado 7 de [SUSTITUIR.md](SUSTITUIR.md).

La dirección final a la que redirija debe terminar en **`?qr=1`**, para que la
página sepa que quien llega tiene la pieza delante. Si la redirección de la
UTPL se lleva el parámetro por el camino, la página sigue funcionando: solo
pierde los textos afinados y la precarga del motor.
