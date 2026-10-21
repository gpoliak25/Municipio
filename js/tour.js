/*
 * MODO DEMO GUIADA
 * Recorre automáticamente el ciclo completo en 5 pasos (≈4-5 minutos):
 *   1. Dashboard  2. Mapa  3. Relevamiento IA  4. Cobro y expediente
 *   5. Intimación, regularización del proveedor y mejora del indicador.
 * Cada "beat" navega, ejecuta acciones reales sobre el Store (las mismas
 * que haría un usuario) y muestra un tooltip sobre el elemento destacado.
 * Se puede pausar, adelantar o salir en cualquier momento.
 */
const Tour = (() => {
  const FEAT = () => Store.CFG.casoDestacado.tramoId;
  const PASOS = ['El problema', 'Mapa', 'Relevamiento', 'Cobro y expediente', 'Intimación y regularización'];
  let running = false, paused = false, skip = false, idx = 0;
  let el = null, spot = null, posTimer = null, target = null, inicio = null, expId = null;

  const go = async hash => { if (location.hash !== hash) { location.hash = hash; await U.sleep(650); } };
  const kp = () => Store.kpis();

  // ---------------- Guion ----------------
  const BEATS = [
    { paso: 0, ruta: '#/dashboard', target: '#dash-hero', dur: 12000, titulo: 'El municipio cobra menos de lo que está instalado',
      texto: () => { const k = kp(); return `El municipio cobra por <b>${U.num(k.autRel)} cables</b>, pero en la calle hay <b>${U.num(k.detRel)}</b>. Son <b>${U.num(k.exceso)} cables de más (+${U.pct(k.pctExceso, 1)})</b> que usan postes y ductos públicos sin pagar.`; } },
    { paso: 0, target: '#kpi-recaudacion', dur: 9000, titulo: 'Plata que se pierde todos los meses',
      texto: () => { const k = kp(); return `Hoy se recaudan <b>${U.money(k.regularMes)}</b> por mes. Si se cobrara todo lo instalado serían <b>${U.money(k.potencialMes)}</b>: una diferencia de <b>${U.money(k.brechaMes)}</b> por mes, todos los meses.`; } },
    { paso: 0, target: '#kpi-recuperar', dur: 9000, titulo: 'Deuda acumulada a recuperar',
      texto: () => { const k = kp(); return `Además se pueden reclamar <b>${U.moneyShort(k.aRecuperar)}</b>: el cobro retroactivo desde que se instaló cada cable de más, intereses por mora y multas.`; } },
    { paso: 0, target: '#dash-ranking', dur: 8000, titulo: '¿Quién incumple más?',
      texto: () => { const r = Store.ranking()[0]; return `El ranking muestra el nivel de incumplimiento de cada proveedor. <b>${U.esc(r.corto)}</b> encabeza la lista, con <b>${U.pct(r.pct, 1)}</b> de cables sin permiso.`; } },

    { paso: 1, ruta: '#/mapa', target: '#map', dur: 9000, titulo: 'Todos los tramos en el mapa',
      texto: 'Cada línea es una cuadra de postes o ductos. <b style="color:#0ca30c">Verde</b>: cumple · <b style="color:#b07d00">amarillo</b>: exceso leve · <b style="color:#d03b3b">rojo</b>: exceso crítico · gris: todavía sin relevar.' },
    { paso: 1, target: '#map-detail', dur: 12000, titulo: 'Un caso concreto',
      accion: async () => { MapaView.focus(FEAT()); await U.sleep(1800); },
      texto: () => { const t = Store.tramo(FEAT()), m = Store.metrics(t), p = Store.prov(t.ocupaciones[0].prov); return `Tramo <b>${t.id} — ${U.esc(t.calle)} ${t.altura}</b>: ${U.esc(p.corto)} tiene permiso para <b>${m.aut} cables</b>, pero la cámara del relevamiento detectó <b>${m.det}</b>. El doble.`; } },

    { paso: 2, ruta: () => `#/relevamiento?tramo=${FEAT()}`, target: '#rel-stage', dur: 6500, titulo: 'El inspector releva el poste',
      accion: async () => { Store.setRole('inspector'); RelevamientoView.load(FEAT()); await U.sleep(400); RelevamientoView.cargarMuestra(); },
      texto: 'Con la tablet municipal el inspector toma una foto del poste. Queda registrada automáticamente con <b>GPS, fecha y hora</b>. (La sesión cambió al rol <b>Inspector</b>).' },
    { paso: 2, target: '#rel-stage', dur: 5500, titulo: 'Visión por computadora',
      accion: async () => { await RelevamientoView.runDetection(); },
      texto: 'El modelo de visión artificial encuadra cada cable, los cuenta y calcula su <b>nivel de confianza</b>. Así no hace falta contar a ojo poste por poste.' },
    { paso: 2, target: '#rel-validacion', dur: 9000, titulo: 'Validación humana y evidencia',
      accion: async () => { await U.sleep(2500); RelevamientoView.confirm(); },
      texto: 'El inspector confirma el conteo. Se genera una <b>evidencia inalterable</b> (foto, coordenadas, fecha, hora y huella digital) y el expediente pasa a <b>Validación</b>.' },

    { paso: 3, ruta: null, target: '#cobro-detalle', dur: 12000, titulo: 'Cálculo automático del cobro',
      accion: async () => { Store.setRole('hacienda'); expId = Store.expedienteDestacado().id; CobroView.resetEsc(); await go(`#/cobro?exp=${expId}`); },
      texto: () => { const e = Store.exp(expId), l = Store.liquidacion(e); return `El sistema calcula solo: <b>${U.money(l.retro)}</b> de cobro retroactivo por ${l.meses} meses, <b>${U.money(l.interes)}</b> de intereses y <b>${U.money(l.multa)}</b> de multa. Total a recuperar: <b>${U.money(l.total)}</b>.`; } },
    { paso: 3, target: '#cobro-params', dur: 8000, titulo: 'Simulador "what-if"',
      accion: async () => { for (let v = 110; v <= 200; v += 10) { CobroView.setEsc('recargoExceso', v); await U.sleep(140); } },
      texto: 'Hacienda puede probar escenarios: si el recargo por exceso sube de 100 % a 200 %, todos los montos se recalculan al instante, sin tocar la tarifa vigente.' },
    { paso: 3, ruta: null, target: '.modal', dur: 9000, titulo: 'El expediente reúne todo',
      accion: async () => { CobroView.resetEsc(); await go(`#/expedientes?id=${expId}`); await U.sleep(300); },
      texto: 'Evidencia, liquidación, historial y próximas acciones en un solo lugar, con <b>semáforo de plazos</b>. Nadie tiene que armar carpetas a mano.' },

    { paso: 4, target: '.modal .doc', dur: 10000, titulo: 'Intimación en un clic',
      accion: async () => { Store.setRole('legal'); await U.sleep(300); ExpedientesView.previewIntimacion(expId); await U.sleep(400); },
      texto: 'Legales genera la <b>cédula de intimación</b> con los datos del tramo, la foto, la evidencia y el monto, lista para imprimir o firmar digitalmente.' },
    { paso: 4, target: '.modal .stepper', dur: 8000, titulo: 'Notificado: empieza a correr el plazo',
      accion: async () => { U.closeModals(); ExpedientesView.emitir(expId); ExpedientesView.openDetail(expId); await U.sleep(300); },
      texto: () => `Intimación emitida y notificada. El proveedor tiene <b>30 días (hasta el ${U.fmtDate(Store.exp(expId).vence)})</b> para regularizar; si no, multa y retiro de cables a su costo.` },
    { paso: 4, target: '#portal-dj', dur: 10000, titulo: 'El proveedor regulariza desde su portal',
      accion: async () => {
        U.closeModals();
        await go('#/portal');
        PortalView.login(Store.tramo(FEAT()).ocupaciones[0].prov);
        await U.sleep(300);
        PortalView.setTab('dj');
        await U.sleep(900);
        PortalView.fillDJ(FEAT(), Store.ocup(Store.tramo(FEAT()), Store.tramo(FEAT()).ocupaciones[0].prov).detectados);
      },
      texto: () => `Del otro lado, ${U.esc(Store.prov(Store.state.session.provId)?.corto || 'el proveedor')} entra a su portal y declara bajo juramento los <b>${Store.metrics(Store.tramo(FEAT())).det} cables</b> que tiene instalados. Con el régimen de regularización voluntaria, <b>no paga multa</b>.` },
    { paso: 4, target: '#portal-deudas', dur: 9000, titulo: 'Paga y queda en regla',
      accion: async () => {
        PortalView.submitDJ(true);
        await U.sleep(2200);
        U.closeModals();
        PortalView.setTab('deudas');
        await U.sleep(600);
        const m = PortalView.openBoleta(expId);
        await U.sleep(2600);
        PortalView.pagar(expId, m);
        await U.sleep(400);
      },
      texto: () => { const e = Store.exp(expId); return `Genera la boleta y paga <b>${U.money(e.montoCobrado || Store.liquidacion(e).total)}</b>. El expediente se cierra y los cables quedan <b>autorizados y facturados todos los meses</b>.`; } },
    { paso: 4, ruta: null, target: '#dash-hero', dur: 14000, titulo: 'El indicador mejora',
      accion: async () => { Store.logout(); await go('#/dashboard'); },
      texto: () => {
        const k = kp();
        return `El tramo ${FEAT()} ya figura en <b style="color:#0ca30c">verde</b>. Exceso: de <b>${inicio.exceso}</b> a <b>${k.exceso}</b> cables · recaudación mensual: de <b>${U.money(inicio.regularMes)}</b> a <b>${U.money(k.regularMes)}</b> · recuperado este mes: <b>+${U.money(k.recuperadoMes - inicio.recuperadoMes)}</b>. Multiplicado por todos los tramos en rojo y amarillo, ese es el potencial del sistema.`;
      } },
  ];

  // ---------------- Motor ----------------
  async function wait(ms) {
    let t = 0;
    while (t < ms) {
      if (!running) throw new Error('stop');
      if (skip) { skip = false; return; }
      await U.sleep(100);
      if (!paused) { t += 100; setProgress(t / ms); }
    }
  }

  function ensureUI() {
    const root = document.getElementById('tour-root');
    root.innerHTML = `<div class="tour-spot" hidden></div>
      <div class="tour-box" role="dialog" aria-live="polite">
        <div class="tour-top"><span class="tour-step"></span><button class="icon-btn" data-t="exit" aria-label="Salir de la demo">${U.icon('x', 16)}</button></div>
        <div class="tour-dots">${PASOS.map((p, i) => `<span data-i="${i}" title="${p}"></span>`).join('')}</div>
        <h4 class="tour-title"></h4>
        <p class="tour-text"></p>
        <div class="tour-progress"><div></div></div>
        <div class="tour-ctrl">
          <button class="btn btn-sm" data-t="pause">${U.icon('pause', 14)} Pausa</button>
          <button class="btn btn-sm btn-primary" data-t="next">Siguiente ${U.icon('next', 14)}</button>
        </div>
      </div>`;
    el = root.querySelector('.tour-box');
    spot = root.querySelector('.tour-spot');
    el.querySelector('[data-t=exit]').onclick = stop;
    el.querySelector('[data-t=next]').onclick = () => { skip = true; };
    el.querySelector('[data-t=pause]').onclick = e => {
      paused = !paused;
      e.currentTarget.innerHTML = paused ? `${U.icon('play', 14)} Continuar` : `${U.icon('pause', 14)} Pausa`;
    };
  }

  function setProgress(f) { const b = el && el.querySelector('.tour-progress div'); if (b) b.style.width = `${Math.min(100, f * 100)}%`; }

  function position() {
    if (!el) return;
    const t = target && document.querySelector(target);
    const vw = window.innerWidth, vh = window.innerHeight;
    const bw = Math.min(380, vw - 24);
    el.style.width = bw + 'px';
    const bh = el.offsetHeight;
    if (!t) {
      spot.hidden = true;
      el.style.left = (vw - bw) / 2 + 'px'; el.style.top = Math.max(12, vh - bh - 24) + 'px';
      return;
    }
    const r = t.getBoundingClientRect();
    spot.hidden = false;
    const pad = 6;
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    // Ubicación del cuadro: debajo, arriba, a la derecha o fijo abajo
    let left = U.clamp(r.left, 12, vw - bw - 12), top;
    if (r.bottom + bh + 16 < vh) top = r.bottom + 14;
    else if (r.top - bh - 16 > 0) top = r.top - bh - 14;
    else if (r.right + bw + 20 < vw) { left = r.right + 14; top = U.clamp(r.top, 12, vh - bh - 12); }
    else if (r.left - bw - 20 > 0) { left = r.left - bw - 14; top = U.clamp(r.top, 12, vh - bh - 12); }
    else top = vh - bh - 16;
    el.style.left = left + 'px'; el.style.top = top + 'px';
  }

  async function showBeat(b) {
    target = b.target;
    const txt = typeof b.texto === 'function' ? b.texto() : b.texto;
    el.querySelector('.tour-step').textContent = `Paso ${b.paso + 1} de 5 · ${PASOS[b.paso]}`;
    el.querySelectorAll('.tour-dots span').forEach((d, i) => { d.className = i < b.paso ? 'done' : i === b.paso ? 'on' : ''; });
    el.querySelector('.tour-title').textContent = b.titulo;
    el.querySelector('.tour-text').innerHTML = txt;
    setProgress(0);
    const t = target && document.querySelector(target);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await U.sleep(350);
    position();
  }

  async function start() {
    if (running) return;
    running = true; paused = false; skip = false; idx = 0;
    U.closeModals();
    Store.reset();                     // la demo siempre arranca desde el mismo estado
    Store.setRole('admin');
    inicio = Store.kpis();
    expId = Store.expedienteDestacado().id;
    ensureUI();
    document.body.classList.add('touring');
    posTimer = setInterval(position, 250);
    window.addEventListener('resize', position);
    try {
      for (idx = 0; idx < BEATS.length; idx++) {
        const b = BEATS[idx];
        if (b.ruta) await go(typeof b.ruta === 'function' ? b.ruta() : b.ruta);
        target = b.target;
        // El texto se muestra antes de la acción (si ya existe el destino) y se actualiza después
        el.querySelector('.tour-text').innerHTML = '';
        await showBeat(b);
        if (b.accion) { await b.accion(); if (!running) break; await showBeat(b); }
        await wait(b.dur);
      }
      if (running) fin();
    } catch (e) {
      if (e.message !== 'stop') { console.error(e); U.toast('La demo guiada se interrumpió: ' + e.message, 'error'); stop(); }
    }
  }

  function fin() {
    target = null;
    spot.hidden = true;
    el.querySelector('.tour-step').textContent = 'Demo completa';
    el.querySelectorAll('.tour-dots span').forEach(d => d.className = 'done');
    el.querySelector('.tour-title').textContent = 'Detectar → validar → calcular → intimar → regularizar';
    el.querySelector('.tour-text').innerHTML = 'Ese es el ciclo completo. Puede seguir explorando libremente cada módulo desde el menú lateral, o volver a ver la demo.';
    el.querySelector('.tour-progress div').style.width = '100%';
    el.querySelector('.tour-ctrl').innerHTML = `<button class="btn btn-sm" data-t="again">${U.icon('play', 14)} Ver de nuevo</button><button class="btn btn-sm btn-primary" data-t="close">Explorar la demo</button>`;
    el.querySelector('[data-t=again]').onclick = () => { stop(); setTimeout(start, 100); };
    el.querySelector('[data-t=close]').onclick = stop;
    position();
  }

  function stop() {
    running = false;
    clearInterval(posTimer);
    window.removeEventListener('resize', position);
    document.getElementById('tour-root').innerHTML = '';
    document.body.classList.remove('touring');
    el = spot = null;
  }

  return { start, stop, get running() { return running; } };
})();
