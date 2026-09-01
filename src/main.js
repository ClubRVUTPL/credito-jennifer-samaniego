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
 * Precarga el motor de RA en tiempo muerto. Solo con ?qr=1: quien acaba de
 * escanear el código de la placa tiene la pieza en la mano y va a pulsar el
 * botón casi seguro, así que compensa adelantar los ~3 MB de A-Frame y
 * MindAR mientras lee la cabecera.
 *
 * Sin ?qr=1 no se precarga nada: el visitante que llega por un enlace
 * compartido no paga esa descarga.
 *
 * requestIdleCallback cede el paso a todo lo demás. Safari no lo implementó
 * hasta hace poco, así que hay un setTimeout de reserva. Los import() son los
 * mismos que hace ar.js, y el módulo queda cacheado: al pulsar el botón, la
 * importación de allí resuelve sin descargar nada.
 */
function precargarMotor() {
  const precargar = () => {
    import('./ar.js').catch(() => {});
    // El orden importa: MindAR necesita window.AFRAME ya definido.
    import('aframe')
      .then(() => import('mind-ar/dist/mindar-image-aframe.prod.js'))
      .catch(() => {
        // Fallo de red al precargar: no se avisa. El intento de verdad es el
        // del clic, y ese sí tiene su camino de error-motor.
      });
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(precargar, { timeout: 3000 });
  } else {
    setTimeout(precargar, 1200);
  }
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
 * Flujo del permiso (importante): pulsar el botón NO pide la cámara. Abre
 * primero una pantalla dentro de la página que explica para qué se usa, que
 * hay que apuntar a la placa y que no se graba nada. La cámara se pide al
 * pulsar "Activar cámara" en esa pantalla — que sigue siendo un gesto del
 * usuario, así que el play() de iOS se mantiene válido.
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

  // A partir de aquí la RA es viable: si la visita viene del QR, adelantamos
  // la descarga del motor mientras el usuario lee.
  if (qrMode) precargarMotor();

  // Un solo gesto. Antes había una pantalla intermedia que explicaba para
  // qué era la cámara y un segundo botón para aceptarla; esa explicación ya
  // está en la propia pantalla de información (la nota con el icono de "i" y
  // la línea de privacidad), así que repetirla en un modal solo añadía una
  // interfaz de por medio y rompía la continuidad hacia la RA.
  //
  // ESTE clic es el gesto que desbloquea el vídeo —que lleva el audio
  // dentro— y el que dispara el diálogo de permiso del navegador.
  refs.arButton.addEventListener('click', () => {
    refs.setArStatus('');
    diag.marcarClic();

    // Trampa de iOS: play() debe llamarse dentro del gesto del usuario, antes
    // de cualquier await. Si se esperase al evento targetFound, Safari
    // bloquearía la reproducción sin lanzar ningún error. Y como el vídeo ya
    // no va silenciado, este play() es además lo único que desbloquea el
    // sonido. El vídeo arranca todavía fuera del documento; ar.js lo pausa en
    // cuanto monta la escena y lo reanuda al detectar la placa.
    const video = createArVideo(resolverVideo(arConfig.video), arConfig.poster);
    diag.setVideo(video);
    // El gesto desbloquea la reproducción en iOS, pero NO debe oírse nada
    // hasta que la placa dispare el vídeo. volume=0 + pausa al primer
    // 'playing' ganan el permiso sin adelantar el audio.
    video.volume = 0;
    const alDesbloquear = () => {
      video.pause();
      video.currentTime = 0;
    };
    video.addEventListener('playing', alDesbloquear, { once: true });
    video.play().catch(() => {
      video.removeEventListener('playing', alDesbloquear);
    });

    import('./ar.js')
      .then((mod) =>
        mod.openAR(
          // pestanas viaja dentro de la configuración porque la capa de RA
          // monta su propia hoja de créditos: consultarlos no debe obligar a
          // salir de la experiencia.
          { ...arConfig, docenteNombre, pestanas, etiquetaCreditos },
          video,
          {
            // Al volver, el foco regresa al botón del que se salió: quien
            // navega con teclado no aterriza al principio de la página.
            // Volver NO impide reentrar — el motor queda en memoria y el
            // permiso ya está concedido, así que la segunda vez es inmediata.
            alVolver: () => refs.arButton.focus(),
            // En producción esta clave se pliega a `undefined`: ni siquiera
            // viaja el nombre de la opción de simulación.
            ...(import.meta.env.DEV ? { simular: simulateMode } : {}),
          }
        )
      )
      .catch((error) => {
        // De cara al usuario, cualquier fallo aquí es lo mismo: el visor no
        // se pudo abrir. Pero este catch cubre DOS cosas muy distintas —que
        // falle la descarga del módulo, y que openAR reviente por dentro— y
        // en desarrollo confundirlas cuesta horas: un error de programación
        // se leía como "no hay conexión". En producción la línea desaparece
        // del bundle; el mensaje al usuario es el mismo en ambos casos.
        if (import.meta.env.DEV) console.error('[ar] no se pudo abrir el visor:', error);
        video.pause();
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
// segundos que está en pantalla son además tiempo libre para que, con ?qr=1,
// el motor de RA se vaya precargando por detrás.
initBienvenida();

init();
