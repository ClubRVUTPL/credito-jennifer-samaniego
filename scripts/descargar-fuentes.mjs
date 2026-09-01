// descargar-fuentes.mjs — Descarga las tipografías del proyecto para autoalojarlas.
//
// Baja los woff2 de Montserrat (la tipografía de la identidad institucional
// de la UTPL: 400 texto, 600 énfasis, 800 titulares) e IBM Plex Mono, que
// solo usa el panel de diagnóstico de desarrollo (subconjuntos latín y latín
// extendido) desde la API de Google Fonts, los guarda en public/fonts/ y
// regenera src/fuentes.css con las @font-face apuntando a los ficheros
// locales. El código final no toca ningún CDN: los ficheros quedan servidos
// desde el propio proyecto — es una decisión de diseño explícita (ver
// README.md), no solo de rendimiento.
//
// Solo usa Node (fetch y fs nativos), sin dependencias. Se ejecuta una vez
// (o cuando se quiera cambiar de pesos/familias):
//   node scripts/descargar-fuentes.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = resolve(rootDir, 'public', 'fonts');
const cssFile = resolve(rootDir, 'src', 'fuentes.css');

// Un user-agent moderno para que la API devuelva woff2 (con otros UA sirve ttf).
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Familias y pesos que usa la interfaz. Mantener corto: cada peso son dos
// ficheros (latin + latin-ext) que cuentan para el peso inicial de la página.
const FAMILIES = [
  {
    slug: 'montserrat',
    // 400 (texto), 600 (énfasis: pestañas, etiquetas) y 800 (titulares y
    // botones: el peso extra-negrita que usa la propia utpl.edu.ec en sus
    // portadas). Pedidos juntos como rango: cada peso sigue llegando en su
    // propio fichero, Google no los fusiona.
    css: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap',
  },
  {
    slug: 'plex-mono',
    css: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&display=swap',
  },
];

const SUBSETS = new Set(['latin', 'latin-ext']);

// La respuesta de la API es una lista de bloques:
//   /* latin-ext */
//   @font-face { font-family: ...; font-weight: 400; src: url(...woff2) ...; unicode-range: ...; }
const BLOCK_RE =
  /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;

function pick(block, prop) {
  const match = block.match(new RegExp(`${prop}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

async function main() {
  mkdirSync(fontsDir, { recursive: true });

  const faces = [];
  let totalBytes = 0;

  for (const family of FAMILIES) {
    const response = await fetch(family.css, { headers: { 'User-Agent': UA } });
    if (!response.ok) throw new Error(`${family.slug}: HTTP ${response.status}`);
    const cssText = await response.text();

    for (const match of cssText.matchAll(BLOCK_RE)) {
      const subset = match[1];
      if (!SUBSETS.has(subset)) continue;
      const block = match[2];

      const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      const weight = pick(block, 'font-weight') || '400';
      const style = pick(block, 'font-style') || 'normal';
      const familyName = pick(block, 'font-family')?.replace(/'/g, '') || family.slug;
      const unicodeRange = pick(block, 'unicode-range');
      if (!url || !unicodeRange) continue;

      const fileName = `${family.slug}-${weight.replace(/\s+/g, '_')}-${subset}.woff2`;
      const fontResponse = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!fontResponse.ok) throw new Error(`${fileName}: HTTP ${fontResponse.status}`);
      const bytes = Buffer.from(await fontResponse.arrayBuffer());
      writeFileSync(resolve(fontsDir, fileName), bytes);
      totalBytes += bytes.length;
      console.log(`  ${fileName}  ${(bytes.length / 1024).toFixed(1)} kB`);

      faces.push(
        [
          '@font-face {',
          `  font-family: '${familyName}';`,
          `  font-style: ${style};`,
          `  font-weight: ${weight};`,
          '  font-display: swap;',
          `  src: url('/fonts/${fileName}') format('woff2');`,
          `  unicode-range: ${unicodeRange};`,
          '}',
        ].join('\n')
      );
    }
  }

  const header = [
    '/* fuentes.css — GENERADO por scripts/descargar-fuentes.mjs; no editar a mano.',
    '   Tipografías autoalojadas en /public/fonts (subconjuntos latín y latín',
    '   extendido, font-display: swap). Licencia: SIL Open Font License. */',
    '',
  ].join('\n');
  writeFileSync(cssFile, `${header}\n${faces.join('\n\n')}\n`);

  console.log(`\nTotal: ${faces.length} ficheros, ${(totalBytes / 1024).toFixed(1)} kB`);
  console.log(`CSS generado: src/fuentes.css`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
