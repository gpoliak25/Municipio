/*
 * Genera un único archivo HTML autocontenido con toda la demo
 * (estilos, datos, geometría y código en línea), listo para enviar
 * o abrir con doble clic.
 *
 * Uso:
 *     node tools/generar-html.js
 *
 * Salida: dist/demo-cableado-jose-c-paz.html
 * Leaflet, Chart.js y las teselas del mapa se siguen cargando desde
 * internet (CDN gratuito y OpenStreetMap).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'demo-cableado-jose-c-paz.html');
const leer = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let html = leer('index.html');

// Hojas de estilo locales → <style>
html = html.replace(/<link rel="stylesheet" href="(?!https?:)([^"]+)">/g, (_, href) => `<style>\n${leer(href)}\n</style>`);

// Scripts locales → <script> en línea (se escapa "</script" para no cortar el bloque)
html = html.replace(/<script src="(?!https?:)([^"]+)"><\/script>/g, (_, src) =>
  `<script>/* ${src} */\n${leer(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);

const faltan = [...html.matchAll(/(?:src|href)="(?!https?:|#|data:|mailto:)([^"]+\.(?:js|css))"/g)].map(m => m[1]);
if (faltan.length) { console.error('Quedaron recursos locales sin incluir:', faltan.join(', ')); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Escrito ${path.relative(ROOT, OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
