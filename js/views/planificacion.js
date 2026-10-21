/*
 * 9. PLANIFICACIÓN A LARGO PLAZO: DUCTO COMPARTIDO / SOTERRAMIENTO
 * Para cada zona estima longitud, densidad de cables, costo de obra e
 * ingreso por alquiler de "capacidad" (subductos) a los proveedores.
 */
const PlanificacionView = (() => {
  let root = null, map = null, layer = null, P = null;

  function destroy() { if (map) { map.remove(); map = null; } }

  /** Métricas por zona según los parámetros del escenario */
  function analisis() {
    const zonas = Store.CFG.zonas.map(z => {
      const ts = Store.state.tramos.filter(t => t.zona === z.id);
      const km = ts.reduce((a, t) => a + t.largo, 0) / 1000;
      const cables = ts.reduce((a, t) => { const m = Store.metrics(t); return a + (m.det ?? m.aut); }, 0);
      const exceso = ts.reduce((a, t) => a + (Store.metrics(t).exceso || 0), 0);
      const aut = ts.reduce((a, t) => a + Store.metrics(t).aut, 0);
      const provs = new Set(ts.flatMap(t => t.ocupaciones.map(o => o.prov))).size;
      const postes = ts.filter(t => t.tipo === 'poste').length;
      return { z, ts, km, cables, exceso, aut, provs, postes, densidad: km ? cables / km : 0 };
    });
    const maxDens = Math.max(...zonas.map(x => x.densidad));
    zonas.forEach(x => {
      x.ocupacion = (P.ocupacionMax / 100) * (0.45 + 0.55 * x.densidad / maxDens);  // más densidad => más subductos alquilados
      x.costo = x.km * P.costoKm;
      x.ingresoAnual = x.km * 1000 * P.subductos * x.ocupacion * P.tarifaSubductoMetroMes * 12;
      x.payback = x.ingresoAnual ? x.costo / x.ingresoAnual : Infinity;
      x.vpn = x.ingresoAnual * P.horizonte - x.costo;
      x.score = 0.6 * (x.densidad / maxDens) + 0.4 * Math.min(1, (x.aut ? x.exceso / x.aut : 0) / 0.3);
      x.prioridad = x.score > 0.75 ? 'Alta' : x.score > 0.55 ? 'Media' : 'Baja';
    });
    return zonas.sort((a, b) => b.score - a.score);
  }

  function render(el) {
    root = el;
    destroy();
    if (!P) P = { ...Store.CFG.planificacion };
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Planificación: ducto compartido</h1>
        <p class="muted">Propuesta de soterramiento con ducto municipal multiproveedor. El municipio construye la infraestructura y alquila "capacidad" (subductos) a todos los operadores: ordena el espacio aéreo y crea un ingreso estable.</p></div>
      </div>
      <div class="plan-layout">
        <div class="card" id="plan-params">
          <h3>Supuestos del proyecto</h3>
          ${[
            ['costoKm', 'Costo de obra por km (ducto + cámaras)', 50000000, 400000000, 5000000, v => U.moneyShort(v)],
            ['tarifaSubductoMetroMes', 'Alquiler por subducto, por metro y mes', 100, 1500, 25, v => U.money(v)],
            ['subductos', 'Subductos por ducto', 2, 12, 1, v => v],
            ['ocupacionMax', 'Ocupación máxima esperada', 30, 100, 5, v => v + ' %'],
            ['horizonte', 'Horizonte de evaluación (años)', 5, 30, 1, v => v + ' años'],
          ].map(([k, l, mn, mx, st, f]) => `<div class="slider-row"><div class="slider-top"><label for="pp-${k}">${l}</label><b id="pv-${k}">${f(P[k])}</b></div>
            <input type="range" id="pp-${k}" data-k="${k}" min="${mn}" max="${mx}" step="${st}" value="${P[k]}"></div>`).join('')}
          <p class="muted small">La ocupación de cada zona escala con su densidad de cables por km.</p>
        </div>
        <div class="card map-wrap"><div id="plan-map" role="region" aria-label="Mapa de zonas candidatas"></div>
          <div class="map-legend"><span><i class="sw" style="background:#d03b3b"></i>Prioridad alta</span><span><i class="sw" style="background:#fab219"></i>Media</span><span><i class="sw" style="background:#2a78d6"></i>Baja</span></div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Zonas candidatas</h3><span class="muted small">Ordenadas por prioridad (densidad de cables y nivel de incumplimiento)</span></div><div class="table-wrap" id="plan-tabla"></div></div>
      <div class="card"><h3>Beneficios adicionales (no monetizados)</h3>
        <ul class="todo">
          <li>${U.icon('check', 15)} Elimina el exceso de cables por diseño: cada subducto se alquila con contrato y se mide.</li>
          <li>${U.icon('check', 15)} Reduce cortes por tormentas, poda y accidentes de tránsito con postes.</li>
          <li>${U.icon('check', 15)} Libera veredas y mejora el paisaje urbano del centro comercial.</li>
          <li>${U.icon('check', 15)} Facilita la llegada de nuevos operadores (más competencia, mejores precios para los vecinos).</li>
        </ul></div>`;

    root.querySelectorAll('input[type=range]').forEach(s => s.oninput = () => {
      P[s.dataset.k] = +s.value;
      const f = { costoKm: v => U.moneyShort(v), tarifaSubductoMetroMes: v => U.money(v), subductos: v => v, ocupacionMax: v => v + ' %', horizonte: v => v + ' años' }[s.dataset.k];
      root.querySelector('#pv-' + s.dataset.k).textContent = f(P[s.dataset.k]);
      update();
    });

    if (window.L) {
      map = L.map('plan-map').setView(Store.CFG.municipio.centro, 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; colaboradores de OpenStreetMap' }).addTo(map);
      layer = L.layerGroup().addTo(map);
      setTimeout(() => map && map.invalidateSize(), 80);
    }
    update();
  }

  function update() {
    const zs = analisis();
    const COL = { Alta: '#d03b3b', Media: '#fab219', Baja: '#2a78d6' };
    if (layer) {
      layer.clearLayers();
      zs.forEach(x => {
        const b = L.latLngBounds(x.ts.flatMap(t => t.coords)).pad(0.06);
        L.rectangle(b, { color: COL[x.prioridad], weight: 2, fillOpacity: 0.16 }).addTo(layer)
          .bindPopup(`<b>${U.esc(x.z.nombre)}</b> · prioridad ${x.prioridad}<br>${U.num(x.km, 1)} km · ${x.cables} cables · ${U.num(x.densidad, 0)} cables/km<br>Costo ${U.moneyShort(x.costo)} · ingreso ${U.moneyShort(x.ingresoAnual)}/año<br>Recupero: ${U.num(x.payback, 1)} años`);
        L.marker(b.getCenter(), { icon: L.divIcon({ className: 'zone-label', html: `${U.esc(x.z.nombre)}<br><b>${x.prioridad}</b>` }) }).addTo(layer);
        x.ts.forEach(t => L.polyline(t.coords, { color: '#3a4656', weight: 2, opacity: 0.5, interactive: false }).addTo(layer));
      });
    }
    const tot = zs.reduce((a, x) => ({ costo: a.costo + x.costo, ing: a.ing + x.ingresoAnual, km: a.km + x.km }), { costo: 0, ing: 0, km: 0 });
    root.querySelector('#plan-tabla').innerHTML = `<table class="table">
      <thead><tr><th>Zona</th><th>Prioridad</th><th class="num">Km</th><th class="num">Cables</th><th class="num">Cables/km</th><th class="num">Exceso</th><th class="num">Costo estimado</th><th class="num">Ingreso anual</th><th class="num">Recupero</th><th class="num">Resultado a ${P.horizonte} años</th></tr></thead>
      <tbody>${zs.map(x => `<tr><td><b>${U.esc(x.z.nombre)}</b><br><span class="small muted">${x.provs} proveedores · ${x.postes} tramos aéreos</span></td>
        <td><span class="badge" style="background:${COL[x.prioridad]}22;color:#1b2430;border-color:${COL[x.prioridad]}">${x.prioridad}</span></td>
        <td class="num">${U.num(x.km, 1)}</td><td class="num">${x.cables}</td><td class="num">${U.num(x.densidad, 0)}</td><td class="num">${U.pct(x.aut ? x.exceso / x.aut : 0)}</td>
        <td class="num">${U.moneyShort(x.costo)}</td><td class="num">${U.moneyShort(x.ingresoAnual)}</td><td class="num"><b>${U.num(x.payback, 1)} años</b></td>
        <td class="num ${x.vpn >= 0 ? 't-ok' : 't-crit'}">${x.vpn >= 0 ? '+' : '−'}${U.moneyShort(Math.abs(x.vpn))}</td></tr>`).join('')}
        <tr class="total"><td>Total</td><td></td><td class="num">${U.num(tot.km, 1)}</td><td colspan="3"></td><td class="num">${U.moneyShort(tot.costo)}</td><td class="num">${U.moneyShort(tot.ing)}</td><td class="num">${U.num(tot.costo / tot.ing, 1)} años</td><td class="num">${U.moneyShort(tot.ing * P.horizonte - tot.costo)}</td></tr>
      </tbody></table>
      <p class="muted small">Resultado = ingreso acumulado en el horizonte − costo de obra (sin descontar). Valores ilustrativos para la demo.</p>`;
  }

  return { render, destroy, refresh: () => root && root.isConnected && update() };
})();
