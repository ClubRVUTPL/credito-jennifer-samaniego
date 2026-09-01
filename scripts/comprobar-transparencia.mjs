// Verifica el compositor WebGL crudo con el MP4 real.
//
// Además de fugas en las esquinas, FALLA si los píxeles opacos son una
// máscara gris/blanca (el bug de iOS: RGB = mitad-máscara). Una silueta
// blanca ya no puede pasar este script.
import { spawn, execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, reachable, lanzarNavegador, evaluate } from './lib-cdp.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.argv[2] || 'http://localhost:5173/';
const videoSrc = '/media/jennifer-samaniego-720.mp4';

const SHADER_TEST = `
(async () => {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.src = ${JSON.stringify(videoSrc)};
  await new Promise((res, rej) => {
    video.onloadeddata = res;
    video.onerror = () => rej(new Error('video no cargó'));
  });
  video.currentTime = 30;
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('seek a t=30s no terminó')), 20000);
    video.onseeked = () => { clearTimeout(t); res(); };
    if (video.readyState >= 2 && Math.abs(video.currentTime - 30) < 0.5) {
      clearTimeout(t);
      res();
    }
  });

  const {
    crearVideoTransparente,
    esVideoAlfaEmpaquetado,
    sondearMascaraArriba,
  } = await import('/src/video-transparente.js');

  const empaquetado = esVideoAlfaEmpaquetado(video);
  const mascaraArribaSondeo = sondearMascaraArriba(video);
  const t = crearVideoTransparente(video, { preserveDrawingBuffer: true });
  const webglOk = Boolean(t);

  let canvasAlpha = null;
  if (t) {
    document.body.appendChild(t.canvas);
    t.iniciar();
    const limite = Date.now() + 8000;
    while (t.canvas.width <= 1 && Date.now() < limite) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const c = t.canvas;
    const gl = c.getContext('webgl');
    const w = c.width;
    const h = c.height;
    if (w <= 1 || h <= 1) {
      t.destruir();
      return {
        webglOk,
        empaquetado,
        mascaraArribaSondeo,
        mascaraArribaCompositor: t.mascaraArriba,
        canvasAlpha: { error: 'lienzo sin dimensiones', w, h },
      };
    }
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    let transparente = 0;
    let muestreados = 0;
    let opaco = 0;
    let satSum = 0;
    let blancosMascara = 0;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = ((h - 1 - y) * w + x) * 4;
        const r = buf[i];
        const g = buf[i + 1];
        const b = buf[i + 2];
        const a = buf[i + 3];
        muestreados++;
        if (a < 8) transparente++;
        if (a > 200) {
          opaco++;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          satSum += sat;
          if (max > 220 && max - min < 18) blancosMascara++;
        }
      }
    }

    canvasAlpha = {
      w,
      h,
      muestreados,
      transparente,
      fondoPct: muestreados ? (transparente / muestreados) * 100 : 0,
      opaco,
      satMedia: opaco ? satSum / opaco : 0,
      fraccionBlanca: opaco ? blancosMascara / opaco : 0,
      blancosMascara,
    };
    const mascaraArribaCompositor = t.mascaraArriba;
    t.destruir();
    return {
      webglOk,
      empaquetado,
      mascaraArribaSondeo,
      mascaraArribaCompositor,
      canvasAlpha,
    };
  }

  return {
    webglOk,
    empaquetado,
    mascaraArribaSondeo,
    mascaraArribaCompositor: null,
    canvasAlpha,
  };
})()
`;

async function main() {
  let devProc = null;
  let navegador = null;
  const fallos = [];

  try {
    if (!(await reachable(baseUrl))) {
      devProc = spawn('npm', ['run', 'dev'], { cwd: rootDir, shell: true, stdio: 'ignore' });
      const limite = Date.now() + 30000;
      while (!(await reachable(baseUrl))) {
        if (Date.now() > limite) throw new Error('dev no respondió');
        await sleep(500);
      }
    }

    navegador = await lanzarNavegador(['--use-angle=swiftshader']);
    const { cdp } = navegador;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: baseUrl });
    await new Promise((res) => cdp.on('Page.loadEventFired', () => res()));
    await sleep(800);

    const result = await evaluate(cdp, SHADER_TEST, { awaitPromise: true });

    console.log('Resultado comprobación transparencia:');
    console.log(JSON.stringify(result, null, 2));

    if (!result.webglOk) {
      fallos.push('WebGL no disponible');
    }
    if (!result.empaquetado) {
      fallos.push('El video 720 no es alfa empaquetada — el recorte puede degradar al docente');
    }
    if (result.mascaraArribaSondeo !== 1) {
      fallos.push(
        `Sondeo 2D: se esperaba mascaraArriba=1 (máscara en la mitad inferior del fichero), se obtuvo ${result.mascaraArribaSondeo}`
      );
    }
    if (result.canvasAlpha && result.canvasAlpha.error) {
      fallos.push(`Lienzo WebGL inválido: ${result.canvasAlpha.error}`);
    }
    if (result.canvasAlpha && result.canvasAlpha.fondoPct < 12) {
      fallos.push(
        `Poco fondo transparente: ${result.canvasAlpha.fondoPct.toFixed(1)}% de los píxeles tienen alfa≈0 (se espera ver la cámara alrededor del docente)`
      );
    }
    if (result.canvasAlpha && result.canvasAlpha.opaco < 5000) {
      fallos.push('El sujeto no tiene suficientes píxeles opacos — recorte demasiado agresivo');
    }
    if (result.canvasAlpha && result.canvasAlpha.fraccionBlanca > 0.55) {
      fallos.push(
        `RGB = máscara blanca: ${((result.canvasAlpha.fraccionBlanca || 0) * 100).toFixed(1)}% de los píxeles opacos son blanco/gris plano (silueta de máscara, no color del docente)`
      );
    }
    if (result.canvasAlpha && result.canvasAlpha.satMedia < 0.06) {
      fallos.push(
        `Sin crominancia real: saturación media ${result.canvasAlpha.satMedia.toFixed(3)} en píxeles opacos (máscara gris, no RGB del docente)`
      );
    }

    if (fallos.length) {
      console.error('\nFALLO:', fallos.join('; '));
      process.exitCode = 1;
    } else {
      console.log('\nOK: fondo transparente y color real del docente verificados');
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
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
