/*
 * 5. MOTOR DE CÁLCULO DE COBRO + SIMULADOR "WHAT-IF"
 * Los deslizadores modifican un ESCENARIO (no la tarifa vigente) y todos
 * los montos se recalculan en tiempo real. "Aplicar" lo vuelve vigente
 * (requiere rol Hacienda o Administrador) y queda en la auditoría.
 */
const CobroView = (() => {
  let root = null, esc = null, expSel = null;

  const PARAMS = [
    { key: 'tarifaCableMetroMes', label: 'Tarifa por cable, por metro y por mes', min: 20, max: 300, step: 5, fmt: v => U.money(v) },
    { key: 'tarifaPosteMes', label: 'Tarifa por poste ocupado (por proveedor, por mes)', min: 0, max: 60000, step: 1000, fmt: v => U.money(v) },
    { key: 'recargoExceso', label: 'Recargo por exceso no declarado', min: 0, max: 300, step: 10, fmt: v => `${v} %` },
    { key: 'interesMoraMensual', label: 'Interés por mora (mensual)', min: 0, max: 10, step: 0.5, fmt: v => `${U.num(v, 1)} %` },
    { key: 'multaPorCable', label: 'Multa por cable no declarado', min: 0, max: 1500000, step: 25000, fmt: v => U.money(v) },
  ];

  // Escenarios predefinidos (el estándar es la tarifa de la ordenanza)
  const PRESETS = {
    conservador: { label: 'Conservador', v: { tarifaCableMetroMes: 60, tarifaPosteMes: 10000, recargoExceso: 50, interesMoraMensual: 2, multaPorCable: 250000 } },
    estandar: { label: 'Estándar', v: () => ({ ...Store.CFG.tarifas }) },
    ambicioso: { label: 'Ambicioso', v: { tarifaCableMetroMes: 130, tarifaPosteMes: 25000, recargoExceso: 200, interesMoraMensual: 5, multaPorCable: 800000 } },
  };
  const presetDe = k => { const p = PRESETS[k].v; return typeof p === 'function' ? p() : { ...p }; };
  const presetActual = () => Object.keys(PRESETS).find(k => PARAMS.every(p => presetDe(k)[p.key] === esc[p.key]));

  function render(el, params = {}) {
    root = el;
    if (!esc) esc = { ...Store.state.params };
    const abiertos = Store.state.expedientes.filter(e => e.abierto).sort((a, b) => Store.liquidacion(b).total - Store.liquidacion(a).total);
    if (params.exp && Store.exp(params.exp)) expSel = params.exp;
    if (!expSel || !Store.exp(expSel)) expSel = (Store.expedienteDestacado() || abiertos[0]).id;
    const puede = Store.can('tarifas');

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Motor de cálculo de cobro</h1>
        <p class="muted">Parámetros según ${Store.CFG.municipio.ordenanza}. Mueva los valores para simular escenarios: los montos se recalculan al instante sin afectar la tarifa vigente.</p></div>
      </div>
      <div class="cobro-layout">
        <div class="card" id="cobro-params">
          <div class="card-head"><h3>Parámetros del escenario</h3>${puede ? '' : `<span class="badge b-none">${U.icon('lock', 12)}Sólo simulación</span>`}</div>
          <div class="preset-row" role="group" aria-label="Escenarios predefinidos">${Object.entries(PRESETS).map(([k, p]) => `<button class="btn btn-sm${presetActual() === k ? ' active' : ''}" data-preset="${k}">${p.label}</button>`).join('')}</div>
          ${PARAMS.map(p => `
            <div class="slider-row">
              <div class="slider-top"><label for="s-${p.key}">${p.label}</label><b id="v-${p.key}">${p.fmt(esc[p.key])}</b></div>
              <input type="range" id="s-${p.key}" data-k="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${esc[p.key]}">
              <div class="slider-foot muted small">Vigente: ${p.fmt(Store.state.params[p.key])} <span id="d-${p.key}"></span></div>
            </div>`).join('')}
          <div class="btn-row">
            <button class="btn" id="c-reset">Volver a la tarifa vigente</button>
            <button class="btn btn-primary" id="c-aplicar" ${puede ? '' : 'disabled title="Requiere rol Hacienda o Administrador"'}>Aplicar como tarifa vigente</button>
          </div>
        </div>
        <div class="col">
          <div class="scenario-grid" id="cobro-resultados"></div>
          <div class="card">
            <div class="card-head"><h3>Impacto por proveedor</h3><span class="muted small">Vigente → escenario</span></div>
            <div class="table-wrap" id="cobro-prov"></div>
          </div>
        </div>
      </div>
      <div class="card" id="cobro-detalle">
        <div class="card-head">
          <h3>Liquidación detallada de un expediente</h3>
          <label class="field inline"><span>Expediente</span><select id="c-exp">${abiertos.map(e => `<option value="${e.id}" ${e.id === expSel ? 'selected' : ''}>${e.id} · ${e.tramoId} · ${U.esc(Store.prov(e.prov).corto)}</option>`).join('')}</select></label>
        </div>
        <div id="cobro-calc"></div>
      </div>`;

    root.querySelectorAll('input[type=range]').forEach(s => s.oninput = () => { esc[s.dataset.k] = +s.value; refreshOutputs(); });
    root.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { esc = presetDe(b.dataset.preset); render(root); U.toast(`Escenario ${PRESETS[b.dataset.preset].label.toLowerCase()} cargado en el simulador.`); });
    root.querySelector('#c-reset').onclick = () => { esc = { ...Store.state.params }; render(root); };
    root.querySelector('#c-aplicar').onclick = () => { if (Store.setParams(esc)) U.toast('Nuevas tarifas aplicadas y registradas en auditoría.', 'ok'); };
    root.querySelector('#c-exp').onchange = e => { expSel = e.target.value; refreshOutputs(); };
    refreshOutputs();
  }

  const delta = (a, b) => {
    const d = b - a;
    if (Math.abs(d) < 1) return '<span class="delta">sin cambios</span>';
    return `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${U.moneyShort(Math.abs(d))} (${d > 0 ? '+' : '−'}${U.pct(Math.abs(d) / Math.max(a, 1), 1)})</span>`;
  };

  /** Recalcula todas las salidas con el escenario actual (tiempo real) */
  function refreshOutputs() {
    if (!root || !root.isConnected) return;
    const vig = Store.totals(Store.state.params), sim = Store.totals(esc);
    const pa = presetActual(); root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b.dataset.preset === pa));
    PARAMS.forEach(p => {
      root.querySelector(`#v-${p.key}`).textContent = p.fmt(esc[p.key]);
      const s = root.querySelector(`#s-${p.key}`); if (+s.value !== esc[p.key]) s.value = esc[p.key];
      const changed = esc[p.key] !== Store.state.params[p.key];
      root.querySelector(`#d-${p.key}`).innerHTML = changed ? '<span class="badge b-info">modificado</span>' : '';
    });
    const card = (label, a, b, sub) => `<div class="card kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${U.moneyShort(b)}</div><div class="kpi-sub">Vigente ${U.moneyShort(a)} ${delta(a, b)}</div>${sub ? `<div class="kpi-sub muted">${sub}</div>` : ''}</div>`;
    root.querySelector('#cobro-resultados').innerHTML =
      card('Recaudación mensual regular', vig.regularMes, sim.regularMes, 'Canon por cables autorizados y postes') +
      card('Recaudación mensual potencial', vig.potencialMes, sim.potencialMes, 'Si se cobra todo lo instalado') +
      card('Monto a recuperar (expedientes abiertos)', vig.aRecuperar, sim.aRecuperar, `Retroactivo ${U.moneyShort(sim.retro)} · intereses ${U.moneyShort(sim.interes)} · multas ${U.moneyShort(sim.multas)}`) +
      card('Ingreso del primer año (potencial + recupero)', vig.potencialMes * 12 + vig.aRecuperar, sim.potencialMes * 12 + sim.aRecuperar, 'Proyección con regularización total');

    root.querySelector('#cobro-prov').innerHTML = `<table class="table">
      <thead><tr><th>Proveedor</th><th class="num">Canon mensual</th><th class="num">Deuda vigente</th><th class="num">Deuda escenario</th><th>Variación</th></tr></thead>
      <tbody>${Store.CFG.proveedores.map(p => `<tr>
        <td><span class="dot" style="background:${p.color}"></span>${U.esc(p.corto)}</td>
        <td class="num">${U.money(sim.porProvMes[p.id] || 0)}</td>
        <td class="num">${U.money(vig.porProv[p.id] || 0)}</td>
        <td class="num"><b>${U.money(sim.porProv[p.id] || 0)}</b></td>
        <td>${delta(vig.porProv[p.id] || 0, sim.porProv[p.id] || 0)}</td></tr>`).join('')}</tbody></table>`;

    renderCalc();
  }

  function renderCalc() {
    const e = Store.exp(expSel), el = root.querySelector('#cobro-calc');
    if (!e) { el.innerHTML = '<p class="muted">Sin expedientes abiertos.</p>'; return; }
    const t = Store.tramo(e.tramoId), o = Store.ocup(t, e.prov), p = Store.prov(e.prov);
    const congelada = !!e.liquidacion;
    const c = congelada ? e.liquidacion : Store.calcCargos(t, o, esc);
    const amn = Store.calcCargos(t, o, esc, { amnistia: true });
    const P = congelada ? Store.state.params : esc;
    const canonNuevo = Store.calcCargos(t, { ...o, autorizados: o.detectados }, P, { exceso: 0, meses: 1 }).regularMes;
    el.innerHTML = `
      ${congelada ? `<p class="callout info">${U.icon('lock', 15)} Liquidación ya emitida (${e.regularizacion?.tipo === 'voluntaria' ? 'regularización voluntaria' : 'congelada'}); no la afecta el simulador.</p>` : ''}
      <div class="calc-grid">
        <div>
          <dl class="kv">
            <dt>Tramo</dt><dd>${t.id} · ${U.esc(t.calle)} ${t.altura} (${t.largo} m, ${t.tipo})</dd>
            <dt>Proveedor</dt><dd><span class="dot" style="background:${p.color}"></span>${U.esc(p.nombre)}</dd>
            <dt>Cables autorizados / detectados</dt><dd>${c.aut} / <b>${c.det}</b> → exceso <b class="t-crit">${c.exc}</b></dd>
            <dt>Instalación estimada del exceso</dt><dd>${U.fmtDate(o.instalacionExceso)} (${c.meses} meses)</dd>
          </dl>
        </div>
        <table class="table calc">
          <tbody>
            <tr><td>Canon regular mensual</td><td class="formula">${c.aut} cables × ${t.largo} m × ${U.money(P.tarifaCableMetroMes)}${c.posteMes ? ` + ${U.money(c.posteMes)} poste` : ''}</td><td class="num">${U.money(c.regularMes)}</td></tr>
            <tr><td>Exceso mensual con recargo</td><td class="formula">${c.exc} × ${t.largo} m × ${U.money(P.tarifaCableMetroMes)} × (1 + ${U.num(c.recargo * 100)} %)</td><td class="num">${U.money(c.excesoMes)}</td></tr>
            <tr><td>Cobro retroactivo</td><td class="formula">${U.money(c.excesoMes)} × ${c.meses} meses</td><td class="num">${U.money(c.retro)}</td></tr>
            <tr><td>Intereses por mora</td><td class="formula">${U.num(P.interesMoraMensual, 1)} % mensual sobre saldo promedio</td><td class="num">${U.money(c.interes)}</td></tr>
            <tr><td>Multa</td><td class="formula">${c.exc} cables × ${U.money(P.multaPorCable)}</td><td class="num">${U.money(c.multa)}</td></tr>
            <tr class="total"><td>Total a recuperar</td><td></td><td class="num" id="calc-total">${U.money(c.total)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="calc-foot">
        <div class="mini-stat"><span>Si regulariza en el régimen voluntario</span><b>${U.money(amn.total)}</b><small>sin recargo, intereses ni multa</small></div>
        <div class="mini-stat"><span>Canon mensual tras regularizar</span><b>${U.money(canonNuevo)}</b><small>antes ${U.money(c.regularMes)} · +${U.money(canonNuevo - c.regularMes)} por mes</small></div>
        <a class="btn" href="#/expedientes?id=${e.id}">${U.icon('folder', 15)} Ir al expediente ${e.id}</a>
      </div>`;
  }

  /** Cambia un parámetro del escenario (usado por la demo guiada para el what-if) */
  function setEsc(key, value) { esc[key] = value; refreshOutputs(); }
  function resetEsc() { esc = { ...Store.state.params }; if (root && root.isConnected) refreshOutputs(); }

  // Re-render completo: el escenario vive en este módulo, así que no se pierde
  function refresh() { if (root && root.isConnected) render(root); }

  return { render, refresh, setEsc, resetEsc };
})();
