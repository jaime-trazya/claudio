import { describe, expect, it } from 'vitest'
import { checkPin, fromB64url, newPin, toB64url } from './lock'
import { cumulativeExpenses, monthProjection } from '../domain/stats'
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
  it('la previsión no multiplica el alquiler ni los gastos grandes, y suma los recibos que faltan', () => {
    const nov = { start: '2026-11-01', end: '2026-11-30' }
    const txs = [tx({ date: '2026-11-01', amount: -90000, description: 'ALQUILER PISO' })]
    for (let d = 1; d <= 5; d++) txs.push(tx({ date: `2026-11-0${d}`, amount: -2000, description: 'Café' }))
    const rent = { key: 'alquiler piso', nextDate: '2026-12-01', monthly: 90000 }
    const gym = { key: 'gimnasio', nextDate: '2026-11-15', monthly: 3000 }
    // 900 de alquiler + 100 de día a día en 5 días → 900 + 20 × 30 + 30 del gimnasio que aún no ha llegado
    expect(monthProjection(txs, nov, '2026-11-05', [rent, gym])).toBe(90000 + 60000 + 3000)
    expect(monthProjection(txs, nov, '2026-11-02', [rent])).toBeNull()
  })
  it('acumula día a día y se para en hoy', () => {
    const txs = [tx({ date: '2026-11-01', amount: -1000 }), tx({ date: '2026-11-03', amount: -500 }), tx({ date: '2026-11-03', amount: 9000 })]
    expect(cumulativeExpenses(txs, { start: '2026-11-01', end: '2026-11-30' }, undefined, '2026-11-04')).toEqual([1000, 1000, 1500, 1500])
  })
})

describe('intentos fallidos del código', () => {
  it('a partir del quinto hay que esperar cada vez más, hasta 15 minutos', async () => {
    const { lockoutDelay } = await import('./lock')
    expect(lockoutDelay(4)).toBe(0)
    expect(lockoutDelay(5)).toBe(30_000)
    expect(lockoutDelay(6)).toBe(60_000)
    expect(lockoutDelay(20)).toBe(15 * 60_000)
  })
})
