// debug.js — Panel de diagnóstico en pantalla, activado con ?debug=1.
//
// En un teléfono no hay herramientas de desarrollo: este panel superpone los
// datos mínimos para diagnosticar la capa de RA a ciegas. Cuando el parámetro
// no está presente, todas las funciones de `diag` son inofensivas y no se
// crea ningún nodo: el coste en producción es cero.
//
// Herramienta de desarrollo: sus textos no salen de contenido.json a
// propósito (misma exención que compilador-marcador.html y banco-shader.html),
// porque debe funcionar incluso cuando el JSON no carga.
//
// import.meta.env.DEV vale `false` en el build de producción, así que la
// condición se evalúa a `false` en tiempo de compilación y Rollup descarta el
// cuerpo del panel: ?debug=1 no existe en dist/.

const enabled =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug');

const data = {
  estado: '(sin iniciar)',
  clicT: null, // performance.now() del clic en el botón de RA
  motorMs: null, // clic → import() de A-Frame + MindAR completado
  camaraMs: null, // clic → cámara emitiendo (arReady o getUserMedia)
  video: null, // HTMLVideoElement del artista
  audio: null, // HTMLAudioElement de la narración del avatar
  camara: null, // HTMLVideoElement del flujo de cámara
};

const consola = []; // últimas 5 entradas de consola
let panel = null;
let fps = 0;

/* ------------------------------------------------------------------ */
/* API pública: puntos de instrumentación                              */
/* ------------------------------------------------------------------ */

export const diag = {
  activo: enabled,

  setEstado(estado) {
    data.estado = estado;
  },

  marcarClic() {
    data.clicT = performance.now();
    data.motorMs = null;
    data.camaraMs = null;
  },

  marcarMotorCargado() {
    if (data.clicT !== null) data.motorMs = Math.round(performance.now() - data.clicT);
  },

  marcarCamaraLista() {
    if (data.clicT !== null) data.camaraMs = Math.round(performance.now() - data.clicT);
  },

  setVideo(videoEl) {
    data.video = videoEl;
  },

  setAudio(audioEl) {
    data.audio = audioEl;
  },

  setCamara(videoEl) {
    data.camara = videoEl;
  },
};

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

export function initDebug() {
  if (!enabled) return;
  hookConsole();
  buildPanel();
  startLoops();
}

/* Intercepta consola y errores globales guardando las últimas 5 entradas. */
function hookConsole() {
  const push = (nivel, args) => {
    const texto = args
      .map((a) => {
        if (a instanceof Error) return a.message;
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
    consola.push(`${nivel}: ${texto}`.slice(0, 160));
    if (consola.length > 5) consola.shift();
  };

  ['log', 'info', 'warn', 'error'].forEach((nivel) => {
    const original = console[nivel].bind(console);
    console[nivel] = (...args) => {
      push(nivel, args);
      original(...args);
    };
  });

  window.addEventListener('error', (event) => {
    push('error', [event.message || 'error de script']);
  });
  window.addEventListener('unhandledrejection', (event) => {
    push('error', ['promesa sin capturar:', event.reason]);
  });
}

function buildPanel() {
  panel = document.createElement('pre');
  panel.className = 'panel-diagnostico';
  panel.setAttribute('aria-hidden', 'true');
  document.body.appendChild(panel);
}

function startLoops() {
  // FPS: fotogramas de requestAnimationFrame por segundo en el hilo principal.
  let frames = 0;
  let lastSecond = performance.now();
  const cuentaFrames = (t) => {
    frames += 1;
    if (t - lastSecond >= 1000) {
      fps = Math.round((frames * 1000) / (t - lastSecond));
      frames = 0;
      lastSecond = t;
    }
    requestAnimationFrame(cuentaFrames);
  };
  requestAnimationFrame(cuentaFrames);

  setInterval(render, 300);
  render();
}

function describeVideo(videoEl) {
  if (!videoEl) return '—';
  const dims = videoEl.videoWidth
    ? `${videoEl.videoWidth}×${videoEl.videoHeight}`
    : 'sin metadatos';
  const estado = videoEl.paused ? 'pausado' : 'reproduciendo';
  return `${estado} · ${dims}`;
}

function describeAudio(audioEl) {
  if (!audioEl) return '—';
  const estado = audioEl.paused ? 'pausado' : 'reproduciendo';
  const t = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime.toFixed(1) : '0.0';
  const d = Number.isFinite(audioEl.duration) ? audioEl.duration.toFixed(1) : '?';
  return `${estado} · ${t}s / ${d}s`;
}

function render() {
  const lineas = [
    `estado : ${data.estado}`,
    `fps    : ${fps}`,
    `vídeo  : ${describeVideo(data.video)}`,
    `audio  : ${describeAudio(data.audio)}`,
    `cámara : ${data.camara && data.camara.videoWidth ? `${data.camara.videoWidth}×${data.camara.videoHeight}` : '—'}`,
    `motor  : ${data.motorMs === null ? '—' : `${data.motorMs} ms desde el clic`}`,
    `listo  : ${data.camaraMs === null ? '—' : `${data.camaraMs} ms desde el clic`}`,
    '── consola (últimas 5) ──',
    ...(consola.length ? consola : ['(vacía)']),
  ];
  panel.textContent = lineas.join('\n');
}
