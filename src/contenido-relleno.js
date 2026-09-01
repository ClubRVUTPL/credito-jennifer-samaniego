// contenido-relleno.js — Detección de contenido de relleno.
//
// Lo usan DOS consumidores, y por eso vive aquí y no dentro de un script:
//   - src/main.js (navegador): decide si pintar la banda "Contenido de prueba".
//   - scripts/comprobar-contenido.mjs (Node): impide compilar producción.
// Compartir la lista evita que una se quede corta respecto de la otra.
//
// Módulo ESM sin APIs de navegador ni de Node: importable desde ambos.

/**
 * Marcadores que delatan contenido sin terminar. La comparación es
 * insensible a mayúsculas y se hace sobre el texto plano del JSON y del
 * guion, así que basta con que aparezcan en cualquier valor.
 */
export const MARCADORES = [
  'Nombre del docente',
  'ejemplo.com',
  'por definir',
  'Edita este texto',
  // Cualquier vídeo de pruebas. Se comprueba por el PREFIJO de la ruta, no
  // por un nombre concreto: así entran tanto el clip sintético original
  // (/media/prueba.mp4) como el material de ensayo con una persona
  // (/media/prueba-docente-720.mp4). Sin ellos el circuito de RA no se puede
  // probar antes del rodaje, pero tampoco pueden publicarse como si fueran la
  // grabación real. El guardián lo comprueba además por separado, mirando
  // directamente ar.video, con un mensaje más concreto; aquí sigue estando
  // porque es lo que hace aparecer la banda "Contenido de prueba" en el
  // navegador, y esa banda no puede desaparecer solo porque los textos ya
  // sean los definitivos.
  '/media/prueba',
];

export const AVISO_RELLENO = 'Contenido de prueba: esta no es la versión final.';

/**
 * Devuelve la lista de marcadores encontrados en un texto cualquiera.
 * @param {string} texto
 * @returns {string[]}
 */
export function buscarMarcadores(texto) {
  const plano = String(texto).toLowerCase();
  return MARCADORES.filter((marcador) => plano.includes(marcador.toLowerCase()));
}

/**
 * ¿El contenido ya cargado trae relleno? Pensado para el navegador, que solo
 * conoce contenido.json.
 * @param {object} content  contenido.json ya parseado
 */
export function hayRelleno(content) {
  return buscarMarcadores(JSON.stringify(content)).length > 0;
}
