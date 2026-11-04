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
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
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
  const T = (x, y, text, size, bold) => p1.push({ x, y, text, size, bold })
  T(50, 800, 'TRADE REPUBLIC BANK GMBH', 10, true)
  T(50, 786, 'Dirección de la entidad (ejemplo)', 8)
  T(50, 750, 'ANA EJEMPLO INVENTADO', 9)
  T(50, 738, 'Calle Falsa 123', 9)
  T(50, 726, '00000 Ciudad Inventada', 9)
  T(400, 750, `FECHA ${FECHA}`, 9)
  T(400, 738, 'CUENTA DE VALORES 0000000000', 9)
  T(50, 690, 'EXTRACTO DEL PATRIMONIO NETO', 14, true)
  T(50, 672, `a ${FECHA}`, 9)

  T(50, 640, 'CARTERA', 11, true)
  T(50, 622, 'Cuenta de valores', 9); T(480, 622, `${es(totalValores)} EUR`, 9)
  T(50, 608, 'Wallet Crypto', 9); T(480, 608, `${es(totalCripto)} EUR`, 9)
  T(50, 594, 'Efectivo', 9); T(480, 594, `${es(efectivo)} EUR`, 9)
  T(50, 578, 'Total', 9, true); T(480, 578, `${es(total)} EUR`, 9, true)

  T(50, 540, 'CUENTA DE VALORES', 11, true)
  T(50, 522, 'UNIDADES', 7, true); T(130, 522, 'DESCRIPCIÓN DEL VALOR', 7, true); T(370, 522, 'PRECIO POR UNIDAD EN EUR', 7, true); T(480, 522, 'VALOR DE MERCADO EN EUR', 7, true)
  let y = 504
  for (const s of securities) {
    T(50, y, `${unitsES(s.units)} uds.`, 9); T(130, y, s.name, 9); T(370, y, es(s.price), 9); T(480, y, es(s.value), 9)
    y -= 12
    if (s.name2) {
      T(130, y, s.name2, 9)
      y -= 12
    }
    T(130, y, `ISIN: ${s.isin}`, 8); T(370, y, FECHA, 8)
    y -= 20
  }
  T(50, y, `NÚMERO DE POSICIONES: ${securities.length}`, 8); T(400, y, `TOTAL ${es(totalValores)} EUR`, 9, true)
  y -= 40

  T(50, y, 'WALLET CRYPTO', 11, true)
  y -= 18
  T(50, y, 'UNIDADES', 7, true); T(130, y, 'DESCRIPCIÓN', 7, true); T(370, y, 'PRECIO POR UNIDAD EN EUR', 7, true); T(480, y, 'VALOR DE MERCADO EN EUR', 7, true)
  y -= 18
  for (const c of cryptos) {
    T(50, y, `${unitsES(c.units)} uds.`, 9); T(130, y, c.name, 9); T(370, y, es(c.price), 9); T(480, y, es(c.value), 9)
    y -= 12
    T(370, y, FECHA, 8)
    y -= 20
  }
  T(50, y, `NÚMERO DE POSICIONES: ${cryptos.length}`, 8); T(400, y, `TOTAL ${es(totalCripto)} EUR`, 9, true)
  T(50, 40, 'Trade Republic Bank GmbH · Documento de ejemplo con datos inventados', 7)
  T(500, 40, 'Página 1 de 2', 7)

  const p2 = []
  const T2 = (x, yy, text, size, bold) => p2.push({ x, y: yy, text, size, bold })
  T2(50, 790, 'EFECTIVO', 11, true)
  T2(50, 770, 'Saldo de la cuenta de efectivo', 9); T2(480, 770, `${es(efectivo)} EUR`, 9)
  T2(50, 730, 'Este extracto no sustituye a los documentos fiscales. Datos de ejemplo, no reales.', 7)
  T2(50, 40, 'Trade Republic Bank GmbH · Documento de ejemplo con datos inventados', 7)
  T2(500, 40, 'Página 2 de 2', 7)

  fs.writeFileSync(path.join(OUT, 'trade-republic-extracto-patrimonio.pdf'), pdf([{ texts: p1 }, { texts: p2 }]))
  fs.writeFileSync(
    path.join(OUT, 'trade-republic-esperado.json'),
    JSON.stringify({ date: '2026-10-31', securities, cryptos, efectivo, totalValores, totalCripto, total }, null, 2) + '\n',
  )
}

console.log('Ejemplos generados en', OUT)
for (const f of fs.readdirSync(OUT)) console.log(' -', f)
