import { describe, expect, it } from 'vitest'
import { formatMoney, parseAmount, parseDecimal } from './money'
import { accountingMonth, monthRange, parseDate } from './dates'

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 123456],
    ['-1.234,56', -123456],
    ['-23,45 €', -2345],
    ['23,45-', -2345],
    ['(12,50)', -1250],
    ['+3,00', 300],
    ['€12.34', 1234],
    ['1,234.56', 123456],
    ['1234.5', 123450],
    ['1.234', 123400],
    ['12.345.678', 1234567800],
    ['0,99', 99],
    ['2.150,00 EUR', 215000],
    [' 1 234,56 ', 123456],
    [-15.62, -1562],
  ])('%s → %i', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each(['', 'abc', '12/10/2026', null, undefined])('rechaza %s', (input) => {
    expect(parseAmount(input)).toBeNull()
  })

  it('lee decimales largos sin redondear', () => {
    expect(parseDecimal('25,123456')).toBeCloseTo(25.123456)
    expect(parseDecimal('58.432,10')).toBeCloseTo(58432.1)
  })

  it('formatea en euros con signo tipográfico', () => {
    expect(formatMoney(-123456)).toMatch(/−1\.234,56\s€/)
    expect(formatMoney(2500, { sign: true })).toMatch(/^\+25,00\s€$/)
  })
})

describe('parseDate', () => {
  it.each([
    ['03/10/2026', '2026-10-03'],
    ['3/1/26', '2026-01-03'],
    ['03-10-2026', '2026-10-03'],
    ['31.10.2026', '2026-10-31'],
    ['2026-10-03', '2026-10-03'],
    ['2026-10-03 19:12', '2026-10-03'],
    ['03/10/2026 08:41', '2026-10-03'],
    ['3 oct 2026, 13:45', '2026-10-03'],
    ['3 de octubre de 2026', '2026-10-03'],
  ])('%s → %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected)
  })

  it('acepta fechas de Excel', () => {
    expect(parseDate(46296)).toBe('2026-10-01')
    expect(parseDate(new Date(2026, 9, 3))).toBe('2026-10-03')
  })

  it('rechaza fechas imposibles', () => {
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('Concepto')).toBeNull()
  })
})

describe('mes contable', () => {
  it('con primer día 1 es el mes natural', () => {
    expect(monthRange(2026, 1)).toMatchObject({ start: '2026-02-01', end: '2026-02-28' })
  })
  it('con primer día 25 va del 25 al 24', () => {
    expect(accountingMonth('2026-10-26', 25)).toMatchObject({ key: '2026-11', start: '2026-10-25', end: '2026-11-24' })
    expect(accountingMonth('2026-10-10', 25)).toMatchObject({ key: '2026-10', start: '2026-09-25', end: '2026-10-24' })
  })
})
