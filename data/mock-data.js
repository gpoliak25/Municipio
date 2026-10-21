/*
 * CONFIGURACIÓN Y DATOS BASE DE LA DEMO
 * ---------------------------------------------------------------
 * Este archivo contiene un objeto JSON puro asignado a window.MOCK_CONFIG
 * (se usa .js en lugar de .json para que la demo funcione abriendo
 * index.html con doble clic, sin servidor; fetch() de archivos locales
 * está bloqueado por los navegadores).
 *
 * A partir de esta configuración, js/store.js genera de forma
 * determinística (misma semilla = mismos datos) los ~180 tramos,
 * expedientes, evidencias y registros de auditoría.
 *
 * Para adaptar la demo a otro municipio: cambiar "municipio",
 * "proveedores", "zonas" (offset respecto del centro y nombres de calles)
 * y "tarifas". Ver README.md.
 */
window.MOCK_CONFIG = {
  "municipio": {
    "nombre": "Municipalidad de Villa Serena",
    "nombreCorto": "Villa Serena",
    "area": "Secretaría de Obras y Servicios Públicos",
    "ordenanza": "Ordenanza Tarifaria N° 4.812/2026",
    "domicilio": "Av. San Martín 250, Villa Serena",
    "centro": [-31.2526, -61.4916],
    "zoom": 14
  },
  "semilla": 20261020,
  "distribucion": { "cumple": 0.55, "leve": 0.25, "critico": 0.15, "sinRelevar": 0.05 },
  "expedientesCerrados": 24,

  "tarifas": {
    "tarifaCableMetroMes": 85,
    "tarifaPosteMes": 15000,
    "recargoExceso": 100,
    "interesMoraMensual": 3,
    "multaPorCable": 450000
  },

  "amnistia": { "activa": true, "diasVigencia": 60 },

  "planificacion": {
    "costoKm": 140000000,
    "tarifaSubductoMetroMes": 450,
    "subductos": 6,
    "ocupacionMax": 85,
    "horizonte": 15
  },

  "casoDestacado": {
    "tramoId": "T-0042",
    "proveedor": "CSU",
    "tipo": "poste",
    "calle": "Av. San Martín",
    "altura": "400–500",
    "autorizados": 5,
    "detectados": 10,
    "mesesDesdeInstalacion": 14
  },

  "usuarios": {
    "admin": "Lic. Mariana Ferreyra",
    "inspector": "Insp. Diego Ledesma",
    "hacienda": "Cdora. Laura Benítez",
    "legal": "Dr. Pablo Quiroga"
  },
  "inspectores": ["Insp. Diego Ledesma", "Insp. Romina Acosta", "Insp. Julián Sosa"],

  "proveedores": [
    { "id": "CSU", "nombre": "Conectar Sur S.A.", "corto": "Conectar Sur", "cuit": "30-71234567-8",
      "domicilio": "Av. Libertad 1450, Villa Serena", "representante": "Ing. Martín Rojas",
      "email": "regulatorio@conectarsur.com.ar", "permisoMarco": "PERM-CSU-2023-0457",
      "color": "#2a78d6", "presencia": 1.4, "propension": 1.7 },
    { "id": "FNL", "nombre": "FibraNet Litoral S.R.L.", "corto": "FibraNet", "cuit": "30-70987654-3",
      "domicilio": "Mitre 820, Villa Serena", "representante": "Lic. Carolina Méndez",
      "email": "permisos@fibranet.com.ar", "permisoMarco": "PERM-FNL-2022-0311",
      "color": "#eb6834", "presencia": 1.2, "propension": 1.0 },
    { "id": "TCP", "nombre": "TeleCable Pampeana S.A.", "corto": "TeleCable", "cuit": "30-69876543-1",
      "domicilio": "Belgrano 1220, Villa Serena", "representante": "Sr. Hernán Paz",
      "email": "obras@telecablepampeana.com.ar", "permisoMarco": "PERM-TCP-2019-0102",
      "color": "#1baf7a", "presencia": 1.0, "propension": 0.55 },
    { "id": "RAD", "nombre": "Red Andina Datos S.A.", "corto": "Red Andina", "cuit": "30-71555444-6",
      "domicilio": "Ruta Prov. 70 km 3, Villa Serena", "representante": "Ing. Sofía Gutiérrez",
      "email": "infraestructura@redandina.com.ar", "permisoMarco": "PERM-RAD-2024-0588",
      "color": "#6250d6", "presencia": 0.8, "propension": 1.3 },
    { "id": "WFX", "nombre": "Wiflux Comunicaciones S.A.S.", "corto": "Wiflux", "cuit": "30-71888999-2",
      "domicilio": "Sarmiento 455, Villa Serena", "representante": "Sr. Tomás Ibarra",
      "email": "legales@wiflux.com.ar", "permisoMarco": "PERM-WFX-2025-0614",
      "color": "#e87ba4", "presencia": 0.6, "propension": 0.35 }
  ],

  "zonas": [
    { "id": "centro", "nombre": "Centro", "offset": [0, 0], "tramos": 50, "ductoPct": 0.35, "densidad": 1.4,
      "callesEO": ["Rivadavia", "Belgrano", "Mitre", "Sarmiento", "Moreno", "Alvear", "Lavalle", "Brown"],
      "callesNS": ["Av. San Martín", "25 de Mayo", "9 de Julio", "Italia", "España", "Pellegrini", "Necochea", "Colón"] },
    { "id": "norte", "nombre": "Barrio Norte", "offset": [0.0095, 0.0010], "tramos": 36, "ductoPct": 0.1, "densidad": 1.05,
      "callesEO": ["Las Heras", "Pueyrredón", "Saavedra", "Castelli", "Alberdi", "Dorrego", "Güemes", "French"],
      "callesNS": ["Av. Libertad", "Constitución", "Independencia", "Maipú", "Chacabuco", "Tucumán", "Salta", "Jujuy"] },
    { "id": "sur", "nombre": "Barrio Sur", "offset": [-0.0095, -0.0010], "tramos": 34, "ductoPct": 0.05, "densidad": 0.9,
      "callesEO": ["Av. Perón", "Illia", "Frondizi", "Yrigoyen", "Alem", "Avellaneda", "Sáenz Peña", "Roca"],
      "callesNS": ["Av. Mosconi", "Bolívar", "Artigas", "O'Higgins", "Sucre", "Paraguay", "Uruguay", "Brasil"] },
    { "id": "oeste", "nombre": "Barrio Oeste", "offset": [0.0010, -0.0110], "tramos": 30, "ductoPct": 0.0, "densidad": 0.8,
      "callesEO": ["Los Andes", "Aconcagua", "Lanín", "Tronador", "Fitz Roy", "Champaquí", "Uritorco", "Famatina"],
      "callesNS": ["Los Aromos", "Los Ceibos", "Las Acacias", "Los Tilos", "Los Álamos", "Las Tipas", "Los Jacarandás", "Los Fresnos"] },
    { "id": "industrial", "nombre": "Parque Industrial", "offset": [-0.0040, 0.0115], "tramos": 30, "ductoPct": 0.15, "densidad": 1.1,
      "callesEO": ["Ruta Prov. 70", "Colectora Norte", "De los Talleres", "Av. de la Producción", "Metalúrgica", "Textil", "Láctea", "Colectora Sur"],
      "callesNS": ["Calle Pública 1", "Calle Pública 2", "Calle Pública 3", "Calle Pública 4", "Calle Pública 5", "Calle Pública 6", "Calle Pública 7", "Calle Pública 8"] }
  ]
};
