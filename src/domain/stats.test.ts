import { describe, expect, it } from 'vitest'
import { accountBalance, balanceSeries, delta, expensesByCategory, monthlySeries, periodRange, summarize, topExpenses, topMerchants } from './stats'
import { budgetStatus } from './budgets'
import { netWorth, portfolioEvolution, portfolioSummary, totalContributed } from './investments'
import { defaultCategories } from './defaults'
import { account, tx } from '../test/helpers'
import type { Snapshot } from '../db/types'

const oct = { start: '2026-10-01', end: '2026-10-31' }
const txs = [
  tx({ date: '2026-09-28', amount: 200000, description: 'NOMINA', categoryId: 'cat-sueldo' }),
  tx({ date: '2026-10-02', amount: -80000, description: 'ALQUILER', categoryId: 'cat-alquiler' }),
  tx({ date: '2026-10-04', amount: -5000, description: 'MERCADONA', categoryId: 'cat-supermercado' }),
  tx({ date: '2026-10-10', amount: -3000, description: 'MERCADONA', categoryId: 'cat-supermercado' }),
  tx({ date: '2026-10-12', amount: -10000, description: 'TRADE REPUBLIC', kind: 'aportacion', categoryId: 'cat-inversion' }),
  tx({ date: '2026-10-15', amount: -6000, description: 'CENA + SUPER', splits: [{ categoryId: 'cat-restaurantes', amount: -4000 }, { categoryId: 'cat-supermercado', amount: -2000 }] }),
  tx({ date: '2026-10-20', amount: -5000, description: 'TRASPASO', kind: 'transferencia', transferId: 'x' }),
  tx({ date: '2026-10-20', amount: 5000, accountId: 'a2', description: 'TRASPASO', kind: 'transferencia', transferId: 'x' }),
  tx({ date: '2026-10-28', amount: 200000, description: 'NOMINA', categoryId: 'cat-sueldo' }),
]
const categories = defaultCategories()

