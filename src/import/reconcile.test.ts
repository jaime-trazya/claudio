import { describe, expect, it } from 'vitest'
import { dupKey, planImport, summarizePlan } from './reconcile'
import { applyMapping, detectColumns, type ParsedMovement } from './detect'
import { readSheet } from './readSheet'
import { parseShortcutFile } from './shortcut'
import { sample, tx } from '../test/helpers'
import type { Transaction } from '../db/types'

const mv = (date: string, amount: number, description: string, rowIndex = 0): ParsedMovement => ({ date, amount, description, rowIndex })

function asImported(rows: ReturnType<typeof planImport>, accountId: string): Transaction[] {
  return rows
    .filter((r) => r.include && r.status === 'nuevo')
    .map((r) => tx({ accountId, date: r.movement.date, amount: r.movement.amount, description: r.movement.description, source: 'extracto', dupKey: r.key }))
}

describe('detección de duplicados', () => {
  it('clave = cuenta + fecha + importe + concepto normalizado', () => {
    expect(dupKey('a1', '2026-10-01', -100, 'Recibo  LUZ')).toBe(dupKey('a1', '2026-10-01', -100, 'recibo luz'))
    expect(dupKey('a1', '2026-10-01', -100, 'x')).not.toBe(dupKey('a2', '2026-10-01', -100, 'x'))
  })

  it('marca como duplicados los ya importados y los excluye por defecto', () => {
    const existing = [tx({ accountId: 'a1', date: '2026-10-01', amount: -2000, description: 'RECIBO LUZ', source: 'extracto' })]
    const plan = planImport([mv('2026-10-01', -2000, 'Recibo luz'), mv('2026-10-02', -500, 'CAFE')], 'a1', existing)
    expect(plan[0]).toMatchObject({ status: 'duplicado', include: false })
    expect(plan[1]).toMatchObject({ status: 'nuevo', include: true })
  })

  it('respeta movimientos idénticos legítimos dentro del mismo archivo', () => {
    const existing = [tx({ accountId: 'a1', date: '2026-10-02', amount: -150, description: 'CAFE', source: 'extracto' })]
    const plan = planImport([mv('2026-10-02', -150, 'CAFE'), mv('2026-10-02', -150, 'CAFE')], 'a1', existing)
    expect(plan.map((p) => p.status)).toEqual(['duplicado', 'nuevo'])
  })

  it('lo de otras cuentas se avisa pero no cuenta como pendiente de conciliar', () => {
    const manualOther = [tx({ accountId: 'a2', date: '2026-10-01', amount: -2000, description: 'RECIBO LUZ', source: 'manual' })]
    expect(planImport([mv('2026-10-01', -2000, 'RECIBO LUZ')], 'a1', manualOther)[0].status).toBe('nuevo')
  })

  it('extractos solapados no generan duplicados', () => {
    const name1 = 'extracto-banco-cuenta-nomina.csv'
    const rows1 = readSheet(sample(name1), name1)
    const plan1 = planImport(applyMapping(rows1, detectColumns(rows1)!.mapping), 'a1', [])
    expect(summarizePlan(plan1).nuevos).toBe(39)
    const db = asImported(plan1, 'a1')

    const name2 = 'extracto-banco-cuenta-nomina-solapado.csv'
    const rows2 = readSheet(sample(name2), name2)
    const plan2 = planImport(applyMapping(rows2, detectColumns(rows2)!.mapping), 'a1', db)
    const s = summarizePlan(plan2)
    expect(s.duplicados).toBe(6) // 20/10 – 31/10 ya estaban
    expect(s.nuevos).toBe(3) // noviembre
  })
})

