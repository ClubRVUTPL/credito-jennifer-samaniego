// ar.js — Capa de realidad aumentada: montaje bajo demanda y máquina de estados.
//
// Este módulo solo se importa (con import() dinámico) cuando el usuario acepta
// activar la cámara. A su vez, aquí se importan A-Frame y MindAR también de
// forma dinámica: el motor no se descarga nunca en el arranque de la página.
//
// Estados y qué se ve en cada uno:
//   cargando       → "Preparando la cámara"
//   buscando       → escáner de cuatro esquinas + "Apunta a la placa del trofeo"
//   reproduciendo  → la cámara se desenfoca al fondo y el vídeo toma la
//                    pantalla; el escáner desaparece
//   error-camara   → mensaje con sugerencia de revisar permisos
//   error-motor    → mensaje y opción de cerrar
//
// En todos los estados el botón de volver sigue funcionando y devuelve al
// usuario a la pantalla de información intacta.
//
// ── Qué hace la RA aquí y qué no ─────────────────────────────────────────
//
// La RA reconoce la placa. Eso es todo, y es lo que aporta: el objeto físico
// es la llave. Lo que NO hace es anclar el vídeo en 3D sobre el trofeo — se
// intentó, funcionaba con el clip de ensayo y no funciona con la pieza
// definitiva. Las razones, medidas, están en src/reproductor.js.
//
// De ahí una regla que gobierna este fichero: EL SEGUIMIENTO SOLO IMPORTA
// HASTA LA PRIMERA DETECCIÓN. En cuanto el vídeo arranca, targetLost se
// ignora. Nadie sostiene el móvil apuntando a un trofeo durante 82 segundos;
// en cuanto empieza, la mano baja. Si la reproducción dependiera del
// seguimiento, se cortaría justo en ese gesto natural.
//
// El vídeo lleva su propio audio incrustado. No hay pista de narración
// separada ni subtítulos: la narración en .mp3 y el .vtt que existieron antes
// se retiraron, y con ellos el <track>, el listener de cuechange y el nodo de
// subtítulo de esta capa. Quedan en el historial de git, igual que el shader
// de alfa empaquetada (src/alpha-video.js), que ya no se usa pero se conserva
// por si algún día se vuelve al anclaje en 3D con material rodado para ello.

import { diag } from './debug.js';
import {
  iconoAlerta,
  iconoAltavoz,
  iconoCamara,
  iconoVolver,
} from './iconos.js';
import { buildReproductor } from './reproductor.js';

// El fundido de enfoque se retiró: añadía ~1,5 s de cámara borrosa DESPUÉS
// de arReady y hacía sentir que la RA "aún no arrancaba". La cámara se muestra
// nítida en cuanto MindAR emite arReady.

// WARMUP: aciertos seguidos para emitir targetFound. 3 = más rápido que el
// default 5 de MindAR; el parpadeo no importa porque targetLost se ignora.
// MISS: solo afectaría a targetLost (no escuchado).
const WARMUP_TOLERANCE = 3;
const MISS_TOLERANCE = 25;

// NOTA: aquí vivían FILTER_MIN_CF y FILTER_BETA, que suavizaban la pose del
// ancla para que el vídeo anclado no "respirara". Al dejar de anclar el vídeo
// en 3D ya no hay ninguna geometría que tiemble, así que sobran: el vídeo es
// ahora un elemento del DOM y su tamaño y posición no dependen del
// seguimiento. Quedan en el historial de git por si se vuelve al anclaje.

/**
 * Abre la capa de RA sobre la página de contenido.
 * @param {object} arConfig  Bloque "ar" de contenido.json (marcador, vídeo,
 *   geometría, textos).
 * @param {HTMLVideoElement} videoEl  Vídeo ya creado y con play() lanzado
 *   dentro del gesto del usuario. Obligatorio en iOS, y más ahora que el
 *   vídeo no va silenciado: ese play() es lo que desbloquea el sonido.
 *   Ver main.js.
 * @param {{
 *   simular?: boolean,
 *   stream?: MediaStream,
 *   streamPromise?: Promise<MediaStream>,
 *   motorPromise?: Promise<unknown>,
 *   alVolver?: () => void,
 * }} opciones
 *   Preferir `streamPromise` + `motorPromise` lanzados en el clic (main.js)
 *   para que el overlay aparezca al instante y cámara/motor carguen en paralelo.
 */
