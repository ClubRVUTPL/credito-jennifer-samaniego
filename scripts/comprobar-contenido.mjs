// comprobar-contenido.mjs — Guardián de publicación.
//
// Impide compilar producción con contenido de relleno. Se ejecuta solo en
// `prebuild`, es decir, ANTES de que Vite genere dist/.
//
// Node puro a propósito: NO abre ningún navegador. El contenedor de
// compilación de Vercel no trae Chrome ni Edge, así que la suite
// de interfaz (`npm run comprobar`, que sí usa navegador) no puede correr
// aquí. Aquella sigue existiendo para uso local.
//
// Comprueba cinco cosas:
//   1. Marcadores de relleno en contenido.json.
//   2. Que ar.video no siga apuntando al clip sintético de pruebas.
//   3. Que placaAnchoCm ya no sea la estimación provisional, sino la medida
//      real de la placa: es el dato del que depende toda la escala de la RA.
//   4. Que el marcador compilado no sea más antiguo que la imagen de la placa.
//   5. Que los archivos a los que apunta el JSON existan de verdad.
//
// Escape deliberado y ruidoso, para poder desplegar el prototipo y probar el
// circuito completo:
//   npm run build:prototipo
// Ese script pone PERMITIR_RELLENO=1 con cross-env, así que funciona igual en
// bash y en PowerShell, y arrastra su propio prebuild:prototipo para que este
// guardián siga corriendo (y siga avisando) antes de compilar.
// En ese caso el sitio muestra la banda "Contenido de prueba" (ver
// src/contenido-relleno.js, compartido con el navegador).

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARCADORES, buscarMarcadores } from '../src/contenido-relleno.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const permitir = process.env.PERMITIR_RELLENO === '1';

// Valor con el que nació ar.geometria.placaAnchoCm: una estimación, no una
// medida. Toda la escala de la figura en RA se calcula a partir de este
// número, así que publicar con él puesto significa publicar una figura de
// tamaño equivocado. Al medir la placa real se escribe el valor bueno y esta
// comprobación deja de saltar sola.
const PLACA_ANCHO_PROVISIONAL = 10;

// Vídeos de ensayo: sirven para validar el circuito antes del rodaje, nunca
// para publicar. Se reconocen por el PREFIJO de la ruta, no por un nombre
// exacto, para que entren también las variantes (prueba-docente-720.mp4,
// prueba-docente-480.mp4...). Mismo criterio que MARCADORES.
const PREFIJO_VIDEO_DE_PRUEBAS = '/media/prueba';
const esVideoDePruebas = (ruta) =>
  typeof ruta === 'string' && ruta.includes(PREFIJO_VIDEO_DE_PRUEBAS);

const problemas = [];
const avisos = [];

/* 1 · Marcadores de relleno ------------------------------------------ */

const rutaJson = resolve(raiz, 'contenido', 'contenido.json');

let contenido = null;
try {
  const crudo = readFileSync(rutaJson, 'utf8');
  contenido = JSON.parse(crudo);
  // El vídeo de pruebas se excluye del informe genérico: lo cubre el punto 2
  // con un mensaje que dice qué hacer. Sigue en MARCADORES porque de esa lista
  // depende la banda "Contenido de prueba" del navegador.
  const hallados = buscarMarcadores(crudo).filter((m) => m !== PREFIJO_VIDEO_DE_PRUEBAS);
  if (hallados.length) {
    problemas.push(`contenido/contenido.json contiene: ${hallados.join(', ')}`);
  }
} catch (error) {
  problemas.push(`No se pudo leer contenido/contenido.json: ${error.message}`);
}

/* 2 · El vídeo anclado no puede ser el clip de pruebas ---------------- */

if (contenido && contenido.ar) {
  const video = contenido.ar.video;
  const rutas =
    typeof video === 'string'
      ? [video]
      : video && typeof video === 'object'
        ? Object.values(video)
        : [];

  const deEnsayo = rutas.filter(esVideoDePruebas);
  if (deEnsayo.length) {
    problemas.push(
      `ar.video sigue apuntando a material de ensayo: ${deEnsayo.join(', ')}.\n` +
        '    Sustitúyelo por la grabación real del docente con alfa empaquetada:\n' +
        '      bash scripts/quitar-fondo-verde.sh master-croma.mp4 docente\n' +
        '    (o encode-video.sh si el máster ya trae canal alfa).'
    );
  }
}

