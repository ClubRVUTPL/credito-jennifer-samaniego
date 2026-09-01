// iconos.js — Pictogramas mínimos de la interfaz, como nodos SVG reales.
//
// Mismo criterio que ui.js: nunca innerHTML. Los trazos son geométricos y de
// autoría propia (líneas, círculos, arcos), sin depender de ninguna librería
// de iconos ni de ningún CDN. currentColor: heredan el color del texto que
// los rodea, así que un solo cambio de --tinta o --acento los recolorea a
// todos sin tocar este fichero.
//
// Trazo 1.75, cabos y uniones redondeados: es el mismo lenguaje visual en
// las cuatro esquinas del escáner, el retículo y estos iconos, para que se
// lean como un solo sistema y no como piezas sueltas.

const SVG_NS = 'http://www.w3.org/2000/svg';

function crear(nombreEtiqueta, atributos) {
  const el = document.createElementNS(SVG_NS, nombreEtiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    el.setAttribute(clave, valor);
  }
  return el;
}

/**
 * Construye un <svg> a partir de una lista de elementos ya descritos
 * (etiqueta + atributos). Todo geometría estática, ningún dato externo.
 */
function svg(viewBox, hijos) {
  const raiz = crear('svg', {
    viewBox,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  hijos.forEach(([tag, attrs]) => raiz.appendChild(crear(tag, attrs)));
  return raiz;
}

/** Aplica una clase al icono devuelto; azúcar para no repetirlo en cada uso. */
function conClase(elementoSvg, clase) {
  if (clase) elementoSvg.setAttribute('class', clase);
  return elementoSvg;
}

export function iconoCamara(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.1-1.65A1.5 1.5 0 0 1 9.85 4.6h4.3a1.5 1.5 0 0 1 1.25.75L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z' }],
      ['circle', { cx: '12', cy: '13', r: '3.4' }],
    ]),
    clase
  );
}

export function iconoDocumento(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M7 3.75h7.5L18 7.25V19.5a.75.75 0 0 1-.75.75H7a.75.75 0 0 1-.75-.75V4.5A.75.75 0 0 1 7 3.75Z' }],
      ['path', { d: 'M14.25 3.75V7h3.5' }],
      ['path', { d: 'M9 12h6M9 15h6M9 9h2.5' }],
    ]),
    clase
  );
}

export function iconoCandado(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['rect', { x: '5.5', y: '10.5', width: '13', height: '9', rx: '1.75' }],
      ['path', { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5' }],
      ['circle', { cx: '12', cy: '14.75', r: '1.15', fill: 'currentColor', stroke: 'none' }],
    ]),
    clase
  );
}

export function iconoAlerta(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M12 4.2 21 19.5H3Z', 'stroke-linejoin': 'round' }],
      ['path', { d: 'M12 10v3.6' }],
      ['circle', { cx: '12', cy: '16.6', r: '0.15', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.9' }],
    ]),
    clase
  );
}

export function iconoCierre(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M6 6l12 12M18 6 6 18' }],
    ]),
    clase
  );
}

export function iconoAltavoz(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M4 9.5h3.2L12 5.8v12.4l-4.8-3.7H4z', 'stroke-linejoin': 'round' }],
      ['path', { d: 'M16 9.2a4 4 0 0 1 0 5.6' }],
      ['path', { d: 'M18.4 7a7.2 7.2 0 0 1 0 10' }],
    ]),
    clase
  );
}

export function iconoCheck(clase) {
  return conClase(
    svg('0 0 24 24', [['path', { d: 'M4.5 12.5l5 5 10-10.5' }]]),
    clase
  );
}

export function iconoInfo(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['circle', { cx: '12', cy: '12', r: '8.25' }],
      ['path', { d: 'M12 11v5.2' }],
      ['circle', { cx: '12', cy: '8', r: '0.15', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.9' }],
    ]),
    clase
  );
}

export function iconoFlechaExterna(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M8 16 16 8' }],
      ['path', { d: 'M9.5 8H16v6.5' }],
    ]),
    clase
  );
}

/** Flecha hacia la izquierda: volver a la pantalla anterior. */
export function iconoVolver(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M15 5.5 8.5 12l6.5 6.5' }],
    ]),
    clase
  );
}

/** Lista con líneas: la tabla de créditos. */
export function iconoCreditos(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M9 6.5h10M9 12h10M9 17.5h10' }],
      ['circle', { cx: '5', cy: '6.5', r: '0.15', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.9' }],
      ['circle', { cx: '5', cy: '12', r: '0.15', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.9' }],
      ['circle', { cx: '5', cy: '17.5', r: '0.15', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.9' }],
    ]),
    clase
  );
}

/** Pausa: dos barras. */
export function iconoPausa(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['rect', { x: '8', y: '5.5', width: '2.6', height: '13', rx: '1.1', fill: 'currentColor', stroke: 'none' }],
      ['rect', { x: '13.4', y: '5.5', width: '2.6', height: '13', rx: '1.1', fill: 'currentColor', stroke: 'none' }],
    ]),
    clase
  );
}

/** Reproducir: triángulo macizo. */
export function iconoReproducir(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M8.2 5.6a.9.9 0 0 1 1.36-.78l8.1 5.4a1 1 0 0 1 0 1.66l-8.1 5.4a.9.9 0 0 1-1.36-.78z', fill: 'currentColor', stroke: 'none' }],
    ]),
    clase
  );
}

/** Volver a empezar: flecha circular. */
export function iconoRepetir(clase) {
  return conClase(
    svg('0 0 24 24', [
      ['path', { d: 'M19.5 12a7.5 7.5 0 1 1-2.6-5.7' }],
      ['path', { d: 'M19.6 4.6v3.9h-3.9' }],
    ]),
    clase
  );
}
