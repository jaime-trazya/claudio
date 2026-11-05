// Regresiones de la segunda revisión: lectura de extractos y cálculos (uno por bloque)
import { describe, expect, it } from 'vitest'
import { parseAmount } from '../lib/money'
import { parseDate } from '../lib/dates'
import { applyMapping, detectColumns } from '../import/detect'
import { pdfToTables } from '../import/pdfTable'
import type { PdfLine } from '../import/pdfText'
import { expensesByCategory, summarize } from './stats'
import { detectRecurring } from './recurring'
import { goalProgress } from './goals'
import type { Category } from '../db/types'
import { account, tx } from '../test/helpers'

const cat = (id: string, kind: 'gasto' | 'ingreso' = 'gasto', parentId: string | null = null): Category => ({ id, name: id, parentId, icon: 'x', color: '#000', kind, order: 0 })

describe('importes con el signo al final', () => {
  it('lee «12,50- €» y el menos tipográfico final', () => {
    expect(parseAmount('12,50- €')).toBe(-1250)
    expect(parseAmount('12,50−')).toBe(-1250)
    expect(parseAmount('1.234,56-')).toBe(-123456)
    expect(parseAmount('12,50 €')).toBe(1250)
  })
})

describe('fechas', () => {
  it('«70» es 1970 y un texto de cinco cifras no es una fecha', () => {
    expect(parseDate('01/01/70')).toBe('1970-01-01')
    expect(parseDate('01/01/26')).toBe('2026-01-01')
    expect(parseDate('45000')).toBeNull()
  })
  it('entiende la hora en formato de 12 horas del Atajo', () => {
    expect(parseDate('3 oct 2026, 1:45 PM')).toBe('2026-10-03')
    expect(parseDate('3 oct 2026, 1:45 p. m.')).toBe('2026-10-03')
  })
})

describe('columnas del extracto', () => {
  it('«Fecha valor» no se toma como importe cuando hay Cargo y Abono', () => {
    const rows = [
      ['Fecha operación', 'Fecha valor', 'Concepto', 'Cargo', 'Abono', 'Saldo'],
      ['01/10/2026', '02/10/2026', 'LIDL', '12,50', '', '987,50'],
      ['03/10/2026', '03/10/2026', 'NÓMINA', '', '1.500,00', '2.487,50'],
    ]
    const det = detectColumns(rows)!
    expect(det.mapping).toMatchObject({ dateCol: 0, amountCol: null, debitCol: 3, creditCol: 4 })
    expect(applyMapping(rows, det.mapping).map((m) => m.amount)).toEqual([-1250, 150000])
  })
  it('sin cabecera, el saldo no se toma como importe aunque vaya antes', () => {
    const rows = [
      ['03/10/2026', '100,00', 'LIDL', '-12,50'],
      ['04/10/2026', '80,00', 'BAR', '-20,00'],
      ['05/10/2026', '1.580,00', 'NÓMINA', '1.500,00'],
      ['06/10/2026', '1.575,00', 'CAFÉ', '-5,00'],
    ]
    const det = detectColumns(rows)!
    expect(det.mapping).toMatchObject({ amountCol: 3, balanceCol: 1 })
  })
})

describe('PDF: importe ancho alineado a la derecha', () => {
  it('cae en su columna y no en la de al lado', () => {
    const it_ = (str: string, x: number, w: number, y: number) => ({ str, x, y, w, page: 1 })
    const head = [it_('Fecha', 40, 30, 700), it_('Concepto', 120, 50, 700), it_('Importe', 480, 40, 700), it_('Saldo', 560, 28, 700)]
    const row = [it_('01/10/2026', 40, 50, 680), it_('LIDL', 120, 25, 680), it_('-1.234,56', 462, 50, 680), it_('12.345,67', 540, 48, 680)]
    const lines: PdfLine[] = [head, row].map((items) => ({ page: 1, y: items[0].y, items, text: items.map((i) => i.str).join(' ') }))
    const [table] = pdfToTables(lines)
    expect(table.rows[1]).toEqual(['01/10/2026', 'LIDL', '-1.234,56', '12.345,67'])
  })
})

