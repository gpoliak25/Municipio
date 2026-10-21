/*
 * 4. IDENTIFICACIÓN DE CABLES POR PROVEEDOR
 * Registro de precintos (QR / código de permiso), asignación de cada
 * cable a un proveedor y alertas de cables sin identificar o en desuso.
 */
const IdentificacionView = (() => {
  let root = null, selId = null;

  function render(el, params = {}) {
    root = el;
    if (params.tramo) selId = params.tramo;
    const S = Store.state, k = Store.kpis();
    const sinId = S.tramos.filter(t => t.relevado && t.sinIdentificar > 0);
    const desuso = [];
    S.tramos.forEach(t => t.relevado && t.ocupaciones.forEach(o => { if (o.desuso > 0) desuso.push({ t, o }); }));
    const sinPrecinto = S.tramos.reduce((a, t) => a + (t.relevado ? t.ocupaciones.reduce((b, o) => b + Math.max(0, o.detectados - o.identificados), 0) : 0), 0);
    if (!selId) selId = (sinId[0] || S.tramos[0]).id;
    const puede = Store.can('identificar');

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Identificación de cables</h1>
        <p class="muted">Cada cable debe llevar un precinto con código QR vinculado al permiso del proveedor. Los cables sin precinto o sin dueño generan alertas.</p></div>
      </div>
      <section class="kpi-grid kpi-4">
        <div class="card kpi"><div class="kpi-label">${U.icon('tag', 16)} Cables con precinto</div><div class="kpi-value">${U.pct(k.ident / Math.max(k.detRel, 1), 1)}</div><div class="kpi-sub">${U.num(k.ident)} de ${U.num(k.detRel)} cables relevados</div></div>
        <div class="card kpi"><div class="kpi-label">${U.icon('alert', 16)} Sin precinto (dueño conocido)</div><div class="kpi-value">${sinPrecinto}</div><div class="kpi-sub">Atribuidos por trazado; requieren precinto</div></div>
        <div class="card kpi kpi-alert"><div class="kpi-label">${U.icon('alert', 16)} Cables sin identificar</div><div class="kpi-value t-crit">${k.sinId}</div><div class="kpi-sub">En ${sinId.length} tramos · no se puede cobrar a nadie</div></div>
        <div class="card kpi"><div class="kpi-label">${U.icon('clock', 16)} Cables en desuso</div><div class="kpi-value t-warn">${k.desuso}</div><div class="kpi-sub">Deben retirarse o seguir pagando canon</div></div>
      </section>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>Alerta: cables sin identificar</h3><span class="badge b-crit">${sinId.length} tramos</span></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Tramo</th><th>Ubicación</th><th class="num">Sin identificar</th><th></th></tr></thead>
            <tbody>${sinId.map(t => `<tr class="${t.id === selId ? 'row-sel' : ''}"><td><b>${t.id}</b></td><td>${U.esc(t.calle)} ${t.altura}</td><td class="num"><b class="t-crit">${t.sinIdentificar}</b></td>
              <td class="num"><button class="btn btn-sm" data-sel="${t.id}">Identificar</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No hay cables sin identificar.</td></tr>'}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Alerta: cables en desuso</h3><span class="badge b-warn">${desuso.length} casos</span></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Tramo</th><th>Proveedor</th><th class="num">Cables</th><th>Acción</th></tr></thead>
            <tbody>${desuso.map(({ t, o }) => `<tr><td><b>${t.id}</b> <span class="muted small">${U.esc(t.calle)}</span></td><td><span class="dot" style="background:${Store.prov(o.prov).color}"></span>${U.esc(Store.prov(o.prov).corto)}</td><td class="num">${o.desuso}</td>
              <td>${o.desusoNotificado ? '<span class="badge b-info">Retiro notificado</span>' : `<button class="btn btn-sm" data-desuso="${t.id}|${o.prov}" ${puede ? '' : 'disabled'}>Intimar retiro</button>`}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>
      <div class="card" id="id-detalle"></div>`;

    root.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { selId = b.dataset.sel; render(root); root.querySelector('#id-detalle').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    root.querySelectorAll('[data-desuso]').forEach(b => b.onclick = () => { const [t, p] = b.dataset.desuso.split('|'); Store.notificarDesuso(t, p); U.toast(`Se intimó a ${Store.prov(p).corto} a retirar el cable en desuso (15 días).`, 'ok'); });
    renderDetalle();
  }

  function renderDetalle() {
    const el = root.querySelector('#id-detalle');
    const t = Store.tramo(selId), cables = Store.cablesDe(t), puede = Store.can('identificar');
    const EST = {
      'identificado': '<span class="badge b-ok">Identificado</span>',
      'sin-precinto': '<span class="badge b-warn">Sin precinto</span>',
      'desuso': '<span class="badge b-none">En desuso</span>',
      'sin-identificar': '<span class="badge b-crit">Sin identificar</span>',
    };
    el.innerHTML = `
      <div class="card-head">
        <h3>Registro de precintos · ${t.id} — ${U.esc(t.calle)} ${t.altura}</h3>
        <label class="field inline"><span>Tramo</span><select id="id-tramo">${Store.state.tramos.filter(x => x.relevado).map(x => `<option value="${x.id}" ${x.id === selId ? 'selected' : ''}>${x.id} · ${U.esc(x.calle)} ${x.altura}${x.sinIdentificar ? ' ⚠' : ''}</option>`).join('')}</select></label>
      </div>
      ${puede ? '' : `<p class="callout info">${U.icon('lock', 15)} Su rol puede consultar pero no modificar. Las asignaciones las realiza un Inspector.</p>`}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>Precinto (QR)</th><th>Proveedor</th><th>Permiso</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody>${cables.map(c => `<tr>
          <td>${c.n}</td>
          <td>${c.precinto ? `<span class="qr-mini">${U.qrSVG(c.precinto, 22)}</span><code>${c.precinto}</code>` : '<span class="muted">—</span>'}</td>
          <td>${c.prov ? `<span class="dot" style="background:${c.color}"></span>${U.esc(c.provNombre)}${c.excedente ? ' <span class="badge b-crit">fuera de permiso</span>' : ''}` : '<i class="muted">Desconocido</i>'}</td>
          <td class="small">${c.prov ? c.permiso : '—'}</td>
          <td>${EST[c.estado]}</td>
          <td>${c.estado === 'sin-identificar' ? `
              <div class="inline-actions">
                <button class="btn btn-sm" data-scan ${puede ? '' : 'disabled'}>${U.icon('scan', 14)} Escanear QR</button>
                <select data-asig ${puede ? '' : 'disabled'}><option value="">Asignar manualmente…</option>${Store.CFG.proveedores.map(p => `<option value="${p.id}">${U.esc(p.corto)}</option>`).join('')}</select>
              </div>`
            : c.estado === 'sin-precinto' ? `<button class="btn btn-sm" data-precinto="${c.prov}" ${puede ? '' : 'disabled'}>Colocar precinto</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;

    el.querySelector('#id-tramo').onchange = e => { selId = e.target.value; renderDetalle(); };
    el.querySelectorAll('[data-precinto]').forEach(b => b.onclick = () => Store.colocarPrecinto(selId, b.dataset.precinto));
    el.querySelectorAll('[data-asig]').forEach(s => s.onchange = () => { if (s.value) { Store.asignarCable(selId, s.value, 'asignación manual por trazado'); U.toast(`Cable asignado a ${Store.prov(s.value).corto}`, 'ok'); } });
    el.querySelectorAll('[data-scan]').forEach(b => b.onclick = () => escanear());
  }

  /** Simula la lectura del precinto QR con la cámara de la tablet */
  function escanear() {
    const t = Store.tramo(selId);
    // El precinto leído pertenece a algún proveedor presente (o a uno sin permiso en el tramo)
    const pool = t.ocupaciones.map(o => o.prov);
    const provId = Math.random() < 0.8 && pool.length ? pool[Math.floor(Math.random() * pool.length)] : Store.CFG.proveedores[Math.floor(Math.random() * Store.CFG.proveedores.length)].id;
    const p = Store.prov(provId);
    const code = `${p.permisoMarco}/${t.id}`;
    const m = U.modal({
      title: 'Lectura de precinto QR', size: 'sm',
      body: `<div class="scan-box"><div class="scan-qr">${U.qrSVG(code, 140)}<div class="scanline"></div></div><p class="muted" id="scan-msg">Apuntando la cámara al precinto…</p></div>`,
    });
    setTimeout(() => {
      if (!m.el.isConnected) return;
      const sinPermiso = !t.ocupaciones.some(o => o.prov === provId);
      m.setBody(`<div class="scan-box"><div class="scan-qr">${U.qrSVG(code, 140)}</div>
        <dl class="kv"><dt>Código leído</dt><dd><code>${code}</code></dd><dt>Proveedor</dt><dd><b>${U.esc(p.nombre)}</b></dd><dt>CUIT</dt><dd>${p.cuit}</dd></dl>
        ${sinPermiso ? `<p class="callout crit">${U.icon('alert', 15)} El proveedor no tiene permiso en este tramo: se generará un expediente.</p>` : ''}</div>`);
      m.setFoot(`<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="scan-ok">Asignar cable a ${U.esc(p.corto)}</button>`);
      m.foot.querySelector('#scan-ok').onclick = () => { m.close(); Store.asignarCable(selId, provId, 'lectura de precinto QR'); U.toast(`Cable asignado a ${p.corto}`, 'ok'); };
    }, 1500);
  }

  return { render, refresh: () => root && root.isConnected && render(root) };
})();
