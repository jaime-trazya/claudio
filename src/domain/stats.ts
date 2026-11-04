import type { Account, Category, Transaction } from '../db/types'
import { type DateRange, type ISODate, accountingMonth, addDays, inRange, monthRange, shiftMonth, todayISO } from '../lib/dates'
import { merchantKey, prettyMerchant } from '../lib/text'

/** Solo los gastos e ingresos cuentan en las estadísticas (no transferencias ni aportaciones) */
export const isCountable = (tx: Transaction) => tx.kind === 'gasto' || tx.kind === 'ingreso'

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

export function summarize(txs: Transaction[], range: DateRange): Summary {
  let income = 0
  let expenses = 0
  let count = 0
  for (const tx of txs) {
    if (!isCountable(tx) || !inRange(tx.date, range)) continue
    count++
    for (const p of parts(tx)) {
      if (p.amount > 0) income += p.amount
      else expenses += -p.amount
    }
  }
  const balance = income - expenses
  return { income, expenses, balance, savingsRate: income > 0 ? balance / income : null, count }
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
  const top = new Map<string, CategoryTotal>()
  for (const tx of txs) {
    if (!isCountable(tx) || !inRange(tx.date, range)) continue
    for (const p of parts(tx)) {
      if (p.amount >= 0) continue
      const cat = p.categoryId ? byId.get(p.categoryId) : undefined
      const parentId = cat ? (cat.parentId ?? cat.id) : null
      const key = parentId ?? '__none__'
      let t = top.get(key)
      if (!t) {
        t = { categoryId: parentId, amount: 0, count: 0, children: [] }
        top.set(key, t)
      }
      t.amount += -p.amount
      t.count++
      const childId = cat ? cat.id : null
      let ch = t.children.find((c) => c.categoryId === childId)
      if (!ch) {
        ch = { categoryId: childId, amount: 0, count: 0 }
        t.children.push(ch)
      }
      ch.amount += -p.amount
      ch.count++
    }
  }
  const list = [...top.values()].sort((a, b) => b.amount - a.amount)
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
export function monthlySeries(txs: Transaction[], n = 12, startDay = 1, today: ISODate = todayISO()): MonthPoint[] {
  const cur = accountingMonth(today, startDay)
  const out: MonthPoint[] = []
  for (let i = n - 1; i >= 0; i--) {
    const { year, month0 } = shiftMonth(cur.key, -i)
    const r = monthRange(year, month0, startDay)
    const s = summarize(txs, r)
    out.push({ key: r.key, start: r.start, end: r.end, income: s.income, expenses: s.expenses, balance: s.balance, savingsRate: s.savingsRate })
  }
  return out
}

/** Saldo de una cuenta hasta una fecha (incluida). Incluye pendientes: son pagos reales. */
export function accountBalance(account: Account, txs: Transaction[], until?: ISODate): number {
  let b = account.initialBalance
  for (const tx of txs) {
    if (tx.accountId !== account.id) continue
    if (until && tx.date > until) continue
    b += tx.amount
  }
  return b
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
