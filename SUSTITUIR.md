# Qué sustituir para publicar

Guía para dejar la página lista sin tocar código. Todo lo que hay que cambiar
está en **un archivo de texto** y **dos archivos de medios**.

No hace falta saber programar. Si algo no encaja con lo que ves, para y
pregunta antes de improvisar.

---

## Antes de empezar

Necesitas el proyecto abierto en una terminal y haber ejecutado una vez:

```
npm install
```

Para ver los cambios mientras editas:

```
npm run dev
```

Deja esa ventana abierta y abre en el navegador la dirección que imprime
(algo como `http://localhost:5173`). Cada vez que guardes un archivo, la
página se recarga sola.

---

## 1 · Los textos de la página

**Archivo:** `contenido/contenido.json`

Ábrelo con cualquier editor de texto. Es una lista de etiquetas entre comillas
seguidas de su valor, también entre comillas. **Cambia solo lo que está a la
derecha de los dos puntos**, y no borres las comillas ni las comas.

| Qué quieres cambiar | Busca esta etiqueta | Ejemplo de valor final |
|---|---|---|
| Nombre del docente | `"nombre"` (dentro de `"docente"`) | `"María Sarango"` |
| Su papel en la obra | `"rol"` | `"Autoría y realización de la pieza"` |
| Línea dorada superior | `"etiqueta"` | `"Obra conmemorativa · 50 años MAD · UTPL"` |
| Qué es el objeto | `"queEs"` | `"Placa conmemorativa por los 50 años…"` |
| Qué ofrece la RA | `"queOfrece"` | `"Apunta con la cámara y su autora…"` |
| Lo mismo, para quien llega por el QR | `"queOfrece"` y `"requisito"` **dentro de `"qr"`** | Ver el recuadro de abajo |
| Aviso en Instagram/WhatsApp | `"navegadorEmbebido"` | `"Ábrela en tu navegador…"` |
| Texto del concepto | `"parrafos"` (lista) | Un párrafo por línea, entre comillas |
| Ficha técnica | `"datos"` | Pares de `"termino"` y `"detalle"` |
| Etapas del proceso | `"pasos"` (lista) | Una etapa por línea |
| Correo, web, redes | `"enlaces"` | Pares de `"texto"` y `"url"` |

### El bloque `"qr"`

Dentro de `"entrada"` hay un bloque `"qr"` con dos textos:

```json
"qr": {
  "queOfrece": "Tienes la pieza delante. Apunta con la cámara a la placa…",
  "requisito": "Busca la placa grabada en la base de la pieza."
}
```

Esos dos **solo se ven cuando alguien llega escaneando el código QR** (la
dirección lleva `?qr=1` al final). Sirven para no preguntarle si tiene la
pieza delante a quien la tiene en la mano.

Si escribes ahí una etiqueta que no exista fuera, no pasa nada: solo se usan
las que definas. Si borras el bloque entero, la página usa siempre los textos
normales.

### Reglas de los enlaces

- Un correo se escribe `"mailto:persona@dominio.com"` en `"url"`.
- Una web se escribe completa: `"https://…"`. Si te falta el `https://`, el
  enlace deja de funcionar y aparece como texto sin más.
- Un teléfono se escribe `"tel:+593…"`.

### Añadir o quitar filas

Cada elemento de una lista va entre llaves `{ }` y se separa del siguiente con
una coma. **El último de la lista no lleva coma.** Si te equivocas con las
comas, la página muestra "No se pudo cargar el contenido": revisa la última
edición.

---

## 2 · Lo que dice el docente en voz alta

**Ya no hay guion, ni voz sintética, ni subtítulos.** El docente habla en el
propio vídeo y su voz va dentro del archivo de vídeo.

Si vienes de una versión anterior de esta guía: `contenido/guion.txt`,
`public/media/artista-narracion.mp3`, `public/media/subtitulos.vtt` y el
script `scripts/generar-narracion.mjs` se han eliminado. No hay que
sustituirlos por nada; todo lo que se decía en ellos se dice ahora grabando
el vídeo del apartado siguiente.

