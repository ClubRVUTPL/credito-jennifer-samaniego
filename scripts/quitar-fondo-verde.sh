#!/usr/bin/env bash
# quitar-fondo-verde.sh — Del máster grabado sobre croma verde al formato del
# proyecto, en un solo paso.
#
# Es el hermano de encode-video.sh:
#   - encode-video.sh          entra un máster que YA trae canal alfa (ProRes 4444).
#   - quitar-fondo-verde.sh    entra un .mp4 normal grabado sobre fondo verde.
#
# Salida idéntica en ambos casos: public/media/<nombre>-720.mp4 y -480.mp4 con
# ALFA EMPAQUETADA (color en la mitad superior del fotograma, máscara de
# opacidad en la inferior), que es lo que espera el shader alfa-empaquetada.
#
# Uso:
#   bash scripts/quitar-fondo-verde.sh master-croma.mp4 [nombre-salida] [colorverde]
#
# El tercer argumento es el verde del fondo en hexadecimal RRGGBB. Por defecto
# 0x64DB08, medido sobre el material de ensayo. Si el croma de la grabación
# real es otro, sácalo con una captura de pantalla y un cuentagotas: un verde
# equivocado deja halos o se come partes de la persona.
#
# Cómo funciona el recorte (y qué tocar si sale mal):
#   chromakey ...:0.16:0.04   similitud y suavizado. Subir la similitud recorta
#                             más agresivo (riesgo: se come piel y pelo);
#                             bajarla deja fondo verde alrededor.
#   despill                   quita el verde que "tiñe" bordes y ropa clara.
#                             mix alto vuelve la ropa blanca rosácea.
#   erosion + gblur           muerden un píxel el borde y lo suavizan: es lo
#                             que mata la última línea verde del contorno.
#
# Requiere FFmpeg.

set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: FFmpeg no está instalado o no está en el PATH." >&2
  echo "  En Windows:  winget install Gyan.FFmpeg" >&2
  exit 1
fi

INPUT="${1:?Uso: bash scripts/quitar-fondo-verde.sh master-croma.mp4 [nombre-salida] [0xRRGGBB]}"
NAME="${2:-docente}"
VERDE="${3:-0x64DB08}"
OUTDIR="$(dirname "$0")/../public/media"
FPS=30

mkdir -p "$OUTDIR"

# RECORTE DEL ENCUADRE: por defecto no se recorta nada. Si la grabación viene
# apaisada y la persona ocupa solo el centro, pon aquí un crop
# (crop=ancho:alto:x:y) para dejar un encuadre vertical y no gastar píxeles en
# fondo transparente. Ejemplo usado con el material de ensayo:
#   CROP="crop=640:720:350:0,"
CROP="${CROP:-}"

for HEIGHT in 720 480; do
  ffmpeg -y -i "$INPUT" -filter_complex "\
[0:v]fps=${FPS},${CROP}format=yuva420p,\
chromakey=${VERDE}:0.16:0.04,\
despill=type=green:mix=0.25:expand=0,format=rgba[k];\
[k]split=2[k1][k2];\
[k2]alphaextract,format=gray,erosion,gblur=sigma=0.6[m];\
[k1][m]alphamerge,format=rgba,split=2[c][a];\
[c]scale=-2:${HEIGHT}:flags=lanczos,format=rgb24[color];\
[a]alphaextract,scale=-2:${HEIGHT}:flags=lanczos,format=gray[mask];\
[color][mask]vstack=inputs=2[packed]" \
    -map "[packed]" -map "0:a?" \
    -c:v libx264 -profile:v baseline -pix_fmt yuv420p -crf 23 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$OUTDIR/${NAME}-${HEIGHT}.mp4"
done

# La voz del docente viaja dentro de este mismo archivo: un máster mudo es un
# fallo silencioso (el vídeo se ve igual, simplemente no se oye).
if ! ffprobe -v error -select_streams a -show_entries stream=index \
     -of csv=p=0 "$OUTDIR/${NAME}-720.mp4" | grep -q .; then
  echo
  echo "AVISO: el vídeo generado NO tiene pista de audio." >&2
  echo "  El máster de entrada tampoco la tenía. Revisa la exportación." >&2
fi

echo
echo "Listo:"
echo "  $OUTDIR/${NAME}-720.mp4"
echo "  $OUTDIR/${NAME}-480.mp4"
echo
echo "Siguiente paso: apunta \"video\" en contenido/contenido.json a esos archivos."
