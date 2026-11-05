import type { Account, Goal, Snapshot, Transaction } from '../db/types'
import { type ISODate, monthsBetween, todayISO } from '../lib/dates'
import { accountBalance } from './stats'
import { investmentValue } from './investments'

export interface GoalProgress {
  saved: number
  ratio: number
  remaining: number
  /** Lo que hay que apartar cada mes para llegar a tiempo (si hay fecha) */
  monthly: number | null
  monthsLeft: number | null
  done: boolean
}

export function goalProgress(goal: Goal, accounts: Account[], txs: Transaction[], snapshots: Snapshot[], today: ISODate = todayISO()): GoalProgress {
  const acc = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : undefined
  // Con todas las cuentas de inversión: si no, a esta se le atribuirían las aportaciones a las demás
  const investmentAccounts = accounts.filter((a) => a.type === 'inversion')
  const saved = acc ? (acc.type === 'inversion' ? investmentValue(acc, snapshots, txs, undefined, investmentAccounts) : accountBalance(acc, txs)) : goal.saved
  const remaining = Math.max(0, goal.target - saved)
  const ratio = goal.target > 0 ? Math.min(1, Math.max(0, saved / goal.target)) : 0
  let monthsLeft: number | null = null
  let monthly: number | null = null
  if (goal.deadline) {
    monthsLeft = goal.deadline < today ? 0 : Math.max(1, monthsBetween(today, goal.deadline) - 1 - (goal.deadline.slice(8) < today.slice(8) ? 1 : 0))
    monthly = remaining > 0 ? Math.ceil(remaining / Math.max(1, monthsLeft)) : 0
  }
  return { saved, ratio, remaining, monthly, monthsLeft, done: remaining === 0 && goal.target > 0 }
}
