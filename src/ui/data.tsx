import { useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { DEFAULT_SETTINGS, type Settings } from '../db/types'
import { DataCtx, type AppData } from './useData'
import { forStats } from '../domain/transfers'

/** Carga todas las tablas y las mantiene al día (useLiveQuery reacciona a cualquier cambio) */
export function DataProvider({ children }: { children: ReactNode }) {
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').toArray(), [])
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [])
  const rules = useLiveQuery(() => db.rules.toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), [])
  const templates = useLiveQuery(() => db.templates.toArray(), [])
  const settingsRows = useLiveQuery(() => db.settings.toArray(), [])
  const goals = useLiveQuery(() => db.goals.toArray(), [])

  const value = useMemo<AppData>(() => {
    const settings = { ...DEFAULT_SETTINGS } as Record<string, unknown>
    for (const r of settingsRows ?? []) if (r.key in DEFAULT_SETTINGS) settings[r.key] = r.value
    const cats = categories ?? []
    const accs = accounts ?? []
    return {
      ready: [accounts, categories, transactions, rules, budgets, snapshots, templates, settingsRows, goals].every((x) => x !== undefined),
      accounts: accs,
      categories: cats,
      transactions: transactions ?? [],
      statTxs: forStats(transactions ?? []),
      rules: rules ?? [],
      budgets: budgets ?? [],
      snapshots: snapshots ?? [],
      templates: templates ?? [],
      goals: goals ?? [],
      settings: settings as unknown as Settings,
      categoryById: new Map(cats.map((c) => [c.id, c])),
      accountById: new Map(accs.map((a) => [a.id, a])),
    }
  }, [accounts, categories, transactions, rules, budgets, snapshots, templates, settingsRows, goals])

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

