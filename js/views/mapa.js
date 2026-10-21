/*
 * 2. MAPA GIS INTERACTIVO (Leaflet + OpenStreetMap)
 * Tramos coloreados con semáforo, filtros por proveedor/zona/estado y
 * panel de detalle con conteo, foto, cargos y expediente.
 */
const MapaView = (() => {
  let root = null, map = null, layer = null, sel = null;
  const filtros = { prov: '', zona: '', q: '', estados: { cumple: true, leve: true, critico: true, sin: true } };

  function destroy() { if (map) { map.remove(); map = null; } }

  function render(el, params = {}) {
    root = el;
    destroy();
    // Los enlaces con filtro (desde el tablero) parten de los filtros limpios
    if (params.estado || params.prov || params.zona) {
      Object.assign(filtros, { prov: params.prov || '', zona: params.zona || '', q: '' });
      Object.keys(filtros.estados).forEach(k => filtros.estados[k] = !params.estado || k === params.estado);
    }
    const C = Store.CFG;

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Mapa de ocupación</h1><p class="muted">Postes (línea continua) y ductos (línea punteada) georreferenciados. Clic en un tramo para ver el detalle.</p></div>
      </div>
      <div class="card filters" id="map-filtros">
        <label class="field"><span>Proveedor</span>
          <select id="f-prov"><option value="">Todos</option>${C.proveedores.map(p => `<option value="${p.id}" ${filtros.prov === p.id ? 'selected' : ''}>${U.esc(p.corto)}</option>`).join('')}</select></label>
        <label class="field"><span>Zona</span>
          <select id="f-zona"><option value="">Todas</option>${C.zonas.map(z => `<option value="${z.id}" ${filtros.zona === z.id ? 'selected' : ''}>${U.esc(z.nombre)}</option>`).join('')}</select></label>
        <div class="field"><span>Estado</span>
          <div class="chips">${Object.entries(U.ESTADOS).map(([k, v]) => `<button class="chip ${filtros.estados[k] ? 'on' : ''}" data-est="${k}"><i class="sw" style="background:${v.color}"></i>${v.label}</button>`).join('')}</div></div>
        <label class="field grow"><span>Buscar</span><input id="f-q" type="search" placeholder="Tramo o calle (ej: T-0042, General Lavalle)" value="${U.esc(filtros.q)}"></label>
        <div class="filter-count" id="f-count"></div>
      </div>
      <div class="map-layout">
        <div class="card map-wrap">
          <div id="map" role="region" aria-label="Mapa de tramos"></div>
          <div class="map-legend">
            ${Object.values(U.ESTADOS).map(v => `<span><i class="sw" style="background:${v.color}"></i>${v.label}</span>`).join('')}
            <span><i class="sw-line"></i>Poste</span><span><i class="sw-line dashed"></i>Ducto</span>
          </div>
        </div>
        <aside class="card map-detail" id="map-detail"></aside>
      </div>`;

    root.querySelector('#f-prov').onchange = e => { filtros.prov = e.target.value; draw(); renderDetail(); };
    root.querySelector('#f-zona').onchange = e => { filtros.zona = e.target.value; draw(); renderDetail(); fitZona(); };
    root.querySelector('#f-q').oninput = e => { filtros.q = e.target.value.trim().toLowerCase(); draw(); renderDetail(); };
    root.querySelectorAll('[data-est]').forEach(b => b.onclick = () => {
      filtros.estados[b.dataset.est] = !filtros.estados[b.dataset.est];
      b.classList.toggle('on'); draw(); renderDetail();
    });

    if (!window.L) { root.querySelector('#map').innerHTML = '<div class="empty">No se pudo cargar la librería de mapas (requiere conexión a internet).</div>'; return; }
    map = L.map('map', { zoomControl: true, preferCanvas: false }).fitBounds(L.latLngBounds(Store.state.tramos.flatMap(t => t.coords)).pad(0.05));
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    sel = params.tramo || sel;
    draw();
    renderDetail();
    setTimeout(() => { map && map.invalidateSize(); if (params.tramo) focus(params.tramo, false); }, 80);
  }

  function pasa(t) {
    if (filtros.prov && !t.ocupaciones.some(o => o.prov === filtros.prov)) return false;
    if (filtros.zona && t.zona !== filtros.zona) return false;
    if (!filtros.estados[Store.metrics(t).estado]) return false;
    if (filtros.q && !(t.id.toLowerCase().includes(filtros.q) || t.calle.toLowerCase().includes(filtros.q))) return false;
    return true;
  }

  function draw() {
    if (!layer) return;
    layer.clearLayers();
    let n = 0;
    const vis = Store.state.tramos.filter(pasa);
    vis.forEach(t => {
      n++;
      const m = Store.metrics(t), color = U.ESTADOS[m.estado].color, isSel = sel === t.id;
      if (isSel) L.polyline(t.coords, { color: '#0f1b2d', weight: 15, opacity: 0.85, interactive: false }).addTo(layer);
      const pl = L.polyline(t.coords, { color, weight: isSel ? 9 : 6, opacity: 0.95, dashArray: t.tipo === 'ducto' ? '8 7' : null, lineCap: 'round' }).addTo(layer);
      pl.bindTooltip(`<b>${t.id}</b> · ${U.esc(t.calle)} ${t.altura}<br>${m.estado === 'sin' ? 'Sin relevar' : `${m.aut} autorizados / <b>${m.det}</b> detectados`}`, { sticky: true });
      pl.on('click', () => select(t.id));
      if (t.tipo === 'poste') [t.coords[0], t.coords[t.coords.length - 1]].forEach(c => L.circleMarker(c, { radius: 3, color: '#3a4656', weight: 1, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(layer));
    });
    const c = root.querySelector('#f-count');
    if (c) c.innerHTML = `Mostrando <b>${n}</b> de ${Store.state.tramos.length} tramos`;
  }

  function fitZona() {
    if (!map) return;
    const ts = Store.state.tramos.filter(pasa);
    if (!ts.length) return;
    map.fitBounds(L.latLngBounds(ts.flatMap(t => t.coords)).pad(0.1));
  }

  function select(id) { sel = id; draw(); renderDetail(); }

  /** Centra el mapa en un tramo y abre su detalle (usado también por la demo guiada) */
  function focus(id, animate = true) {
    const t = Store.tramo(id);
    if (!t) return;
    // Si los filtros lo ocultan, se limpian
    if (!pasa(t)) { filtros.prov = ''; filtros.zona = ''; filtros.q = ''; Object.keys(filtros.estados).forEach(k => filtros.estados[k] = true); }
    sel = id;
    draw(); renderDetail();
    if (map) {
      const b = L.latLngBounds(t.coords);
      animate ? map.flyTo(b.getCenter(), 18, { duration: 1.6 }) : map.setView(b.getCenter(), 18);
    }
  }

  function renderDetail() {
    const box = root && root.querySelector('#map-detail');
    if (!box) return;
    if (!sel) {
      const vis = Store.state.tramos.filter(pasa);
      const cnt = { cumple: 0, leve: 0, critico: 0, sin: 0 };
      vis.forEach(t => cnt[Store.metrics(t).estado]++);
      box.innerHTML = `
        <div class="detail-empty">
          ${U.icon('pin', 28)}
          <h3>Seleccione un tramo</h3>
          <p class="muted">Haga clic sobre una línea del mapa para ver cables autorizados vs. detectados, foto del relevamiento, cargos y expediente.</p>
          <div class="estado-list compact">${Object.keys(cnt).map(e => `<div class="estado-item">${U.badgeEstado(e)}<span class="estado-num">${cnt[e]}</span></div>`).join('')}</div>
          <button class="btn btn-sm mt" data-go="${Store.CFG.casoDestacado.tramoId}">Ver caso testigo ${Store.CFG.casoDestacado.tramoId}</button>
        </div>`;
      box.querySelector('[data-go]').onclick = e => focus(e.currentTarget.dataset.go);
      return;
    }
    const t = Store.tramo(sel), m = Store.metrics(t), z = Store.zona(t.zona);
    const exps = Store.state.expedientes.filter(e => e.tramoId === t.id).sort((a, b) => (b.abierto - a.abierto) || b.id.localeCompare(a.id));
    const abiertos = exps.filter(e => e.abierto);
    const liqs = abiertos.map(e => Store.liquidacion(e));
    const canon = t.ocupaciones.reduce((a, o) => a + Store.calcCargos(t, o, undefined, { exceso: 0, meses: 1 }).regularMes, 0);
    const tot = k => liqs.reduce((a, l) => a + l[k], 0);
    const nFoto = m.det ?? m.aut;

    box.innerHTML = `
      <div class="detail-head">
        <div>
          <div class="eyebrow">${t.id} · ${t.tipo === 'poste' ? 'Tendido aéreo en postes' : 'Ducto subterráneo'}</div>
          <h3>${U.esc(t.calle)} ${t.altura}</h3>
          <div class="muted small">${U.esc(z.nombre)} · ${t.largo} m</div>
        </div>
        <button class="icon-btn" id="d-close" aria-label="Cerrar detalle">${U.icon('x')}</button>
      </div>
      <div class="mt-s">${U.badgeEstado(m.estado)}</div>
      <div class="compare">
        <div><span>Autorizados</span><b>${m.aut}</b></div>
        <div><span>Detectados</span><b class="${m.estado === 'critico' ? 't-crit' : m.estado === 'leve' ? 't-warn' : ''}">${m.det ?? '—'}</b></div>
        <div><span>Exceso</span><b>${m.exceso == null ? '—' : m.exceso > 0 ? '+' + m.exceso : '0'}</b></div>
        <div class="pct-ficha ${m.estado}">
          <div class="pct-top"><span>% de exceso</span><b>${m.ratio == null ? '—' : U.pct(m.ratio, 1)}</b></div>
          ${m.ratio == null ? '<small>Sin relevamiento</small>' : `
          <div class="pct-bar" role="img" aria-label="Exceso ${U.pct(m.ratio, 1)}; el umbral de crítico es 50 %"><i style="width:${Math.min(100, m.ratio / 1.5 * 100).toFixed(1)}%"></i><em style="left:${(0.5 / 1.5 * 100).toFixed(1)}%"></em></div>
          <div class="pct-scale"><span>0 %</span><span style="left:${(0.5 / 1.5 * 100).toFixed(1)}%">50 % · crítico</span><span>150 %+</span></div>
          <small>${m.ratio <= 0 ? 'Cumple: no hay cables por encima de lo autorizado.' : m.ratio <= 0.5 ? 'Exceso leve: hasta la mitad de lo autorizado.' : `Exceso crítico: ${U.num(m.exceso)} cables de más sobre ${U.num(m.aut)} autorizados.`}</small>`}
        </div>
      </div>
      <table class="table mini">
        <thead><tr><th>Proveedor</th><th class="num">Aut.</th><th class="num">Det.</th><th class="num">Exc.</th></tr></thead>
        <tbody>
          ${t.ocupaciones.map(o => { const p = Store.prov(o.prov), ex = o.detectados - o.autorizados; return `<tr><td><span class="dot" style="background:${p.color}"></span>${U.esc(p.corto)}</td><td class="num">${o.autorizados}</td><td class="num">${t.relevado ? o.detectados : '—'}</td><td class="num">${t.relevado && ex > 0 ? `<b class="t-crit">+${ex}</b>` : '0'}</td></tr>`; }).join('')}
          ${t.sinIdentificar ? `<tr><td><span class="dot" style="background:#8f96a0"></span><i>Sin identificar</i></td><td class="num">0</td><td class="num">${t.sinIdentificar}</td><td class="num"><b class="t-crit">+${t.sinIdentificar}</b></td></tr>` : ''}
        </tbody>
      </table>
      <figure class="photo">
        ${t.relevado ? `<img src="${U.posteDataURI(t.fotoSeed, nFoto)}" alt="Foto del relevamiento del tramo ${t.id}">` : `<div class="photo-empty">${U.icon('camera', 26)}<span>Sin relevamiento fotográfico</span></div>`}
        <figcaption>${t.relevado ? `Último relevamiento: <b>${U.fmtDate(t.ultimoRelevamiento)}</b> · ${U.esc(t.inspector)} · confianza ${U.pct(t.confianza)}<br>${U.esc(t.origen)}` : 'Pendiente de relevar'}</figcaption>
      </figure>
      <div class="section-title">Cargos calculados</div>
      <dl class="kv">
        <dt>Canon mensual regular</dt><dd>${U.money(canon)}</dd>
        ${liqs.length ? `
        <dt>Retroactivo por exceso</dt><dd>${U.money(tot('retro'))}</dd>
        <dt>Intereses por mora</dt><dd>${U.money(tot('interes'))}</dd>
        <dt>Multa</dt><dd>${U.money(tot('multa'))}</dd>
        <dt class="strong">Total a recuperar</dt><dd class="strong t-crit">${U.money(tot('total'))}</dd>` : `<dt>Deuda por exceso</dt><dd>${U.money(0)}</dd>`}
      </dl>
      <div class="section-title">Expedientes</div>
      ${exps.length ? `<ul class="exp-list">${exps.slice(0, 4).map(e => `
        <li><a href="#/expedientes?id=${e.id}"><b>${e.id}</b> · ${U.esc(Store.prov(e.prov).corto)}</a>
        <span>${e.abierto ? `<span class="badge b-info">${Store.ETAPAS[e.etapa]}</span> ${ExpedientesView.plazoBadge(e)}` : `<span class="badge b-ok">${U.icon('check', 12)}Cerrado</span>`}</span></li>`).join('')}</ul>` : '<p class="muted small">Sin expedientes.</p>'}
      <div class="btn-row mt">
        <a class="btn btn-primary btn-sm" href="#/relevamiento?tramo=${t.id}">${U.icon('camera', 15)} Relevar ahora</a>
        <a class="btn btn-sm" href="#/identificacion?tramo=${t.id}">${U.icon('tag', 15)} Identificar cables</a>
      </div>`;
    box.querySelector('#d-close').onclick = () => { sel = null; draw(); renderDetail(); };
  }

  function refresh() { draw(); renderDetail(); }

  return { render, destroy, refresh, focus };
})();