Lo único que se conserva de aquello es el criterio: **habla quien hizo la
pieza, en primera persona**, entre 45 y 75 segundos. Y ahora ese criterio se
cumple o se incumple en el rodaje, porque después ya no hay forma de
cambiarlo desde ningún archivo de texto.

---

## 3 · El vídeo del docente

Este es el que aparece sobre la placa en realidad aumentada.

### Cómo hay que grabarlo

- El docente sobre **fondo liso de un solo color** (verde o azul), bien
  iluminado y separado del fondo.
- Cámara fija, **en vertical**, plano de medio cuerpo o cuerpo entero.
- Que hable mirando a cámara. **El sonido de esta grabación es el que se va a
  oír**: ya no se sustituye por una narración aparte. Graba con micrófono de
  solapa o de cañón, no con el del móvil, y en un sitio sin eco.
- Entre 45 y 75 segundos.

> **Lo que se grabe es lo que queda.** Antes se podía reescribir el guion y
> regenerar la voz sin volver a rodar. Ahora no: cambiar una frase significa
> volver a grabar. Merece la pena repasar el texto con el docente **antes**
> del rodaje.

### Cómo prepararlo

Hay dos caminos según lo que te entreguen. Los dos dejan los archivos listos
en `public/media/`, con el audio dentro.

**A · Te dan el vídeo tal cual, con el fondo verde todavía puesto.**

```
bash scripts/quitar-fondo-verde.sh el-video-croma.mp4 docente
```

El script recorta el fondo, empaqueta la transparencia y genera las dos
versiones. Si el verde de la grabación no es el de siempre, pásalo como tercer
argumento (`0xRRGGBB`). Los mandos para afinar el recorte están comentados
dentro del propio script.

**B · Quien edita el vídeo ya lo exporta con el fondo recortado**, en ProRes
4444 `.mov` o similar (canal alfa de verdad, y el audio incluido):

```
bash scripts/encode-video.sh el-video-exportado.mov docente
```

Cualquiera de los dos genera `public/media/docente-720.mp4` y
`public/media/docente-480.mp4` en el formato exacto que la página necesita,
conservando la pista de audio. Si el archivo que le pasas viene mudo, el
script te avisa en pantalla — no lo dejes pasar.

### Cómo conectarlo

En `contenido/contenido.json`, busca `"video"` y déjalo así:

```json
"video": {
  "720": "/media/docente-720.mp4",
  "480": "/media/docente-480.mp4"
}
```

La página elige sola: con buena conexión sirve la de 720 y con conexión lenta
la de 480.

También puedes poner una sola ruta si solo tienes una versión:

```json
"video": "/media/docente-720.mp4"
```

### Imagen de espera (opcional)

Si quieres que se vea una imagen fija mientras el vídeo carga, guárdala en
`public/media/docente-poster.jpg` y escribe:

```json
"poster": "/media/docente-poster.jpg"
```

Si no la quieres, déjalo en `"poster": null`.

### Ajustar el tamaño sobre la placa

Los valores se escriben en **centímetros reales**, no en números abstractos:

```json
"geometria": {
  "placaAnchoCm": 12.3,
  "placaAltoCm": 5.2,
  "alturaFiguraCm": 26,
  "anclaje": "base",
  "lado": "derecha",
  "margenCm": 1.5,
  "desplazamiento": "0 0 0.05"
}
```

| Valor | Qué significa |
|---|---|
| `placaAnchoCm` | Ancho real, en centímetros, de **todo lo que sale en `placa.jpg`** (no solo la chapa dorada) |
| `placaAltoCm` | Alto de ese mismo recorte. Es lo que apoya la figura en el borde inferior de la placa |
| `alturaFiguraCm` | Alto que quieres que aparente la figura del docente |
| `anclaje` | `"base"`: la figura se apoya en la placa. `"centro"`: queda centrada sobre ella |
| `lado` | `"derecha"` o `"izquierda"`: la figura aparece entera a ese lado, sin tapar la placa. `"centro"` o sin poner: delante |
| `margenCm` | Aire entre el borde de la placa y la figura |
| `desplazamiento` | Ajuste fino: `horizontal vertical profundidad`, en unidades de ancho de placa |

