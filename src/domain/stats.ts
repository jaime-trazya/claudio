import type { Account, Category, Transaction } from '../db/types'
import { type DateRange, type ISODate, accountingMonth, addDays, inRange, monthRange, shiftMonth, todayISO } from '../lib/dates'
import { merchantKey, prettyMerchant } from '../lib/text'

/** Solo los gastos e ingresos cuentan en las estadísticas (no transferencias ni aportaciones) */
export const isCountable = (tx: Transaction) => (tx.kind === 'gasto' || tx.kind === 'ingreso') && !tx.excluded

/** Reparto por categorías (si el movimiento está dividido) */
export function parts(tx: Transaction): { categoryId: string | null; amount: number }[] {
  if (tx.splits && tx.splits.length) return tx.splits
  return [{ categoryId: tx.categoryId, amount: tx.amount }]
}

export interface Summary {
  income: number
  expenses: number // positivo
  balance: number
  /** Tasa de ahorro: (ingresos − gastos) / ingresos. null si no hay ingresos */
  savingsRate: number | null
  count: number
}

/**
 * Un importe positivo en una categoría de gasto es una devolución (Uber, una compra devuelta):
 * resta del gasto en lugar de sumar como ingreso.
 */
export function isRefund(amount: number, categoryId: string | null, categories?: Map<string, Category>): boolean {
  if (amount <= 0 || !categoryId || !categories) return false
  return categories.get(categoryId)?.kind === 'gasto'
}

export function summarize(txs: Transaction[], range: DateRange, categories?: Map<string, Category>): Summary {
  let income = 0
  let expenses = 0
  let count = 0
  for (const tx of txs) {
    if (!isCountable(tx) || !inRange(tx.date, range)) continue
    count++
    for (const p of parts(tx)) {
      if (isRefund(p.amount, p.categoryId, categories)) expenses -= p.amount
      else if (p.amount > 0) income += p.amount
      else expenses += -p.amount
    }
  }
  const balance = income - expenses
  return { income, expenses, balance, savingsRate: income > 0 ? balance / income : null, count }
}

/**
 * Rango anterior comparable: si el periodo actual aún no ha terminado, se compara con los mismos
 * días del periodo anterior (del 1 al 4 de octubre frente al 1 al 4 de noviembre),
 * no con el mes anterior entero.
 */
export function comparableRange(current: DateRange, previous: DateRange, today: ISODate = todayISO()): DateRange & { partial: boolean } {
  if (today < current.start || today >= current.end) return { ...previous, partial: false }
  const elapsed = Math.round((new Date(today).getTime() - new Date(current.start).getTime()) / 86400000)
  const end = addDays(previous.start, elapsed)
  return { start: previous.start, end: end < previous.end ? end : previous.end, partial: true }
}

export interface Delta {
  diff: number
  /** Variación relativa; null si el periodo anterior era 0 */
  ratio: number | null
}

export function delta(current: number, previous: number): Delta {
  return { diff: current - previous, ratio: previous !== 0 ? (current - previous) / Math.abs(previous) : null }
}

export type PeriodType = 'mes' | 'trimestre' | 'año' | 'personalizado'

export interface Period extends DateRange {
  type: PeriodType
  label: string
  previous: DateRange
}

const QUARTER_NAMES = ['1.er trimestre', '2.º trimestre', '3.er trimestre', '4.º trimestre']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/**
 * Rango del periodo. offset = 0 es el periodo actual, -1 el anterior, etc.
 * Respeta el primer día del mes contable.
 */
export function periodRange(type: PeriodType, offset: number, startDay = 1, today: ISODate = todayISO(), custom?: DateRange): Period {
  const cur = accountingMonth(today, startDay)
  if (type === 'personalizado' && custom) {
    const len = Math.max(0, Math.round((new Date(custom.end).getTime() - new Date(custom.start).getTime()) / 86400000))
    const prevEnd = addDays(custom.start, -1)
    return { type, ...custom, label: 'Personalizado', previous: { start: addDays(prevEnd, -len), end: prevEnd } }
  }
  if (type === 'mes' || type === 'personalizado') {
    const { year, month0 } = shiftMonth(cur.key, offset)
    const r = monthRange(year, month0, startDay)
    const p = shiftMonth(cur.key, offset - 1)
    return { type: 'mes', start: r.start, end: r.end, label: `${MONTHS[month0]} ${year}`, previous: monthRange(p.year, p.month0, startDay) }
  }
  if (type === 'trimestre') {
    const [y, m] = cur.key.split('-').map(Number)
    const q0 = Math.floor((m - 1) / 3) + offset
    const year = y + Math.floor(q0 / 4)
    const q = ((q0 % 4) + 4) % 4
    const make = (yy: number, qq: number) => ({
      start: monthRange(yy, qq * 3, startDay).start,
      end: monthRange(yy, qq * 3 + 2, startDay).end,
    })
    const pq = q === 0 ? 3 : q - 1
    const py = q === 0 ? year - 1 : year
    return { type, ...make(year, q), label: `${QUARTER_NAMES[q]} ${year}`, previous: make(py, pq) }
  }
  const year = Number(cur.key.slice(0, 4)) + offset
  const make = (yy: number) => ({ start: monthRange(yy, 0, startDay).start, end: monthRange(yy, 11, startDay).end })
  return { type: 'año', ...make(year), label: String(year), previous: make(year - 1) }
}

