# Guía de uso de Claudio · Finanzas

Claudio es una app de finanzas personales que funciona **solo en tu iPhone**: no hay servidor, no hay registro y tus datos no salen del dispositivo. Se guardan en el propio navegador (IndexedDB) y se conservan al cerrar y volver a abrir la app.

---

## 1. Activar GitHub Pages (una sola vez)

1. Entra en el repositorio en GitHub → **Settings** → **Pages**.
2. En **Build and deployment** → **Source**, elige **GitHub Actions**.
3. Ve a la pestaña **Actions**: el flujo «Desplegar en GitHub Pages» se ejecuta en cada cambio en `main`. Si aún no se ha ejecutado, abre el flujo y pulsa **Run workflow**.
4. Cuando termine (marca verde), la app estará en:
   **https://jaime-trazya.github.io/claudio/**

> Cada vez que se suba un cambio a `main`, la web se actualiza sola. Tus datos no se tocan: la app te mostrará el aviso «Hay una versión nueva» y al pulsar **Actualizar** se recarga conservando todo.

---

## 2. Instalar la app en el iPhone

1. Abre **https://jaime-trazya.github.io/claudio/** en **Safari**.
2. Pulsa el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **Añadir a pantalla de inicio** → **Añadir**.
4. A partir de ahora, **ábrela siempre desde el icono**.

**Importante:** en iPhone, Safari y la app instalada guardan los datos por separado. Lo que hagas en Safari no aparecerá en el icono (y al revés). Usa siempre el icono y haz copias de seguridad (apartado 8).

La app funciona sin conexión una vez instalada.

---

## 3. Primeros pasos: las cuentas

La forma rápida: en Inicio pulsa **Elegir mis bancos** (o **Ajustes → Cuentas → Añadir mis bancos de golpe**), marca tus bancos (CaixaBank, Revolut, Trade Republic, Efectivo…) y pulsa **Crear**. Cada cuenta lleva el logotipo de su banco. Trade Republic crea dos cuentas ya enlazadas: «Trade Republic · efectivo» y «Trade Republic · inversión».

Al importar un extracto, la app reconoce el banco por el **IBAN** (o por su nombre en la cabecera) y lo mete en su cuenta automáticamente.

Si prefieres hacerlo a mano, ve a **Patrimonio → +** (o **Ajustes → Cuentas**) y crea:

- **Banco**: tu cuenta corriente o nómina. Pon el *saldo inicial* (el que tenías antes del primer movimiento que vayas a importar).
- **Tarjeta**: si tu tarjeta de crédito tiene extracto propio. En «Nombre de la tarjeta en Wallet» escribe el nombre exacto que aparece en Wallet (por ejemplo, «Visa Débito»); así los pagos del Atajo de Apple Pay irán a esa cuenta. Si pagas con la tarjeta de débito de tu cuenta del banco, pon ese nombre en la cuenta del banco.
- **Efectivo**: para los gastos en metálico.
- **Inversión**: para Trade Republic. En «Aportado antes de usar la app» pon lo que ya habías metido.

Las **transferencias entre cuentas** (botón **+** → **Traspaso**) no cuentan como gasto ni como ingreso. Si la cuenta de destino es de inversión, cuentan como **aportación**.

---

## 4. Crear el Atajo de Apple Pay (gastos automáticos)

Con este Atajo, cada vez que pagues con Apple Pay se añade una línea a un archivo en iCloud Drive. Luego la app lee ese archivo con el botón **Importar pagos del Atajo**.

**Formato del archivo** (`claudio-pagos.csv`, una línea por pago, separado por punto y coma):

```
fecha;comercio;importe;tarjeta
2026-10-03 19:12;Mercadona;23,45;Visa Débito
```

La primera línea (cabecera) es opcional. El importe puede llevar coma o punto y el símbolo €.

### Pasos en la app Atajos (iOS 17 o posterior)

