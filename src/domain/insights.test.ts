import { describe, expect, it } from 'vitest'
import { chargesCalendar, parseSearch, savingsSuggestion, unusualSpending } from './insights'
import type { Category } from '../db/types'
import { tx } from '../test/helpers'

const cats: Category[] = [
  { id: 'rest', name: 'Restaurantes', parentId: null, icon: 'x', color: '#000', kind: 'gasto', order: 0 },
  { id: 'super', name: 'Supermercado', parentId: null, icon: 'x', color: '#000', kind: 'gasto', order: 1 },
  { id: 'nomina', name: 'Nómina', parentId: null, icon: 'x', color: '#000', kind: 'ingreso', order: 2 },
]

describe('gasto raro', () => {
  it('avisa de una categoría que va al doble de lo normal a estas alturas', () => {
    const txs = [
      ...['2026-08-05', '2026-09-05', '2026-10-05'].map((d) => tx({ date: d, amount: -4000, categoryId: 'rest' })),
      tx({ date: '2026-11-03', amount: -6000, categoryId: 'rest' }),
      tx({ date: '2026-11-08', amount: -4000, categoryId: 'rest' }),
      ...['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'].map((d) => tx({ date: d, amount: -20000, categoryId: 'super' })),
    ]
    const r = unusualSpending(txs, '2026-11-10', 1, cats)
    expect(r.map((x) => x.categoryId)).toEqual(['rest'])
    expect(r[0]).toMatchObject({ current: 10000, usual: 4000 })
  })
  it('no avisa los primeros días ni sin historial', () => {
    expect(unusualSpending([tx({ date: '2026-11-02', amount: -9000, categoryId: 'rest' })], '2026-11-03', 1, cats)).toEqual([])
    expect(unusualSpending([tx({ date: '2026-11-08', amount: -9000, categoryId: 'rest' })], '2026-11-10', 1, cats)).toEqual([])
  })
})

describe('ahorro sugerido', () => {
  it('la mediana de lo que sobra, redondeada a 10 €', () => {
    const txs = ['2026-08', '2026-09', '2026-10'].flatMap((m, i) => [tx({ date: `${m}-01`, amount: 200000, categoryId: 'nomina' }), tx({ date: `${m}-10`, amount: -(150000 + i * 10000), categoryId: 'super' })])
    expect(savingsSuggestion(txs, '2026-11-05', 1, new Map(cats.map((c) => [c.id, c])))).toBe(40000)
  })
  it('sin datos o sin sobrante no sugiere nada', () => {
    expect(savingsSuggestion([], '2026-11-05', 1)).toBeNull()
  })
})

describe('calendario de recibos', () => {
  it('ordena los cargos y va restando del saldo', () => {
    const r = chargesCalendar(
      [
        { name: 'Luz', nextDate: '2026-11-20', monthly: 6000, categoryId: null },
        { name: 'Gimnasio', nextDate: '2026-11-10', monthly: 3000, categoryId: null },
        { name: 'Pasado', nextDate: '2026-11-01', monthly: 999, categoryId: null },
      ],
      '2026-11-05',
      '2026-11-30',
      100000,
    )
    expect(r.map((d) => [d.date, d.balance])).toEqual([
      ['2026-11-10', 97000],
      ['2026-11-20', 91000],
    ])
  })
})

describe('buscar con preguntas', () => {
  it('«¿cuánto gasté en Mercadona este año?»', () => {
    expect(parseSearch('¿Cuánto gasté en Mercadona este año?', '2026-11-05')).toEqual({ text: 'mercadona', range: { start: '2026-01-01', end: '2026-12-31' }, label: 'este año' })
  })
  it('meses por su nombre, del año pasado si aún no han llegado', () => {
    expect(parseSearch('restaurantes en octubre', '2026-11-05')).toMatchObject({ text: 'restaurantes', range: { start: '2026-10-01', end: '2026-10-31' } })
    expect(parseSearch('luz diciembre', '2026-11-05').range).toEqual({ start: '2025-12-01', end: '2025-12-31' })
    expect(parseSearch('uber el mes pasado', '2026-11-05')).toMatchObject({ text: 'uber', range: { start: '2026-10-01', end: '2026-10-31' } })
  })
  it('sin periodo, la búsqueda queda igual', () => {
    expect(parseSearch('Mercadona', '2026-11-05')).toEqual({ text: 'Mercadona', range: null, label: null })
  })
})
