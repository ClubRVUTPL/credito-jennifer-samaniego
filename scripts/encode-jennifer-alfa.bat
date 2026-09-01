@echo off
REM Pipeline para el video de Jennifer Samaniego (croma verde limpio).
REM Genera alfa empaquetada: color arriba + mascara gris abajo (vstack).
cd /d "%~dp0.."
set MASTER=video\Video Jennifer croma final.mp4
set VERDE=0x00C838
set FPS=30

for %%H in (720 480) do (
  echo === Codificando jennifer-samaniego-%%H.mp4 ===
  ffmpeg -y -i "%MASTER%" -filter_complex "[0:v]fps=%FPS%,format=yuva420p,chromakey=%VERDE%:0.12:0.03,despill=type=green:mix=0.22:expand=0,format=rgba[k];[k]split=2[k1][k2];[k2]alphaextract,format=gray,gblur=sigma=0.5[m];[k1][m]alphamerge,format=rgba,split=2[c][a];[c]scale=-2:%%H:flags=lanczos,format=rgb24[color];[a]alphaextract,scale=-2:%%H:flags=lanczos,format=gray[mask];[color][mask]vstack=inputs=2[packed]" -map "[packed]" -map "0:a?" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow -c:a aac -b:a 128k -movflags +faststart "public\media\jennifer-samaniego-%%H.mp4"
)

echo === Cartel y retrato desde video ===
ffmpeg -y -ss 15 -i "%MASTER%" -vf "scale=1280:-1" -frames:v 1 -update 1 -q:v 4 "public\media\jennifer-samaniego-cartel.jpg"
echo DONE
