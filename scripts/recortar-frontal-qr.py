"""Recorta la zona QR de la cara frontal (recorte cuadrado).

La chapa frontal completa (~1334x400, ratio ~3:1) es un mal target MindAR a
distancia de mano: pocos descriptores estables por fotograma. Este recorte
cuadrado de la zona QR frontal mejora la detección de esa cara. El texto o
puesto de la placa es irrelevante: todas disparan la misma RA.
"""
from pathlib import Path
from PIL import Image

src = Path(__file__).resolve().parents[1] / "public" / "ar" / "placa-cara-texto.jpg"
out = Path(__file__).resolve().parents[1] / "public" / "ar" / "placa-cara-frontal-qr.jpg"

im = Image.open(src).convert("RGB")
w, h = im.size
# Recorte cuadrado centrado en la mitad derecha (zona QR de alta densidad).
side = int(h * 0.92)
left = int(w * 0.62)
top = int((h - side) / 2)
left = max(0, min(left, w - side))
top = max(0, min(top, h - side))
crop = im.crop((left, top, left + side, top + side))
crop.save(out, "JPEG", quality=92, optimize=True)
print(f"src={w}x{h} crop=({left},{top},{left+side},{top+side}) -> {out} {out.stat().st_size} B {crop.size}")
