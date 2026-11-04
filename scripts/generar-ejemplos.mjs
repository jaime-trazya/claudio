/**
 * Genera los archivos de ejemplo de la carpeta ejemplos/.
 * TODOS LOS DATOS SON INVENTADOS: nombres, cuentas, importes y comercios de prueba.
 * Uso: npm run ejemplos
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

const OUT = path.resolve(import.meta.dirname, '../ejemplos')
fs.mkdirSync(OUT, { recursive: true })

const pad = (n) => String(n).padStart(2, '0')
const dmy = (iso, sep = '/', short = false) => {
  const [y, m, d] = iso.split('-')
  return `${d}${sep}${m}${sep}${short ? y.slice(2) : y}`
}
/** 1234.5 → "1.234,50" */
const es = (n) => {
  const neg = n < 0
  const [int, dec] = Math.abs(n).toFixed(2).split('.')
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '-' : ''}${withDots},${dec}`
}
const round2 = (n) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Banco 1: cuenta nómina. CSV con ";" en Latin-1, 5 filas antes de la cabecera,
// fechas dd/mm/aaaa, coma decimal, punto de miles, importes con signo. Agosto–octubre 2026.
// ---------------------------------------------------------------------------
function cuentaNomina() {
  const tx = []
  const add = (date, concept, amount) => tx.push({ date, concept, amount })
  const luz = { '08': -54.32, '09': -61.1, '10': -58.75 }
  for (const m of ['08', '09', '10']) {
    const prev = m === '08' ? '07' : pad(Number(m) - 1)
    if (m !== '08') add(`2026-${prev}-28`, 'NOMINA EMPRESA FICTICIA SL', 2150)
    add(`2026-${m}-01`, 'RECIBO ALQUILER INMOBILIARIA INVENTADA', -750)
    add(`2026-${m}-03`, 'RECIBO GIMNASIO BASIC FIT ESPAÑA', -24.99)
    add(`2026-${m}-05`, 'RECIBO IBERDROLA CLIENTES SAU', luz[m])
    add(`2026-${m}-08`, 'COMPRA TARJ. 4000XXXX0001 NETFLIX.COM', -13.99)
    add(`2026-${m}-10`, 'TRANSFERENCIA A TRADE REPUBLIC BANK GMBH', -200)
    add(`2026-${m}-12`, 'COMPRA TARJ. 4000XXXX0001 SPOTIFY P1234567', -11.99)
    add(`2026-${m}-20`, 'RECIBO VODAFONE ESPAÑA SAU', -35)
  }
  add('2026-08-04', 'COMPRA TARJ. 4000XXXX0001 MERCADONA VALENCIA', -48.3)
  add('2026-08-14', 'COMPRA TARJ. 4000XXXX0001 REPSOL E.S. AV. INVENTADA', -52.4)
  add('2026-08-18', 'BIZUM ENVIADO A LUCIA PRUEBA CENA', -18)
  add('2026-08-22', 'COMPRA TARJ. 4000XXXX0001 LIDL SUPERMERCADOS', -31.75)
  add('2026-09-06', 'COMPRA TARJ. 4000XXXX0001 MERCADONA VALENCIA', -61.2)
  add('2026-09-15', 'BIZUM RECIBIDO DE MARIO EJEMPLO REGALO', 25)
  add('2026-09-19', 'COMPRA TARJ. 4000XXXX0001 CEPSA ESTACION SERVICIO', -47.9)
  add('2026-09-25', 'COMPRA TARJ. 4000XXXX0001 AMAZON EU SARL', -29.99)
  // Octubre: estos pagos también están en el archivo del Atajo (para la conciliación)
  add('2026-10-04', 'COMPRA TARJ. 4000XXXX0001 MERCADONA VALENCIA', -23.45)
  add('2026-10-08', 'COMPRA TARJ. 4000XXXX0001 CAFETERIA CENTRAL', -4.5)
  add('2026-10-16', 'COMPRA TARJ. 4000XXXX0001 REPSOL E.S. AV. INVENTADA', -45.2)
  add('2026-10-21', 'COMPRA TARJ. 4000XXXX0001 ZARA ONLINE', -39.95)
  add('2026-10-24', 'COMPRA TARJ. 4000XXXX0001 MERCADONA VALENCIA', -67.8)
  add('2026-10-27', 'BIZUM ENVIADO A LUCIA PRUEBA', -12)
  add('2026-10-28', 'NOMINA EMPRESA FICTICIA SL', 2150)
  add('2026-10-30', 'COMISION MANTENIMIENTO CUENTA', -2)
  tx.sort((a, b) => a.date.localeCompare(b.date))
  let saldo = 1840.25
  for (const t of tx) {
    saldo = round2(saldo + t.amount)
    t.saldo = saldo
  }
  return tx
}

function writeLatin1(file, text) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(text, 'latin1'))
}

const nomina = cuentaNomina()
{
  const head = [
    'Movimientos de cuenta;',
    'Titular:;ANA EJEMPLO INVENTADO',
    'Cuenta:;ES00 0000 0000 0000 0000 0000',
    'Periodo:;01/08/2026 - 31/10/2026',
    ';',
    'Fecha operación;Fecha valor;Concepto;Importe;Saldo',
  ]
  // Los bancos suelen listar del más reciente al más antiguo
  const body = [...nomina].reverse().map((t) => `${dmy(t.date)};${dmy(t.date)};${t.concept};${es(t.amount)};${es(t.saldo)}`)
  writeLatin1('extracto-banco-cuenta-nomina.csv', [...head, ...body].join('\r\n') + '\r\n')
}

// Extracto solapado: del 20/10 al 03/11 (las filas de octubre ya estaban importadas)
{
  const extra = [
    { date: '2026-11-01', concept: 'RECIBO ALQUILER INMOBILIARIA INVENTADA', amount: -750 },
    { date: '2026-11-02', concept: 'COMPRA TARJ. 4000XXXX0001 LIDL SUPERMERCADOS', amount: -27.6 },
    { date: '2026-11-03', concept: 'RECIBO GIMNASIO BASIC FIT ESPAÑA', amount: -24.99 },
  ]
  let saldo = nomina[nomina.length - 1].saldo
  for (const t of extra) {
    saldo = round2(saldo + t.amount)
    t.saldo = saldo
  }
  const rows = [...nomina.filter((t) => t.date >= '2026-10-20'), ...extra]
  const head = ['Movimientos de cuenta;', 'Titular:;ANA EJEMPLO INVENTADO', 'Cuenta:;ES00 0000 0000 0000 0000 0000', ';', 'Fecha operación;Fecha valor;Concepto;Importe;Saldo']
  const body = rows.reverse().map((t) => `${dmy(t.date)};${dmy(t.date)};${t.concept};${es(t.amount)};${es(t.saldo)}`)
  writeLatin1('extracto-banco-cuenta-nomina-solapado.csv', [...head, ...body].join('\r\n') + '\r\n')
}

// ---------------------------------------------------------------------------
// Banco 2: tarjeta de crédito. CSV UTF-8 con "," y comillas, columnas Cargo/Abono separadas,
// fechas dd/mm/aa.
// ---------------------------------------------------------------------------
{
  const rows = [
    ['2026-10-02', 'IKEA ALFAFAR', 89.99, null],
    ['2026-10-05', 'RYANAIR DAC', 64.98, null],
    ['2026-10-09', 'GLOVO APP PEDIDO', 18.4, null],
    ['2026-10-11', 'DEVOLUCION IKEA ALFAFAR', null, 15],
    ['2026-10-15', 'FARMACIA PLAZA INVENTADA', 12.35, null],
    ['2026-10-18', 'CINESA CENTRO', 21, null],
    ['2026-10-23', 'MEDIA MARKT VALENCIA', 1249, null],
    ['2026-10-29', 'PAGO RECIBO TARJETA', null, 300],
  ]
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`
  const lines = ['"F. Operación","Descripción","Cargo","Abono","Saldo pendiente"']
  let pendiente = 0
  for (const [date, desc, cargo, abono] of rows) {
    pendiente = round2(pendiente + (cargo ?? 0) - (abono ?? 0))
    lines.push([q(dmy(date, '/', true)), q(desc), q(cargo ? es(cargo) : ''), q(abono ? es(abono) : ''), q(es(pendiente))].join(','))
  }
  fs.writeFileSync(path.join(OUT, 'extracto-tarjeta-credito.csv'), '﻿' + lines.join('\n') + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// Banco 3: XLSX con filas de título, fechas como fechas de Excel e importes numéricos.
// ---------------------------------------------------------------------------
{
  const data = [
    ['BANCO INVENTADO S.A.'],
    ['Extracto de movimientos', null, null, 'Generado el 01/11/2026'],
    [],
    ['Fecha', 'Descripción', 'Importe (EUR)', 'Saldo (EUR)'],
  ]
  const movs = [
    ['2026-10-01', 'Transferencia recibida Ana Ejemplo', 500],
    ['2026-10-06', 'Pago con tarjeta Carrefour Express', -15.62],
    ['2026-10-13', 'Recibo Mapfre seguro hogar', -28.4],
    ['2026-10-19', 'Pago con tarjeta Decathlon', -45.99],
    ['2026-10-25', 'Retirada cajero', -60],
    ['2026-10-31', 'Intereses cuenta remunerada', 1.23],
  ]
  let saldo = 1200
  for (const [d, desc, imp] of movs) {
    saldo = round2(saldo + imp)
    const [y, m, dd] = d.split('-').map(Number)
    data.push([new Date(Date.UTC(y, m - 1, dd)), desc, imp, saldo])
  }
  const ws = XLSX.utils.aoa_to_sheet(data, { cellDates: true })
  for (let r = 4; r < data.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })]
    if (cell) cell.z = 'dd/mm/yyyy'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')
  fs.writeFileSync(path.join(OUT, 'extracto-cuenta-ahorro.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// ---------------------------------------------------------------------------
// Banco 4: sin cabecera, separado por tabuladores, fechas dd.mm.aaaa y signo menos al final.
// ---------------------------------------------------------------------------
{
  const movs = [
    ['2026-10-03', 'ADEUDO SEPA ENDESA ENERGIA', -41.3],
    ['2026-10-07', 'PAGO MOVIL EN LIDL', -22.15],
    ['2026-10-14', 'TRANSFERENCIA RECIBIDA REEMBOLSO', 35],
    ['2026-10-22', 'PAGO MOVIL EN STARBUCKS', -5.6],
  ]
  const lines = movs.map(([d, c, a]) => `${dmy(d, '.')}\t${c}\t${es(Math.abs(a))}${a < 0 ? '-' : ''}`)
  fs.writeFileSync(path.join(OUT, 'extracto-sin-cabecera.txt'), lines.join('\n') + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// Archivo del Atajo de Apple Pay (iCloud Drive/Atajos/claudio-pagos.csv)
// ---------------------------------------------------------------------------
{
  const lines = [
    'fecha;comercio;importe;tarjeta',
    '2026-10-03 19:12;Mercadona;23,45;Visa Débito', // banco: 04/10 → se concilia
    '2026-10-07 08:41;Café Central;4,50;Visa Débito', // dos cafés iguales: el banco solo trae uno (dudoso)
    '2026-10-08 08:37;Café Central;4,50;Visa Débito',
    '2026-10-15 09:10;Repsol;€45.20;Visa Débito', // formato con punto y €
    '2026-10-21 17:30;ZARA;39,95 €;Visa Débito',
    '2026-10-31 21:05;Glovo;16,90;Visa Débito', // aún no está en el extracto: queda pendiente
  ]
  fs.writeFileSync(path.join(OUT, 'atajo-pagos-apple-pay.csv'), lines.join('\n') + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// PDF con la estructura del "Extracto del patrimonio neto" de Trade Republic (inventado)
// ---------------------------------------------------------------------------
const securities = [
  { units: 25.123456, name: 'iShares Core MSCI World USD (Acc)', isin: 'IE00B4L5Y983', price: 98.45 },
  { units: 10.5, name: 'Vanguard FTSE All-World UCITS ETF', name2: 'USD Accumulating', isin: 'IE00BK5BQT80', price: 125.32 },
  { units: 2, name: 'Apple Inc.', isin: 'US0378331005', price: 210.15 },
].map((s) => ({ ...s, value: round2(s.units * s.price) }))
const cryptos = [
  { units: 0.012345, name: 'Bitcoin (BTC)', price: 58432.1 },
  { units: 0.25, name: 'Ethereum (ETH)', price: 2345.67 },
].map((s) => ({ ...s, value: round2(s.units * s.price) }))
const efectivo = 312.45
const totalValores = round2(securities.reduce((s, p) => s + p.value, 0))
const totalCripto = round2(cryptos.reduce((s, p) => s + p.value, 0))
const total = round2(totalValores + totalCripto + efectivo)
const unitsES = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 6, minimumFractionDigits: 0 })

function pdf(pages) {
  // pages: [{ texts: [{x,y,size,bold,text}] }]
  const objects = []
  const add = (body) => {
    objects.push(body)
    return objects.length
  }
  const fontR = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  const pagesId = objects.length + 1
  add('PAGES_PLACEHOLDER')
  const pageIds = []
  for (const p of pages) {
    // WinAnsiEncoding: el € es el byte 0x80
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/€/g, '\x80')
    const stream = p.texts
      .map((t) => `BT /${t.bold ? 'F2' : 'F1'} ${t.size ?? 9} Tf ${t.x} ${t.y} Td (${esc(t.text)}) Tj ET`)
      .concat(p.lines ?? [])
      .join('\n')
    const bytes = Buffer.from(stream, 'latin1')
    const contentId = add(`<< /Length ${bytes.length} >>\nstream\n${stream}\nendstream`)
    pageIds.push(
      add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontR} 0 R /F2 ${fontB} 0 R >> >> /Contents ${contentId} 0 R >>`),
    )
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  const info = add('<< /Title (Extracto del patrimonio neto - EJEMPLO INVENTADO) /Producer (claudio generar-ejemplos) >>')
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

{
  const FECHA = '31.10.2026'
  const p1 = []
  const T = (x, y, text, size = 8, bold = false) => p1.push({ x, y, text, size, bold })
  T(74, 790, 'TRADE REPUBLIC BANK GMBH, SUCURSAL EN ESPAÑA', 8, true); T(241, 790, 'DIRECCIÓN DE LA ENTIDAD (EJEMPLO)', 7)
  T(75, 760, 'ANA EJEMPLO INVENTADO', 9)
  T(389, 750, 'FECHA', 8); T(482, 750, FECHA, 8)
  T(75, 741, 'Calle Falsa 123', 9)
  T(389, 732, 'CUENTA DE VALORES', 8); T(477, 732, '0000000000', 8)
  T(75, 722, '00000 Ciudad Inventada', 9)
  T(74, 690, 'EXTRACTO DEL PATRIMONIO NETO', 14, true)
  T(74, 674, `a ${FECHA}`, 9)
  T(74, 640, 'CARTERA', 10, true); T(484, 640, 'VALOR EN EUR', 7, true)
  T(74, 624, 'Cuenta de valores', 9); T(498, 624, es(totalValores), 9)
  T(74, 610, 'Wallet Crypto', 9); T(507, 610, es(totalCripto), 9)
  T(74, 596, 'Efectivo', 9); T(507, 596, es(efectivo), 9)
  T(74, 580, 'TOTAL', 9, true); T(483, 580, `${es(total)} EUR`, 9, true)
  T(74, 548, 'CUENTA DE VALORES', 10, true)
  T(74, 534, `Extracto de los valores de Cuenta de valores en tu cuenta de valores 0000000000 a ${FECHA}.`, 7)
  T(74, 518, 'UNIDADES / NOMINAL', 7, true); T(141, 518, 'NOMBRE DEL VALOR', 7, true); T(365, 518, 'PRECIO POR UNIDAD', 7, true); T(484, 518, 'VALOR EN EUR', 7, true)
  let y = 500
  securities.forEach((s, i) => {
    // La primera posición lleva "unidades" en la línea de abajo; el resto, en la misma línea
    if (i === 0) {
      T(74, y, unitsES(s.units), 9); T(141, y, s.name, 9); T(365, y, es(s.price), 9); T(502, y, es(s.value), 9)
      y -= 11
      T(74, y, 'unidades', 8); T(141, y, `ISIN: ${s.isin}`, 8); T(365, y, FECHA, 8)
    } else {
      T(74, y, `${unitsES(s.units)} unidades ${s.name}`, 9); T(365, y, es(s.price), 9); T(502, y, es(s.value), 9)
      if (s.name2) {
        y -= 11
        T(141, y, s.name2, 9)
      }
      y -= 11
      T(141, y, `ISIN: ${s.isin}`, 8); T(365, y, FECHA, 8)
    }
    y -= 11
    T(141, y, 'Cuenta de valores en Alemania', 7)
    y -= 10
    T(141, y, 'País de custodia: Irlanda', 7)
    y -= 18
  })
  T(141, y, `NÚMERO DE POSICIONES: ${securities.length}`, 8); T(483, y, `${es(totalValores)} EUR`, 8)
  y -= 34
  T(74, y, 'WALLET CRYPTO', 10, true)
  y -= 14
  T(74, y, `Extracto de los criptoactivos en tu Wallet Crypto a ${FECHA}.`, 7)
  y -= 16
  T(74, y, 'UNIDADES / NOMINAL', 7, true); T(141, y, 'NOMBRE DEL VALOR', 7, true); T(365, y, 'PRECIO POR UNIDAD', 7, true); T(484, y, 'VALOR EN EUR', 7, true)
  y -= 18
  for (const c of cryptos) {
    T(74, y, `${unitsES(c.units)} unidades ${c.name.replace(/ \(.*\)/, '')}`, 9); T(365, y, es(c.price), 9); T(507, y, es(c.value), 9)
    y -= 11
    T(141, y, c.name.match(/\((\w+)\)/)[1], 8); T(365, y, FECHA, 8)
    y -= 22
  }
  T(141, y, `NÚMERO DE POSICIONES: ${cryptos.length}`, 8); T(492, y, `${es(totalCripto)} EUR`, 8)
  y -= 34
  T(74, y, 'EFECTIVO', 10, true)
  y -= 14
  T(74, y, `Extracto del efectivo en tu cuenta corriente a ${FECHA}.`, 7)
  T(73, 60, 'Trade Republic Bank GmbH · Documento de ejemplo con datos inventados', 6); T(289, 60, 'Registrada en el Registro Mercantil con el número HRB 000000 B', 6)
  T(74, 40, 'Creado en 2026-10-31 21:30:43 Europe/Madrid (UTC+01:00)', 6); T(482, 40, 'Página 1 de 2', 6)

  const p2 = []
  const T2 = (x, yy, text, size = 8, bold = false) => p2.push({ x, y: yy, text, size, bold })
  T2(74, 790, 'TRADE REPUBLIC BANK GMBH, SUCURSAL EN ESPAÑA', 8, true)
  T2(74, 760, 'PRODUCTO', 7, true); T2(497, 760, 'BALANCE', 7, true)
  T2(74, 744, 'Cuenta corriente', 9); T2(492, 744, `${es(efectivo)} EUR`, 9)
  T2(73, 60, 'Trade Republic Bank GmbH · Documento de ejemplo con datos inventados', 6)
  T2(74, 40, 'Creado en 2026-10-31 21:30:43 Europe/Madrid (UTC+01:00)', 6); T2(482, 40, 'Página 2 de 2', 6)

  fs.writeFileSync(path.join(OUT, 'trade-republic-extracto-patrimonio.pdf'), pdf([{ texts: p1 }, { texts: p2 }]))
  fs.writeFileSync(
    path.join(OUT, 'trade-republic-esperado.json'),
    JSON.stringify({ date: '2026-10-31', securities, cryptos, efectivo, totalValores, totalCripto, total }, null, 2) + '\n',
  )
}

// ---------------------------------------------------------------------------
// Extractos bancarios en PDF (datos inventados) que imitan tres maquetaciones habituales
// ---------------------------------------------------------------------------
const esPdfDate = (iso) => {
  const [y, m, d] = iso.split('-')
  return { dmy: `${d}/${m}/${y}`, short: `${Number(d)} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'][Number(m) - 1]}`, y }
}
const pdfExpected = {}

// A) Una línea por movimiento (estilo CaixaBank): Concepto | Fecha | Importe € | Saldo €
{
  const movs = [
    ['ESTANCO EJEMPLO', '2026-10-31', -10.8], ['BAR LA PRUEBA', '2026-10-30', -12], ['BIZUM RECIBIDO', '2026-10-30', 9],
    ['HIPER INVENTADO', '2026-10-29', -23.4], ['REINT.CAJERO', '2026-10-28', -40], ['TRANSF. A SU FAVOR', '2026-10-28', 310],
    ['APPLE.COM/BILL', '2026-10-27', -9.99], ['GASOLINERA FICTICIA', '2026-10-26', -45], ['BIZUM ENVIADO', '2026-10-25', -10.5],
    ['RESTAURANTE EJEMPLO', '2026-10-24', -31.2], ['NOMINA EMPRESA FICTICIA', '2026-10-24', 1250], ['RECIBO LUZ INVENTADA', '2026-10-22', -48.36],
    ['SUPERMERCADO PRUEBA', '2026-10-21', -17.85], ['PARKING DEMO', '2026-10-20', -2.1], ['FARMACIA EJEMPLO', '2026-10-19', -6.4],
    ['ESTANCO EJEMPLO', '2026-10-18', -8.1], ['TIENDA ONLINE DEMO', '2026-10-17', -22.49], ['BAR LA PRUEBA', '2026-10-16', -15],
    ['INGRESO CAJERO', '2026-10-15', 100], ['SUPERMERCADO PRUEBA', '2026-10-14', -36.7], ['CINE FICTICIO', '2026-10-12', -14],
    ['RECIBO GIMNASIO DEMO', '2026-10-10', -29.9], ['HIPER INVENTADO', '2026-10-09', -4.05], ['BIZUM RECIBIDO', '2026-10-08', 20],
    ['GASOLINERA FICTICIA', '2026-10-06', -40], ['ESTANCO EJEMPLO', '2026-10-03', -9.3],
  ]
  // Saldos: el más reciente arriba
  const startBalance = 250
  const asc = [...movs].reverse()
  let bal = startBalance
  const saldo = new Map()
  asc.forEach((m, i) => { bal = round2(bal + m[2]); saldo.set(asc.length - 1 - i, bal) })
  const pages = []
  const perPage = 14
  for (let p = 0; p * perPage < movs.length; p++) {
    const texts = []
    const shift = p === 0 ? 0 : -5 // en algunas páginas las columnas se desplazan unos puntos
    const T = (x, y, text, size = 8) => texts.push({ x, y, text, size })
    T(524, 786, `${p + 1}/2`, 7)
    T(50, 719, 'IBAN:', 8); T(77, 719, 'ES00 0000 0000 0000 0000 0000', 8); T(273, 719, 'Saldo disponible:', 8); T(350, 719, es(bal), 8); T(378, 719, '€', 8)
    T(50, 697, 'Periodo:', 8); T(89, 697, '01/10/2026 - 31/10/2026', 8)
    T(51, 638, 'Concepto', 8); T(272 + shift, 638, 'Fecha', 8); T(383 + shift, 638, 'Importe', 8); T(468 + shift, 638, 'Saldo', 8)
    let y = 611
    movs.slice(p * perPage, (p + 1) * perPage).forEach((m, k) => {
      const i = p * perPage + k
      T(51, y, m[0], 8); T(272 + shift, y, esPdfDate(m[1]).dmy, 8); T(383 + shift, y, es(m[2]), 8); T(409 + shift, y, '€', 8); T(468 + shift, y, es(saldo.get(i)), 8); T(496 + shift, y, '€', 8)
      y -= 29
    })
    pages.push({ texts })
  }
  fs.writeFileSync(path.join(OUT, 'extracto-pdf-una-linea.pdf'), pdf(pages))
  pdfExpected.unaLinea = { movements: movs.length, sum: round2(movs.reduce((s, m) => s + m[2], 0)), start: startBalance, end: bal }
}

// B) Varias líneas por movimiento (estilo Trade Republic): fecha partida, tipo en dos líneas,
//    columnas separadas de entrada y salida de dinero, cabecera en tres líneas
{
  const movs = [
    { d: '2026-10-01', tipo: ['Transferencia'], desc: ['Apple Pay Top up'], in: 150 },
    { d: '2026-10-02', tipo: ['Operar'], desc: ['Buy trade IE00B4L5Y983 EJEMPLO ETF WORLD, quantity:', '0.512345'], out: 50 },
    { d: '2026-10-05', tipo: ['Transacción con', 'tarjeta'], desc: ['CAFETERIA INVENTADA'], out: 3.2 },
    { d: '2026-10-09', tipo: ['Transacción con', 'tarjeta'], desc: ['SUPERMERCADO DEMO'], out: 27.45 },
    { d: '2026-10-15', tipo: ['Rentabilidad'], desc: ['Cash Dividend for ISIN US0000000000'], in: 0.37, merged: true },
    { d: '2026-10-18', tipo: ['Operar'], desc: ['Sell trade IE00B4L5Y983 EJEMPLO ETF WORLD, quantity:', '0.100000'], in: 10.1, descAbove: true },
    { d: '2026-10-22', tipo: ['Transacción con', 'tarjeta'], desc: ['FARMACIA PRUEBA'], out: 8.95 },
    { d: '2026-10-25', tipo: ['Transferencia'], desc: ['Outgoing transfer for Ana Ejemplo'], out: 40, merged: true },
    { d: '2026-10-29', tipo: ['Intereses'], desc: ['Interest payment'], in: 0.21 },
  ]
  let bal = 0
  const header = (T, y) => {
    T(399, y + 3, 'ENTRADA DE', 6); T(447, y + 3, 'SALIDA DE', 6)
    T(74, y, 'FECHA', 7); T(113, y, 'TIPO', 7); T(180, y, 'DESCRIPCIÓN', 7); T(495, y, 'BALANCE', 7)
    T(399, y - 3, 'DINERO', 6); T(447, y - 3, 'DINERO', 6)
  }
  const footer = (T, n) => {
    T(73, 70, 'Trade Republic Bank GmbH · Documento de ejemplo con datos inventados', 6); T(289, 70, 'Registro Mercantil HRB 000000 B', 6)
    T(74, 40, 'Creado en 2026-11-01 10:00:00 Europe/Madrid (UTC+01:00)', 6); T(482, 40, `Página ${n} de 2`, 6)
  }
  const pages = [{ texts: [] }, { texts: [] }]
  const T1 = (x, y, text, size = 8) => pages[0].texts.push({ x, y, text, size })
  T1(74, 733, 'TRADE REPUBLIC BANK GMBH, SUCURSAL EN ESPAÑA', 8)
  T1(75, 697, 'ANA EJEMPLO INVENTADO', 8); T1(389, 697, 'FECHA', 8); T1(433, 697, '01 oct 2026 - 31 oct 2026', 8)
  T1(75, 688, 'Calle Falsa 123', 8); T1(389, 688, 'IBAN', 8); T1(417, 688, 'ES00 0000 0000 0000 0000 0000', 8)
  T1(74, 630, 'RESUMEN DE ESTADO DE CUENTA', 10)
  T1(74, 596, 'PRODUCTO', 7); T1(175, 596, 'BALANCE INICIAL', 7); T1(258, 596, 'ENTRADA DE DINERO', 7); T1(357, 596, 'SALIDA DE DINERO', 7); T1(480, 596, 'BALANCE FINAL', 7)
  const totalIn = round2(movs.reduce((s, m) => s + (m.in ?? 0), 0))
  const totalOut = round2(movs.reduce((s, m) => s + (m.out ?? 0), 0))
  T1(74, 580, 'Cuenta corriente', 8); T1(175, 580, '0,00 €', 8); T1(258, 580, `${es(totalIn)} €`, 8); T1(357, 580, `${es(totalOut)} €`, 8); T1(500, 580, `${es(round2(totalIn - totalOut))} €`, 8)
  T1(74, 520, 'TRANSACCIONES DE CUENTA', 10)
  header(T1, 492)
  let y = 469
  let page = 0
  movs.forEach((m, i) => {
    if (i === 6) {
      footer(T1, 1)
      page = 1
      const T2 = (x, yy, text, size = 8) => pages[1].texts.push({ x, y: yy, text, size })
      T2(74, 790, 'TRADE REPUBLIC BANK GMBH, SUCURSAL EN ESPAÑA', 8)
      header(T2, 760)
      y = 737
    }
    const T = (x, yy, text, size = 8) => pages[page].texts.push({ x, y: yy, text, size })
    bal = round2(bal + (m.in ?? 0) - (m.out ?? 0))
    const f = esPdfDate(m.d)
    const amounts = () => {
      if (m.in) T(399, y, `${es(m.in)} €`)
      if (m.out) T(447, y, `${es(m.out)} €`)
      T(490, y, `${es(bal)} €`)
    }
    if (m.merged) {
      T(74, y, `${f.short} ${f.y} ${m.tipo[0]}`); T(180, y, m.desc[0]); amounts()
    } else if (m.descAbove) {
      T(180, y + 8, m.desc[0])
      T(74, y, `${f.short} ${f.y} ${m.tipo[0]}`); amounts()
      T(180, y - 8, m.desc[1])
    } else {
      T(74, y + 4, f.short)
      if (m.tipo.length === 2) T(113, y + 4, m.tipo[0])
      if (m.tipo.length === 1) T(113, y, m.tipo[0])
      T(180, y, m.desc[0]); amounts()
      T(74, y - 4, f.y)
      if (m.tipo.length === 2) T(113, y - 4, m.tipo[1])
      if (m.desc[1]) T(180, y - 4, m.desc[1])
    }
    y -= 32
  })
  const T = (x, yy, text, size = 8) => pages[1].texts.push({ x, y: yy, text, size })
  T(74, y - 20, 'RESUMEN DEL BALANCE', 10); T(74, y - 32, 'a 31 oct 2026', 8)
  T(74, y - 50, 'CUENTAS COLECTIVAS', 7); T(503, y - 50, 'SALDO', 7)
  T(74, y - 64, 'Banco depositario de ejemplo', 8); T(500, y - 64, `${es(bal)} €`, 8)
  footer(T, 2)
  fs.writeFileSync(path.join(OUT, 'extracto-pdf-varias-lineas.pdf'), pdf(pages))
  pdfExpected.variasLineas = { movements: movs.length, sum: bal, end: bal }
}

// C) Varias tablas en un PDF (estilo Revolut): cuenta corriente y cuenta de ahorro, cabecera
//    en varias líneas, concepto que sigue en la línea de abajo y un movimiento partido por un salto de página
{
  const movs = [
    ['2026-10-01', ['Una recarga de Apple Pay con', '*0000'], 'Recargar', 100],
    ['2026-10-01', ['To Cuenta Remunerada'], 'Otras', -60],
    ['2026-10-03', ['Supermercado Demo'], 'Comercio', -12.35],
    ['2026-10-05', ['From Cuenta Remunerada'], 'Otras', 20],
    ['2026-10-07', ['Cafetería Prueba'], 'Comercio', -3.1],
    ['2026-10-09', ['Una recarga de Apple Pay con', '*0000'], 'Recargar', 50], // se parte entre páginas
    ['2026-10-12', ['Transporte Ficticio'], 'Comercio', -8.5],
    ['2026-10-20', ['Tienda Ejemplo'], 'Comercio', -24.99],
    ['2026-10-28', ['Gastos de envío de la tarjeta'], 'Comercio', -6.99],
  ]
  const pages = [{ texts: [] }, { texts: [] }, { texts: [] }]
  const P = (n) => (x, y, text, size = 8) => pages[n].texts.push({ x, y, text, size })
  const head = (T) => {
    T(345, 757, 'Extracto personalizado', 8); T(463, 744, '1 oct 2026 - 31 oct 2026', 7); T(469, 731, 'Generado el 1 nov 2026', 7)
  }
  const txHeader = (T, y) => {
    T(340, y + 12, 'Entradas', 7)
    T(424, y + 6, 'Impuestos', 7); T(468, y + 6, 'Otros', 7)
    T(40, y, 'Fecha', 7); T(124, y, 'Descripción', 7); T(256, y, 'Categoría', 7); T(340, y, '/salidas', 7); T(382, y, 'Saldo', 7); T(511, y, 'Comisiones', 7)
    T(424, y - 6, 'retenidos', 7); T(468, y - 6, 'impuestos', 7)
    T(340, y - 12, 'de dinero', 7)
  }
  let T = P(0)
  head(T)
  T(40, 689, 'ANA EJEMPLO INVENTADO', 8)
  T(40, 650, 'Cuentas corrientes Estado de transacciones', 10)
  T(40, 632, 'Cuenta personal (EUR)', 9)
  T(40, 614, 'Extracto de transacción', 8)
  txHeader(T, 584)
  let y = 552
  let bal = 0
  movs.forEach((m, i) => {
    bal = round2(bal + m[3])
    const f = esPdfDate(m[0])
    const date = `${f.short.replace('sept', 'sep')} ${f.y}`
    const line = () => {
      T(40, y, date); T(256, y, m[2]); T(340, y, `${es(m[3])}€`); T(382, y, `${es(bal)}€`); T(424, y, '0,00€'); T(468, y, '0,00€'); T(534, y, i === 8 ? '6,99€' : '0,00€')
    }
    if (i === 5) {
      // El concepto acaba en la página siguiente
      line()
      T = P(1)
      head(T)
      txHeader(T, 690)
      T(124, 660, m[1][0]); T(124, 648, m[1][1])
      y = 625
      return
    }
    T(124, y, m[1][0]); line()
    if (m[1][1]) {
      T(124, y - 12, m[1][1])
      y -= 12
    }
    y -= 19
  })
  T(40, y, 'Total'); T(340, y, `${es(bal)}€`); T(424, y, '0,00€'); T(468, y, '0,00€'); T(534, y, '6,99€')
  // Tabla de la cuenta de ahorro (otra cabecera)
  T = P(2)
  head(T)
  T(40, 700, 'Cuentas de Ahorro Transaction Statements', 10)
  T(40, 684, 'Ahorros (EUR)', 9)
  T(331, 660, 'Gross', 7); T(381, 660, 'Impuestos', 7); T(539, 660, 'Net', 7)
  T(40, 654, 'Fecha', 7); T(70, 654, 'Descripción', 7); T(279, 654, 'TAE', 7); T(303, 654, 'TIN', 7); T(494, 654, 'Fees', 7)
  T(331, 648, 'interest', 7); T(381, 648, 'retenidos', 7); T(526, 648, 'interest', 7)
  let ys = 630
  for (const d of ['1/10/26', '2/10/26', '3/10/26']) {
    T(40, ys, `${d} Interés neto pagado a Cuenta Remunerada`); T(279, ys, '1.5% 1.5%'); T(331, ys, '0,01€'); T(381, ys, '0,00€'); T(494, ys, '0,00'); T(534, ys, '0,01€')
    ys -= 22
  }
  fs.writeFileSync(path.join(OUT, 'extracto-pdf-varias-tablas.pdf'), pdf(pages))
  pdfExpected.variasTablas = { movements: movs.length, sum: bal, savingsRows: 3 }
}
fs.writeFileSync(path.join(OUT, 'extractos-pdf-esperado.json'), JSON.stringify(pdfExpected, null, 2) + '\n')

console.log('Ejemplos generados en', OUT)
for (const f of fs.readdirSync(OUT)) console.log(' -', f)
