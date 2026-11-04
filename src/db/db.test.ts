import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { FinanzasDB } from './db'
import { backupOverdue, createBackup, restoreBackup, validateBackup } from './backup'
import { getSettings, setSetting } from './settings'

describe('base de datos', () => {
  it('crea categorías y reglas predefinidas al abrir por primera vez', async () => {
    const db = new FinanzasDB('test-seed')
    expect(await db.categories.count()).toBeGreaterThan(30)
    expect(await db.rules.count()).toBeGreaterThan(100)
    db.close()
  })

  it('la migración v1 → v2 conserva los datos', async () => {
    const name = 'test-migracion'
    const old = new Dexie(name)
    old.version(1).stores({
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
    await old.open()
    await old.table('transactions').add({ id: 'viejo', accountId: 'a1', date: '2026-01-01', amount: -100, description: 'Antiguo', createdAt: 5 })
    await old.table('accounts').add({ id: 'a1', name: 'Cuenta', type: 'banco', initialBalance: 1000, order: 0 })
    old.close()

    const db = new FinanzasDB(name)
    await db.open()
    expect(db.verno).toBe(2)
    const t = await db.transactions.get('viejo')
    expect(t).toMatchObject({ description: 'Antiguo', tags: [], status: 'confirmado', source: 'manual', updatedAt: 5 })
    expect(await db.accounts.get('a1')).toMatchObject({ initialBalance: 1000 })
    expect(await db.transactions.where('[accountId+date]').equals(['a1', '2026-01-01']).count()).toBe(1)
    db.close()
  })

  it('copia de seguridad: exportar e importar todo', async () => {
    const a = new FinanzasDB('test-backup-a')
    await a.accounts.add({ id: 'c1', name: 'Banco', type: 'banco', initialBalance: 5000, color: '#000', order: 0, createdAt: 1 })
    await a.transactions.add({ id: 't1', accountId: 'c1', date: '2026-10-01', amount: -250, description: 'Café', categoryId: null, kind: 'gasto', status: 'confirmado', source: 'manual', tags: ['viaje'], createdAt: 1, updatedAt: 1 })
    await setSetting('monthStartDay', 25, a)
    const backup = JSON.parse(JSON.stringify(await createBackup(a)))

    const b = new FinanzasDB('test-backup-b')
    await b.transactions.add({ id: 'otro', accountId: 'x', date: '2026-01-01', amount: 1, description: 'Se borra', categoryId: null, kind: 'ingreso', status: 'confirmado', source: 'manual', tags: [], createdAt: 1, updatedAt: 1 })
    const res = await restoreBackup(backup, b)
    expect(res.transactions).toBe(1)
    expect(await b.transactions.toArray()).toEqual(await a.transactions.toArray())
    expect(await b.categories.count()).toBe(await a.categories.count())
    expect((await getSettings(b)).monthStartDay).toBe(25)
    a.close()
    b.close()
  })

  it('rechaza archivos que no son copias', () => {
    expect(() => validateBackup({ hola: 1 })).toThrow()
    expect(() => validateBackup(null)).toThrow()
    expect(() => validateBackup({ app: 'claudio-finanzas', tables: { transactions: 'x' } })).toThrow()
  })

  it('aviso de copia: más de 30 días o nunca', () => {
    const now = Date.UTC(2026, 10, 4)
    expect(backupOverdue(null, true, now)).toBe(true)
    expect(backupOverdue(null, false, now)).toBe(false)
    expect(backupOverdue(now - 10 * 86400000, true, now)).toBe(false)
    expect(backupOverdue(now - 31 * 86400000, true, now)).toBe(true)
  })
})
