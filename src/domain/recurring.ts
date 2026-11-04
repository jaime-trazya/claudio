import type { Transaction } from '../db/types'
import { type ISODate, addDays, daysBetween } from '../lib/dates'
import { merchantKey, prettyMerchant } from '../lib/text'

export interface Recurring {
  key: string
  name: string
  categoryId: string | null
  /** Importe mensual (positivo, céntimos) */
  monthly: number
  annual: number
  count: number
  lastDate: ISODate
  nextDate: ISODate
  accountId: string
  /** El importe ha cambiado en el último cargo */
  changed: boolean
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * Detecta pagos que se repiten cada mes: mismo comercio, importe parecido (±20 % o ±3 €)
 * y unos 30 días entre cargos. Hacen falta 3 cargos, o 2 si el importe es idéntico.
 * Solo se muestran los activos (último cargo hace menos de 40 días respecto a `ref`).
 */
export function detectRecurring(txs: Transaction[], ref?: ISODate): Recurring[] {
  const expenses = txs.filter((t) => t.amount < 0 && t.kind === 'gasto' && !t.excluded)
  if (!expenses.length) return []
  const refDate = ref ?? expenses.reduce((m, t) => (t.date > m ? t.date : m), expenses[0].date)
  const groups = new Map<string, Transaction[]>()
  for (const t of expenses) {
    const k = merchantKey(t.description)
    if (!k) continue
    const g = groups.get(k)
    if (g) g.push(t)
    else groups.set(k, [t])
  }
  const out: Recurring[] = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    list.sort((a, b) => a.date.localeCompare(b.date))
    const amounts = list.map((t) => -t.amount)
    const med = median(amounts)
    const tolerance = Math.max(300, med * 0.2)
    // Quedarse con los cargos de importe parecido
    const similar = list.filter((t) => Math.abs(-t.amount - med) <= tolerance)
    if (similar.length < 2) continue
    const months = new Set(similar.map((t) => t.date.slice(0, 7)))
    if (similar.length > months.size * 1.25) continue // varias veces al mes: no es una cuota
    const intervals: number[] = []
    for (let i = 1; i < similar.length; i++) intervals.push(daysBetween(similar[i - 1].date, similar[i].date))
    if (!intervals.every((d) => d >= 20 && d <= 40)) continue
    const medInterval = median(intervals)
    if (medInterval < 26 || medInterval > 35) continue
    const sameAmount = new Set(similar.map((t) => t.amount)).size === 1
    if (similar.length < 3 && !sameAmount) continue
    const last = similar[similar.length - 1]
    if (daysBetween(last.date, refDate) > 40) continue
    const monthly = -last.amount
    out.push({
      key,
      name: prettyMerchant(last.description),
      categoryId: last.categoryId,
      monthly,
      annual: monthly * 12,
      count: similar.length,
      lastDate: last.date,
      nextDate: addDays(last.date, medInterval),
      accountId: last.accountId,
      changed: similar.length > 1 && similar[similar.length - 2].amount !== last.amount,
    })
  }
  return out.sort((a, b) => b.monthly - a.monthly)
}

export function recurringTotals(list: Recurring[]): { monthly: number; annual: number } {
  const monthly = list.reduce((s, r) => s + r.monthly, 0)
  return { monthly, annual: monthly * 12 }
}
