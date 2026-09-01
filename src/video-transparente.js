// video-transparente.js — Pinta el vídeo del docente con fondo transparente.
//
// Dos modos (auto-detectados al tener videoWidth/videoHeight):
//
//   · Alfa empaquetada (preferido): el .mp4 lleva el color en la mitad
//     superior del FICHERO y la máscara de opacidad, en escala de grises,
//     en la inferior. Lo genera scripts/encode-jennifer-alfa.bat.
//
//   · Negro puro (legacy): fondo #000000 y máscara por brillo. Solo si el
//     fichero NO es empaquetado.
//
// ── Orientación UV (WebGL crudo, SIN UNPACK_FLIP_Y) ──────────────────────
//
// El vértice pone vUv.y = 0 en la parte ALTA del canvas. texImage2D sin
// volteo coloca la primera fila del vídeo (arriba del fichero) en v = 0.
// Con color arriba + máscara abajo eso equivale a:
//
//   mascaraArriba = 1  →  color en v ∈ [0, 0.5], máscara en v ∈ [0.5, 1]
//   mascaraArriba = 0  →  mitades intercambiadas (three.js flipY / bug visto
//                         en iOS: RGB = silueta blanca)
//
// El valor por defecto es 1. Un sondeo Canvas 2D (origen top-left, estable
// en Safari y Chrome) confirma qué mitad del FICHERO es la máscara y ajusta
// el uniform. No se pinta ningún fotograma empaquetado hasta terminar ese
// sondeo: así no parpadea la máscara como RGB al arrancar.

const UMBRAL_BAJO = 0.030;
const UMBRAL_ALTO = 0.140;

/** Convención WebGL crudo: máscara en el rango alto de V (mitad inferior del fichero). */
export const MASCARA_ARRIBA_WEBGL_CRUDO = 1;

const VERTEX_SHADER = `
  attribute vec2 posicion;
  varying vec2 vUv;
  void main() {
    vUv = vec2(posicion.x * 0.5 + 0.5, 0.5 - posicion.y * 0.5);
    gl_Position = vec4(posicion, 0.0, 1.0);
  }
`;

const FRAGMENT_EMPAQUETADO = `
  precision mediump float;
  uniform sampler2D fotograma;
  uniform int mascaraArriba;
  varying vec2 vUv;

  void main() {
    vec2 uvColor;
    vec2 uvMascara;
    if (mascaraArriba == 1) {
      uvColor   = vec2(vUv.x, vUv.y * 0.5);
      uvMascara = vec2(vUv.x, vUv.y * 0.5 + 0.5);
    } else {
      uvColor   = vec2(vUv.x, vUv.y * 0.5 + 0.5);
      uvMascara = vec2(vUv.x, vUv.y * 0.5);
    }
    vec3 color = texture2D(fotograma, uvColor).rgb;
    float alfa = texture2D(fotograma, uvMascara).r;
    if (alfa < 0.004) discard;
    gl_FragColor = vec4(color * alfa, alfa);
  }
`;

const FRAGMENT_NEGRO = `
  precision mediump float;
  uniform sampler2D fotograma;
  uniform float umbralBajo;
  uniform float umbralAlto;
  uniform vec2 texel;
  varying vec2 vUv;

  float intensidadEn(vec2 uv) {
    vec3 c = texture2D(fotograma, uv).rgb;
    return max(c.r, max(c.g, c.b));
  }

  void main() {
    vec3 color = texture2D(fotograma, vUv).rgb;
    float mx = intensidadEn(vUv);
    mx = min(mx, intensidadEn(vUv + vec2(texel.x, 0.0)));
    mx = min(mx, intensidadEn(vUv - vec2(texel.x, 0.0)));
    mx = min(mx, intensidadEn(vUv + vec2(0.0, texel.y)));
    mx = min(mx, intensidadEn(vUv - vec2(0.0, texel.y)));
    float alfa = smoothstep(umbralBajo, umbralAlto, mx);
    gl_FragColor = vec4(color * alfa, alfa);
  }
`;

