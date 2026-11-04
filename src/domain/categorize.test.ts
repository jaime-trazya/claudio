import { describe, expect, it } from 'vitest'
import { categorize, sortRules } from './categorize'
import { defaultCategories, defaultRules } from './defaults'
import type { Rule } from '../db/types'
import { merchantKey } from '../lib/text'

const rules = sortRules(defaultRules(0))

describe('categorización automática', () => {
  it.each([
    ['COMPRA TARJ. 4000XXXX0001 MERCADONA VALENCIA', -2345, 'cat-supermercado'],
    ['LIDL SUPERMERCADOS', -1000, 'cat-supermercado'],
    ['Pago con tarjeta Carrefour Express', -1562, 'cat-supermercado'],
    ['REPSOL E.S. AV. INVENTADA', -4520, 'cat-gasolina'],
    ['CEPSA ESTACION SERVICIO', -4790, 'cat-gasolina'],
    ['COMPRA TARJ. NETFLIX.COM', -1399, 'cat-suscripciones'],
    ['SPOTIFY P1234567', -1199, 'cat-suscripciones'],
    ['NOMINA EMPRESA FICTICIA SL', 215000, 'cat-sueldo'],
    ['Nómina octubre', 215000, 'cat-sueldo'],
    ['BIZUM ENVIADO A LUCIA PRUEBA', -1200, 'cat-bizum'],
    ['RECIBO IBERDROLA CLIENTES SAU', -5432, 'cat-luz'],
  ])('%s → %s', (desc, amount, cat) => {
    expect(categorize(desc, amount, rules, true).categoryId).toBe(cat)
  })

  it('marca Trade Republic como aportación, no como gasto', () => {
    expect(categorize('TRANSFERENCIA A TRADE REPUBLIC BANK GMBH', -20000, rules)).toMatchObject({ kind: 'aportacion', categoryId: 'cat-inversion' })
  })

  it('sin regla: tipo según el signo y sin categoría', () => {
    expect(categorize('ALGO RARO', -100, rules)).toEqual({ categoryId: null, kind: 'gasto' })
    expect(categorize('ALGO RARO', 100, rules)).toEqual({ categoryId: null, kind: 'ingreso' })
  })

  it('las reglas del usuario tienen prioridad', () => {
    const custom: Rule = { id: 'u1', keyword: 'mercadona', categoryId: 'cat-restaurantes', custom: true, createdAt: 1 }
    expect(categorize('MERCADONA', -100, [...rules, custom]).categoryId).toBe('cat-restaurantes')
  })

  it('compara palabras completas (no "dia" dentro de "media")', () => {
    expect(categorize('MEDIA MARKT', -100, rules).categoryId).toBe('cat-electronica')
  })

  it('todas las reglas apuntan a categorías existentes', () => {
    const ids = new Set(defaultCategories().map((c) => c.id))
    for (const r of rules) expect(ids.has(r.categoryId), r.keyword).toBe(true)
  })

  it('sugiere como palabra clave el comercio limpio', () => {
    expect(merchantKey('COMPRA TARJ. 4000XXXX0001 MERCADONA VALENCIA')).toBe('mercadona')
    expect(merchantKey('RECIBO VODAFONE ESPAÑA SAU')).toBe('vodafone')
    expect(merchantKey('AMAZON EU SARL')).toBe('amazon')
    expect(merchantKey('COMPRA TARJ. 4000XXXX0001 NETFLIX.COM')).toBe('netflix')
  })
})
