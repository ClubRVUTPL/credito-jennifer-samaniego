// main.js — Punto de entrada.
//
// La capa de contenido se pinta al cargar, antes que cualquier otra cosa.
// La capa de realidad aumentada (ar.js, A-Frame y MindAR) NO forma parte de
// la carga inicial: se importa con import() dinámico dentro del clic del botón.
//
// El recorrido completo son tres capas sobre un mismo fondo, en este orden:
//   1. bienvenida.js  portada INNOVA DOCENTE (marcado en index.html)
//   2. ui.js          pantalla de felicitación, con la acción de entrar
//   3. ar.js          la cámara, el vídeo anclado y la hoja de créditos
// Ninguna cambia el color del fondo: por eso se leen como una sola cosa.
//
// Parámetros de URL, SOLO en desarrollo (ver más abajo):
//   ?debug=1    panel de diagnóstico superpuesto (src/debug.js)
//   ?simular=1  capa de RA sin marcador: cámara real, detección simulada
//
// Ambos van encerrados tras import.meta.env.DEV. Vite sustituye esa constante
// por `false` al compilar para producción, así que Rollup elimina las ramas
// enteras del bundle: en dist/ los parámetros no existen y no hacen nada.
//
// Parámetro que SÍ funciona en producción:
//   ?qr=1  la visita viene de escanear el código de la placa, así que la
//          persona tiene la pieza delante. Cambia los textos de entrada (que
//          dejan de preguntar si la tiene) y precarga el motor de RA en
//          tiempo muerto, para que el botón responda al instante.
//          Es el parámetro que debe llevar la URL grabada en el QR.

import './styles.css';
import { initBienvenida } from './bienvenida.js';
import { renderPage, renderLoadError } from './ui.js';
import { initDebug, diag } from './debug.js';

const root = document.querySelector('#app');
const params = new URLSearchParams(window.location.search);

// En producción estas dos constantes son literalmente `false` tras el build.
const simulateMode = import.meta.env.DEV && params.has('simular');
const debugMode = import.meta.env.DEV && params.has('debug');

// Este NO va tras import.meta.env.DEV: es el parámetro de la URL del QR y
// tiene que funcionar en el sitio publicado.
const qrMode = params.has('qr');

// Los estilos de esas dos herramientas viven aparte y solo se cargan en
// desarrollo: así tampoco entran en el CSS de producción.
if (import.meta.env.DEV) {
  import('./dev.css');
  if (debugMode) initDebug();
}

