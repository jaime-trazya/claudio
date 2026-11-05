import { describe, expect, it } from 'vitest'
import { checkPin, fromB64url, newPin, toB64url } from './lock'
import { cumulativeExpenses, projectedExpenses } from '../domain/stats'
import { tx } from '../test/helpers'

describe('código de respaldo del bloqueo', () => {
  it('acepta el código correcto y rechaza el resto', async () => {
    const { pinSalt, pinHash } = await newPin('2468')
    expect(pinHash).not.toContain('2468')
    expect(await checkPin('2468', pinSalt, pinHash)).toBe(true)
    expect(await checkPin('2469', pinSalt, pinHash)).toBe(false)
    expect(await checkPin('12', pinSalt, pinHash)).toBe(false)
    expect(await checkPin('2468', '', '')).toBe(false)
  })
  it('dos códigos iguales dan huellas distintas (sal aleatoria)', async () => {
    expect((await newPin('1234')).pinHash).not.toBe((await newPin('1234')).pinHash)
  })
  it('base64url ida y vuelta', () => {
    const b = new Uint8Array([0, 255, 62, 63, 1, 2, 3])
    expect([...fromB64url(toB64url(b))]).toEqual([...b])
  })
})

describe('Inicio: previsión y gasto acumulado', () => {
  it('no da previsión los primeros días ni sin gasto', () => {
    expect(projectedExpenses(80000, 2, 30)).toBeNull()
    expect(projectedExpenses(0, 10, 30)).toBeNull()
    expect(projectedExpenses(30000, 10, 30)).toBe(90000)
  })
  it('acumula día a día y se para en hoy', () => {
    const txs = [tx({ date: '2026-11-01', amount: -1000 }), tx({ date: '2026-11-03', amount: -500 }), tx({ date: '2026-11-03', amount: 9000 })]
    expect(cumulativeExpenses(txs, { start: '2026-11-01', end: '2026-11-30' }, undefined, '2026-11-04')).toEqual([1000, 1000, 1500, 1500])
  })
})
