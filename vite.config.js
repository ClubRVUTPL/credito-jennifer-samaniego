import { defineConfig } from 'vite';
import { cpSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

function leerContenido() {
  return JSON.parse(readFileSync(`${rootDir}contenido/contenido.json`, 'utf8'));
}

// El contenido editorial vive en /contenido (fuera de /public) según la
// estructura del proyecto. Vite solo copia /public a dist, así que este
// mini-plugin copia /contenido en cada build. En desarrollo no hace falta:
// Vite ya sirve los ficheros de la raíz del proyecto tal cual.
function copiarContenido() {
  return {
    name: 'copiar-contenido',
    closeBundle() {
      cpSync(`${rootDir}contenido`, `${rootDir}dist/contenido`, { recursive: true });
    },
  };
}

// El <title> se resuelve en tiempo de compilación a partir de contenido.json,
// no en tiempo de ejecución. Antes lo escribía main.js tras cargar el JSON, y
// entre el primer pintado y esa asignación se veía un título provisional.
// transformIndexHtml corre también en desarrollo, así que ambos coinciden.
function tituloDesdeContenido() {
  return {
    name: 'titulo-desde-contenido',
    transformIndexHtml(html) {
      const contenido = leerContenido();
      const titulo = [contenido.placa?.titulo, contenido.docente?.nombre]
        .filter(Boolean)
        .join(' · ');
      if (!titulo) return html;
      // Se escapa lo mínimo imprescindible: el JSON es de confianza (lo edita
      // el equipo), pero un & o un < sueltos romperían el HTML.
      const seguro = titulo
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${seguro}</title>`);
    },
  };
}

export default defineConfig({
  // Destino: Vercel, en la RAÍZ del dominio. Todas las rutas del
  // proyecto son absolutas (/contenido/…, /fonts/…, /ar/…, /media/…), así que
  // el sitio NO funcionaría colgado de un subdirectorio. Si algún día hiciera
  // falta, habría que cambiar esto y las rutas del JSON a la vez.
  base: '/',
  // --host en el script "dev" expone el servidor a la red local;
  // aquí se fija también para npm run preview.
  server: {
    host: true,
    // El túnel de cloudflared genera un subdominio aleatorio distinto cada
    // vez (*.trycloudflare.com); sin esto Vite rechaza la petición por venir
    // de un host que no reconoce.
    allowedHosts: ['.trycloudflare.com'],
  },
  resolve: {
    alias: {
      // El bundle de mind-ar (por TensorFlow.js) referencia "util" y
      // "node-fetch" en ramas que solo corren bajo Node, nunca en el
      // navegador. Sin estos alias, Vite avisa al externalizar "util" en el
      // build y esbuild falla al resolver "node-fetch" en desarrollo.
      util: `${rootDir}src/shims/util.js`,
      'node-fetch': `${rootDir}src/shims/node-fetch.js`,
    },
  },
  // A-Frame y MindAR se cargan bajo demanda con import() dinámico, así que su
  // tamaño no afecta a la carga inicial. Se pre-empaquetan en desarrollo para
  // que el primer clic en el botón de RA no provoque una recarga de Vite.
  optimizeDeps: {
    include: ['aframe', 'mind-ar/dist/mindar-image-aframe.prod.js'],
  },
  build: {
    // Los chunks del motor de RA son grandes por naturaleza y se descargan
    // solo al pulsar el botón: el aviso de tamaño no aporta nada aquí.
    chunkSizeWarningLimit: 3000,
  },
  plugins: [copiarContenido(), tituloDesdeContenido()],
});
