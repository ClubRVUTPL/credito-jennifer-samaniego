#!/usr/bin/env bash
# make-test-video.sh — Genera un clip sintético de prueba con alfa empaquetada.
#
# Produce public/media/prueba.mp4: unos 8 segundos con un cuadrado dorado que
# se mueve sobre fondo transparente. El fotograma va empaquetado: el color en
# la mitad superior y la máscara de opacidad (blanco = opaco) en la inferior.
# Sirve para validar el shader 'alfa-empaquetada' sin esperar al rodaje real.
#
# Requiere FFmpeg. En Windows: winget install Gyan.FFmpeg (y reabrir la terminal).
# Uso: bash scripts/make-test-video.sh

set -euo pipefail
cd "$(dirname "$0")/.."

# Fallo útil si FFmpeg no está: mejor un mensaje claro que un error de shell.
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: FFmpeg no está instalado o no está en el PATH." >&2
  echo "" >&2
  echo "  En Windows:  winget install Gyan.FFmpeg   (después cierra y reabre la terminal)" >&2
  echo "  Comprueba:   ffmpeg -version" >&2
  echo "" >&2
  echo "Nota: el banco de pruebas del shader (banco-shader.html) NO necesita FFmpeg;" >&2
  echo "genera su textura por código. Este script solo hace falta para producir el" >&2
  echo "vídeo de prueba en fichero (public/media/prueba.mp4)." >&2
  exit 1
fi

mkdir -p public/media

# Mitad de color: cuadrado dorado moviéndose sobre negro (el negro será
# transparente gracias a la máscara). Mitad de máscara: el mismo cuadrado en
# blanco sobre negro, con idéntica trayectoria.
# Banderas de compatibilidad con iOS: -profile:v baseline y -pix_fmt yuv420p.
ffmpeg -y \
  -f lavfi -i "color=c=black:s=640x360:d=8:r=30" \
  -f lavfi -i "color=c=0xd9a441:s=140x140:d=8:r=30" \
  -f lavfi -i "color=c=black:s=640x360:d=8:r=30" \
  -f lavfi -i "color=c=white:s=140x140:d=8:r=30" \
  -filter_complex "\
[0:v][1:v]overlay=x='(W-w)/2+(W/3)*sin(2*PI*t/4)':y='(H-h)/2+(H/6)*sin(2*PI*t/2)':shortest=1[color];\
[2:v][3:v]overlay=x='(W-w)/2+(W/3)*sin(2*PI*t/4)':y='(H-h)/2+(H/6)*sin(2*PI*t/2)':shortest=1[mask];\
[color][mask]vstack=inputs=2[packed]" \
  -map "[packed]" \
  -c:v libx264 -profile:v baseline -pix_fmt yuv420p \
  -movflags +faststart -an \
  public/media/prueba.mp4

echo
echo "Listo: public/media/prueba.mp4 (640x720: color arriba, máscara abajo)"
