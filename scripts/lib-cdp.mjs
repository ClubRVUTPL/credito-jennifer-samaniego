// lib-cdp.mjs — Cliente mínimo del protocolo DevTools, compartido por los
// scripts de herramientas (comprobar-ui, generar-placa, compilar-marcador).
//
// Sin dependencias: usa el WebSocket y el fetch nativos de Node 22+ y lanza
// Edge (o Chrome) en modo headless con puerto de depuración aleatorio.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const BROWSERS = [
  process.env.NAVEGADOR,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function cdpClient(ws) {
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject: rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  });

  return {
    send(method, params = {}) {
      return new Promise((res, rej) => {
        const id = ++nextId;
        pending.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    },
  };
}

/**
 * Lanza el navegador headless y devuelve { cdp, cerrar } con la sesión CDP
 * ya conectada a la única pestaña. `extraArgs` permite añadir banderas
 * (p. ej. '--use-angle=swiftshader' para WebGL por software).
 */
export async function lanzarNavegador(extraArgs = []) {
  const browser = BROWSERS.find((p) => existsSync(p));
  if (!browser) throw new Error('No se encontró Edge ni Chrome (defina NAVEGADOR=ruta.exe)');

  const userDataDir = mkdtempSync(join(tmpdir(), 'cdp-'));
  const needsWebGL = extraArgs.some((a) =>
    /swiftshader|webgl|angle|gpu-blocklist/i.test(a)
  );
  const proc = spawn(browser, [
    '--headless=new',
    // --disable-gpu rompe WebGL/SwiftShader en headless; solo usarlo si no hace falta GL.
    ...(needsWebGL
      ? ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      : ['--disable-gpu']),
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    ...extraArgs,
    'about:blank',
  ]);

  // El navegador escribe el puerto elegido en DevToolsActivePort.
  const portFile = join(userDataDir, 'DevToolsActivePort');
  let port = null;
  const limite = Date.now() + 15000;
  while (!port) {
    if (Date.now() > limite) throw new Error('El navegador no publicó DevToolsActivePort');
    await sleep(250);
    try {
      port = parseInt(readFileSync(portFile, 'utf8').split('\n')[0], 10) || null;
    } catch {
      /* aún no existe */
    }
  }

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('Sin pestaña de página en el navegador headless');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('WebSocket CDP falló')), { once: true });
  });

  const cdp = cdpClient(ws);

  async function cerrar() {
    proc.kill();
    await sleep(500); // deja al navegador soltar sus ficheros
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* el perfil temporal puede quedar bloqueado un instante; no es grave */
    }
  }

  return { cdp, cerrar };
}

export async function evaluate(cdp, expression, { awaitPromise = false } = {}) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (exceptionDetails) {
    throw new Error(`Error evaluando en la página: ${exceptionDetails.text}`);
  }
  return result.value;
}

export async function screenshot(cdp, file) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  writeFileSync(file, Buffer.from(data, 'base64'));
}

/** Navega y espera el evento load. */
export async function navegar(cdp, url) {
  const loaded = new Promise((res) => cdp.on('Page.loadEventFired', () => res()));
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url });
  await loaded;
}

/** Espera a que una expresión de la página devuelva verdadero. */
export async function esperar(cdp, expression, { timeoutMs = 15000, intervalMs = 250 } = {}) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await evaluate(cdp, expression)) return;
    await sleep(intervalMs);
  }
  throw new Error(`Tiempo agotado esperando: ${expression}`);
}
