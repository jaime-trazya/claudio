// Regresiones de los fallos encontrados en la revisión (uno por bloque)
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { FinanzasDB, db } from './db'
import { createTransfer, deleteTransaction, newTransaction, repairData, restoreTransactions, saveTransaction } from './actions'
import { createBackup, restoreBackup, validateBackup } from './backup'
import { dailyRestorePoint } from './history'
import { accountBalance, bankOrder } from '../domain/stats'
import { planImport } from '../import/reconcile'
import { formatDay, isValidISO } from '../lib/dates'
import { account, tx } from '../test/helpers'
import type { Account } from './types'

const acc = (id: string): Account => ({ id, name: id, type: 'banco', initialBalance: 0, color: '#000', order: 0, createdAt: 1 })

describe('1. movimiento sin fecha', () => {
  it('no se puede guardar sin fecha', async () => {
    await db.open()
    await expect(saveTransaction(newTransaction({ accountId: 'x', date: '', amount: -100, description: 'Sin fecha' }))).rejects.toThrow(/fecha/)
    await expect(saveTransaction(newTransaction({ accountId: 'x', date: '2026-02-31', amount: -100, description: 'Imposible' }))).rejects.toThrow(/fecha/)
  })
  it('los que ya estaban guardados sin fecha se reparan y la lista no se rompe', async () => {
    await db.transactions.add({ ...newTransaction({ accountId: 'x', date: '2026-11-05', amount: -100, description: 'Roto' }), id: 'roto', date: '', createdAt: Date.UTC(2026, 10, 5, 12) })
    expect(formatDay('')).toBe('Sin fecha')
    expect(await repairData()).toBe(1)
    expect(isValidISO((await db.transactions.get('roto'))!.date)).toBe(true)
    await db.transactions.delete('roto')
  })
})

describe('2. deshacer el borrado de una transferencia', () => {
  it('recupera las dos partes y las cuentas vuelven a cuadrar', async () => {
    const from = acc('origen')
    const to = acc('destino')
    await db.accounts.bulkPut([from, to])
    await createTransfer({ from, to, amount: 10000, date: '2026-11-05' })
    const out = (await db.transactions.where('accountId').equals('origen').toArray())[0]
    const removed = await deleteTransaction(out)
    expect(removed).toHaveLength(2)
    await restoreTransactions(removed)
    const all = await db.transactions.toArray()
    expect(accountBalance(from, all)).toBe(-10000)
    expect(accountBalance(to, all)).toBe(10000)
    await db.transactions.bulkDelete(removed.map((t) => t.id))
  })
})

describe('3. gasto manual el mismo día que el extracto', () => {
  it('se descuenta del saldo del banco', () => {
    const o = bankOrder(['2026-11-05'])
    const bank = tx({ accountId: 'b', date: '2026-11-05', amount: 100000, bankBalance: 100000, bankEffDate: o[0].effDate, bankSeq: o[0].seq, source: 'extracto', createdAt: 1 })
    const manual = tx({ accountId: 'b', date: '2026-11-05', amount: -5000, source: 'manual', createdAt: 2 })
    expect(accountBalance(account({ id: 'b' }), [bank, manual])).toBe(95000)
    // Lo anterior al extracto ya lo cubre el saldo del banco
    const older = tx({ accountId: 'b', date: '2026-11-01', amount: -700, source: 'manual', createdAt: 3 })
    expect(accountBalance(account({ id: 'b' }), [bank, manual, older])).toBe(95000)
  })
})

describe('4. dos compras iguales el mismo día con distinto saldo', () => {
  it('solo marca como duplicada la que ya estaba', () => {
    // Ya importado: el primer café (saldo 995 €)
    const existing = [tx({ accountId: 'a', date: '2026-11-05', amount: -500, description: 'CAFE', source: 'extracto', bankBalance: 99500 })]
    // Extracto nuevo, del más nuevo al más viejo: segundo café (990 €) y primero (995 €)
    const plan = planImport(
      [
        { date: '2026-11-05', amount: -500, description: 'CAFE', balance: 99000, rowIndex: 0 },
        { date: '2026-11-05', amount: -500, description: 'CAFE', balance: 99500, rowIndex: 1 },
      ],
      'a',
      existing,
    )
    expect(plan.map((r) => r.status)).toEqual(['nuevo', 'duplicado'])
  })
  it('sigue reconociendo por concepto lo importado antes sin saldo', () => {
    const existing = [tx({ accountId: 'a', date: '2026-11-05', amount: -500, description: 'CAFE', source: 'extracto' })]
    const plan = planImport([{ date: '2026-11-05', amount: -500, description: 'CAFE', balance: 99500, rowIndex: 0 }], 'a', existing)
    expect(plan[0].status).toBe('duplicado')
  })
})

describe('5. copias incompletas', () => {
  it('se rechazan sin tocar los datos', async () => {
    expect(() => validateBackup({ app: 'claudio-finanzas', tables: {} })).toThrow(/incompleta/)
    expect(() => validateBackup({ app: 'claudio-finanzas', tables: { accounts: [], categories: [], transactions: [{ sin: 'id' }], rules: [], budgets: [], settings: [] } })).toThrow(/dañados/)
    const d = new FinanzasDB('test-copia-incompleta')
    await d.accounts.add(acc('mia'))
    await expect(restoreBackup({ app: 'claudio-finanzas', tables: {} }, d)).rejects.toThrow()
    expect(await d.accounts.count()).toBe(1)
    // Una copia completa sigue funcionando
    await restoreBackup(JSON.parse(JSON.stringify(await createBackup(d))), d)
    expect(await d.accounts.count()).toBe(1)
    d.close()
  })
})

describe('6. foto diaria', () => {
  it('detecta cambios en el contenido de las cuentas (nombre, saldo inicial)', async () => {
    const d = new FinanzasDB('test-foto-diaria')
    await d.accounts.add(acc('c1'))
    await d.transactions.add(newTransaction({ accountId: 'c1', date: '2026-11-04', amount: -100, description: 'x' }))
    expect(await dailyRestorePoint(d)).toBe(true)
    // Simula el día siguiente
    const p = (await d.restorePoints.toArray())[0]
    await d.restorePoints.update(p.id, { day: '2026-11-01' })
    expect(await dailyRestorePoint(d)).toBe(false) // sin cambios, no hay foto nueva
    await d.accounts.update('c1', { name: 'Otro nombre', initialBalance: 5000 })
    expect(await dailyRestorePoint(d)).toBe(true)
    d.close()
  })
})
