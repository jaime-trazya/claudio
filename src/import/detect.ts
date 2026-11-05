import type { ColumnMapping } from '../db/types'
import { parseAmount } from '../lib/money'
import { parseDate } from '../lib/dates'
import { normalize } from '../lib/text'
import type { Cell, Row } from './csv'

export const HEADER_WORDS = {
  date: ['fecha operacion', 'fecha de operacion', 'f operacion', 'fecha', 'f valor', 'fecha valor', 'date', 'dia'],
  desc: ['concepto', 'descripcion', 'movimiento', 'detalle', 'observaciones', 'concepto ampliado', 'comercio', 'beneficiario', 'description', 'texto'],
  amount: ['importe', 'cantidad', 'importe eur', 'importe euros', 'entradas salidas', 'entradas salidas de dinero', 'amount', 'valor'],
  debit: ['cargo', 'cargos', 'debe', 'debito', 'gasto', 'gastos', 'salida', 'salidas', 'reintegro'],
  credit: ['abono', 'abonos', 'haber', 'credito', 'ingreso', 'ingresos', 'entrada', 'entradas'],
  balance: ['saldo', 'saldo disponible', 'balance', 'saldo contable'],
}

const H = HEADER_WORDS

export function score(cell: Cell, words: string[]): number {
  if (typeof cell !== 'string') return 0
  const n = normalize(cell)
  if (!n || n.length > 40) return 0
  let best = 0
  words.forEach((w, i) => {
    if (n === w) best = Math.max(best, 100 - i)
    else if (n.startsWith(w + ' ') || n.endsWith(' ' + w) || n.includes(` ${w} `)) best = Math.max(best, 60 - i)
  })
  return best
}

export interface Detection {
  mapping: ColumnMapping
  /** 0-1: confianza en la detección */
  confidence: number
  /** Número de filas de datos válidas */
  validRows: number
}

// Las fechas de una hoja de cálculo llegan como Date (cellDates): un número es un importe, aunque
// esté entre 20000 y 80000 como los seriales de fecha de Excel (30000 € no es el 18 de febrero de 1982)
const isDateCell = (c: Cell) => typeof c !== 'number' && parseDate(c) !== null
const isAmountCell = (c: Cell) => c !== null && c !== '' && !(c instanceof Date) && parseAmount(c) !== null && !(typeof c === 'string' && parseDate(c) !== null)

/** Busca la fila de cabecera: la que tenga más palabras clave de columnas. */
export function findHeaderRow(rows: Row[]): number {
  let bestRow = -1
  let bestScore = 0
  const limit = Math.min(rows.length, 40)
  for (let r = 0; r < limit; r++) {
    const row = rows[r]
    let found = 0
    let s = 0
    for (const group of [H.date, H.desc, H.amount, H.debit, H.credit, H.balance]) {
      const m = Math.max(0, ...row.map((c) => score(c, group)))
      if (m > 0) {
        found++
        s += m
      }
    }
    if (found >= 2 && s > bestScore) {
      bestScore = s
      bestRow = r
    }
  }
  return bestRow
}

function pickColumn(header: Row, words: string[], taken: Set<number>): number | null {
  let best: number | null = null
  let bestScore = 0
  header.forEach((c, i) => {
    if (taken.has(i)) return
    const s = score(c, words)
    if (s > bestScore) {
      bestScore = s
      best = i
    }
  })
  return best
}

/** Proporción de filas en las que la columna b se comporta como saldo de la columna a (en cualquier orden de filas) */
function balanceFit(rows: Row[], a: number, b: number): number {
  const pairs = rows.map((r) => [parseAmount(r[a]), parseAmount(r[b])] as const).filter(([x, y]) => x !== null && y !== null) as [number, number][]
  if (pairs.length < 3) return 0
  // Solo cuentan las filas con importe distinto de cero: con importes a 0 cualquier columna
  // constante «cuadraría» como saldo (saldo + 0 = saldo)
  let down = 0
  let up = 0
  let n = 0
  for (let i = 1; i < pairs.length; i++) {
    if (pairs[i][0] === 0 || pairs[i - 1][0] === 0) continue
    n++
    if (pairs[i - 1][1] + pairs[i][0] === pairs[i][1]) down++ // más antiguo arriba
    if (pairs[i][1] + pairs[i - 1][0] === pairs[i - 1][1]) up++ // más reciente arriba
  }
  return n >= 2 ? Math.max(down, up) / n : 0
}