1. Abre **Atajos** → pestaña **Automatización** → **+** (Nueva automatización).
2. Elige **Transacción** (aparece con el icono de Wallet).
3. En **Tarjeta**, marca tus tarjetas de Apple Pay. Deja todas las categorías y comercios.
4. Marca **Ejecutar inmediatamente** y desactiva **Notificar al ejecutar**. Pulsa **Siguiente**.
5. Elige **Nuevo atajo en blanco** y añade estas acciones, en este orden:
   1. **Fecha actual**.
   2. **Formatear fecha** → Formato de fecha: **Personalizado** → escribe `yyyy-MM-dd HH:mm`.
   3. **Texto**. Escribe dentro, usando las variables (mantén pulsado para insertarlas):
      `Fecha formateada;Comercio;Importe;Tarjeta o pase`
      - *Fecha formateada*: el resultado del paso anterior.
      - *Comercio*, *Importe* y *Tarjeta o pase*: toca **Entrada del atajo** y elige cada propiedad.
      - Entre cada una, un punto y coma `;` sin espacios.
   4. **Añadir al archivo de texto** (o «Añadir al archivo»):
      - Archivo: **iCloud Drive › Atajos › claudio-pagos.csv** (escribe la ruta `claudio-pagos.csv`).
      - Activa **Crear nueva línea**.
      - Desactiva **Preguntar dónde guardar** (si aparece).
6. Pulsa **OK**. La primera vez que pagues, iOS puede pedirte permiso para escribir en el archivo: concede **Permitir siempre**.

### Importar los pagos

En **Inicio**, pulsa **Importar pagos del Atajo** y elige `claudio-pagos.csv` en **Archivos → iCloud Drive → Atajos**.

- Los pagos nuevos se añaden como **pendientes de confirmar** y se categorizan con tus reglas.
- Los que ya estaban importados **no se repiten**, así que puedes importar el mismo archivo todas las veces que quieras.
- Cuando importes el extracto del banco, cada pago pendiente se empareja con su línea del banco y queda **confirmado** (sin duplicarse).

---

## 5. Importar el extracto del banco cada mes

### Descargar el extracto

En la web o la app de tu banco: **Cuentas → Movimientos**, elige las fechas (por ejemplo, el mes anterior completo) y pulsa **Descargar / Exportar**. Sirven **PDF**, **Excel (XLS/XLSX)** o **CSV**. En el iPhone, guárdalo en **Archivos** (iCloud Drive o «En mi iPhone»).

Formatos comprobados:

| Banco | Qué descargar | Cómo lo lee la app |
| --- | --- | --- |
| CaixaBank | Movimientos en PDF (o Excel) | Una línea por movimiento: concepto, fecha, importe y saldo. Puedes bajar años enteros de golpe. |
| Trade Republic (cuenta corriente) | «Extracto de cuenta» en PDF | Cada movimiento ocupa varias líneas (fecha partida, «Transacción con tarjeta»); entradas y salidas en columnas separadas. |
| Revolut | «Extracto» o «Extracto personalizado» en PDF | El PDF trae varias tablas (cuenta en euros, otras divisas, cuenta remunerada). La app te pregunta cuál importar: elige **Cuenta personal (EUR)**. |
| Otros bancos | PDF, Excel o CSV | Detección automática; si falla, eliges tú las columnas y se guarda como plantilla. |

> Si un PDF es una foto escaneada (sin texto), la app no puede leerlo: descárgalo en Excel o CSV.

> No pasa nada si las fechas se solapan con una importación anterior: los movimientos repetidos se detectan y se dejan fuera.

### Importarlo

1. En **Inicio**, pulsa **Importar extracto**.
2. Elige la **cuenta** y luego **Elegir archivo**.
3. La app detecta sola las columnas de fecha, concepto e importe (también con filas de título antes de la cabecera, fechas dd/mm/aaaa, coma decimal, columnas separadas de cargo y abono, y archivos en UTF-8 o Latin-1).
   - Si no las reconoce, verás la pantalla de **columnas**: indica cuál es cada una y, si quieres, escribe el nombre del banco en **Guardar como plantilla**. La próxima vez se usará sola.
4. En la **vista previa** verás:
   - **Nuevo**: se añadirá.
   - **Duplicado**: ya estaba (misma cuenta, fecha, importe y concepto). Sale desmarcado.
   - **Ya estaba (pendiente)**: coincide con un pago del Atajo o uno añadido a mano (mismo importe y hasta 3 días de diferencia). No se duplica: se confirma el existente y se completa con los datos del banco.
   - **Elige**: hay varias coincidencias posibles. Indica cuál es o «crear como nuevo».
   - Las transferencias con **«Trade Republic»** en el concepto se marcan como **Aportación** (no cuentan como gasto).
   - Los **traspasos entre tus propias cuentas** se marcan como **Traspaso** y no cuentan como gasto ni ingreso: recargas «Una recarga de Apple Pay», «Apple Pay Top up», «To/From Cuenta Remunerada» o los cargos «Revolut**…» en otro banco.