export async function openAR(arConfig, videoEl, opciones = {}) {
  const simulate = import.meta.env.DEV && Boolean(opciones.simular);

  // Overlay YA: feedback inmediato al clic. Antes se esperaba getUserMedia
  // y luego se montaba la capa → segundos de pantalla estática.
  const overlay = buildOverlay(arConfig, videoEl, import.meta.env.DEV && simulate);
  document.body.appendChild(overlay.root);
  document.body.classList.add('sin-scroll');
  overlay.setState('cargando');
  if (videoEl) {
    videoEl.volume = 0;
    videoEl.pause();
    videoEl.currentTime = 0;
  }

  let closed = false;
  let sceneEl = null;
  let simStream = null;
  let simCamVideo = null;
  let camStream = null;

  const liberarStream = (stream) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // track ya parado
      }
    });
  };

  const close = () => {
    if (closed) return;
    closed = true;
    overlay.pararRescate();
    document.removeEventListener('keydown', alPulsarEscape);

    if (sceneEl) {
      const system = sceneEl.systems['mindar-image-system'];
      if (system) {
        try {
          system.stop();
        } catch {
          // permiso denegado / nunca arrancó
        }
      }
      sceneEl.remove();
    }

    if (simStream) {
      liberarStream(simStream);
      simStream = null;
    }
    if (simCamVideo) simCamVideo.remove();
    if (camStream) {
      liberarStream(camStream);
      camStream = null;
    }

    if (videoEl) {
      videoEl.pause();
      videoEl.volume = 1;
    }
    overlay.root.remove();
    document.body.classList.remove('sin-scroll');

    if (typeof opciones.alVolver === 'function') opciones.alVolver();
  };

  overlay.closeButton.addEventListener('click', close);
  overlay.rescateButton.addEventListener('click', close);

  const alPulsarEscape = (evento) => {
    if (evento.key === 'Escape') close();
  };
  document.addEventListener('keydown', alPulsarEscape);

  if (overlay.soundButton) {
    overlay.soundButton.addEventListener('click', () => {
      videoEl.volume = 1;
      videoEl.muted = false;
      videoEl.play().then(() => overlay.setSoundBlocked(false)).catch(() => {});
    });
  }

  // Cámara + motor EN PARALELO (antes: cámara y luego 3 MB de motor).
  const streamPromise =
    opciones.streamPromise ||
    (opciones.stream ? Promise.resolve(opciones.stream) : Promise.resolve(null));
  const motorPromise =
    opciones.motorPromise ||
    import('aframe').then(() => import('mind-ar/dist/mindar-image-aframe.prod.js'));

  let stream = null;
  try {
    const resultados = await Promise.allSettled([streamPromise, motorPromise]);
    if (closed) {
      if (resultados[0].status === 'fulfilled' && resultados[0].value) {
        liberarStream(resultados[0].value);
      }
      return;
    }

    if (resultados[1].status === 'rejected') {
      if (resultados[0].status === 'fulfilled') liberarStream(resultados[0].value);
      if (videoEl) videoEl.pause();
      overlay.setState('error-motor');
      return;
    }
    diag.marcarMotorCargado();

    if (resultados[0].status === 'rejected') {
      if (videoEl) videoEl.pause();
      overlay.setState('error-camara');
      return;
    }
    stream = resultados[0].value;
    if (!stream && !(import.meta.env.DEV && simulate)) {
      // Sin MediaStream no podemos parchear MindAR; getUserMedia tardío
      // rompería el gesto en iOS. Fallar explícito mejor que colgarse.
      if (videoEl) videoEl.pause();
      overlay.setState('error-camara');
      return;
    }
    camStream = stream;
  } catch {
    if (videoEl) videoEl.pause();
    liberarStream(camStream);
    camStream = null;
    overlay.setState('error-motor');
    return;
  }

  if (closed) {
    liberarStream(camStream);
    camStream = null;
    return;
  }

  if (camStream && !(import.meta.env.DEV && simulate)) {
    inyectarStreamEnMindAR(camStream);
    // NO hacer camStream = null aquí. Si el usuario pulsa Volver antes de
    // arReady, MindAR puede no tener aún this.video y system.stop() falla
    // sin liberar tracks → indicador verde de cámara colgado. close() siempre
    // llama liberarStream(camStream) como red de seguridad (stop idempotente).
  }

  let yaArrancado = false;

  const onFound = () => {
    if (closed || yaArrancado) return;
    yaArrancado = true;

    overlay.setState('reproduciendo');
    overlay.pararRescate();
    overlay.reproductor.mostrar();

    // El vídeo ya no depende del seguimiento: parar el CV libera CPU/GPU en
    // móvil. keepVideo=true deja el preview de cámara vivo detrás.
    if (sceneEl) {
      const system = sceneEl.systems['mindar-image-system'];
      if (system && typeof system.pause === 'function') {
        try {
          system.pause(true);
        } catch {
          // ignore
        }
      }
    }

    if (videoEl) {
      videoEl.volume = 1;
      videoEl.muted = false;
      videoEl.currentTime = 0;
      // Empujar buffer: hasta ahora solo metadata.
      try {
        videoEl.preload = 'auto';
      } catch {
        // ignore
      }
      videoEl
        .play()
        .then(() => overlay.setSoundBlocked(false))
        .catch(() => {
          overlay.setSoundBlocked(true);
        });
    }
  };

  if (import.meta.env.DEV && simulate) {
    /* ── Modo simulado: cámara propia, sin MindAR ─────────────────────── */
    // Si venía un stream del clic, lo liberamos: el modo simulado abre el suyo.
    liberarStream(camStream);
    camStream = null;
    try {
      simStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
    } catch {
      overlay.setState('error-camara');
      return;
    }
    if (closed) {
      simStream.getTracks().forEach((track) => track.stop());
      return;
    }

    // Fondo: el flujo de cámara en un vídeo normal, detrás de la escena.
    simCamVideo = document.createElement('video');
    simCamVideo.className = 'ar-camara-simulada';
    simCamVideo.muted = true;
    simCamVideo.setAttribute('muted', '');
    simCamVideo.setAttribute('playsinline', '');
    simCamVideo.srcObject = simStream;
    simCamVideo.play().catch(() => {});
    overlay.sceneWrap.appendChild(simCamVideo);
    diag.setCamara(simCamVideo);

    sceneEl = buildSimulatedScene();
    overlay.sceneWrap.appendChild(sceneEl);

    sceneEl.addEventListener('loaded', () => {
      if (closed) return;
      diag.marcarCamaraLista();
      if (videoEl) videoEl.pause();
      overlay.setState('buscando');
    });

    // El botón simula la detección de la placa. Solo hacia adelante: igual
    // que en el modo real, una vez arranca el vídeo ya no se vuelve atrás.
    overlay.simButton.addEventListener('click', () => {
      if (closed) return;
      onFound();
      overlay.updateSimButton(true);
    });
    return;
  }

  /* ── Modo real: MindAR con el marcador compilado ──────────────────── */
  sceneEl = buildScene(arConfig);
  overlay.sceneWrap.appendChild(sceneEl);

  sceneEl.addEventListener('arReady', () => {
    if (closed) return;
    diag.marcarCamaraLista();
    const system = sceneEl.systems['mindar-image-system'];
    if (system && system.video) {
      diag.setCamara(system.video);
    }
    if (videoEl) videoEl.pause();
    overlay.setState('buscando');
  });

  sceneEl.addEventListener('arError', () => {
    if (closed) return;
    if (videoEl) videoEl.pause();
    overlay.setState('error-camara');
  });

  // Solo targetFound. targetLost no se escucha a propósito: ver la nota de
  // cabecera sobre por qué el seguimiento deja de importar al arrancar.
  // Hay DOS anclas (cara QR + cara texto de la base): cualquiera dispara
  // la misma experiencia. onFound ya es idempotente (yaArrancado).
  sceneEl.querySelectorAll('[mindar-image-target]').forEach((target) => {
    target.addEventListener('targetFound', onFound);
  });
}

