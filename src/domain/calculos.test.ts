import { describe, expect, it } from 'vitest'
import { comparableRange, expensesByCategory, monthlySeries, summarize } from './stats'
import { categorize, signedCategory } from './categorize'
import { defaultCategories, defaultRules } from './defaults'
import { detectBank, quickAccountsFor } from './banks'
import { bankClosingBalance, type ParsedMovement } from '../import/detect'
import { formatRate } from '../lib/money'
import { accentVars, mix } from '../ui/theme'
import { tx } from '../test/helpers'

const cats = defaultCategories()
const byId = new Map(cats.map((c) => [c.id, c]))
const oct = { start: '2026-10-01', end: '2026-10-31' }

describe('cálculos de ingresos y gastos', () => {
  it('una devolución resta del gasto en vez de sumar como ingreso', () => {
    const txs = [
      tx({ date: '2026-10-02', amount: -2000, categoryId: 'cat-taxi' }),
      tx({ date: '2026-10-03', amount: 500, categoryId: 'cat-taxi' }), // devolución de Uber
      tx({ date: '2026-10-05', amount: 100000, categoryId: 'cat-sueldo' }),
      tx({ date: '2026-10-06', amount: 3000, categoryId: 'cat-bizum-recibido' }),
      tx({ date: '2026-10-07', amount: 2500 }), // ingreso sin categoría
    ]
    const s = summarize(txs, oct, byId)
    expect(s).toMatchObject({ income: 105500, expenses: 1500, balance: 104000 })
    // Sin mapa de categorías se mantiene el comportamiento simple
    expect(summarize(txs, oct).income).toBe(106000)
    const cat = expensesByCategory(txs, oct, cats)
    expect(cat).toEqual([{ categoryId: 'cat-transporte', amount: 1500, count: 1, children: [{ categoryId: 'cat-taxi', amount: 1500, count: 1 }] }])
  })

  it('una categoría que solo tiene devoluciones no aparece en el reparto', () => {
    expect(expensesByCategory([tx({ date: '2026-10-03', amount: 500, categoryId: 'cat-taxi' })], oct, cats)).toEqual([])
  })

  it('el periodo en curso se compara con los mismos días del anterior', () => {
    expect(comparableRange(oct, { start: '2026-09-01', end: '2026-09-30' }, '2026-10-04')).toEqual({ start: '2026-09-01', end: '2026-09-04', partial: true })
    // Mes de 31 días frente a uno de 30: no se pasa del final
    expect(comparableRange(oct, { start: '2026-09-01', end: '2026-09-30' }, '2026-10-30')).toEqual({ start: '2026-09-01', end: '2026-09-30', partial: true })
    // Periodo ya terminado: el anterior completo
    expect(comparableRange(oct, { start: '2026-09-01', end: '2026-09-30' }, '2026-11-04')).toEqual({ start: '2026-09-01', end: '2026-09-30', partial: false })
  })

  it('las series mensuales usan las mismas reglas que el resumen', () => {
    const txs = [tx({ date: '2026-10-02', amount: -2000, categoryId: 'cat-taxi' }), tx({ date: '2026-10-03', amount: 500, categoryId: 'cat-taxi' })]
    const m = monthlySeries(txs, 1, 1, '2026-10-15', byId)
    expect(m[0]).toMatchObject({ income: 0, expenses: 1500 })
  })

  it('tasa de ahorro legible', () => {
    expect(formatRate(0.25)).toMatch(/^25\s%$/)
    expect(formatRate(-0.4)).toMatch(/^−40\s%$/)
    expect(formatRate(-7.6)).toBe('< −100 %')
    expect(formatRate(null)).toBe('—')
  })
})

