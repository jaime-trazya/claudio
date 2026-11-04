import type { Budget, Category, Transaction } from '../db/types'
import type { DateRange } from '../lib/dates'
import { inRange } from '../lib/dates'
import { isCountable, parts } from './stats'

export type BudgetLevel = 'ok' | 'aviso' | 'superado'

export interface BudgetStatus {
  budget: Budget
  spent: number
  ratio: number
  level: BudgetLevel
  remaining: number
}

export function budgetLevel(ratio: number): BudgetLevel {
  if (ratio >= 1) return 'superado'
  if (ratio >= 0.8) return 'aviso'
  return 'ok'
}

/** Gasto del periodo en la categoría y sus subcategorías frente al presupuesto */
export function budgetStatus(budget: Budget, txs: Transaction[], range: DateRange, categories: Category[]): BudgetStatus {
  const ids = new Set([budget.categoryId, ...categories.filter((c) => c.parentId === budget.categoryId).map((c) => c.id)])
  let spent = 0
  for (const tx of txs) {
    if (!isCountable(tx) || !inRange(tx.date, range)) continue
    for (const p of parts(tx)) {
      if (p.categoryId && ids.has(p.categoryId)) spent -= p.amount // los reembolsos en la categoría restan
    }
  }
  spent = Math.max(0, spent)
  const ratio = budget.amount > 0 ? spent / budget.amount : 0
  return { budget, spent, ratio, level: budgetLevel(ratio), remaining: budget.amount - spent }
}