/* ------------------------------------------------------------------ */
/* Entrada en foco de la cámara (retirada: retrasaba la sensación de listo) */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Interfaz de la capa: mensaje, escáner y botones                     */
/* ------------------------------------------------------------------ */

// Textos del botón de simulación: herramienta de desarrollo que no viaja al
// build de producción, exenta de la regla "todo texto sale del JSON".
const SIM_LABEL_FOUND = 'Simular: perder la placa';
const SIM_LABEL_LOST = 'Simular: encontrar la placa';

// Segundos en estado "buscando" tras los cuales se ofrece la salida sin
// cámara. Mucha gente abre el enlace desde una captura compartida, sin tener
// la pieza delante: ese camino no puede ser un callejón sin salida.
const RESCATE_MS = 15000;

// Qué icono acompaña el mensaje de estado en cada estado. 'buscando' y
// 'perdido' no llevan icono propio: ya tienen el escáner (esquinas doradas)
// como referencia visual, un segundo icono ahí sería ruido repetido.
const ICONO_POR_ESTADO = {
  cargando: iconoCamara,
  'error-camara': iconoAlerta,
  'error-motor': iconoAlerta,
};

function buildOverlay(arConfig, videoEl, simulate) {
  const root = document.createElement('div');
  root.className = 'ar-capa';

  const sceneWrap = document.createElement('div');
  sceneWrap.className = 'ar-escena';

  // Barra superior: de quién es la voz que se va a oír. Solo se construye si
  // hay un nombre que mostrar — sin él, una barra vacía sería peor que no
  // tener barra.
  //
  // Aquí había además una insignia "EN VIVO" con un punto pulsante. Se retiró
  // al dejar de anclar el vídeo: lo que se ve es una pieza grabada, y
  // etiquetarla como si fuera una emisión en directo era sencillamente falso.
  let cabecera = null;
  if (arConfig.docenteNombre) {
    cabecera = document.createElement('div');
    cabecera.className = 'ar-cabecera';
    const nombre = document.createElement('span');
    nombre.className = 'ar-cabecera-nombre';
    nombre.textContent = arConfig.docenteNombre;
    cabecera.appendChild(nombre);
  }

  // Escáner: cuatro esquinas + línea de barrido. Sustituye al antiguo
  // retículo cuadrado; ver estilos .ar-escaner* en styles.css.
  const escaner = document.createElement('div');
  escaner.className = 'ar-escaner';
  for (let i = 0; i < 4; i += 1) {
    escaner.appendChild(document.createElement('span')).className = 'ar-escaner-esquina';
  }
  const escanerLinea = document.createElement('span');
  escanerLinea.className = 'ar-escaner-linea';
  escaner.appendChild(escanerLinea);

  const message = document.createElement('p');
  message.className = 'ar-mensaje';
  // role=status: los lectores de pantalla anuncian cada cambio de estado.
  message.setAttribute('role', 'status');
  const messageTexto = document.createElement('span');
  message.appendChild(messageTexto);

  // Volver: flecha, no aspa. El aspa dice "esto se acaba"; la flecha dice
  // "vuelves a donde estabas y puedes entrar otra vez", que es lo que de
  // verdad ocurre. Lleva el texto al lado porque es la salida de la
  // experiencia y no puede depender de que se interprete un icono.
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ar-volver';
  closeButton.append(iconoVolver(), document.createTextNode(arConfig.cerrar || ''));

  // Créditos embebidos bajo el vídeo dentro de la RA (sin modal).
  const tienePestanas = arConfig.pestanas && arConfig.pestanas.length;

  // Rescate a los 15 s buscando: salida explícita a la lectura sin cámara.
  const rescate = document.createElement('div');
  rescate.className = 'ar-rescate';
  rescate.hidden = true;
  const rescateTexto = document.createElement('p');
  rescateTexto.className = 'ar-rescate-texto';
  rescateTexto.textContent = arConfig.rescate?.texto || '';
  const rescateButton = document.createElement('button');
  rescateButton.type = 'button';
  rescateButton.className = 'ar-rescate-boton';
  rescateButton.textContent = arConfig.rescate?.boton || '';
  rescate.append(rescateTexto, rescateButton);

  // Pie de la capa: rescate y mensaje de estado se apilan en una columna en
  // FLUJO normal, no superpuestos con posiciones absolutas. Así no se solapan
  // cuando alguno crece a dos o tres líneas (que es justo lo que pasaba con
  // el rescate sobre el mensaje "Apunta a la placa del trofeo").
  const pie = document.createElement('div');
  pie.className = 'ar-pie';
  pie.append(rescate, message);

  // Barra de controles: solo volver (los créditos están bajo el vídeo).
  const controles = document.createElement('div');
  controles.className = 'ar-controles';
  controles.appendChild(closeButton);

  // El reproductor vive dentro de la capa desde el principio, oculto. No se
  // crea al detectar la placa: montarlo en ese instante metería un salto de
  // layout justo en el momento más delicado de la experiencia.
  const reproductor = buildReproductor(videoEl, arConfig.reproductor || {}, {
    pestanas: tienePestanas ? arConfig.pestanas : null,
    etiquetaCreditos: arConfig.etiquetaCreditos,
  });
  root.append(sceneWrap, escaner, reproductor.root, pie, controles);
  if (cabecera) root.appendChild(cabecera);

  let simButton = null;
  const updateSimButton = (found) => {
    if (import.meta.env.DEV && simButton) {
      simButton.textContent = found ? SIM_LABEL_FOUND : SIM_LABEL_LOST;
    }
  };
  if (import.meta.env.DEV && simulate) {
    simButton = document.createElement('button');
    simButton.type = 'button';
    simButton.className = 'ar-simular';
    updateSimButton(false);
    root.appendChild(simButton);
  }

  // Botón de emergencia: solo aparece si el navegador bloqueó la
  // reproducción pese al desbloqueo intentado en el gesto del clic (ver
  // main.js). Ahora el audio viaja dentro del vídeo, así que esta salida
  // importa más que antes: sin ella, un bloqueo deja al docente hablando en
  // silencio y sin manera de recuperarlo. Un clic aquí SÍ es un gesto nuevo,
  // así que el play() de dentro no debería fallar.
  let soundButton = null;
  if (arConfig.activarSonido) {
    soundButton = document.createElement('button');
    soundButton.type = 'button';
    soundButton.className = 'ar-activar-sonido';
    soundButton.append(iconoAltavoz(), document.createTextNode(arConfig.activarSonido));
    soundButton.hidden = true;
    // También al pie: se apila con el resto en lugar de superponerse.
    pie.insertBefore(soundButton, message);
  }
  const setSoundBlocked = (bloqueado) => {
    if (soundButton) soundButton.hidden = !bloqueado;
  };

  // Temporizador del rescate: arranca al entrar en "buscando" y se cancela
  // en cuanto se encuentra la placa o se cierra la capa.
  let rescateTimer = null;
  const pararRescate = () => {
    if (rescateTimer) clearTimeout(rescateTimer);
    rescateTimer = null;
    rescate.hidden = true;
  };

  // Icono actualmente montado en el mensaje, para no reconstruirlo si el
  // estado cambia pero el icono que le toca es el mismo (evita un parpadeo
  // de icono en transiciones que no lo necesitan).
  let iconoActual = null;

  const setState = (state) => {
    root.dataset.estado = state;
    diag.setEstado(state);
    const text = arConfig.mensajes[state] || '';
    messageTexto.textContent = text;
    message.hidden = text === '';

    const fabricaIcono = ICONO_POR_ESTADO[state] || null;
    if (fabricaIcono !== iconoActual) {
      iconoActual = fabricaIcono;
      const previo = message.querySelector('svg');
      if (previo) previo.remove();
      if (fabricaIcono) message.insertBefore(fabricaIcono(), messageTexto);
    }

    if (state === 'buscando' && !rescateTimer && arConfig.rescate) {
      rescateTimer = setTimeout(() => {
        rescate.hidden = false;
      }, RESCATE_MS);
    } else if (state === 'reproduciendo') {
      pararRescate();
    }
  };

  return {
    root,
    sceneWrap,
    escaner,
    reproductor,
    message,
    closeButton,
    rescateButton,
    pararRescate,
    simButton,
    updateSimButton,
    soundButton,
    setSoundBlocked,
    setState,
  };
}