**El desplazamiento lateral no se escribe a mano.** El código lo calcula con
el ancho del vídeo (media placa + media figura + margen), así que cambiar el
clip por otro más ancho o más estrecho no obliga a retocar nada.

**Por qué en centímetros.** La página calcula sola el tamaño a partir de la
proporción del vídeo. Así, cuando sustituyas el clip de prueba (apaisado) por
la grabación real (vertical), la figura seguirá midiendo los mismos
centímetros sin que tengas que recalcular nada.

Cambia de poco en poco y mira el resultado en el móvil.

---

## 3 bis · Las medidas de la pieza

Medidas de la pieza cocida, ya confirmadas:

| Elemento | Medida |
|---|---|
| Alto de la pieza | 20,7 cm |
| Ancho de la pieza | 15,3 cm |
| Alto de la base de madera | 5 cm |
| **Alto total del conjunto** | **25,7 cm** |

### Qué medir cuando llegue la pieza real

Cuando tengas el trofeo con su placa montada, mide y anota **tres cosas**:

1. **El ancho de TODO lo que sale en `public/ar/placa.jpg`**, no solo el de la
   chapa dorada. La imagen del marcador es un recorte de la base entera
   (madera incluida), y ese recorte completo es el que vale 1 unidad para
   MindAR. Es el dato que va en `placaAnchoCm`.
2. **El alto de ese mismo recorte**, para `placaAltoCm`: es lo que hace que la
   figura se apoye en el borde inferior de la placa y no flote a media altura.
3. **La posición de la placa respecto a la base**: a qué altura del conjunto
   está y si va centrada.

**Por qué importa.** MindAR no sabe nada del trofeo: solo reconoce la **imagen
del marcador**, y trabaja en proporciones relativas a ella tomando su ancho
como unidad.

> Todo lo que aparece en RA se mide en "anchos de marcador", no en centímetros.

Por eso el único dato que convierte esa proporción en centímetros reales es
ese ancho. Si te equivocas ahí, la figura saldrá proporcionalmente mal aunque
el trofeo mida exactamente lo previsto.

### De dónde salen los valores puestos hoy

Están medidos sobre **la lámina de pruebas** (`placa con qr.pdf`), que está
maquetada a tamaño real: la página mide 15,3 × 25,7 cm, exactamente el
conjunto. Sobre ella:

| Medida | Valor |
|---|---|
| Chapa dorada sola | 10,15 × 3,7 cm |
| **Recorte del marcador** (madera incluida) | **12,3 × 5,2 cm** |

Por eso `placaAnchoCm` es **12.3** y `placaAltoCm` es **5.2**.

> **Imprime la lámina al 100 %, sin "ajustar a página".** Si el papel escala,
> las medidas dejan de valer y la figura sale del tamaño equivocado. Comprueba
> con una regla que la chapa dorada mide 10,15 cm de ancho.

### Valores puestos ahora y de dónde salen

| Valor | Puesto | De dónde sale |
|---|---|---|
| `placaAnchoCm` | **12.3** | Ancho del recorte del marcador medido sobre la lámina impresa a tamaño real |
| `placaAltoCm` | **5.2** | Alto de ese mismo recorte. Apoya la figura en el borde inferior de la placa |
| `alturaFiguraCm` | **26** | La figura queda a la altura del conjunto (25,7 cm), de pie junto a la pieza |
| `lado` | `"derecha"` | La figura aparece entera a la derecha de la placa, sin taparla. El desplazamiento lo calcula el código a partir del ancho del vídeo |
| `margenCm` | **1.5** | Aire entre el borde de la placa y la figura |
| `anclaje` | `"base"` | La figura se apoya sobre la placa en lugar de atravesarla |
| `desplazamiento` | `"0 0 0.05"` | Sin desvío lateral ni vertical; 0,05 de separación para que el vídeo no roce la superficie |

