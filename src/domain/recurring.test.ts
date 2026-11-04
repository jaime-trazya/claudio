import { describe, expect, it } from 'vitest'
import { detectRecurring, recurringTotals } from './recurring'
import { tx } from '../test/helpers'
import { readSheet } from '../import/readSheet'
import { applyMapping, detectColumns } from '../import/detect'
import { categorize } from './categorize'
import { defaultRules } from './defaults'
import { sample } from '../test/helpers'

describe('detección de recurrentes', () => {
  it('detecta una suscripción mensual con importe fijo', () => {
    const list = detectRecurring(
      [
        tx({ date: '2026-08-08', amount: -1399, description: 'NETFLIX.COM' }),
        tx({ date: '2026-09-08', amount: -1399, description: 'NETFLIX.COM' }),
        tx({ date: '2026-10-08', amount: -1399, description: 'NETFLIX.COM' }),
      ],
      '2026-10-20',
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Netflix', monthly: 1399, annual: 16788, nextDate: '2026-11-08' })
  })

  it('acepta recibos con importe variable (luz) si hay 3 cargos', () => {
    const list = detectRecurring(
      [
        tx({ date: '2026-08-05', amount: -5432, description: 'RECIBO IBERDROLA' }),
        tx({ date: '2026-09-05', amount: -6110, description: 'RECIBO IBERDROLA' }),
        tx({ date: '2026-10-05', amount: -5875, description: 'RECIBO IBERDROLA' }),
      ],
      '2026-10-20',
    )
    expect(list).toHaveLength(1)
    expect(list[0].changed).toBe(true)
  })

  it('no confunde compras frecuentes con recibos', () => {
    const weekly = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'].map((d) =>
      tx({ date: d, amount: -4000, description: 'MERCADONA' }),
    )
    expect(detectRecurring(weekly, '2026-10-10')).toHaveLength(0)
  })

  it('descarta los que ya no se cobran', () => {
    const old = ['2026-01-10', '2026-02-10', '2026-03-10'].map((d) => tx({ date: d, amount: -999, description: 'HBO' }))
    expect(detectRecurring(old, '2026-10-10')).toHaveLength(0)
  })

  it('ignora ingresos, transferencias y aportaciones', () => {
    const list = detectRecurring(
      ['2026-08-10', '2026-09-10', '2026-10-10'].map((d) => tx({ date: d, amount: -20000, description: 'TRADE REPUBLIC', kind: 'aportacion' })),
    )
    expect(list).toHaveLength(0)
  })

  it('con el extracto de ejemplo encuentra alquiler, gimnasio, luz, Netflix, Spotify y Vodafone', () => {
    const rows = readSheet(sample('extracto-banco-cuenta-nomina.csv'), 'x.csv')
    const rules = defaultRules(0)
    const txs = applyMapping(rows, detectColumns(rows)!.mapping).map((m) => {
      const c = categorize(m.description, m.amount, rules)
      return tx({ date: m.date, amount: m.amount, description: m.description, kind: c.kind, categoryId: c.categoryId })
    })
    const list = detectRecurring(txs, '2026-10-31')
    expect(list.map((r) => r.key).sort()).toEqual(['alquiler inmobiliaria inventada', 'gimnasio basic fit', 'iberdrola clientes', 'netflix', 'spotify', 'vodafone'].sort())
    const totals = recurringTotals(list)
    expect(totals.monthly).toBe(75000 + 2499 + 5875 + 1399 + 1199 + 3500)
    expect(totals.annual).toBe(totals.monthly * 12)
  })
})