async function loadContent() {
  const response = await fetch('/contenido/contenido.json');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Elige la resolución del vídeo del artista.
 *
 * ar.video admite dos formas en el JSON:
 *   "/media/artista-720.mp4"                    → una sola ruta
 *   { "720": "/media/…-720.mp4", "480": "…" }   → dos resoluciones
 *
 * Con dos resoluciones se consulta navigator.connection: en 2G/3G o con
 * ahorro de datos activado se sirve la de 480. Safari e iOS no implementan
 * esa API, así que allí siempre cae en 720, que es el valor por defecto
 * deliberado (mejor calidad; el vídeo solo se descarga al activar la RA).
 */
export function resolverVideo(video) {
  if (!video) return null;
  if (typeof video === 'string') return video;

  const conexion = navigator.connection;
  const lenta =
    conexion &&
    (conexion.saveData === true || /(^|-)(2g|3g)$/.test(conexion.effectiveType || ''));

  return (lenta && video['480']) || video['720'] || video['480'] || null;
}

/**
 * Crea el elemento de vídeo de la capa de RA.
 *
 * El vídeo lleva el audio del docente INCRUSTADO: no hay pista de narración
 * aparte. Por eso NO se silencia, y por eso el play() tiene que ocurrir
 * dentro del gesto del usuario (ver setupArButton): un vídeo con sonido no
 * puede arrancar solo ni en iOS ni en Chrome.
 *
 * playsinline sigue siendo obligatorio en iOS —es lo que impide que Safari
 * se lleve el vídeo a pantalla completa y destruya la escena—, pero no tiene
 * nada que ver con el silencio: eso lo decidía el atributo muted, que aquí ya
 * no ponemos.
 *
 * NO lleva loop: la pieza tiene apertura y cierre, y al terminar el
 * reproductor ofrece verla de nuevo en vez de reiniciarla sin avisar.
 *
 * preload 'auto' con el vídeo definitivo (unos 15 MB) sería agresivo: se
 * descargaría entero aunque la persona no llegue a apuntar nunca a la placa.
 * Con 'metadata' el navegador solo trae la cabecera —lo justo para conocer la
 * duración y montar la barra de progreso— y el resto llega en cuanto empieza
 * la reproducción, que es a lo que sirve -movflags +faststart al codificar.
 */
function createArVideo(src, poster) {
  const video = document.createElement('video');
  video.src = src;
  if (poster) video.poster = poster;
  video.loop = false;
  video.preload = 'metadata';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  return video;
}

// Navegadores embebidos dentro de otra aplicación. En varios de ellos
// (Instagram y Facebook en iOS, sobre todo) navigator.mediaDevices no existe
// o getUserMedia falla siempre: la RA es imposible por mucho que el usuario
// acepte. Sin esta detección el botón desaparecía sin explicación y parecía
// que la página estuviera rota.
const NAVEGADOR_EMBEBIDO = /(FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|Line\/|TikTok|Snapchat)/i;

function esNavegadorEmbebido() {
  return NAVEGADOR_EMBEBIDO.test(navigator.userAgent || '');
}

/**
 * Precarga el motor de RA y el marcador en cuanto la RA es viable.
 *
 * Antes solo se hacía con ?qr=1 y con idle de hasta 3 s. Eso dejaba el primer
 * clic esperando ~3 MB de A-Frame + MindAR en LTE: la cámara "tardaba" aunque
 * el permiso fuera inmediato. Ahora se adelanta siempre (el botón ya implica
 * que el visitante puede entrar) y con un idle corto.
 *
 * Los import() quedan en caché del módulo: al pulsar, openAR no vuelve a
 * descargar. fetch del .mind calienta la caché HTTP del navegador.
 */
function precargarMotor(marcadorUrl) {
  const precargar = () => {
    import('./ar.js').catch(() => {});
    // El orden importa: MindAR necesita window.AFRAME ya definido.
    import('aframe')
      .then(() => import('mind-ar/dist/mindar-image-aframe.prod.js'))
      .catch(() => {});
    if (marcadorUrl) {
      // Solo calienta caché; no parseamos el binario aquí.
      fetch(marcadorUrl, { credentials: 'same-origin' }).catch(() => {});
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(precargar, { timeout: 800 });
  } else {
    setTimeout(precargar, 200);
  }
}

/** Arranca A-Frame + MindAR (misma secuencia que openAR). */
function cargarMotorAR() {
  return import('aframe').then(() => import('mind-ar/dist/mindar-image-aframe.prod.js'));
}

/**
 * Conecta el botón de RA y la pantalla de contexto del permiso.
 *
 * El botón solo aparece si se cumplen las tres condiciones:
 *  - getUserMedia existe (contexto seguro con cámara disponible)
 *  - ar.marcador tiene valor en el JSON (hay un targets.mind compilado)
 *  - ar.video tiene valor (hay algo que anclar sobre la placa)
 *
 * Si falta el marcador o el vídeo, el botón queda oculto y la página funciona
 * como página normal, sin pedir nada.
 *
 * Si lo que falta es la cámara hay que distinguir dos casos. En HTTP plano
 * (probando en la IP local) esconder el botón es lo correcto y no hace falta
 * explicar nada. Pero dentro del navegador de Instagram o WhatsApp el usuario
 * SÍ esperaba que funcionara —le acaban de pasar el enlace— y un botón que no
 * aparece se lee como que la página está rota. Ahí se le dice qué hacer.
 *
 * Excepción de desarrollo: con ?simular=1 el marcador no hace falta, porque
 * la detección se dispara a mano. La cámara y el vídeo siguen siendo
 * imprescindibles.
 *
 * Flujo del permiso: el clic del botón pide la cámara al momento (gesto de
 * usuario) y monta la capa de RA en paralelo con la carga del motor. Ya no
 * hay pantalla intermedia de "Activar cámara".
 */
function setupArButton(refs, arConfig, entrada, docenteNombre, pestanas, etiquetaCreditos) {
  const cameraAvailable = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const markerAvailable = Boolean(arConfig && arConfig.marcador);
  const videoAvailable = Boolean(arConfig && resolverVideo(arConfig.video));

  if (!videoAvailable || (!markerAvailable && !simulateMode)) return;

  if (!cameraAvailable) {
    // Único caso en el que la ausencia de cámara se explica en pantalla.
    if (esNavegadorEmbebido() && entrada && entrada.navegadorEmbebido) {
      refs.setArStatus(entrada.navegadorEmbebido);
    }
    return;
  }

  refs.arButton.hidden = false;

  // Adelantar motor + marcador mientras se lee la felicitación. Con o sin
  // ?qr=1: el cuello de botella del primer clic era precisamente esa descarga.
  precargarMotor(arConfig.marcador);

  // Un solo gesto. Dentro del clic, SIN esperar unos a otros:
  //   1. play() del vídeo (desbloqueo de audio iOS)
  //   2. getUserMedia (permiso de cámara)
  //   3. import de ar.js + A-Frame + MindAR
  // openAR monta el overlay al instante y espera en paralelo stream + motor.
  // Antes era en serie (cámara → luego 3 MB de motor): latencia percibida alta.
  refs.arButton.addEventListener('click', () => {
    refs.setArStatus('');
    diag.marcarClic();
    refs.arButton.disabled = true;

    // Trampa de iOS: play() dentro del gesto, antes de cualquier await.
    const video = createArVideo(resolverVideo(arConfig.video), arConfig.poster);
    diag.setVideo(video);
    // volume=0 + pausa al primer 'playing': desbloquea sin adelantar el audio.
    // preload sigue en 'metadata' para no competir con la descarga del motor.
    video.volume = 0;
    const alDesbloquear = () => {
      video.pause();
      video.currentTime = 0;
    };
    video.addEventListener('playing', alDesbloquear, { once: true });
    video.play().catch(() => {
      video.removeEventListener('playing', alDesbloquear);
    });

    // Constraints mínimas: facingMode ideal. Pedir 1280×720 retrasaba el
    // arranque en muchos móviles sin mejorar el tracking de MindAR.
    const streamPromise = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });

    // Motor en paralelo al permiso de cámara (no después).
    const motorPromise = cargarMotorAR();

    import('./ar.js')
      .then((mod) =>
        mod.openAR(
          { ...arConfig, docenteNombre, pestanas, etiquetaCreditos },
          video,
          {
            streamPromise,
            motorPromise,
            alVolver: () => {
              refs.arButton.disabled = false;
              refs.arButton.focus();
            },
            ...(import.meta.env.DEV ? { simular: simulateMode } : {}),
          }
        )
      )
      .catch((error) => {
        video.pause();
        refs.arButton.disabled = false;
        streamPromise
          .then((stream) => stream.getTracks().forEach((track) => track.stop()))
          .catch(() => {});
        if (import.meta.env.DEV) console.error('[ar] no se pudo abrir el visor:', error);
        refs.setArStatus(arConfig.mensajes['error-motor']);
      });
  });
}