5. Si el extracto trae la columna de **saldo**, verás la casilla **Cuadrar el saldo de la cuenta con el del banco** (activada). La app usa el saldo que da el banco en cada movimiento, así que el saldo de la cuenta coincide siempre con el del banco, aunque el extracto no empiece el día que abriste la cuenta o el banco anote algunos movimientos con fecha valor.
6. Pulsa **Guardar**.

**Revolut (cuenta + Cuenta Remunerada):** el PDF trae las dos tablas. Pulsa **Importar las dos, cada una en su cuenta**: la principal va a «Revolut» y la de ahorro a «Revolut · Cuenta remunerada» (se crea sola). Los traspasos entre ambas se enlazan, así que las dos cuentas cuadran con Revolut, intereses incluidos.

Las cuentas de un mismo banco salen juntas con el **total del banco** (por ejemplo, Revolut = cuenta principal + Cuenta Remunerada) y, debajo de cada una, la fecha del extracto del que sale su saldo. Ojo: en el extracto de Revolut, «Cuenta personal (EUR)» y «Ahorros (EUR)» son dos cuentas distintas, cada una con su «Saldo de cierre».

**Sin duplicados:** antes de guardar, la app comprueba cada movimiento contra lo que ya tienes. Se considera repetido si coincide en concepto, o en fecha, importe y saldo del banco aunque el concepto venga escrito distinto, o si ya está en otra cuenta. Si vuelves a pasar un archivo que ya importaste, te avisa. Los repetidos salen marcados y no se guardan.

**Corregir saldo:** si el saldo de una cuenta no coincide con el de tu banco (por pagos que el extracto aún no incluye), abre la cuenta, escribe el saldo real y pulsa **Corregir**. Se añade un «Ajuste de saldo» que no cuenta como gasto ni ingreso.

**Si un traspaso tuyo no se detecta** (por ejemplo, «To Ana Ejemplo» cuando te pasas dinero a ti mismo): abre el movimiento, elige **Traspaso** y acepta **Aplicar siempre**. A partir de ahí se reconocerá solo.

**Consejo para no duplicar:** importa cada cuenta en su propia cuenta de la app (Caixa en «CaixaBank», Revolut en «Revolut», la cuenta corriente de Trade Republic en «Trade Republic efectivo»). Así un traspaso de Caixa a Revolut aparece como salida en una y entrada en otra, sin contar como gasto.

---

## 6. Trade Republic

Trade Republic tiene dos partes y la app las trata por separado:

- **Cuenta corriente** (tarjeta, recargas, compras y ventas): crea una cuenta tipo **Banco** (por ejemplo «Trade Republic efectivo») e importa su **«Extracto de cuenta»** en PDF desde **Importar extracto**, como cualquier banco. Los pagos con tarjeta son gastos normales; «Buy trade» y «Sell trade» cuentan como **aportación** (y las ventas la restan); los dividendos e intereses, como ingreso.
- **Inversiones** (ETF, acciones, cripto): crea una cuenta tipo **Inversión** («Trade Republic»). En «El efectivo de este bróker está en…» elige «Trade Republic efectivo»: así el efectivo no se cuenta dos veces en el patrimonio y lo aportado son tus compras menos tus ventas.

Si no importas la cuenta corriente, deja esa opción vacía: entonces cuenta como aportado lo que envías desde el banco con «Trade Republic» en el concepto.

### Extracto del patrimonio neto

1. En la app de Trade Republic, descarga el PDF **«Extracto del patrimonio neto»** (según la versión de la app, en **Perfil → Documentos** o en los informes de la cuenta) y guárdalo en **Archivos**.
2. En Claudio, elige el PDF desde cualquiera de estos sitios (si aún no tienes cuenta de inversión, se crea sola «Trade Republic · inversión»):
   - **Patrimonio → Importar extracto de patrimonio** (debajo del total).
   - **Importar extracto** (Inicio): reconoce que es el extracto de patrimonio y lo guarda como foto de tu cartera.
   - **Extracto de inversión** en Inicio. Se lee en el propio iPhone, sin enviarlo a ningún sitio.
3. Revisa la vista previa (fecha, posiciones con ISIN, unidades, precio y valor, criptoactivos, efectivo y total) y pulsa **Guardar foto de la cartera**.
   - Si importas dos veces el mismo extracto, no se duplica.
   - Si el PDF no se puede leer, usa **Meter valor a mano** con el total.