Con esos valores y una grabación vertical 9:16, la figura mide 26 cm de alto y
unos 14,6 cm de ancho, y su centro queda a unos 15 cm a la derecha del centro
de la placa. Para ver la placa y a la persona a la vez hay que encuadrar unos
30 cm de ancho: con el móvil a un brazo de distancia entra de sobra; muy de
cerca, la figura se sale por la derecha.

> **Los dos mandos si algo no cabe:** baja `alturaFiguraCm` para que la figura
> sea más pequeña, o baja `margenCm` para pegarla más a la placa. No toques el
> desplazamiento a mano: se recalcula solo.

> **Cuando midas la placa, cambia solo `placaAnchoCm`.** El resto se recalcula
> solo. Si mides 8 cm en lugar de 10, escribe `8` y la figura seguirá midiendo
> 19 cm reales.

> ⚠ **La compilación no te dejará publicar mientras `placaAnchoCm` siga en 10.**
> Es a propósito: 10 es la estimación de partida, y publicar con ella puesta
> significa publicar una figura del tamaño equivocado. En cuanto escribas la
> medida real, el aviso desaparece solo.
>
> **Mide al milímetro y escríbelo con decimal** (`9.6`, `12.4`, `10.2`). Aparte
> de ser más preciso, evita el único caso incómodo: si escribieras justo `10`
> el guardián no podría distinguir tu medida de la estimación y seguiría
> parando la compilación. (`10.0` no vale: en JSON es el mismo número que `10`.)

> **Aviso sobre el marcador actual.** `public/ar/placa.jpg` es el diseño de la
> placa, no una fotografía del metal ya grabado. Funciona con la lámina
> impresa, pero el metal real brilla, refleja y se ve en perspectiva: cuando
> exista la pieza hay que fotografiarla de frente, sustituir `placa.jpg`,
> recompilar el marcador y volver a probar.

---

## 4 · La placa (el marcador que reconoce la cámara)

Esto es lo que hace que la cámara sepa que está mirando el trofeo.

**Archivo a sustituir:** `public/ar/placa.jpg`

Fotografía la placa real **de frente, bien iluminada, sin reflejos ni sombras
fuertes, ocupando casi todo el encuadre**. Guarda la foto con ese nombre exacto
en esa carpeta, reemplazando la que hay.

**Después es obligatorio ejecutar esto:**

```
node scripts/compilar-marcador-headless.mjs
```

Tarda entre 30 y 90 segundos. Al terminar dice cuántos "puntos de detección"
encontró: **si son menos de unos 300, la detección será poco fiable** y
conviene repetir la foto con mejor luz o más detalle visible.

> **Si te olvidas de este paso, la realidad aumentada no funcionará.** Para
> evitarlo, `npm run build` comprueba las fechas de los dos archivos y se
> detiene si la foto es más reciente que el marcador compilado.

---

## 5 · Comprobar que no queda nada de relleno

Cuando creas que ya está todo:

```
npm run comprobar:contenido
```

Si aparece algo, todavía queda trabajo por hacer. El guardián revisa cinco
cosas y te dice cuáles fallan:

| Comprueba | Se arregla |
|---|---|
| Palabras de ejemplo en el JSON | Apartado 1 |
| `ar.video` sigue en `prueba.mp4` | Apartado 3 |
| `placaAnchoCm` sigue en `10` | Apartado 3 bis |
| `targets.mind` más antiguo que `placa.jpg` | Apartado 4 |
| El JSON apunta a archivos que no existen | Revisa las rutas que te indique |

Las palabras vigiladas son:

`Nombre del docente` · `ejemplo.com` · `por definir` · `Edita este texto` ·
`prueba.mp4`

Mientras algo siga fallando:

- La página muestra arriba una banda naranja: **"Contenido de prueba"**.
- `npm run build` **se niega a compilar**.

Eso es deliberado: impide publicar un borrador por descuido.

Para generar igualmente una versión de pruebas (con la banda visible):

```
npm run build:prototipo
```

