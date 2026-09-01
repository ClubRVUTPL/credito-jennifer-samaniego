// generar-placa.mjs — Renderiza scripts/generar-placa.html en headless y
// guarda el canvas como public/ar/placa.jpg (el marcador de MindAR).
//
// Sin dependencias (cliente CDP compartido en lib-cdp.mjs). No necesita el
// servidor de desarrollo: la página se abre por file://.
//
// Uso: node scripts/generar-placa.mjs

import { writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lanzarNavegador, navegar, esperar, evaluate } from './lib-cdp.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paginaUrl = pathToFileURL(resolve(rootDir, 'scripts', 'generar-placa.html')).href;
const salida = resolve(rootDir, 'public', 'ar', 'placa.jpg');

const navegador = await lanzarNavegador();
try {
  await navegar(navegador.cdp, paginaUrl);
  await esperar(navegador.cdp, 'window.__placaLista === true');

  const dataUrl = await evaluate(navegador.cdp, 'window.__placaJpeg()');
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  writeFileSync(salida, Buffer.from(base64, 'base64'));

  const kb = (statSync(salida).size / 1024).toFixed(1);
  console.log(`Placa generada: public/ar/placa.jpg (1200×900, ${kb} kB)`);
  console.log('Siguiente paso: node scripts/compilar-marcador-headless.mjs');
} finally {
  await navegador.cerrar();
}
