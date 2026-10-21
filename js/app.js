/*
 * ARRANQUE Y NAVEGACIÓN
 * Router por hash (#/mapa?tramo=T-0042), barra lateral, selector de rol
 * y re-render de la pantalla activa cada vez que cambia el Store.
 */
const App = (() => {
  const ROUTES = [
    { id: 'dashboard', label: 'Tablero ejecutivo', icon: 'dashboard', view: DashboardView },
    { id: 'mapa', label: 'Mapa GIS', icon: 'map', view: MapaView },
    { id: 'relevamiento', label: 'Relevamiento IA', icon: 'camera', view: RelevamientoView },
    { id: 'identificacion', label: 'Identificación de cables', icon: 'tag', view: IdentificacionView },
    { id: 'cobro', label: 'Motor de cobro', icon: 'calc', view: CobroView },
    { id: 'expedientes', label: 'Expedientes y sanciones', icon: 'folder', view: ExpedientesView },
    { id: 'portal', label: 'Portal del proveedor', icon: 'building', view: PortalView },
    { id: 'auditoria', label: 'Auditoría y roles', icon: 'shield', view: AuditoriaView },
    { id: 'planificacion', label: 'Planificación', icon: 'layers', view: PlanificacionView },
    { id: 'analitica', label: 'Analítica y modelos', icon: 'chart', view: AnaliticaView },
  ];
  let current = null;
  const viewEl = () => document.getElementById('view');

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    return { id: path || 'dashboard', params: Object.fromEntries(new URLSearchParams(qs || '')) };
  }

  function route() {
    const { id, params } = parseHash();
    // Un proveedor sólo puede ver su portal
    if (Store.state.session.role === 'proveedor' && id !== 'portal') { location.hash = '#/portal'; return; }
    const r = ROUTES.find(x => x.id === id) || ROUTES[0];
    if (current && current.view.destroy) current.view.destroy();
    current = r;
    renderChrome();
    window.scrollTo(0, 0);
    r.view.render(viewEl(), params);
    document.title = `${r.label} · Control de Cableado`;
    document.body.classList.remove('nav-open');
  }

  function renderChrome() {
    const S = Store.state, k = Store.kpis();
    const esProv = S.session.role === 'proveedor';
    document.getElementById('nav').innerHTML = ROUTES.filter(r => !esProv || r.id === 'portal').map(r => {
      const badge = r.id === 'expedientes' && k.vencidos ? `<span class="nav-badge" title="Expedientes con plazo vencido">${k.vencidos}</span>`
        : r.id === 'identificacion' && k.sinId ? `<span class="nav-badge warn" title="Cables sin identificar">${k.sinId}</span>` : '';
      return `<a href="#/${r.id}" class="${current && current.id === r.id ? 'active' : ''}">${U.icon(r.icon, 18)}<span>${r.label}</span>${badge}</a>`;
    }).join('');
    const sel = document.getElementById('role-select');
    sel.innerHTML = Object.entries(Store.ROLES).map(([key, r]) => `<option value="${key}" ${S.session.role === key ? 'selected' : ''}>${r.nombre}</option>`).join('');
    document.getElementById('user-chip').innerHTML = `${U.icon('user', 16)}<span>${U.esc(Store.usuarioActual())}</span>`;
    document.getElementById('topbar-title').textContent = current ? current.label : '';
  }

  function onStore() {
    renderChrome();
    if (!current) return;
    // Si el rol cambió a/desde proveedor, puede corresponder otra pantalla
    if (Store.state.session.role === 'proveedor' && current.id !== 'portal') { location.hash = '#/portal'; return; }
    const v = current.view;
    if (v.refresh) v.refresh(); else v.render(viewEl(), parseHash().params);
  }

  function init() {
    Store.init();
    document.getElementById('brand-muni').textContent = Store.CFG.municipio.nombre;
    Store.subscribe(onStore);
    window.addEventListener('hashchange', route);

    document.getElementById('role-select').onchange = e => {
      const role = e.target.value;
      Store.setRole(role);
      if (role === 'proveedor') location.hash = '#/portal';
      else if (current && current.id === 'portal') location.hash = '#/dashboard';
      U.toast(`Ahora opera como: ${Store.ROLES[role].nombre}${role === 'proveedor' ? ' (elija la empresa para ingresar)' : ''}`);
    };
    document.getElementById('btn-tour').onclick = () => Tour.start();
    document.getElementById('btn-reset').onclick = () => {
      if (Tour.running) Tour.stop();
      U.closeModals();
      Store.reset();
      location.hash = '#/dashboard';
      U.toast('Datos de la demo reiniciados.', 'ok');
    };
    document.getElementById('btn-menu').onclick = () => document.body.classList.toggle('nav-open');
    document.getElementById('sidebar-scrim').onclick = () => document.body.classList.remove('nav-open');
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !Tour.running) { const m = document.querySelectorAll('#modal-root .modal-backdrop'); if (m.length) m[m.length - 1].querySelector('[data-close]').click(); } });

    route();
  }

  return { init, route };
})();

document.addEventListener('DOMContentLoaded', App.init);
