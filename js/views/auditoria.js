/*
 * 8. AUDITORÍA Y TRAZABILIDAD
 * Log encadenado (cada registro contiene el hash del anterior: si alguien
 * altera uno, la cadena se rompe) y matriz de roles y permisos.
 */
const AuditoriaView = (() => {
  let root = null, filtroRol = '', q = '', limite = 60;

  const ROL_LABEL = r => r === 'sistema' ? 'Sistema' : (Store.ROLES[r]?.nombre || r);

  function render(el) {
    root = el;
    const S = Store.state;
    const puede = Store.can('auditoria');
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Auditoría y trazabilidad</h1>
        <p class="muted">Quién hizo qué y cuándo. Los registros no se pueden editar ni borrar: cada uno se encadena con el anterior mediante una huella digital.</p></div>
      </div>
      <div class="grid-2 audit-top">
        <div class="card integrity" id="aud-integridad">
          <div class="int-icon">${U.icon('shield', 30)}</div>
          <div class="grow">
            <h3>Integridad del registro</h3>
            <p id="aud-res" class="muted">${S.audit.length} registros encadenados. Último hash: <code>${S.audit[S.audit.length - 1].hash}</code></p>
            <div class="btn-row"><button class="btn btn-primary btn-sm" id="aud-ver">Verificar cadena completa</button><button class="btn btn-sm" id="aud-tamper">Simular alteración de un registro</button></div>
          </div>
        </div>
        <div class="card">
          <h3>Sesión actual</h3>
          <dl class="kv"><dt>Usuario</dt><dd>${U.esc(Store.usuarioActual())}</dd><dt>Rol</dt><dd>${ROL_LABEL(S.session.role)}</dd>
          <dt>Permisos</dt><dd>${Store.ROLES[S.session.role].perms.map(p => `<span class="badge b-info">${Store.PERMISOS[p]}</span>`).join(' ')}</dd></dl>
          <p class="muted small">Cambie de rol desde la barra superior para ver cómo se habilitan o bloquean las acciones.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Matriz de roles y permisos</h3></div>
        <div class="table-wrap"><table class="table matrix">
          <thead><tr><th>Permiso</th>${Object.entries(Store.ROLES).map(([k, r]) => `<th class="center ${k === S.session.role ? 'col-sel' : ''}">${r.nombre}</th>`).join('')}</tr></thead>
          <tbody>${Object.entries(Store.PERMISOS).map(([pk, pl]) => `<tr><td>${pl}</td>${Object.entries(Store.ROLES).map(([k, r]) => `<td class="center ${k === S.session.role ? 'col-sel' : ''}">${r.perms.includes(pk) ? `<span class="t-ok">${U.icon('check', 16)}</span>` : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Registro de acciones</h3>
          <div class="filters-inline">
            <select id="aud-rol" aria-label="Filtrar por rol"><option value="">Todos los roles</option>${['sistema', ...Object.keys(Store.ROLES)].map(r => `<option value="${r}" ${filtroRol === r ? 'selected' : ''}>${ROL_LABEL(r)}</option>`).join('')}</select>
            <input type="search" id="aud-q" placeholder="Buscar acción, objeto o usuario" value="${U.esc(q)}">
          </div>
        </div>
        ${puede ? '<div class="table-wrap" id="aud-tabla"></div>' : `<p class="callout info">${U.icon('lock', 15)} Su rol no tiene acceso al registro completo de auditoría. Disponible para Administrador, Hacienda y Legal.</p>`}
      </div>`;

    root.querySelector('#aud-ver').onclick = () => {
      const r = Store.verifyChain();
      showResult(r, Store.state.audit);
    };
    root.querySelector('#aud-tamper').onclick = () => {
      // Se altera una COPIA (el registro real no se modifica)
      const copia = Store.state.audit.map(x => ({ ...x }));
      const i = Math.floor(copia.length * 0.4);
      copia[i].detalle = copia[i].detalle.replace(/\d+/, d => String(+d + 1)) + ' ';
      showResult(Store.verifyChain(copia), copia, i);
    };
    const rs = root.querySelector('#aud-rol'); rs.onchange = () => { filtroRol = rs.value; renderTabla(); };
    const qi = root.querySelector('#aud-q'); qi.oninput = () => { q = qi.value.trim().toLowerCase(); renderTabla(); };
    if (puede) renderTabla();
  }

  function showResult(r, list, alterado) {
    const el = root.querySelector('#aud-res');
    const box = root.querySelector('#aud-integridad');
    box.classList.toggle('bad', !r.ok); box.classList.toggle('good', r.ok);
    el.innerHTML = r.ok
      ? `<b class="t-ok">${U.icon('check', 15)} Cadena íntegra.</b> Se verificaron ${list.length} registros: ninguno fue alterado.`
      : `<b class="t-crit">${U.icon('alert', 15)} Cadena rota en el registro #${list[r.index].n}.</b> ${alterado != null ? 'Simulación: se cambió un dígito en el detalle de un registro (sobre una copia) y la verificación lo detecta de inmediato.' : ''}`;
  }

  function renderTabla() {
    const el = root.querySelector('#aud-tabla');
    if (!el) return;
    const list = [...Store.state.audit].reverse().filter(a => (!filtroRol || a.rol === filtroRol) && (!q || `${a.accion} ${a.detalle} ${a.objeto} ${a.usuario}`.toLowerCase().includes(q)));
    el.innerHTML = `<table class="table">
      <thead><tr><th>#</th><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Detalle</th><th>Objeto</th><th>Hash</th></tr></thead>
      <tbody>${list.slice(0, limite).map(a => `<tr><td class="muted">${a.n}</td><td class="nowrap">${U.fmtDateTime(a.ts)}</td><td>${U.esc(a.usuario)}</td><td><span class="badge b-none">${ROL_LABEL(a.rol)}</span></td>
        <td><b>${U.esc(a.accion)}</b></td><td class="small">${U.esc(a.detalle)}</td><td class="small">${U.esc(a.objeto)}</td><td><code title="Anterior: ${a.prevHash}">${a.hash.slice(0, 10)}…</code></td></tr>`).join('')}</tbody></table>
      ${list.length > limite ? `<div class="center mt"><button class="btn btn-sm" id="aud-mas">Ver más (${list.length - limite} restantes)</button></div>` : ''}`;
    const mas = el.querySelector('#aud-mas'); if (mas) mas.onclick = () => { limite += 100; renderTabla(); };
  }

  return { render, refresh: () => root && root.isConnected && render(root) };
})();
