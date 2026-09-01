#!/usr/bin/env bash
# encode-video.sh — Convierte el máster real con canal alfa al formato del proyecto.
#
# Entrada: un vídeo con canal alfa de verdad (p. ej. ProRes 4444 .mov exportado
# desde el programa de edición con fondo recortado).
# Salida: public/media/<nombre>-720.mp4 y <nombre>-480.mp4 con alfa empaquetada:
# color en la mitad superior del fotograma, máscara de opacidad en la inferior.
#
# Banderas de compatibilidad con iOS: -profile:v baseline, -pix_fmt yuv420p
# y -movflags +faststart para que el vídeo empiece a reproducirse en streaming.
#
# Requiere FFmpeg. Uso:
#   bash scripts/encode-video.sh master-con-alfa.mov [nombre-salida]
# Después, apunta ar.video en contenido/contenido.json a /media/<nombre>-720.mp4

set -euo pipefail

# Fallo útil si FFmpeg no está: mejor un mensaje claro que un error de shell.
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: FFmpeg no está instalado o no está en el PATH." >&2
  echo "" >&2
  echo "  En Windows:  winget install Gyan.FFmpeg   (después cierra y reabre la terminal)" >&2
  echo "  Comprueba:   ffmpeg -version" >&2
  exit 1
fi

INPUT="${1:?Uso: bash scripts/encode-video.sh master-con-alfa.mov [nombre-salida]}"
NAME="${2:-artista}"
OUTDIR="$(dirname "$0")/../public/media"

mkdir -p "$OUTDIR"

# Nota: la altura indicada (720/480) es la de la IMAGEN; el fichero resultante
# mide el doble de alto porque lleva la máscara debajo.
#
# El audio del máster se CONSERVA: desde que se retiró la pista de narración
# aparte, la voz del docente viaja dentro de este mismo .mp4. El "?" de
# -map 0:a? hace que el mapeo sea opcional, así que un máster mudo no rompe el
# script (pero producirá un vídeo mudo: ver la comprobación del final).
for HEIGHT in 720 480; do
  ffmpeg -y -i "$INPUT" \
    -filter_complex "\
[0:v]format=rgba,split=2[c][a];\
[c]scale=-2:${HEIGHT}:flags=lanczos[color];\
[a]alphaextract,scale=-2:${HEIGHT}:flags=lanczos[mask];\
[color][mask]vstack=inputs=2[packed]" \
    -map "[packed]" -map "0:a?" \
    -c:v libx264 -profile:v baseline -pix_fmt yuv420p \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$OUTDIR/${NAME}-${HEIGHT}.mp4"
done

# Aviso explícito si el resultado salió mudo. Es el fallo más fácil de no ver:
# el vídeo se reproduce igual, simplemente el docente no se oye.
if ! ffprobe -v error -select_streams a -show_entries stream=index \
     -of csv=p=0 "$OUTDIR/${NAME}-720.mp4" | grep -q .; then
  echo
  echo "AVISO: el vídeo generado NO tiene pista de audio." >&2
  echo "  El máster de entrada tampoco la tenía. Ahora la voz del docente va" >&2
  echo "  dentro de este archivo, así que revisa la exportación." >&2
fi

echo
echo "Listo:"
echo "  $OUTDIR/${NAME}-720.mp4"
echo "  $OUTDIR/${NAME}-480.mp4"
