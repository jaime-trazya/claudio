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

export function validateBackup(data: unknown): Backup {
  if (!data || typeof data !== 'object') throw new BackupError('El archivo no es una copia de seguridad válida.')
  const b = data as Partial<Backup>
  if (b.app !== BACKUP_APP) throw new BackupError('Este archivo no es una copia de seguridad de esta app.')
  if (!b.tables || typeof b.tables !== 'object') throw new BackupError('La copia no contiene datos.')
  for (const t of ALL_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t]
    if (rows !== undefined && !Array.isArray(rows)) throw new BackupError(`La tabla "${t}" de la copia está dañada.`)
  }
  if (typeof b.schemaVersion === 'number' && b.schemaVersion > 1000) throw new BackupError('Versión de copia desconocida.')
  return b as Backup
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
  })
  // Normaliza registros de copias antiguas (mismos arreglos que la migración v2)
  await database.transactions.toCollection().modify((t) => {
    if (!Array.isArray(t.tags)) t.tags = []
    if (!t.status) t.status = 'confirmado'
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
