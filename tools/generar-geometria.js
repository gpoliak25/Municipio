/*
 * Genera data/geo-tramos.js con tramos reales (cuadras entre esquinas)
 * tomados de OpenStreetMap vía Overpass API, para que las líneas del mapa
 * coincidan con las calles del mapa base.
 *
 * Uso (requiere Node 18+ y conexión a internet):
 *     node tools/generar-geometria.js
 *
 * Toma el centro, las zonas (offset) y la cantidad de tramos por zona de
 * data/mock-data.js. Para adaptar la demo a otro municipio: cambiar
 * "municipio.centro" y los "offset" de las zonas, y volver a ejecutar.
 * Si data/geo-tramos.js no existe, la demo usa una grilla sintética.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/mock-data.js'), 'utf8'), ctx);
const CFG = ctx.window.MOCK_CONFIG;
const [CLAT, CLNG] = CFG.municipio.centro;

const k = Math.PI / 180;
const MY = 111320, MX = 111320 * Math.cos(CLAT * k);
const dist = (a, b) => Math.hypot((a[0] - b[0]) * MY, (a[1] - b[1]) * MX);

const HIGHWAY = /^(residential|tertiary|secondary|primary|unclassified|living_street)$/;
const UA = { 'User-Agent': 'cableado-demo/1.0' };

/** Overpass: una sola consulta con la caja que cubre todas las zonas */
async function desdeOverpass() {
  const lats = CFG.zonas.map(z => CLAT + z.offset[0]), lngs = CFG.zonas.map(z => CLNG + z.offset[1]);
  const bbox = [Math.min(...lats) - 0.008, Math.min(...lngs) - 0.009, Math.max(...lats) + 0.008, Math.max(...lngs) + 0.009].map(v => v.toFixed(5)).join(',');
  const q = `[out:json][timeout:90];way["highway"~"${HIGHWAY.source}"]["name"](${bbox});out geom;`;
  console.log('Consultando Overpass…', bbox);
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Overpass respondió ${r.status}`);
  return (await r.json()).elements;
}

/** Alternativa: API oficial de OSM (/api/0.6/map), una caja chica por zona. Devuelve el mismo formato que Overpass */
async function desdeApiOSM() {
  const porId = new Map();
  for (const z of CFG.zonas) {
    const c = [CLAT + z.offset[0], CLNG + z.offset[1]];
    const bbox = [c[1] - 0.007, c[0] - 0.006, c[1] + 0.007, c[0] + 0.006].map(v => v.toFixed(5)).join(',');
    console.log(`Consultando API de OSM (${z.nombre})…`, bbox);
    const r = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`, { headers: UA });
    if (!r.ok) throw new Error(`API de OSM respondió ${r.status}`);
    const xml = await r.text();
    const nodos = new Map();
    for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodos.set(+m[1], { lat: +m[2], lon: +m[3] });
    for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
      const tags = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)].map(t => [t[1], t[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&')]));
      if (!tags.name || !HIGHWAY.test(tags.highway || '')) continue;
      const nodes = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map(n => +n[1]);
      if (nodes.some(n => !nodos.has(n))) continue;
      porId.set(+m[1], { id: +m[1], tags, nodes, geometry: nodes.map(n => nodos.get(n)) });
    }
    await new Promise(res => setTimeout(res, 1200));   // respetar la política de uso de la API
  }
  return [...porId.values()];
}

async function main() {
  let ways;
  try { ways = await desdeOverpass(); }
  catch (e) { console.log(`${e.message}. Se usa la API de OSM.`); ways = await desdeApiOSM(); }
  console.log(`${ways.length} calles recibidas`);

  // Esquinas: nodos compartidos por más de una calle
  const uso = new Map();
  ways.forEach(w => w.nodes.forEach(n => uso.set(n, (uso.get(n) || 0) + 1)));

  // Cortar cada calle en cuadras (de esquina a esquina)
  const segs = [];
  ways.forEach(w => {
    let cur = [[w.geometry[0].lat, w.geometry[0].lon]];
    for (let i = 1; i < w.nodes.length; i++) {
      cur.push([w.geometry[i].lat, w.geometry[i].lon]);
      if (uso.get(w.nodes[i]) > 1 || i === w.nodes.length - 1) {
        const largo = cur.slice(1).reduce((a, p, j) => a + dist(cur[j], p), 0);
        if (largo >= 60 && largo <= 220 && uso.get(w.nodes[i]) > 1) segs.push({ calle: w.tags.name, coords: cur, largo });
        cur = [[w.geometry[i].lat, w.geometry[i].lon]];
      }
    }
  });
  console.log(`${segs.length} cuadras válidas`);

  // Asignación por zona: las cuadras más cercanas al centro de cada zona
  const usados = new Set();
  const zonas = {};
  CFG.zonas.forEach(z => {
    const c = [CLAT + z.offset[0], CLNG + z.offset[1]];
    const mid = s => s.coords[Math.floor(s.coords.length / 2)];
    const cand = segs.map((s, i) => ({ s, i, d: dist(mid(s), c) })).filter(x => !usados.has(x.i)).sort((a, b) => a.d - b.d).slice(0, z.tramos);
    cand.forEach(x => usados.add(x.i));
    zonas[z.id] = cand.map(({ s }) => {
      const m = mid(s);
      const h = Math.floor(dist(m, [CLAT, CLNG]) / 100) * 100 + 100;
      return { calle: s.calle, altura: `${h}–${h + 100}`, largo: Math.round(s.largo), coords: s.coords.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]) };
    });
    console.log(`  ${z.nombre}: ${zonas[z.id].length} tramos`);
  });

  const out = `/*
 * Geometría de tramos generada con tools/generar-geometria.js
 * a partir de datos de © colaboradores de OpenStreetMap (licencia ODbL).
 * Generado: ${new Date().toISOString().slice(0, 10)} · centro ${CLAT}, ${CLNG}
 */
window.GEO_TRAMOS = ${JSON.stringify({ centro: CFG.municipio.centro, zonas })};
`;
  fs.writeFileSync(path.join(ROOT, 'data/geo-tramos.js'), out);
  console.log('Escrito data/geo-tramos.js');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
