// creditos.js — La tabla de créditos, como hoja que sube desde abajo.
//
// Vive aparte de ui.js porque se monta en DOS sitios distintos y tiene que
// ser exactamente la misma cosa en los dos:
//
//   · Desde la pantalla de información, para quien no tiene la pieza
//     delante o no quiere usar la cámara. Sin esta salida, quien abre el
//     enlace desde una captura compartida se quedaría sin poder leer nada.
//   · Desde dentro de la realidad aumentada, superpuesta a la cámara, para
//     que consultar los créditos no obligue a salir de la experiencia.
//
// Cada montaje es una instancia independiente (dos llamadas a buildCreditos),
// así que la pestaña abierta en una no arrastra a la otra. Es deliberado: son
// dos momentos distintos de la visita.
//
// Reglas del proyecto que se mantienen aquí: ningún texto visible se escribe
// en este fichero —todo llega de contenido/contenido.json— y los datos se
// insertan siempre como nodos de texto, nunca con innerHTML.

import { iconoCierre, iconoFlechaExterna } from './iconos.js';

// Debe coincidir con la animación 'creditos-sale' de styles.css.
const SALIDA_MS = 300;

/**
 * Construye la hoja de créditos.
 *
 * @param {Array} pestanasData  content.pestanas
 * @param {string} etiquetaLista  Nombre accesible de la lista de pestañas.
 * @param {string} tituloCerrar  Texto del botón de cerrar (aria-label).
 * @returns {{root: HTMLElement, abrir: Function, cerrar: Function,
 *            estaAbierta: Function, onCerrar: Function}}
 */
export function buildCreditos(pestanasData, etiquetaLista, tituloCerrar) {
  const root = document.createElement('div');
  root.className = 'creditos';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', etiquetaLista || '');

  // Velo: oscurece lo que hay detrás sin ocultarlo del todo. Dentro de la RA
  // eso importa — la cámara se sigue intuyendo y no se pierde la sensación
  // de seguir dentro de la experiencia.
  const velo = document.createElement('div');
  velo.className = 'creditos-velo';

  const hoja = document.createElement('div');
  hoja.className = 'creditos-hoja';

  // Asa: no es interactiva por sí misma (toda la hoja no se arrastra), pero
  // es la señal visual universal de "esto sube y baja".
  const asa = document.createElement('span');
  asa.className = 'creditos-asa';
  asa.setAttribute('aria-hidden', 'true');

  const cerrarBtn = document.createElement('button');
  cerrarBtn.type = 'button';
  cerrarBtn.className = 'creditos-cerrar';
  cerrarBtn.setAttribute('aria-label', tituloCerrar || '');
  cerrarBtn.appendChild(iconoCierre());

  const { tablist, panels } = buildTabs(pestanasData || [], etiquetaLista);

  hoja.append(asa, cerrarBtn, tablist, panels);
  root.append(velo, hoja);

  let abierta = false;
  let alCerrar = null;
  let temporizadorSalida = null;

  const cerrar = () => {
    if (!abierta) return;
    abierta = false;
    root.dataset.saliendo = '';
    if (temporizadorSalida) clearTimeout(temporizadorSalida);
    temporizadorSalida = setTimeout(() => {
      root.hidden = true;
      delete root.dataset.saliendo;
    }, SALIDA_MS);
    if (alCerrar) alCerrar();
  };

  const abrir = () => {
    if (abierta) return;
    abierta = true;
    if (temporizadorSalida) clearTimeout(temporizadorSalida);
    delete root.dataset.saliendo;
    root.hidden = false;
    // Foco a la pestaña activa: quien navega con teclado entra directamente
    // en el contenido, no tiene que tabular desde el principio de la página.
    const activa = tablist.querySelector('[aria-selected="true"]');
    if (activa) activa.focus({ preventScroll: true });
  };

  velo.addEventListener('click', cerrar);
  cerrarBtn.addEventListener('click', cerrar);

  root.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    evento.preventDefault();
    // stopPropagation: dentro de la RA, Escape debe cerrar la hoja y NO
    // además salir de la experiencia entera.
    evento.stopPropagation();
    cerrar();
  });

  return {
    root,
    abrir,
    cerrar,
    estaAbierta: () => abierta,
    onCerrar(fn) {
      alCerrar = fn;
    },
  };
}

/**
 * Créditos embebidos en la capa de RA: pestañas visibles bajo el vídeo,
 * sin modal ni velo. Misma instancia de pestañas que la hoja deslizable.
 *
 * @param {Array} pestanasData
 * @param {string} etiquetaLista
 * @returns {{root: HTMLElement}}
 */
export function buildCreditosInline(pestanasData, etiquetaLista) {
  const root = document.createElement('section');
  root.className = 'ar-creditos-inline';
  root.setAttribute('aria-label', etiquetaLista || 'Créditos');

  const { tablist, panels } = buildTabs(pestanasData || [], etiquetaLista, 'ar-');
  root.append(tablist, panels);
  return { root };
}

