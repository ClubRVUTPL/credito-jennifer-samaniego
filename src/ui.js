// ui.js — Pantalla de información: la antesala de la realidad aumentada.
//
// Reglas del proyecto:
//  - Ningún texto visible se escribe aquí: todo llega de contenido/contenido.json.
//  - Los datos del JSON se insertan siempre como nodos de texto, nunca con innerHTML.
//
// Única excepción: el aviso de renderLoadError. Si el JSON no se pudo cargar,
// no existe otra fuente de la que leer el mensaje.
//
// ── Por qué esta pantalla ya no parece una web ───────────────────────────
//
// Antes esto era una página de créditos con tarjetas, pestañas y un botón, y
// la RA se abría encima como si fuera otra aplicación. Ahora es una sola
// superficie: el mismo azul profundo de la portada, sin contenedores con
// borde ni sombra, con una única acción. Al pulsarla no se navega a ningún
// sitio — el texto se aparta y la cámara emerge en el mismo campo.
//
// La tabla de créditos ya no vive aquí: es una hoja aparte (creditos.js) que
// sube desde abajo, y que se abre tanto desde esta pantalla como desde dentro
// de la RA. Es la misma pieza en los dos sitios.
//
// La pantalla intermedia que pedía permiso también desapareció: la nota con
// el icono de información ya explica qué va a pasar, así que el botón pide la
// cámara directamente. Un gesto en vez de dos, y una interfaz menos.

import { buildCreditos } from './creditos.js';
import { iconoAlerta, iconoCamara, iconoInfo } from './iconos.js';

/**
 * Pinta un aviso claro cuando contenido.json no carga, en lugar de dejar
 * la página en blanco.
 */
export function renderLoadError(root) {
  root.textContent = '';

  const box = document.createElement('div');
  box.className = 'error-carga';
  box.setAttribute('role', 'alert');

  const texto = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'error-carga-titulo';
  title.textContent = 'No se pudo cargar el contenido de la página.';

  const hint = document.createElement('p');
  hint.textContent = 'Comprueba la conexión e intenta recargar.';

  texto.append(title, hint);
  box.append(iconoAlerta(), texto);
  root.appendChild(box);
}

/**
 * Pinta la pantalla de información.
 * Devuelve las referencias que main.js necesita:
 * { arButton, setArStatus, creditos }.
 */
export function renderPage(root, content) {
  root.textContent = '';

  const entrada = content.entrada || {};

  root.appendChild(buildHeader(entrada));

  const creditos = buildCreditos(
    content.pestanas,
    content.placa && content.placa.titulo,
    (content.ar && content.ar.cerrar) || ''
  );

  const { acciones, arButton, arStatus, setArStatus, nota, privacidad, alternativa } =
    buildArControls(content.ar, entrada, creditos);

  root.append(acciones, nota, arStatus, privacidad, alternativa);
  root.appendChild(creditos.root);

  return { arButton, setArStatus, creditos };
}

/* ------------------------------------------------------------------ */
/* Cabecera: la felicitación                                           */
/* ------------------------------------------------------------------ */

function buildHeader(entrada) {
  const header = document.createElement('header');
  header.className = 'cabecera';

  const titulo = document.createElement('h1');
  titulo.className = 'cabecera-titulo';
  titulo.textContent = entrada.titulo || '';

  const subtitulo = document.createElement('p');
  subtitulo.className = 'cabecera-subtitulo';
  subtitulo.textContent = entrada.subtitulo || '';

  const texto = document.createElement('p');
  texto.className = 'cabecera-texto';
  texto.textContent = entrada.texto || '';

  header.append(titulo, subtitulo, texto);
  return header;
}

/* ------------------------------------------------------------------ */
/* La acción: entrar en la realidad aumentada                          */
/* ------------------------------------------------------------------ */

// El botón de RA nace oculto: main.js lo muestra solo si hay cámara, un
// marcador compilado y un vídeo que anclar. Si no la hay, la única salida
// visible es la lectura sin cámara, que siempre está.
function buildArControls(arConfig, entrada, creditos) {
  const acciones = document.createElement('div');
  acciones.className = 'entrada-acciones';

  // Rótulo de sección sobre el botón: da contexto a lo que se va a abrir
  // sin necesidad de una frase entera.
  const seccion = document.createElement('h2');
  seccion.className = 'entrada-seccion';
  seccion.textContent = entrada.seccion || '';
  seccion.hidden = !entrada.seccion;

  const arButton = document.createElement('button');
  arButton.type = 'button';
  arButton.className = 'boton-ar';
  arButton.hidden = true;
  arButton.append(
    iconoCamara(),
    document.createTextNode(arConfig && arConfig.boton ? arConfig.boton : '')
  );

  acciones.append(seccion, arButton);

  // Nota informativa: qué hay que hacer para que la experiencia funcione.
  const notaTexto = entrada.nota || '';
  const nota = document.createElement('p');
  nota.className = 'entrada-nota';
  nota.append(iconoInfo(), document.createTextNode(notaTexto));
  nota.hidden = !notaTexto;

  // Letra pequeña sobre la cámara. Vive aquí, a la vista, precisamente
  // porque ya no hay una pantalla intermedia que lo explique: quien va a
  // conceder el permiso merece leer antes qué se hace con él.
  const privacidadTexto = entrada.privacidad || '';
  const privacidad = document.createElement('p');
  privacidad.className = 'entrada-privacidad';
  privacidad.textContent = privacidadTexto;
  privacidad.hidden = !privacidadTexto;

  // Salida sin cámara: enlace discreto, no un segundo botón que compita con
  // el principal. Abre exactamente la misma hoja de créditos que se abre
  // dentro de la RA.
  const alternativaTexto = (entrada && entrada.alternativa) || '';
  const alternativa = document.createElement('button');
  alternativa.type = 'button';
  alternativa.className = 'entrada-alternativa';
  alternativa.textContent = alternativaTexto;
  alternativa.hidden = !alternativaTexto;
  alternativa.addEventListener('click', () => creditos.abrir());
  creditos.onCerrar(() => alternativa.focus());

  // Zona de avisos (p. ej. navegador embebido sin cámara, o fallo al cargar
  // el visor). setArStatus centraliza el icono + texto: main.js solo pide
  // "muestra este mensaje", nunca toca el nodo de texto a mano — así el
  // icono nunca se pierde por una asignación directa a .textContent.
  const arStatus = document.createElement('p');
  arStatus.className = 'estado-ar';
  arStatus.setAttribute('role', 'alert');
  arStatus.hidden = true;
  const arStatusTexto = document.createElement('span');
  arStatus.append(iconoAlerta(), arStatusTexto);

  const setArStatus = (texto) => {
    arStatusTexto.textContent = texto || '';
    arStatus.hidden = !texto;
  };

  return { acciones, arButton, arStatus, setArStatus, nota, privacidad, alternativa };
}