4. Verás el valor actual, lo aportado, la ganancia o pérdida en euros y en %, el reparto (ETF, cripto, acciones, efectivo) y la gráfica de valor frente a lo aportado.
5. A partir del día 3 de cada mes (configurable en Ajustes), Inicio te recordará importar el extracto del mes anterior.

**Patrimonio** muestra el total: saldo de las cuentas + valor de las inversiones, con su evolución.

---

## 7. Categorías, reglas y presupuestos

- **Categorías** (Ajustes → Categorías): hay categorías y subcategorías predefinidas con icono y color. Puedes cambiar nombre, icono y color, crear nuevas o borrarlas.
- **Reglas** (Ajustes → Reglas): si el concepto contiene una palabra clave (por ejemplo «mercadona»), el movimiento recibe una categoría. Hay muchas predefinidas (Mercadona, Lidl, Carrefour → Supermercado; Repsol, Cepsa → Gasolina; Netflix, Spotify → Suscripciones; Nómina → Sueldo; Bizum → Bizum…). Tus reglas tienen prioridad.
- Categorías pensadas para el día a día en España: **Supermercado** (Mercadona, Consum, Hiperber, Dia, Charter…), **Bares y copas**, **Restaurantes**, **Cafeterías** (incluidas máquinas de vending), **Tabaco y estancos**, **Gasolina** (también «Área de servicio»), **Apuestas y loterías**, **Videojuegos** (Steam, Keydrop…), **Seguridad Social y autónomos** (TGSS), **Transferencias recibidas**, **Traspaso entre cuentas**, etc. Si actualizas la app, las categorías nuevas se añaden solas sin tocar las tuyas.
- **Tu nombre** (Ajustes): escríbelo y los envíos a ti mismo («To Nombre Apellido», «Outgoing transfer for…») se marcarán como traspaso. Solo se guarda en tu iPhone.
- **Importar / exportar reglas** (Ajustes → Reglas): guarda tus reglas en un archivo o carga un archivo de reglas (por ejemplo, el que te preparen con los bares y tiendas de tu zona). Al importarlas se recategorizan los movimientos que ya tenías.
- **Aplicar siempre**: al cambiar la categoría de un movimiento, la app te pregunta si quieres aplicarla siempre a ese concepto. Si dices que sí, crea la regla y recategoriza los movimientos anteriores iguales.
- **Dividir**: en un movimiento, pulsa **Dividir en varias categorías** (por ejemplo, una compra con parte de supermercado y parte de hogar).
- **No contar en gastos**: en cualquier gasto o ingreso puedes activar este interruptor. El dinero sale (o entra) de la cuenta y el saldo cambia, pero no cuenta en gastos, ingresos, presupuestos, estadísticas ni recurrentes. Útil para un regalo puntual, algo que te van a devolver o un gasto que no quieres que te descuadre el mes. En Movimientos lo verás con «No cuenta», y puedes filtrarlos en **Estado → Que no cuentan en gastos**.
- **Notas y etiquetas**: en cada movimiento. El buscador de Movimientos también busca en ellas.
- **Presupuestos** (Análisis → Presupuestos): pon un límite mensual por categoría. Verás una barra de progreso y un aviso en Inicio al pasar del **80 %** y del **100 %**.
- **Recurrentes** (Análisis → Recurrentes): la app detecta sola los pagos que se repiten cada mes (suscripciones, recibos) y muestra el coste mensual y anual.
- **Cómo se calculan los números**:
  - **Ingresos y gastos** no incluyen traspasos entre tus cuentas ni aportaciones a inversión.
  - Una **devolución** (por ejemplo, de Uber o de una compra) resta del gasto de su categoría, no cuenta como ingreso.
  - **Traspasos entre tus cuentas**: se emparejan solos aunque vengan de extractos distintos (el cargo «Revolut**…» de CaixaBank con la recarga del mismo importe en Revolut, hasta 4 días de diferencia) y no cuentan. Los que no tienen pareja (dinero que entra desde o sale hacia una cuenta que no tienes en la app, como una recarga con otra tarjeta o un envío a tu imagin) cuentan como **Entradas desde otras cuentas** o **Salidas a otras cuentas**. Así siempre se cumple: ingresos − gastos = lo que varían tus saldos (más lo que aportas a inversión). Si añades esa otra cuenta, se emparejan y dejan de contar.
  - **Efectivo**: sacar del cajero es gasto («Retirada de efectivo») e ingresar en el cajero es ingreso («Ingreso de efectivo»).
  - **Bizum** se separa en «Bizum enviado» (gasto) y «Bizum recibido» (ingreso).
  - El mes en curso se compara con **los mismos días del mes anterior** (del 1 al 4 frente al 1 al 4), no con el mes anterior entero.
  - La **tasa de ahorro** es lo que te queda de lo que ingresas. Si gastas más del doble de lo que entra se muestra como «< −100 %».
  - En **Análisis**, las gráficas siguen el periodo elegido: con «Año» ves de enero a diciembre de ese año; con «Mes» o «Trimestre», los 12 meses que acaban ahí.
  - **Inversión**: lo aportado son las aportaciones de tus extractos más lo que indiques en la cuenta («Aportado que no aparece en tus extractos»). Si falta información, la app te lo avisa en vez de mostrar una rentabilidad inventada.