describe('estadísticas', () => {
  it('resumen del mes sin transferencias ni aportaciones', () => {
    const s = summarize(txs, oct)
    expect(s).toMatchObject({ income: 200000, expenses: 94000, balance: 106000 })
    expect(s.savingsRate).toBeCloseTo(0.53)
  })

  it('sin ingresos la tasa de ahorro es null y sin datos todo es cero', () => {
    expect(summarize([], oct)).toEqual({ income: 0, expenses: 0, balance: 0, savingsRate: null, count: 0 })
  })

  it('comparación con el periodo anterior', () => {
    expect(delta(150, 100)).toEqual({ diff: 50, ratio: 0.5 })
    expect(delta(150, 0)).toEqual({ diff: 150, ratio: null })
  })

  it('gastos por categoría principal con detalle y divisiones', () => {
    const list = expensesByCategory(txs, oct, categories)
    expect(list.map((c) => [c.categoryId, c.amount])).toEqual([
      ['cat-hogar', 80000],
      ['cat-alimentacion', 14000],
    ])
    expect(list[1].children).toEqual([
      { categoryId: 'cat-supermercado', amount: 10000, count: 3 },
      { categoryId: 'cat-restaurantes', amount: 4000, count: 1 },
    ])
  })

  it('serie de 12 meses termina en el mes actual', () => {
    const series = monthlySeries(txs, 12, 1, '2026-10-15')
    expect(series).toHaveLength(12)
    expect(series[11]).toMatchObject({ key: '2026-10', income: 200000, expenses: 94000 })
    expect(series[10]).toMatchObject({ key: '2026-09', income: 200000, expenses: 0 })
    expect(series[0].key).toBe('2025-11')
  })

  it('periodos: mes, trimestre y año, con el anterior', () => {
    expect(periodRange('mes', 0, 1, '2026-10-15')).toMatchObject({ start: '2026-10-01', end: '2026-10-31', previous: { start: '2026-09-01', end: '2026-09-30' } })
    expect(periodRange('trimestre', 0, 1, '2026-10-15')).toMatchObject({ start: '2026-10-01', end: '2026-12-31', previous: { start: '2026-07-01', end: '2026-09-30' } })
    expect(periodRange('trimestre', -1, 1, '2026-02-15')).toMatchObject({ start: '2025-10-01', end: '2025-12-31' })
    expect(periodRange('año', 0, 1, '2026-10-15')).toMatchObject({ start: '2026-01-01', end: '2026-12-31', label: '2026' })
    expect(periodRange('mes', 0, 25, '2026-10-26')).toMatchObject({ start: '2026-10-25', end: '2026-11-24', label: 'Noviembre 2026' })
    const custom = periodRange('personalizado', 0, 1, '2026-10-15', { start: '2026-10-10', end: '2026-10-19' })
    expect(custom.previous).toEqual({ start: '2026-09-30', end: '2026-10-09' })
  })

  it('top de gastos y comercios', () => {
    expect(topExpenses(txs, oct, 2).map((t) => t.amount)).toEqual([-80000, -6000])
    const merchants = topMerchants(txs, oct)
    expect(merchants.find((m) => m.key === 'mercadona')).toMatchObject({ amount: 8000, count: 2, name: 'Mercadona' })
  })

  it('saldo de cuenta y evolución del saldo total', () => {
    const a1 = account({ id: 'a1', initialBalance: 100000 })
    const a2 = account({ id: 'a2', initialBalance: 0, type: 'efectivo' })
    expect(accountBalance(a1, txs)).toBe(100000 + 200000 - 80000 - 5000 - 3000 - 10000 - 6000 - 5000 + 200000)
    expect(accountBalance(a2, txs)).toBe(5000)
    const series = balanceSeries([a1, a2], txs, monthlySeries(txs, 2, 1, '2026-10-15'))
    expect(series).toEqual([
      { key: '2026-09', balance: 300000 },
      { key: '2026-10', balance: 300000 + 200000 - 80000 - 5000 - 3000 - 10000 - 6000 },
    ])
  })

  it('presupuesto con avisos al 80 % y al 100 %', () => {
    const b = (amount: number) => budgetStatus({ id: 'b', categoryId: 'cat-alimentacion', amount }, txs, oct, categories)
    expect(b(20000)).toMatchObject({ spent: 14000, level: 'ok' })
    expect(b(17000).level).toBe('aviso')
    expect(b(14000).level).toBe('superado')
    expect(b(10000)).toMatchObject({ level: 'superado', remaining: -4000 })
  })
})