function columnStats(rows: Row[], col: number) {
  let dates = 0
  let amounts = 0
  let texts = 0
  let textLen = 0
  let filled = 0
  for (const r of rows) {
    const c = r[col]
    if (c === null || c === undefined || c === '') continue
    filled++
    if (isDateCell(c)) dates++
    else if (isAmountCell(c)) amounts++
    else if (typeof c === 'string') {
      texts++
      textLen += c.length
    }
  }
  return { dates, amounts, texts, avgLen: texts ? textLen / texts : 0, filled }
}

/** Detecta automáticamente las columnas de fecha, concepto e importe. */
export function detectColumns(rows: Row[]): Detection | null {
  if (!rows.length) return null
  const headerRow = findHeaderRow(rows)
  const header = headerRow >= 0 ? rows[headerRow] : []
  const body = rows.slice(headerRow + 1, headerRow + 1 + 200)
  const width = Math.max(...rows.slice(0, 200).map((r) => r.length))
  const taken = new Set<number>()

  let dateCol = headerRow >= 0 ? pickColumn(header, H.date, taken) : null
  // Si hay dos fechas (operación y valor) preferimos la de operación: pickColumn ya lo hace por orden
  if (dateCol !== null) taken.add(dateCol)
  let descCol = headerRow >= 0 ? pickColumn(header, H.desc, taken) : null
  if (descCol !== null) taken.add(descCol)
  // Las demás fechas (p. ej. «Fecha valor») no son importes aunque su cabecera diga «valor»
  const dateLike = new Set(header.map((c, i) => (score(c, H.date) > 0 ? i : -1)).filter((i) => i >= 0))
  let amountCol = headerRow >= 0 ? pickColumn(header, H.amount, new Set([...taken, ...dateLike])) : null
  if (amountCol !== null) taken.add(amountCol)
  let debitCol: number | null = null
  let creditCol: number | null = null
  if (amountCol === null && headerRow >= 0) {
    debitCol = pickColumn(header, H.debit, taken)
    if (debitCol !== null) taken.add(debitCol)
    creditCol = pickColumn(header, H.credit, taken)
    if (creditCol !== null) taken.add(creditCol)
  }
  let balanceCol = headerRow >= 0 ? pickColumn(header, H.balance, taken) : null
  if (balanceCol !== null) taken.add(balanceCol)

  // Completar por contenido lo que no se haya encontrado por cabecera
  const stats = Array.from({ length: width }, (_, i) => columnStats(body, i))
  if (dateCol === null) {
    const c = argmax(stats.map((s, i) => (taken.has(i) ? -1 : s.dates)))
    if (c !== null && stats[c].dates >= Math.max(1, body.length * 0.5)) {
      dateCol = c
      taken.add(c)
    }
  }
  if (descCol === null) {
    const c = argmax(stats.map((s, i) => (taken.has(i) ? -1 : s.texts * 3 + s.avgLen)))
    if (c !== null && stats[c].texts > 0) {
      descCol = c
      taken.add(c)
    }
  }
  if (amountCol === null && debitCol === null && creditCol === null) {
    // Columna numérica con signo: la que tenga más importes y no sea "saldo"
    const numeric = stats
      .map((s, i) => ({ i, s }))
      .filter(({ i, s }) => !taken.has(i) && s.amounts >= Math.max(1, body.length * 0.5))
    if (numeric.length) {
      // Con dos columnas numéricas, una suele ser el saldo: es la que cuadra fila a fila con la otra
      // (saldo anterior + importe = saldo). Si ninguna pareja cuadra, la primera (lo más habitual).
      let pick = { amount: numeric[0].i, balance: null as number | null, fit: 0 }
      for (const a of numeric)
        for (const b of numeric) {
          if (a.i === b.i || balanceCol !== null) continue
          const fit = balanceFit(body, a.i, b.i)
          if (fit > pick.fit) pick = { amount: a.i, balance: b.i, fit }
        }
      amountCol = pick.amount
      taken.add(amountCol)
      if (pick.balance !== null && pick.fit >= 0.6) {
        balanceCol = pick.balance
        taken.add(balanceCol)
      }
    }
  }

  if (dateCol === null || descCol === null || (amountCol === null && debitCol === null && creditCol === null)) return null

  const mapping: ColumnMapping = { headerRow, dateCol, descCol, amountCol, debitCol, creditCol, balanceCol }
  const parsed = applyMappingCount(rows, mapping)
  const candidateRows = body.filter((r) => r.some((c) => c !== null && c !== '')).length
  const confidence = candidateRows ? Math.min(1, parsed / candidateRows) * (headerRow >= 0 ? 1 : 0.8) : 0
  return { mapping, confidence, validRows: parsed }
}

