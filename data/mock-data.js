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
    "nombre": "Municipalidad de José C. Paz",
    "nombreCorto": "José C. Paz",
    "area": "Secretaría de Obras y Servicios Públicos",
    "ordenanza": "Ordenanza Fiscal e Impositiva",
    "provincia": "Provincia de Buenos Aires",
    "domicilio": "Av. Gaspar Campos 6151, José C. Paz, Provincia de Buenos Aires",
    "centro": [-34.5205, -58.7525],
    "zoom": 13
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
    "calle": "General Lavalle",
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
      "domicilio": "Av. Héctor Arregui 1450, José C. Paz", "representante": "Ing. Martín Rojas",
      "email": "regulatorio@conectarsur.com.ar", "permisoMarco": "PERM-CSU-2023-0457",
      "color": "#2a78d6", "presencia": 1.4, "propension": 1.7 },
    { "id": "FNL", "nombre": "FibraNet Bonaerense S.R.L.", "corto": "FibraNet", "cuit": "30-70987654-3",
      "domicilio": "Av. José Altube 820, José C. Paz", "representante": "Lic. Carolina Méndez",
      "email": "permisos@fibranet.com.ar", "permisoMarco": "PERM-FNL-2022-0311",
      "color": "#eb6834", "presencia": 1.2, "propension": 1.0 },
    { "id": "TCP", "nombre": "TeleCable Conurbano S.A.", "corto": "TeleCable", "cuit": "30-69876543-1",
      "domicilio": "Roque Sáenz Peña 1220, José C. Paz", "representante": "Sr. Hernán Paz",
      "email": "obras@telecableconurbano.com.ar", "permisoMarco": "PERM-TCP-2019-0102",
      "color": "#1baf7a", "presencia": 1.0, "propension": 0.55 },
    { "id": "RAD", "nombre": "Red Andina Datos S.A.", "corto": "Red Andina", "cuit": "30-71555444-6",
      "domicilio": "Av. Pte. Hipólito Yrigoyen 3100, José C. Paz", "representante": "Ing. Sofía Gutiérrez",
      "email": "infraestructura@redandina.com.ar", "permisoMarco": "PERM-RAD-2024-0588",
      "color": "#6250d6", "presencia": 0.8, "propension": 1.3 },
    { "id": "WFX", "nombre": "Wiflux Comunicaciones S.A.S.", "corto": "Wiflux", "cuit": "30-71888999-2",
      "domicilio": "Federico Lacroze 455, José C. Paz", "representante": "Sr. Tomás Ibarra",
      "email": "legales@wiflux.com.ar", "permisoMarco": "PERM-WFX-2025-0614",
      "color": "#e87ba4", "presencia": 0.6, "propension": 0.35 }
  ],

  "zonas": [
    { "id": "centro", "nombre": "Centro", "offset": [0.0000, 0.0000], "tramos": 50, "ductoPct": 0.25, "densidad": 1.4,
      "callesEO": ["Avenida Presidente Hipólito Yrigoyen", "Roque Sáenz Peña", "Cristóbal Colón", "Gelly y Obes", "Granaderos a Caballo", "José Matías Zapiola", "Rivadavia", "Zuviría"],
      "callesNS": ["General Lavalle", "Avenida José Altube", "Avenida Héctor Arregui", "José C. Paz", "Doctor Marcelo Fitte", "Federico Lacroze", "Santiago L. Copello", "Oliverio Girondo"] },
    { "id": "santarita", "nombre": "Santa Rita", "offset": [0.0135, 0.0055], "tramos": 36, "ductoPct": 0.05, "densidad": 1.05,
      "callesEO": ["18 de Octubre", "Polonia", "Canning", "Blanco Encalada", "Matheu", "Labardén", "Manuel de Pinazo", "Piñero"],
      "callesNS": ["Manuel Luis de Oliden", "Marcelo de Alvear", "Manuel de Pinazo", "Piñero", "18 de Octubre", "Polonia", "Canning", "Matheu"] },
    { "id": "pinero", "nombre": "Piñero", "offset": [-0.0125, -0.0095], "tramos": 34, "ductoPct": 0.03, "densidad": 0.9,
      "callesEO": ["Rudecindo Alvarado", "Julián Martel", "Combate de los Pozos", "Coronel Suárez", "Coronel Arias", "Bulnes", "Muñíz", "Curupaytí"],
      "callesNS": ["Maestro Sarmiento", "Antártida Argentina", "Platón", "General Lavalle", "José A. Casacuberta", "Rudecindo Alvarado", "Julián Martel", "Coronel Arias"] },
    { "id": "vucetich", "nombre": "Juan Vucetich", "offset": [0.0115, -0.0375], "tramos": 30, "ductoPct": 0, "densidad": 0.8,
      "callesEO": ["Juana Manuela Gorriti", "Atenas", "Europa", "Centenario", "Lima", "Helsinki", "Berna", "Dublin"],
      "callesNS": ["Federico Lacroze", "Fray Butler", "Uspallata", "Grito de Asencio", "Mónaco", "Londres", "Atenas", "Europa"] },
    { "id": "solyverde", "nombre": "Sol y Verde", "offset": [0.0275, -0.0525], "tramos": 30, "ductoPct": 0.02, "densidad": 1.1,
      "callesEO": ["Miguel Ángel Buonarroti", "3 de Febrero", "Rodríguez Etchart", "Moliere", "Magallanes", "Humboldt", "Sebastián Elcano", "Santiago de Liniers"],
      "callesNS": ["Juana Manuela Gorriti", "Santiago de Liniers", "Sebastián Elcano", "Humboldt", "Magallanes", "Moliere", "3 de Febrero", "Rodríguez Etchart"] }
  ]
};
