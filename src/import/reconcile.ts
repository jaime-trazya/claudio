import type { Transaction } from '../db/types'
import { daysBetween } from '../lib/dates'
import { merchantKey, normalize } from '../lib/text'
import type { ParsedMovement } from './detect'

/** Clave de duplicado: misma cuenta + fecha + importe + concepto */
export function dupKey(accountId: string, date: string, amount: number, description: string): string {
  return `${accountId}|${date}|${amount}|${normalize(description)}`
}

/** Clave del movimiento ya guardado, usando los datos del banco si se concilió */
export function existingKey(tx: Transaction): string {
  return dupKey(tx.accountId, tx.bankDate ?? tx.date, tx.amount, tx.bankDescription ?? tx.description)
}

export type PlanStatus = 'nuevo' | 'duplicado' | 'conciliar' | 'dudoso'

export interface PlanRow {
  movement: ParsedMovement
  key: string
  status: PlanStatus
  /** Movimiento existente con el que se empareja (conciliar / dudoso) */
  matchId: string | null
  /** Posibles coincidencias cuando hay dudas */
  options: string[]
  include: boolean
}

export const RECONCILE_DAYS = 3

/** ¿Puede este movimiento guardado emparejarse con una línea del extracto? */
export function isReconcilable(tx: Transaction, accountId: string): boolean {
  if (tx.bankDescription) return false // ya conciliado con un extracto
  if (tx.source === 'extracto') return false
  if (tx.transferId && tx.accountId !== accountId) return false
  if (tx.accountId === accountId) return tx.status === 'pendiente' || tx.source === 'manual' || tx.source === 'atajo'
  // Los pagos del Atajo pendientes pueden venir de una tarjeta asociada a otra cuenta
  return tx.source === 'atajo' && tx.status === 'pendiente'
}

function similarity(a: string, b: string): number {
  const wa = new Set(merchantKey(a).split(' ').filter(Boolean))
  const wb = new Set(merchantKey(b).split(' ').filter(Boolean))
  if (!wa.size || !wb.size) return 0
  let common = 0
  for (const w of wa) if (wb.has(w) || [...wb].some((x) => x.length > 3 && (x.includes(w) || w.includes(x)))) common++
  return common / Math.max(wa.size, wb.size)
}

function rank(mv: ParsedMovement, tx: Transaction): number {
  // Menor es mejor: días de diferencia menos parecido del nombre
  return Math.abs(daysBetween(tx.date, mv.date)) - similarity(mv.description, tx.description) * 2
}

/**
 * Prepara la importación de un extracto:
 * 1. Marca duplicados exactos de movimientos ya importados (excluidos por defecto).
 * 2. Empareja con pagos pendientes (Atajo) o añadidos a mano: mismo importe y ±3 días.
 * 3. Si hay varias coincidencias posibles, la fila queda "dudosa" para que el usuario elija.
 * Las filas idénticas dentro del mismo archivo se respetan (dos cafés iguales el mismo día).
 */
export function planImport(movements: ParsedMovement[], accountId: string, existing: Transaction[]): PlanRow[] {
  const keyCount = new Map<string, number>()
  for (const tx of existing) {
    if (tx.accountId !== accountId) continue
    const k = existingKey(tx)
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1)
  }

  const rows: PlanRow[] = movements.map((mv) => {
    const key = dupKey(accountId, mv.date, mv.amount, mv.description)
    const n = keyCount.get(key) ?? 0
    if (n > 0) {
      keyCount.set(key, n - 1)
      return { movement: mv, key, status: 'duplicado', matchId: null, options: [], include: false }
    }
    return { movement: mv, key, status: 'nuevo', matchId: null, options: [], include: true }
  })

  const candidates = existing.filter((tx) => isReconcilable(tx, accountId))
  const used = new Set<string>()
  const optionsFor = (mv: ParsedMovement) =>
    candidates.filter(
      (tx) => !used.has(tx.id) && tx.amount === mv.amount && Math.abs(daysBetween(tx.date, mv.date)) <= RECONCILE_DAYS,
    )

  const pending = rows.filter((r) => r.status === 'nuevo')
  // Pasada 1: coincidencias únicas (repetimos mientras se resuelvan nuevas)
  let changed = true
  while (changed) {
    changed = false
    for (const r of pending) {
      if (r.matchId) continue
      const opts = optionsFor(r.movement)
      if (opts.length === 1) {
        const competitors = pending.filter((o) => o !== r && !o.matchId && optionsFor(o.movement).some((t) => t.id === opts[0].id))
        if (competitors.length === 0) {
          r.status = 'conciliar'
          r.matchId = opts[0].id
          used.add(opts[0].id)
          changed = true
        }
      }
    }
  }
  // Pasada 2: dudas. Se propone la mejor opción, pero el usuario decide.
  for (const r of pending) {
    if (r.matchId) continue
    const opts = optionsFor(r.movement)
    const all = candidates.filter(
      (tx) => tx.amount === r.movement.amount && Math.abs(daysBetween(tx.date, r.movement.date)) <= RECONCILE_DAYS,
    )
    if (!all.length) continue
    r.status = 'dudoso'
    r.options = all.sort((a, b) => rank(r.movement, a) - rank(r.movement, b)).map((t) => t.id)
    const best = opts.sort((a, b) => rank(r.movement, a) - rank(r.movement, b))[0]
    if (best) {
      r.matchId = best.id
      used.add(best.id)
    }
  }
  return rows
}

export function summarizePlan(rows: PlanRow[]) {
  return {
    nuevos: rows.filter((r) => r.include && (r.status === 'nuevo' || (r.status === 'dudoso' && !r.matchId))).length,
    conciliados: rows.filter((r) => r.include && r.matchId && (r.status === 'conciliar' || r.status === 'dudoso')).length,
    duplicados: rows.filter((r) => r.status === 'duplicado').length,
    dudosos: rows.filter((r) => r.status === 'dudoso').length,
    excluidos: rows.filter((r) => !r.include).length,
  }
}
