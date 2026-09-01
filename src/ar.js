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

// Cuánto tarda la cámara en pasar de desenfocada a nítida al entrar, y
// cuánto se queda borrosa antes de empezar a enfocar.
//
// Este fundido no es decoración: ocupa el hueco que antes era una pantalla
// negra con "Preparando la cámara" mientras MindAR arrancaba. En vez de una
// espera muerta, la imagen del mundo real "revela" y entra en foco delante
// del usuario, que es el momento en que la experiencia deja de ser una
// página y pasa a ser realidad aumentada.
const ENFOQUE_ESPERA_MS = 380;
const ENFOQUE_MS = 1150;

// A cuánto baja el volumen del vídeo mientras la hoja de créditos está
// abierta encima. Ya no se usa: los créditos van embebidos bajo el vídeo.
// Cuántos fotogramas consecutivos de seguimiento fallido tolera MindAR antes
// de dar la placa por perdida (y, simétricamente, cuántos aciertos seguidos
// exige antes de darla por encontrada). Son los parámetros nativos del motor
// para exactamente este problema — no hace falta reinventar una histéresis
// propia por encima: es la causa real del "titileo" al perder el enfoque un
// instante (motion blur, autoenfoque, un dedo tapando la cámara un momento).
//
// Con los valores por defecto de MindAR (5 fotogramas cada uno) basta una
// fracción de segundo de mala lectura para que la placa se dé por perdida:
// el vídeo se oculta y reaparece todo el rato. MISS_TOLERANCE más alto pide
// una pérdida sostenida —de verdad, la placa fuera de cuadro— antes de
// ocultar nada.
//
// Ajustar aquí si hace falta más tras probar en el teléfono real: MindAR
// cuenta FOTOGRAMAS PROCESADOS, no milisegundos, y esa tasa varía según la
// potencia del equipo. Si en un móvil concreto la placa tarda demasiado en
// darse por perdida, baja MISS_TOLERANCE; si sigue parpadeando, súbelo.
const WARMUP_TOLERANCE = 8; // aciertos seguidos para darla por ENCONTRADA
const MISS_TOLERANCE = 25; // fallos seguidos para darla por PERDIDA

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
 * @param {{simular?: boolean}} opciones
 */
