/*
 * 1. DASHBOARD EJECUTIVO
 * Todos los números salen de Store.kpis()/ranking()/serieMensual(), que
 * a su vez se calculan sobre los mismos tramos que muestra el mapa.
 * Cada elemento con [data-det] abre un panel lateral con su detalle.
 */
const DashboardView = (() => {
  let charts = [];
  let root = null;
  let serieActual = null;
  const S = () => Store.state;

  function destroy() { charts.forEach(c => c.destroy()); charts = []; }

  // ================================================================
  // Agregados auxiliares (siempre derivados del Store)
  // ================================================================
  /** Canon actual y potencial de una ocupación */
  function canonOcup(t, o) {
    const c = Store.calcCargos(t, o, undefined, { exceso: 0, meses: 1 });
    return { canon: c.regularMes, potencial: (t.relevado ? o.detectados : o.autorizados) * c.tarifaCableMes + c.posteMes };
  }
  function porZona() {
    return Store.CFG.zonas.map(z => {
      const r = { z, tramos: 0, rel: 0, est: { cumple: 0, leve: 0, critico: 0, sin: 0 }, aut: 0, det: 0, exc: 0, canon: 0, potencial: 0, provs: new Set() };
      S().tramos.filter(t => t.zona === z.id).forEach(t => {
        const m = Store.metrics(t);
        r.tramos++; r.est[m.estado]++;
        if (t.relevado) { r.rel++; r.aut += m.aut; r.det += m.det; r.exc += m.exceso; }
        t.ocupaciones.forEach(o => { const c = canonOcup(t, o); r.canon += c.canon; r.potencial += c.potencial; r.provs.add(o.prov); });
      });
      r.pct = r.aut ? r.exc / r.aut : 0;
      return r;
    });
  }
  function porProveedorCanon() {
    const out = {};
    S().tramos.forEach(t => t.ocupaciones.forEach(o => {
      const c = canonOcup(t, o), r = out[o.prov] || (out[o.prov] = { canon: 0, potencial: 0 });
      r.canon += c.canon; r.potencial += c.potencial;
    }));
    return out;
  }
  const provCell = id => { const p = Store.prov(id); return `<span class="dot" style="background:${p.color}"></span>${U.esc(p.corto)}`; };
  const pctTxt = (a, b) => U.pct(b ? a / b : 0, 1);
  const statusDe = pct => pct > 0.3 ? 'crit' : pct > 0.1 ? 'warn' : 'ok';

  // ================================================================
  // Render principal
  // ================================================================
  function render(el) {
    root = el;
    destroy();
    const k = Store.kpis(), rk = Store.ranking(), serie = Store.serieMensual(), zonas = porZona();
    serieActual = serie;
    const alertas = Store.alertasPlazos().slice(0, 6);
    const maxDet = Math.max(k.detRel, 1);
    const rec12 = serie.recuperado.reduce((a, b) => a + b, 0);
    const excAnt = serie.exceso[serie.exceso.length - 2] || 0;
    const M = Store.CFG.municipio;

    root.innerHTML = `
      <header class="dash-head">
        <div>
          <div class="eyebrow">${U.esc(M.area)} · Panel ejecutivo</div>
          <h1>Tablero de control de ocupación</h1>
          <p class="muted">${U.esc(M.nombre)} · ${k.tramos} tramos de postes y ductos · ${Store.CFG.proveedores.length} proveedores con permiso</p>
        </div>
        <div class="dash-actions">
          <span class="live-pill"><i></i>Datos al ${U.fmtDate(S().hoy)}</span>
          <button class="btn" data-det="informe">${U.icon('print', 16)} Informe ejecutivo</button>
          <a class="btn btn-primary" href="#/mapa">${U.icon('map', 16)} Abrir mapa</a>
        </div>
      </header>

      <section class="card hero" id="dash-hero">
        <div class="hero-text">
          <span class="eyebrow">Ocupación del espacio público · ${k.tramosRel} tramos relevados</span>
          <h2>El municipio cobra por <strong>${U.num(k.autRel)}</strong> cables y hay <strong class="t-crit">${U.num(k.detRel)}</strong> instalados.</h2>
          <p><b>${U.num(k.exceso)} cables (+${U.pct(k.pctExceso, 1)})</b> ocupan postes y ductos municipales sin pagar:
          <b>${U.money(k.brechaMes)}</b> por mes que hoy no se recaudan, más <b>${U.moneyShort(k.aRecuperar)}</b> de deuda retroactiva y multas.</p>
          <button class="btn btn-sm mt-s" data-det="cables">Ver desglose por zona y tramo ${U.icon('arrow', 14)}</button>
        </div>
        <div class="hero-side">
          <div class="hero-stats">
            <button class="hstat" data-det="cables"><span>Autorizados</span><b>${U.num(k.autRel)}</b></button>
            <button class="hstat" data-det="cables"><span>Detectados</span><b class="t-crit">${U.num(k.detRel)}</b></button>
            <button class="hstat" data-det="cables"><span>Exceso</span><b>+${U.num(k.exceso)}</b><small>${U.pct(k.pctExceso, 1)}</small></button>
          </div>
          <div class="hero-bars" role="img" aria-label="Cables autorizados ${k.autRel} contra detectados ${k.detRel}">
            <div class="hbar"><span class="hbar-label">Con permiso</span>
              <div class="hbar-track"><div class="hbar-fill fill-brand" style="width:${(k.autRel / maxDet * 100).toFixed(1)}%"></div></div></div>
            <div class="hbar"><span class="hbar-label">En la calle</span>
              <div class="hbar-track"><div class="hbar-fill fill-brand" style="width:${((k.autRel - k.sinUso) / maxDet * 100).toFixed(1)}%"></div><div class="hbar-fill fill-crit" style="width:${(k.exceso / maxDet * 100).toFixed(1)}%"></div></div></div>
            <div class="hbar-legend"><span><i class="sw fill-brand"></i>Cables con permiso</span><span><i class="sw fill-crit"></i>Exceso sin declarar</span></div>
          </div>        </div>
      </section>

      <section class="kpi-grid" id="dash-kpis">
        ${kpiCard({ id: 'kpi-recaudacion', det: 'recaudacion', label: 'Recaudación mensual', ico: 'money', tono: 'blue',
          value: U.moneyShort(k.regularMes),
          compare: `Potencial <b>${U.moneyShort(k.potencialMes)}</b> <span class="delta up">+${U.pct(k.brechaMes / Math.max(k.regularMes, 1), 1)}</span>`,
          sub: `Brecha anual ${U.moneyShort(k.brechaMes * 12)}` })}
        ${kpiCard({ id: 'kpi-recuperar', det: 'recuperar', label: 'Monto a recuperar', ico: 'folder', tono: 'red',
          value: U.moneyShort(k.aRecuperar),
          compare: `<b>${k.abiertos}</b> expedientes abiertos`,
          sub: `Retroactivo ${U.moneyShort(k.retro)} · multas ${U.moneyShort(k.multas)}` })}
        ${kpiCard({ id: 'kpi-recuperado', det: 'recuperado', label: 'Recuperado', ico: 'check', tono: 'green',
          value: U.moneyShort(k.recuperado),
          compare: `<b>${k.regularizados}</b> expedientes cobrados`,
          extra: U.sparkline(serie.recuperado, '#1baf7a') })}
        ${kpiCard({ id: 'kpi-multas', det: 'multas', label: 'Multas emitidas', ico: 'alert', tono: 'amber',
          value: k.multasEmitidas,
          compare: `Por <b>${U.moneyShort(k.montoMultas)}</b>`,
          sub: `<span class="t-crit">${k.vencidos} expedientes con plazo vencido</span>` })}
        ${kpiCard({ id: 'kpi-regularizaciones', det: 'regularizaciones', label: 'Regularizaciones en curso', ico: 'clock', tono: 'slate',
          value: k.enCurso,
          compare: S().amnistia.activa ? `<span class="badge b-ok">Amnistía vigente</span>` : `<span class="badge b-none">Sin amnistía</span>`,
          sub: S().amnistia.activa ? `Hasta el ${U.fmtDate(S().amnistia.hasta)}` : 'En plazo o con DJ presentada' })}
      </section>

      <section class="dash-row">
        <div class="card" id="dash-estados">
          <div class="card-head"><div><h3>Estado de los tramos</h3><p class="muted small">Semáforo de cumplimiento · ${k.tramos} tramos</p></div></div>
          <div class="stack-bar" role="img" aria-label="Distribución de tramos por estado">
            ${['cumple', 'leve', 'critico', 'sin'].map(e => `<button class="seg" data-det="estado:${e}" title="${U.ESTADOS[e].label}: ${k.est[e]}" style="width:${(k.est[e] / k.tramos * 100).toFixed(2)}%;background:${U.ESTADOS[e].color}"></button>`).join('')}
          </div>
          <div class="estado-grid">
            ${['cumple', 'leve', 'critico', 'sin'].map(e => `
              <button class="estado-card" data-det="estado:${e}">
                <span class="estado-bar" style="background:${U.ESTADOS[e].color}"></span>
                <span class="estado-lbl">${U.icon(U.ESTADOS[e].icon, 14)} ${U.ESTADOS[e].label}</span>
                <span class="estado-num">${k.est[e]}</span>
                <span class="muted small">${U.pct(k.est[e] / k.tramos)} del total</span>
              </button>`).join('')}
          </div>
          <p class="muted small mt">Leve: hasta 50 % más cables que los autorizados · Crítico: más del 50 %.</p>
        </div>

        <div class="card" id="dash-ranking">
          <div class="card-head"><div><h3>Ranking de incumplimiento</h3><p class="muted small">% de cables instalados sin permiso, por proveedor</p></div></div>
          <div class="table-wrap">
          <table class="table table-pro">
            <thead><tr><th>Proveedor</th><th class="num">Autoriz.</th><th class="num">Detect.</th><th class="num">Exceso</th><th>Incumplimiento</th><th class="num">Deuda</th><th></th></tr></thead>
            <tbody>
              ${rk.map((p, i) => `<tr class="clickable" data-det="prov:${p.id}">
                  <td class="nowrap"><span class="rank">${i + 1}</span>${provCell(p.id)}</td>
                  <td class="num">${p.aut}</td><td class="num">${p.det}</td><td class="num"><b>+${p.exc}</b></td>
                  <td class="nowrap"><div class="meter"><div class="meter-fill m-${statusDe(p.pct)}" style="width:${Math.min(100, p.pct / 0.6 * 100).toFixed(0)}%"></div></div><span class="small">${U.pct(p.pct, 1)}</span></td>
                  <td class="num">${U.moneyShort(p.deuda)}</td>
                  <td class="chev">${U.icon('arrow', 14)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section class="grid-2">
        <div class="card">
          <div class="card-head"><div><h3>Cables en exceso pendientes</h3><p class="muted small">Últimos 12 meses · clic en un mes para ver el detalle</p></div>
            <div class="head-figure"><b>${U.num(k.exceso)}</b><span class="delta ${k.exceso <= excAnt ? 'up' : 'down'}">${k.exceso <= excAnt ? '−' : '+'}${U.num(Math.abs(k.exceso - excAnt))} vs. mes anterior</span></div></div>
          <div class="chart-box"><canvas id="ch-exceso" aria-label="Evolución mensual de cables en exceso"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Monto recuperado por mes</h3><p class="muted small">Expedientes cobrados · clic en una barra para ver cuáles</p></div>
            <div class="head-figure"><b>${U.moneyShort(rec12)}</b><span class="muted small">en 12 meses</span></div></div>
          <div class="chart-box"><canvas id="ch-recuperado" aria-label="Monto recuperado por mes"></canvas></div>
        </div>
      </section>

      <section class="grid-2">
        <div class="card">
          <div class="card-head"><div><h3>Situación por zona</h3><p class="muted small">Clic en una zona para ver su detalle</p></div></div>
          <div class="table-wrap"><table class="table table-pro">
            <thead><tr><th>Zona</th><th>Semáforo</th><th class="num">Exceso</th><th class="num">Canon / mes</th><th class="num">Brecha / mes</th><th></th></tr></thead>
            <tbody>${zonas.map(r => `<tr class="clickable" data-det="zona:${r.z.id}">
              <td><b>${U.esc(r.z.nombre)}</b><br><span class="small muted">${r.tramos} tramos</span></td>
              <td>${miniStack(r.est, r.tramos)}</td>
              <td class="num"><b>+${r.exc}</b><br><span class="small muted">${U.pct(r.pct, 1)}</span></td>
              <td class="num">${U.moneyShort(r.canon)}</td>
              <td class="num t-crit">${U.moneyShort(r.potencial - r.canon)}</td>
              <td class="chev">${U.icon('arrow', 14)}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Alertas de vencimiento</h3><p class="muted small">Expedientes con plazo más próximo</p></div><a class="btn btn-sm" href="#/expedientes">Ver todos</a></div>
          <div class="table-wrap"><table class="table table-pro">
            <thead><tr><th>Expediente</th><th>Proveedor</th><th>Plazo</th><th class="num">Monto</th><th></th></tr></thead>
            <tbody>${alertas.map(e => `<tr class="clickable" data-det="exp:${e.id}">
              <td class="nowrap"><b>${e.id}</b><br><span class="small muted">${e.tramoId} · ${Store.ETAPAS[e.etapa]}</span></td>
              <td class="nowrap">${provCell(e.prov)}</td>
              <td>${ExpedientesView.plazoBadge(e)}</td><td class="num">${U.moneyShort(Store.liquidacion(e).total)}</td>
              <td class="chev">${U.icon('arrow', 14)}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
      </section>`;

    root.querySelectorAll('[data-det]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.det)));
    drawCharts(serie);
  }

  function kpiCard({ id, det, label, ico, tono, value, compare, sub, extra }) {
    return `<button class="kpi-card" id="${id}" data-det="${det}">
      <div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-ico i-${tono}">${U.icon(ico, 16)}</span></div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-compare">${compare}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
      ${extra || ''}
      <div class="kpi-foot">Ver detalle ${U.icon('arrow', 13)}</div>
    </button>`;
  }
  function miniStack(est, total) {
    return `<div class="mini-stack" title="${Object.entries(est).map(([e, n]) => `${U.ESTADOS[e].label}: ${n}`).join(' · ')}">${['cumple', 'leve', 'critico', 'sin'].map(e => est[e] ? `<i style="width:${(est[e] / total * 100).toFixed(1)}%;background:${U.ESTADOS[e].color}"></i>` : '').join('')}</div>`;
  }

  // ================================================================
  // Gráficos (clic en un mes => detalle)
  // ================================================================
  function drawCharts(serie) {
    if (!window.Chart) return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = '#5d6877';
    const grid = { color: '#eceff3' };
    const clic = { onClick: (e, els) => { if (els.length) abrir('mes:' + els[0].index); }, onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; } };
    const tooltip = { backgroundColor: '#17212e', padding: 10, cornerRadius: 8, displayColors: false, titleFont: { weight: '600' } };
    charts.push(new Chart(root.querySelector('#ch-exceso'), {
      type: 'line',
      data: { labels: serie.labels, datasets: [{ label: 'Cables en exceso', data: serie.exceso, borderColor: '#d03b3b', backgroundColor: 'rgba(208,59,59,.08)', fill: true, borderWidth: 2, pointRadius: 3, pointHoverRadius: 7, pointBackgroundColor: '#fff', pointBorderWidth: 2, tension: 0.3 }] },
      options: {
        ...clic, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: c => `${U.num(c.parsed.y)} cables en exceso`, footer: () => 'Clic para ver el detalle' } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid, border: { display: false } } },
      },
    }));
    charts.push(new Chart(root.querySelector('#ch-recuperado'), {
      type: 'bar',
      data: { labels: serie.labels, datasets: [{ label: 'Recuperado', data: serie.recuperado, backgroundColor: '#1baf7a', hoverBackgroundColor: '#13895f', borderRadius: 4, maxBarThickness: 28 }] },
      options: {
        ...clic, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: c => U.money(c.parsed.y), footer: () => 'Clic para ver el detalle' } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid, border: { display: false }, ticks: { callback: v => U.moneyShort(v) } } },
      },
    }));
  }

  // ================================================================
  // Paneles de detalle
  // ================================================================
  const stats = arr => `<div class="d-stats">${arr.map(([l, v, cls]) => `<div><span>${l}</span><b class="${cls || ''}">${v}</b></div>`).join('')}</div>`;
  const section = (titulo, html, nota) => `<section class="d-section"><h4>${titulo}</h4>${nota ? `<p class="muted small">${nota}</p>` : ''}${html}</section>`;
  const tabla = (heads, rows, vacio = 'Sin datos.') => `<div class="table-wrap"><table class="table table-pro">
    <thead><tr>${heads.map(h => `<th class="${h.startsWith('#') ? 'num' : ''}">${h.replace(/^#/, '')}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('') || `<tr><td colspan="${heads.length}" class="muted">${vacio}</td></tr>`}</tbody></table></div>`;
  const linkRow = (href, cells) => `<tr class="clickable" data-href="${href}">${cells}</tr>`;
  const tramoRow = t => {
    const m = Store.metrics(t);
    return linkRow(`#/mapa?tramo=${t.id}`, `<td><b>${t.id}</b><br><span class="small muted">${U.esc(t.calle)} ${t.altura}</span></td>
      <td>${t.ocupaciones.map(o => provCell(o.prov)).join('<br>')}</td><td class="num">${m.aut}</td><td class="num">${m.det ?? '—'}</td>
      <td class="num">${m.exceso ? `<b class="t-crit">+${m.exceso}</b>` : '0'}</td><td>${U.badgeEstado(m.estado)}</td>`);
  };
  const expRow = e => {
    const l = Store.liquidacion(e);
    return linkRow(`#/expedientes?id=${e.id}`, `<td><b>${e.id}</b><br><span class="small muted">${e.tramoId}</span></td><td class="nowrap">${provCell(e.prov)}</td>
      <td>${e.abierto ? Store.ETAPAS[e.etapa] : `<span class="muted">${U.esc(e.resultado || 'Cerrado')}</span>`}</td><td>${ExpedientesView.plazoBadge(e)}</td>
      <td class="num"><b>${U.money(e.abierto ? l.total : e.montoCobrado)}</b></td>`);
  };
  const EXP_HEADS = ['Expediente', 'Proveedor', 'Etapa / resultado', 'Plazo', '#Monto'];
  const TRAMO_HEADS = ['Tramo', 'Proveedor', '#Aut.', '#Det.', '#Exceso', 'Estado'];

  function abrir(det) {
    const [tipo, arg] = det.split(':');
    if (tipo === 'exp') { location.hash = `#/expedientes?id=${arg}`; return; }
    const builders = { cables, recaudacion, recuperar, recuperado, multas, regularizaciones, estado, prov: proveedor, zona, mes, informe };
    const d = builders[tipo] && builders[tipo](arg);
    if (!d) return;
    U.closeModals();
    const m = U.modal({ drawer: true, eyebrow: d.eyebrow || 'Detalle', title: d.title, subtitle: d.subtitle, body: d.body, footer: d.footer || '' });
    m.body.addEventListener('click', ev => {
      const tr = ev.target.closest('[data-href]');
      if (tr) { m.close(); location.hash = tr.dataset.href; }
    });
    if (d.onOpen) d.onOpen(m);
  }

  function cables() {
    const k = Store.kpis(), zonas = porZona();
    const tipos = ['poste', 'ducto'].map(tp => {
      const ts = S().tramos.filter(t => t.tipo === tp && t.relevado);
      const ms = ts.map(Store.metrics);
      return { tp, n: ts.length, aut: ms.reduce((a, m) => a + m.aut, 0), det: ms.reduce((a, m) => a + m.det, 0), exc: ms.reduce((a, m) => a + m.exceso, 0) };
    });
    const top = S().tramos.filter(t => t.relevado).sort((a, b) => Store.metrics(b).exceso - Store.metrics(a).exceso || Store.metrics(b).ratio - Store.metrics(a).ratio).slice(0, 10);
    return {
      eyebrow: 'Ocupación', title: 'Cables autorizados vs. detectados', subtitle: `${k.tramosRel} tramos relevados de ${k.tramos}`,
      body: stats([['Autorizados', U.num(k.autRel)], ['Detectados', U.num(k.detRel), 't-crit'], ['Exceso', '+' + U.num(k.exceso)], ['% exceso', U.pct(k.pctExceso, 1)]])
        + section('Por zona', tabla(['Zona', '#Tramos', '#Aut.', '#Det.', '#Exceso', '#%'], zonas.map(r => linkRow(`#/mapa?zona=${r.z.id}`, `<td><b>${U.esc(r.z.nombre)}</b></td><td class="num">${r.rel}</td><td class="num">${r.aut}</td><td class="num">${r.det}</td><td class="num"><b>+${r.exc}</b></td><td class="num">${U.pct(r.pct, 1)}</td>`))))
        + section('Por tipo de infraestructura', tabla(['Tipo', '#Tramos', '#Aut.', '#Det.', '#Exceso', '#%'], tipos.map(x => `<tr><td>${x.tp === 'poste' ? 'Tendido aéreo (postes)' : 'Ducto subterráneo'}</td><td class="num">${x.n}</td><td class="num">${x.aut}</td><td class="num">${x.det}</td><td class="num"><b>+${x.exc}</b></td><td class="num">${pctTxt(x.exc, x.aut)}</td></tr>`)))
        + section('Los 10 tramos con más exceso', tabla(TRAMO_HEADS, top.map(tramoRow)), 'Clic en un tramo para verlo en el mapa.')
        + (k.sinId ? `<p class="callout warn">${U.icon('alert', 15)} ${k.sinId} cables no tienen proveedor identificado y no se pueden cobrar todavía. <a href="#/identificacion" data-close>Ir a identificación →</a></p>` : ''),
      footer: `<a class="btn btn-primary" href="#/mapa" data-close>${U.icon('map', 15)} Ver en el mapa</a>`,
    };
  }

  function recaudacion() {
    const k = Store.kpis(), pc = porProveedorCanon(), zonas = porZona(), p = S().params;
    return {
      eyebrow: 'Recaudación', title: 'Recaudación mensual: actual vs. potencial', subtitle: `Tarifa vigente: ${U.money(p.tarifaCableMetroMes)} por cable·metro·mes + ${U.money(p.tarifaPosteMes)} por poste`,
      body: stats([['Actual / mes', U.moneyShort(k.regularMes)], ['Potencial / mes', U.moneyShort(k.potencialMes)], ['Brecha / mes', U.moneyShort(k.brechaMes), 't-crit'], ['Brecha / año', U.moneyShort(k.brechaMes * 12), 't-crit']])
        + section('Por proveedor', tabla(['Proveedor', '#Actual', '#Potencial', '#Brecha', '#%'], Store.CFG.proveedores.map(pr => { const r = pc[pr.id] || { canon: 0, potencial: 0 }; return linkRow(`#/mapa?prov=${pr.id}`, `<td class="nowrap">${provCell(pr.id)}</td><td class="num">${U.money(r.canon)}</td><td class="num">${U.money(r.potencial)}</td><td class="num t-crit">${U.money(r.potencial - r.canon)}</td><td class="num">${pctTxt(r.potencial - r.canon, r.canon)}</td>`); })))
        + section('Por zona', tabla(['Zona', '#Actual', '#Potencial', '#Brecha'], zonas.map(r => linkRow(`#/mapa?zona=${r.z.id}`, `<td><b>${U.esc(r.z.nombre)}</b></td><td class="num">${U.money(r.canon)}</td><td class="num">${U.money(r.potencial)}</td><td class="num t-crit">${U.money(r.potencial - r.canon)}</td>`))))
        + section('Cómo se calcula', `<ul class="d-list"><li><b>Actual:</b> cables autorizados × largo del tramo × tarifa, más la tarifa por poste ocupado.</li><li><b>Potencial:</b> la misma fórmula aplicada a todos los cables detectados en la calle.</li><li>La brecha es lo que se deja de cobrar <b>cada mes</b> mientras los excesos no se regularizan.</li></ul>`),
      footer: `<a class="btn btn-primary" href="#/cobro" data-close>${U.icon('calc', 15)} Abrir el motor de cobro</a>`,
    };
  }

  function recuperar() {
    const k = Store.kpis(), abiertos = S().expedientes.filter(e => e.abierto);
    const porEtapa = Store.ETAPAS.slice(0, 6).map((n, i) => { const es = abiertos.filter(e => e.etapa === i); return { n, cant: es.length, total: es.reduce((a, e) => a + Store.liquidacion(e).total, 0) }; });
    const top = [...abiertos].sort((a, b) => Store.liquidacion(b).total - Store.liquidacion(a).total).slice(0, 10);
    return {
      eyebrow: 'Deuda', title: 'Monto a recuperar', subtitle: `${abiertos.length} expedientes abiertos`,
      body: stats([['Total', U.moneyShort(k.aRecuperar), 't-crit'], ['Retroactivo', U.moneyShort(k.retro)], ['Intereses', U.moneyShort(k.interes)], ['Multas', U.moneyShort(k.multas)]])
        + section('Por etapa del expediente', tabla(['Etapa', '#Expedientes', '#Monto'], porEtapa.map((r, i) => linkRow('#/expedientes', `<td>${i + 1}. ${r.n}</td><td class="num">${r.cant}</td><td class="num">${U.money(r.total)}</td>`))))
        + section('Por proveedor', tabla(['Proveedor', '#Expedientes', '#Monto'], Store.ranking().sort((a, b) => b.deuda - a.deuda).map(p => linkRow(`#/expedientes?prov=${p.id}`, `<td class="nowrap">${provCell(p.id)}</td><td class="num">${p.expAbiertos}</td><td class="num"><b>${U.money(p.deuda)}</b></td>`))))
        + section('Los 10 expedientes de mayor monto', tabla(EXP_HEADS, top.map(expRow))),
      footer: `<a class="btn btn-primary" href="#/expedientes" data-close>${U.icon('folder', 15)} Ir a expedientes</a>`,
    };
  }

  function recuperado() {
    const cerr = S().expedientes.filter(e => !e.abierto && e.montoCobrado > 0).sort((a, b) => b.fechaCierre.localeCompare(a.fechaCierre));
    const k = Store.kpis(), tot = cerr.reduce((a, e) => a + e.montoCobrado, 0);
    const porRes = {};
    cerr.forEach(e => { const r = porRes[e.resultado] || (porRes[e.resultado] = { n: 0, m: 0 }); r.n++; r.m += e.montoCobrado; });
    return {
      eyebrow: 'Recupero', title: 'Monto recuperado', subtitle: `${cerr.length} expedientes cobrados`,
      body: stats([['Acumulado', U.moneyShort(tot), 't-ok'], ['Este mes', U.moneyShort(k.recuperadoMes)], ['Expedientes', cerr.length], ['Promedio', U.moneyShort(cerr.length ? tot / cerr.length : 0)]])
        + section('Por forma de resolución', tabla(['Resultado', '#Casos', '#Monto'], Object.entries(porRes).map(([r, v]) => `<tr><td>${U.esc(r)}</td><td class="num">${v.n}</td><td class="num">${U.money(v.m)}</td></tr>`)))
        + section('Expedientes cobrados', tabla(['Expediente', 'Proveedor', 'Resultado', 'Cierre', '#Cobrado'], cerr.map(e => linkRow(`#/expedientes?id=${e.id}`, `<td><b>${e.id}</b><br><span class="small muted">${e.tramoId}</span></td><td class="nowrap">${provCell(e.prov)}</td><td class="small">${U.esc(e.resultado)}</td><td>${U.fmtDate(e.fechaCierre)}</td><td class="num"><b>${U.money(e.montoCobrado)}</b></td>`)))),
    };
  }

  function multas() {
    const es = S().expedientes.filter(e => e.multaAplicada).sort((a, b) => (b.abierto - a.abierto) || Store.liquidacion(b).multa - Store.liquidacion(a).multa);
    const tot = es.reduce((a, e) => a + Store.liquidacion(e).multa, 0);
    const cobradas = es.filter(e => !e.abierto);
    return {
      eyebrow: 'Sanciones', title: 'Multas emitidas', subtitle: `Multa vigente: ${U.money(S().params.multaPorCable)} por cable no declarado`,
      body: stats([['Multas', es.length], ['Monto total', U.moneyShort(tot)], ['Cobradas', cobradas.length, 't-ok'], ['Pendientes', es.length - cobradas.length, 't-crit']])
        + section('Detalle', tabla(['Expediente', 'Proveedor', 'Etapa / resultado', 'Plazo', '#Multa'], es.map(e => linkRow(`#/expedientes?id=${e.id}`, `<td><b>${e.id}</b><br><span class="small muted">${e.tramoId}</span></td><td class="nowrap">${provCell(e.prov)}</td><td>${e.abierto ? Store.ETAPAS[e.etapa] : `<span class="muted">${U.esc(e.resultado)}</span>`}</td><td>${ExpedientesView.plazoBadge(e)}</td><td class="num"><b>${U.money(Store.liquidacion(e).multa)}</b></td>`)))),
      footer: `<a class="btn btn-primary" href="#/expedientes" data-close>${U.icon('folder', 15)} Ir a expedientes</a>`,
    };
  }

  function regularizaciones() {
    const es = S().expedientes.filter(e => e.abierto && (e.etapa === 3 || e.regularizacion)).sort((a, b) => (a.vence || '').localeCompare(b.vence || ''));
    const a = S().amnistia;
    return {
      eyebrow: 'Regularización', title: 'Regularizaciones en curso', subtitle: 'Expedientes en plazo de regularización o con declaración jurada presentada',
      body: stats([['En curso', es.length], ['Con DJ', es.filter(e => e.regularizacion).length], ['En plazo', es.filter(e => e.etapa === 3).length], ['Amnistía', a.activa ? 'Vigente' : 'Inactiva', a.activa ? 't-ok' : '']])
        + (a.activa ? `<p class="callout ok">${U.icon('shield', 15)} Régimen de regularización voluntaria vigente hasta el <b>${U.fmtDate(a.hasta)}</b>: quien declare lo instalado paga sólo el retroactivo, sin multa, recargo ni intereses.</p>` : '')
        + section('Expedientes', tabla(EXP_HEADS, es.map(expRow))),
      footer: `<a class="btn btn-primary" href="#/expedientes" data-close>${U.icon('folder', 15)} Ir a expedientes</a>`,
    };
  }

  function estado(e) {
    const ts = S().tramos.filter(t => Store.metrics(t).estado === e).sort((a, b) => (Store.metrics(b).exceso || 0) - (Store.metrics(a).exceso || 0));
    const est = U.ESTADOS[e], zonas = porZona();
    const totalExc = ts.reduce((a, t) => a + (Store.metrics(t).exceso || 0), 0);
    return {
      eyebrow: 'Estado de tramos', title: est.label, subtitle: `${ts.length} tramos · ${U.pct(ts.length / S().tramos.length)} del total`,
      body: stats([['Tramos', ts.length], ['% del total', U.pct(ts.length / S().tramos.length)], ['Cables autorizados', ts.reduce((a, t) => a + Store.metrics(t).aut, 0)], ['Exceso', e === 'sin' ? '—' : '+' + totalExc, e === 'critico' ? 't-crit' : '']])
        + section('Por zona', tabla(['Zona', '#Tramos', '#% de la zona'], zonas.map(r => linkRow(`#/mapa?zona=${r.z.id}&estado=${e}`, `<td><b>${U.esc(r.z.nombre)}</b></td><td class="num">${r.est[e]}</td><td class="num">${U.pct(r.est[e] / r.tramos)}</td>`))))
        + section(`Tramos (${ts.length})`, tabla(TRAMO_HEADS, ts.slice(0, 60).map(tramoRow)), ts.length > 60 ? 'Se muestran los primeros 60. Clic en un tramo para verlo en el mapa.' : 'Clic en un tramo para verlo en el mapa.'),
      footer: `<a class="btn btn-primary" href="#/mapa?estado=${e}" data-close>${U.icon('map', 15)} Ver estos tramos en el mapa</a>`,
    };
  }

  function proveedor(id) {
    const p = Store.prov(id), r = Store.ranking().find(x => x.id === id), pc = porProveedorCanon()[id] || { canon: 0, potencial: 0 };
    const exps = S().expedientes.filter(e => e.prov === id);
    const abiertos = exps.filter(e => e.abierto);
    const tramos = S().tramos.filter(t => t.relevado && Store.ocup(t, id)).map(t => ({ t, o: Store.ocup(t, id) })).filter(x => x.o.detectados > x.o.autorizados).sort((a, b) => (b.o.detectados - b.o.autorizados) - (a.o.detectados - a.o.autorizados));
    return {
      eyebrow: 'Proveedor', title: `<span class="dot big" style="background:${p.color}"></span> ${U.esc(p.nombre)}`, subtitle: `CUIT ${p.cuit} · Permiso marco ${p.permisoMarco} · ${U.esc(p.representante)}`,
      body: stats([['Incumplimiento', U.pct(r.pct, 1), `t-${statusDe(r.pct) === 'ok' ? 'ok' : statusDe(r.pct)}`], ['Cables', `${r.aut} → ${r.det}`], ['Exceso', '+' + r.exc], ['Deuda', U.moneyShort(r.deuda), 't-crit']])
        + stats([['Tramos ocupados', r.tramos], ['Tramos con exceso', r.tramosExc], ['Canon / mes', U.moneyShort(pc.canon)], ['Potencial / mes', U.moneyShort(pc.potencial)]])
        + section('Expedientes por etapa', `<div class="etapa-chips">${Store.ETAPAS.map((n, i) => { const c = i === 6 ? exps.filter(e => !e.abierto).length : abiertos.filter(e => e.etapa === i).length; return `<span class="etapa-chip ${c ? '' : 'zero'}"><b>${c}</b>${n}</span>`; }).join('')}</div>`)
        + section(`Tramos con exceso (${tramos.length})`, tabla(['Tramo', '#Aut.', '#Det.', '#Exceso', 'Expediente'], tramos.map(({ t, o }) => { const e = Store.expedienteDe(t.id, id); return linkRow(`#/mapa?tramo=${t.id}`, `<td><b>${t.id}</b><br><span class="small muted">${U.esc(t.calle)} ${t.altura}</span></td><td class="num">${o.autorizados}</td><td class="num">${o.detectados}</td><td class="num"><b class="t-crit">+${o.detectados - o.autorizados}</b></td><td class="small">${e ? `${e.id}<br>${Store.ETAPAS[e.etapa]}` : '—'}</td>`); }), 'Sin tramos con exceso.'), 'Clic en un tramo para verlo en el mapa.'),
      footer: `<a class="btn" href="#/mapa?prov=${id}" data-close>${U.icon('map', 15)} Ver sus tramos</a><a class="btn btn-primary" href="#/expedientes?prov=${id}" data-close>${U.icon('folder', 15)} Ver sus expedientes</a>`,
    };
  }

  function zona(id) {
    const r = porZona().find(x => x.z.id === id);
    const ts = S().tramos.filter(t => t.zona === id && t.relevado).sort((a, b) => Store.metrics(b).exceso - Store.metrics(a).exceso).slice(0, 15);
    const provs = Store.CFG.proveedores.map(p => {
      let aut = 0, det = 0, n = 0;
      S().tramos.filter(t => t.zona === id && t.relevado).forEach(t => { const o = Store.ocup(t, p.id); if (o) { n++; aut += o.autorizados; det += o.detectados; } });
      return { p, n, aut, det };
    }).filter(x => x.n);
    return {
      eyebrow: 'Zona', title: r.z.nombre, subtitle: `${r.tramos} tramos · ${r.provs.size} proveedores presentes`,
      body: stats([['Exceso', '+' + r.exc, 't-crit'], ['% exceso', U.pct(r.pct, 1)], ['Canon / mes', U.moneyShort(r.canon)], ['Brecha / mes', U.moneyShort(r.potencial - r.canon), 't-crit']])
        + section('Semáforo', `<div class="estado-grid">${['cumple', 'leve', 'critico', 'sin'].map(e => `<div class="estado-card static"><span class="estado-bar" style="background:${U.ESTADOS[e].color}"></span><span class="estado-lbl">${U.ESTADOS[e].label}</span><span class="estado-num">${r.est[e]}</span></div>`).join('')}</div>`)
        + section('Proveedores en la zona', tabla(['Proveedor', '#Tramos', '#Aut.', '#Det.', '#Exceso'], provs.map(x => `<tr><td class="nowrap">${provCell(x.p.id)}</td><td class="num">${x.n}</td><td class="num">${x.aut}</td><td class="num">${x.det}</td><td class="num"><b>+${Math.max(0, x.det - x.aut)}</b></td></tr>`)))
        + section('Tramos con más exceso', tabla(TRAMO_HEADS, ts.map(tramoRow)), 'Clic en un tramo para verlo en el mapa.'),
      footer: `<a class="btn btn-primary" href="#/mapa?zona=${id}" data-close>${U.icon('map', 15)} Ver la zona en el mapa</a>`,
    };
  }

  function mes(i) {
    i = +i;
    const s = serieActual || Store.serieMensual();
    const ref = U.addMonths(S().hoy.slice(0, 8) + '15', -(11 - i)).slice(0, 7);
    const cerr = S().expedientes.filter(e => !e.abierto && (e.fechaCierre || '').startsWith(ref)).sort((a, b) => b.fechaCierre.localeCompare(a.fechaCierre));
    const det = S().expedientes.filter(e => e.fechaDeteccion.startsWith(ref));
    const ant = i > 0 ? s.exceso[i - 1] : null;
    return {
      eyebrow: 'Evolución mensual', title: `Mes de ${s.labels[i]}`, subtitle: i === 11 ? 'Mes en curso (valores en vivo)' : 'Cierre del mes',
      body: stats([['Cables en exceso', U.num(s.exceso[i]), 't-crit'], ['Variación', ant == null ? '—' : `${s.exceso[i] - ant > 0 ? '+' : ''}${s.exceso[i] - ant}`], ['Recuperado', U.moneyShort(s.recuperado[i]), 't-ok'], ['Expedientes nuevos', det.length]])
        + section(`Expedientes cobrados en el mes (${cerr.length})`, tabla(['Expediente', 'Proveedor', 'Resultado', 'Cierre', '#Cobrado'], cerr.map(e => linkRow(`#/expedientes?id=${e.id}`, `<td><b>${e.id}</b><br><span class="small muted">${e.tramoId}</span></td><td class="nowrap">${provCell(e.prov)}</td><td class="small">${U.esc(e.resultado)}</td><td>${U.fmtDate(e.fechaCierre)}</td><td class="num"><b>${U.money(e.montoCobrado)}</b></td>`)), 'No hubo cobros en este mes.'))
        + section(`Expedientes iniciados en el mes (${det.length})`, tabla(EXP_HEADS, det.map(expRow), 'No se iniciaron expedientes en este mes.')),
    };
  }

  /** Informe ejecutivo imprimible (PDF) con los números del tablero */
  function informe() {
    const k = Store.kpis(), rk = Store.ranking(), zonas = porZona(), M = Store.CFG.municipio;
    const doc = `<article class="doc informe">
      <div class="doc-demo">Documento de demostración · datos simulados · sin validez legal</div><header class="doc-head"><div class="doc-escudo">${U.icon('shield', 30)}</div>
        <div><b>${U.esc(M.nombre)}</b><br>${U.esc(M.area)}<br><span class="small">Informe ejecutivo · Ocupación de postes y ductos</span></div>
        <div class="doc-num">Situación al<br><b>${U.fmtDate(S().hoy)}</b></div></header>
      <h3>Resumen</h3>
      <p>El municipio cobra por <b>${U.num(k.autRel)}</b> cables y hay <b>${U.num(k.detRel)}</b> instalados en ${k.tramosRel} tramos relevados: <b>${U.num(k.exceso)} cables en exceso (+${U.pct(k.pctExceso, 1)})</b>.
      La recaudación mensual actual es de <b>${U.money(k.regularMes)}</b> y la potencial de <b>${U.money(k.potencialMes)}</b> (brecha anual de ${U.money(k.brechaMes * 12)}).
      Hay <b>${k.abiertos} expedientes abiertos</b> por <b>${U.money(k.aRecuperar)}</b> a recuperar y ya se recuperaron <b>${U.money(k.recuperado)}</b>.</p>
      <table class="table mini"><tbody>
        <tr><td>Tramos que cumplen / leve / crítico / sin relevar</td><td class="num">${k.est.cumple} / ${k.est.leve} / ${k.est.critico} / ${k.est.sin}</td></tr>
        <tr><td>Multas emitidas</td><td class="num">${k.multasEmitidas} (${U.money(k.montoMultas)})</td></tr>
        <tr><td>Regularizaciones en curso</td><td class="num">${k.enCurso}</td></tr>
        <tr><td>Expedientes con plazo vencido</td><td class="num">${k.vencidos}</td></tr>
      </tbody></table>
      <h3>Ranking de incumplimiento</h3>
      <table class="table mini"><thead><tr><th>Proveedor</th><th class="num">Autoriz.</th><th class="num">Detect.</th><th class="num">Exceso</th><th class="num">%</th><th class="num">Deuda</th></tr></thead>
      <tbody>${rk.map(p => `<tr><td>${U.esc(p.nombre)}</td><td class="num">${p.aut}</td><td class="num">${p.det}</td><td class="num">+${p.exc}</td><td class="num">${U.pct(p.pct, 1)}</td><td class="num">${U.money(p.deuda)}</td></tr>`).join('')}</tbody></table>
      <h3>Situación por zona</h3>
      <table class="table mini"><thead><tr><th>Zona</th><th class="num">Tramos</th><th class="num">Exceso</th><th class="num">Canon / mes</th><th class="num">Brecha / mes</th></tr></thead>
      <tbody>${zonas.map(r => `<tr><td>${U.esc(r.z.nombre)}</td><td class="num">${r.tramos}</td><td class="num">+${r.exc} (${U.pct(r.pct, 1)})</td><td class="num">${U.money(r.canon)}</td><td class="num">${U.money(r.potencial - r.canon)}</td></tr>`).join('')}</tbody></table>
      <p class="small muted">Generado por el sistema de Control de Ocupación de Infraestructura de Cableado · datos simulados de demostración.</p>
    </article>`;
    return {
      eyebrow: 'Exportar', title: 'Informe ejecutivo', subtitle: 'Resumen listo para imprimir o guardar como PDF',
      body: doc,
      footer: `<button class="btn btn-primary" id="inf-print">${U.icon('print', 15)} Imprimir / guardar PDF</button>`,
      onOpen: m => { m.foot.querySelector('#inf-print').onclick = () => U.printHTML(doc); },
    };
  }

  return { render, destroy, refresh: () => root && root.isConnected && render(root), abrir };
})();
