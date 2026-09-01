// comprobar-ui.mjs — Comprobaciones automáticas de la capa de contenido.
//
// Sin dependencias: lanza Edge (o Chrome) en modo headless y habla el
// protocolo DevTools con el WebSocket y el fetch nativos de Node 22+.
//
// Comprueba:
//   1. Sin desbordamiento horizontal a 380 px de ancho.
//   2. Pestañas: flechas, Inicio y Fin cambian aria-selected, hidden y foco.
//      (Simula los KeyboardEvent sobre el DOM: valida nuestro manejador,
//      no el enrutado nativo de teclas del navegador.)
//   3. Botón de RA coherente con el JSON: visible si ar.marcador está
//      activo, oculto si es null.
//   4. Consola sin mensajes durante la carga (los avisos internos del
//      cliente de desarrollo de Vite se listan aparte, como ruido).
//   5. Capturas de pantalla a 380 px y 900 px en docs/capturas/.
//
// Uso:
//   node scripts/comprobar-ui.mjs [url]
// Si la URL (por defecto http://localhost:5173/) no responde, arranca
// `npm run dev` él mismo y lo detiene al terminar.

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, reachable, lanzarNavegador, evaluate, screenshot } from './lib-cdp.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.argv[2] || 'http://localhost:5173/';
const capturasDir = resolve(rootDir, 'docs', 'capturas');

// El estado esperado del botón de RA depende del JSON: con marcador y cámara
// debe verse; sin marcador debe quedar oculto (y la página seguir funcionando).
const contenido = JSON.parse(readFileSync(join(rootDir, 'contenido', 'contenido.json'), 'utf8'));
const marcadorActivo = Boolean(contenido.ar && contenido.ar.marcador);

const resultados = [];
function check(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle });
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* Principal                                                           */
/* ------------------------------------------------------------------ */