function argmax(values: number[]): number | null {
  let best: number | null = null
  let bestV = 0
  values.forEach((v, i) => {
    if (v > bestV) {
      bestV = v
      best = i
    }
  })
  return best
}

function applyMappingCount(rows: Row[], m: ColumnMapping): number {
  return rows.slice(m.headerRow + 1).filter((r) => rowToMovement(r, m) !== null).length
}

export interface ParsedMovement {
  date: string
  description: string
  amount: number // céntimos con signo
  /** Saldo que indica el banco tras este movimiento, si el extracto lo trae */
  balance?: number
  /** Fila original (para la vista previa) */
  rowIndex: number
}

export function rowToMovement(r: Row, m: ColumnMapping, rowIndex = 0): ParsedMovement | null {
  const date = parseDate(r[m.dateCol])
  if (!date) return null
  const parts = [r[m.descCol], ...(m.extraDescCols ?? []).map((i) => r[i])]
    .filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
    .map((c) => String(c).trim())
  let description = parts.join(' · ')
  if (!description) {
    // Sin concepto (p. ej. cortado por un salto de página): usar otra columna de texto
    const other = r.find((c, i) => i !== m.dateCol && typeof c === 'string' && c.trim() && parseAmount(c) === null && parseDate(c) === null)
    description = other ? String(other).trim() : 'Sin concepto'
  }
  let amount: number | null = null
  if (m.amountCol !== null) {
    amount = parseAmount(r[m.amountCol])
    if (amount !== null && m.invertSign) amount = -amount
  } else {
    const debit = m.debitCol !== null ? parseAmount(r[m.debitCol]) : null
    const credit = m.creditCol !== null ? parseAmount(r[m.creditCol]) : null
    if (debit || credit) amount = (credit ? Math.abs(credit) : 0) - (debit ? Math.abs(debit) : 0)
  }
  if (amount === null || amount === 0) return null
  const balance = m.balanceCol !== null && m.balanceCol !== undefined ? parseAmount(r[m.balanceCol]) : null
  return { date, description, amount, rowIndex, ...(balance !== null ? { balance } : {}) }
}

export function applyMapping(rows: Row[], m: ColumnMapping): ParsedMovement[] {
  const out: ParsedMovement[] = []
  for (let i = m.headerRow + 1; i < rows.length; i++) {
    const mv = rowToMovement(rows[i], m, i)
    if (mv) out.push(mv)
  }
  return out
}

/** Firma de la cabecera para reconocer el banco la próxima vez */
export function headerSignature(rows: Row[], headerRow: number): string {
  if (headerRow < 0) {
    const width = rows[0]?.length ?? 0
    return `sin-cabecera-${width}`
  }
  return rows[headerRow].map((c) => normalize(String(c ?? ''))).join('|')
}

/**
 * Saldo final según el banco: el del movimiento más reciente.
 * Si hay varios ese día, se usa el orden del archivo (los bancos listan del más nuevo al más viejo o al revés).
 */
export function bankClosingBalance(movements: ParsedMovement[]): { date: string; balance: number } | null {
  const withBalance = movements.filter((m) => m.balance !== undefined)
  if (withBalance.length < movements.length * 0.8 || !withBalance.length) return null
  const first = withBalance[0]
  const last = withBalance[withBalance.length - 1]
  const descending = first.date > last.date
  const maxDate = withBalance.reduce((d, m) => (m.date > d ? m.date : d), first.date)
  const sameDay = withBalance.filter((m) => m.date === maxDate)
  const pick = descending ? sameDay[0] : sameDay[sameDay.length - 1]
  return { date: pick.date, balance: pick.balance! }
}
