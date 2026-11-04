import { describe, expect, it } from 'vitest'
import { forStats, pairTransfers } from './transfers'
import { accountBalance, summarize } from './stats'
import { defaultCategories } from './defaults'
import { account, tx } from '../test/helpers'

const byId = new Map(defaultCategories().map((c) => [c.id, c]))
const all = { start: '2000-01-01', end: '2100-01-01' }

describe('traspasos entre extractos distintos', () => {
  it('empareja el cargo de un banco con la recarga en otro (mismo importe, hasta 4 días)', () => {
    const txs = [
      tx({ id: 'caixa', accountId: 'c', date: '2026-10-31', amount: -24300, kind: 'transferencia', description: 'Revolut**0000*' }),
      tx({ id: 'rev', accountId: 'r', date: '2026-10-31', amount: 24300, kind: 'transferencia', description: 'Una recarga de Apple Pay' }),
      tx({ id: 'lejos', accountId: 'r', date: '2026-10-01', amount: 24300, kind: 'transferencia', description: 'Una recarga de Apple Pay' }),
      tx({ id: 'misma', accountId: 'c', date: '2026-10-31', amount: 24300, kind: 'transferencia', description: 'x' }),
    ]
    expect([...pairTransfers(txs)].sort()).toEqual(['caixa', 'rev'])
  })

  it('los traspasos sin pareja cuentan como entradas o salidas de otras cuentas', () => {
    const txs = forStats([
      tx({ id: 'in', accountId: 'r', date: '2026-10-05', amount: 5000, kind: 'transferencia', description: 'Recarga con otra tarjeta' }),
      tx({ id: 'out', accountId: 'r', date: '2026-10-06', amount: -2000, kind: 'transferencia', description: 'To Ana Ejemplo' }),
      tx({ id: 'app', accountId: 'r', date: '2026-10-06', amount: -1000, kind: 'transferencia', transferId: 'T', description: 'Traspaso hecho en la app' }),
    ])
    expect(txs.map((t) => [t.id, t.kind, t.categoryId])).toEqual([
      ['in', 'ingreso', 'cat-entrada-externa'],
      ['out', 'gasto', 'cat-salida-externa'],
      ['app', 'transferencia', null],
    ])
  })

  it('cuadra: ingresos − gastos = lo que varían los saldos (sin aportaciones)', () => {
    const c = account({ id: 'c' })
    const r = account({ id: 'r' })
    const raw = [
      tx({ accountId: 'c', date: '2026-10-01', amount: 100000, kind: 'ingreso' }),
      tx({ accountId: 'c', date: '2026-10-02', amount: -30000, kind: 'transferencia', description: 'Revolut' }),
      tx({ accountId: 'r', date: '2026-10-02', amount: 30000, kind: 'transferencia', description: 'Recarga' }),
      tx({ accountId: 'r', date: '2026-10-03', amount: 20000, kind: 'transferencia', description: 'Recarga desde otra tarjeta' }),
      tx({ accountId: 'r', date: '2026-10-04', amount: -45000, kind: 'gasto', categoryId: 'cat-restaurantes' }),
      tx({ accountId: 'c', date: '2026-10-05', amount: -10000, kind: 'transferencia', description: 'A mi otra cuenta' }),
    ]
    const s = summarize(forStats(raw), all, byId)
    const change = accountBalance(c, raw) + accountBalance(r, raw)
    expect(s.balance).toBe(change)
    expect(s).toMatchObject({ income: 120000, expenses: 55000 })
  })
})