describe('devoluciones', () => {
  const cats = [cat('ocio'), cat('compras'), cat('cine', 'gasto', 'ocio'), cat('nomina', 'ingreso')]
  const byId = new Map(cats.map((c) => [c.id, c]))
  const range = { start: '2026-10-01', end: '2026-10-31' }
  it('el total de gastos coincide con el gráfico por categorías', () => {
    const txs = [tx({ date: '2026-10-02', amount: -5000, categoryId: 'ocio' }), tx({ date: '2026-10-03', amount: 3000, categoryId: 'compras' }), tx({ date: '2026-10-04', amount: 800, categoryId: 'cine' })]
    const s = summarize(txs, range, byId)
    const donut = expensesByCategory(txs, range, cats)
    expect(s.expenses).toBe(donut.reduce((x, c) => x + c.amount, 0))
    expect(donut.flatMap((c) => c.children).every((c) => c.amount > 0)).toBe(true)
  })
  it('los gastos nunca salen negativos y la tasa de ahorro no pasa del 100 %', () => {
    const txs = [tx({ date: '2026-10-01', amount: 10000, categoryId: 'nomina' }), tx({ date: '2026-10-02', amount: -1000, categoryId: 'ocio' }), tx({ date: '2026-10-03', amount: 5000, categoryId: 'compras' })]
    const s = summarize(txs, range, byId)
    expect(s.expenses).toBe(1000)
    expect(s.balance).toBe(14000)
    expect(s.savingsRate!).toBeLessThanOrEqual(1)
  })
})

describe('suscripciones', () => {
  const charge = (date: string, amount: number) => tx({ date, amount, description: 'NETFLIX.COM', categoryId: 'ocio' })
  it('no desaparece cuando sube el precio', () => {
    const list = [charge('2026-06-05', -799), charge('2026-07-05', -799), charge('2026-08-05', -799), charge('2026-09-05', -1299), charge('2026-10-05', -1299)]
    const [r] = detectRecurring(list, '2026-10-20')
    expect(r?.monthly).toBe(1299)
  })
  it('un mes sin cargo no la anula', () => {
    const list = [charge('2026-05-05', -999), charge('2026-06-05', -999), charge('2026-07-05', -999), charge('2026-09-05', -999), charge('2026-10-05', -999)]
    expect(detectRecurring(list, '2026-10-20')).toHaveLength(1)
  })
  it('el próximo cargo de fin de mes cae en el mismo día del mes siguiente', () => {
    const list = [charge('2026-07-31', -500), charge('2026-08-31', -500), charge('2026-09-30', -500), charge('2026-10-31', -500)]
    expect(detectRecurring(list, '2026-11-01')[0].nextDate).toBe('2026-11-30')
  })
})

describe('objetivos ligados a una inversión', () => {
  it('solo cuentan las aportaciones a su cuenta', () => {
    const accs = [account({ id: 'banco' }), account({ id: 'tr', name: 'Trade Republic', type: 'inversion', bank: 'traderepublic' }), account({ id: 'mi', name: 'MyInvestor', type: 'inversion', bank: 'myinvestor' })]
    const txs = [
      tx({ accountId: 'banco', date: '2026-10-01', amount: -10000, description: 'Transferencia a MyInvestor', kind: 'aportacion' }),
      tx({ accountId: 'banco', date: '2026-10-02', amount: -20000, description: 'Trade Republic', kind: 'aportacion' }),
    ]
    const goal = { id: 'g', name: 'x', target: 1000000, accountId: 'tr', saved: 0, color: '#000', createdAt: 1 }
    expect(goalProgress(goal, accs, txs, []).saved).toBe(20000)
  })
})
