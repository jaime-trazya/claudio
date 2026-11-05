// Regresiones de la segunda revisión: datos, traspasos, deshacer y copias (uno por bloque)
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { FinanzasDB, db } from './db'
import { createTransfer, deleteAccount, mirrorTransfers, newTransaction, saveTransaction } from './actions'
import { createRestorePoint, undoLast } from './history'
import { validateBackup } from './backup'
import { accountBalance } from '../domain/stats'
import { isReconcilable } from '../import/reconcile'
import { transactionsToCSV } from '../domain/csvExport'
import { account, tx } from '../test/helpers'

describe('mover un movimiento importado a otra cuenta', () => {
  it('no se lleva el saldo del banco de la cuenta anterior', async () => {
    await db.open()
    await db.accounts.bulkPut([account({ id: 'mA' }), account({ id: 'mB' })])
    const cafe = { ...newTransaction({ accountId: 'mA', date: '2026-10-10', amount: -1000, description: 'Café' }), source: 'extracto' as const, bankBalance: 499000, bankEffDate: '2026-10-10', bankSeq: 1, bankDate: '2026-10-10' }
    await db.transactions.add(cafe)
    await saveTransaction(newTransaction({ accountId: 'mB', date: '2026-10-01', amount: 2000, description: 'Ingreso' }))
    await saveTransaction({ ...cafe, accountId: 'mB' })
    const moved = (await db.transactions.get(cafe.id))!
    expect(moved.bankBalance).toBeUndefined()
    expect(accountBalance((await db.accounts.get('mB'))!, await db.transactions.toArray())).toBe(1000)
  })
  it('editar una pata de un traspaso actualiza la otra en la misma escritura', async () => {
    const from = account({ id: 'tA' })
    const to = account({ id: 'tB' })
    await db.accounts.bulkPut([from, to])
    await createTransfer({ from, to, amount: 5000, date: '2026-10-01' })
    const out = (await db.transactions.where('accountId').equals('tA').toArray())[0]
    await saveTransaction({ ...out, amount: -7000 }, { syncTransfer: true })
    const other = (await db.transactions.where('accountId').equals('tB').toArray())[0]
    expect(other.amount).toBe(7000)
  })
})

describe('traspasos espejo', () => {
  it('no duplica un traspaso que ya tiene pareja', async () => {
    const from = account({ id: 'eA' })
    const to = account({ id: 'eB' })
    await db.accounts.bulkPut([from, to])
    await createTransfer({ from, to, amount: 500, date: '2026-10-02', description: 'To Cuenta Remunerada' })
    expect(await mirrorTransfers('eA', 'eB')).toBe(0)
    expect(await db.transactions.where('accountId').equals('eB').count()).toBe(1)
  })
  it('enlaza el movimiento que ya trae el extracto de la cuenta de destino en lugar de crear otro', async () => {
    await db.accounts.bulkPut([account({ id: 'fA' }), account({ id: 'fB' })])
    await db.transactions.bulkAdd([
      { ...newTransaction({ accountId: 'fA', date: '2026-10-10', amount: -20000, description: 'TRANSFERENCIA A CUENTA REMUNERADA' }), source: 'extracto' },
      { ...newTransaction({ accountId: 'fB', date: '2026-10-11', amount: 20000, description: 'Transferencia recibida' }), source: 'extracto' },
    ])
    expect(await mirrorTransfers('fA', 'fB')).toBe(1)
    const dest = await db.transactions.where('accountId').equals('fB').toArray()
    expect(dest).toHaveLength(1)
    expect(dest[0].transferId).toBeTruthy()
  })
  it('la pata espejo se puede conciliar con el extracto de su propia cuenta', () => {
    const leg = tx({ date: '2026-10-10', amount: 200, accountId: 'sav', source: 'extracto', externalId: 'espejo-x', transferId: 'tr', kind: 'transferencia' })
    expect(isReconcilable(leg, 'sav')).toBe(true)
    expect(isReconcilable(leg, 'otra')).toBe(false)
  })
})

describe('borrar una cuenta', () => {
  it('suelta los objetivos, la cuenta de efectivo de la inversión y la otra pata de sus traspasos', async () => {
    const bank = account({ id: 'dBank' })
    const keep = account({ id: 'dKeep' })
    await db.accounts.bulkPut([bank, keep, account({ id: 'dInv', type: 'inversion', cashAccountId: 'dBank' })])
    await db.goals.add({ id: 'g1', name: 'Viaje', target: 100000, accountId: 'dBank', saved: 0, color: '#000', createdAt: 1 })
    await createTransfer({ from: bank, to: keep, amount: 3000, date: '2026-10-01' })
    await deleteAccount('dBank')
    expect((await db.goals.get('g1'))!.accountId).toBeUndefined()
    expect((await db.accounts.get('dInv'))!.cashAccountId).toBeUndefined()
    const left = await db.transactions.where('accountId').equals('dKeep').toArray()
    expect(left).toHaveLength(1)
    expect(left[0].transferId).toBeUndefined()
  })
})

describe('deshacer dos veces', () => {
  it('retrocede dos acciones en vez de rehacer la primera', async () => {
    const d = new FinanzasDB('test-deshacer-dos')
    await d.open()
    await d.accounts.add(account({ id: 'c' }))
    await d.transactions.add(tx({ id: 'x1', accountId: 'c', date: '2026-10-01', amount: -100 }))
    await createRestorePoint('Antes de importar «uno»', 'accion', d)
    await d.transactions.add(tx({ id: 'x2', accountId: 'c', date: '2026-10-02', amount: -200 }))
    await createRestorePoint('Antes de importar «dos»', 'accion', d)
    await d.transactions.add(tx({ id: 'x3', accountId: 'c', date: '2026-10-03', amount: -300 }))
    expect(await undoLast(d)).toBe('Antes de importar «dos»')
    expect(await d.transactions.count()).toBe(2)
    expect(await undoLast(d)).toBe('Antes de importar «uno»')
    expect(await d.transactions.count()).toBe(1)
    d.close()
  })
})

describe('copias de seguridad con datos dañados', () => {
  const base = (t: unknown[]) => ({ app: 'claudio-finanzas', schemaVersion: 4, exportedAt: '', tables: { accounts: [account({ id: 'B' })], categories: [], transactions: t, rules: [], budgets: [], settings: [] } })
  it('rechaza importes en texto o fechas rotas', () => {
    expect(() => validateBackup(base([{ id: 'x', accountId: 'B', amount: '5', date: '2026-10-01' }]))).toThrow(/dañados/)
    expect(() => validateBackup(base([{ id: 'x', accountId: 'B', amount: 500, date: 'xx' }]))).toThrow(/dañados/)
  })
  it('acepta una copia correcta', () => {
    expect(() => validateBackup(base([tx({ id: 'ok', accountId: 'B', date: '2026-10-01', amount: -500 })]))).not.toThrow()
  })
})

describe('exportar a CSV', () => {
  it('un concepto que empieza por = no se ejecuta como fórmula, y los importes negativos siguen siendo números', () => {
    const csv = transactionsToCSV([tx({ date: '2026-10-01', amount: -1250, description: '=HYPERLINK("http://x","y")' })], [account({ id: 'a1' })], [])
    const line = csv.split('\r\n')[1]
    expect(line).toContain(`"'=HYPERLINK(""http://x"",""y"")"`)
    expect(line).toContain(';-12,50;')
  })
})
