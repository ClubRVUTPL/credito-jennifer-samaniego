// compilar-marcador-headless.mjs — Compila 3 targets a public/ar/targets.mind
// (posterior QR + zona QR frontal cuadrada + chapa frontal) sin abrir el
// navegador a mano.
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
  navegador = await lanzarNavegador(['--use-angle=swiftshader', '--enable-webgl', '--enable-webgl2']);
  const { cdp } = navegador;

  await navegar(cdp, `${baseUrl}/compilador-marcador.html`);
  console.log('Compilando el marcador (3 targets; 30-180 s según la máquina)…');

  await esperar(cdp, 'Boolean(window.__resultadoCompilacion || window.__errorCompilacion)', {
    timeoutMs: 300000,
    intervalMs: 1000,
  });

  const error = await evaluate(cdp, 'window.__errorCompilacion || null');
  if (error) throw new Error(error);

  const resumen = JSON.parse(
    await evaluate(
      cdp,
      `JSON.stringify({
        matching: window.__resultadoCompilacion.matching,
        tracking: window.__resultadoCompilacion.tracking,
        targets: window.__resultadoCompilacion.targets,
        porTarget: window.__resultadoCompilacion.porTarget || null
      })`
    )
  );
  const base64 = await evaluate(cdp, 'window.__resultadoCompilacion.base64');
  writeFileSync(salida, Buffer.from(base64, 'base64'));

  const kb = (statSync(salida).size / 1024).toFixed(1);
  const labels = ['posterior-QR', 'frontal-QR', 'frontal-chapa'];
  console.log(`\ntargets.mind generado (${kb} kB)`);
  console.log(`  Targets: ${resumen.targets}`);
  if (Array.isArray(resumen.porTarget)) {
    for (const t of resumen.porTarget) {
      const label = labels[t.index] || `t${t.index}`;
      console.log(`  Target ${t.index} (${label}): matching=${t.matching}, tracking=${t.tracking}`);
    }
  }
  console.log(`  Total matching:   ${resumen.matching}`);
  console.log(`  Total tracking:   ${resumen.tracking}`);
  if (resumen.matching < 100) {
    console.log(
      '\nAVISO: menos de ~100 puntos de detección en total; el marcador puede ser poco\n' +
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