export interface CategoryTotal {
  categoryId: string | null
  amount: number // positivo
  count: number
  children: { categoryId: string | null; amount: number; count: number }[]
}

/** Gastos por categoría principal, con el detalle de subcategorías */
export function expensesByCategory(txs: Transaction[], range: DateRange, categories: Category[]): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const refund = (amount: number, id: string | null) => isRefund(amount, id, byId)
  const top = new Map<string, CategoryTotal>()
  for (const tx of txs) {
    if (!isCountable(tx) || !inRange(tx.date, range)) continue
    for (const p of parts(tx)) {
      if (p.amount >= 0 && !refund(p.amount, p.categoryId)) continue
      const cat = p.categoryId ? byId.get(p.categoryId) : undefined
      const parentId = cat ? (cat.parentId ?? cat.id) : null
      const key = parentId ?? '__none__'
      let t = top.get(key)
      if (!t) {
        t = { categoryId: parentId, amount: 0, count: 0, children: [] }
        top.set(key, t)
      }
      t.amount += -p.amount
      if (p.amount < 0) t.count++
      const childId = cat ? cat.id : null
      let ch = t.children.find((c) => c.categoryId === childId)
      if (!ch) {
        ch = { categoryId: childId, amount: 0, count: 0 }
        t.children.push(ch)
      }
      ch.amount += -p.amount
      if (p.amount < 0) ch.count++
    }
  }
  const list = [...top.values()].filter((t) => t.amount > 0).sort((a, b) => b.amount - a.amount)
  list.forEach((t) => t.children.sort((a, b) => b.amount - a.amount))
  return list
}

export interface MonthPoint {
  key: string
  start: ISODate
  end: ISODate
  income: number
  expenses: number
  balance: number
  savingsRate: number | null
}

/** Ingresos y gastos de los últimos n meses contables (el último es el del día de referencia) */
export function monthlySeries(txs: Transaction[], n = 12, startDay = 1, today: ISODate = todayISO(), categories?: Map<string, Category>): MonthPoint[] {
  const cur = accountingMonth(today, startDay)
  const out: MonthPoint[] = []
  for (let i = n - 1; i >= 0; i--) {
    const { year, month0 } = shiftMonth(cur.key, -i)
    const r = monthRange(year, month0, startDay)
    const s = summarize(txs, r, categories)
    out.push({ key: r.key, start: r.start, end: r.end, income: s.income, expenses: s.expenses, balance: s.balance, savingsRate: s.savingsRate })
  }
  return out
}

/**
 * Saldo de una cuenta hasta una fecha (incluida). Incluye pendientes: son pagos reales.
 *
 * Si los movimientos vienen de un extracto con columna de saldo, manda el saldo del banco:
 * se toma el último saldo del banco hasta esa fecha y se le suman los movimientos posteriores que
 * no estaban en el extracto (pagos del Atajo, añadidos a mano). Así el saldo es exacto aunque el
 * banco anote algunos movimientos con fecha valor y el orden por fecha no coincida con el suyo.
 */
export function accountBalance(account: Account, txs: Transaction[], until?: ISODate): number {
  let anchor: Transaction | null = null
  for (const tx of txs) {
    if (tx.accountId !== account.id || tx.bankBalance === undefined || !tx.bankEffDate) continue
    if (until && tx.bankEffDate > until) continue
    if (!anchor || tx.bankEffDate > anchor.bankEffDate! || (tx.bankEffDate === anchor.bankEffDate && (tx.bankSeq ?? 0) > (anchor.bankSeq ?? 0))) anchor = tx
  }
  let b = anchor ? anchor.bankBalance! : account.initialBalance
  for (const tx of txs) {
    if (tx.accountId !== account.id) continue
    if (until && tx.date > until) continue
    // Los ajustes de saldo hechos a mano después de importar el extracto siempre cuentan
    const lateAdjustment = isAdjustment(tx) && tx.createdAt > (anchor?.createdAt ?? 0)
    if (anchor && !lateAdjustment && (tx.bankBalance !== undefined || tx.date <= anchor.bankEffDate!)) continue
    b += tx.amount
  }
  return b
}

