// bienvenida.js — Pantalla de portada previa al contenido.
//
// El marcado vive en index.html, no se construye aquí. La razón es que tiene
// que estar pintado en el PRIMER fotograma: si lo montara este módulo, entre
// que el navegador pinta el <body> y que se ejecuta el JS se vería un
// destello de la página de créditos antes de taparla, que es justo lo que la
// portada existe para evitar. Aquí solo vive el comportamiento.
//
// Se cierra de tres maneras, todas equivalentes:
//   · un toque o clic en cualquier punto de la pantalla,
//   · Intro, Espacio o Escape (el botón recibe el foco al abrir),
//   · sola, pasados AUTO_MS, por si el trofeo está en una vitrina y no hay
//     nadie que vaya a tocar nada.
//
// El cierre es idempotente: da igual que el temporizador y un clic lleguen
// casi a la vez.

// Cuánto aguanta la portada antes de apartarse sola. Lo bastante para leer
// las tres líneas sin prisa, no tanto como para estorbar a quien acaba de
// escanear el QR con la pieza en la mano.
const AUTO_MS = 4500;

// Debe coincidir con la duración de la animación 'bienvenida-sale' de
// styles.css: es lo que se espera antes de sacar el nodo del DOM.
const SALIDA_MS = 450;

/**
 * Activa la portada que ya está en el HTML. Si no la encuentra (por ejemplo
 * si alguien la quita del index.html) no hace nada y la página sigue
 * funcionando igual.
 */
export function initBienvenida() {
  const raiz = document.querySelector('#bienvenida');
  if (!raiz) return;

  // Mientras la portada tapa la pantalla, la página de detrás no debe poder
  // desplazarse: el gesto de scroll sobre la portada movería el contenido
  // oculto y al cerrarse aparecería a media altura.
  document.body.classList.add('sin-scroll');

  let cerrada = false;
  let temporizador = null;

  const cerrar = () => {
    if (cerrada) return;
    cerrada = true;

    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    raiz.removeEventListener('click', cerrar);
    document.removeEventListener('keydown', alPulsarTecla);
    document.body.classList.remove('sin-scroll');

    // Con "reducir movimiento" activado no hay animación de salida: se
    // retira en el acto en vez de dejar 450 ms de nada.
    const sinMovimiento =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (sinMovimiento) {
      raiz.remove();
      return;
    }

    // El atributo dispara la animación de salida en CSS; el nodo se retira
    // cuando termina. pointer-events queda anulado en esa clase, así que
    // durante el fundido ya no intercepta toques destinados al contenido.
    raiz.dataset.saliendo = '';
    setTimeout(() => raiz.remove(), SALIDA_MS);
  };

  function alPulsarTecla(evento) {
    if (evento.key === 'Enter' || evento.key === ' ' || evento.key === 'Escape') {
      // preventDefault evita que Espacio, además de cerrar, desplace la
      // página de detrás en cuanto queda visible.
      evento.preventDefault();
      cerrar();
    }
  }

  raiz.addEventListener('click', cerrar);
  document.addEventListener('keydown', alPulsarTecla);
  temporizador = setTimeout(cerrar, AUTO_MS);

  // Foco al CONTENEDOR (tiene tabindex="-1"), no al botón: así el lector de
  // pantalla entra en el diálogo y lee su título, pero el botón no aparece
  // dibujado con su anillo de foco sin que nadie lo haya tabulado.
  try {
    raiz.focus({ preventScroll: true });
  } catch {
    raiz.focus();
  }
}
