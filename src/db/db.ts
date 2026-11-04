import Dexie, { type Table, type Transaction as DexieTx } from 'dexie'
import type { Account, Budget, Category, Goal, ImportLog, ImportTemplate, Rule, Setting, Snapshot, Transaction } from './types'
import type { RestorePoint } from './history'
import { DEFAULTS_VERSION, defaultCategories, defaultCategoriesWithVersion, defaultRules } from '../domain/defaults'

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
  goals!: Table<Goal, string>
  restorePoints!: Table<RestorePoint, string>

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

    // Versión 3: objetivos de ahorro
    this.version(3).stores({ goals: 'id, accountId' })

    // Versión 4: historial para deshacer (puntos de restauración; no entran en la copia)
    this.version(4).stores({ restorePoints: 'id, createdAt, kind' })

    this.on('populate', (tx) => seed(tx))
  }
}

async function seed(tx: DexieTx) {
  await tx.table('categories').bulkAdd(defaultCategories())
  await tx.table('rules').bulkAdd(defaultRules())
  await tx.table('settings').put({ key: 'defaultsVersion', value: DEFAULTS_VERSION })
}

/**
 * Al actualizar la app: añade las categorías predefinidas nuevas y renueva las reglas predefinidas.
 * No toca tus categorías, tus reglas (las tuyas tienen custom = true) ni tus movimientos.
 */
export async function syncDefaults(database: FinanzasDB = db): Promise<boolean> {
  const row = await database.settings.get('defaultsVersion')
  const current = typeof row?.value === 'number' ? row.value : 1
  if (current >= DEFAULTS_VERSION) return false
  await database.transaction('rw', database.categories, database.rules, database.settings, database.transactions, async () => {
    const existing = new Set(await database.categories.toCollection().primaryKeys())
    const fresh = defaultCategoriesWithVersion()
      .filter((c) => c.since > current && !existing.has(c.id))
      .map(({ since: _since, ...c }) => c)
    // Las subcategorías nuevas solo si su categoría principal sigue existiendo
    const ids = new Set([...existing, ...fresh.map((c) => c.id)])
    await database.categories.bulkAdd(fresh.filter((c) => !c.parentId || ids.has(c.parentId)))
    const catIds = new Set(await database.categories.toCollection().primaryKeys())
    const customKeywords = new Set((await database.rules.filter((r) => r.custom).toArray()).map((r) => r.keyword))
    await database.rules.filter((r) => !r.custom).delete()
    await database.rules.bulkPut(defaultRules().filter((r) => catIds.has(r.categoryId) && !customKeywords.has(r.keyword)))
    if (current < 3) {
      // v3: "Bizum" se divide en enviado/recibido y "TRASPASO" (de otra persona) pasa a transferencia recibida
      const bizum = await database.categories.get('cat-bizum')
      if (bizum?.name === 'Bizum') await database.categories.update('cat-bizum', { name: 'Bizum enviado' })
      await database.transactions
        .filter((t) => t.categoryId === 'cat-bizum' && t.amount > 0 && !t.splits?.length)
        .modify({ categoryId: 'cat-bizum-recibido', kind: 'ingreso' })
      await database.transactions
        .filter((t) => t.kind === 'transferencia' && !t.transferId && /^\s*traspaso\s*$/i.test(t.bankDescription ?? t.description))
        .modify((t) => {
          t.kind = t.amount > 0 ? 'ingreso' : 'gasto'
          t.categoryId = t.amount > 0 ? 'cat-transf-recibidas' : 'cat-transf-enviadas'
        })
    }
    if (current < 4) {
      // v4: los intereses de la cuenta remunerada son ingresos, no traspasos
      await database.transactions
        .filter((t) => t.kind === 'transferencia' && !t.transferId && /inter[eé]s neto pagado/i.test(t.description))
        .modify({ kind: 'ingreso', categoryId: 'cat-intereses' })
    }
    await database.settings.put({ key: 'defaultsVersion', value: DEFAULTS_VERSION })
  })
  return true
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
  await database.transaction('rw', database.categories, database.rules, database.settings, async () => {
    await database.categories.bulkPut(defaultCategories())
    await database.rules.bulkPut(defaultRules())
    await database.settings.put({ key: 'defaultsVersion', value: DEFAULTS_VERSION })
  })
}

export const ALL_TABLES = ['accounts', 'categories', 'transactions', 'rules', 'budgets', 'templates', 'snapshots', 'imports', 'settings', 'goals'] as const
export type TableName = (typeof ALL_TABLES)[number]
