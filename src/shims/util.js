// Shim del módulo "util" de Node para el navegador.
//
// El bundle de mind-ar incluye TensorFlow.js, cuyo código de soporte para
// Node hace require("util"). Esa rama solo se ejecuta cuando corre bajo
// Node, nunca en el navegador, pero Vite avisaba al externalizar el módulo.
// Este shim (con los TextEncoder/TextDecoder nativos, por si acaso) elimina
// el aviso sin añadir ninguna dependencia. Se conecta en vite.config.js.

export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;

export default { TextEncoder, TextDecoder };
