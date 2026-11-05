import type { Transaction } from '../db/types'
import { type ISODate, addMonths, daysBetween } from '../lib/dates'
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
 * Detecta pagos que se repiten cada mes: mismo comercio, importe parecido (±20 % o ±3 €, o una subida de precio)
 * y unos 30 días entre cargos (se admite un mes sin cargo). Hacen falta 3 cargos, o 2 si el importe es idéntico.
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
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(300, b * 0.2)
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    list.sort((a, b) => a.date.localeCompare(b.date))
    const months = new Set(list.map((t) => t.date.slice(0, 7)))
    if (list.length > months.size * 1.25) continue // varias veces al mes: no es una cuota
    // Cadena de cargos hacia atrás desde el último: uno al mes (se admite un mes sin cargo, hasta
    // 70 días) e importe parecido al siguiente. Una subida de precio (hasta el doble) no rompe la
    // cadena una vez establecida: así Netflix no desaparece justo cuando sube.
    const chain = [list[list.length - 1]]
    for (let i = list.length - 2; i >= 0; i--) {
      const t = list[i]
      const next = chain[0]
      const gap = daysBetween(t.date, next.date)
      if (gap < 20) continue
      if (gap > 70) break
      const a = -t.amount
      const b = -next.amount
      const priceChange = chain.length >= 2 && Math.max(a, b) <= 2 * Math.min(a, b)
      if (!near(a, b) && !priceChange) break
      chain.unshift(t)
    }
    if (chain.length < 2) continue
    // Un hueco de dos meses cuenta como dos intervalos mensuales
    const intervals: number[] = []
    for (let i = 1; i < chain.length; i++) {
      const d = daysBetween(chain[i - 1].date, chain[i].date)
      intervals.push(d > 45 ? d / 2 : d)
    }
    const medInterval = median(intervals)
    if (medInterval < 26 || medInterval > 35) continue
    const sameAmount = new Set(chain.map((t) => t.amount)).size === 1
    if (chain.length < 3 && !sameAmount) continue
    const last = chain[chain.length - 1]
    if (daysBetween(last.date, refDate) > 40) continue
    const monthly = -last.amount
    out.push({
      key,
      name: prettyMerchant(last.description),
      categoryId: last.categoryId,
      monthly,
      annual: monthly * 12,
      count: chain.length,
      lastDate: last.date,
      // El mismo día del mes siguiente (un cargo del 31 vuelve el 30 o el 31, no 30 días después)
      nextDate: addMonths(last.date, 1),
      accountId: last.accountId,
      changed: chain[chain.length - 2].amount !== last.amount,
    })
  }
  return out.sort((a, b) => b.monthly - a.monthly)
}

export function recurringTotals(list: Recurring[]): { monthly: number; annual: number } {
  const monthly = list.reduce((s, r) => s + r.monthly, 0)
  return { monthly, annual: monthly * 12 }
}
