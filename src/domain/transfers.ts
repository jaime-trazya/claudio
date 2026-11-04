import type { Transaction } from '../db/types'
import { daysBetween } from '../lib/dates'
import { isAdjustment } from './stats'

export const EXTERNAL_IN = 'cat-entrada-externa'
export const EXTERNAL_OUT = 'cat-salida-externa'
export const PAIR_DAYS = 4

const candidate = (t: Transaction) => !t.transferId && !t.excluded && !isAdjustment(t) && (t.kind === 'transferencia' || t.kind === 'aportacion')

/**
 * Empareja traspasos entre tus cuentas que vienen de extractos distintos
 * (el cargo "Revolut**…" de CaixaBank con la recarga del mismo importe en Revolut).
 * Mismo importe con signo contrario, cuentas distintas y hasta 4 días de diferencia.
 * Devuelve los ids de los traspasos que tienen pareja.
 */
export function pairTransfers(txs: Transaction[], days = PAIR_DAYS): Set<string> {
  const paired = new Set<string>()
  const list = txs.filter(candidate)
  const byAmount = new Map<number, Transaction[]>()
  for (const t of list) {
    const k = Math.abs(t.amount)
    const g = byAmount.get(k)
    if (g) g.push(t)
    else byAmount.set(k, [t])
  }
  for (const group of byAmount.values()) {
    const outs = group.filter((t) => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date))
    const ins = group.filter((t) => t.amount > 0)
    for (const o of outs) {
      let best: Transaction | null = null
      let bestD = Infinity
      for (const i of ins) {
        if (paired.has(i.id) || i.accountId === o.accountId) continue
        // Al menos uno de los dos debe ser un traspaso (una aportación sola no se empareja con otra)
        if (o.kind === 'aportacion' && i.kind === 'aportacion') continue
        const d = Math.abs(daysBetween(o.date, i.date))
        if (d <= days && d < bestD) {
          best = i
          bestD = d
        }
      }
      if (best) {
        paired.add(o.id)
        paired.add(best.id)
      }
    }
  }
  return paired
}

/**
 * Movimientos tal y como cuentan en las estadísticas: los traspasos sin pareja entre tus cuentas
 * son dinero que entra desde (o sale hacia) cuentas que no tienes en la app, así que cuentan como
 * ingreso o gasto («Entradas desde otras cuentas» / «Salidas a otras cuentas»).
 * Con esto se cumple: ingresos − gastos = lo que varían tus saldos (+ aportaciones).
 */
export function forStats(txs: Transaction[]): Transaction[] {
  const paired = pairTransfers(txs)
  return txs.map((t) => {
    if (t.kind !== 'transferencia' || !candidate(t) || paired.has(t.id)) return t
    return { ...t, kind: t.amount > 0 ? 'ingreso' : 'gasto', categoryId: t.amount > 0 ? EXTERNAL_IN : EXTERNAL_OUT, splits: undefined }
  })
}

export const isExternalTransfer = (t: Transaction) => t.categoryId === EXTERNAL_IN || t.categoryId === EXTERNAL_OUT
