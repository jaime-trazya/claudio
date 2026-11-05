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
    expect(db.verno).toBe(4)
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

  it('aviso de copia: cada semana por defecto, o cada los días elegidos, o nunca hecha', () => {
    const now = Date.UTC(2026, 10, 4)
    expect(backupOverdue(null, true, now)).toBe(true)
    expect(backupOverdue(null, false, now)).toBe(false)
    expect(backupOverdue(now - 5 * 86400000, true, now)).toBe(false)
    expect(backupOverdue(now - 8 * 86400000, true, now)).toBe(true)
    expect(backupOverdue(now - 10 * 86400000, true, now, 30)).toBe(false)
    expect(backupOverdue(now - 31 * 86400000, true, now, 30)).toBe(true)
  })
})

import { syncDefaults } from './db'
import { exportRules, importRules } from './actions'
import { DEFAULTS_VERSION } from '../domain/defaults'
import { categorize, effectiveRules, ownerRules } from '../domain/categorize'

describe('predefinidos y reglas', () => {
  it('al actualizar añade categorías nuevas y renueva las reglas predefinidas sin tocar las tuyas', async () => {
    const db = new FinanzasDB('test-sync')
    await db.open()
    // Simula una instalación antigua: sin categoría de tabaco, versión 1 y una regla propia
    await db.categories.delete('cat-tabaco')
    await db.rules.filter((r) => r.categoryId === 'cat-tabaco').delete()
    await db.rules.add({ id: 'mia', keyword: 'bar pepe', categoryId: 'cat-restaurantes', custom: true, createdAt: 1 })
    await db.categories.update('cat-ocio', { name: 'Diversión' })
    await db.settings.put({ key: 'defaultsVersion', value: 1 })
    expect(await syncDefaults(db)).toBe(true)
    expect(await db.categories.get('cat-tabaco')).toBeDefined()
    expect((await db.categories.get('cat-ocio'))!.name).toBe('Diversión')
    expect(await db.rules.get('mia')).toBeDefined()
    expect(await db.rules.where('keyword').equals('estanco').count()).toBe(1)
    expect((await db.settings.get('defaultsVersion'))!.value).toBe(DEFAULTS_VERSION)
    expect(await syncDefaults(db)).toBe(false)
    db.close()
  })

  it('tu nombre convierte en traspaso los envíos a ti mismo', () => {
    expect(ownerRules('Ana')).toEqual([])
    const rules = effectiveRules([], 'Ana Ejemplo Prueba')
    expect(categorize('To Ana Ejemplo', -5000, rules).kind).toBe('transferencia')
    expect(categorize('Outgoing transfer for Ana Ejemplo Prueba', -5690, rules).kind).toBe('transferencia')
    expect(categorize('To Luis Otro', -5000, rules).kind).toBe('gasto')
  })
})

describe('exportar e importar reglas', () => {
  it('importa reglas, salta las de categorías inexistentes y recategoriza', async () => {
    const { db } = await import('./db')
    await db.open()
    await db.transactions.add({ id: 'r1', accountId: 'a', date: '2026-10-01', amount: -350, description: 'BAR EL INVENTADO', categoryId: 'cat-bares', kind: 'gasto', status: 'confirmado', source: 'extracto', tags: [], createdAt: 1, updatedAt: 1 })
    const res = await importRules({ type: 'claudio-reglas', version: 1, rules: [{ keyword: 'el inventado', categoryId: 'cat-restaurantes' }, { keyword: 'x', categoryId: 'no-existe' }] })
    expect(res).toEqual({ added: 1, skipped: 1, changed: 1, budgets: 0 })
    expect((await db.transactions.get('r1'))!.categoryId).toBe('cat-restaurantes')
    expect((await exportRules()).rules).toEqual([{ keyword: 'el inventado', categoryId: 'cat-restaurantes' }])
    await expect(importRules({ hola: 1 })).rejects.toThrow()
  })
})

import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractPdfItems, itemsToLines } from '../import/pdfText'
import { pdfToTables } from '../import/pdfTable'
import { applyMapping, bankClosingBalance, detectColumns } from '../import/detect'
import { planImport } from '../import/reconcile'
import { applyStatementImport, mirrorTransfers } from './actions'
import { accountBalance } from '../domain/stats'
import { sample } from '../test/helpers'

