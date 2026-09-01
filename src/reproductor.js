// reproductor.js — El vídeo, una vez que la placa lo ha desbloqueado.
//
// ── Por qué el vídeo NO va anclado en 3D sobre la placa ───────────────────
//
// Durante el prototipo el vídeo era un plano de A-Frame anclado al marcador,
// con alfa empaquetada y un shader propio (src/alpha-video.js, que sigue en
// el repositorio). Con el clip de ensayo —una figura vertical sobre croma—
// aquello funcionaba. Con la pieza definitiva, no:
//
//   · Está compuesta en 16:9 y usa todo el ancho del cuadro. Medido: con los
//     gestos ocupa hasta el 82 %, así que no se puede recortar a vertical sin
//     cortarle las manos.
//   · El encuadre cambia. Los primeros 17 s el docente está en el tercio
//     derecho; a partir de ahí se pasa al izquierdo y ahí se queda. No existe
//     una posición fija del plano que lo mantenga en pantalla los 86 s.
//   · Dentro del vídeo hay un render 3D del trofeo. Anclado junto al trofeo
//     real, la copia digital acaba tapando la pieza física.
//
// Así que la RA hace lo que mejor hace —reconocer la placa— y el vídeo se
// muestra como la pieza audiovisual que es. La cámara sigue viva y
// desenfocada detrás, de modo que no se sale de la experiencia: se pasa de
// "estoy buscando" a "esto es lo que la placa guardaba".
//
// ── Consecuencia importante: al arrancar, se suelta el seguimiento ────────
//
// Una vez empieza la reproducción, perder la placa deja de importar. Nadie
// sostiene el móvil apuntando a un trofeo durante 82 segundos: en cuanto
// arranca, la mano baja. Si el vídeo dependiera del seguimiento, se cortaría
// justo en ese gesto natural. Quien decide eso es ar.js (ignora targetLost a
// partir de la primera detección); aquí solo queda constancia del motivo.
//
// Ningún texto visible se escribe en este fichero: todo llega de
// contenido/contenido.json, igual que en el resto del proyecto.

import { iconoPausa, iconoReproducir, iconoRepetir } from './iconos.js';
import { buildCreditosInline } from './creditos.js';
import { crearVideoTransparente } from './video-transparente.js';

/**
 * Monta el reproductor alrededor de un <video> ya creado.
 *
 * El elemento llega desde main.js, creado y con play() lanzado dentro del
 * gesto del usuario: en iOS esa es la única forma de que el vídeo pueda
 * sonar. Aquí no se crea ni se sustituye, solo se coloca y se viste.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {object} textos  Bloque ar.reproductor de contenido.json.
 * @param {{pestanas?: Array, etiquetaCreditos?: string}} [opciones]
 * @returns {{root, mostrar, ocultar, estaVisible, destruir}}
 */
