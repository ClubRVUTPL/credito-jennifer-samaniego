// alpha-video.js — Shader de transparencia para el vídeo del artista.
//
// El vídeo llega con "alfa empaquetada": el color ocupa la mitad superior del
// FOTOGRAMA (tal y como se ve el fichero) y la máscara de opacidad, en escala
// de grises, la mitad inferior. Así lo generan los scripts de FFmpeg y así
// debe seguir siendo. Este shader recompone ambas mitades en un único plano
// transparente.
//
// ── El interruptor de orientación ────────────────────────────────────────────
//
// Lo único discutible es QUÉ RANGO DE UV corresponde a la mitad superior del
// fotograma, porque depende de si three.js voltea la textura al subirla:
//
//   MASCARA_ARRIBA_DEFECTO = 0  →  APUESTA de este proyecto.
//     three.js aplica flipY = true por defecto a las texturas creadas desde
//     elementos del DOM (vídeo y canvas), de modo que v = 1 es la parte de
//     ARRIBA del fotograma. El color queda en v ∈ [0.5, 1] y la máscara en
//     v ∈ [0, 0.5]. Es exactamente el GLSL de la especificación original:
//     la premisa "WebGL puro" era errónea, pero el volteo de three.js hace
//     que la aritmética final coincida.
//
//   MASCARA_ARRIBA_DEFECTO = 1  →  la alternativa.
//     Muestreo sin volteo (flipY = false, WebGL crudo): la primera fila del
//     fotograma cae en v = 0, el color queda en v ∈ [0, 0.5] y la máscara
//     "sube" a v ∈ [0.5, 1].
//
// Verificación en dos minutos, sin cámara ni FFmpeg: abrir banco-shader.html
// con `npm run dev` y usar el botón de alternar. Si la apuesta falla, basta
// con cambiar la constante de aquí abajo.
//
// (A-Frame no admite uniforms booleanos en el esquema de sus shaders, por eso
// el interruptor es un entero 0/1.)

export const MASCARA_ARRIBA_DEFECTO = 0;

export function registerAlphaShader(AFRAME) {
  // Evita el error de doble registro si el usuario abre y cierra la RA varias veces.
  if (AFRAME.shaders['alfa-empaquetada']) return;

  AFRAME.registerShader('alfa-empaquetada', {
    schema: {
      // "map" + "is: uniform" deja que A-Frame gestione la textura de vídeo
      // (creación, actualización por fotograma y selector #id del elemento).
      src: { type: 'map', is: 'uniform' },
      mascaraArriba: { type: 'int', is: 'uniform', default: MASCARA_ARRIBA_DEFECTO },
      // Multiplicador de opacidad adicional, 0–1. Lo anima 'aparicion-suave'
      // (más abajo) para que el vídeo entre con un fundido en vez de aparecer
      // de golpe. En fade=0 el discard de abajo hace desaparecer el plano
      // entero sin necesidad de ocultar la entidad.
      fade: { type: 'float', is: 'uniform', default: 1 },
    },

    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      precision mediump float;

      uniform sampler2D src;
      uniform int mascaraArriba;
      uniform float fade;
      varying vec2 vUv;

      void main() {
        // Las dos rutas de orientación; ver el comentario largo del fichero.
        vec2 uvColor;
        vec2 uvMascara;
        if (mascaraArriba == 1) {
          // Sin volteo: color abajo en UV, máscara arriba en UV.
          uvColor   = vec2(vUv.x, vUv.y * 0.5);
          uvMascara = vec2(vUv.x, vUv.y * 0.5 + 0.5);
        } else {
          // Con flipY de three.js (apuesta): color arriba en UV.
          uvColor   = vec2(vUv.x, vUv.y * 0.5 + 0.5);
          uvMascara = vec2(vUv.x, vUv.y * 0.5);
        }

        vec3  color = texture2D(src, uvColor).rgb;
        float alfa  = texture2D(src, uvMascara).r * fade;

        if (alfa < 0.02) discard; // evita el halo oscuro en los bordes
        gl_FragColor = vec4(color, alfa);
      }
    `,
  });
}

/* ------------------------------------------------------------------ */
/* Aparición suave del plano                                          */
/* ------------------------------------------------------------------ */

// Duración del fundido/escala de entrada. Un valor discreto: se nota que el
// vídeo "llega", pero no retrasa la sensación de reactividad al encontrar
// la placa.
const DURACION_ENTRADA_MS = 320;
// Escala de arranque: entra ligeramente más pequeño y crece a tamaño real.
// Sutil a propósito (el pedido es "discreto y elegante", no llamativo).
const ESCALA_INICIAL = 0.94;

/**
 * Registra el componente 'aparicion-suave': fundido + escala de entrada
 * para el plano de vídeo cuando MindAR marca su ancla como visible.
 *
 * Por qué solo la ENTRADA tiene fundido y no la salida: MindAR decide la
 * visibilidad del ancla (mindar-image-target) fotograma a fotograma según su
 * propio contador de fallos consecutivos (missTolerance, ver ar.js). En
 * cuanto el ancla pasa a invisible, three.js deja de recorrer sus hijos —
 * ninguna animación en el plano hijo puede pintarse ya, empiece cuando
 * empiece. Por eso la histéresis real contra el parpadeo se resuelve subiendo
 * missTolerance (el vídeo no llega a ocultarse por fluctuaciones breves), y
 * esta animación cubre la otra mitad del pedido: que la aparición, cuando
 * ocurre, se sienta intencional y no un salto brusco.
 */
export function registerAparicionSuave(AFRAME) {
  if (AFRAME.components['aparicion-suave']) return;

  AFRAME.registerComponent('aparicion-suave', {
    init() {
      this.visiblePrev = false;
      this.animando = false;
      this.inicioMs = 0;
      this.el.object3D.scale.setScalar(ESCALA_INICIAL);
    },

    tick(timeMs) {
      const ancla = this.el.object3D.parent;
      if (!ancla) return;

      const visibleAhora = ancla.visible;
      if (visibleAhora && !this.visiblePrev) {
        // El ancla acaba de pasar a visible: arranca la entrada desde cero,
        // tanto si es la primera vez como si MindAR reencontró la placa tras
        // una pérdida ya confirmada (rara, con missTolerance alto).
        this.animando = true;
        this.inicioMs = timeMs;
        this.el.object3D.scale.setScalar(ESCALA_INICIAL);
      }
      this.visiblePrev = visibleAhora;

      if (this.animando) {
        const t = Math.min(1, (timeMs - this.inicioMs) / DURACION_ENTRADA_MS);
        // easeOutCubic: arranca rápido y frena al llegar, sin rebote.
        const progreso = 1 - Math.pow(1 - t, 3);

        this.el.object3D.scale.setScalar(ESCALA_INICIAL + (1 - ESCALA_INICIAL) * progreso);

        const mesh = this.el.getObject3D('mesh');
        if (mesh && mesh.material && mesh.material.uniforms && mesh.material.uniforms.fade) {
          mesh.material.uniforms.fade.value = progreso;
        }

        if (t >= 1) this.animando = false;
      }
    },
  });
}