describe('reglas según el signo', () => {
  const rules = defaultRules(0)
  it('Bizum enviado y recibido son categorías distintas', () => {
    expect(categorize('BIZUM ENVIADO', -1000, rules)).toMatchObject({ categoryId: 'cat-bizum', kind: 'gasto' })
    expect(categorize('BIZUM RECIBIDO', 1000, rules)).toMatchObject({ categoryId: 'cat-bizum-recibido', kind: 'ingreso' })
    expect(categorize('Bizum de Luis', 1000, rules).categoryId).toBe('cat-bizum-recibido')
    expect(signedCategory('cat-supermercado', 100)).toBe('cat-supermercado')
  })

  it('transferencias: recibidas, enviadas y aportación a Trade Republic', () => {
    expect(categorize('TRANSF. A SU FAVOR', 30000, rules)).toMatchObject({ categoryId: 'cat-transf-recibidas', kind: 'ingreso' })
    expect(categorize('TRASPASO', 50000, rules)).toMatchObject({ categoryId: 'cat-transf-recibidas', kind: 'ingreso' })
    expect(categorize('TRASPASO', -50000, rules)).toMatchObject({ categoryId: 'cat-transf-enviadas', kind: 'gasto' })
    expect(categorize('Transferencia a LUIS EJEMPLO', -2000, rules)).toMatchObject({ categoryId: 'cat-transf-enviadas', kind: 'gasto' })
    expect(categorize('TRANSFERENCIA A TRADE REPUBLIC BANK GMBH', -20000, rules)).toMatchObject({ kind: 'aportacion' })
    expect(categorize('TRASPASO PROPIO', -5000, rules).kind).toBe('transferencia')
  })
})

describe('saldo del banco', () => {
  const mv = (date: string, amount: number, balance?: number): ParsedMovement => ({ date, amount, description: 'x', rowIndex: 0, ...(balance !== undefined ? { balance } : {}) })
  it('usa el saldo del movimiento más reciente según el orden del archivo', () => {
    // Del más nuevo al más viejo (CaixaBank): el primero de ese día
    expect(bankClosingBalance([mv('2026-11-04', -1080, 13711), mv('2026-11-04', -150, 14791), mv('2026-11-01', -1200, 14941)])).toEqual({ date: '2026-11-04', balance: 13711 })
    // Del más viejo al más nuevo (Revolut): el último de ese día
    expect(bankClosingBalance([mv('2026-10-01', 2000, 2000), mv('2026-10-03', -500, 1500), mv('2026-10-03', 100, 1600)])).toEqual({ date: '2026-10-03', balance: 1600 })
    expect(bankClosingBalance([mv('2026-10-01', 2000), mv('2026-10-03', -500)])).toBeNull()
  })
})

describe('bancos', () => {
  it('detecta el banco por el IBAN o por el nombre', () => {
    expect(detectBank('IBAN: ES00 2100 0000 0000 0000 0000')?.id).toBe('caixabank')
    expect(detectBank('ES0015830000000000000000')?.id).toBe('revolut')
    expect(detectBank('ES00 1586 0000 0000 0000 0000')?.id).toBe('traderepublic')
    expect(detectBank('Extracto de Revolut Bank UAB')?.id).toBe('revolut')
    expect(detectBank('Nada que ver')).toBeNull()
    // imagin comparte código de entidad con CaixaBank: se reconoce por su nombre en la cabecera
    expect(detectBank('imagin · IBAN ES00 2100 0000 0000 0000 0000', 'imagin extracto de movimientos')?.id).toBe('imagin')
    expect(detectBank('IBAN ES00 2100 0000 0000 0000 0000', 'CaixaBank movimientos')?.id).toBe('caixabank')
    // El nombre de otro banco en un concepto no cuenta
    expect(detectBank('Movimientos TRANSFERENCIA A TRADE REPUBLIC BANK', 'Movimientos de cuenta')).toBeNull()
  })
  it('Trade Republic crea efectivo + inversión enlazadas', () => {
    const q = quickAccountsFor('traderepublic')
    expect(q.map((a) => a.type)).toEqual(['banco', 'inversion'])
    expect(q[1].cashAccount).toBe(q[0].name)
  })
})

describe('colores de la app', () => {
  it('mezcla colores y genera variables para claro y oscuro', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(accentVars('#1d5fd6', false)['--accent']).toBe('#1d5fd6')
    expect(accentVars('#1d5fd6', true)['--accent']).not.toBe('#1d5fd6')
  })
})

import { accountBalance, bankOrder } from './stats'
import { account } from '../test/helpers'

