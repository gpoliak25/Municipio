/*
 * 6. GESTIÓN DE EXPEDIENTES Y SANCIONES (workflow)
 * Detección → validación → intimación → plazo → multa/cobro → retiro → cierre.
 * Incluye semáforo de plazos, intimación imprimible (PDF) y el régimen
 * de regularización voluntaria (amnistía).
 */
const ExpedientesView = (() => {
  let root = null, detalle = null;     // detalle = {id, modal}
  const filtro = { etapa: null, prov: '', plazo: '', q: '' };

  function plazoBadge(e) {
    if (!e.abierto) return '<span class="badge b-none">Cerrado</span>';
    const d = Store.diasRestantes(e), st = Store.plazoEstado(e);
    if (d == null) return '';
    const cls = st === 'vencido' ? 'crit' : st === 'proximo' ? 'warn' : 'ok';
    const txt = d < 0 ? `Vencido hace ${-d} d` : d === 0 ? 'Vence hoy' : `${d} días`;
    return `<span class="badge b-${cls}">${U.icon(st === 'ok' ? 'clock' : 'alert', 12)}${txt}</span>`;
  }

  function render(el, params = {}) {
    root = el;
    const S = Store.state, puedeAmn = Store.can('amnistia');
    const abiertos = S.expedientes.filter(e => e.abierto);
    const porEtapa = Store.ETAPAS.map((_, i) => i === 6 ? S.expedientes.filter(e => !e.abierto).length : abiertos.filter(e => e.etapa === i).length);
    const venc = abiertos.filter(e => Store.plazoEstado(e) === 'vencido').length;
    const prox = abiertos.filter(e => Store.plazoEstado(e) === 'proximo').length;

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Expedientes y sanciones</h1>
        <p class="muted">${abiertos.length} expedientes abiertos · <span class="t-crit">${venc} con plazo vencido</span> · <span class="t-warn">${prox} vencen en 5 días o menos</span></p></div>
      </div>

      <div class="card amnistia ${S.amnistia.activa ? 'on' : ''}" id="exp-amnistia">
        <div>
          <h3>${U.icon('shield', 18)} Régimen de regularización voluntaria</h3>
          <p class="muted small">Los proveedores que declaren lo realmente instalado dentro del plazo pagan sólo el canon retroactivo, <b>sin multa, recargo ni intereses</b>. Aplica a expedientes que aún no tienen multa.</p>
        </div>
        <div class="amn-ctrl">
          <label class="switch"><input type="checkbox" id="amn-on" ${S.amnistia.activa ? 'checked' : ''} ${puedeAmn ? '' : 'disabled'}><span></span> ${S.amnistia.activa ? 'Vigente' : 'Inactivo'}</label>
          <label class="field inline"><span>Hasta</span><input type="date" id="amn-hasta" value="${S.amnistia.hasta}" ${puedeAmn ? '' : 'disabled'}></label>
          <button class="btn btn-sm" id="amn-save" ${puedeAmn ? '' : 'disabled title="Requiere rol Legal o Administrador"'}>Guardar</button>
        </div>
      </div>

      <div class="pipeline" id="exp-pipeline">
        ${Store.ETAPAS.map((n, i) => `<button class="pipe ${filtro.etapa === i ? 'on' : ''}" data-etapa="${i}"><span class="pipe-n">${porEtapa[i]}</span><span class="pipe-l">${i + 1}. ${n}</span></button>`).join('')}
      </div>

      <div class="card filters">
        <label class="field"><span>Proveedor</span><select id="fe-prov"><option value="">Todos</option>${Store.CFG.proveedores.map(p => `<option value="${p.id}" ${filtro.prov === p.id ? 'selected' : ''}>${U.esc(p.corto)}</option>`).join('')}</select></label>
        <label class="field"><span>Plazo</span><select id="fe-plazo">
          <option value="">Todos</option><option value="vencido" ${filtro.plazo === 'vencido' ? 'selected' : ''}>Vencidos</option>
          <option value="proximo" ${filtro.plazo === 'proximo' ? 'selected' : ''}>Por vencer (≤ 5 días)</option><option value="ok" ${filtro.plazo === 'ok' ? 'selected' : ''}>En término</option>
          <option value="cerrado" ${filtro.plazo === 'cerrado' ? 'selected' : ''}>Cerrados</option></select></label>
        <label class="field grow"><span>Buscar</span><input type="search" id="fe-q" placeholder="Expediente, tramo o calle" value="${U.esc(filtro.q)}"></label>
        ${filtro.etapa != null ? `<button class="btn btn-sm" id="fe-clear">Quitar filtro de etapa</button>` : ''}
      </div>
      <div class="card"><div class="table-wrap" id="exp-tabla"></div></div>`;

    root.querySelectorAll('[data-etapa]').forEach(b => b.onclick = () => { const i = +b.dataset.etapa; filtro.etapa = filtro.etapa === i ? null : i; render(root); });
    root.querySelector('#fe-prov').onchange = e => { filtro.prov = e.target.value; renderTabla(); };
    root.querySelector('#fe-plazo').onchange = e => { filtro.plazo = e.target.value; renderTabla(); };
    root.querySelector('#fe-q').oninput = e => { filtro.q = e.target.value.trim().toLowerCase(); renderTabla(); };
    const clr = root.querySelector('#fe-clear'); if (clr) clr.onclick = () => { filtro.etapa = null; render(root); };
    root.querySelector('#amn-save').onclick = () => {
      if (Store.setAmnistia(root.querySelector('#amn-on').checked, root.querySelector('#amn-hasta').value)) U.toast('Régimen de regularización actualizado.', 'ok');
    };
    renderTabla();
    if (params.id && (!detalle || detalle.id !== params.id)) openDetail(params.id);
  }

  function renderTabla() {
    const el = root.querySelector('#exp-tabla');
    const list = Store.state.expedientes.filter(e => {
      if (filtro.etapa != null && (filtro.etapa === 6 ? e.abierto : (!e.abierto || e.etapa !== filtro.etapa))) return false;
      if (filtro.prov && e.prov !== filtro.prov) return false;
      if (filtro.plazo && Store.plazoEstado(e) !== filtro.plazo) return false;
      if (filtro.q) { const t = Store.tramo(e.tramoId); if (!(e.id.toLowerCase().includes(filtro.q) || e.tramoId.toLowerCase().includes(filtro.q) || t.calle.toLowerCase().includes(filtro.q))) return false; }
      return true;
    }).sort((a, b) => (b.abierto - a.abierto) || (a.abierto ? (a.vence || '').localeCompare(b.vence || '') : b.id.localeCompare(a.id)));
    el.innerHTML = `<table class="table">
      <thead><tr><th>Expediente</th><th>Tramo</th><th>Proveedor</th><th class="num">Exceso</th><th>Etapa</th><th>Plazo</th><th class="num">Monto</th></tr></thead>
      <tbody>${list.map(e => {
        const t = Store.tramo(e.tramoId), l = Store.liquidacion(e);
        return `<tr class="clickable" data-id="${e.id}">
          <td><b>${e.id}</b>${e.regularizacion ? ' <span class="badge b-info">DJ</span>' : ''}</td>
          <td>${e.tramoId} · ${U.esc(t.calle)} ${t.altura}</td>
          <td><span class="dot" style="background:${Store.prov(e.prov).color}"></span>${U.esc(Store.prov(e.prov).corto)}</td>
          <td class="num">+${e.abierto ? l.exc : e.cablesExceso ?? l.exc}</td>
          <td>${e.abierto ? Store.ETAPAS[e.etapa] : `<span class="muted">${U.esc(e.resultado || 'Cerrado')}</span>`}</td>
          <td>${plazoBadge(e)}</td>
          <td class="num">${U.money(e.abierto ? l.total : e.montoCobrado)}</td></tr>`;
      }).join('') || '<tr><td colspan="7" class="muted">Sin resultados.</td></tr>'}</tbody></table>`;
    el.querySelectorAll('[data-id]').forEach(tr => tr.onclick = () => openDetail(tr.dataset.id));
  }

  // ---------- Detalle del expediente ----------
  function openDetail(id) {
    if (detalle) detalle.modal.close();
    const m = U.modal({ title: `Expediente ${id}`, size: 'lg', onClose: () => { if (detalle && detalle.id === id) detalle = null; } });
    detalle = { id, modal: m };
    renderDetail();
    return m;
  }

  function stepper(e) {
    const hechas = new Set(e.historial.map(h => h.etapa));
    return `<ol class="stepper">${Store.ETAPAS.map((n, i) => {
      const cls = i === e.etapa && e.abierto ? 'current' : hechas.has(i) ? 'done' : i < e.etapa ? 'skipped' : '';
      return `<li class="${cls}"><span class="st-dot">${hechas.has(i) && !(i === e.etapa && e.abierto) ? U.icon('check', 12) : i + 1}</span><span class="st-l">${n}</span></li>`;
    }).join('')}</ol>`;
  }

  function renderDetail() {
    if (!detalle) return;
    const e = Store.exp(detalle.id), t = Store.tramo(e.tramoId), p = Store.prov(e.prov), o = Store.ocup(t, e.prov);
    const l = Store.liquidacion(e), ev = Store.state.evidencias.find(v => v.id === e.evidenciaId);
    const can = Store.can;
    const acciones = [];
    if (e.abierto) {
      if (e.etapa === 0) {
        acciones.push(`<a class="btn" href="#/relevamiento?tramo=${t.id}" data-close>${U.icon('camera', 15)} Validar en campo</a>`);
        acciones.push(btn('validar', 'Validar con relevamiento existente', 'relevar', 'btn-primary'));
      }
      if (e.etapa === 1) acciones.push(btn('preview', 'Generar intimación', 'intimar', 'btn-primary', 'file'));
      if (e.etapa === 2) { acciones.push(btn('verint', 'Ver intimación', null, '', 'file')); acciones.push(btn('notificar', 'Registrar notificación e iniciar plazo', 'intimar', 'btn-primary')); }
      if (e.etapa === 3) { acciones.push(btn('verint', 'Ver intimación', null, '', 'file')); acciones.push(btn('multa', 'Plazo vencido: aplicar multa', 'sancionar', 'btn-danger')); }
      if (e.etapa === 4) { acciones.push(btn('pago', 'Registrar pago', 'cobrar', 'btn-primary', 'money')); if (!e.regularizacion) acciones.push(btn('retiro', 'Ordenar retiro de cables', 'sancionar', 'btn-danger')); }
      if (e.etapa === 5) acciones.push(btn('confirmar-retiro', 'Confirmar retiro ejecutado', 'sancionar', 'btn-danger'));
    }
    function btn(act, label, perm, cls = '', ic = 'arrow') {
      const ok = !perm || can(perm);
      return `<button class="btn ${cls}" data-act="${act}" ${ok ? '' : `disabled title="Requiere permiso: ${Store.PERMISOS[perm]}"`}>${U.icon(ok ? ic : 'lock', 15)} ${label}</button>`;
    }

    detalle.modal.setBody(`
      <div class="exp-head">
        <div>
          <div class="eyebrow">${t.id} · ${U.esc(t.calle)} ${t.altura} · ${U.esc(Store.zona(t.zona).nombre)}</div>
          <h2>${U.esc(p.nombre)}</h2>
          <div class="muted small">CUIT ${p.cuit} · Permiso ${p.permisoMarco}</div>
        </div>
        <div class="exp-badges">${e.abierto ? `<span class="badge b-info">${Store.ETAPAS[e.etapa]}</span> ${plazoBadge(e)}` : `<span class="badge b-ok">${U.icon('check', 12)}Cerrado</span>`}
          ${e.regularizacion?.tipo === 'voluntaria' ? '<span class="badge b-ok">Regularización voluntaria</span>' : ''}</div>
      </div>
      ${stepper(e)}
      ${e.abierto && e.etapa === 3 ? `<p class="callout info">${U.icon('clock', 15)} El proveedor tiene hasta el <b>${U.fmtDate(e.vence)}</b> para declarar y regularizar desde su portal${Store.state.amnistia.activa ? ' (con el régimen voluntario vigente, sin multa)' : ''}.</p>` : ''}
      ${!e.abierto ? `<p class="callout ok">${U.icon('check', 15)} ${U.esc(e.resultado)} · cerrado el ${U.fmtDate(e.fechaCierre)} · cobrado ${U.money(e.montoCobrado)}</p>` : ''}
      <div class="exp-grid">
        <div>
          <div class="section-title">Situación del tramo</div>
          <div class="compare small-c">
            <div><span>Autorizados</span><b>${l.aut}</b></div><div><span>Detectados</span><b class="t-crit">${l.det}</b></div><div><span>Exceso</span><b>+${l.exc}</b></div>
          </div>
          <div class="section-title">Evidencia</div>
          <figure class="photo">
            <img src="${U.posteDataURI(t.fotoSeed, l.det)}" alt="Evidencia fotográfica">
            <figcaption>${ev ? `<b>${ev.id}</b> · ${U.fmtDate(ev.fecha)} ${ev.hora} · ${ev.lat.toFixed(5)}, ${ev.lng.toFixed(5)}<br>IA ${ev.conteoIA} / validado ${ev.conteo} · ${U.esc(ev.inspector)} · hash <code>${ev.hash.slice(0, 12)}…</code>` : `Relevamiento automático del ${U.fmtDate(t.ultimoRelevamiento)} · ${U.esc(t.origen || '')} · pendiente de validación en campo`}</figcaption>
          </figure>
        </div>
        <div>
          <div class="section-title">Liquidación ${e.liquidacion ? '(emitida)' : '(en vivo)'}</div>
          <dl class="kv">
            <dt>Canon regular mensual</dt><dd>${U.money(l.regularMes)}</dd>
            <dt>Exceso mensual (${l.amnistia ? 'sin recargo' : `recargo ${U.num(l.recargo * 100)} %`})</dt><dd>${U.money(l.excesoMes)}</dd>
            <dt>Retroactivo (${l.meses} meses)</dt><dd>${U.money(l.retro)}</dd>
            <dt>Intereses por mora</dt><dd>${U.money(l.interes)}</dd>
            <dt>Multa</dt><dd>${U.money(l.multa)}</dd>
            <dt class="strong">Total</dt><dd class="strong t-crit" id="exp-total">${U.money(l.total)}</dd>
          </dl>
          <a class="small" href="#/cobro?exp=${e.id}" data-close>Ver el cálculo paso a paso →</a>
          <div class="section-title">Historial</div>
          <ul class="timeline">${[...e.historial].reverse().map(h => `<li><span class="tl-date">${U.fmtDate(h.fecha)} ${h.hora ? h.hora.slice(0, 5) : ''}</span><b>${Store.ETAPAS[h.etapa]}</b> — ${U.esc(h.texto)}<span class="tl-user">${U.esc(h.usuario)}</span></li>`).join('')}</ul>
        </div>
      </div>`);
    detalle.modal.setFoot(`<a class="btn btn-ghost" href="#/mapa?tramo=${t.id}" data-close>${U.icon('map', 15)} Ver en el mapa</a><div class="grow"></div>${acciones.join('')}`);
    detalle.modal.foot.querySelectorAll('[data-act]').forEach(b => b.onclick = () => accion(b.dataset.act, e.id));
  }

  function accion(act, id) {
    const map = {
      validar: () => Store.validarExpediente(id),
      preview: () => previewIntimacion(id),
      verint: () => previewIntimacion(id),
      notificar: () => Store.notificarIntimacion(id),
      multa: () => Store.aplicarMulta(id),
      pago: () => { const p = Store.registrarPago(id); if (p) U.toast(`Pago ${p.id} registrado: ${U.money(p.monto)}`, 'ok'); },
      retiro: () => Store.ordenarRetiro(id),
      'confirmar-retiro': () => Store.confirmarRetiro(id),
    };
    map[act] && map[act]();
  }

  // ---------- Intimación (documento imprimible) ----------
  function intimacionHTML(id) {
    const e = Store.exp(id), t = Store.tramo(e.tramoId), p = Store.prov(e.prov), M = Store.CFG.municipio;
    const l = Store.liquidacion(e), ev = Store.state.evidencias.find(v => v.id === e.evidenciaId);
    const numero = e.intimacion?.numero || `${Store.state.hoy.slice(0, 4)}-BORRADOR`;
    const fecha = e.intimacion?.fecha || Store.state.hoy;
    const plazoHasta = e.etapa >= 3 && e.vence ? e.vence : U.addDays(fecha, 30);
    return `
      <article class="doc">
        <header class="doc-head">
          <div class="doc-escudo">${U.icon('shield', 34)}</div>
          <div><b>${U.esc(M.nombre)}</b><br>${U.esc(M.area)}<br><span class="small">${U.esc(M.domicilio)}</span></div>
          <div class="doc-num"><b>CÉDULA DE INTIMACIÓN</b><br>N° ${numero}<br>Expte. ${e.id}<br>${U.fmtDate(fecha)}</div>
        </header>
        <p><b>Sres. ${U.esc(p.nombre)}</b> · CUIT ${p.cuit}<br>Domicilio constituido: ${U.esc(p.domicilio)} · ${U.esc(p.email)}</p>
        <p>En virtud de lo dispuesto por la ${U.esc(M.ordenanza)} y el permiso de ocupación <b>${p.permisoMarco}</b>, se hace saber que en el relevamiento
        ${ev ? `de fecha <b>${U.fmtDate(ev.fecha)} a las ${ev.hora}</b> (evidencia <b>${ev.id}</b>, coordenadas ${ev.lat.toFixed(6)}, ${ev.lng.toFixed(6)}, conteo validado por ${U.esc(ev.inspector)})` : `automático de fecha <b>${U.fmtDate(t.ultimoRelevamiento)}</b>`}
        se constató en el tramo <b>${t.id} — ${U.esc(t.calle)} ${t.altura}</b> la existencia de <b>${l.det} cables</b> de su titularidad, cuando el permiso vigente autoriza <b>${l.aut}</b>,
        lo que configura una ocupación no declarada de <b>${l.exc} cables</b>.</p>
        <div class="doc-ev">
          <img src="${U.posteDataURI(t.fotoSeed, l.det)}" alt="Evidencia">
          <table class="table mini">
            <tbody>
              <tr><td>Exceso mensual (${t.largo} m, recargo ${U.num(l.recargo * 100)} %)</td><td class="num">${U.money(l.excesoMes)}</td></tr>
              <tr><td>Cobro retroactivo (${l.meses} meses)</td><td class="num">${U.money(l.retro)}</td></tr>
              <tr><td>Intereses por mora</td><td class="num">${U.money(l.interes)}</td></tr>
              <tr><td>Multa (${l.exc} × ${U.money(Store.state.params.multaPorCable)})</td><td class="num">${U.money(l.multa)}</td></tr>
              <tr class="total"><td>Total intimado</td><td class="num">${U.money(l.total)}</td></tr>
            </tbody>
          </table>
        </div>
        <p>Por ello, <b>SE LO INTIMA</b> para que dentro del plazo de <b>treinta (30) días corridos</b> (hasta el <b>${U.fmtDate(plazoHasta)}</b>) proceda a:
        a) declarar bajo juramento la totalidad de los cables instalados y solicitar la ampliación del permiso; y b) abonar la liquidación precedente;
        <b>bajo apercibimiento</b> de aplicar la multa prevista y ordenar el <b>retiro de los cables a su exclusivo costo</b>, con ejecución de la garantía del permiso.</p>
        ${Store.state.amnistia.activa ? `<p class="doc-note">Régimen de regularización voluntaria vigente hasta el ${U.fmtDate(Store.state.amnistia.hasta)}: si declara dentro de dicho plazo, se condonan la multa, el recargo y los intereses (abonaría ${U.money(Store.calcCargos(t, Store.ocup(t, e.prov), Store.state.params, { amnistia: true }).total)}).</p>` : ''}
        <footer class="doc-foot">
          <div class="doc-qr">${U.qrSVG(numero + e.id, 76)}<span class="small">Verificar autenticidad<br>y evidencia digital</span></div>
          <div class="doc-firma">${U.esc(Store.CFG.usuarios.legal)}<br><span class="small">Dirección de Asuntos Legales · firma digital</span></div>
        </footer>
      </article>`;
  }

  function previewIntimacion(id) {
    const e = Store.exp(id);
    const borrador = e.etapa === 1 && e.abierto;
    const m = U.modal({ title: borrador ? 'Vista previa de la intimación' : `Intimación ${e.intimacion?.numero || ''}`, size: 'lg', body: intimacionHTML(id) });
    m.setFoot(`<button class="btn" id="i-print">${U.icon('print', 15)} Imprimir / guardar PDF</button><div class="grow"></div>
      ${borrador ? `<button class="btn btn-primary" id="i-emitir" ${Store.can('intimar') ? '' : 'disabled'}>${U.icon('check', 15)} Emitir y notificar</button>` : ''}`);
    m.foot.querySelector('#i-print').onclick = () => U.printHTML(intimacionHTML(id));
    const em = m.foot.querySelector('#i-emitir');
    if (em) em.onclick = () => { emitir(id); m.close(); };
    return m;
  }

  /** Emite la intimación y registra la notificación (inicia el plazo de 30 días) */
  function emitir(id) {
    Store.emitirIntimacion(id);
    if (Store.exp(id).etapa === 2) {
      Store.notificarIntimacion(id);
      U.toast(`Intimación ${Store.exp(id).intimacion.numero} emitida y notificada. Plazo hasta ${U.fmtDate(Store.exp(id).vence)}.`, 'ok');
    }
  }

  function refresh() {
    if (root && root.isConnected) render(root);
    if (detalle) { if (detalle.modal.el.isConnected) renderDetail(); else detalle = null; }
  }

  return { render, refresh, openDetail, previewIntimacion, intimacionHTML, emitir, plazoBadge, destroy: () => { if (detalle) { detalle.modal.close(); detalle = null; } } };
})();
