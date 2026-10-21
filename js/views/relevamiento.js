/*
 * 3. RELEVAMIENTO Y CONTEO CON VISIÓN POR COMPUTADORA (simulado)
 * El inspector sube una foto/video georreferenciado; el "modelo" marca
 * cada cable con un recuadro, los cuenta y reporta su confianza; el
 * inspector confirma o corrige y queda la evidencia sellada con hash.
 */
const RelevamientoView = (() => {
  let root = null;
  // Estado local de la captura en curso
  let st = null;

  function nuevoEstado(tramoId) {
    const t = Store.tramo(tramoId);
    const m = Store.metrics(t);
    // "Verdad de campo" de la foto: lo instalado. Para un tramo sin relevar se simula.
    const real = t.relevado ? m.det : m.aut + Math.floor(Math.random() * 4);
    return { tramoId, real, fuente: null, fileURL: null, fileName: null, esVideo: false, fase: 'captura', ia: null, conf: null, boxes: [], ev: null, meta: null };
  }

  function render(el, params = {}) {
    root = el;
    const id = params.tramo || st?.tramoId || Store.CFG.casoDestacado.tramoId;
    if (!st || st.tramoId !== id) st = nuevoEstado(id);
    const tramos = [...Store.state.tramos].sort((a, b) => a.id.localeCompare(b.id));

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Relevamiento con visión por computadora</h1>
        <p class="muted">Captura georreferenciada, conteo automático de cables y validación del inspector. Cada relevamiento queda como evidencia con fecha, hora, coordenadas y huella digital.</p></div>
      </div>
      <div class="rel-layout">
        <div class="col">
          <div class="card">
            <div class="card-head"><h3><span class="step-n">1</span> Captura en campo</h3></div>
            <div class="form-row">
              <label class="field grow"><span>Tramo / poste</span>
                <select id="r-tramo">${tramos.map(t => { const m = Store.metrics(t); return `<option value="${t.id}" ${t.id === st.tramoId ? 'selected' : ''}>${t.id} · ${U.esc(t.calle)} ${t.altura} — ${U.ESTADOS[m.estado].label}</option>`; }).join('')}</select></label>
            </div>
            <div class="btn-row">
              <button class="btn btn-primary" id="r-muestra">${U.icon('camera', 16)} Tomar foto de muestra</button>
              <label class="btn">${U.icon('upload', 16)} Subir foto o video<input type="file" id="r-file" accept="image/*,video/*" hidden></label>
            </div>
            <div class="stage" id="rel-stage"></div>
            <div class="meta-row" id="r-meta"></div>
            <div class="btn-row mt">
              <button class="btn btn-accent" id="r-detectar">${U.icon('scan', 16)} Ejecutar detección automática</button>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card" id="rel-resultado"></div>
          <div class="card" id="rel-validacion"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Evidencias registradas</h3><span class="muted small">Registro inalterable: cada evidencia incluye su huella digital (hash)</span></div>
        <div class="table-wrap" id="r-evid"></div>
      </div>`;

    root.querySelector('#r-tramo').onchange = e => { st = nuevoEstado(e.target.value); renderAll(); };
    root.querySelector('#r-muestra').onclick = () => cargarMuestra();
    root.querySelector('#r-file').onchange = e => { const f = e.target.files[0]; if (f) cargarArchivo(f); };
    root.querySelector('#r-detectar').onclick = () => runDetection();
    renderAll();
  }

  function renderAll() { renderStage(); renderMeta(); renderResultado(); renderValidacion(); renderEvidencias(); }

  function renderStage(boxesVisibles = st.fase === 'resultado' || st.fase === 'validado' ? st.boxes.length : 0) {
    const stage = root.querySelector('#rel-stage');
    if (!stage) return;
    if (!st.fuente) {
      stage.innerHTML = `<div class="stage-empty">${U.icon('camera', 34)}<b>Sin imagen cargada</b><span>Tome una foto de muestra del poste o suba una propia (foto o video).</span></div>`;
      return;
    }
    let media;
    if (st.fuente === 'muestra') media = U.posteSVG(Store.tramo(st.tramoId).fotoSeed, st.real).svg;
    else if (st.esVideo) media = `<video src="${st.fileURL}" muted autoplay loop playsinline></video>`;
    else media = `<img src="${st.fileURL}" alt="Imagen subida">`;
    const boxes = st.boxes.slice(0, boxesVisibles).map((b, i) => `
      <g class="det-box" style="animation-delay:${0}ms">
        <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3"/>
        <text x="${b.x + 2}" y="${b.y - 3}">cable ${i + 1} · ${b.c.toFixed(2)}</text>
      </g>`).join('');
    stage.innerHTML = `
      <div class="stage-media">${media}</div>
      <svg class="stage-overlay" viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice">${boxes}</svg>
      ${st.fase === 'analizando' ? '<div class="scanline"></div><div class="stage-status">Analizando imagen · modelo de detección de cables v2.3…</div>' : ''}
      ${st.fase === 'resultado' || st.fase === 'validado' ? `<div class="stage-count">${st.ia} cables</div>` : ''}
      <div class="stage-gps">${U.icon('pin', 13)} ${st.meta.lat.toFixed(6)}, ${st.meta.lng.toFixed(6)} · ${U.fmtDate(st.meta.fecha)} ${st.meta.hora}</div>`;
  }

  function renderMeta() {
    const el = root.querySelector('#r-meta');
    if (!el) return;
    const t = Store.tramo(st.tramoId);
    el.innerHTML = st.meta ? `
      <span>${U.icon('pin', 14)} GPS ${st.meta.lat.toFixed(6)}, ${st.meta.lng.toFixed(6)} (±3 m)</span>
      <span>${U.icon('clock', 14)} ${U.fmtDate(st.meta.fecha)} ${st.meta.hora}</span>
      <span>${U.icon('file', 14)} ${U.esc(st.fileName)}</span>
      <span>${U.icon('user', 14)} ${U.esc(Store.usuarioActual())} · Tablet municipal T-07</span>`
      : `<span class="muted">Tramo ${t.id}: ${U.esc(t.calle)} ${t.altura} · ${t.ocupaciones.length} proveedor(es) con permiso · ${Store.metrics(t).aut} cables autorizados</span>`;
  }

  function capturaMeta(fileName) {
    const [lat, lng] = Store.midpoint(Store.tramo(st.tramoId));
    st.meta = { lat: lat + (Math.random() - 0.5) * 0.00003, lng: lng + (Math.random() - 0.5) * 0.00003, fecha: Store.state.hoy, hora: U.nowTime() };
    st.fileName = fileName;
  }

  /** Carga la foto de muestra del poste (también la usa la demo guiada) */
  function cargarMuestra() {
    st = { ...nuevoEstado(st.tramoId), real: st.real };
    st.fuente = 'muestra';
    capturaMeta(`IMG_${Store.state.hoy.replace(/-/g, '')}_${Math.floor(1000 + Math.random() * 9000)}.jpg`);
    renderAll();
  }
  function cargarArchivo(f) {
    st = { ...nuevoEstado(st.tramoId), real: st.real };
    st.fuente = 'archivo';
    st.esVideo = f.type.startsWith('video');
    st.fileURL = URL.createObjectURL(f);
    capturaMeta(f.name);
    renderAll();
  }

  /** Simula la inferencia del modelo: recuadros, conteo y confianza */
  async function runDetection() {
    if (!st.fuente) cargarMuestra();
    if (st.fase === 'analizando') return;
    const destacado = st.tramoId === Store.CFG.casoDestacado.tramoId;
    // El modelo puede equivocarse por ±1 cable (para mostrar la corrección del inspector)
    let ia = st.real;
    if (!destacado && Math.random() < 0.3) ia = Math.max(1, st.real + (Math.random() < 0.5 ? -1 : 1));
    const conf = destacado ? 0.94 : ia === st.real ? 0.9 + Math.random() * 0.07 : 0.72 + Math.random() * 0.1;
    // Recuadros: de la geometría del SVG de muestra o bandas genéricas sobre una foto subida
    let geo;
    if (st.fuente === 'muestra') geo = U.posteSVG(Store.tramo(st.tramoId).fotoSeed, st.real).boxes;
    else geo = Array.from({ length: st.real }, (_, i) => ({ x: i % 2 ? 330 : 170, y: 90 + i * (190 / st.real), w: 140, h: Math.max(12, 160 / st.real) }));
    const boxes = geo.slice(0, Math.min(ia, st.real)).map(b => ({ ...b, c: Math.min(0.99, conf + (Math.random() - 0.5) * 0.08) }));
    if (ia > st.real) { const b = geo[geo.length - 1]; boxes.push({ ...b, x: b.x + 12, y: b.y + 6, c: 0.51 }); }
    st.ia = ia; st.conf = conf; st.boxes = boxes; st.fase = 'analizando';
    renderStage(); renderResultado(); renderValidacion();
    await U.sleep(1800);
    for (let i = 1; i <= boxes.length; i++) { if (!root.isConnected) return; renderStage(i); await U.sleep(170); }
    st.fase = 'resultado';
    renderStage(); renderResultado(); renderValidacion();
  }

  function renderResultado() {
    const el = root.querySelector('#rel-resultado');
    if (!el) return;
    const t = Store.tramo(st.tramoId), m = Store.metrics(t);
    if (st.fase !== 'resultado' && st.fase !== 'validado') {
      el.innerHTML = `<div class="card-head"><h3><span class="step-n">2</span> Detección automática</h3></div>
        <p class="muted">${st.fase === 'analizando' ? 'Procesando la imagen…' : 'Cargue una imagen y ejecute la detección. El modelo identifica cada cable, lo encuadra y calcula su nivel de confianza.'}</p>
        ${st.fase === 'analizando' ? '<div class="progress"><div class="progress-bar indeterminate"></div></div>' : ''}`;
      return;
    }
    const exc = st.ia - m.aut;
    el.innerHTML = `
      <div class="card-head"><h3><span class="step-n">2</span> Detección automática</h3><span class="badge b-info">Modelo v2.3</span></div>
      <div class="big-count">
        <div><span>Cables detectados</span><b>${st.ia}</b></div>
        <div><span>Autorizados</span><b>${m.aut}</b></div>
        <div><span>Diferencia</span><b class="${exc > 0 ? 't-crit' : 't-ok'}">${exc > 0 ? '+' + exc : exc}</b></div>
      </div>
      <div class="conf"><span>Nivel de confianza</span><div class="meter"><div class="meter-fill ${st.conf >= 0.85 ? 'm-ok' : 'm-warn'}" style="width:${(st.conf * 100).toFixed(0)}%"></div></div><b>${U.pct(st.conf)}</b></div>
      ${st.conf < 0.85 ? `<p class="callout warn">${U.icon('alert', 15)} Confianza menor al 85 %: se recomienda revisión manual del conteo.</p>` : ''}
      ${exc > 0 ? `<p class="callout crit">${U.icon('alert', 15)} Se detectan <b>${exc} cables más</b> de los autorizados (${U.pct(exc / Math.max(m.aut, 1))} de exceso).</p>` : `<p class="callout ok">${U.icon('check', 15)} El conteo coincide con lo autorizado.</p>`}`;
  }

  function renderValidacion() {
    const el = root.querySelector('#rel-validacion');
    if (!el) return;
    const puede = Store.can('relevar');
    if (st.fase === 'validado' && st.ev) {
      const ev = st.ev, exps = Store.state.expedientes.filter(e => e.tramoId === ev.tramoId && e.evidenciaId === ev.id);
      el.innerHTML = `
        <div class="card-head"><h3><span class="step-n">3</span> Evidencia registrada</h3><span class="badge b-ok">${U.icon('check', 12)}Validado</span></div>
        <dl class="kv">
          <dt>Evidencia</dt><dd><b>${ev.id}</b></dd>
          <dt>Conteo IA / validado</dt><dd>${ev.conteoIA} / <b>${ev.conteo}</b> cables</dd>
          <dt>Fecha y hora</dt><dd>${U.fmtDate(ev.fecha)} ${ev.hora}</dd>
          <dt>Coordenadas</dt><dd>${ev.lat.toFixed(6)}, ${ev.lng.toFixed(6)}</dd>
          <dt>Inspector</dt><dd>${U.esc(ev.inspector)}</dd>
          <dt>Huella digital</dt><dd><code>${ev.hash}</code></dd>
        </dl>
        ${exps.length ? `<p class="callout info">${U.icon('folder', 15)} ${exps.map(e => `Expediente <a href="#/expedientes?id=${e.id}"><b>${e.id}</b></a> (${U.esc(Store.prov(e.prov).corto)}) pasó a <b>${Store.ETAPAS[e.etapa]}</b>.`).join(' ')}</p>` : ''}
        <div class="btn-row"><a class="btn btn-sm" href="#/cobro?exp=${exps[0]?.id || ''}">${U.icon('calc', 15)} Ver cálculo de cobro</a><button class="btn btn-sm" id="r-nuevo">Nuevo relevamiento</button></div>`;
      el.querySelector('#r-nuevo').onclick = () => { st = nuevoEstado(st.tramoId); renderAll(); };
      return;
    }
    const listo = st.fase === 'resultado';
    el.innerHTML = `
      <div class="card-head"><h3><span class="step-n">3</span> Validación del inspector</h3>${puede ? '' : `<span class="badge b-none">${U.icon('lock', 12)}Requiere rol Inspector</span>`}</div>
      <p class="muted small">El inspector verifica la imagen y confirma o corrige el conteo antes de que tenga efectos administrativos.</p>
      <div class="stepper-input ${listo ? '' : 'disabled'}">
        <button class="icon-btn" id="v-menos" ${listo ? '' : 'disabled'} aria-label="Restar">${U.icon('minus')}</button>
        <input id="v-conteo" type="number" min="0" value="${listo ? st.ia : ''}" ${listo ? '' : 'disabled'} aria-label="Conteo validado">
        <button class="icon-btn" id="v-mas" ${listo ? '' : 'disabled'} aria-label="Sumar">${U.icon('plus')}</button>
        <span class="muted small" id="v-dif"></span>
      </div>
      <label class="field mt-s"><span>Observaciones</span><textarea id="v-obs" rows="2" placeholder="Ej: 2 cables sin precinto en el lado norte" ${listo ? '' : 'disabled'}></textarea></label>
      <button class="btn btn-primary mt-s" id="v-confirmar" ${listo && puede ? '' : 'disabled'}>${U.icon('check', 16)} Confirmar conteo</button>`;
    const inp = el.querySelector('#v-conteo'), dif = el.querySelector('#v-dif'), btn = el.querySelector('#v-confirmar');
    const upd = () => {
      const v = +inp.value;
      const corr = st.ia != null && v !== st.ia;
      dif.textContent = corr ? `Corrige el conteo automático (${st.ia} → ${v})` : '';
      btn.innerHTML = `${U.icon('check', 16)} ${corr ? 'Corregir y confirmar' : 'Confirmar conteo'} (${v || 0} cables)`;
    };
    el.querySelector('#v-menos').onclick = () => { inp.value = Math.max(0, +inp.value - 1); upd(); };
    el.querySelector('#v-mas').onclick = () => { inp.value = +inp.value + 1; upd(); };
    inp.oninput = upd;
    btn.onclick = () => confirm();
    if (listo) upd();
  }

  /** Confirma el conteo y registra la evidencia (también la usa la demo guiada) */
  function confirm() {
    if (st.fase !== 'resultado') return null;
    const inp = root.querySelector('#v-conteo');
    const conteo = inp ? +inp.value : st.ia;
    const obs = root.querySelector('#v-obs')?.value || '';
    const ev = Store.registrarRelevamiento({ tramoId: st.tramoId, conteo, conteoIA: st.ia, confianza: st.conf, archivo: st.fileName, observaciones: obs });
    if (!ev) return null;
    st.ev = ev; st.fase = 'validado'; st.real = conteo;
    renderAll();
    U.toast(`Evidencia ${ev.id} registrada para ${ev.tramoId}`, 'ok');
    return ev;
  }

  function renderEvidencias() {
    const el = root.querySelector('#r-evid');
    if (!el) return;
    const evs = [...Store.state.evidencias].reverse().slice(0, 8);
    el.innerHTML = `<table class="table">
      <thead><tr><th>Evidencia</th><th>Tramo</th><th>Fecha y hora</th><th>Coordenadas</th><th class="num">IA</th><th class="num">Validado</th><th>Inspector</th><th>Hash</th></tr></thead>
      <tbody>${evs.map(v => `<tr><td><b>${v.id}</b></td><td>${v.tramoId}</td><td>${U.fmtDate(v.fecha)} ${v.hora.slice(0, 5)}</td><td class="small">${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}</td>
        <td class="num">${v.conteoIA}</td><td class="num"><b>${v.conteo}</b>${v.conteo !== v.conteoIA ? ' <span class="badge b-warn">corregido</span>' : ''}</td><td>${U.esc(v.inspector)}</td><td><code>${v.hash.slice(0, 10)}…</code></td></tr>`).join('')}</tbody></table>`;
  }

  /** Al cambiar el store (p. ej. rol) sólo se refrescan los paneles, sin perder la captura */
  function refresh() { if (!root || !root.isConnected) return; renderMeta(); renderValidacion(); renderEvidencias(); }

  function load(tramoId) { st = nuevoEstado(tramoId); if (root) { const s = root.querySelector('#r-tramo'); if (s) s.value = tramoId; renderAll(); } }

  return { render, refresh, load, cargarMuestra, runDetection, confirm };
})();