describe('importar las dos cuentas de un PDF', () => {
  it('cuenta principal + cuenta remunerada cuadran y reimportar no duplica', async () => {
    const { db } = await import('./db')
    await db.open()
    await db.accounts.bulkAdd([
      { id: 'rev', name: 'Revolut', type: 'banco', bank: 'revolut', initialBalance: 0, color: '#000', order: 0, createdAt: 1 },
      { id: 'sav', name: 'Revolut · Cuenta remunerada', type: 'banco', bank: 'revolut', initialBalance: 0, color: '#000', order: 1, createdAt: 1 },
    ])
    const fonts = path.resolve(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/') + '/'
    const tables = pdfToTables(itemsToLines(await extractPdfItems(sample('extracto-pdf-varias-tablas.pdf'), pdfjs as never, { standardFontDataUrl: fonts })))
    const run = async () => {
      for (const [i, acc] of ['rev', 'sav'].entries()) {
        const movs = applyMapping(tables[i].rows, detectColumns(tables[i].rows)!.mapping)
        const rows = planImport(movs, acc, await db.transactions.toArray())
        await applyStatementImport({ rows, accountId: acc, fileName: 'x', bankBalance: bankClosingBalance(movs) })
      }
      return mirrorTransfers('rev', 'sav')
    }
    expect(await run()).toBe(2)
    const all = await db.transactions.toArray()
    const accs = await db.accounts.toArray()
    expect(accountBalance(accs.find((a) => a.id === 'rev')!, all)).toBe(5407)
    // 60 enviados − 20 devueltos + 3 céntimos de intereses
    expect(accountBalance(accs.find((a) => a.id === 'sav')!, all)).toBe(4003)
    const count = all.length
    // Segunda vez con el mismo archivo: nada nuevo
    expect(await run()).toBe(0)
    expect(await db.transactions.count()).toBe(count)
  })
})

import { createRestorePoint, dailyRestorePoint, listRestorePoints, restorePoint, undoLast } from './history'
import { wipeAll } from './actions'

describe('deshacer', () => {
  it('deshace la última acción, vuelve a una foto diaria y deshace "eliminar todo"', async () => {
    const db = new FinanzasDB('test-historial')
    await db.open()
    const t = (id: string, amount: number) => ({ id, accountId: 'c1', date: '2026-10-01', amount, description: id, categoryId: null, kind: 'gasto' as const, status: 'confirmado' as const, source: 'manual' as const, tags: [], createdAt: 1, updatedAt: 1 })
    await db.accounts.add({ id: 'c1', name: 'Banco', type: 'banco', initialBalance: 0, color: '#000', order: 0, createdAt: 1 })
    await db.transactions.add(t('a', -100))
    // Foto diaria (una por día, solo si hay cambios)
    expect(await dailyRestorePoint(db)).toBe(true)
    expect(await dailyRestorePoint(db)).toBe(false)
    // Acción: importar dos movimientos
    await createRestorePoint('Antes de importar «x.csv»', 'accion', db)
    await db.transactions.bulkAdd([t('b', -200), t('c', -300)])
    expect(await db.transactions.count()).toBe(3)
    expect(await undoLast(db)).toBe('Antes de importar «x.csv»')
    expect((await db.transactions.toArray()).map((x) => x.id)).toEqual(['a'])
    // Lo deshecho se puede rehacer desde el punto "Antes de volver…"
    const redo = (await listRestorePoints(db)).find((p) => p.label.startsWith('Antes de deshacer'))!
    await restorePoint(redo.id, db)
    expect(await db.transactions.count()).toBe(3)
    // Volver a como estaba en la foto diaria
    const daily = (await listRestorePoints(db)).find((p) => p.kind === 'diaria')!
    await restorePoint(daily.id, db)
    expect(await db.transactions.count()).toBe(1)
    // Los puntos no entran en la copia: siguen ahí tras restaurar
    expect((await listRestorePoints(db)).length).toBeGreaterThan(2)
    db.close()
  })

  it('eliminar todo se puede deshacer, salvo si se borra también el historial', async () => {
    const { db } = await import('./db')
    await db.open()
    const before = await db.transactions.count()
    expect(before).toBeGreaterThan(0)
    await wipeAll(true)
    expect(await db.transactions.count()).toBe(0)
    expect(await db.categories.count()).toBeGreaterThan(30)
    await undoLast(db)
    expect(await db.transactions.count()).toBe(before)
    await wipeAll(false)
    expect(await db.restorePoints.count()).toBe(0)
    expect(await undoLast(db)).toBeNull()
  })
})
