// compilar-marcador-headless.mjs — Compila public/ar/placa.jpg a
// public/ar/targets.mind sin abrir el navegador a mano.
//
// Reutiliza compilador-marcador.html (la misma herramienta manual) en un
// navegador headless vía CDP, espera el resultado y escribe el fichero.
// Necesita el servidor de desarrollo; si no está en marcha, lo arranca.
//
// Uso: node scripts/compilar-marcador-headless.mjs [url-base]

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, reachable, lanzarNavegador, navegar, esperar, evaluate } from './lib-cdp.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = (process.argv[2] || 'http://localhost:5173/').replace(/\/$/, '');
const salida = resolve(rootDir, 'public', 'ar', 'targets.mind');

let devProc = null;
let navegador = null;

try {
  if (!(await reachable(`${baseUrl}/`))) {
    console.log(`Servidor no disponible en ${baseUrl}; arrancando npm run dev…`);
    devProc = spawn('npm', ['run', 'dev'], { cwd: rootDir, shell: true, stdio: 'ignore' });
    const limite = Date.now() + 30000;
    while (!(await reachable(`${baseUrl}/`))) {
      if (Date.now() > limite) throw new Error('npm run dev no respondió en 30 s');
      await sleep(500);
    }
  }

  // SwiftShader: WebGL por software. Sin esto, el TensorFlow del compilador
  // no encuentra WebGL en headless y la compilación se queda colgada.
  navegador = await lanzarNavegador(['--use-angle=swiftshader']);
  const { cdp } = navegador;

  await navegar(cdp, `${baseUrl}/compilador-marcador.html`);
  console.log('Compilando el marcador (30-90 s según la máquina)…');

  // La compilación es un proceso pesado (detección de puntos multi-escala).
  await esperar(cdp, 'Boolean(window.__resultadoCompilacion || window.__errorCompilacion)', {
    timeoutMs: 180000,
    intervalMs: 1000,
  });

  const error = await evaluate(cdp, 'window.__errorCompilacion || null');
  if (error) throw new Error(error);

  const { matching, tracking } = JSON.parse(
    await evaluate(
      cdp,
      'JSON.stringify({ matching: window.__resultadoCompilacion.matching, tracking: window.__resultadoCompilacion.tracking })'
    )
  );
  const base64 = await evaluate(cdp, 'window.__resultadoCompilacion.base64');
  writeFileSync(salida, Buffer.from(base64, 'base64'));

  const kb = (statSync(salida).size / 1024).toFixed(1);
  console.log(`\ntargets.mind generado (${kb} kB)`);
  console.log(`  Puntos de detección (matching):   ${matching}`);
  console.log(`  Puntos de seguimiento (tracking): ${tracking}`);
  if (matching < 100) {
    console.log(
      '\nAVISO: menos de ~100 puntos de detección; el marcador puede ser poco\n' +
        'fiable. Añade más texto/detalle a la placa y vuelve a generarla.'
    );
    process.exitCode = 1;
  } else {
    console.log('\nCalidad suficiente. Activa ar.marcador en contenido/contenido.json si no lo está.');
  }
} finally {
  if (navegador) await navegador.cerrar();
  if (devProc) {
    try {
      execSync(`taskkill /pid ${devProc.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      devProc.kill();
    }
  }
}
