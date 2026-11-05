import type { Category, Transaction } from '../db/types'
import { type DateRange, type ISODate, accountingMonth, addDays, daysBetween, monthRange, shiftMonth } from '../lib/dates'
import { normalize } from '../lib/text'
import { expensesByCategory, summarize } from './stats'

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** Los n meses contables completos anteriores al de `today` */
function previousMonths(today: ISODate, startDay: number, n: number): (DateRange & { key: string })[] {
  const cur = accountingMonth(today, startDay)
  return Array.from({ length: n }, (_, i) => {
    const { year, month0 } = shiftMonth(cur.key, -(i + 1))
    return monthRange(year, month0, startDay)
  })
}

export interface UnusualSpend {
  categoryId: string | null
  current: number
  usual: number
  ratio: number
}

/**
 * Categorías en las que este mes llevas bastante más de lo normal: lo gastado hasta hoy frente a
 * lo que solías llevar a estas alturas (mediana de los 3 meses anteriores, mismos días).
 * Solo avisa con al menos 30 € de diferencia y un 50 % más, y si la categoría tiene historial.
 */
export function unusualSpending(txs: Transaction[], today: ISODate, startDay: number, categories: Category[]): UnusualSpend[] {
  const cur = accountingMonth(today, startDay)
  const elapsed = daysBetween(cur.start, today)
  if (elapsed < 6) return [] // a principios de mes cualquier gasto parece mucho
  const now = expensesByCategory(txs, { start: cur.start, end: today }, categories)
  const past = previousMonths(today, startDay, 3).map((m) => {
    const end = addDays(m.start, elapsed)
    return new Map(expensesByCategory(txs, { start: m.start, end: end < m.end ? end : m.end }, categories).map((c) => [c.categoryId, c.amount]))
  })
  const out: UnusualSpend[] = []
  for (const c of now) {
    const history = past.map((m) => m.get(c.categoryId) ?? 0)
    if (history.filter((v) => v > 0).length < 2) continue
    const usual = median(history)
    if (usual <= 0) continue
    const ratio = c.amount / usual
    if (ratio >= 1.5 && c.amount - usual >= 3000) out.push({ categoryId: c.categoryId, current: c.amount, usual, ratio })
  }
  return out.sort((a, b) => b.current - b.usual - (a.current - a.usual)).slice(0, 3)
}

/**
 * Cuánto podrías apartar al mes: la mediana de lo que te ha sobrado (ingresos − gastos) en los
 * últimos 3 meses completos, redondeada hacia abajo a 10 €. null si no hay datos o no sobra nada.
 */
export function savingsSuggestion(txs: Transaction[], today: ISODate, startDay: number, categories?: Map<string, Category>): number | null {
  const months = previousMonths(today, startDay, 3).map((m) => summarize(txs, m, categories))
  if (months.filter((m) => m.count > 0).length < 2) return null
  const left = median(months.map((m) => m.balance))
  if (left <= 0) return null
  return Math.floor(left / 1000) * 1000
}

export interface CalendarDay {
  date: ISODate
  items: { name: string; amount: number; categoryId: string | null }[]
  /** Dinero que te quedará al final de ese día si solo pasan estos cargos */
  balance: number
}

/** Cargos fijos previstos de aquí a `end` y el saldo que irá quedando tras cada uno */
export function chargesCalendar(recurring: { name: string; nextDate: ISODate; monthly: number; categoryId: string | null }[], today: ISODate, end: ISODate, cash: number): CalendarDay[] {
  const days = new Map<ISODate, CalendarDay['items']>()
  for (const r of recurring) {
    if (r.nextDate < today || r.nextDate > end) continue
    const l = days.get(r.nextDate) ?? []
    l.push({ name: r.name, amount: r.monthly, categoryId: r.categoryId })
    days.set(r.nextDate, l)
  }
  let balance = cash
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => {
      balance -= items.reduce((s, i) => s + i.amount, 0)
      return { date, items, balance }
    })
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export interface SearchQuery {
  /** Lo que queda por buscar en concepto, notas o categoría */
  text: string
  range: DateRange | null
  /** «este año», «octubre», «el mes pasado»… */
  label: string | null
}

/**
 * Entiende preguntas como «¿cuánto gasté en Mercadona este año?» o «restaurantes en octubre»:
 * separa el periodo del resto del texto. Las palabras de relleno («cuánto», «gasté», «en») se quitan.
 */
export function parseSearch(q: string, today: ISODate, startDay = 1): SearchQuery {
  let s = normalize(q).replace(/[¿?¡!.,]/g, ' ')
  let range: DateRange | null = null
  let label: string | null = null
  const year = Number(today.slice(0, 4))
  const cur = accountingMonth(today, startDay)
  const rules: [RegExp, () => void][] = [
    [/\beste ano\b/, () => ((range = { start: `${year}-01-01`, end: `${year}-12-31` }), (label = 'este año'))],
    [/\b(el )?ano pasado\b/, () => ((range = { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` }), (label = 'el año pasado'))],
    [/\beste mes\b/, () => ((range = { start: cur.start, end: cur.end }), (label = 'este mes'))],
    [/\b(el )?mes pasado\b/, () => {
      const { year: y, month0 } = shiftMonth(cur.key, -1)
      const r = monthRange(y, month0, startDay)
      range = { start: r.start, end: r.end }
      label = 'el mes pasado'
    }],
    [/\b(ultimos|ultimas) (\d{1,3}) dias\b/, () => {
      const n = Number(s.match(/\b(?:ultimos|ultimas) (\d{1,3}) dias\b/)![1])
      range = { start: addDays(today, -(n - 1)), end: today }
      label = `los últimos ${n} días`
    }],
  ]
  for (const [re, apply] of rules)
    if (re.test(s)) {
      apply()
      s = s.replace(re, ' ')
      break
    }
  if (!range) {
    const m = s.match(new RegExp(`\\b(?:en |de )?(${MONTHS.join('|')})(?: de (\\d{4}))?\\b`))
    if (m) {
      const month0 = MONTHS.indexOf(m[1])
      // Sin año: el último mes con ese nombre que ya haya empezado
      const y = m[2] ? Number(m[2]) : month0 <= Number(today.slice(5, 7)) - 1 ? year : year - 1
      const r = monthRange(y, month0, 1)
      range = { start: r.start, end: r.end }
      label = m[2] ? `${m[1]} de ${y}` : m[1]
      s = s.replace(m[0], ' ')
    }
  }
  // Palabras de relleno de una pregunta
  const text = range
    ? s
        .replace(/\b(cuanto|cuantos|cuanta|he|hemos|me|gaste|gastado|gasto|gastos|pague|pagado|llevo|en|el|la|los|las|de|del|que|total)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : q.trim()
  return { text, range, label }
}