export function buildReproductor(videoEl, textos = {}, opciones = {}) {
  const root = document.createElement('div');
  root.className = 'ar-reproductor';
  root.hidden = true;

  const columna = document.createElement('div');
  columna.className = 'ar-reproductor-columna';

  const zonaVideo = document.createElement('div');
  zonaVideo.className = 'ar-reproductor-video-zona';

  const marco = document.createElement('div');
  marco.className = 'ar-reproductor-marco';

  // loop = false: es una pieza con principio y final, no un bucle ambiental;
  // al acabar se ofrece volver a verla en vez de reiniciarla sin avisar.
  videoEl.className = 'ar-reproductor-video';
  videoEl.loop = false;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');

  // El fondo negro se recorta en la GPU y lo que se ve es un lienzo, no el
  // <video>. El elemento de vídeo sigue en el DOM y sigue siendo la fuente
  // —de la imagen y del audio—, pero se esconde por CSS: en iOS no se puede
  // usar display:none, porque un vídeo así no reproduce.
  const transparente = crearVideoTransparente(videoEl);
  if (transparente) {
    marco.dataset.transparente = '';
    marco.appendChild(transparente.canvas);
  } else {
    // Sin WebGL: el vídeo tiene fondo negro puro; screen lo vuelve transparente.
    marco.dataset.fallbackPantalla = '';
  }

  const capaToque = document.createElement('button');
  capaToque.type = 'button';
  capaToque.className = 'ar-reproductor-toque';
  capaToque.setAttribute('aria-label', textos.pausar || '');

  // Barra de progreso. Es informativa, no arrastrable: en una pieza de 80
  // segundos que se ve una vez, una barra de búsqueda añade complejidad y
  // superficie de error sin aportar nada.
  const progreso = document.createElement('div');
  progreso.className = 'ar-reproductor-progreso';
  const progresoBarra = document.createElement('span');
  progresoBarra.className = 'ar-reproductor-progreso-barra';
  progreso.appendChild(progresoBarra);

  marco.append(videoEl, capaToque);

  // Botón central: pausa, reanudación y "ver de nuevo" al terminar. Uno solo
  // en vez de tres, porque en cada momento solo una de las tres acciones
  // tiene sentido.
  const central = document.createElement('button');
  central.type = 'button';
  central.className = 'ar-reproductor-central';
  const centralIcono = document.createElement('span');
  centralIcono.className = 'ar-reproductor-central-icono';
  const centralTexto = document.createElement('span');
  central.append(centralIcono, centralTexto);
  marco.appendChild(central);

  zonaVideo.appendChild(marco);

  let creditosInline = null;
  if (opciones.pestanas && opciones.pestanas.length) {
    creditosInline = buildCreditosInline(opciones.pestanas, opciones.etiquetaCreditos);
    const pieza = document.createElement('div');
    pieza.className = 'ar-reproductor-pieza';
    pieza.append(zonaVideo, creditosInline.root);
    columna.appendChild(pieza);
  } else {
    columna.appendChild(zonaVideo);
  }

  // El progreso va en la raíz y NO dentro del marco. Motivo concreto: el
  // marco lleva un filter (la sombra sobre la silueta) y, en CSS, un elemento
  // con filter se convierte en bloque contenedor de sus descendientes fijos —
  // así que la barra quedaba anclada al vídeo y cruzaba la escena por los
  // pies de la figura en vez de irse al fondo de la pantalla.
  root.append(columna, progreso);

  /* ---------------------------------------------------------------- */
  /* Estado                                                            */
  /* ---------------------------------------------------------------- */

  // 'reproduciendo' | 'pausado' | 'terminado'
  let estado = 'reproduciendo';

  const pintarBoton = () => {
    root.dataset.reproduccion = estado;
    centralIcono.textContent = '';
    if (estado === 'terminado') {
      centralIcono.appendChild(iconoRepetir());
      centralTexto.textContent = textos.verDeNuevo || '';
      central.setAttribute('aria-label', textos.verDeNuevo || '');
    } else if (estado === 'pausado') {
      centralIcono.appendChild(iconoReproducir());
      centralTexto.textContent = textos.reanudar || '';
      central.setAttribute('aria-label', textos.reanudar || '');
    } else {
      centralIcono.appendChild(iconoPausa());
      centralTexto.textContent = '';
      central.setAttribute('aria-label', textos.pausar || '');
    }
    capaToque.setAttribute(
      'aria-label',
      estado === 'reproduciendo' ? textos.pausar || '' : textos.reanudar || ''
    );
  };

  // Si play() es rechazado —el navegador bloqueó la reproducción, o el
  // fichero no se puede decodificar— hay que volver a "pausado". Sin esto el
  // botón se quedaba diciendo "pausar" sobre un vídeo que nunca arrancó, y
  // cada nuevo toque repetía el intento fallido sin dar ninguna señal.
  const intentarReproducir = () => {
    estado = 'reproduciendo';
    pintarBoton();
    videoEl.play().catch(() => {
      estado = 'pausado';
      pintarBoton();
    });
  };

  const alternar = () => {
    if (estado === 'terminado') {
      videoEl.currentTime = 0;
      intentarReproducir();
    } else if (videoEl.paused) {
      intentarReproducir();
    } else {
      estado = 'pausado';
      videoEl.pause();
      pintarBoton();
    }
  };

  capaToque.addEventListener('click', alternar);
  central.addEventListener('click', (evento) => {
    // stopPropagation: el botón está encima de la capa de toque; sin esto un
    // clic contaría dos veces y se pausaría y reanudaría en el mismo gesto.
    evento.stopPropagation();
    alternar();
  });

  const alActualizar = () => {
    const dur = videoEl.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const pct = Math.min(100, (videoEl.currentTime / dur) * 100);
    progresoBarra.style.width = `${pct}%`;
  };

  const alTerminar = () => {
    estado = 'terminado';
    progresoBarra.style.width = '100%';
    pintarBoton();
  };

  // play/pause también pueden venir del sistema (auriculares, centro de
  // control del teléfono), no solo de nuestros botones: el estado se
  // sincroniza escuchando al propio elemento, no solo en los manejadores.
  const alReproducir = () => {
    if (estado !== 'terminado') estado = 'reproduciendo';
    if (transparente) transparente.iniciar();
    pintarBoton();
  };
  const alPausar = () => {
    if (estado !== 'terminado') estado = 'pausado';
    // El bucle NO se detiene al pausar: si se parase, el lienzo se quedaría
    // con el último fotograma dibujado pero sin volver a pintarse, y
    // cualquier cambio de tamaño de la ventana lo dejaría en negro. Cuesta
    // muy poco seguir dibujando un fotograma congelado.
    pintarBoton();
  };

  videoEl.addEventListener('timeupdate', alActualizar);
  videoEl.addEventListener('ended', alTerminar);
  videoEl.addEventListener('play', alReproducir);
  videoEl.addEventListener('pause', alPausar);

  const ajustarProporcion = () => {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (w > 0 && h > 0) {
      const altoVisible = h / w > 0.75 ? h / 2 : h;
      marco.style.aspectRatio = `${w} / ${altoVisible}`;
    }
  };
  marco.style.aspectRatio = '16 / 9';
  if (videoEl.readyState >= 1) ajustarProporcion();
  videoEl.addEventListener('loadedmetadata', ajustarProporcion);

  pintarBoton();

  return {
    root,
    videoEl,
    mostrar() {
      root.hidden = false;
      // Se arranca aquí y no solo en el evento 'play': si la reproducción
      // tardase en empezar, el lienzo ya estaría pintando el cartel o el
      // primer fotograma en vez de un hueco vacío.
      if (transparente) transparente.iniciar();
    },
    ocultar() {
      root.hidden = true;
      if (transparente) transparente.parar();
    },
    estaVisible() {
      return !root.hidden;
    },
    destruir() {
      if (transparente) transparente.destruir();
      videoEl.removeEventListener('timeupdate', alActualizar);
      videoEl.removeEventListener('ended', alTerminar);
      videoEl.removeEventListener('play', alReproducir);
      videoEl.removeEventListener('pause', alPausar);
    },
  };
}