describe('inversiones y patrimonio', () => {
  const bank = account({ id: 'a1', initialBalance: 100000 })
  const tr = account({ id: 'tr', name: 'Trade Republic', type: 'inversion', initialBalance: 450000 })
  const snaps: Snapshot[] = [
    { id: 's1', accountId: 'tr', date: '2026-09-30', positions: [], cash: 0, total: 470000, source: 'manual', fingerprint: 'a', createdAt: 1 },
    {
      id: 's2', accountId: 'tr', date: '2026-10-31', cash: 31245, total: 582977, source: 'pdf', fingerprint: 'b', createdAt: 2,
      positions: [
        { name: 'ETF', kind: 'etf', units: 1, price: 1, value: 420956 },
        { name: 'BTC', kind: 'cripto', units: 1, price: 1, value: 130776 },
      ],
    },
  ]

  it('total aportado = saldo inicial + aportaciones detectadas', () => {
    expect(totalContributed(tr, txs)).toBe(460000)
    expect(totalContributed(tr, txs, '2026-10-01')).toBe(450000)
  })

  it('valor, ganancia en euros y en % y reparto', () => {
    const p = portfolioSummary(tr, snaps, txs)
    expect(p).toMatchObject({ value: 582977, contributed: 460000, gain: 122977, date: '2026-10-31' })
    expect(p.gainRatio).toBeCloseTo(0.26734, 4)
    expect(p.allocation.map((a) => a.kind)).toEqual(['etf', 'cripto', 'efectivo'])
    expect(p.allocation.reduce((s, a) => s + a.ratio, 0)).toBeCloseTo(1)
  })

  it('con la cuenta de efectivo del bróker: no cuenta el efectivo dos veces y aporta solo lo comprado', () => {
    const trCash = account({ id: 'trc', name: 'TR cuenta corriente' })
    const trInv = account({ id: 'tr', type: 'inversion', initialBalance: 0, cashAccountId: 'trc' })
    const moves = [
      tx({ accountId: 'a1', date: '2026-10-01', amount: -10000, description: 'TRANSFERENCIA A TRADE REPUBLIC', kind: 'aportacion' }),
      tx({ accountId: 'trc', date: '2026-10-01', amount: 10000, description: 'Top up', kind: 'transferencia' }),
      tx({ accountId: 'trc', date: '2026-10-02', amount: -6000, description: 'Buy trade IE00B4L5Y983', kind: 'aportacion' }),
      tx({ accountId: 'trc', date: '2026-10-20', amount: 1000, description: 'Sell trade IE00B4L5Y983', kind: 'aportacion' }),
    ]
    const snap: Snapshot = { id: 's', accountId: 'tr', date: '2026-10-31', positions: [{ name: 'ETF', kind: 'etf', units: 1, price: 1, value: 5500 }], cash: 5000, total: 10500, source: 'pdf', fingerprint: 'x', createdAt: 1 }
    expect(totalContributed(trInv, moves)).toBe(5000)
    const p = portfolioSummary(trInv, [snap], moves)
    expect(p).toMatchObject({ value: 5500, contributed: 5000, gain: 500 })
    expect(p.allocation.map((a) => a.kind)).toEqual(['etf'])
    const nw = netWorth([bank, trCash, trInv], moves, [snap])
    // banco 1000 − 100 + efectivo TR (100 − 60 + 10 = 50) + posiciones 55
    expect(nw).toEqual({ cash: 100000 - 10000 + 5000, investments: 5500, total: 100000 - 10000 + 5000 + 5500 })
  })

  it('sin fotos, el valor es lo aportado y no hay reparto', () => {
    const p = portfolioSummary(tr, [], [])
    expect(p).toMatchObject({ value: 450000, contributed: 450000, gain: 0, gainRatio: 0, allocation: [] })
  })

  it('evolución del valor frente a lo aportado', () => {
    expect(portfolioEvolution(tr, snaps, txs)).toEqual([
      { date: '2026-09-30', value: 470000, contributed: 450000 },
      { date: '2026-10-31', value: 582977, contributed: 460000 },
    ])
  })

  it('patrimonio total = cuentas + inversiones', () => {
    const nw = netWorth([bank, tr], txs.filter((t) => t.accountId === 'a1'), snaps)
    const cash = accountBalance(bank, txs)
    expect(nw).toEqual({ cash, investments: 582977, total: cash + 582977 })
    expect(netWorth([bank, tr], txs, snaps, '2026-09-30').investments).toBe(470000)
    expect(netWorth([], [], [])).toEqual({ cash: 0, investments: 0, total: 0 })
  })
})

import { transactionsToCSV } from './csvExport'
import { parseCSV } from '../import/csv'

describe('exportar a CSV', () => {
  it('una línea por movimiento (o por parte si está dividido), con coma decimal', () => {
    const csv = transactionsToCSV(txs, [account({ id: 'a1', name: 'Banco' })], categories)
    const rows = parseCSV(csv.slice(1))
    expect(rows[0][0]).toBe('Fecha')
    expect(rows).toHaveLength(1 + txs.length + 1) // la dividida ocupa dos líneas
    expect(rows[2]).toEqual(['02/10/2026', 'Banco', 'ALQUILER', '-800,00', 'Hogar › Alquiler o hipoteca', 'Gasto', 'Confirmado', '', '', ''])
  })
})