/* ------------------------------------------------------------------ */
/* Pestañas (patrón de WAI-ARIA)                                       */
/* ------------------------------------------------------------------ */

function buildTabs(tabsData, listLabel, idPrefix = '') {
  const tablist = document.createElement('div');
  tablist.className = 'pestanas';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', listLabel || '');

  const panels = document.createElement('div');
  panels.className = 'paneles';

  const tabs = [];

  tabsData.forEach((tabData, index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'pestana';
    tab.id = `${idPrefix}pestana-${tabData.id}`;
    tab.textContent = tabData.titulo;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    tab.setAttribute('aria-controls', `${idPrefix}panel-${tabData.id}`);
    // Tabindex itinerante: solo la pestaña activa entra en el orden de
    // tabulación; entre pestañas se navega con las flechas.
    tab.tabIndex = index === 0 ? 0 : -1;

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = `${idPrefix}panel-${tabData.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.hidden = index !== 0;
    panel.tabIndex = 0;

    renderPanelContent(panel, tabData);

    tablist.appendChild(tab);
    panels.appendChild(panel);
    tabs.push({ tab, panel });
  });

  const activate = (index) => {
    tabs.forEach(({ tab, panel }, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    });
  };

  tabs.forEach(({ tab }, index) => {
    tab.addEventListener('click', () => activate(index));
  });

  tablist.addEventListener('keydown', (event) => {
    const current = tabs.findIndex(({ tab }) => tab === document.activeElement);
    if (current === -1) return;

    let next = null;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;

    event.preventDefault();
    activate(next);
    tabs[next].tab.focus();
  });

  return { tablist, panels };
}

/* ------------------------------------------------------------------ */
/* Contenido de cada panel según su tipo                               */
/* ------------------------------------------------------------------ */

function renderPanelContent(panel, tabData) {
  if (esRutaMedia(tabData.retrato)) {
    const figura = document.createElement('figure');
    figura.className = 'panel-retrato';
    const img = document.createElement('img');
    img.src = tabData.retrato;
    img.alt = tabData.retratoAlt || '';
    img.width = 320;
    img.height = 320;
    img.decoding = 'async';
    figura.appendChild(img);
    panel.appendChild(figura);
  }

  if (tabData.nombre) {
    const nombre = document.createElement('h3');
    nombre.className = 'panel-nombre';
    nombre.textContent = tabData.nombre;
    panel.appendChild(nombre);
  }

  if (tabData.intro) {
    panel.appendChild(paragraph(tabData.intro, 'panel-intro'));
  }

  switch (tabData.tipo) {
    case 'parrafos':
      (tabData.parrafos || []).forEach((text) => panel.appendChild(paragraph(text)));
      if (tabData.enlaces && tabData.enlaces.length) {
        panel.appendChild(listaEnlaces(tabData.enlaces));
      }
      break;

    case 'datos': {
      const list = document.createElement('dl');
      list.className = 'ficha';
      (tabData.datos || []).forEach((item) => {
        const row = document.createElement('div');
        row.className = 'ficha-fila';
        const term = document.createElement('dt');
        term.textContent = item.termino;
        const detail = document.createElement('dd');
        detail.textContent = item.detalle;
        row.append(term, detail);
        list.appendChild(row);
      });
      panel.appendChild(list);
      break;
    }

    case 'pasos': {
      const list = document.createElement('ol');
      list.className = 'pasos';
      (tabData.pasos || []).forEach((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        list.appendChild(item);
      });
      panel.appendChild(list);
      break;
    }

    case 'enlaces':
      panel.appendChild(listaEnlaces(tabData.enlaces));
      break;

    default:
      // Tipo desconocido: no se pinta nada, pero la hoja no se rompe.
      break;
  }
}

function listaEnlaces(enlaces) {
  const list = document.createElement('ul');
  list.className = 'enlaces';
  (enlaces || []).forEach((linkData) => {
    const item = document.createElement('li');
    item.appendChild(buildLink(linkData));
    list.appendChild(item);
  });
  return list;
}

function esRutaMedia(ruta) {
  return typeof ruta === 'string' && ruta.startsWith('/media/');
}

function paragraph(text, className) {
  const node = document.createElement('p');
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

// Solo se aceptan esquemas seguros; cualquier otra cosa se muestra como
// texto plano sin enlace.
const SAFE_URL = /^(https?:|mailto:|tel:)/i;

function buildLink(linkData) {
  if (linkData.url && SAFE_URL.test(linkData.url)) {
    const anchor = document.createElement('a');
    const texto = document.createElement('span');
    texto.textContent = linkData.texto;
    anchor.appendChild(texto);
    anchor.href = linkData.url;
    if (/^https?:/i.test(linkData.url)) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      // Solo los enlaces que abren fuera llevan el indicador: mailto y tel
      // se quedan en la misma aplicación.
      anchor.appendChild(iconoFlechaExterna('enlaces-externo'));
    }
    return anchor;
  }
  const span = document.createElement('span');
  span.textContent = linkData.texto;
  return span;
}
