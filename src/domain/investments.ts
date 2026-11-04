import type { Account, PositionKind, Snapshot, Transaction } from '../db/types'
import type { ISODate } from '../lib/dates'
import { accountBalance } from './stats'
import { normalize } from '../lib/text'

/**
 * Cuenta de inversión a la que va una aportación detectada en el extracto del banco
 * (sin pata en la app): la que coincida por nombre con el concepto o, si no, la primera.
 */
export function contributionTarget(tx: Transaction, investmentAccounts: Account[]): string | null {
  if (!investmentAccounts.length) return null
  const desc = normalize(tx.description)
  const byName = investmentAccounts.find((a) => desc.includes(normalize(a.name)))
  return (byName ?? [...investmentAccounts].sort((a, b) => a.order - b.order)[0]).id
}

/**
 * Aportado a una cuenta de inversión:
 * saldo inicial de la cuenta (lo aportado antes de usar la app)
 * + aportaciones: salidas del banco marcadas como "aportación" (p. ej. "Trade Republic")
 *   o transferencias hechas en la app hacia esta cuenta.
 */
export function totalContributed(account: Account, txs: Transaction[], until?: ISODate, investmentAccounts: Account[] = [account]): number {
  let total = account.initialBalance
  for (const tx of txs) {
    if (tx.kind !== 'aportacion') continue
    if (until && tx.date > until) continue
    if (tx.accountId === account.id) {
      // Pata de entrada en la cuenta de inversión
      total += tx.amount
    } else if (!tx.transferId && contributionTarget(tx, investmentAccounts) === account.id) {
      // Salida del banco: −100 € en el banco = +100 € aportados
      total += -tx.amount
    }
  }
  return total
}

export function latestSnapshot(snapshots: Snapshot[], accountId: string, until?: ISODate): Snapshot | undefined {
  return snapshots
    .filter((s) => s.accountId === accountId && (!until || s.date <= until))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0]
}

export interface PortfolioSummary {
  value: number
  contributed: number
  gain: number
  gainRatio: number | null
  date: ISODate | null
  allocation: { kind: PositionKind | 'efectivo'; label: string; value: number; ratio: number }[]
}

const KIND_LABEL: Record<PositionKind | 'efectivo', string> = {
  etf: 'ETF y fondos',
  accion: 'Acciones',
  cripto: 'Cripto',
  otro: 'Otros',
  efectivo: 'Efectivo',
}

export function portfolioSummary(account: Account, snapshots: Snapshot[], txs: Transaction[], investmentAccounts: Account[] = [account]): PortfolioSummary {
  const snap = latestSnapshot(snapshots, account.id)
  const contributed = totalContributed(account, txs, undefined, investmentAccounts)
  const value = snap ? snap.total : contributed
  const gain = value - contributed
  const allocation: PortfolioSummary['allocation'] = []
  if (snap) {
    const buckets = new Map<PositionKind | 'efectivo', number>()
    for (const p of snap.positions) buckets.set(p.kind, (buckets.get(p.kind) ?? 0) + p.value)
    if (snap.cash) buckets.set('efectivo', snap.cash)
    for (const [kind, v] of buckets) allocation.push({ kind, label: KIND_LABEL[kind], value: v, ratio: snap.total ? v / snap.total : 0 })
    allocation.sort((a, b) => b.value - a.value)
  }
  return { value, contributed, gain, gainRatio: contributed > 0 ? gain / contributed : null, date: snap?.date ?? null, allocation }
}

/** Evolución: valor de cada foto frente a lo aportado hasta esa fecha */
export function portfolioEvolution(account: Account, snapshots: Snapshot[], txs: Transaction[], investmentAccounts: Account[] = [account]): { date: ISODate; value: number; contributed: number }[] {
  return snapshots
    .filter((s) => s.accountId === account.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, value: s.total, contributed: totalContributed(account, txs, s.date, investmentAccounts) }))
}

/** Valor de una cuenta de inversión en una fecha: última foto o, si no hay, lo aportado */
export function investmentValue(account: Account, snapshots: Snapshot[], txs: Transaction[], until?: ISODate, investmentAccounts: Account[] = [account]): number {
  const snap = latestSnapshot(snapshots, account.id, until)
  return snap ? snap.total : totalContributed(account, txs, until, investmentAccounts)
}

export interface NetWorth {
  cash: number
  investments: number
  total: number
}

/** Patrimonio total: saldo de las cuentas + valor de las inversiones */
export function netWorth(accounts: Account[], txs: Transaction[], snapshots: Snapshot[], until?: ISODate): NetWorth {
  let cash = 0
  let investments = 0
  const inv = accounts.filter((a) => a.type === 'inversion')
  for (const a of accounts) {
    if (a.archived) continue
    if (a.type === 'inversion') investments += investmentValue(a, snapshots, txs, until, inv)
    else cash += accountBalance(a, txs, until)
  }
  return { cash, investments, total: cash + investments }
}

export function netWorthSeries(accounts: Account[], txs: Transaction[], snapshots: Snapshot[], monthEnds: { key: string; end: ISODate }[]) {
  return monthEnds.map((m) => ({ key: m.key, ...netWorth(accounts, txs, snapshots, m.end) }))
}
