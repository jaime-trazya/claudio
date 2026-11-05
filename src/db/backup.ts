import { ALL_TABLES, db, type FinanzasDB, type TableName } from './db'

export const BACKUP_APP = 'claudio-finanzas'

export interface Backup {
  app: typeof BACKUP_APP
  schemaVersion: number
  exportedAt: string
  tables: Record<TableName, unknown[]>
}

export async function createBackup(database: FinanzasDB = db): Promise<Backup> {
  const tables = {} as Record<TableName, unknown[]>
  await database.transaction('r', ALL_TABLES.map((t) => database.table(t)), async () => {
    for (const t of ALL_TABLES) tables[t] = await database.table(t).toArray()
  })
  return { app: BACKUP_APP, schemaVersion: database.verno, exportedAt: new Date().toISOString(), tables }
}

export class BackupError extends Error {}

/** Tablas que toda copia debe traer (las más nuevas, como los objetivos, son opcionales) */
export const REQUIRED_TABLES = ['accounts', 'categories', 'transactions', 'rules', 'budgets', 'settings'] as const

export function validateBackup(data: unknown): Backup {
  if (!data || typeof data !== 'object') throw new BackupError('El archivo no es una copia de seguridad válida.')
  const b = data as Partial<Backup>
  if (b.app !== BACKUP_APP) throw new BackupError('Este archivo no es una copia de seguridad de esta app.')
  if (!b.tables || typeof b.tables !== 'object') throw new BackupError('La copia no contiene datos.')
  const tables = b.tables as Record<string, unknown>
  const missing = REQUIRED_TABLES.filter((t) => !Array.isArray(tables[t]))
  if (missing.length) throw new BackupError(`La copia está incompleta: le faltan ${missing.join(', ')}. No se ha tocado nada.`)
  for (const t of ALL_TABLES) {
    const rows = tables[t]
    if (rows !== undefined && !Array.isArray(rows)) throw new BackupError(`La tabla «${t}» de la copia está dañada.`)
  }
  // Cada registro necesita su identificador, o la base de datos lo rechazaría a medias
  for (const t of ALL_TABLES) {
    const rows = (tables[t] ?? []) as unknown[]
    const key = t === 'settings' ? 'key' : 'id'
    if (rows.some((r) => !r || typeof r !== 'object' || typeof (r as Record<string, unknown>)[key] !== 'string')) {
      throw new BackupError(`La tabla «${t}» de la copia tiene registros dañados. No se ha tocado nada.`)
    }
  }
  if (typeof b.schemaVersion === 'number' && b.schemaVersion > 1000) throw new BackupError('Versión de copia desconocida.')
  checkRecords(tables)
  return b as Backup
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isCents = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 1e13
const KINDS = new Set(['gasto', 'ingreso', 'transferencia', 'aportacion'])

/**
 * Comprueba los campos de los que dependen los saldos y las listas. Un movimiento con el importe en
 * texto ("5") sumaría concatenando ("5010005 €") y una fecha rota descuadraría todos los meses:
 * mejor rechazar la copia entera que restaurarla a medias o con datos absurdos.
 */
function checkRecords(tables: Record<string, unknown>) {
  const fail = (t: string) => {
    throw new BackupError(`La tabla «${t}» de la copia tiene datos dañados. No se ha tocado nada.`)
  }
  const accounts = (tables.accounts ?? []) as Record<string, unknown>[]
  for (const a of accounts) if (typeof a.name !== 'string' || !isCents(a.initialBalance ?? 0)) fail('accounts')
  for (const t of (tables.transactions ?? []) as Record<string, unknown>[]) {
    if (!isCents(t.amount) || typeof t.date !== 'string' || !ISO_DATE.test(t.date) || typeof t.accountId !== 'string') fail('transactions')
    if (t.kind !== undefined && !KINDS.has(t.kind as string)) fail('transactions')
    if (t.tags !== undefined && !(Array.isArray(t.tags) && t.tags.every((x) => typeof x === 'string'))) fail('transactions')
    if (t.splits !== undefined && t.splits !== null && !(Array.isArray(t.splits) && t.splits.every((s) => s && typeof s === 'object' && isCents((s as Record<string, unknown>).amount)))) fail('transactions')
    if (t.bankBalance !== undefined && !isCents(t.bankBalance)) fail('transactions')
  }
  for (const b of (tables.budgets ?? []) as Record<string, unknown>[]) if (!isCents(b.amount)) fail('budgets')
}

/** Resumen de lo que trae una copia, para enseñarlo antes de restaurar */
export function backupSummary(b: Backup): { accounts: number; transactions: number; exportedAt: string | null } {
  return { accounts: b.tables.accounts?.length ?? 0, transactions: b.tables.transactions?.length ?? 0, exportedAt: b.exportedAt ?? null }
}

/**
 * Restaura una copia: sustituye TODOS los datos actuales por los de la copia,
 * en una única transacción (si algo falla, no se pierde nada).
 */
export async function restoreBackup(data: unknown, database: FinanzasDB = db): Promise<{ transactions: number }> {
  const backup = validateBackup(data)
  await database.transaction('rw', ALL_TABLES.map((t) => database.table(t)), async () => {
    for (const t of ALL_TABLES) {
      const rows = (backup.tables[t] ?? []) as unknown[]
      await database.table(t).clear()
      if (rows.length) await database.table(t).bulkAdd(rows)
    }
    // Normaliza registros de copias antiguas (mismos arreglos que la migración v2), en la misma transacción
    await database.transactions.toCollection().modify((t) => {
      if (!Array.isArray(t.tags)) t.tags = []
      if (!t.status) t.status = 'confirmado'
    })
  })
  return { transactions: backup.tables.transactions?.length ?? 0 }
}

export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `copia-claudio-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`
}

export const BACKUP_REMINDER_DAYS = 30

export function backupOverdue(lastBackupAt: number | null, hasData: boolean, now = Date.now()): boolean {
  if (!hasData) return false
  if (!lastBackupAt) return true
  return now - lastBackupAt > BACKUP_REMINDER_DAYS * 86400000
}