/* ------------------------------------------------------------------ */
/* Cámara: reutilizar el MediaStream del gesto del usuario             */
/* ------------------------------------------------------------------ */

/**
 * MindAR (A-Frame) siempre crea su propio <video> y llama a getUserMedia
 * dentro de `_startVideo`. Eso rompe en iOS cuando `_startVideo` corre
 * después de `await import(...)`: el gesto ya no está activo y Safari no
 * muestra el diálogo.
 *
 * Esta función sustituye `_startVideo` del sistema por una versión que
 * monta el <video> igual que MindAR pero con el stream ya concedido en el
 * clic. Solo se llama una vez por sesión de RA, antes de crear la escena.
 *
 * @param {MediaStream} stream
 */
function inyectarStreamEnMindAR(stream) {
  const systems = window.AFRAME && window.AFRAME.systems;
  const MindARSystem = systems && systems['mindar-image-system'];
  if (!MindARSystem || !MindARSystem.prototype) return;

  // Conservar el original la primera vez por si hace falta restaurar.
  if (!MindARSystem.prototype._startVideoOriginal) {
    MindARSystem.prototype._startVideoOriginal = MindARSystem.prototype._startVideo;
  }

  MindARSystem.prototype._startVideo = function _startVideoConStream() {
    this.video = document.createElement('video');
    this.video.setAttribute('autoplay', '');
    this.video.setAttribute('muted', '');
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('webkit-playsinline', '');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.style.position = 'absolute';
    this.video.style.top = '0px';
    this.video.style.left = '0px';
    this.video.style.zIndex = '-2';
    this.container.appendChild(this.video);

    let arrancado = false;
    const arrancar = () => {
      if (arrancado) return;
      arrancado = true;
      this.video.setAttribute('width', this.video.videoWidth);
      this.video.setAttribute('height', this.video.videoHeight);
      this._startAR();
    };

    this.video.addEventListener('loadedmetadata', arrancar, { once: true });
    this.video.srcObject = stream;
    // En algunos WebKit el metadata ya está listo al asignar un stream vivo.
    if (this.video.readyState >= 1) arrancar();
    this.video.play().catch(() => {});
  };
}