describe('saldo con el orden del banco', () => {
  it('fecha efectiva: una transferencia con fecha valor posterior no adelanta el saldo', () => {
    // Archivo del más nuevo al más viejo, como CaixaBank
    const dates = ['2026-11-01', '2026-10-31', '2026-11-02', '2026-10-30']
    expect(bankOrder(dates)).toEqual([
      { seq: 3, effDate: '2026-11-01' },
      { seq: 2, effDate: '2026-10-31' },
      { seq: 1, effDate: '2026-10-31' },
      { seq: 0, effDate: '2026-10-30' },
    ])
  })

  it('usa el saldo del banco y suma lo añadido después a mano', () => {
    const acc = account({ id: 'c', initialBalance: 0 })
    const o = bankOrder(['2026-11-01', '2026-10-31', '2026-11-02', '2026-10-30'])
    const rows = [
      { date: '2026-11-01', amount: -1200, bal: 14941 },
      { date: '2026-10-31', amount: -24300, bal: 16141 },
      { date: '2026-11-02', amount: 31000, bal: 40441 },
      { date: '2026-10-30', amount: -1800, bal: 9441 },
    ].map((r, i) => tx({ accountId: 'c', date: r.date, amount: r.amount, bankBalance: r.bal, bankEffDate: o[i].effDate, bankSeq: o[i].seq }))
    const manual = tx({ accountId: 'c', date: '2026-11-03', amount: -500, source: 'atajo', status: 'pendiente' })
    const all = [...rows, manual]
    expect(accountBalance(acc, all, '2026-10-30')).toBe(9441)
    expect(accountBalance(acc, all, '2026-10-31')).toBe(16141) // incluye la transferencia de "02/11"
    expect(accountBalance(acc, all, '2026-11-02')).toBe(14941)
    expect(accountBalance(acc, all)).toBe(14441) // + pago pendiente del Atajo
  })
})

import { goalProgress } from './goals'

describe('objetivos de ahorro', () => {
  const goal = { id: 'g', name: 'Viaje', target: 120000, saved: 30000, color: '#000', createdAt: 0 }
  it('progreso a mano y cuota mensual hasta la fecha', () => {
    const p = goalProgress({ ...goal, deadline: '2027-05-04' }, [], [], [], '2026-11-04')
    expect(p).toMatchObject({ saved: 30000, remaining: 90000, monthsLeft: 6, monthly: 15000, done: false })
    expect(p.ratio).toBeCloseTo(0.25)
  })
  it('enlazado a una cuenta usa su saldo', () => {
    const acc = account({ id: 'ah', initialBalance: 150000 })
    expect(goalProgress({ ...goal, accountId: 'ah' }, [acc], [], [], '2026-11-04')).toMatchObject({ saved: 150000, remaining: 0, done: true, ratio: 1 })
  })
})

describe('cuenta remunerada', () => {
  it('los intereses son ingreso aunque mencionen la cuenta remunerada', () => {
    const rules = defaultRules(0)
    expect(categorize('Interés neto pagado a Cuenta Remunerada del 1 mar 2026', 1, rules)).toMatchObject({ kind: 'ingreso', categoryId: 'cat-intereses' })
    expect(categorize('To Cuenta Remunerada', -2000, rules).kind).toBe('transferencia')
  })
})

import { groupByBank, lastStatementDate } from './stats'

describe('cuentas agrupadas por banco', () => {
  it('agrupa las cuentas del mismo banco y da la fecha del extracto', () => {
    const a = [account({ id: 'r', bank: 'revolut' }), account({ id: 'c', bank: 'caixabank' }), account({ id: 'rr', bank: 'revolut' }), account({ id: 'e' })]
    expect(groupByBank(a).map((g) => [g.bank, g.accounts.map((x) => x.id)])).toEqual([
      ['revolut', ['r', 'rr']],
      ['caixabank', ['c']],
      [null, ['e']],
    ])
    const txs = [tx({ accountId: 'rr', date: '2026-11-04', amount: 1, source: 'extracto' }), tx({ accountId: 'rr', date: '2026-11-10', amount: 1, source: 'manual' })]
    expect(lastStatementDate(a[2], txs)).toBe('2026-11-04')
    expect(lastStatementDate(a[1], txs)).toBeNull()
  })
})