async function init() {
  let content;
  try {
    content = await loadContent();
  } catch {
    renderLoadError(root);
    return;
  }

  // El <title> ya viene resuelto en el HTML: lo inyecta el plugin
  // 'titulo-desde-contenido' de vite.config.js en tiempo de compilación,
  // leyendo este mismo JSON. Así no hay parpadeo de un título provisional.

  // La banda naranja "Contenido de prueba" que se pintaba aquí se retiró: en
  // una pieza que se entrega en un acto, un cartel de advertencia sobre la
  // felicitación desluce el reconocimiento.
  //
  // Lo que NO se ha tocado es el guardián de compilación
  // (scripts/comprobar-contenido.mjs), que sigue impidiendo publicar con
  // `npm run build` mientras queden textos de relleno o el vídeo de ensayo.
  // Esa es la protección que de verdad importa: la banda solo avisaba a
  // quien ya estaba mirando; el guardián detiene el despliegue.

  // ?qr=1: quien llega escaneando la placa ya tiene la pieza delante, así que
  // los textos que preguntaban por ello sobran. Las claves de entrada.qr
  // pisan a las de entrada; lo que no esté definido allí se queda como está.
  if (qrMode && content.entrada && content.entrada.qr) {
    content.entrada = { ...content.entrada, ...content.entrada.qr };
  }

  const refs = renderPage(root, content);
  setupArButton(
    refs,
    content.ar,
    content.entrada,
    content.docente && content.docente.nombre,
    content.pestanas,
    content.placa && content.placa.titulo
  );
}

// La portada se activa aparte de init() y antes que él, a propósito: no
// depende de que contenido.json llegue, así que se cierra igual aunque la
// carga del contenido falle y la página acabe mostrando el error. Los
// segundos que está en pantalla son además tiempo libre para que el motor
// de RA (precargarMotor) empiece a bajarse en idle.
initBienvenida();

init();