function compilar(gl, tipo, fuente) {
  const shader = gl.createShader(tipo);
  gl.shaderSource(shader, fuente);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader: ${error}`);
  }
  return shader;
}

/** Fotograma alfa empaquetado: el alto es ~2× el de la imagen visible. */
export function esVideoAlfaEmpaquetado(videoEl) {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (w <= 0 || h <= 0) return false;
  return h / w > 0.75;
}

/**
 * Puntuación "parecido a máscara": baja crominancia y valores cerca de
 * negro o blanco. La mitad de color (piel, ropa, oro) puntúa más bajo.
 * @param {Uint8ClampedArray} data
 */
export function puntuacionMascara(data) {
  let chroma = 0;
  let extremos = 0;
  const n = data.length / 4;
  if (n === 0) return 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    chroma += max - min;
    const luma = (r + g + b) / 3;
    if (luma < 24 || luma > 230) extremos += 1;
  }
  return extremos / n - chroma / n / 255;
}

/**
 * Sondeo Canvas 2D: qué mitad del FICHERO es la máscara.
 * Origen top-left, independiente de WebGL y de UNPACK_FLIP_Y.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {1|0} valor para el uniform mascaraArriba
 */
export function sondearMascaraArriba(videoEl) {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (w <= 0 || h <= 0) return MASCARA_ARRIBA_WEBGL_CRUDO;

  const mitad = Math.floor(h / 2);
  const pw = Math.max(16, Math.min(64, Math.floor(w / 20)));
  const ph = Math.max(16, Math.min(64, Math.floor(mitad / 20)));
  const lienzo = document.createElement('canvas');
  lienzo.width = pw;
  lienzo.height = ph;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) return MASCARA_ARRIBA_WEBGL_CRUDO;

  ctx.drawImage(videoEl, 0, 0, w, mitad, 0, 0, pw, ph);
  const top = ctx.getImageData(0, 0, pw, ph).data;
  ctx.drawImage(videoEl, 0, mitad, w, mitad, 0, 0, pw, ph);
  const bot = ctx.getImageData(0, 0, pw, ph).data;

  const mascaraAbajoEnFichero = puntuacionMascara(bot) >= puntuacionMascara(top);
  // Fichero color-arriba + textura sin flip + vértice vUv.y=0 arriba → 1.
  return mascaraAbajoEnFichero ? 1 : 0;
}

/**
 * @param {HTMLVideoElement} videoEl
 * @param {{preserveDrawingBuffer?: boolean}} [opciones]
 * @returns {{canvas, iniciar, parar, destruir, empaquetado, mascaraArriba} | null}
 */
export function crearVideoTransparente(videoEl, opciones = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ar-lienzo-video';
  canvas.width = 1;
  canvas.height = 1;

  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: Boolean(opciones.preserveDrawingBuffer),
  });
  if (!gl) return null;

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  let empaquetado = false;
  let programa = null;
  let mascaraArriba = MASCARA_ARRIBA_WEBGL_CRUDO;
  let sondeoHecho = false;
  let uTexel = null;
  let uMascaraArriba = null;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const textura = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textura);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const enlazarAtributo = (prog) => {
    const posicion = gl.getAttribLocation(prog, 'posicion');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(posicion);
    gl.vertexAttribPointer(posicion, 2, gl.FLOAT, false, 0, 0);
  };

  const enlazarPrograma = (fragmentSrc, conUmbrales) => {
    const vs = compilar(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compilar(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(prog);
    enlazarAtributo(prog);
    if (conUmbrales) {
      gl.uniform1f(gl.getUniformLocation(prog, 'umbralBajo'), UMBRAL_BAJO);
      gl.uniform1f(gl.getUniformLocation(prog, 'umbralAlto'), UMBRAL_ALTO);
    }
    const locMascara = gl.getUniformLocation(prog, 'mascaraArriba');
    if (locMascara) gl.uniform1i(locMascara, mascaraArriba);
    return prog;
  };

  const asegurarPrograma = (esEmp) => {
    if (programa && esEmp === empaquetado) {
      gl.useProgram(programa);
      return;
    }
    if (programa) gl.deleteProgram(programa);
    empaquetado = esEmp;
    programa = enlazarPrograma(empaquetado ? FRAGMENT_EMPAQUETADO : FRAGMENT_NEGRO, !empaquetado);
    uTexel = gl.getUniformLocation(programa, 'texel');
    uMascaraArriba = gl.getUniformLocation(programa, 'mascaraArriba');
  };

  let corriendo = false;
  let handle = null;
  let texAncho = 0;
  let texAlto = 0;

  const dibujar = () => {
    if (!corriendo) return;

    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (w <= 0 || h <= 0) {
      programarSiguiente();
      return;
    }

    const esEmp = h / w > 0.75;
    try {
      asegurarPrograma(esEmp);
    } catch {
      programarSiguiente();
      return;
    }

    if (empaquetado && !sondeoHecho) {
      if (videoEl.readyState >= 2) {
        try {
          mascaraArriba = sondearMascaraArriba(videoEl);
        } catch {
          mascaraArriba = MASCARA_ARRIBA_WEBGL_CRUDO;
        }
        sondeoHecho = true;
        if (uMascaraArriba) gl.uniform1i(uMascaraArriba, mascaraArriba);
      } else {
        gl.clear(gl.COLOR_BUFFER_BIT);
        programarSiguiente();
        return;
      }
    }

    const altoVisible = empaquetado ? h / 2 : h;
    if (w !== texAncho || h !== texAlto) {
      texAncho = w;
      texAlto = h;
      canvas.width = w;
      canvas.height = altoVisible;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.clearColor(0, 0, 0, 0);
      gl.useProgram(programa);
      enlazarAtributo(programa);
      if (uMascaraArriba) gl.uniform1i(uMascaraArriba, mascaraArriba);
      gl.viewport(0, 0, w, altoVisible);
      if (!empaquetado && uTexel) gl.uniform2f(uTexel, 1 / w, 1 / h);
    }

    try {
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } catch {
      /* fotograma aún no decodificado */
    }
    programarSiguiente();
  };

  const usarRVFC = typeof videoEl.requestVideoFrameCallback === 'function';
  const programarSiguiente = () => {
    if (!corriendo) return;
    handle = usarRVFC
      ? videoEl.requestVideoFrameCallback(dibujar)
      : requestAnimationFrame(dibujar);
  };

  return {
    canvas,
    get empaquetado() {
      return empaquetado;
    },
    get mascaraArriba() {
      return mascaraArriba;
    },
    iniciar() {
      if (corriendo) return;
      corriendo = true;
      dibujar();
    },
    parar() {
      corriendo = false;
      if (handle === null) return;
      if (usarRVFC && typeof videoEl.cancelVideoFrameCallback === 'function') {
        videoEl.cancelVideoFrameCallback(handle);
      } else if (!usarRVFC) {
        cancelAnimationFrame(handle);
      }
      handle = null;
    },
    destruir() {
      this.parar();
      gl.deleteTexture(textura);
      gl.deleteBuffer(buffer);
      if (programa) gl.deleteProgram(programa);
      const perder = gl.getExtension('WEBGL_lose_context');
      if (perder) perder.loseContext();
    },
  };
}