- **Gráficas en el móvil**: toca un mes en cualquier gráfica para ver su detalle debajo (ingresos, gastos, balance, ahorro) y **Ver movimientos**. En «Mes» y «Trimestre» puedes ver 6 o 12 meses.
- **Detalle de categoría**: en Análisis toca una categoría y **Ver evolución y comercios**: gasto mes a mes, media mensual y dónde gastas.
- **Próximos cargos**: Inicio muestra las suscripciones y recibos que toca pagar en los próximos días.
- **Objetivos de ahorro** (Patrimonio → Objetivos): cuánto quieres juntar y para cuándo. Puedes enlazarlo a una cuenta (por ejemplo, la Cuenta Remunerada) y la app te dice cuánto apartar cada mes.
- **Perfil personal**: en Ajustes → Reglas → **Importar reglas o perfil** puedes cargar un archivo con tus reglas, tu nombre y presupuestos sugeridos. Ese archivo es solo tuyo: no lo subas a GitHub.
- **Color de la app** (Ajustes): elige el color principal (o uno a tu gusto con el último círculo). Se adapta solo al modo claro y oscuro.
- **Primer día del mes** (Ajustes): si cobras a final de mes, puedes hacer que el mes contable empiece, por ejemplo, el día 25.

---

## 8. Copia de seguridad (¡importante!)

Tus datos solo están en tu iPhone. Si lo pierdes o lo cambias, la copia es la única forma de recuperarlos.

### Hacer la copia

1. **Ajustes → Exportar copia (JSON)**.
2. En la hoja de compartir, elige **Guardar en Archivos** → **iCloud Drive** (por ejemplo, una carpeta «Claudio») → **Guardar**.

La app te avisa en Inicio si han pasado **más de 30 días** desde la última copia.

### Restaurar la copia

1. **Ajustes → Restaurar una copia** y elige el archivo `copia-claudio-AAAA-MM-DD.json`.
2. Confirma. **Se sustituyen todos los datos actuales** por los de la copia.

También puedes **Exportar movimientos a CSV** para abrirlos en Numbers o Excel.

### Deshacer y volver atrás

Arriba del todo en **Ajustes → Tus datos**:

- **Deshacer lo último**: la app guarda un punto justo antes de cada acción importante (importar un extracto o los pagos del Atajo, aplicar o importar reglas, corregir un saldo, borrar una cuenta o categoría, restaurar una copia, eliminar todo). Al deshacer, todo vuelve a como estaba justo antes. Si te arrepientes, la siguiente vez aparece **Rehacer**.
- Tras importar, el aviso que sale abajo también tiene un botón **Deshacer**.
- **Volver a como estaba hace…**: una foto automática al día (al abrir la app) de los últimos 30 días, y los puntos de cada acción. Toca uno para volver ahí.
- Los puntos se guardan comprimidos en el iPhone y no entran en la copia de seguridad.

### Eliminar todos los datos

**Ajustes → Tus datos → Eliminar todos los datos** pide doble confirmación (hay que escribir BORRAR) y **se puede deshacer**. Si quieres que no quede nada, usa después **Eliminar también el historial**: eso ya no se puede deshacer, salvo con una copia de seguridad.

---

## Privacidad

- La app no usa servidores, cuentas ni servicios externos.
- El repositorio es público: **no subas nunca** extractos, copias de seguridad ni datos reales. El `.gitignore` ya bloquea los archivos `.pdf`, `.csv`, `.xls`, `.xlsx` y `.json` fuera de la carpeta `ejemplos/`, que solo contiene datos inventados.
