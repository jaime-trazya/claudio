import Dexie, { type Table, type Transaction as DexieTx } from 'dexie'
import type { Account, Budget, Category, ImportLog, ImportTemplate, Rule, Setting, Snapshot, Transaction } from './types'
import { defaultCategories, defaultRules } from '../domain/defaults'

export const DB_NAME = 'claudio-finanzas'

/**
 * Base de datos local (IndexedDB) con Dexie.
 *
 * REGLAS PARA NO PERDER DATOS EN FUTURAS VERSIONES:
 * - Nunca borrar ni modificar un `this.version(n)` ya publicado.
 * - Para cambiar el esquema, añadir `this.version(n + 1)` con su `.upgrade()`.
 * - Dexie aplica las migraciones pendientes en orden al abrir la base de datos,
 *   conservando todos los registros.
 */
export class FinanzasDB extends Dexie {
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  rules!: Table<Rule, string>
  budgets!: Table<Budget, string>
  templates!: Table<ImportTemplate, string>
  snapshots!: Table<Snapshot, string>
  imports!: Table<ImportLog, string>
  settings!: Table<Setting, string>

  constructor(name = DB_NAME) {
    super(name)

    // Versión 1: esquema inicial
    this.version(1).stores({
      accounts: 'id, type, order',
      categories: 'id, parentId, order',
      transactions: 'id, accountId, date, categoryId, kind, status, source, transferId, externalId, dupKey',
      rules: 'id, keyword, categoryId',
      budgets: 'id, &categoryId',
      templates: 'id, signature',
      snapshots: 'id, accountId, date, fingerprint',
      imports: 'id, createdAt',
      settings: 'key',
    })

    // Versión 2: índice por etiquetas y por cuenta+fecha; rellena campos que antes eran opcionales
    this.version(2)
      .stores({
        transactions: 'id, accountId, date, categoryId, kind, status, source, transferId, externalId, dupKey, [accountId+date], *tags',
      })
      .upgrade((tx) =>
        tx
          .table('transactions')
          .toCollection()
          .modify((t: Partial<Transaction>) => {
            if (!Array.isArray(t.tags)) t.tags = []
            if (!t.status) t.status = 'confirmado'
            if (!t.source) t.source = 'manual'
            if (!t.updatedAt) t.updatedAt = t.createdAt ?? Date.now()
          }),
      )

    this.on('populate', (tx) => seed(tx))
  }
}

async function seed(tx: DexieTx) {
  await tx.table('categories').bulkAdd(defaultCategories())
  await tx.table('rules').bulkAdd(defaultRules())
}

export const db = new FinanzasDB()

/** Pide al navegador que no borre nunca los datos (almacenamiento persistente) */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Vuelve a crear categorías y reglas predefinidas (tras borrar todo) */
export async function reseed(database: FinanzasDB = db) {
  await database.transaction('rw', database.categories, database.rules, async () => {
    await database.categories.bulkPut(defaultCategories())
    await database.rules.bulkPut(defaultRules())
  })
}

export const ALL_TABLES = ['accounts', 'categories', 'transactions', 'rules', 'budgets', 'templates', 'snapshots', 'imports', 'settings'] as const
export type TableName = (typeof ALL_TABLES)[number]