export const isAdjustment = (tx: Transaction) => !!tx.externalId?.startsWith('ajuste-')

/**
 * Para cada movimiento de un extracto (en el orden del archivo) calcula su posición cronológica
 * en el banco y una fecha efectiva que nunca retrocede: el mínimo de las fechas de los movimientos
 * que el banco anotó después. Ej.: CaixaBank anota una transferencia con fecha valor 02/11 antes
 * que unas compras del 31/10: su fecha efectiva es el 31/10.
 */
export function bankOrder(dates: ISODate[]): { seq: number; effDate: ISODate }[] {
  const n = dates.length
  if (!n) return []
  const descending = dates[0] > dates[n - 1]
  const chrono = dates.map((d, i) => ({ d, i, seq: descending ? n - 1 - i : i }))
  chrono.sort((a, b) => a.seq - b.seq)
  const out: { seq: number; effDate: ISODate }[] = new Array(n)
  let min = chrono[n - 1].d
  for (let k = n - 1; k >= 0; k--) {
    if (chrono[k].d < min) min = chrono[k].d
    out[chrono[k].i] = { seq: chrono[k].seq, effDate: min }
  }
  return out
}

/** Saldo total (cuentas que no son de inversión) al final de cada mes */
export function balanceSeries(accounts: Account[], txs: Transaction[], months: MonthPoint[]): { key: string; balance: number }[] {
  const cash = accounts.filter((a) => a.type !== 'inversion')
  return months.map((m) => ({ key: m.key, balance: cash.reduce((s, a) => s + accountBalance(a, txs, m.end), 0) }))
}

export function topExpenses(txs: Transaction[], range: DateRange, n = 5): Transaction[] {
  return txs
    .filter((tx) => isCountable(tx) && tx.amount < 0 && inRange(tx.date, range))
    .sort((a, b) => a.amount - b.amount)
    .slice(0, n)
}

export interface MerchantTotal {
  key: string
  name: string
  amount: number
  count: number
  categoryId: string | null
}

export function topMerchants(txs: Transaction[], range: DateRange, n = 5): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>()
  for (const tx of txs) {
    if (!isCountable(tx) || tx.amount >= 0 || !inRange(tx.date, range)) continue
    const key = merchantKey(tx.description)
    let m = map.get(key)
    if (!m) {
      m = { key, name: prettyMerchant(tx.description), amount: 0, count: 0, categoryId: tx.categoryId }
      map.set(key, m)
    }
    m.amount += -tx.amount
    m.count++
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, n)
}

/** Gasto neto de una categoría (y sus subcategorías) en cada mes de la serie */
export function categoryMonthly(txs: Transaction[], categoryId: string | null, months: { key: string; start: ISODate; end: ISODate }[], categories: Category[]): { key: string; amount: number }[] {
  const ids = categoryId ? new Set([categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)]) : null
  return months.map((m) => {
    let amount = 0
    for (const tx of txs) {
      if (!isCountable(tx) || !inRange(tx.date, m)) continue
      for (const p of parts(tx)) {
        const match = ids ? !!p.categoryId && ids.has(p.categoryId) : !p.categoryId
        if (match && (p.amount < 0 || ids)) amount -= p.amount
      }
    }
    return { key: m.key, amount: Math.max(0, amount) }
  })
}

/** Fecha del último saldo del banco que se está usando para la cuenta (null si no viene de extracto) */
export function lastStatementDate(account: Account, txs: Transaction[]): ISODate | null {
  let d: ISODate | null = null
  for (const tx of txs) {
    if (tx.accountId !== account.id || tx.source !== 'extracto') continue
    const day = tx.bankEffDate ?? tx.bankDate ?? tx.date
    if (!d || day > d) d = day
  }
  return d
}

/**
 * Agrupa las cuentas por banco cuando un banco tiene varias (Revolut: cuenta principal + remunerada),
 * para mostrar el total del banco y cada cuenta debajo.
 */
export function groupByBank<T extends { bank?: string }>(accounts: T[]): { bank: string | null; accounts: T[] }[] {
  const out: { bank: string | null; accounts: T[] }[] = []
  for (const a of accounts) {
    const g = a.bank ? out.find((x) => x.bank === a.bank) : undefined
    if (g) g.accounts.push(a)
    else out.push({ bank: a.bank ?? null, accounts: [a] })
  }
  return out
}