/* 3 · La medida de la placa tiene que ser real ------------------------ */

if (contenido && contenido.ar && contenido.ar.geometria) {
  const ancho = Number(contenido.ar.geometria.placaAnchoCm);

  if (!Number.isFinite(ancho) || ancho <= 0) {
    problemas.push(
      `ar.geometria.placaAnchoCm no es un número de centímetros válido: ${contenido.ar.geometria.placaAnchoCm}`
    );
  } else if (ancho === PLACA_ANCHO_PROVISIONAL) {
    problemas.push(
      `ar.geometria.placaAnchoCm sigue en ${PLACA_ANCHO_PROVISIONAL}, que es la ESTIMACIÓN\n` +
        '    inicial y no una medida. MindAR toma el ancho de la placa como unidad, así\n' +
        '    que de este número depende el tamaño real de la figura sobre la pieza.\n' +
        '    Mide la placa grabada de borde a borde y escribe el valor en\n' +
        '    contenido/contenido.json. Ver el apartado 3 bis de SUSTITUIR.md.'
    );
  }
}

/* 4 · Marcador compilado vs imagen de la placa ------------------------ */

const placa = resolve(raiz, 'public', 'ar', 'placa.jpg');
const targets = resolve(raiz, 'public', 'ar', 'targets.mind');

if (existsSync(placa) && existsSync(targets)) {
  const mtimePlaca = statSync(placa).mtimeMs;
  const mtimeTargets = statSync(targets).mtimeMs;
  if (mtimeTargets < mtimePlaca) {
    problemas.push(
      'public/ar/targets.mind es MÁS ANTIGUO que public/ar/placa.jpg: la imagen\n' +
        '    de la placa cambió y el marcador no se recompiló. La RA no detectaría\n' +
        '    la placa nueva. Ejecuta:  node scripts/compilar-marcador-headless.mjs'
    );
  }
} else {
  if (!existsSync(targets)) avisos.push('No existe public/ar/targets.mind (la RA quedará oculta).');
  if (!existsSync(placa)) avisos.push('No existe public/ar/placa.jpg (no se podrá recompilar el marcador).');
}

/* 5 · Los archivos referidos por el JSON existen ---------------------- */

if (contenido && contenido.ar) {
  const ar = contenido.ar;
  const rutas = [];

  const anotar = (valor, clave) => {
    if (typeof valor === 'string' && valor.startsWith('/')) rutas.push([clave, valor]);
  };

  anotar(ar.marcador, 'ar.marcador');
  anotar(ar.poster, 'ar.poster');
  if (typeof ar.video === 'string') {
    anotar(ar.video, 'ar.video');
  } else if (ar.video && typeof ar.video === 'object') {
    for (const [clave, valor] of Object.entries(ar.video)) anotar(valor, `ar.video.${clave}`);
  }

  (contenido.pestanas || []).forEach((tab, i) => {
    anotar(tab.retrato, `pestanas[${i}].retrato`);
  });

  for (const [clave, ruta] of rutas) {
    if (!existsSync(resolve(raiz, 'public', ruta.replace(/^\//, '')))) {
      problemas.push(`${clave} apunta a ${ruta}, que no existe en public/`);
    }
  }
}

/* Resultado ----------------------------------------------------------- */

for (const aviso of avisos) console.warn(`  aviso: ${aviso}`);

if (problemas.length === 0) {
  console.log('Contenido verificado: sin relleno, marcador al día y rutas correctas.');
  process.exit(0);
}

console.error('\n╭─────────────────────────────────────────────────────────────╮');
console.error('│  COMPILACIÓN DETENIDA: el contenido todavía es un borrador  │');
console.error('╰─────────────────────────────────────────────────────────────╯\n');
for (const problema of problemas) console.error(`  · ${problema}`);

console.error('\n  Marcadores vigilados:');
console.error(`    ${MARCADORES.join(' · ')}`);
console.error('\n  Sustituye el contenido real siguiendo SUSTITUIR.md.');

if (permitir) {
  console.error('\n  PERMITIR_RELLENO=1: se continúa de todos modos.');
  console.error('  El sitio mostrará la banda "Contenido de prueba".\n');
  process.exit(0);
}

console.error('\n  Para compilar igualmente el prototipo de pruebas:');
console.error('    npm run build:prototipo\n');
process.exit(1);
