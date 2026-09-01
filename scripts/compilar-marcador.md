# Compilar el marcador de la placa

El seguimiento por imagen de MindAR no usa la foto directamente: necesita un
fichero binario precompilado (`targets.mind`) con los puntos característicos
de la imagen.

## Estado actual

`public/ar/placa.jpg` y `public/ar/targets.mind` ya existen. `ar.marcador`
apunta a `/ar/targets.mind` en `contenido/contenido.json` y la RA está activa.
Si sustituyes la foto de la placa, recompila el marcador con los pasos de
abajo; si no, MindAR seguirá buscando la imagen antigua.

## Pasos

1. Guarda la imagen de la placa como `public/ar/placa.jpg`.
   Vale cualquier imagen con detalle y contraste (un cartel, una portada…)
   para probar antes de tener la placa real. Evita superficies lisas,
   logotipos con mucho espacio vacío o patrones repetitivos.

2. Arranca el servidor de desarrollo y abre el compilador local:

   ```
   npm run dev
   ```

   → abre <http://localhost:5173/compilador-marcador.html>

   Esta página usa el compilador que trae el propio paquete `mind-ar`
   instalado en `node_modules` (el compilador de MindAR se ejecuta en el
   navegador; no existe una versión oficial de línea de comandos). Compila la
   imagen, **muestra cuántos puntos característicos detectó** y ofrece
   descargar el resultado.

3. Guarda el fichero descargado como:

   ```
   public/ar/targets.mind
   ```

4. Activa la capa de RA editando `contenido/contenido.json`:

   ```json
   "ar": {
     "marcador": "/ar/targets.mind",
     ...
   }
   ```

5. Recarga la página: ahora aparece el botón de realidad aumentada.

## ¿Cuántos puntos son suficientes?

- **Menos de ~100 puntos de detección**: el marcador será poco fiable.
  Busca una imagen con más contraste, texto y detalle no repetitivo.
- Varios cientos de puntos: detección estable a distancia normal de mano.

## Alternativa

Si el compilador local diera problemas, existe la herramienta web oficial de
MindAR (sube la imagen y descarga el mismo `targets.mind`):
<https://hiukim.github.io/mind-ar-js-doc/tools/compile>
