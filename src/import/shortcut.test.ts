import { describe, expect, it } from 'vitest'
import { accountForCard, newPayments, parseShortcutFile } from './shortcut'
import { account, sample } from '../test/helpers'

describe('archivo del Atajo de Apple Pay', () => {
  it('lee el archivo de ejemplo', () => {
    const { payments, errors } = parseShortcutFile(sample('atajo-pagos-apple-pay.csv'))
    expect(errors).toEqual([])
    expect(payments).toHaveLength(6)
    expect(payments[0]).toMatchObject({ date: '2026-10-03', merchant: 'Mercadona', amount: -2345, card: 'Visa Débito' })
    expect(payments[3].amount).toBe(-4520) // "€45.20"
    expect(payments[4].amount).toBe(-3995) // "39,95 €"
  })

  it('genera claves estables y distintas para pagos idénticos', () => {
    const text = 'fecha;comercio;importe;tarjeta\n2026-10-01 10:00;Bar;2,00;Visa\n2026-10-01 10:00;Bar;2,00;Visa\n'
    const a = parseShortcutFile(text).payments
    const b = parseShortcutFile(text).payments
    expect(a.map((p) => p.externalId)).toEqual(b.map((p) => p.externalId))
    expect(new Set(a.map((p) => p.externalId)).size).toBe(2)
  })

  it('no vuelve a importar los pagos que ya estaban', () => {
    const first = parseShortcutFile('2026-10-01 10:00;Bar;2,00;Visa\n').payments
    const second = parseShortcutFile('2026-10-01 10:00;Bar;2,00;Visa\n2026-10-02 11:00;Lidl;12,30;Visa\n').payments
    const fresh = newPayments(second, new Set(first.map((p) => p.externalId)))
    expect(fresh).toHaveLength(1)
    expect(fresh[0].merchant).toBe('Lidl')
  })

  it('acepta otros formatos de fecha y separador tabulador', () => {
    const { payments } = parseShortcutFile('3 oct 2026, 13:45\tMercadona\t23,45\tVisa\n04/10/2026 9:05\tLidl\t1,20\tVisa\n')
    expect(payments.map((p) => p.date)).toEqual(['2026-10-03', '2026-10-04'])
  })

  it('informa de las líneas que no entiende', () => {
    const { payments, errors } = parseShortcutFile('fecha;comercio;importe;tarjeta\nayer;Bar;dos euros;Visa\n')
    expect(payments).toHaveLength(0)
    expect(errors).toHaveLength(1)
  })

  it('asocia la tarjeta a su cuenta', () => {
    const accounts = [account({ id: 'b', type: 'banco' }), account({ id: 't', type: 'tarjeta', cardAlias: 'Visa Débito' })]
    expect(accountForCard('visa debito', accounts, null)).toBe('t')
    expect(accountForCard('Otra', accounts, 'b')).toBe('b')
  })
})