export async function openAR(arConfig, videoEl, opciones = {}) {
  // La comprobación se escribe SIEMPRE como `import.meta.env.DEV && …` en
  // cada punto de uso, no a través de una variable intermedia. Vite sustituye
  // esa constante por el literal `false` al compilar, y solo así puede Rollup
  // plegar la condición y eliminar del bundle todo el modo simulado: la
  // escena falsa, el botón, sus textos y el vídeo de cámara propio.
  const simulate = import.meta.env.DEV && Boolean(opciones.simular);

  const overlay = buildOverlay(arConfig, videoEl, import.meta.env.DEV && simulate);
  document.body.appendChild(overlay.root);
  document.body.classList.add('sin-scroll');

  let closed = false;
  let sceneEl = null;
  let simStream = null; // flujo de cámara propio del modo simulado
  let simCamVideo = null;

  const close = () => {
    if (closed) return;
    closed = true;
    overlay.pararRescate();
    document.removeEventListener('keydown', alPulsarEscape);

    // Detener MindAR explícitamente para liberar la cámara. Si no, el
    // indicador de grabación del sistema operativo se queda encendido y el
    // usuario cree que le seguimos grabando.
    if (sceneEl) {
      const system = sceneEl.systems['mindar-image-system'];
      if (system) {
        try {
          system.stop();
        } catch {
          // Si la cámara nunca llegó a arrancar (p. ej. permiso denegado),
          // stop() puede fallar; no hay nada que liberar.
        }
      }
      sceneEl.remove();
    }

    // En modo simulado la cámara es nuestra: se libera igual de explícitamente.
    if (simStream) {
      simStream.getTracks().forEach((track) => track.stop());
    }
    if (simCamVideo) simCamVideo.remove();

    if (videoEl) {
      videoEl.pause();
      // Se devuelve el volumen por si se salió con los créditos abiertos:
      // al reentrar, el vídeo no debe sonar atenuado sin motivo.
      videoEl.volume = 1;
    }
    overlay.root.remove();
    document.body.classList.remove('sin-scroll');

    // Volver devuelve a la pantalla de información con todo intacto: el
    // motor sigue en memoria y el permiso de cámara ya está concedido, así
    // que pulsar otra vez el botón reabre la experiencia sin descargas ni
    // una segunda pregunta del navegador.
    if (typeof opciones.alVolver === 'function') opciones.alVolver();
  };

  overlay.closeButton.addEventListener('click', close);
  overlay.rescateButton.addEventListener('click', close);
  overlay.setState('cargando');
  if (videoEl) {
    videoEl.volume = 0;
    videoEl.pause();
    videoEl.currentTime = 0;
  }

  // Escape sale de la experiencia. La hoja de créditos detiene la
  // propagación de su propio Escape (ver creditos.js), así que estando ella
  // abierta esta tecla la cierra a ella y no la capa entera.
  const alPulsarEscape = (evento) => {
    if (evento.key === 'Escape') close();
  };
  document.addEventListener('keydown', alPulsarEscape);

  // Botón de emergencia del sonido.
  if (overlay.soundButton) {
    overlay.soundButton.addEventListener('click', () => {
      videoEl.volume = 1;
      videoEl.muted = false;
      videoEl.play().then(() => overlay.setSoundBlocked(false)).catch(() => {});
    });
  }

  try {
    // Importación dinámica del motor. El orden importa: MindAR necesita
    // encontrar window.AFRAME ya definido. (En modo simulado MindAR no se
    // usa, pero se importa igual para que la medición de tiempos del panel
    // de diagnóstico refleje el peso real.)
    await import('aframe');
    await import('mind-ar/dist/mindar-image-aframe.prod.js');
  } catch {
    if (videoEl) videoEl.pause();
    overlay.setState('error-motor');
    return;
  }
  diag.marcarMotorCargado();

  // El usuario pudo cerrar mientras se descargaba el motor.
  if (closed) return;

  // Una sola vez, y para siempre. La primera detección confirmada arranca el
  // vídeo; a partir de ahí perder la placa no significa nada (ver la nota de
  // cabecera: en cuanto empieza, la mano baja). Por eso no hay onLost.
  let yaArrancado = false;

  const onFound = () => {
    if (closed || yaArrancado) return;
    yaArrancado = true;

    // El escáner deja de tener sentido y la cámara pasa al fondo: el estado
    // lo escribe setState y todo lo visual cuelga de él en CSS.
    overlay.setState('reproduciendo');
    overlay.pararRescate();
    overlay.reproductor.mostrar();

    if (videoEl) {
      // Audio y vídeo arrancan juntos, aquí: el play() silencioso de
      // main.js solo desbloqueó iOS. Hasta este instante el volumen es 0.
      videoEl.volume = 1;
      videoEl.muted = false;
      videoEl.currentTime = 0;
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
    try {
      simStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
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
      enfocarCamara(simCamVideo, () => closed);
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
      enfocarCamara(system.video, () => closed);
    }
    // La cámara ya está en marcha. El vídeo espera pausado: el play() que
    // lanzó main.js dentro del gesto del usuario servía para desbloquear el
    // audio en iOS, no para reproducir todavía.
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
  const target = sceneEl.querySelector('[mindar-image-target]');
  target.addEventListener('targetFound', onFound);
}

/* ------------------------------------------------------------------ */
/* Entrada en foco de la cámara                                        */
/* ------------------------------------------------------------------ */

/**
 * Hace que la imagen de la cámara aparezca difuminada y se vaya enfocando.
 *
 * Se aplica sobre el <video> que crea MindAR, no sobre uno propio: MindAR
 * gestiona ese elemento (posición, tamaño, flujo) y aquí solo se le añade un
 * filtro CSS, que no altera su geometría. El lienzo 3D es un hermano suyo,
 * no un hijo, así que el desenfoque no toca al vídeo del docente.
 *
 * La espera inicial existe para que el fotograma borroso llegue a verse: sin
 * ella, en un teléfono rápido el enfoque termina antes de que el ojo lo
 * registre y el efecto se pierde.
 *
 * @param {HTMLVideoElement} video  El vídeo de cámara de MindAR.
 * @param {() => boolean} seCerro  Consulta si la capa ya se cerró.
 */
function enfocarCamara(video, seCerro) {
  const sinMovimiento =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Con "reducir movimiento" no hay transición de enfoque: entrar en una
  // experiencia de cámara ya es bastante estímulo.
  if (sinMovimiento) return;

  video.classList.add('ar-camara-entrando');
  setTimeout(() => {
    if (seCerro()) return;
    video.classList.add('ar-camara-enfocada');
    // La clase que instala el filtro se retira al terminar para no dejar al
    // navegador componiendo una capa de filtro sobre cada fotograma de vídeo
    // durante el resto de la sesión.
    setTimeout(() => {
      video.classList.remove('ar-camara-entrando', 'ar-camara-enfocada');
    }, ENFOQUE_MS + 60);
  }, ENFOQUE_ESPERA_MS);
}

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
    // warmupTolerance/missTolerance: ver la constante al principio del
    // fichero. Aquí ya solo gobiernan CUÁNDO se da la placa por encontrada
    // (missTolerance queda sin efecto práctico, porque targetLost no se
    // escucha, pero se deja para no dejar el motor en un ajuste raro).
    `imageTargetSrc: ${arConfig.marcador}; uiScanning: no; uiLoading: no; uiError: no; ` +
      `warmupTolerance: ${WARMUP_TOLERANCE}; missTolerance: ${MISS_TOLERANCE}`
  );
  scene.setAttribute('renderer', 'colorManagement: true');

  const camera = document.createElement('a-camera');
  camera.setAttribute('position', '0 0 0');
  camera.setAttribute('look-controls', 'enabled: false');
  scene.appendChild(camera);

  // Ancla vacía: solo sirve para recibir targetFound.
  const anchor = document.createElement('a-entity');
  anchor.setAttribute('mindar-image-target', 'targetIndex: 0');
  scene.appendChild(anchor);

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
