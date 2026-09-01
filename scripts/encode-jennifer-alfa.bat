@echo off
REM Pipeline para el video de Jennifer Samaniego.
REM Fondo blanco recortado con colorkey; alfa empaquetada (color arriba + mascara abajo).
cd /d "%~dp0.."
set MASTER=video\Diseno sin titulo (1).mp4
set BLANCO=0xFFFFFF
set FPS=30

for %%H in (720 480) do (
  echo === Codificando jennifer-samaniego-%%H.mp4 ===
  ffmpeg -y -i "%MASTER%" -filter_complex "[0:v]fps=%FPS%,format=rgba,colorkey=%BLANCO%:0.18:0.05,format=rgba[k];[k]split=2[k1][k2];[k2]alphaextract,format=gray,gblur=sigma=0.5[m];[k1][m]alphamerge,format=rgba,split=2[c][a];[c]scale=-2:%%H:flags=lanczos,format=rgb24[color];[a]alphaextract,scale=-2:%%H:flags=lanczos,format=gray[mask];[color][mask]vstack=inputs=2[packed]" -map "[packed]" -map "0:a?" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow -c:a aac -b:a 128k -movflags +faststart "public\media\jennifer-samaniego-%%H.mp4"
)

echo === Cartel y retrato ===
ffmpeg -y -ss 15 -i "%MASTER%" -vf "scale=1280:-1" -frames:v 1 -update 1 -q:v 4 "public\media\jennifer-samaniego-cartel.jpg"
ffmpeg -y -ss 15 -i "%MASTER%" -vf "scale=400:-1" -frames:v 1 -update 1 -q:v 4 "public\media\jennifer-samaniego-retrato.jpg"

echo DONE
