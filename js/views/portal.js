/*
 * 7. PORTAL DEL PROVEEDOR
 * Login simulado. El proveedor ve sólo sus datos: tramos, declaración
 * jurada, solicitudes de permiso con plano "as built", deudas, boletas
 * de pago e intimaciones.
 */
const PortalView = (() => {
  let root = null, tab = 'resumen';
  const djValores = {};   // valores tipeados en la declaración jurada (se conservan entre refrescos)

  const TABS = [
    ['resumen', 'Resumen'], ['tramos', 'Mis tramos'], ['dj', 'Declaración jurada'],
    ['permisos', 'Permisos'], ['deudas', 'Deudas y pagos'], ['intimaciones', 'Intimaciones'],
  ];

  function render(el) {
    root = el;
    const s = Store.state.session;
    if (s.role !== 'proveedor' || !s.provId) return renderLogin();
    const p = Store.prov(s.provId);
    root.innerHTML = `
      <div class="portal-head">
        <div class="portal-brand"><span class="dot big" style="background:${p.color}"></span>
          <div><div class="eyebrow">Portal de proveedores · ${U.esc(Store.CFG.municipio.nombre)}</div><h1>${U.esc(p.nombre)}</h1><div class="muted small">CUIT ${p.cuit} · ${U.esc(p.representante)}</div></div></div>
        <button class="btn" id="p-logout">${U.icon('logout', 15)} Salir</button>
      </div>
      ${Store.state.amnistia.activa ? `<div class="callout ok banner">${U.icon('shield', 16)} <span><b>Régimen de regularización voluntaria vigente hasta el ${U.fmtDate(Store.state.amnistia.hasta)}.</b> Declare lo realmente instalado y regularice sin multas, recargos ni intereses.</span></div>` : ''}
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="portal-body"></div>`;
    root.querySelector('#p-logout').onclick = () => { Store.logout(); location.hash = '#/dashboard'; };
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    renderTab();
  }

  function renderLogin() {
    const C = Store.CFG;
    root.innerHTML = `
      <div class="login-wrap">
        <div class="card login">
          <div class="login-logo">${U.icon('building', 30)}</div>
          <h1>Portal de proveedores</h1>
          <p class="muted">${U.esc(C.municipio.nombre)} · Ocupación de postes y ductos</p>
          <label class="field"><span>Empresa</span><select id="l-prov">${C.proveedores.map(p => `<option value="${p.id}">${U.esc(p.nombre)}</option>`).join('')}</select></label>
          <label class="field"><span>CUIT</span><input id="l-cuit" value="${C.proveedores[0].cuit}" readonly></label>
          <label class="field"><span>Clave fiscal municipal</span><input type="password" value="demo-demo" readonly></label>
          <button class="btn btn-primary block" id="l-go">${U.icon('lock', 15)} Ingresar</button>
          <p class="muted small center">Acceso simulado para la demostración.</p>
        </div>
      </div>`;
    const sel = root.querySelector('#l-prov');
    sel.onchange = () => { root.querySelector('#l-cuit').value = Store.prov(sel.value).cuit; };
    root.querySelector('#l-go').onclick = () => login(sel.value);
  }

  function login(provId) { tab = 'resumen'; Store.loginProveedor(provId); }
  function setTab(k) { tab = k; if (root) render(root); }

  // ---------- Datos del proveedor ----------
  function misTramos() {
    const id = Store.state.session.provId;
    return Store.state.tramos.filter(t => Store.ocup(t, id)).map(t => {
      const o = Store.ocup(t, id);
      return { t, o, exc: t.relevado ? Math.max(0, o.detectados - o.autorizados) : 0, exp: Store.expedienteDe(t.id, id) };
    }).sort((a, b) => b.exc - a.exc || a.t.id.localeCompare(b.t.id));
  }
  function misExp(abiertos = true) { const id = Store.state.session.provId; return Store.state.expedientes.filter(e => e.prov === id && (abiertos ? e.abierto : true)); }

  function renderTab() {
    const body = root.querySelector('#portal-body');
    const id = Store.state.session.provId, p = Store.prov(id);
    const tr = misTramos(), exps = misExp();
    const deuda = exps.reduce((a, e) => a + Store.liquidacion(e).total, 0);
    const canon = Store.totals().porProvMes[id] || 0;
    const mes = Store.state.hoy.slice(0, 7);
    const canonPagado = !!Store.state.canonPagado[id + ':' + mes];

    if (tab === 'resumen') {
      body.innerHTML = `
        <section class="kpi-grid kpi-4">
          <div class="card kpi"><div class="kpi-label">Tramos con permiso</div><div class="kpi-value">${tr.length}</div><div class="kpi-sub">${tr.reduce((a, x) => a + x.o.autorizados, 0)} cables autorizados</div></div>
          <div class="card kpi ${tr.some(x => x.exc) ? 'kpi-alert' : ''}"><div class="kpi-label">Tramos con diferencias</div><div class="kpi-value ${tr.some(x => x.exc) ? 't-crit' : ''}">${tr.filter(x => x.exc).length}</div><div class="kpi-sub">${tr.reduce((a, x) => a + x.exc, 0)} cables detectados sin declarar</div></div>
          <div class="card kpi"><div class="kpi-label">Deuda por expedientes</div><div class="kpi-value">${U.moneyShort(deuda)}</div><div class="kpi-sub">${exps.length} expedientes abiertos</div></div>
          <div class="card kpi"><div class="kpi-label">Canon del mes</div><div class="kpi-value">${U.moneyShort(canon)}</div><div class="kpi-sub">${canonPagado ? 'Pagado' : `Vence el 10/${mes.slice(5, 7)}`}</div></div>
        </section>
        <div class="card"><h3>Próximos pasos</h3>
          <ul class="todo">
            ${tr.some(x => x.exc) ? `<li>${U.icon('alert', 15)} El municipio detectó cables sin declarar en ${tr.filter(x => x.exc).length} tramos. <a href="#" data-goto="dj">Presentar declaración jurada →</a></li>` : `<li>${U.icon('check', 15)} No hay diferencias entre lo autorizado y lo relevado.</li>`}
            ${exps.filter(e => e.intimacion).length ? `<li>${U.icon('file', 15)} Tiene ${exps.filter(e => e.intimacion).length} intimaciones pendientes. <a href="#" data-goto="intimaciones">Ver intimaciones →</a></li>` : ''}
            <li>${U.icon('money', 15)} ${canonPagado ? 'Canon del mes abonado.' : `Canon del mes: ${U.money(canon)}. <a href="#" data-goto="deudas">Pagar →</a>`}</li>
            <li>${U.icon('upload', 15)} ¿Va a tender nuevos cables? <a href="#" data-goto="permisos">Solicite el permiso con su plano as built →</a></li>
          </ul></div>`;
    }

    if (tab === 'tramos') {
      body.innerHTML = `<div class="card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Tramo</th><th>Ubicación</th><th>Tipo</th><th class="num">Autorizados</th><th class="num">Relevados por el municipio</th><th>Estado</th><th>Expediente</th></tr></thead>
        <tbody>${tr.map(({ t, o, exc, exp }) => `<tr>
          <td><b>${t.id}</b></td><td>${U.esc(t.calle)} ${t.altura}</td><td>${t.tipo}</td><td class="num">${o.autorizados}</td>
          <td class="num">${t.relevado ? o.detectados : '—'}</td>
          <td>${!t.relevado ? U.badgeEstado('sin') : exc ? `<span class="badge b-crit">${U.icon('alert', 12)}+${exc} sin declarar</span>` : U.badgeEstado('cumple')}</td>
          <td>${exp ? `${exp.id} · ${Store.ETAPAS[exp.etapa]}` : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
    }

    if (tab === 'dj') {
      const lista = tr.filter(x => x.t.relevado);
      body.innerHTML = `<div class="card" id="portal-dj">
        <div class="card-head"><h3>Declaración jurada de cables instalados</h3><span class="muted small">Ordenada por diferencias detectadas</span></div>
        <p class="muted small">Indique la cantidad real de cables instalados por tramo. Al declarar más que lo autorizado se amplía el permiso y se regulariza el expediente${Store.state.amnistia.activa ? ', <b>sin multa</b> mientras rija el régimen voluntario' : ''}.</p>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Tramo</th><th>Ubicación</th><th class="num">Autorizados</th><th class="num">Relevados</th><th>Cables instalados (declarados)</th></tr></thead>
          <tbody>${lista.map(({ t, o, exc }) => `<tr class="${exc ? 'row-warn' : ''}">
            <td><b>${t.id}</b></td><td>${U.esc(t.calle)} ${t.altura}</td><td class="num">${o.autorizados}</td>
            <td class="num">${o.detectados}${exc ? ` <span class="badge b-crit">+${exc}</span>` : ''}</td>
            <td><input type="number" min="0" class="dj-input" data-tramo="${t.id}" value="${djValores[t.id] ?? o.autorizados}" aria-label="Cables instalados en ${t.id}"></td></tr>`).join('')}</tbody>
        </table></div>
        <label class="check mt"><input type="checkbox" id="dj-jura"> Declaro bajo juramento que los datos consignados son correctos y completos.</label>
        <div class="btn-row mt"><button class="btn btn-primary" id="dj-enviar">${U.icon('file', 15)} Presentar declaración jurada</button></div>
      </div>
      ${Store.state.declaraciones.filter(d => d.provId === id).length ? `<div class="card"><h3>Declaraciones presentadas</h3><ul class="todo">${Store.state.declaraciones.filter(d => d.provId === id).reverse().map(d => `<li>${U.icon('file', 15)} <b>${d.id}</b> · ${U.fmtDate(d.fecha)} ${d.hora.slice(0, 5)} · ${d.resultados.length} tramo(s) · ${d.resultados.filter(r => r.resultado === 'regularizado').length} regularizados</li>`).join('')}</ul></div>` : ''}`;
      body.querySelectorAll('.dj-input').forEach(i => i.oninput = () => { djValores[i.dataset.tramo] = +i.value; });
      body.querySelector('#dj-enviar').onclick = () => submitDJ();
    }

    if (tab === 'permisos') {
      const pers = Store.state.permisos.filter(x => x.provId === id).reverse();
      body.innerHTML = `<div class="grid-2">
        <div class="card"><h3>Solicitar nuevo permiso</h3>
          <label class="field"><span>Tramos (separados por coma)</span><input id="pe-tramos" placeholder="Ej: T-0101, T-0102"></label>
          <div class="form-row"><label class="field"><span>Cables por tramo</span><input id="pe-cables" type="number" min="1" value="2"></label>
          <label class="field"><span>Tipo</span><select id="pe-tipo"><option>Aéreo en postes</option><option>Ducto subterráneo</option></select></label></div>
          <label class="field"><span>Plano "as built" (PDF / DWG)</span><input id="pe-file" type="file" accept=".pdf,.dwg,.dxf,image/*"></label>
          <button class="btn btn-primary mt" id="pe-enviar">${U.icon('upload', 15)} Enviar solicitud</button>
        </div>
        <div class="card"><h3>Mis solicitudes</h3>
          ${pers.length ? `<table class="table"><thead><tr><th>Solicitud</th><th>Tramos</th><th class="num">Cables</th><th>Estado</th></tr></thead><tbody>${pers.map(x => `<tr><td><b>${x.id}</b><br><span class="small muted">${U.fmtDate(x.fecha)}</span></td><td>${U.esc(x.tramos)}</td><td class="num">${x.cables}</td><td><span class="badge b-info">${x.estado}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Todavía no presentó solicitudes.</p>'}
          <p class="muted small">Permiso marco vigente: <b>${p.permisoMarco}</b></p>
        </div></div>`;
      body.querySelector('#pe-enviar').onclick = () => {
        const tramos = body.querySelector('#pe-tramos').value.trim();
        if (!tramos) { U.toast('Indique al menos un tramo.', 'error'); return; }
        const f = body.querySelector('#pe-file').files[0];
        const per = Store.solicitarPermiso(id, { tramos, cables: +body.querySelector('#pe-cables').value, tipo: body.querySelector('#pe-tipo').value, archivo: f ? f.name : null });
        U.toast(`Solicitud ${per.id} enviada. Estado: en evaluación técnica.`, 'ok');
      };
    }

    if (tab === 'deudas') {
      const pagos = Store.state.pagos.filter(x => x.provId === id).reverse();
      body.innerHTML = `<div class="card" id="portal-deudas">
        <div class="card-head"><h3>Deudas pendientes</h3><b>${U.money(deuda + (canonPagado ? 0 : canon))}</b></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Concepto</th><th>Detalle</th><th>Vencimiento</th><th class="num">Importe</th><th></th></tr></thead>
          <tbody>
            ${canonPagado ? '' : `<tr><td><b>Canon de ocupación ${U.monthLabel(Store.state.hoy)}</b></td><td>${tr.length} tramos · ${tr.reduce((a, x) => a + x.o.autorizados, 0)} cables autorizados</td><td>10/${mes.slice(5, 7)}/${mes.slice(0, 4)}</td><td class="num">${U.money(canon)}</td><td><button class="btn btn-sm" data-boleta="canon">Boleta</button></td></tr>`}
            ${exps.map(e => { const l = Store.liquidacion(e); return `<tr><td><b>${e.id}</b><br><span class="small muted">${Store.ETAPAS[e.etapa]}${e.regularizacion?.tipo === 'voluntaria' ? ' · regularización voluntaria' : ''}</span></td>
              <td>${e.tramoId} · ${l.exc} cables · retro ${U.moneyShort(l.retro)}${l.multa ? ` · multa ${U.moneyShort(l.multa)}` : ''}</td>
              <td>${e.vence ? U.fmtDate(e.vence) : '—'}</td><td class="num"><b>${U.money(l.total)}</b></td>
              <td><button class="btn btn-sm btn-primary" data-boleta="${e.id}">Boleta / pagar</button></td></tr>`; }).join('')}
            ${!exps.length && canonPagado ? '<tr><td colspan="5" class="muted">No registra deudas.</td></tr>' : ''}
          </tbody></table></div>
      </div>
      <div class="card"><h3>Pagos realizados</h3>${pagos.length ? `<table class="table"><thead><tr><th>Pago</th><th>Concepto</th><th>Fecha</th><th class="num">Importe</th></tr></thead><tbody>${pagos.map(x => `<tr><td><b>${x.id}</b></td><td>${U.esc(x.concepto)}</td><td>${U.fmtDate(x.fecha)}</td><td class="num">${U.money(x.monto)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin pagos registrados en esta sesión.</p>'}</div>`;
      body.querySelectorAll('[data-boleta]').forEach(b => b.onclick = () => openBoleta(b.dataset.boleta));
    }

    if (tab === 'intimaciones') {
      const ints = misExp(false).filter(e => e.intimacion).reverse();
      body.innerHTML = `<div class="card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Intimación</th><th>Expediente</th><th>Tramo</th><th>Fecha</th><th>Plazo</th><th></th></tr></thead>
        <tbody>${ints.map(e => `<tr><td><b>${e.intimacion.numero}</b></td><td>${e.id}</td><td>${e.tramoId}</td><td>${U.fmtDate(e.intimacion.fecha)}</td><td>${ExpedientesView.plazoBadge(e)}</td>
          <td><button class="btn btn-sm" data-int="${e.id}">${U.icon('file', 14)} Ver / descargar</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No tiene intimaciones.</td></tr>'}</tbody></table></div></div>`;
      body.querySelectorAll('[data-int]').forEach(b => b.onclick = () => ExpedientesView.previewIntimacion(b.dataset.int));
    }

    body.querySelectorAll('[data-goto]').forEach(a => a.onclick = ev => { ev.preventDefault(); setTab(a.dataset.goto); });
  }

  // ---------- Declaración jurada ----------
  function submitDJ(confirmado) {
    const id = Store.state.session.provId;
    const jura = root.querySelector('#dj-jura');
    if (!confirmado && jura && !jura.checked) { U.toast('Debe marcar la declaración bajo juramento.', 'error'); return null; }
    // Se declaran sólo los tramos que el proveedor modificó
    const items = misTramos().filter(x => x.t.relevado && djValores[x.t.id] != null && djValores[x.t.id] !== x.o.autorizados)
      .map(({ t }) => ({ tramoId: t.id, instalados: djValores[t.id] }));
    if (!items.length) { U.toast('No hay cambios para declarar.', 'error'); return null; }
    const dj = Store.declararDJ(id, items);
    if (!dj) return null;
    items.forEach(it => delete djValores[it.tramoId]);
    const RES = { regularizado: 'b-ok', inconsistente: 'b-crit', 'sin-cambios': 'b-none' };
    const m = U.modal({
      title: `Declaración jurada ${dj.id} presentada`, size: 'md',
      body: `<p class="muted">Fecha ${U.fmtDate(dj.fecha)} ${dj.hora} · Constancia con validez de declaración jurada.</p>
        <table class="table"><thead><tr><th>Tramo</th><th class="num">Declarados</th><th>Resultado</th></tr></thead>
        <tbody>${dj.resultados.map(r => `<tr><td><b>${r.tramoId}</b></td><td class="num">${r.instalados}</td><td><span class="badge ${RES[r.resultado]}">${r.resultado}</span> <span class="small">${U.esc(r.texto)}</span></td></tr>`).join('')}</tbody></table>`,
      footer: `<button class="btn btn-primary" data-close id="dj-ok">Ver deudas a pagar</button>`,
    });
    m.foot.querySelector('#dj-ok').onclick = () => setTab('deudas');
    return dj;
  }
  /** Completa un valor de la DJ (usado por la demo guiada) */
  function fillDJ(tramoId, valor) {
    djValores[tramoId] = valor;
    const i = root && root.querySelector(`.dj-input[data-tramo="${tramoId}"]`);
    if (i) { i.value = valor; i.classList.add('flash'); i.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    const j = root && root.querySelector('#dj-jura'); if (j) j.checked = true;
  }

  // ---------- Boleta de pago ----------
  function openBoleta(ref) {
    const id = Store.state.session.provId, p = Store.prov(id), M = Store.CFG.municipio;
    const esCanon = ref === 'canon';
    const e = esCanon ? null : Store.exp(ref);
    const monto = esCanon ? (Store.totals().porProvMes[id] || 0) : Store.liquidacion(e).total;
    const concepto = esCanon ? `Canon de ocupación ${U.monthLabel(Store.state.hoy)}` : `Liquidación expediente ${e.id} (${e.tramoId})${e.regularizacion?.tipo === 'voluntaria' ? ' · regularización voluntaria' : ''}`;
    const codigo = `0458${id}${String(Math.round(monto)).padStart(12, '0')}${Store.state.hoy.replace(/-/g, '')}`;
    const venc = esCanon ? `${Store.state.hoy.slice(0, 8)}10` : (e.vence || U.addDays(Store.state.hoy, 15));
    const doc = `<article class="doc boleta">
        <header class="doc-head"><div class="doc-escudo">${U.icon('shield', 30)}</div><div><b>${U.esc(M.nombre)}</b><br>Boleta de pago · Tasa por ocupación del espacio público</div><div class="doc-num">Vto. ${U.fmtDate(venc)}</div></header>
        <dl class="kv"><dt>Contribuyente</dt><dd>${U.esc(p.nombre)} · CUIT ${p.cuit}</dd><dt>Concepto</dt><dd>${U.esc(concepto)}</dd><dt class="strong">Importe</dt><dd class="strong">${U.money(monto)}</dd></dl>
        <div class="barcode">${U.barcodeSVG(codigo)}<code>${codigo}</code></div>
        <p class="small muted">Pagable en bancos adheridos, Pago Fácil, Rapipago, home banking o con QR. Demo: sin validez fiscal.</p>
      </article>`;
    const m = U.modal({ title: 'Boleta de pago', size: 'md', body: doc });
    m.setFoot(`<button class="btn" id="b-print">${U.icon('print', 15)} Descargar / imprimir</button><div class="grow"></div><button class="btn btn-primary" id="b-pay">${U.icon('money', 15)} Pagar ahora (simulado)</button>`);
    m.foot.querySelector('#b-print').onclick = () => U.printHTML(doc);
    m.foot.querySelector('#b-pay').onclick = () => pagar(ref, m);
    return m;
  }
  function pagar(ref, m) {
    const id = Store.state.session.provId;
    if (ref === 'canon') { Store.pagarCanon(id); U.toast('Canon abonado. ¡Gracias!', 'ok'); }
    else { const pg = Store.registrarPago(ref); if (pg) U.toast(`Pago ${pg.id} acreditado: ${U.money(pg.monto)}. Expediente cerrado.`, 'ok'); }
    if (m) m.close();
  }

  function refresh() { if (root && root.isConnected) render(root); }

  return { render, refresh, login, setTab, fillDJ, submitDJ, openBoleta, pagar };
})();