describe('conciliación con pagos pendientes', () => {
  it('empareja mismo importe con hasta 3 días de diferencia aunque el nombre no coincida', () => {
    const pending = tx({ id: 'p1', accountId: 'a1', date: '2026-10-03', amount: -2345, description: 'Mercadona', source: 'atajo', status: 'pendiente' })
    const plan = planImport([mv('2026-10-04', -2345, 'COMPRA TARJ. 4000XXXX0001 SUPERMERCADO M')], 'a1', [pending])
    expect(plan[0]).toMatchObject({ status: 'conciliar', matchId: 'p1', include: true })
  })

  it('no empareja si hay más de 3 días o distinto importe', () => {
    const pending = tx({ id: 'p1', accountId: 'a1', date: '2026-10-01', amount: -2345, source: 'atajo', status: 'pendiente' })
    expect(planImport([mv('2026-10-05', -2345, 'X')], 'a1', [pending])[0].status).toBe('nuevo')
    expect(planImport([mv('2026-10-02', -2346, 'X')], 'a1', [pending])[0].status).toBe('nuevo')
  })

  it('empareja también movimientos añadidos a mano', () => {
    const manual = tx({ id: 'm1', accountId: 'a1', date: '2026-10-10', amount: -1200, description: 'Cena', source: 'manual' })
    expect(planImport([mv('2026-10-11', -1200, 'RESTAURANTE')], 'a1', [manual])[0]).toMatchObject({ status: 'conciliar', matchId: 'm1' })
  })

  it('con varias coincidencias posibles deja la fila en duda con las opciones', () => {
    const a = tx({ id: 'c1', accountId: 'a1', date: '2026-10-07', amount: -450, description: 'Café Central', source: 'atajo', status: 'pendiente' })
    const b = tx({ id: 'c2', accountId: 'a1', date: '2026-10-08', amount: -450, description: 'Café Central', source: 'atajo', status: 'pendiente' })
    const plan = planImport([mv('2026-10-08', -450, 'CAFETERIA CENTRAL')], 'a1', [a, b])
    expect(plan[0].status).toBe('dudoso')
    expect(plan[0].options).toEqual(['c2', 'c1']) // la más cercana en fecha primero
    expect(plan[0].matchId).toBe('c2')
  })

  it('no reutiliza un pendiente ya emparejado', () => {
    const p = tx({ id: 'p1', accountId: 'a1', date: '2026-10-03', amount: -1000, source: 'atajo', status: 'pendiente' })
    const plan = planImport([mv('2026-10-03', -1000, 'A'), mv('2026-10-04', -1000, 'B')], 'a1', [p])
    const matched = plan.filter((r) => r.matchId === 'p1')
    expect(matched).toHaveLength(1)
  })

  it('un movimiento ya conciliado se reconoce como duplicado al reimportar', () => {
    const reconciled = tx({ accountId: 'a1', date: '2026-10-04', amount: -2345, description: 'Mercadona', bankDate: '2026-10-04', bankDescription: 'COMPRA MERCADONA', source: 'atajo' })
    const plan = planImport([mv('2026-10-04', -2345, 'COMPRA MERCADONA')], 'a1', [reconciled])
    expect(plan[0].status).toBe('duplicado')
  })

  it('flujo completo con los archivos de ejemplo: Atajo + extracto', () => {
    const { payments } = parseShortcutFile(sample('atajo-pagos-apple-pay.csv'))
    const pend = payments.map((p, i) =>
      tx({ id: `atajo${i}`, accountId: 'a1', date: p.date, amount: p.amount, description: p.merchant, source: 'atajo', status: 'pendiente', externalId: p.externalId }),
    )
    const name = 'extracto-banco-cuenta-nomina.csv'
    const rows = readSheet(sample(name), name)
    const plan = planImport(applyMapping(rows, detectColumns(rows)!.mapping), 'a1', pend)
    const byDesc = (s: string, date = '2026-10-01') => plan.find((r) => r.movement.description.includes(s) && r.movement.date >= date)!
    expect(byDesc('MERCADONA VALENCIA', '2026-10-04')).toBeDefined()
    expect(plan.find((r) => r.movement.date === '2026-10-04')).toMatchObject({ status: 'conciliar', matchId: 'atajo0' })
    expect(byDesc('REPSOL', '2026-10-16')).toMatchObject({ status: 'conciliar', matchId: 'atajo3' })
    expect(byDesc('ZARA', '2026-10-21')).toMatchObject({ status: 'conciliar', matchId: 'atajo4' })
    expect(byDesc('CAFETERIA')).toMatchObject({ status: 'dudoso' })
    // El pago de Glovo no está en el extracto: sigue pendiente
    expect(plan.some((r) => r.matchId === 'atajo5')).toBe(false)
  })
})

describe('duplicados reforzados', () => {
  it('mismo día, importe y saldo del banco aunque el concepto venga escrito distinto', () => {
    const existing = [tx({ accountId: 'a1', date: '2026-10-01', amount: -2000, description: 'RECIBO LUZ', source: 'extracto', bankBalance: 50000 })]
    const plan = planImport([{ date: '2026-10-01', amount: -2000, description: 'Recibo de la luz SA', balance: 50000, rowIndex: 0 }], 'a1', existing)
    expect(plan[0].status).toBe('duplicado')
  })
  it('avisa si el movimiento ya está en otra cuenta y lo deja fuera', () => {
    const existing = [tx({ accountId: 'otra', date: '2026-10-01', amount: -2000, description: 'RECIBO LUZ', source: 'extracto' })]
    const plan = planImport([{ date: '2026-10-01', amount: -2000, description: 'RECIBO LUZ', rowIndex: 0 }], 'a1', existing)
    expect(plan[0]).toMatchObject({ status: 'duplicado', include: false, elsewhere: 'otra' })
  })
})

describe('traspaso apuntado a mano entre dos bancos', () => {
  it('al importar los extractos de ambos lados se empareja con cada pata y no se duplica', () => {
    const out = tx({ id: 'out', accountId: 'rev', date: '2026-11-05', amount: -20200, description: 'Traspaso a Trade Republic', kind: 'transferencia', transferId: 'T1', source: 'manual' })
    const inn = tx({ id: 'in', accountId: 'tr', date: '2026-11-05', amount: 20200, description: 'Traspaso a Trade Republic', kind: 'transferencia', transferId: 'T1', source: 'manual' })
    const rev = planImport([mv('2026-11-05', -20200, 'To Trade Republic')], 'rev', [out, inn])
    expect(rev[0]).toMatchObject({ status: 'conciliar', matchId: 'out' })
    const tr = planImport([mv('2026-11-06', 20200, 'Transferencia entrante de Revolut')], 'tr', [out, inn])
    expect(tr[0]).toMatchObject({ status: 'conciliar', matchId: 'in' })
  })
})
