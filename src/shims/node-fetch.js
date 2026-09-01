// Shim del paquete "node-fetch" para el navegador.
//
// Como con util.js: el bundle de mind-ar (TensorFlow.js) hace
// require("node-fetch") en su rama de soporte para Node, que en el navegador
// nunca se ejecuta. Sin este alias, el pre-empaquetado de esbuild en
// desarrollo falla al no poder resolver el paquete. El fetch nativo cubre
// cualquier uso residual. Se conecta en vite.config.js.

export default globalThis.fetch.bind(globalThis);