Funciona igual en cualquier terminal: Git Bash, PowerShell o `cmd`.

> Si en una guía antigua ves `PERMITIR_RELLENO=1 npm run build`, **no lo uses**.
> Esa forma solo funciona en bash; en PowerShell da un error rojo que dice
> `CommandNotFoundException`. `npm run build:prototipo` hace exactamente lo
> mismo y funciona en todas.

---

## 6 · Publicar

Cuando `npm run comprobar:contenido` no dé ningún aviso:

```
git add .
git commit -m "Contenido definitivo"
git push
```

Vercel compila y publica solo, en un par de minutos. Los detalles del
despliegue están en el `README.md`. No uses una URL de preview
(`…-hash-….vercel.app`) como destino del QR.

---

## 7 · El código QR

**Importante y fácil de olvidar.**

El QR que se grabe en la placa **no debe apuntar nunca a una URL de preview
de Vercel** (`algo-hash.vercel.app`). Esa dirección cambia en cada deploy, y
una vez grabado el metal no hay vuelta atrás.

Hay que pedir a la UTPL una **dirección corta bajo su propio dominio** que
redirija al dominio de producción del proyecto. Por ejemplo:

```
https://utpl.edu.ec/innovadocente   →   redirige a   →   https://<dominio-produccion-vercel>/?qr=1
```

El QR apunta a la dirección de la UTPL. Si mañana el sitio se muda a otro
alojamiento, se cambia la redirección y el QR grabado sigue funcionando.

**Fíjate en el `?qr=1` del final.** Es lo que le dice a la página que quien
entra tiene la pieza delante: cambia los textos de entrada y adelanta la
descarga del visor para que la cámara abra antes. Pide a quien configure la
redirección que **conserve ese parámetro**. Si se pierde, la página funciona
igual; solo va un poco más lenta al abrir la RA.

**No mandes a grabar el QR hasta tener esa dirección definitiva.**

---

## Resumen: archivos que se sustituyen

| Archivo | Qué es | Paso extra después |
|---|---|---|
| `contenido/contenido.json` | Todos los textos visibles | ninguno |
| `public/ar/placa.jpg` | Foto de la placa real | **recompilar el marcador** + medir y anotar `placaAnchoCm` |
| `public/media/docente-720.mp4` | Vídeo del docente, **con su audio dentro** | apuntar `"video"` en el JSON |
| `public/media/docente-480.mp4` | Versión ligera | idem |
| `public/media/docente-poster.jpg` | Imagen de espera (opcional) | apuntar `"poster"` |

Los que hay ahora (`prueba-docente-720.mp4` y `-480.mp4`) son **material de
ensayo**: un actor de banco de vídeos recortado sobre croma, sin audio. Sirven
para probar el circuito completo, nunca para publicar.

Ya **no** se sustituyen (se han eliminado del proyecto): `contenido/guion.txt`,
`public/media/artista-narracion.mp3`, `public/media/subtitulos.vtt` y
`scripts/generar-narracion.mjs`.

---

## El vídeo definitivo (Jennifer Samaniego)

La grabación de Jennifer Samaniego **ya está integrada**. Lo que hay en `public/media/`:

| Fichero | Qué es |
| --- | --- |
| `jennifer-samaniego-720.mp4` | 1280×1440 (720 color + 720 máscara), el que se sirve por defecto |
| `jennifer-samaniego-480.mp4` | Versión ligera para conexiones lentas |
| `jennifer-samaniego-cartel.jpg` | Fotograma de espera mientras carga |
| `jennifer-samaniego-retrato.jpg` | Retrato en la pestaña Artista |

El máster sin comprimir vive en `video/Diseno sin titulo (1).mp4`, que está en `.gitignore`.

### Regenerar las versiones comprimidas

Desde la raíz del proyecto, con el máster en `video/`:

```
scripts\encode-jennifer-alfa.bat
```

El script recorta el fondo blanco con `colorkey`, empaqueta la transparencia (color arriba + máscara abajo) y genera las versiones 720 y 480 con audio.
