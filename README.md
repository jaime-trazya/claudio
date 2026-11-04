# Claudio · Finanzas

PWA de finanzas personales para iPhone, **sin backend**: todo se ejecuta en el navegador y los datos se guardan en el dispositivo (IndexedDB). Instalable con «Añadir a pantalla de inicio» y usable sin conexión.

👉 Instrucciones para usarla: **[GUIA_USO.md](GUIA_USO.md)**

## Funciones

- Cuentas (banco, tarjeta, efectivo, inversión), saldo calculado y transferencias que no cuentan como gasto.
- Importación de extractos PDF, CSV, XLS y XLSX con detección de columnas (formatos españoles, tablas PDF de una o varias líneas por movimiento, varias tablas por PDF), plantillas por banco, vista previa, duplicados y conciliación con pagos pendientes. Traspasos entre cuentas propias detectados.
- Pagos de Apple Pay mediante un Atajo de iOS que escribe en iCloud Drive.
- Categorías, reglas automáticas, «aplicar siempre», división de movimientos, notas y etiquetas.
- Presupuestos con avisos al 80 % y 100 %, recurrentes y suscripciones.
- Estadísticas: mes frente al anterior, gastos por categoría, ingresos y gastos (12 meses), saldo, top de gastos y comercios, tasa de ahorro, periodos personalizados.
- Trade Republic: lectura del PDF «Extracto del patrimonio neto» en el navegador (pdf.js), rentabilidad, reparto y patrimonio total.
- Copia de seguridad JSON (iCloud Drive), exportación CSV, modo claro y oscuro.

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # Vitest
npm run lint       # ESLint
npm run build      # build de producción en dist/
npm run ejemplos   # regenera los archivos de ejemplo (datos inventados)
npm run iconos     # regenera iconos y splash (necesita Playwright instalado)
```

Stack: Vite, React, TypeScript, Dexie (IndexedDB), SheetJS, pdf.js, Chart.js, Vitest, vite-plugin-pwa.

- `src/lib`, `src/import`, `src/domain`: lógica pura y probada (importes, fechas, lectura de extractos, duplicados, conciliación, Atajo, categorización, recurrentes, Trade Republic, estadísticas, inversiones).
- `src/db`: esquema versionado de Dexie (no modificar versiones publicadas; añadir una nueva con `.upgrade()`), copia de seguridad y acciones.
- `src/screens`, `src/ui`, `src/charts`: interfaz.
- `ejemplos/`: extractos, archivo del Atajo y PDF de Trade Republic **inventados** para pruebas.

Despliegue automático en GitHub Pages con `.github/workflows/deploy.yml` en cada push a `main` (`base` de Vite = `/claudio/`).

**Privacidad:** el repositorio es público. No subas extractos ni datos reales; el `.gitignore` bloquea `*.pdf`, `*.csv`, `*.xls`, `*.xlsx` y `*.json` fuera de `ejemplos/`.
