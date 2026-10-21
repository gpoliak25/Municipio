/*
 * 1. DASHBOARD EJECUTIVO
 * Todos los números salen de Store.kpis()/ranking()/serieMensual(), que
 * a su vez se calculan sobre los mismos tramos que muestra el mapa.
 */
const DashboardView = (() => {
  let charts = [];
  let root = null;

  function destroy() { charts.forEach(c => c.destroy()); charts = []; }

  function render(el) {
    root = el;
    destroy();
    const S = Store.state, k = Store.kpis(), rk = Store.ranking(), serie = Store.serieMensual();
    const alertas = Store.alertasPlazos().slice(0, 6);
    const maxDet = Math.max(k.detRel, 1);
    const totalT = k.tramos;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Tablero ejecutivo</h1>
          <p class="muted">${Store.CFG.municipio.nombre} · Situación al ${U.fmtDate(S.hoy)} · ${k.tramos} tramos de postes y ductos</p>
        </div>
        <div class="head-actions"><a class="btn" href="#/mapa">${U.icon('map', 16)} Ver en el mapa</a></div>
      </div>

      <section class="card hero" id="dash-hero">
        <div class="hero-text">
          <span class="eyebrow">Ocupación del espacio público · ${k.tramosRel} tramos relevados</span>
          <h2>El municipio cobra por <strong>${U.num(k.autRel)}</strong> cables y hay <strong class="t-crit">${U.num(k.detRel)}</strong> instalados.</h2>
          <p><b>${U.num(k.exceso)} cables (+${U.pct(k.pctExceso, 1)})</b> ocupan postes y ductos municipales sin pagar.
          Eso son <b>${U.money(k.brechaMes)}</b> por mes que hoy no se recaudan, más <b>${U.moneyShort(k.aRecuperar)}</b> de deuda retroactiva y multas a recuperar.</p>
        </div>
        <div class="hero-bars" role="img" aria-label="Cables autorizados ${k.autRel} contra detectados ${k.detRel}">
          <div class="hbar"><span class="hbar-label">Autorizados (se cobran)</span>
            <div class="hbar-track"><div class="hbar-fill fill-brand" style="width:${(k.autRel / maxDet * 100).toFixed(1)}%"></div></div>
            <span class="hbar-val">${U.num(k.autRel)}</span></div>
          <div class="hbar"><span class="hbar-label">Detectados en la calle</span>
            <div class="hbar-track"><div class="hbar-fill fill-brand" style="width:${(k.autRel / maxDet * 100).toFixed(1)}%"></div><div class="hbar-fill fill-crit" style="width:${(k.exceso / maxDet * 100).toFixed(1)}%"></div></div>
            <span class="hbar-val">${U.num(k.detRel)}</span></div>
          <div class="hbar-legend"><span><i class="sw fill-brand"></i>Cables con permiso</span><span><i class="sw fill-crit"></i>Exceso sin declarar: ${U.num(k.exceso)}</span></div>
        </div>
      </section>

      <section class="kpi-grid" id="dash-kpis">
        <div class="card kpi" id="kpi-recaudacion">
          <div class="kpi-label">${U.icon('money', 16)} Recaudación mensual actual</div>
          <div class="kpi-value">${U.moneyShort(k.regularMes)}</div>
          <div class="kpi-sub">Potencial cobrando todo lo instalado: <b>${U.moneyShort(k.potencialMes)}</b> <span class="delta up">+${U.pct(k.brechaMes / Math.max(k.regularMes, 1), 1)}</span></div>
        </div>
        <div class="card kpi" id="kpi-recuperar">
          <div class="kpi-label">${U.icon('folder', 16)} Monto a recuperar</div>
          <div class="kpi-value">${U.moneyShort(k.aRecuperar)}</div>
          <div class="kpi-sub">Retroactivo ${U.moneyShort(k.retro)} · intereses ${U.moneyShort(k.interes)} · multas ${U.moneyShort(k.multas)} · ${k.abiertos} expedientes</div>
        </div>
        <div class="card kpi" id="kpi-recuperado">
          <div class="kpi-label">${U.icon('check', 16)} Recuperado acumulado</div>
          <div class="kpi-value">${U.moneyShort(k.recuperado)}</div>
          <div class="kpi-sub">${k.regularizados} expedientes cobrados · este mes ${U.moneyShort(k.recuperadoMes)}</div>
        </div>
        <div class="card kpi">
          <div class="kpi-label">${U.icon('alert', 16)} Multas emitidas</div>
          <div class="kpi-value">${k.multasEmitidas}</div>
          <div class="kpi-sub">Por ${U.moneyShort(k.montoMultas)} · ${k.vencidos} expedientes con plazo vencido</div>
        </div>
        <div class="card kpi">
          <div class="kpi-label">${U.icon('clock', 16)} Regularizaciones en curso</div>
          <div class="kpi-value">${k.enCurso}</div>
          <div class="kpi-sub">En plazo o con declaración jurada presentada${S.amnistia.activa ? ` · amnistía vigente hasta ${U.fmtDate(S.amnistia.hasta)}` : ''}</div>
        </div>
      </section>

      <section class="grid-2">
        <div class="card" id="dash-estados">
          <div class="card-head"><h3>Estado de los tramos</h3><span class="muted small">Clic para verlos en el mapa</span></div>
          <div class="stack-bar" role="img" aria-label="Distribución de tramos por estado">
            ${['cumple', 'leve', 'critico', 'sin'].map(e => `<a href="#/mapa?estado=${e}" class="seg" title="${U.ESTADOS[e].label}: ${k.est[e]}" style="width:${(k.est[e] / totalT * 100).toFixed(2)}%;background:${U.ESTADOS[e].color}"></a>`).join('')}
          </div>
          <div class="estado-list">
            ${['cumple', 'leve', 'critico', 'sin'].map(e => `
              <a class="estado-item" href="#/mapa?estado=${e}">
                ${U.badgeEstado(e)}
                <span class="estado-num">${k.est[e]}</span>
                <span class="muted small">${U.pct(k.est[e] / totalT)} de los tramos</span>
              </a>`).join('')}
          </div>
          <p class="muted small mt">Exceso leve: hasta 50 % más cables que los autorizados. Crítico: más del 50 %.</p>
        </div>

        <div class="card" id="dash-ranking">
          <div class="card-head"><h3>Ranking de incumplimiento por proveedor</h3><span class="muted small">% de cables sin permiso</span></div>
          <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Proveedor</th><th class="num">Autoriz.</th><th class="num">Detect.</th><th class="num">Exceso</th><th>Incumplimiento</th><th class="num">Deuda</th></tr></thead>
            <tbody>
              ${rk.map((p, i) => {
                const st = p.pct > 0.3 ? 'crit' : p.pct > 0.1 ? 'warn' : 'ok';
                return `<tr>
                  <td class="nowrap"><span class="rank">${i + 1}</span><span class="dot" style="background:${p.color}"></span>${U.esc(p.corto)}</td>
                  <td class="num">${p.aut}</td><td class="num">${p.det}</td><td class="num"><b>+${p.exc}</b></td>
                  <td><div class="meter"><div class="meter-fill m-${st}" style="width:${Math.min(100, p.pct * 100 / 0.6 * 100 / 100).toFixed(0)}%"></div></div><span class="small">${U.pct(p.pct, 1)}</span></td>
                  <td class="num">${U.moneyShort(p.deuda)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section class="grid-2">
        <div class="card">
          <div class="card-head"><h3>Cables en exceso pendientes de regularizar</h3><span class="muted small">Últimos 12 meses</span></div>
          <div class="chart-box"><canvas id="ch-exceso" aria-label="Evolución mensual de cables en exceso"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Monto recuperado por mes</h3><span class="muted small">Pagos de expedientes cerrados</span></div>
          <div class="chart-box"><canvas id="ch-recuperado" aria-label="Monto recuperado por mes"></canvas></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h3>Alertas de vencimiento de plazos</h3><a class="small" href="#/expedientes">Ver todos los expedientes →</a></div>
        <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Expediente</th><th>Tramo</th><th>Proveedor</th><th>Etapa</th><th>Vence</th><th class="num">Monto</th></tr></thead>
          <tbody>
            ${alertas.map(e => `<tr class="clickable" data-href="#/expedientes?id=${e.id}">
              <td><b>${e.id}</b></td><td>${e.tramoId} · ${U.esc(Store.tramo(e.tramoId).calle)}</td>
              <td>${U.esc(Store.prov(e.prov).corto)}</td><td>${Store.ETAPAS[e.etapa]}</td>
              <td>${ExpedientesView.plazoBadge(e)}</td><td class="num">${U.money(Store.liquidacion(e).total)}</td></tr>`).join('')}
          </tbody>
        </table>
        </div>
      </section>
    `;

    root.querySelectorAll('[data-href]').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    drawCharts(serie);
  }

  function drawCharts(serie) {
    if (!window.Chart) return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = '#5b6675';
    const grid = { color: '#eceef1' };
    const exc = new Chart(root.querySelector('#ch-exceso'), {
      type: 'line',
      data: { labels: serie.labels, datasets: [{ label: 'Cables en exceso', data: serie.exceso, borderColor: '#d03b3b', backgroundColor: 'rgba(208,59,59,.08)', fill: true, borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, tension: 0.3 }] },
      options: {
        maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${U.num(c.parsed.y)} cables en exceso` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid, border: { display: false } } },
      },
    });
    const rec = new Chart(root.querySelector('#ch-recuperado'), {
      type: 'bar',
      data: { labels: serie.labels, datasets: [{ label: 'Recuperado', data: serie.recuperado, backgroundColor: '#1baf7a', borderRadius: 4, maxBarThickness: 28 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${U.money(c.parsed.y)}` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid, border: { display: false }, ticks: { callback: v => U.moneyShort(v) } } },
      },
    });
    charts.push(exc, rec);
  }

  return { render, destroy, refresh: () => root && render(root) };
})();