async function main() {
  let devProc = null;
  let navegador = null;

  try {
    /* Servidor: usa el que haya o arranca uno propio. */
    if (!(await reachable(baseUrl))) {
      console.log(`Servidor no disponible en ${baseUrl}; arrancando npm run dev…`);
      devProc = spawn('npm', ['run', 'dev'], { cwd: rootDir, shell: true, stdio: 'ignore' });
      const limite = Date.now() + 30000;
      while (!(await reachable(baseUrl))) {
        if (Date.now() > limite) throw new Error('npm run dev no respondió en 30 s');
        await sleep(500);
      }
    }

    navegador = await lanzarNavegador();
    const { cdp } = navegador;

    /* Captura de consola desde antes de navegar. */
    const consola = [];
    const ruidoVite = [];
    cdp.on('Runtime.consoleAPICalled', (p) => {
      const texto = p.args
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
        .join(' ');
      (texto.includes('[vite]') ? ruidoVite : consola).push(`${p.type}: ${texto}`);
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      consola.push(`excepción: ${p.exceptionDetails.text} ${p.exceptionDetails.exception?.description || ''}`);
    });
    cdp.on('Log.entryAdded', (p) => {
      consola.push(`${p.entry.level}: ${p.entry.text}`);
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    /* ── Vista móvil: 380 px ── */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 380,
      height: 800,
      deviceScaleFactor: 2,
      mobile: true,
    });

    const loaded = new Promise((res) => cdp.on('Page.loadEventFired', () => res()));
    await cdp.send('Page.navigate', { url: baseUrl });
    await loaded;

    // Espera a que la interfaz esté pintada (pestañas o aviso de error).
    const limiteApp = Date.now() + 10000;
    let listo = false;
    while (!listo && Date.now() < limiteApp) {
      listo = await evaluate(
        cdp,
        `Boolean(document.querySelector('[role="tab"]') || document.querySelector('.error-carga'))`
      );
      if (!listo) await sleep(200);
    }
    if (!listo) throw new Error('La interfaz no llegó a pintarse en 10 s');
    await evaluate(cdp, 'document.fonts.ready.then(() => true)', { awaitPromise: true });
    await sleep(300); // margen para renderizado y mensajes de consola tardíos

    console.log('\nComprobaciones a 380 px:');

    /* 1 · Desbordamiento horizontal. */
    const medidas = await evaluate(
      cdp,
      `JSON.stringify({
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        ventana: window.innerWidth,
      })`
    );
    const m = JSON.parse(medidas);
    check(
      'Sin desbordamiento horizontal a 380 px',
      m.doc <= m.ventana && m.body <= m.ventana,
      `documento ${m.doc}px / ventana ${m.ventana}px`
    );

    /* 2 · Estructura de pestañas. */
    const estructura = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
          tabs: document.querySelectorAll('[role="tab"]').length,
          paneles: document.querySelectorAll('[role="tabpanel"]').length,
          visibles: [...document.querySelectorAll('[role="tabpanel"]')].filter(p => !p.hidden).length,
          // Visibilidad REAL (dimensiones renderizadas), no solo el atributo:
          // un display de una clase CSS puede anular el hidden del navegador.
          botonAr: (() => {
            const b = document.querySelector('.boton-ar');
            if (!b) return null;
            return { atributo: b.hidden, pintado: Boolean(b.offsetWidth || b.offsetHeight) };
          })(),
        })`
      )
    );
    check('Cuatro pestañas y cuatro paneles', estructura.tabs === 4 && estructura.paneles === 4);
    check('Un único panel visible', estructura.visibles === 1);
    check(
      marcadorActivo
        ? 'Botón de RA visible con ar.marcador activo'
        : 'Botón de RA oculto con ar.marcador en null',
      estructura.botonAr !== null &&
        (marcadorActivo
          ? !estructura.botonAr.atributo && estructura.botonAr.pintado
          : estructura.botonAr.atributo && !estructura.botonAr.pintado),
      estructura.botonAr === null
        ? 'el botón no existe en el DOM'
        : `atributo hidden: ${estructura.botonAr.atributo}, pintado: ${estructura.botonAr.pintado}`
    );

    /* 3 · Navegación por teclado. */
    const teclado = JSON.parse(
      await evaluate(
        cdp,
        `(() => {
          const tabs = [...document.querySelectorAll('[role="tab"]')];
          const paneles = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
          const estado = () => ({
            sel: tabs.map(t => t.getAttribute('aria-selected') === 'true'),
            ocultos: paneles.map(p => p.hidden),
            foco: tabs.indexOf(document.activeElement),
          });
          const pulsa = (key) => document.activeElement.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
          );
          tabs[0].focus();
          const r = { inicial: estado() };
          pulsa('ArrowRight'); r.derecha = estado();
          pulsa('End');        r.fin = estado();
          pulsa('ArrowLeft');  r.izquierda = estado();
          pulsa('Home');       r.inicio = estado();
          pulsa('ArrowLeft');  r.envuelve = estado(); // desde la primera → última
          return JSON.stringify(r);
        })()`
      )
    );
    const sel = (r) => r.sel.findIndex(Boolean);
    check(
      'Flecha derecha selecciona la 2.ª pestaña y mueve el foco',
      sel(teclado.derecha) === 1 && teclado.derecha.foco === 1 && teclado.derecha.ocultos[1] === false
    );
    check('Fin salta a la última pestaña', sel(teclado.fin) === 3 && teclado.fin.foco === 3);
    check('Flecha izquierda retrocede', sel(teclado.izquierda) === 2 && teclado.izquierda.foco === 2);
    check('Inicio vuelve a la primera', sel(teclado.inicio) === 0 && teclado.inicio.foco === 0);
    check('La navegación envuelve en los extremos', sel(teclado.envuelve) === 3);
    check(
      'Solo el panel activo es visible tras navegar',
      teclado.envuelve.ocultos.filter((h) => !h).length === 1
    );

    /* 4 · Captura 380 px. */
    mkdirSync(capturasDir, { recursive: true });
    await screenshot(cdp, join(capturasDir, '380.png'));
    console.log(`  · captura guardada: docs/capturas/380.png`);

    /* ── Vista escritorio: 900 px ── */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 900,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(300);
    await screenshot(cdp, join(capturasDir, '900.png'));
    console.log(`  · captura guardada: docs/capturas/900.png`);

    /* 5 · Consola. */
    console.log('\nConsola:');
    check('Consola sin mensajes durante la carga', consola.length === 0, consola.join(' | '));
    if (ruidoVite.length) {
      console.log(`  · ruido del cliente de Vite (ignorado): ${ruidoVite.length} mensaje(s)`);
    }

    /* Resumen. */
    const fallos = resultados.filter((r) => !r.ok);
    console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones superadas`);
    process.exitCode = fallos.length ? 1 : 0;
  } finally {
    if (navegador) await navegador.cerrar();
    if (devProc) {
      // En Windows, matar el árbol completo (npm → node → vite).
      try {
        execSync(`taskkill /pid ${devProc.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        devProc.kill();
      }
    }
  }
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 2;
});
