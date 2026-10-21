/*
 * Utilidades generales: formatos (es-AR), fechas, aleatorio con semilla,
 * hash para la cadena de auditoría, íconos, modales, toasts y la
 * "foto" simulada del poste (SVG generado) usada por la visión artificial.
 */
const U = (() => {
  // ---------- Aleatorio determinístico (mulberry32) ----------
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Formatos ----------
  const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const money0 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const num = (n, d = 0) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const money = n => money0.format(Math.round(n || 0)).replace(/ /g, ' ');
  /** Monto abreviado: $ 12,4 M · $ 1.234 M · $ 850 mil */
  function moneyShort(n) {
    const a = Math.abs(n || 0);
    if (a >= 1e6) return `$ ${num(n / 1e6, a >= 1e8 ? 0 : 1)} M`;
    if (a >= 1e4) return `$ ${num(n / 1e3, 0)} mil`;
    return money(n);
  }
  const pct = (x, d = 0) => `${num((x || 0) * 100, d)} %`;

  // ---------- Fechas (ISO yyyy-mm-dd, sin zona horaria) ----------
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = iso => new Date(iso + 'T12:00:00');
  const todayISO = () => toISO(new Date());
  const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const addMonths = (iso, n) => { const d = parse(iso); d.setMonth(d.getMonth() + n); return toISO(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  function monthsBetween(a, b) {
    const A = parse(a), B = parse(b);
    let m = (B.getFullYear() - A.getFullYear()) * 12 + (B.getMonth() - A.getMonth());
    if (B.getDate() < A.getDate()) m--;
    return Math.max(0, m);
  }
  const fmtDate = iso => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const fmtDateTime = ts => ts ? `${fmtDate(ts.slice(0, 10))} ${ts.slice(11, 16)}` : '—';
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const nowLocalISO = () => { const d = new Date(); return `${toISO(d)}T${nowTime()}`; };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const monthLabel = iso => { const d = parse(iso); return `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; };

  // ---------- Hash encadenado (FNV-1a doble, 64 bits en hex) ----------
  function hash(str) {
    let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 16777619);
      h2 ^= c; h2 = Math.imul(h2, 2246822519);
      h2 ^= h2 >>> 13;
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  // ---------- HTML ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    calc: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
    next: '<path d="M5 4v16l10-8z" fill="currentColor"/><path d="M18 4v16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M7 14h10v7H7z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    scan: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  const icon = (name, size = 18) =>
    `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // ---------- Estados (semáforo) ----------
  const ESTADOS = {
    cumple:  { label: 'Cumple',          color: '#0ca30c', cls: 'ok',   icon: 'check' },
    leve:    { label: 'Exceso leve',     color: '#fab219', cls: 'warn', icon: 'alert' },
    critico: { label: 'Exceso crítico',  color: '#d03b3b', cls: 'crit', icon: 'alert' },
    sin:     { label: 'Sin relevar',     color: '#8f96a0', cls: 'none', icon: 'clock' },
  };
  const badgeEstado = e => `<span class="badge b-${ESTADOS[e].cls}">${icon(ESTADOS[e].icon, 13)}${ESTADOS[e].label}</span>`;

  // ---------- Toasts ----------
  function toast(msg, type = 'info', ms = 3800) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `${icon(type === 'error' ? 'alert' : 'check', 16)}<span>${msg}</span>`;
    root.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }

  // ---------- Modales ----------
  function modal({ title, body = '', footer = '', size = 'md', onClose } = {}) {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal modal-${size}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>`;
    const h = {
      el: wrap,
      body: wrap.querySelector('.modal-body'),
      foot: wrap.querySelector('.modal-foot'),
      setBody(html) { h.body.innerHTML = html; },
      setFoot(html) { h.foot.innerHTML = html; h.foot.style.display = html ? '' : 'none'; },
      close() { if (!wrap.isConnected) return; wrap.remove(); onClose && onClose(); },
    };
    h.setBody(body); h.setFoot(footer);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) h.close(); });
    wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) h.close(); });
    root.appendChild(wrap);
    return h;
  }
  const closeModals = () => document.querySelectorAll('#modal-root .modal-backdrop').forEach(m => m.remove());

  // ---------- Impresión / PDF de un documento ----------
  function printHTML(html) {
    const area = document.getElementById('print-area');
    area.innerHTML = html;
    document.body.classList.add('printing');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing');
    }, 60);
  }

  // ---------- "Foto" simulada de un poste con N cables ----------
  // Devuelve el SVG y los recuadros (bounding boxes) de cada cable,
  // en coordenadas de un lienzo de 640x400.
  function posteSVG(seed, n) {
    const r = rng(seed * 7 + 13);
    const uid = 'sky' + seed + '_' + n + '_' + Math.floor(Math.random() * 1e6);
    const W = 640, H = 400, xL = 104, xR = 536;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">`;
    s += `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8de"/><stop offset="1" stop-color="#e6eef5"/></linearGradient></defs>`;
    s += `<rect width="${W}" height="${H}" fill="url(#${uid})"/>`;
    // Edificios de fondo
    let x = -10;
    while (x < W) {
      const w = 55 + r() * 75, h = 90 + r() * 120, g = 168 + Math.floor(r() * 55);
      s += `<rect x="${x.toFixed(0)}" y="${(326 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="rgb(${g},${g - 8},${g - 18})"/>`;
      for (let wy = 326 - h + 14; wy < 310; wy += 26)
        for (let wx = x + 10; wx < x + w - 14; wx += 20)
          s += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="9" height="12" fill="rgba(255,255,255,.38)"/>`;
      x += w + 3;
    }
    s += `<rect y="320" width="${W}" height="12" fill="#bdb9ae"/><rect y="332" width="${W}" height="68" fill="#777b80"/>`;
    s += `<path d="M0 368h${W}" stroke="#e8e2c8" stroke-width="3" stroke-dasharray="30 22"/>`;
    // Postes
    [xL, xR].forEach(px => {
      s += `<rect x="${px - 7}" y="54" width="14" height="272" fill="#6d5b48"/><rect x="${px - 32}" y="74" width="64" height="7" fill="#54463a"/>`;
    });
    // Cables (curvas catenarias aproximadas con Bézier cuadrática)
    const boxes = [];
    const top = 94, span = 168;
    for (let i = 0; i < n; i++) {
      const y1 = top + (i + 0.5) * span / n + (r() - 0.5) * 5;
      const y2 = y1 + (r() - 0.5) * 12;
      const sag = 12 + r() * 20;
      const cy = (y1 + y2) / 2 + 2 * sag;
      const col = ['#1b1b1b', '#2b2b2b', '#3a3a3a', '#111', '#454545'][Math.floor(r() * 5)];
      const w = (1.8 + r() * 1.8).toFixed(1);
      s += `<path d="M${xL + 7},${y1.toFixed(1)} Q320,${cy.toFixed(1)} ${xR - 7},${y2.toFixed(1)}" stroke="${col}" stroke-width="${w}" fill="none"/>`;
      // Ventana del cable donde el modelo "marca" la detección (alterna izquierda/derecha)
      const [ta, tb] = i % 2 === 0 ? [0.2, 0.4] : [0.6, 0.8];
      const P = t => { const a = (1 - t) ** 2, b = 2 * (1 - t) * t, c = t * t; return [a * (xL + 7) + b * 320 + c * (xR - 7), a * y1 + b * cy + c * y2]; };
      const pts = [ta, (ta + tb) / 2, tb].map(P);
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      boxes.push({ x: Math.min(...xs) - 4, y: Math.min(...ys) - 6, w: Math.max(...xs) - Math.min(...xs) + 8, h: Math.max(...ys) - Math.min(...ys) + 12 });
    }
    s += '</svg>';
    return { svg: s, boxes };
  }
  const _photoCache = {};
  function posteDataURI(seed, n) {
    const k = seed + ':' + n;
    if (!_photoCache[k]) _photoCache[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(posteSVG(seed, n).svg);
    return _photoCache[k];
  }

  // ---------- Código QR y código de barras (simulados, decorativos) ----------
  function qrSVG(text, size = 96) {
    const N = 21, h = hash(text) + hash(text + 'x') + hash(text + 'y') + hash(text + 'z');
    let bits = '';
    for (const ch of h) bits += parseInt(ch, 16).toString(2).padStart(4, '0');
    const cell = size / N;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/>`;
    const finder = (x, y) => `<rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}" fill="#111"/><rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/><rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#111"/>`;
    let k = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const inF = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      if (inF) continue;
      if (bits[(k++ * 7) % bits.length] === '1' ^ (x * y) % 3 === 0) s += `<rect x="${x * cell}" y="${y * cell}" width="${cell + .3}" height="${cell + .3}" fill="#111"/>`;
    }
    s += finder(0, 0) + finder(14, 0) + finder(0, 14) + '</svg>';
    return s;
  }
  function barcodeSVG(text, w = 320, h = 56) {
    const hx = (hash(text) + hash(text + '1') + hash(text + '2')).split('');
    let x = 6, s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fff"/>`;
    let i = 0;
    while (x < w - 8) {
      const v = parseInt(hx[i++ % hx.length], 16);
      const bw = 1 + (v % 3);
      if (i % 2) s += `<rect x="${x}" y="4" width="${bw}" height="${h - 8}" fill="#111"/>`;
      x += bw + 1 + ((v >> 2) % 2);
    }
    return s + '</svg>';
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  return {
    rng, num, money, moneyShort, pct, todayISO, addDays, addMonths, daysBetween, monthsBetween,
    fmtDate, fmtDateTime, nowTime, nowLocalISO, monthLabel, hash, esc, icon, ESTADOS, badgeEstado,
    toast, modal, closeModals, printHTML, posteSVG, posteDataURI, qrSVG, barcodeSVG, sleep, clamp,
  };
})();