/* ------------------------------------------------------------------ */
/* Escenas de A-Frame                                                  */
/* ------------------------------------------------------------------ */
//
// Las escenas ya no llevan contenido: su único trabajo es que MindAR mire
// por la cámara y avise cuando reconozca la placa. El ancla existe porque
// MindAR necesita una entidad a la que asociar el objetivo y sobre la que
// emitir targetFound, pero está vacía a propósito — nada se dibuja en 3D.
//
// Aquí vivían buildVideoPlane() (el plano con el shader de alfa empaquetada,
// su cálculo de centímetros a unidades de escena y su colocación al lado de
// la placa) y parseVec3(). Se retiraron al dejar de anclar el vídeo; el
// motivo, medido sobre la pieza definitiva, está en src/reproductor.js.
// Siguen en el historial de git junto con src/alpha-video.js.

/** Escena real: MindAR gestiona cámara, detección y anclaje. */
function buildScene(arConfig) {
  const scene = document.createElement('a-scene');
  scene.setAttribute('embedded', '');
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
  scene.setAttribute(
    'mindar-image',
    // Interfaz propia de MindAR desactivada: los estados los pinta esta capa.
    // maxTrack: 2 → la base tiene DOS caras (QR cuadrado + placa con texto);
    // cualquiera debe abrir la misma RA. warmup/miss: ver constantes arriba.
    `imageTargetSrc: ${arConfig.marcador}; maxTrack: 2; uiScanning: no; uiLoading: no; uiError: no; ` +
      `warmupTolerance: ${WARMUP_TOLERANCE}; missTolerance: ${MISS_TOLERANCE}`
  );
  scene.setAttribute('renderer', 'colorManagement: true');

  const camera = document.createElement('a-camera');
  camera.setAttribute('position', '0 0 0');
  camera.setAttribute('look-controls', 'enabled: false');
  scene.appendChild(camera);

  // Dos anclas vacías: target 0 = cara QR, target 1 = cara texto.
  // El puesto (1.º / 2.º / 3.º) no importa: la experiencia es la misma.
  for (let i = 0; i < 2; i += 1) {
    const anchor = document.createElement('a-entity');
    anchor.setAttribute('mindar-image-target', `targetIndex: ${i}`);
    scene.appendChild(anchor);
  }

  return scene;
}

/** Escena simulada: sin MindAR; solo para probar la interfaz sin la placa. */
function buildSimulatedScene() {
  const scene = document.createElement('a-scene');
  scene.setAttribute('embedded', '');
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
  // alpha: true → el lienzo es transparente y deja ver el vídeo de cámara
  // que hay detrás.
  scene.setAttribute('renderer', 'colorManagement: true; alpha: true');

  const camera = document.createElement('a-entity');
  camera.setAttribute('camera', '');
  camera.setAttribute('position', '0 0 0');
  scene.appendChild(camera);

  return scene;
}
