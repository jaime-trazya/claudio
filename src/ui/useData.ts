import { createContext, useContext } from 'react'
import type { Account, Budget, Category, Goal, ImportTemplate, Rule, Settings, Snapshot, Transaction } from '../db/types'

export interface AppData {
  ready: boolean
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  rules: Rule[]
  budgets: Budget[]
  snapshots: Snapshot[]
  templates: ImportTemplate[]
  goals: Goal[]
  settings: Settings
  categoryById: Map<string, Category>
  accountById: Map<string, Account>
}

export const DataCtx = createContext<AppData | null>(null)

export function useData(): AppData {
  const v = useContext(DataCtx)
  if (!v) throw new Error('useData fuera de DataProvider')
  return v
}
