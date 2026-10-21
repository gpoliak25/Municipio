# Control de Ocupación de Infraestructura de Cableado — Demo

Demo web interactiva para municipios. Muestra cómo detectar, cuantificar, cobrar y sancionar el exceso de cables que los proveedores de cable e internet instalan en postes y ductos municipales.

> Municipio, proveedores, personas y montos son **ficticios**. No hay backend: todo corre en el navegador con datos simulados.

## Cómo correrla

**Opción 1: doble clic.** Abrir `index.html` con Chrome, Edge o Firefox.

**Opción 2: servidor local.** Recomendado para presentar.
```bash
npx serve .            # o: python -m http.server 8080
```
Después abrir `http://localhost:3000` (o el puerto que indique).

Hace falta internet para cargar las teselas del mapa (OpenStreetMap) y las librerías Leaflet y Chart.js desde un CDN gratuito. No se usan servicios pagos ni claves de API.

### Presentación sugerida (5 minutos)
1. Clic en **"Demo guiada"**, arriba a la derecha. La demo recorre sola el ciclo completo en 5 pasos (≈3,5 min): *dashboard → mapa → relevamiento con IA → cálculo y expediente → intimación, regularización del proveedor y mejora del indicador*.
2. Se puede **pausar**, **adelantar** o **salir** en cualquier momento.
3. La demo guiada siempre reinicia los datos, así que es repetible. El botón **"Reiniciar datos de la demo"** (barra lateral) vuelve todo al estado inicial.

## Pantallas

| # | Módulo | Qué muestra |
|---|--------|-------------|
| 1 | Tablero ejecutivo | Cables autorizados vs. detectados, % de exceso, recaudación actual vs. potencial, monto a recuperar, multas, regularizaciones, ranking de proveedores, evolución mensual y alertas de plazos |
| 2 | Mapa GIS | Tramos en semáforo (verde / amarillo / rojo / gris), filtros por proveedor, zona y estado, y detalle con foto, cargos y expediente |
| 3 | Relevamiento IA | Foto de muestra o subida (foto o video), detección simulada con recuadros, conteo y confianza, validación del inspector y evidencia con hash |
| 4 | Identificación | Precintos QR por cable, asignación a proveedor, alertas de cables sin identificar y en desuso |
| 5 | Motor de cobro | Tarifas configurables, simulador *what-if* en tiempo real y liquidación detallada paso a paso |
| 6 | Expedientes | Workflow de 7 etapas, semáforo de plazos, intimación imprimible (PDF) y régimen de regularización voluntaria |
| 7 | Portal del proveedor | Login simulado, tramos, declaración jurada, permisos con plano *as built*, deudas, boletas y pagos |
| 8 | Auditoría | Log encadenado con hash (con verificación y simulación de alteración) y matriz de roles y permisos |
| 9 | Planificación | Zonas candidatas para ducto compartido, costo, ingresos por alquiler de capacidad y plazo de recupero |

El **selector de Rol** (barra superior) cambia entre Administrador, Inspector, Hacienda, Legal y Proveedor. Las acciones se habilitan o bloquean según los permisos de cada rol, y cada cambio queda en la auditoría.

## Arquitectura

```
index.html              Estructura y carga de scripts (sin build)
css/styles.css          Estilos (paleta sobria + semáforo, responsive)
data/mock-data.js       CONFIGURACIÓN EN JSON: municipio, proveedores, zonas, tarifas, caso testigo
data/geo-tramos.js      Cuadras reales de OSM (generado; opcional)
js/util.js              Formatos es-AR, fechas, hash, modales, "foto" SVG del poste, QR/código de barras
js/store.js             Fuente única de verdad: generación de datos, motor de cálculo, workflow, auditoría
js/views/*.js           Una pantalla por archivo (render + refresh)
js/tour.js              Guion y motor de la demo guiada
js/app.js               Router por hash, menú, selector de rol
tools/generar-geometria.js  Descarga cuadras reales de OpenStreetMap para el mapa
```

- **Coherencia de datos:** todas las pantallas leen del mismo `Store`. El dashboard, el mapa y los expedientes calculan sus números sobre los mismos tramos, así que siempre coinciden. Cada acción (relevar, intimar, pagar…) actualiza el Store y todas las vistas se refrescan.
- **Datos determinísticos:** se generan con una semilla fija (`semilla` en la configuración). Siempre salen los mismos 180 tramos, con distribución ≈55 % cumple, 25 % exceso leve, 15 % crítico y 5 % sin relevar.
- **Persistencia:** el estado se guarda en `localStorage`, así que sobrevive a una recarga.

### Motor de cálculo (`Store.calcCargos`)
```
canon mensual   = autorizados × largo × tarifa por cable·metro·mes + tarifa por poste
exceso mensual  = exceso × largo × tarifa × (1 + recargo por exceso)
retroactivo     = exceso mensual × meses desde la instalación estimada
intereses       = retroactivo × interés mensual × (meses + 1) / 2   (interés simple sobre saldo promedio)
multa           = exceso × multa por cable
Regularización voluntaria (amnistía): sin recargo, sin intereses y sin multa.
```
Estados del tramo: **leve** hasta 50 % de cables por encima de lo autorizado; **crítico** más del 50 %.

## Cómo adaptarla a otro municipio

1. Editar `data/mock-data.js`:
   - `municipio`: nombre, área, ordenanza y **centro** (lat, lng) del mapa.
   - `proveedores`: nombres, CUIT, colores. `propension` controla cuánto incumple cada uno.
   - `zonas`: nombre, `offset` respecto del centro, cantidad de tramos y % de ductos.
   - `tarifas`, `amnistia` y `planificacion`: valores iniciales.
   - `casoDestacado`: el tramo que usa la demo guiada (por defecto **T-0042**: 5 cables autorizados y 10 detectados).
2. Regenerar la geometría para que los tramos caigan sobre calles reales del nuevo centro:
   ```bash
   node tools/generar-geometria.js
   ```
   (requiere Node 18+ e internet; consulta la API pública Overpass de OpenStreetMap). Si se borra `data/geo-tramos.js`, la demo usa una grilla sintética.
3. Recargar con **"Reiniciar datos de la demo"**, porque el estado anterior queda guardado en el navegador.

> Nota: el mapa base y las cuadras provienen de una ciudad real (OpenStreetMap, © colaboradores de OSM, licencia ODbL) que se usa sólo como escenario visual. Los nombres del municipio, los proveedores y todos los datos de ocupación son inventados.

## Limitaciones (es una demo)
- La "visión por computadora" es simulada: los recuadros y el conteo se generan sobre una imagen ilustrativa. En una foto subida, el conteo se toma del tramo.
- El PDF de la intimación y la boleta se generan con el diálogo de impresión del navegador ("Guardar como PDF").
- Login, pagos y firma digital son simulados.
