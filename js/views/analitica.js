/*
 * 10. ANALÍTICA Y MODELOS
 * Recorre el camino completo con los tramos relevados: estadística descriptiva,
 * inferencia (IC 95 %, t de Welch, chi-cuadrado), regresión lineal múltiple,
 * una red neuronal contra la línea base y, como uso práctico, la priorización
 * de los tramos que todavía no se relevaron.
 */
const AnaliticaView = (() => {
  let root = null, charts = [];
  const cmp = { a: 'CSU', b: 'WFX' };
  const nn = { h: 8, ep: 800, lr: 0.05, res: null, firma: null };

  // ================================================================
  // Estadística (sin dependencias)
  // ================================================================
  const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
  const mean = a => a.length ? sum(a) / a.length : 0;
  const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a, x => (x - m) ** 2) / (a.length - 1)); };
  const quant = (a, p) => { const s = [...a].sort((x, y) => x - y), pos = (s.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };
  const skew = a => { const n = a.length, m = mean(a), s = sd(a); return n < 3 || !s ? 0 : n / ((n - 1) * (n - 2)) * sum(a, x => ((x - m) / s) ** 3); };
  const desc = a => ({ n: a.length, mean: mean(a), med: quant(a, 0.5), sd: sd(a), min: Math.min(...a), q1: quant(a, 0.25), q3: quant(a, 0.75), max: Math.max(...a), skew: skew(a) });
  const corr = (a, b) => { const ma = mean(a), mb = mean(b); let ab = 0, aa = 0, bb = 0; a.forEach((x, i) => { ab += (x - ma) * (b[i] - mb); aa += (x - ma) ** 2; bb += (b[i] - mb) ** 2; }); return ab / (Math.sqrt(aa * bb) || 1); };
  const tr = M => M[0].map((_, j) => M.map(r => r[j]));
  const mm = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  function inv(M) {
    const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(r => r.slice(n));
  }
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015;
    for (let j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function betacf(a, b, x) {
    const FP = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FP) d = FP; d = 1 / d; let h = d;
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  const tTwoP = (t, df) => betai(df / 2, 0.5, df / (df + t * t));
  const tcdf = (t, df) => { const p = 0.5 * tTwoP(t, df); return t > 0 ? 1 - p : p; };
  const tcrit = (df, p = 0.975) => { let lo = 0, hi = 40; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (tcdf(m, df) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
  /** Función gamma incompleta regularizada P(a, x): da la cola de la chi-cuadrado */
  function gammp(a, x) {
    if (x <= 0) return 0;
    const gln = lgamma(a);
    if (x < a + 1) { let ap = a, s = 1 / a, del = s; for (let n = 0; n < 300; n++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-12) break; } return s * Math.exp(-x + a * Math.log(x) - gln); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 300; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  function ols(X, y) {
    const n = y.length, k = X[0].length, Xd = X.map(r => [1, ...r]), Xt = tr(Xd), XtXi = inv(mm(Xt, Xd));
    const b = mm(XtXi, mm(Xt, y.map(v => [v]))).map(r => r[0]);
    const fit = Xd.map(r => r.reduce((s, v, i) => s + v * b[i], 0)), res = y.map((v, i) => v - fit[i]);
    const sse = sum(res, e => e * e), my = mean(y), sst = sum(y, v => (v - my) ** 2), df = n - k - 1, s2 = sse / df;
    const se = b.map((_, i) => Math.sqrt(s2 * XtXi[i][i])), t = b.map((v, i) => v / se[i]), r2 = 1 - sse / (sst || 1);
    return { b, se, t, p: t.map(v => tTwoP(v, df)), r2, r2a: 1 - (1 - r2) * (n - 1) / df, rmse: Math.sqrt(sse / n), res, df, n, pred: x => b[0] + x.reduce((s, v, i) => s + v * b[i + 1], 0) };
  }
  function welch(a, b) {
    const na = a.length, nb = b.length, ma = mean(a), mb = mean(b), va = sd(a) ** 2, vb = sd(b) ** 2;
    const se = Math.sqrt(va / na + vb / nb), t = (ma - mb) / se;
    const df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
    const sp = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2)), tc = tcrit(df);
    return { t, df, p: tTwoP(t, df), d: (ma - mb) / sp, diff: ma - mb, ci: [ma - mb - tc * se, ma - mb + tc * se] };
  }
  const ic95 = a => { const m = mean(a), h = tcrit(a.length - 1) * sd(a) / Math.sqrt(a.length); return [m - h, m + h]; };
  const metr = (pred, y) => { const e = pred.map((p, i) => p - y[i]), my = mean(y); return { rmse: Math.sqrt(mean(e.map(v => v * v))), mae: mean(e.map(Math.abs)), r2: 1 - sum(e, v => v * v) / (sum(y, v => (v - my) ** 2) || 1) }; };
  const fp = p => p < 0.001 ? '< 0,001' : U.num(p, 3);
  const estrellas = p => p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : '';

  // ================================================================
  // Datos
  // ================================================================
  const VARS = [
    ['antiguedad', 'Antigüedad del permiso (años)'],
    ['densidad', 'Densidad urbana (1 a 5)'],
    ['largo', 'Longitud del tramo (m)'],
    ['aut', 'Cables autorizados'],
  ];
  const fila = t => { const m = Store.metrics(t); return { t, antiguedad: t.antiguedad, densidad: t.densidadUrbana, largo: t.largo, aut: m.aut, det: m.det, exc: m.exceso }; };

  /** Tramos relevados y partición 70/30 fija (semilla) con escalado calculado sólo con el entrenamiento */
  function datos() {
    const rows = Store.state.tramos.filter(t => t.relevado).map(fila);
    const r = U.rng(11), idx = rows.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const nTr = Math.round(rows.length * 0.7), trn = idx.slice(0, nTr).map(i => rows[i]), tst = idx.slice(nTr).map(i => rows[i]);
    const fx = a => a.map(q => VARS.map(([k]) => q[k]));
    const Xtr = fx(trn), Xte = fx(tst), ytr = trn.map(q => q.exc), yte = tst.map(q => q.exc);
    const mx = VARS.map((_, j) => mean(Xtr.map(x => x[j]))), sx = VARS.map((_, j) => sd(Xtr.map(x => x[j])) || 1), my = mean(ytr), sy = sd(ytr) || 1;
    const z = X => X.map(x => x.map((v, j) => (v - mx[j]) / sx[j]));
    return { rows, trn, tst, Xtr, Xte, ytr, yte, mx, sx, my, sy, Ztr: z(Xtr), Zte: z(Xte), yzTr: ytr.map(v => (v - my) / sy), yzTe: yte.map(v => (v - my) / sy) };
  }

  /** Exceso de cada proveedor en cada tramo relevado (unidad para comparar proveedores) */
  function ocupaciones() {
    return Store.state.tramos.filter(t => t.relevado).flatMap(t => t.ocupaciones.map(o => ({ prov: o.prov, exc: Math.max(0, o.detectados - o.autorizados) })));
  }

  /** Perceptrón multicapa: una capa oculta tanh, salida lineal, descenso de gradiente por lotes */
  function entrenarRed(D, h, epochs, lr) {
    const r = U.rng(5), d = VARS.length, X = D.Ztr, y = D.yzTr, N = X.length;
    const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const W1 = Array.from({ length: h }, () => Array.from({ length: d }, () => g() * 0.5)), b1 = Array(h).fill(0), W2 = Array.from({ length: h }, () => g() * 0.5);
    let b2 = 0;
    const fwd = x => { const a = W1.map((w, j) => Math.tanh(w.reduce((s, wi, i) => s + wi * x[i], b1[j]))); return { a, o: a.reduce((s, aj, j) => s + aj * W2[j], b2) }; };
    const mse = (XX, yy) => mean(XX.map((x, i) => (fwd(x).o - yy[i]) ** 2));
    const hist = { ep: [], tr: [], te: [] };
    for (let ep = 0; ep < epochs; ep++) {
      const gW1 = W1.map(w => w.map(() => 0)), gb1 = Array(h).fill(0), gW2 = Array(h).fill(0); let gb2 = 0;
      for (let n = 0; n < N; n++) {
        const x = X[n], f = fwd(x), e = f.o - y[n];
        gb2 += 2 * e;
        for (let j = 0; j < h; j++) { gW2[j] += 2 * e * f.a[j]; const dz = 2 * e * W2[j] * (1 - f.a[j] ** 2); gb1[j] += dz; for (let i = 0; i < d; i++) gW1[j][i] += dz * x[i]; }
      }
      b2 -= lr * gb2 / N;
      for (let j = 0; j < h; j++) { W2[j] -= lr * gW2[j] / N; b1[j] -= lr * gb1[j] / N; for (let i = 0; i < d; i++) W1[j][i] -= lr * gW1[j][i] / N; }
      if (ep % 10 === 0 || ep === epochs - 1) { hist.ep.push(ep + 1); hist.tr.push(mse(X, y)); hist.te.push(mse(D.Zte, D.yzTe)); }
    }
    const pred = D.Zte.map(x => fwd(x).o * D.sy + D.my);
    return { hist, m: metr(pred, D.yte), h, epochs, lr };
  }

  // ================================================================
  // Gráficos
  // ================================================================
  const GRID = { color: '#eceff3' };
  function barras(id, labels, data, color, titulo) {
    const el = root.querySelector('#' + id); if (!el || !window.Chart) return;
    charts.push(new Chart(el, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 4, maxBarThickness: 46 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => `${titulo}: ${c[0].label}`, label: c => `${c.parsed.y} tramos` } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: GRID, border: { display: false } } } },
    }));
  }

  /** Diagrama de caja por grupo (SVG): caja Q1–Q3, mediana, bigotes mín–máx y media */
  function boxSVG(groups) {
    const W = 540, H = 230, L = 34, B = 30, T = 12, mx = Math.max(...groups.map(g => g.max), 1) + 0.5;
    const Y = v => T + (H - T - B) * (1 - v / mx), bw = (W - L - 10) / groups.length;
    let s = `<svg class="boxplot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagrama de caja del exceso por proveedor">`;
    const paso = mx > 8 ? 2 : 1;
    for (let v = 0; v <= Math.floor(mx); v += paso) s += `<line x1="${L}" x2="${W - 6}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eceff3"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    groups.forEach((g, i) => {
      const cx = L + i * bw + bw / 2, w = bw * 0.42;
      s += `<g><title>${U.esc(g.name)}: n ${g.n} · media ${U.num(g.mean, 2)} · mediana ${U.num(g.med, 1)} · Q1 ${U.num(g.q1, 1)} · Q3 ${U.num(g.q3, 1)} · máx ${g.max}</title>
        <line x1="${cx}" x2="${cx}" y1="${Y(g.min)}" y2="${Y(g.max)}" stroke="#8f96a0" stroke-width="1.5"/>
        <line x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${Y(g.max)}" y2="${Y(g.max)}" stroke="#8f96a0" stroke-width="1.5"/>
        <rect x="${cx - w / 2}" y="${Y(g.q3)}" width="${w}" height="${Math.max(2, Y(g.q1) - Y(g.q3))}" fill="${g.color}" opacity=".8" rx="3"/>
        <line x1="${cx - w / 2}" x2="${cx + w / 2}" y1="${Y(g.med)}" y2="${Y(g.med)}" stroke="#fff" stroke-width="2.5"/>
        <circle cx="${cx}" cy="${Y(g.mean)}" r="4.5" fill="#17212e" stroke="#fff" stroke-width="1.5"/>
        <text x="${cx}" y="${H - 10}" text-anchor="middle">${U.esc(g.name)}</text></g>`;
    });
    return s + '</svg>';
  }

  const heat = r => `<td class="num" style="background:rgba(42,120,214,${(Math.abs(r) * 0.75).toFixed(2)});color:${Math.abs(r) > 0.55 ? '#fff' : 'inherit'}">${U.num(r, 2)}</td>`;

  // ================================================================
  // Render
  // ================================================================
  function destroy() { charts.forEach(c => c.destroy()); charts = []; }

  function render(el) {
    root = el;
    destroy();
    const D = datos(), rows = D.rows, N = rows.length, ex = rows.map(q => q.exc);
    const firma = rows.map(q => q.t.id + ':' + q.exc + ':' + q.aut).join('|');
    if (nn.firma !== firma) nn.res = null;              // si cambiaron los datos, el modelo queda desactualizado
    nn.firma = firma;
    const provs = Store.CFG.proveedores;

    // Descriptiva
    const vars = [['Exceso (cables)', ex], ...VARS.map(([k, l]) => [l, rows.map(q => q[k])]), ['Cables detectados', rows.map(q => q.det)]];
    const hist = Array(8).fill(0); ex.forEach(v => hist[Math.min(7, v)]++);
    const ocs = ocupaciones();
    const grp = provs.map(p => { const a = ocs.filter(o => o.prov === p.id).map(o => o.exc); return { id: p.id, name: p.corto, color: p.color, a, ...desc(a) }; });
    const hv = [...VARS, ['exc', 'Exceso']];
    const sk = skew(ex);

    // Inferencial
    if (!cmp.b || cmp.a === cmp.b) cmp.b = provs.find(p => p.id !== cmp.a).id;
    const gA = grp.find(g => g.id === cmp.a), gB = grp.find(g => g.id === cmp.b), w = welch(gA.a, gB.a);
    const obs = grp.map(g => [g.a.filter(v => v === 0).length, g.a.filter(v => v > 0).length]);
    const col = [sum(obs, o => o[0]), sum(obs, o => o[1])], tn = col[0] + col[1];
    let chi = 0; obs.forEach(o => { const rn = o[0] + o[1]; [0, 1].forEach(j => { const e = rn * col[j] / tn; chi += (o[j] - e) ** 2 / e; }); });
    const glChi = provs.length - 1, pChi = 1 - gammp(glChi / 2, chi / 2), cramer = Math.sqrt(chi / tn);

    // Regresión con todos los relevados
    const X = rows.map(q => VARS.map(([k]) => q[k])), fit = ols(X, ex), sy = sd(ex);
    const R = VARS.map((_, a) => VARS.map((_, b) => corr(X.map(x => x[a]), X.map(x => x[b])))), Ri = inv(R);
    const rc = Array(9).fill(0); fit.res.forEach(e => rc[U.clamp(Math.floor(e + 4), 0, 8)]++);
    const signif = VARS.filter((_, j) => fit.p[j + 1] < 0.05).map(([, l]) => l.split(' (')[0].toLowerCase());

    // Modelos sobre la partición
    const base = metr(D.yte.map(() => D.my), D.yte), ofit = ols(D.Xtr, D.ytr), om = metr(D.Xte.map(x => ofit.pred(x)), D.yte);
    const modelos = [['Línea base (predecir siempre la media)', base], ['Regresión lineal múltiple', om]];
    if (nn.res) modelos.push([`Red neuronal (${nn.res.h} neuronas, ${nn.res.epochs} épocas)`, nn.res.m]);
    const mejor = modelos.slice().sort((a, b) => a[1].rmse - b[1].rmse)[0];

    // Priorización de tramos sin relevar
    const sinRel = Store.state.tramos.filter(t => !t.relevado).map(t => {
      const q = fila(t);
      return { t, q, p: Math.max(0, fit.pred(VARS.map(([k]) => q[k]))) };
    }).sort((a, b) => b.p - a.p);
    const prio = p => p >= 2.5 ? ['Alta', 'b-crit'] : p >= 1 ? ['Media', 'b-warn'] : ['Baja', 'b-ok'];

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Analítica y modelos</h1>
        <p class="muted">La estadística descriptiva es el punto de partida de la inferencia y del aprendizaje automático. Acá se recorre todo el camino con los ${N} tramos relevados.</p></div>
      </div>
      <div class="callout info">${U.icon('alert', 16)}<div><b>Cómo se conecta.</b> Los resúmenes (media, desvío, cuartiles, correlaciones) definen qué transformar, qué supuestos revisar y contra qué comparar. Los mismos estadísticos se convierten en errores estándar e intervalos en la inferencia, y en escalado, línea base y métricas en el aprendizaje automático.</div></div>

      <section class="kpi-grid kpi-4 an-kpis">
        <div class="card kpi"><div class="kpi-label">${U.icon('scan', 16)} Tramos analizados</div><div class="kpi-value">${N}</div><div class="kpi-sub">${sinRel.length} sin relevar quedan para el modelo</div></div>
        <div class="card kpi"><div class="kpi-label">${U.icon('chart', 16)} Exceso medio por tramo</div><div class="kpi-value">${U.num(mean(ex), 2)}</div><div class="kpi-sub">IC 95 %: ${U.num(ic95(ex)[0], 2)} a ${U.num(ic95(ex)[1], 2)} cables</div></div>
        <div class="card kpi"><div class="kpi-label">${U.icon('layers', 16)} Regresión: R² ajustado</div><div class="kpi-value">${U.num(fit.r2a, 2)}</div><div class="kpi-sub">${signif.length ? 'Explican: ' + signif.join(', ') : 'Ninguna variable significativa'}</div></div>
        <div class="card kpi"><div class="kpi-label">${U.icon('check', 16)} Mejor modelo en prueba</div><div class="kpi-value an-kpi-txt">${mejor[0].split(' (')[0]}</div><div class="kpi-sub">RMSE ${U.num(mejor[1].rmse, 2)} vs. ${U.num(base.rmse, 2)} de la línea base</div></div>
      </section>

      <h2 class="an-sec"><span>1</span> Estadística descriptiva</h2>
      <div class="card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Variable</th><th class="num">n</th><th class="num">Media</th><th class="num">Mediana</th><th class="num">Desvío</th><th class="num">Mín</th><th class="num">Q1</th><th class="num">Q3</th><th class="num">Máx</th><th class="num">Asimetría</th></tr></thead>
        <tbody>${vars.map(([n, a]) => { const d = desc(a); return `<tr><td class="nowrap">${n}</td><td class="num">${d.n}</td><td class="num">${U.num(d.mean, 2)}</td><td class="num">${U.num(d.med, 1)}</td><td class="num">${U.num(d.sd, 2)}</td><td class="num">${U.num(d.min)}</td><td class="num">${U.num(d.q1, 1)}</td><td class="num">${U.num(d.q3, 1)}</td><td class="num">${U.num(d.max)}</td><td class="num">${U.num(d.skew, 2)}</td></tr>`; }).join('')}</tbody>
      </table></div></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h3>Distribución del exceso</h3><span class="muted small">Tramos por cables de más (7 = 7 o más)</span></div>
          <div class="chart-box"><canvas id="an-hist" aria-label="Histograma del exceso por tramo"></canvas></div>
          <p class="muted small">Asimetría ${U.num(sk, 2)}: ${sk > 0.5 ? 'cola a la derecha, pocos tramos concentran los excesos grandes.' : 'distribución bastante simétrica.'}</p></div>
        <div class="card"><div class="card-head"><h3>Magnitud del exceso por proveedor</h3><span class="muted small">Caja Q1–Q3 · línea: mediana · punto: media</span></div>
          ${boxSVG(grp.map(g => ({ ...g, ...desc(g.a.filter(v => v > 0).concat(g.a.some(v => v > 0) ? [] : [0])) })))}<p class="muted small">Cables de más en los tramos donde cada proveedor incumple. Pasá el mouse por una caja para ver sus valores.</p></div>
      </div>
      <div class="card"><div class="card-head"><h3>Matriz de correlaciones</h3><span class="muted small">Coeficiente de Pearson</span></div>
        <div class="table-wrap"><table class="table heat-table"><thead><tr><th></th>${hv.map(([, l]) => `<th class="num">${l.split(' (')[0]}</th>`).join('')}</tr></thead>
        <tbody>${hv.map(([a, la]) => `<tr><td class="nowrap"><b>${la.split(' (')[0]}</b></td>${hv.map(([b]) => heat(corr(rows.map(q => a === 'exc' ? q.exc : q[a]), rows.map(q => b === 'exc' ? q.exc : q[b])))).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="muted small">Cuanto más intenso el color, más fuerte la relación lineal. La última fila muestra con qué se asocia el exceso.</p></div>

      <h2 class="an-sec"><span>2</span> Estadística inferencial</h2>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h3>Intervalos de confianza del 95 %</h3><span class="muted small">Exceso medio por proveedor y tramo, en cables</span></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Grupo</th><th class="num">n</th><th class="num">Media</th><th class="num">Desvío</th><th class="num">IC 95 %</th></tr></thead>
          <tbody><tr class="total"><td>Todos</td><td class="num">${ocs.length}</td><td class="num">${U.num(mean(ocs.map(o => o.exc)), 2)}</td><td class="num">${U.num(sd(ocs.map(o => o.exc)), 2)}</td><td class="num nowrap">${ic95(ocs.map(o => o.exc)).map(v => U.num(v, 2)).join(' a ')}</td></tr>
          ${grp.map(g => `<tr><td class="nowrap"><i class="dot" style="background:${g.color}"></i>${U.esc(g.name)}</td><td class="num">${g.n}</td><td class="num">${U.num(g.mean, 2)}</td><td class="num">${U.num(g.sd, 2)}</td><td class="num nowrap">${ic95(g.a).map(v => U.num(v, 2)).join(' a ')}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>Comparar dos proveedores</h3><span class="muted small">Prueba t de Welch</span></div>
          <div class="an-sel">
            <label class="field"><span>Proveedor A</span><select id="an-a">${provs.map(p => `<option value="${p.id}" ${p.id === cmp.a ? 'selected' : ''}>${U.esc(p.corto)}</option>`).join('')}</select></label>
            <label class="field"><span>Proveedor B</span><select id="an-b">${provs.filter(p => p.id !== cmp.a).map(p => `<option value="${p.id}" ${p.id === cmp.b ? 'selected' : ''}>${U.esc(p.corto)}</option>`).join('')}</select></label>
          </div>
          <dl class="an-kv">
            <dt>Diferencia de medias</dt><dd>${U.num(w.diff, 2)} cables</dd>
            <dt>IC 95 % de la diferencia</dt><dd>${U.num(w.ci[0], 2)} a ${U.num(w.ci[1], 2)}</dd>
            <dt>Estadístico t (gl)</dt><dd>${U.num(w.t, 2)} (${U.num(w.df, 1)})</dd>
            <dt>Valor p</dt><dd>${fp(w.p)}</dd>
            <dt>d de Cohen</dt><dd>${U.num(w.d, 2)}</dd>
          </dl>
          <div class="callout ${w.p < 0.05 ? 'warn' : 'ok'}">${U.icon(w.p < 0.05 ? 'alert' : 'check', 16)}<div>${w.p < 0.05 ? `La diferencia es estadísticamente significativa al 5 %: ${U.esc(w.diff > 0 ? gA.name : gB.name)} excede más.` : 'No hay evidencia suficiente de diferencia al 5 %.'} Tamaño del efecto ${Math.abs(w.d) < 0.3 ? 'pequeño' : Math.abs(w.d) < 0.6 ? 'moderado' : 'grande'}: reportarlo evita confundir significancia con importancia práctica.</div></div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Independencia entre proveedor y cumplimiento</h3><span class="muted small">Prueba chi-cuadrado</span></div>
        <div class="an-chi">
          <div class="table-wrap"><table class="table"><thead><tr><th>Proveedor</th><th class="num">Cumple</th><th class="num">Con exceso</th><th class="num">% con exceso</th></tr></thead>
          <tbody>${grp.map((g, i) => `<tr><td class="nowrap"><i class="dot" style="background:${g.color}"></i>${U.esc(g.name)}</td><td class="num">${obs[i][0]}</td><td class="num">${obs[i][1]}</td><td class="num">${U.pct(obs[i][1] / Math.max(1, obs[i][0] + obs[i][1]), 1)}</td></tr>`).join('')}</tbody></table></div>
          <div><dl class="an-kv"><dt>χ²</dt><dd>${U.num(chi, 2)}</dd><dt>Grados de libertad</dt><dd>${glChi}</dd><dt>Valor p</dt><dd>${fp(pChi)}</dd><dt>V de Cramér</dt><dd>${U.num(cramer, 2)}</dd></dl>
          <p class="muted small">${pChi < 0.05 ? 'El cumplimiento <b>no es independiente</b> del proveedor: algunos incumplen sistemáticamente más que otros.' : 'No se detecta asociación entre proveedor y cumplimiento.'}</p></div>
        </div></div>

      <h2 class="an-sec"><span>3</span> Regresión lineal múltiple</h2>
      <div class="card"><p class="muted small an-top">Variable explicada: exceso del tramo, en cables. n = ${fit.n} · R² = ${U.num(fit.r2, 3)} · R² ajustado = ${U.num(fit.r2a, 3)} · RMSE = ${U.num(fit.rmse, 2)} cables.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Variable</th><th class="num">Coeficiente</th><th class="num">Error estándar</th><th class="num">t</th><th class="num">Valor p</th><th class="num">Beta estandarizado</th><th class="num">VIF</th></tr></thead>
        <tbody><tr><td>Constante</td><td class="num">${U.num(fit.b[0], 3)}</td><td class="num">${U.num(fit.se[0], 3)}</td><td class="num">${U.num(fit.t[0], 2)}</td><td class="num">${fp(fit.p[0])}</td><td class="num">—</td><td class="num">—</td></tr>
        ${VARS.map(([, l], j) => `<tr class="${fit.p[j + 1] < 0.05 ? 'an-sig' : ''}"><td class="nowrap">${l}</td><td class="num">${U.num(fit.b[j + 1], 3)}</td><td class="num">${U.num(fit.se[j + 1], 3)}</td><td class="num">${U.num(fit.t[j + 1], 2)}</td><td class="num">${fp(fit.p[j + 1])} <b>${estrellas(fit.p[j + 1])}</b></td><td class="num">${U.num(fit.b[j + 1] * sd(X.map(x => x[j])) / sy, 2)}</td><td class="num">${U.num(Ri[j][j], 2)}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">* p &lt; 0,05 · ** p &lt; 0,01 · *** p &lt; 0,001. Las filas resaltadas son significativas.</p>
        <div class="grid-2 an-res">
          <div><h4>Residuos <span class="muted small">media ${U.num(mean(fit.res), 3)} · desvío ${U.num(sd(fit.res), 2)}</span></h4><div class="chart-box short"><canvas id="an-res" aria-label="Histograma de residuos"></canvas></div></div>
          <div class="callout info">${U.icon('alert', 16)}<div>Los VIF cercanos a 1 indican que no hay multicolinealidad. Los residuos deberían centrarse en cero y repartirse sin patrón: es estadística descriptiva aplicada al error del modelo. Los betas estandarizados permiten comparar el peso de variables con escalas distintas.</div></div>
        </div></div>

      <h2 class="an-sec"><span>4</span> Aprendizaje automático: red neuronal contra línea base</h2>
      <div class="card"><p class="muted small an-top">Partición 70 % entrenamiento (${D.trn.length}) y 30 % prueba (${D.tst.length}). El escalado usa sólo la media y el desvío del entrenamiento: ${VARS.map(([, l], j) => `${l.split(' (')[0]} ${U.num(D.mx[j], 1)} ± ${U.num(D.sx[j], 1)}`).join(' · ')}. Calcularlos con todos los datos filtraría información de la prueba.</p>
        <div class="an-sel">
          <label class="field"><span>Neuronas ocultas</span><select id="nn-h">${[4, 8, 16].map(v => `<option ${v === nn.h ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Épocas</span><select id="nn-ep">${[300, 800, 1500].map(v => `<option ${v === nn.ep ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Tasa de aprendizaje</span><select id="nn-lr">${[0.02, 0.05, 0.1].map(v => `<option value="${v}" ${v === nn.lr ? 'selected' : ''}>${U.num(v, 2)}</option>`).join('')}</select></label>
          <button class="btn btn-primary" id="nn-train">${U.icon('play', 15)} ${nn.res ? 'Volver a entrenar' : 'Entrenar red neuronal'}</button>
        </div>
        <div class="grid-2 an-res">
          <div>${nn.res ? `<h4>Curva de aprendizaje <span class="muted small">error cuadrático medio (escala estandarizada)</span></h4><div class="chart-box short"><canvas id="an-loss" aria-label="Curva de aprendizaje"></canvas></div>`
            : `<div class="an-empty">${U.icon('chart', 28)}<p>Entrená la red para ver la curva de aprendizaje y comparar su error con la regresión y la línea base.</p></div>`}</div>
          <div><div class="table-wrap"><table class="table"><thead><tr><th>Modelo</th><th class="num">RMSE</th><th class="num">MAE</th><th class="num">R²</th></tr></thead>
            <tbody>${modelos.map(([n, m]) => `<tr class="${n === mejor[0] ? 'an-sig' : ''}"><td>${n}</td><td class="num">${U.num(m.rmse, 3)}</td><td class="num">${U.num(m.mae, 3)}</td><td class="num">${U.num(m.r2, 3)}</td></tr>`).join('')}</tbody></table></div>
            <p class="muted small">Métricas sobre el 30 % de prueba, que el modelo no vio al entrenar.</p>
            <div class="callout ${mejor[1].rmse < base.rmse ? 'ok' : 'warn'}">${U.icon('check', 16)}<div>Menor error en prueba: <b>${mejor[0]}</b>${mejor[1].rmse < base.rmse ? `, que mejora la línea base un ${U.pct(1 - mejor[1].rmse / base.rmse, 0)} en RMSE` : ', sin mejorar la línea base'}. Un modelo sólo aporta si le gana a predecir siempre el promedio.</div></div></div>
        </div></div>

      <h2 class="an-sec"><span>5</span> Uso práctico: priorizar relevamientos</h2>
      <div class="card"><div class="card-head"><h3>Tramos sin relevar ordenados por exceso previsto</h3><span class="muted small">Estimado con la regresión sobre los tramos relevados</span></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Tramo</th><th>Calle</th><th>Zona</th><th>Proveedores</th><th class="num">Antigüedad</th><th class="num">Densidad</th><th class="num">Exceso previsto</th><th>Prioridad</th><th></th></tr></thead>
          <tbody>${sinRel.map(({ t, q, p }) => { const [pl, pc] = prio(p); return `<tr><td class="nowrap"><b>${t.id}</b></td><td>${U.esc(t.calle)} ${U.esc(t.altura || '')}</td><td>${U.esc(Store.zona(t.zona).nombre)}</td><td>${t.ocupaciones.map(o => U.esc(Store.prov(o.prov).corto)).join(', ')}</td><td class="num nowrap">${q.antiguedad} ${q.antiguedad === 1 ? 'año' : 'años'}</td><td class="num">${q.densidad}</td><td class="num"><b>${U.num(p, 1)}</b></td><td><span class="badge ${pc}">${pl}</span></td><td class="nowrap"><a class="btn btn-sm" href="#/relevamiento?tramo=${t.id}">${U.icon('camera', 14)} Relevar</a></td></tr>`; }).join('') || '<tr><td colspan="9" class="muted">Todos los tramos ya fueron relevados.</td></tr>'}</tbody>
        </table></div>
        <p class="muted small">Sirve para decidir el orden de inspección, no para sancionar: toda sanción requiere el relevamiento y la validación del inspector.</p></div>`;

    barras('an-hist', ['0', '1', '2', '3', '4', '5', '6', '7+'], hist, '#2a78d6', 'Cables de más');
    barras('an-res', ['≤ −3', '−3 a −2', '−2 a −1', '−1 a 0', '0 a 1', '1 a 2', '2 a 3', '3 a 4', '≥ 4'], rc, '#eb6834', 'Residuo');
    if (nn.res && window.Chart) {
      charts.push(new Chart(root.querySelector('#an-loss'), {
        type: 'line',
        data: { labels: nn.res.hist.ep, datasets: [
          { label: 'Entrenamiento', data: nn.res.hist.tr, borderColor: '#2a78d6', borderWidth: 2, pointRadius: 0, tension: 0.2 },
          { label: 'Prueba', data: nn.res.hist.te, borderColor: '#eb6834', borderWidth: 2, pointRadius: 0, tension: 0.2 },
        ] },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { title: c => `Época ${c[0].label}`, label: c => `${c.dataset.label}: ${U.num(c.parsed.y, 3)}` } } },
          scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: GRID, border: { display: false } } } },
      }));
    }

    root.querySelector('#an-a').onchange = e => { cmp.a = e.target.value; if (cmp.b === cmp.a) cmp.b = null; render(root); };
    root.querySelector('#an-b').onchange = e => { cmp.b = e.target.value; render(root); };
    ['h', 'ep', 'lr'].forEach(k => { root.querySelector('#nn-' + k).onchange = e => { nn[k] = +e.target.value; }; });
    root.querySelector('#nn-train').onclick = e => {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = 'Entrenando…';
      setTimeout(() => {                                     // deja pintar el estado antes del cálculo
        nn.res = entrenarRed(datos(), nn.h, nn.ep, nn.lr);
        render(root);
        U.toast(`Red entrenada: RMSE en prueba ${U.num(nn.res.m.rmse, 2)} cables.`, 'ok');
      }, 30);
    };
  }

  return { render, destroy, refresh: () => root && root.isConnected && render(root) };
})();
