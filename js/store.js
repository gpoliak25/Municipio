/*
 * STORE CENTRAL
 * ---------------------------------------------------------------
 * Única fuente de verdad de la demo. Todas las pantallas leen de acá,
 * por eso el dashboard, el mapa y los expedientes siempre coinciden.
 *
 *  - generate():   arma los datos simulados a partir de MOCK_CONFIG.
 *  - metrics/kpis: cálculos derivados (estado de cada tramo, KPIs, ranking).
 *  - calcCargos(): MOTOR DE CÁLCULO DE COBRO (canon, exceso, retroactivo,
 *                  intereses y multa).
 *  - acciones:     relevar, validar, intimar, multar, cobrar, declarar...
 *                  Cada acción valida permisos del rol, registra en la
 *                  auditoría (log encadenado con hash) y notifica a la UI.
 *  - persistencia: localStorage (con "Reiniciar datos" se vuelve al inicio).
 */
const Store = (() => {
  const CFG = window.MOCK_CONFIG;
  const VERSION = 8;
  const KEY = 'ocupacion-cableado-demo';

  const ETAPAS = ['Detección', 'Validación', 'Intimación', 'Plazo de regularización', 'Multa / cobro', 'Retiro a costa del proveedor', 'Cierre'];
  const PLAZOS = [10, 5, 5, 30, 15, 20, 0];               // días para resolver cada etapa
  const DLAT = 0.00108, DLNG = 0.00128;                    // ~120 m por cuadra

  const PERMISOS = {
    relevar: 'Cargar relevamientos y validar conteos',
    identificar: 'Identificar cables y gestionar precintos',
    tarifas: 'Modificar parámetros tarifarios',
    intimar: 'Emitir y notificar intimaciones',
    sancionar: 'Aplicar multas y ordenar retiros',
    cobrar: 'Registrar pagos y cobros',
    amnistia: 'Configurar régimen de regularización',
    auditoria: 'Consultar el registro de auditoría',
    portal: 'Operar el portal (sólo datos propios)',
  };
  const ROLES = {
    admin:     { nombre: 'Administrador', perms: ['relevar', 'identificar', 'tarifas', 'intimar', 'sancionar', 'cobrar', 'amnistia', 'auditoria'] },
    inspector: { nombre: 'Inspector',     perms: ['relevar', 'identificar'] },
    hacienda:  { nombre: 'Hacienda',      perms: ['tarifas', 'cobrar', 'auditoria'] },
    legal:     { nombre: 'Legal',         perms: ['intimar', 'sancionar', 'amnistia', 'auditoria'] },
    proveedor: { nombre: 'Proveedor',     perms: ['portal'] },
  };

  let state = null;
  const subs = new Set();

  // ================================================================
  // Helpers
  // ================================================================
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  function dist(a, b) {
    const R = 6371000, k = Math.PI / 180;
    const dLat = (b[0] - a[0]) * k, dLng = (b[1] - a[1]) * k;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * k) * Math.cos(b[0] * k) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  const prov = id => CFG.proveedores.find(p => p.id === id);
  const zona = id => CFG.zonas.find(z => z.id === id);
  const tramo = id => state.tramos.find(t => t.id === id);
  const ocup = (t, provId) => t.ocupaciones.find(o => o.prov === provId);
  const exp = id => state.expedientes.find(e => e.id === id);
  const midpoint = t => { const c = t.coords, i = Math.floor((c.length - 1) / 2); return [(c[i][0] + c[i + 1][0]) / 2, (c[i][1] + c[i + 1][1]) / 2]; };
  const nextId = (k, prefix, digits = 4) => `${prefix}-${state.hoy.slice(0, 4)}-${String(++state.seq[k]).padStart(digits, '0')}`;

  // ================================================================
  // Generación de datos simulados (determinística)
  // ================================================================
  function generate() {
    const rnd = U.rng(CFG.semilla);
    const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const weighted = (items, w) => { const tot = sum(items, w); let x = rnd() * tot; for (const it of items) { x -= w(it); if (x <= 0) return it; } return items[items.length - 1]; };
    const hoy = U.todayISO();
    const hora = () => `${String(randInt(8, 17)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}`;

    state = {
      version: VERSION, hoy,
      params: { ...CFG.tarifas },
      amnistia: { activa: CFG.amnistia.activa, hasta: U.addDays(hoy, CFG.amnistia.diasVigencia) },
      session: { role: 'admin', provId: null },
      tramos: [], expedientes: [], evidencias: [], pagos: [], permisos: [], declaraciones: [], audit: [],
      canonPagado: {}, excesoHist: [],
      seq: { exp: 0, ev: 0, int: 0, pago: 0, per: 0, dj: 0 },
    };

    // 1) Geometría. Si existe data/geo-tramos.js (cuadras reales de OpenStreetMap generadas con
    //    tools/generar-geometria.js) se usa esa; si no, cada zona es una grilla sintética de 8x8 esquinas.
    const tramos = state.tramos;
    const GEO = window.GEO_TRAMOS;
    const nuevoTramo = (z, coords, calle, altura, largo) => tramos.push({
      id: 'T-' + String(tramos.length + 1).padStart(4, '0'), zona: z.id,
      tipo: rnd() < z.ductoPct ? 'ducto' : 'poste',
      coords, calle, altura, largo,
      ocupaciones: [], sinIdentificar: 0, relevado: true,
      ultimoRelevamiento: null, inspector: null, confianza: null, origen: null,
      fotoSeed: randInt(1, 999999),
    });
    if (GEO) CFG.zonas.forEach(z => (GEO.zonas[z.id] || []).forEach(g => nuevoTramo(z, g.coords, g.calle, g.altura, g.largo)));
    else CFG.zonas.forEach(z => {
      const o = [CFG.municipio.centro[0] + z.offset[0], CFG.municipio.centro[1] + z.offset[1]];
      const node = (r, c) => [o[0] + (3.5 - r) * DLAT, o[1] + (c - 3.5) * DLNG];
      const cand = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (c < 7) cand.push({ r, c, dir: 'h' });
        if (r < 7) cand.push({ r, c, dir: 'v' });
      }
      shuffle(cand).slice(0, z.tramos).forEach(s => {
        const a = node(s.r, s.c), b = s.dir === 'h' ? node(s.r, s.c + 1) : node(s.r + 1, s.c);
        nuevoTramo(z, [a, b],
          s.dir === 'h' ? z.callesEO[s.r] : z.callesNS[s.c],
          s.dir === 'h' ? `${(s.c + 1) * 100}–${(s.c + 2) * 100}` : `${(s.r + 1) * 100}–${(s.r + 2) * 100}`,
          Math.round(dist(a, b)));
      });
    });

    // 2) Estado objetivo de cada tramo según la distribución configurada. El exceso no se reparte al azar:
    //    es más probable en permisos antiguos y en cuadras densas (es lo que detecta el módulo de analítica).
    tramos.forEach(t => {
      t.antiguedad = randInt(1, 15);
      t.densidadUrbana = U.clamp(Math.round(zona(t.zona).densidad * 3 + (rnd() - 0.5) * 2.4), 1, 5);
    });
    const N = tramos.length, D = CFG.distribucion;
    const nSin = Math.round(N * D.sinRelevar), nCrit = Math.round(N * D.critico), nLeve = Math.round(N * D.leve);
    const zStd = k => { const v = tramos.map(t => t[k]), m = sum(v, x => x) / N, s = Math.sqrt(sum(v, x => (x - m) ** 2) / (N - 1)) || 1; return t => (t[k] - m) / s; };
    const zAnt = zStd('antiguedad'), zDen = zStd('densidadUrbana');
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const est = Array(N).fill('cumple'), orden = shuffle(tramos.map((_, i) => i));
    orden.slice(0, nSin).forEach(i => { est[i] = 'sin'; });
    orden.slice(nSin)
      .map(i => ({ i, s: 0.35 * zAnt(tramos[i]) + 0.45 * zDen(tramos[i]) + 0.6 * gauss() }))
      .sort((a, b) => b.s - a.s)
      .forEach(({ i }, k) => { est[i] = k < nCrit ? 'critico' : k < nCrit + nLeve ? 'leve' : 'cumple'; });
    const fIdx = tramos.findIndex(t => t.id === CFG.casoDestacado.tramoId);
    if (fIdx >= 0 && est[fIdx] !== 'critico') {
      const j = est.findIndex((e, i) => e === 'critico' && i !== fIdx);
      [est[fIdx], est[j]] = [est[j], est[fIdx]];
    }

    // 3) Ocupaciones (proveedores por tramo, cables autorizados y detectados)
    tramos.forEach((t, i) => {
      const z = zona(t.zona), e = est[i];
      const x = rnd();
      const nProv = x < 0.14 * z.densidad ? 3 : x < 0.5 * z.densidad ? 2 : 1;
      const pool = [...CFG.proveedores], elegidos = [];
      for (let k = 0; k < nProv; k++) { const p = weighted(pool, p => p.presencia); elegidos.push(p); pool.splice(pool.indexOf(p), 1); }
      t.ocupaciones = elegidos.map(p => {
        const a = randInt(2, z.densidad > 1.2 ? 6 : 5);
        return { prov: p.id, autorizados: a, detectados: a, identificados: a, desuso: 0, instalacionExceso: null, desusoNotificado: false };
      });
      const aut = sum(t.ocupaciones, o => o.autorizados);
      if (e === 'sin') { t.relevado = false; return; }
      if (e === 'cumple') rnd();   // (antes: faltante de 1 cable; se conserva el sorteo para no alterar el resto de los datos)
      if (e === 'leve' || e === 'critico') {
        const exc = e === 'leve'
          ? Math.max(1, Math.min(Math.floor(aut * 0.5), Math.round(aut * (0.12 + rnd() * 0.36))))
          : Math.max(Math.floor(aut * 0.5) + 1, Math.round(aut * (0.6 + rnd() * 0.7)));
        const inf = weighted(t.ocupaciones, o => prov(o.prov).propension);
        const unid = (exc >= 2 && rnd() < 0.2) ? Math.min(2, exc - 1) : 0;
        inf.detectados += exc - unid;
        t.sinIdentificar = unid;
        inf.identificados = inf.detectados - Math.min(inf.detectados, randInt(0, Math.min(3, exc - unid)));
        inf.instalacionExceso = U.addMonths(hoy, -randInt(4, 28));
      }
      t.ocupaciones.forEach(o => {
        if (rnd() < 0.08) o.identificados = Math.max(0, o.identificados - 1);
        if (rnd() < 0.09 && o.detectados > 1) o.desuso = 1;
      });
      t.ultimoRelevamiento = U.addDays(hoy, -randInt(6, 210));
      t.inspector = CFG.inspectores[randInt(0, CFG.inspectores.length - 1)];
      t.confianza = 0.86 + rnd() * 0.12;
      t.origen = rnd() < 0.6 ? 'Relevamiento vehicular con cámara' : 'Inspección de campo';
    });

    // 4) Caso destacado de la demo: 5 cables autorizados, 10 detectados
    const fc = CFG.casoDestacado, f = tramos[fIdx];
    if (!GEO) Object.assign(f, { calle: fc.calle, altura: fc.altura });   // con geometría real se conserva la calle real
    Object.assign(f, {
      tipo: fc.tipo, sinIdentificar: 0, relevado: true,
      ultimoRelevamiento: U.addDays(hoy, -3), inspector: 'Sistema (cámara vehicular)', confianza: 0.91,
      origen: 'Relevamiento vehicular con cámara',
    });
    f.ocupaciones = [{
      prov: fc.proveedor, autorizados: fc.autorizados, detectados: fc.detectados, identificados: fc.autorizados + 2,
      desuso: 0, instalacionExceso: U.addMonths(hoy, -fc.mesesDesdeInstalacion), desusoNotificado: false,
    }];

    // 5) Expedientes
    const SIS = { usuario: 'Sistema', rol: 'sistema' };
    const who = rol => ({ usuario: rol === 'inspector' ? CFG.inspectores[randInt(0, 2)] : CFG.usuarios[rol], rol });
    const TXT = [
      () => 'Exceso detectado automáticamente en relevamiento',
      () => 'Conteo validado por inspector en campo',
      n => `Intimación ${n} emitida al proveedor`,
      () => 'Notificación recibida: inicia plazo de 30 días para regularizar',
      () => 'Plazo vencido: multa aplicada y liquidación emitida',
      () => 'Orden de retiro de cables a costa del proveedor',
      () => 'Expediente cerrado',
    ];
    const ROL_ETAPA = ['sistema', 'inspector', 'legal', 'legal', 'legal', 'legal', 'hacienda'];
    const borradores = [];

    // 5a) Históricos cerrados (dan la serie de "recuperado" de los últimos meses)
    const cumplen = tramos.filter((t, i) => est[i] === 'cumple');
    shuffle(cumplen.slice()).slice(0, CFG.expedientesCerrados).forEach(t => {
      const mesAtras = weighted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], m => 11 - m);
      let fechaCierre = U.addDays(U.addMonths(hoy, -mesAtras), randInt(-12, 12));
      if (fechaCierre > hoy) fechaCierre = U.addDays(hoy, -1);
      const o = t.ocupaciones[0];
      const tipo = weighted(['voluntaria', 'pago', 'retiro'], x => ({ voluntaria: 5, pago: 4, retiro: 1 })[x]);
      const exc = randInt(1, 4), meses = randInt(5, 20);
      const liq = calcCargos(t, o, state.params, { exceso: exc, meses, amnistia: tipo === 'voluntaria' });
      const fechaDet = U.addDays(fechaCierre, -randInt(40, 110));
      const etapas = tipo === 'voluntaria' ? [0, 1, 4, 6] : tipo === 'pago' ? [0, 1, 2, 3, 4, 6] : [0, 1, 2, 3, 4, 5, 6];
      const fechas = etapas.map((_, k) => U.addDays(fechaDet, Math.round(k * U.daysBetween(fechaDet, fechaCierre) / (etapas.length - 1))));
      borradores.push({
        t, o, abierto: false, etapa: 6, fechas, etapas, tipo, liq, exc, fechaCierre,
      });
    });

    // 5b) Abiertos: uno por cada proveedor con exceso en un tramo relevado
    tramos.forEach(t => {
      if (!t.relevado) return;
      t.ocupaciones.forEach(o => {
        if (o.detectados <= o.autorizados) return;
        const etapa = t.id === fc.tramoId ? 0 : weighted([0, 1, 2, 3, 4, 5], k => [35, 25, 12, 15, 8, 5][k]);
        const etapas = [...Array(etapa + 1).keys()];
        const fechaEtapa = t.id === fc.tramoId ? U.addDays(hoy, -3) : U.addDays(hoy, -randInt(0, PLAZOS[etapa] + 8));
        const fechas = [fechaEtapa];
        for (let k = etapa - 1; k >= 0; k--) fechas.unshift(U.addDays(fechas[0], -randInt(2, Math.max(3, PLAZOS[k]))));
        t.ultimoRelevamiento = fechas[Math.min(1, etapa)];
        borradores.push({ t, o, abierto: true, etapa, fechas, etapas });
      });
    });

    // Numeración cronológica
    borradores.sort((a, b) => a.fechas[0].localeCompare(b.fechas[0]));
    borradores.forEach(b => {
      const e = {
        id: nextId('exp', 'EXP'), tramoId: b.t.id, prov: b.o.prov, etapa: b.etapa, abierto: b.abierto,
        fechaDeteccion: b.fechas[0], fechaEtapa: b.fechas[b.fechas.length - 1],
        vence: b.abierto && PLAZOS[b.etapa] ? U.addDays(b.fechas[b.fechas.length - 1], PLAZOS[b.etapa]) : null,
        evidenciaId: null, intimacion: null, liquidacion: b.abierto ? null : b.liq,
        multaAplicada: b.etapas.includes(4) && b.tipo !== 'voluntaria',
        regularizacion: b.tipo === 'voluntaria' ? { tipo: 'voluntaria', fecha: b.fechas[2], declarados: b.o.autorizados } : null,
        montoCobrado: b.abierto ? 0 : b.liq.total, fechaCierre: b.abierto ? null : b.fechaCierre,
        resultado: b.abierto ? null : ({ voluntaria: 'Regularización voluntaria (amnistía) y pago', pago: 'Pago de liquidación y multa', retiro: 'Retiro de cables ejecutado; cobro sobre garantía del permiso' })[b.tipo],
        cablesExceso: b.abierto ? null : b.exc,
        historial: [],
      };
      b.etapas.forEach((et, k) => {
        let texto = TXT[et](e.intimacion?.numero);
        if (et === 2) { e.intimacion = { numero: nextId('int', 'INT'), fecha: b.fechas[k] }; texto = TXT[2](e.intimacion.numero); }
        if (et === 4 && b.tipo === 'voluntaria') texto = 'Declaración jurada voluntaria: se condonan multa, recargo e intereses';
        if (et === 6 && !b.abierto) texto = `Pago registrado (${U.money(b.liq.total)}). ${e.resultado}`;
        const w = et === 0 ? SIS : who(ROL_ETAPA[et]);
        e.historial.push({ fecha: b.fechas[k], etapa: et, texto, usuario: w.usuario, rol: w.rol, hora: hora() });
      });
      // Evidencia de campo para los expedientes ya validados
      if (b.etapas.includes(1)) {
        const tot = sum(b.t.ocupaciones, o => o.detectados) + b.t.sinIdentificar;
        const [lat, lng] = midpoint(b.t);
        const ev = {
          id: `EV-${String(++state.seq.ev).padStart(5, '0')}`, tramoId: b.t.id, fecha: b.fechas[1], hora: hora(),
          lat, lng, conteoIA: tot, conteo: tot, confianza: 0.86 + rnd() * 0.12,
          inspector: e.historial[1].usuario, origen: 'Inspección de campo (app móvil)',
          archivo: `IMG_${b.fechas[1].replace(/-/g, '')}_${randInt(1000, 9999)}.jpg`, observaciones: '',
        };
        ev.hash = U.hash(JSON.stringify(ev));
        state.evidencias.push(ev);
        e.evidenciaId = ev.id;
      }
      state.expedientes.push(e);
    });

    // 6) Serie histórica del exceso (el último mes siempre es el valor en vivo)
    const excNow = kpis().exceso;
    state.excesoHist = [0.2, 0.34, 0.5, 0.63, 0.76, 0.88, 0.97, 1.06, 1.12, 1.1, 1.05].map(f => Math.round(excNow * f));

    // 7) Auditoría inicial: se reconstruye a partir de los historiales
    const eventos = [
      { fecha: U.addDays(hoy, -340), hora: '09:12:04', usuario: CFG.usuarios.admin, rol: 'admin', accion: 'Alta de catastro', detalle: `Carga inicial de ${N} tramos georreferenciados`, objeto: 'Catastro' },
      { fecha: U.addDays(hoy, -338), hora: '10:40:51', usuario: CFG.usuarios.hacienda, rol: 'hacienda', accion: 'Parámetros tarifarios', detalle: `Tarifas aprobadas según ${CFG.municipio.ordenanza}`, objeto: 'Tarifas' },
      { fecha: U.addDays(hoy, -335), hora: '11:02:19', usuario: CFG.usuarios.admin, rol: 'admin', accion: 'Alta de proveedores', detalle: `${CFG.proveedores.length} proveedores registrados con permisos marco`, objeto: 'Proveedores' },
    ];
    state.expedientes.forEach(e => e.historial.forEach(h => eventos.push({
      fecha: h.fecha, hora: h.hora, usuario: h.usuario, rol: h.rol, accion: ETAPAS[h.etapa], detalle: `${e.tramoId} · ${prov(e.prov).corto}: ${h.texto}`, objeto: e.id,
    })));
    eventos.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    eventos.forEach(ev => pushAudit({ ts: `${ev.fecha}T${ev.hora}`, usuario: ev.usuario, rol: ev.rol, accion: ev.accion, detalle: ev.detalle, objeto: ev.objeto }));

    return state;
  }

  // ================================================================
  // Métricas y motor de cálculo
  // ================================================================
  /** Estado de un tramo: cumple / leve (≤50% de exceso) / crítico (>50%) / sin relevar */
  function metrics(t) {
    const aut = sum(t.ocupaciones, o => o.autorizados);
    if (!t.relevado) return { estado: 'sin', aut, det: null, exceso: null, ratio: null };
    const det = sum(t.ocupaciones, o => o.detectados) + t.sinIdentificar;
    const exceso = sum(t.ocupaciones, o => Math.max(0, o.detectados - o.autorizados)) + t.sinIdentificar;
    const ratio = aut ? exceso / aut : (exceso > 0 ? 9 : 0);
    const estado = exceso <= 0 ? 'cumple' : ratio <= 0.5 ? 'leve' : 'critico';
    return { estado, aut, det, exceso, ratio };
  }

  /**
   * MOTOR DE CÁLCULO para una ocupación (proveedor en un tramo).
   *   canon regular mensual = autorizados × largo × tarifa + tarifa de poste
   *   exceso mensual        = exceso × largo × tarifa × (1 + recargo)
   *   retroactivo           = exceso mensual × meses desde la instalación estimada
   *   intereses             = retroactivo × interés mensual × (meses + 1) / 2   (interés simple sobre saldo promedio)
   *   multa                 = exceso × multa por cable
   * Con régimen de regularización voluntaria (amnistía): sin recargo, sin intereses y sin multa.
   */
  function calcCargos(t, o, params = state.params, opts = {}) {
    const p = params;
    const exc = opts.exceso ?? Math.max(0, o.detectados - o.autorizados);
    const meses = opts.meses ?? U.clamp(U.monthsBetween(o.instalacionExceso || state.hoy, state.hoy), 1, 60);
    const amn = !!opts.amnistia;
    const tarifaCableMes = p.tarifaCableMetroMes * t.largo;
    const posteMes = t.tipo === 'poste' ? p.tarifaPosteMes : 0;
    const regularMes = o.autorizados * tarifaCableMes + posteMes;
    const recargo = amn ? 0 : p.recargoExceso / 100;
    const excesoMes = exc * tarifaCableMes * (1 + recargo);
    const retro = excesoMes * meses;
    const interes = amn ? 0 : retro * (p.interesMoraMensual / 100) * (meses + 1) / 2;
    const multa = amn ? 0 : exc * p.multaPorCable;
    return { exc, meses, largo: t.largo, aut: o.autorizados, det: o.detectados, tarifaCableMes, posteMes, regularMes, recargo, excesoMes, retro, interes, multa, amnistia: amn, total: retro + interes + multa };
  }

  /** Liquidación de un expediente: congelada si ya se emitió/regularizó, si no se calcula en vivo */
  function liquidacion(e, params) {
    if (e.liquidacion) return e.liquidacion;
    const t = tramo(e.tramoId), o = ocup(t, e.prov);
    return calcCargos(t, o, params || state.params);
  }

  /** Totales de recaudación con un juego de parámetros (para el simulador what-if) */
  function totals(params = state.params) {
    let regularMes = 0, potencialMes = 0;
    const porProvMes = {};
    state.tramos.forEach(t => t.ocupaciones.forEach(o => {
      const c = calcCargos(t, o, params, { exceso: 0, meses: 1 });
      regularMes += c.regularMes;
      const cables = t.relevado ? o.detectados : o.autorizados;
      potencialMes += cables * c.tarifaCableMes + c.posteMes;
      porProvMes[o.prov] = (porProvMes[o.prov] || 0) + c.regularMes;
    }));
    let aRecuperar = 0, multas = 0, retro = 0, interes = 0;
    const porProv = {};
    state.expedientes.filter(e => e.abierto).forEach(e => {
      const l = liquidacion(e, params);
      aRecuperar += l.total; multas += l.multa; retro += l.retro; interes += l.interes;
      porProv[e.prov] = (porProv[e.prov] || 0) + l.total;
    });
    return { regularMes, potencialMes, aRecuperar, multas, retro, interes, porProv, porProvMes };
  }

  function kpis() {
    const est = { cumple: 0, leve: 0, critico: 0, sin: 0 };
    let autRel = 0, detRel = 0, exceso = 0, sinId = 0, desuso = 0, ident = 0, tramosRel = 0, autTotal = 0, sinUso = 0;
    state.tramos.forEach(t => {
      const m = metrics(t);
      est[m.estado]++;
      autTotal += m.aut;
      if (!t.relevado) return;
      tramosRel++; autRel += m.aut; detRel += m.det; exceso += m.exceso; sinId += t.sinIdentificar;
      t.ocupaciones.forEach(o => { desuso += o.desuso; ident += Math.min(o.identificados, o.detectados); sinUso += Math.max(0, o.autorizados - o.detectados); });
    });
    const tot = totals();
    const abiertos = state.expedientes.filter(e => e.abierto);
    const cerrados = state.expedientes.filter(e => !e.abierto);
    const conMulta = state.expedientes.filter(e => e.multaAplicada);
    const mes = state.hoy.slice(0, 7);
    return {
      est, autRel, detRel, exceso, sinId, desuso, ident, tramosRel, autTotal, sinUso, tramos: state.tramos.length,
      pctExceso: autRel ? exceso / autRel : 0,
      ...tot,
      brechaMes: tot.potencialMes - tot.regularMes,
      abiertos: abiertos.length,
      multasEmitidas: conMulta.length,
      montoMultas: sum(conMulta, e => liquidacion(e).multa),
      enCurso: abiertos.filter(e => e.etapa === 3 || e.regularizacion).length,
      regularizados: cerrados.filter(e => e.montoCobrado > 0).length,
      recuperado: sum(cerrados, e => e.montoCobrado),
      recuperadoMes: sum(cerrados.filter(e => (e.fechaCierre || '').startsWith(mes)), e => e.montoCobrado),
      vencidos: abiertos.filter(e => plazoEstado(e) === 'vencido').length,
    };
  }

  /** Ranking de proveedores por nivel de incumplimiento (% de cables excedentes sobre autorizados) */
  function ranking() {
    const tot = totals();
    return CFG.proveedores.map(p => {
      let aut = 0, det = 0, exc = 0, tramosExc = 0, tramosN = 0;
      state.tramos.forEach(t => {
        const o = ocup(t, p.id);
        if (!o || !t.relevado) return;
        tramosN++; aut += o.autorizados; det += o.detectados;
        const e = Math.max(0, o.detectados - o.autorizados);
        exc += e; if (e > 0) tramosExc++;
      });
      return { ...p, tramos: tramosN, aut, det, exc, tramosExc, pct: aut ? exc / aut : 0, deuda: tot.porProv[p.id] || 0, expAbiertos: state.expedientes.filter(e => e.abierto && e.prov === p.id).length };
    }).sort((a, b) => b.pct - a.pct);
  }

  /** Series de los últimos 12 meses (exceso pendiente y monto recuperado) */
  function serieMensual() {
    const labels = [], exceso = [], recuperado = [];
    const actual = kpis().exceso;
    for (let k = 11; k >= 0; k--) {
      const d = U.addMonths(state.hoy.slice(0, 8) + '15', -k);
      labels.push(U.monthLabel(d));
      exceso.push(k === 0 ? actual : state.excesoHist[11 - k]);
      const m = d.slice(0, 7);
      recuperado.push(sum(state.expedientes.filter(e => !e.abierto && (e.fechaCierre || '').startsWith(m)), e => e.montoCobrado));
    }
    return { labels, exceso, recuperado };
  }

  /** Semáforo de plazos de un expediente */
  function diasRestantes(e) { return e.vence ? U.daysBetween(state.hoy, e.vence) : null; }
  function plazoEstado(e) {
    if (!e.abierto) return 'cerrado';
    const d = diasRestantes(e);
    if (d == null) return 'ok';
    return d < 0 ? 'vencido' : d <= 5 ? 'proximo' : 'ok';
  }
  function alertasPlazos() {
    return state.expedientes.filter(e => e.abierto && e.vence).sort((a, b) => a.vence.localeCompare(b.vence));
  }
  const expedienteDe = (tramoId, provId) => state.expedientes.find(e => e.abierto && e.tramoId === tramoId && e.prov === provId);
  const expedienteDestacado = () => state.expedientes.filter(e => e.tramoId === CFG.casoDestacado.tramoId).sort((a, b) => b.id.localeCompare(a.id))[0];

  /** Lista de cables físicos de un tramo (para identificación y precintos) */
  function cablesDe(t) {
    const list = [];
    let n = 0;
    t.ocupaciones.forEach(o => {
      const p = prov(o.prov);
      for (let i = 0; i < o.detectados; i++) {
        n++;
        const tagged = i < o.identificados;
        const enDesuso = i >= o.detectados - o.desuso;
        list.push({
          n, prov: o.prov, provNombre: p.corto, color: p.color,
          precinto: tagged ? `${o.prov}-${t.id.replace('T-', '')}-${String(i + 1).padStart(2, '0')}` : null,
          permiso: p.permisoMarco, excedente: i >= o.autorizados,
          estado: enDesuso ? 'desuso' : tagged ? 'identificado' : 'sin-precinto',
        });
      }
    });
    for (let i = 0; i < t.sinIdentificar; i++) { n++; list.push({ n, prov: null, estado: 'sin-identificar' }); }
    return list;
  }

  // ================================================================
  // Auditoría (log encadenado: cada registro incluye el hash del anterior)
  // ================================================================
  const auditPayload = e => [e.n, e.ts, e.usuario, e.rol, e.accion, e.detalle, e.objeto, e.prevHash].join('|');
  function pushAudit(entry) {
    const prev = state.audit.length ? state.audit[state.audit.length - 1].hash : '0'.repeat(16);
    const e = { n: state.audit.length + 1, ...entry, objeto: entry.objeto || '', prevHash: prev };
    e.hash = U.hash(auditPayload(e));
    state.audit.push(e);
  }
  function log(accion, detalle, objeto) {
    pushAudit({ ts: U.nowLocalISO(), usuario: usuarioActual(), rol: state.session.role, accion, detalle, objeto });
  }
  /** Verifica la cadena completa. Devuelve {ok, index} con el primer registro inconsistente. */
  function verifyChain(list = state.audit) {
    let prev = '0'.repeat(16);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.prevHash !== prev || U.hash(auditPayload(e)) !== e.hash) return { ok: false, index: i };
      prev = e.hash;
    }
    return { ok: true, index: -1 };
  }

  // ================================================================
  // Sesión y permisos
  // ================================================================
  function usuarioActual() {
    const s = state.session;
    if (s.role === 'proveedor') { const p = prov(s.provId); return p ? `${p.representante} (${p.corto})` : 'Proveedor (sin sesión)'; }
    return CFG.usuarios[s.role];
  }
  const can = perm => ROLES[state.session.role].perms.includes(perm);
  function need(perm) {
    if (can(perm)) return true;
    U.toast(`Su rol (${ROLES[state.session.role].nombre}) no tiene permiso para: ${PERMISOS[perm].toLowerCase()}.`, 'error');
    return false;
  }
  function setRole(role) {
    if (state.session.role === role) return;
    state.session = { role, provId: null };
    log('Cambio de rol', `Sesión iniciada como ${ROLES[role].nombre}`, 'Sesión');
    emit();
  }
  function loginProveedor(provId) {
    state.session = { role: 'proveedor', provId };
    log('Inicio de sesión', `Ingreso al portal del proveedor ${prov(provId).nombre}`, 'Portal');
    emit();
  }
  function logout() {
    log('Cierre de sesión', 'Salida del portal del proveedor', 'Portal');
    state.session = { role: 'admin', provId: null };
    emit();
  }

  // ================================================================
  // Workflow de expedientes
  // ================================================================
  function advance(e, etapa, texto) {
    e.etapa = etapa;
    e.fechaEtapa = state.hoy;
    e.vence = PLAZOS[etapa] ? U.addDays(state.hoy, PLAZOS[etapa]) : null;
    e.historial.push({ fecha: state.hoy, hora: U.nowTime(), etapa, texto, usuario: usuarioActual(), rol: state.session.role });
  }
  function cerrar(e, monto, resultado, texto) {
    e.abierto = false; e.etapa = 6; e.fechaEtapa = state.hoy; e.vence = null;
    e.montoCobrado = monto; e.fechaCierre = state.hoy; e.resultado = resultado;
    e.historial.push({ fecha: state.hoy, hora: U.nowTime(), etapa: 6, texto, usuario: usuarioActual(), rol: state.session.role });
  }

  /** Crea expedientes para excesos nuevos y desestima los que quedaron sin exceso */
  function syncExpedientes() {
    state.tramos.forEach(t => {
      if (!t.relevado) return;
      t.ocupaciones.forEach(o => {
        const exc = o.detectados - o.autorizados;
        const abierto = expedienteDe(t.id, o.prov);
        if (exc > 0 && !abierto) {
          if (!o.instalacionExceso) o.instalacionExceso = U.addMonths(state.hoy, -6);
          const e = {
            id: nextId('exp', 'EXP'), tramoId: t.id, prov: o.prov, etapa: 0, abierto: true,
            fechaDeteccion: state.hoy, fechaEtapa: state.hoy, vence: U.addDays(state.hoy, PLAZOS[0]),
            evidenciaId: null, intimacion: null, liquidacion: null, multaAplicada: false, regularizacion: null,
            montoCobrado: 0, fechaCierre: null, resultado: null, cablesExceso: null,
            historial: [{ fecha: state.hoy, hora: U.nowTime(), etapa: 0, texto: `Exceso de ${exc} cable(s) detectado`, usuario: 'Sistema', rol: 'sistema' }],
          };
          state.expedientes.push(e);
          pushAudit({ ts: U.nowLocalISO(), usuario: 'Sistema', rol: 'sistema', accion: 'Expediente generado', detalle: `${t.id} · ${prov(o.prov).corto}: exceso de ${exc} cable(s)`, objeto: e.id });
        } else if (exc <= 0 && abierto && !abierto.liquidacion) {
          cerrar(abierto, 0, 'Desestimado: el conteo validado no registra exceso', 'Expediente desestimado por conteo corregido');
          log('Expediente desestimado', `${t.id}: sin exceso tras corrección`, abierto.id);
        }
      });
    });
  }

  /** Inspector: registra un relevamiento validado (con evidencia) */
  function registrarRelevamiento({ tramoId, conteo, conteoIA, confianza, archivo, observaciones }) {
    if (!need('relevar')) return null;
    const t = tramo(tramoId);
    if (!t.relevado) {
      // Primer relevamiento: se asignan cables hasta lo autorizado; el resto queda sin identificar
      let rest = conteo;
      t.ocupaciones.forEach(o => { o.detectados = Math.min(o.autorizados, rest); o.identificados = o.detectados; rest -= o.detectados; });
      t.sinIdentificar = rest;
    } else {
      let delta = conteo - (sum(t.ocupaciones, o => o.detectados) + t.sinIdentificar);
      if (delta > 0) t.sinIdentificar += delta;
      while (delta < 0) {
        if (t.sinIdentificar > 0) t.sinIdentificar--;
        else {
          const o = t.ocupaciones.filter(x => x.detectados > 0).sort((a, b) => (b.detectados - b.autorizados) - (a.detectados - a.autorizados))[0];
          if (!o) break;
          o.detectados--; o.identificados = Math.min(o.identificados, o.detectados); o.desuso = Math.min(o.desuso, o.detectados);
        }
        delta++;
      }
    }
    t.relevado = true;
    t.ultimoRelevamiento = state.hoy;
    t.inspector = usuarioActual();
    t.confianza = confianza;
    t.origen = 'Inspección de campo';
    const [lat, lng] = midpoint(t);
    const ev = {
      id: `EV-${String(++state.seq.ev).padStart(5, '0')}`, tramoId, fecha: state.hoy, hora: U.nowTime(),
      lat: lat + (Math.random() - 0.5) * 0.00002, lng: lng + (Math.random() - 0.5) * 0.00002,
      conteoIA, conteo, confianza, inspector: usuarioActual(), origen: 'Inspección de campo (app móvil)',
      archivo: archivo || `IMG_${state.hoy.replace(/-/g, '')}_${Math.floor(1000 + Math.random() * 9000)}.jpg`,
      observaciones: observaciones || '',
    };
    ev.hash = U.hash(JSON.stringify(ev));
    state.evidencias.push(ev);
    log('Relevamiento validado', `${tramoId}: IA ${conteoIA} / validado ${conteo} cables (confianza ${U.pct(confianza)})`, ev.id);
    syncExpedientes();
    state.expedientes.filter(e => e.abierto && e.tramoId === tramoId && e.etapa === 0).forEach(e => {
      e.evidenciaId = ev.id;
      advance(e, 1, `Conteo validado en campo: ${conteo} cables (evidencia ${ev.id})`);
      log('Expediente validado', `${tramoId} · ${prov(e.prov).corto}`, e.id);
    });
    emit();
    return ev;
  }

  function validarExpediente(id) {
    if (!need('relevar')) return;
    const e = exp(id);
    const ev = state.evidencias.filter(v => v.tramoId === e.tramoId).pop();
    e.evidenciaId = ev ? ev.id : null;
    advance(e, 1, ev ? `Validado con evidencia ${ev.id}` : 'Validado con relevamiento automático');
    log('Expediente validado', `${e.tramoId} · ${prov(e.prov).corto}`, e.id);
    emit();
  }
  function emitirIntimacion(id) {
    if (!need('intimar')) return;
    const e = exp(id);
    e.intimacion = { numero: nextId('int', 'INT'), fecha: state.hoy, monto: liquidacion(e).total };
    advance(e, 2, `Intimación ${e.intimacion.numero} emitida (cédula electrónica + domicilio constituido)`);
    log('Intimación emitida', `${e.tramoId} · ${prov(e.prov).corto} · ${U.money(e.intimacion.monto)}`, e.id);
    emit();
  }
  function notificarIntimacion(id) {
    if (!need('intimar')) return;
    const e = exp(id);
    advance(e, 3, 'Notificación recibida: comienza el plazo de 30 días para regularizar');
    log('Notificación registrada', `${e.intimacion?.numero || ''} · plazo hasta ${U.fmtDate(e.vence)}`, e.id);
    emit();
  }
  function aplicarMulta(id) {
    if (!need('sancionar')) return;
    const e = exp(id);
    e.multaAplicada = true;
    advance(e, 4, `Plazo vencido sin regularizar: multa de ${U.money(liquidacion(e).multa)} y liquidación emitida`);
    log('Multa aplicada', `${e.tramoId} · ${prov(e.prov).corto} · ${U.money(liquidacion(e).multa)}`, e.id);
    emit();
  }
  function ordenarRetiro(id) {
    if (!need('sancionar')) return;
    const e = exp(id);
    advance(e, 5, 'Orden de retiro de los cables excedentes a costa del proveedor');
    log('Orden de retiro', `${e.tramoId} · ${prov(e.prov).corto}`, e.id);
    emit();
  }
  function confirmarRetiro(id) {
    if (!need('sancionar')) return;
    const e = exp(id), t = tramo(e.tramoId), o = ocup(t, e.prov);
    e.liquidacion = liquidacion(e);
    e.cablesExceso = e.liquidacion.exc;
    o.detectados = o.autorizados; o.identificados = Math.min(o.identificados, o.detectados); o.desuso = Math.min(o.desuso, o.detectados);
    cerrar(e, e.liquidacion.total, 'Retiro de cables ejecutado; cobro sobre garantía del permiso', `Retiro ejecutado. Se ejecuta la garantía por ${U.money(e.liquidacion.total)}`);
    log('Retiro ejecutado', `${e.tramoId}: ${e.cablesExceso} cable(s) retirados`, e.id);
    syncExpedientes();
    emit();
  }

  /** Pago de un expediente (Hacienda o el propio proveedor desde el portal) */
  function registrarPago(id) {
    const e = exp(id);
    const esProv = state.session.role === 'proveedor' && state.session.provId === e.prov;
    if (!esProv && !need('cobrar')) return null;
    const t = tramo(e.tramoId), o = ocup(t, e.prov);
    e.liquidacion = liquidacion(e);
    e.cablesExceso = e.liquidacion.exc;
    o.autorizados = Math.max(o.autorizados, o.detectados);   // con el pago se amplía el permiso: los cables pasan a facturarse
    o.identificados = o.detectados;
    const pago = { id: nextId('pago', 'PAGO', 5), provId: e.prov, expId: e.id, monto: e.liquidacion.total, fecha: state.hoy, concepto: `Liquidación ${e.id}` };
    state.pagos.push(pago);
    const resultado = e.regularizacion?.tipo === 'voluntaria' ? 'Regularización voluntaria (amnistía) y pago' : e.multaAplicada ? 'Pago de liquidación y multa' : 'Pago de liquidación';
    cerrar(e, e.liquidacion.total, resultado, `Pago ${pago.id} registrado por ${U.money(pago.monto)}. Permiso ampliado a ${o.autorizados} cables`);
    log('Pago registrado', `${e.id} · ${prov(e.prov).corto} · ${U.money(pago.monto)}`, pago.id);
    emit();
    return pago;
  }

  /** Declaración jurada del proveedor (con o sin régimen de regularización) */
  function declararDJ(provId, items) {
    const s = state.session;
    if (!(s.role === 'proveedor' && s.provId === provId) && s.role !== 'admin') { need('portal'); return null; }
    const amnVigente = state.amnistia.activa && state.hoy <= state.amnistia.hasta;
    const resultados = items.map(({ tramoId, instalados }) => {
      const t = tramo(tramoId), o = ocup(t, provId);
      const r = { tramoId, instalados, autorizadosAntes: o.autorizados, detectados: t.relevado ? o.detectados : null };
      if (t.relevado && instalados < o.detectados) {
        r.resultado = 'inconsistente';
        r.texto = `Declara ${instalados} pero el relevamiento municipal registró ${o.detectados}. Se mantiene el expediente.`;
        return r;
      }
      if (instalados === o.autorizados && (!t.relevado || o.detectados <= o.autorizados)) {
        r.resultado = 'sin-cambios'; r.texto = 'Coincide con lo autorizado.'; return r;
      }
      const e = expedienteDe(t.id, provId);
      if (e && !e.liquidacion) {
        const amn = amnVigente && e.etapa <= 3;
        e.liquidacion = calcCargos(t, o, state.params, { amnistia: amn });
        e.cablesExceso = e.liquidacion.exc;
        e.regularizacion = { tipo: amn ? 'voluntaria' : 'declaracion', fecha: state.hoy, declarados: instalados };
        advance(e, 4, amn
          ? `Regularización voluntaria: DJ de ${instalados} cables. Se condonan multa, recargo e intereses. A pagar: ${U.money(e.liquidacion.total)}`
          : `DJ de ${instalados} cables fuera del régimen de amnistía. Liquidación: ${U.money(e.liquidacion.total)}`);
        r.expId = e.id; r.amnistia = amn; r.monto = e.liquidacion.total;
      }
      o.autorizados = instalados;
      r.resultado = 'regularizado';
      r.texto = e ? (r.amnistia ? `Regularizado bajo amnistía. A pagar ${U.money(r.monto)} (sin multa).` : `Regularizado. Liquidación ${U.money(r.monto || 0)}.`) : `Permiso ampliado a ${instalados} cables.`;
      return r;
    });
    const dj = { id: nextId('dj', 'DJ'), provId, fecha: state.hoy, hora: U.nowTime(), resultados };
    state.declaraciones.push(dj);
    log('Declaración jurada', `${prov(provId).corto}: ${items.length} tramo(s) declarados · ${resultados.filter(r => r.resultado === 'regularizado').length} regularizados`, dj.id);
    syncExpedientes();
    emit();
    return dj;
  }

  function pagarCanon(provId) {
    const mes = state.hoy.slice(0, 7);
    const monto = totals().porProvMes[provId] || 0;
    state.canonPagado[provId + ':' + mes] = true;
    const pago = { id: nextId('pago', 'PAGO', 5), provId, expId: null, monto, fecha: state.hoy, concepto: `Canon de ocupación ${U.monthLabel(state.hoy)}` };
    state.pagos.push(pago);
    log('Pago de canon', `${prov(provId).corto} · ${U.money(monto)}`, pago.id);
    emit();
  }

  // ---------- Identificación de cables ----------
  function asignarCable(tramoId, provId, metodo) {
    if (!need('identificar')) return;
    const t = tramo(tramoId);
    if (t.sinIdentificar <= 0) return;
    let o = ocup(t, provId);
    if (!o) { o = { prov: provId, autorizados: 0, detectados: 0, identificados: 0, desuso: 0, instalacionExceso: U.addMonths(state.hoy, -6), desusoNotificado: false }; t.ocupaciones.push(o); }
    t.sinIdentificar--;
    o.detectados++; o.identificados++;
    if (o.detectados > o.autorizados && !o.instalacionExceso) o.instalacionExceso = U.addMonths(state.hoy, -6);
    log('Cable identificado', `${tramoId}: cable asignado a ${prov(provId).corto} (${metodo})`, tramoId);
    syncExpedientes();
    emit();
  }
  function colocarPrecinto(tramoId, provId) {
    if (!need('identificar')) return;
    const o = ocup(tramo(tramoId), provId);
    if (o.identificados >= o.detectados) return;
    o.identificados++;
    log('Precinto colocado', `${tramoId}: precinto ${provId}-${tramoId.replace('T-', '')}-${String(o.identificados).padStart(2, '0')}`, tramoId);
    emit();
  }
  function notificarDesuso(tramoId, provId) {
    if (!need('identificar')) return;
    const o = ocup(tramo(tramoId), provId);
    o.desusoNotificado = true;
    log('Retiro de cable en desuso', `${tramoId}: notificado a ${prov(provId).corto} (plazo 15 días)`, tramoId);
    emit();
  }

  // ---------- Configuración ----------
  function setParams(p) {
    if (!need('tarifas')) return false;
    const cambios = Object.keys(p).filter(k => p[k] !== state.params[k]).map(k => `${k}: ${state.params[k]} → ${p[k]}`);
    state.params = { ...p };
    log('Parámetros tarifarios', cambios.join(' · ') || 'Sin cambios', 'Tarifas');
    emit();
    return true;
  }
  function setAmnistia(activa, hasta) {
    if (!need('amnistia')) return false;
    state.amnistia = { activa, hasta };
    log('Régimen de regularización', activa ? `Activado hasta ${U.fmtDate(hasta)}` : 'Desactivado', 'Amnistía');
    emit();
    return true;
  }
  function solicitarPermiso(provId, data) {
    const per = { id: nextId('per', 'PER'), provId, fecha: state.hoy, estado: 'En evaluación técnica', ...data };
    state.permisos.push(per);
    log('Solicitud de permiso', `${prov(provId).corto}: ${data.tramos} · ${data.cables} cables · plano ${data.archivo || 's/archivo'}`, per.id);
    emit();
    return per;
  }

  // ================================================================
  // Persistencia y suscripción
  // ================================================================
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* modo privado: se ignora */ } }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.version === VERSION ? s : null;
    } catch (e) { return null; }
  }
  function emit() { save(); subs.forEach(f => { try { f(); } catch (err) { console.error(err); } }); }
  function init() { state = load(); if (!state) { generate(); save(); } }
  function reset() { generate(); save(); emit(); }

  return {
    get state() { return state; },
    CFG, ETAPAS, PLAZOS, PERMISOS, ROLES,
    init, reset, subscribe: f => subs.add(f),
    prov, zona, tramo, ocup, exp, midpoint,
    metrics, calcCargos, liquidacion, totals, kpis, ranking, serieMensual, cablesDe,
    diasRestantes, plazoEstado, alertasPlazos, expedienteDe, expedienteDestacado,
    can, usuarioActual, setRole, loginProveedor, logout, verifyChain,
    registrarRelevamiento, validarExpediente, emitirIntimacion, notificarIntimacion, aplicarMulta,
    ordenarRetiro, confirmarRetiro, registrarPago, declararDJ, pagarCanon,
    asignarCable, colocarPrecinto, notificarDesuso, setParams, setAmnistia, solicitarPermiso,
  };
})();
