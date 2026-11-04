import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractPdfItems, itemsToLines } from './pdfText'
import { pdfToTables } from './pdfTable'
import { applyMapping, detectColumns } from './detect'
import { categorize } from '../domain/categorize'
import { defaultRules } from '../domain/defaults'
import { EJEMPLOS, sample } from '../test/helpers'

const expected = JSON.parse(fs.readFileSync(path.join(EJEMPLOS, 'extractos-pdf-esperado.json'), 'utf8'))
const fonts = path.resolve(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/') + '/'
const tablesOf = async (name: string) => pdfToTables(itemsToLines(await extractPdfItems(sample(name), pdfjs as never, { standardFontDataUrl: fonts })))
const cents = (n: number) => Math.round(n * 100)

describe('extractos bancarios en PDF', () => {
  it('una línea por movimiento, con columnas que se desplazan entre páginas', async () => {
    const tables = await tablesOf('extracto-pdf-una-linea.pdf')
    expect(tables).toHaveLength(1)
    const det = detectColumns(tables[0].rows)!
    expect(det.mapping).toMatchObject({ headerRow: 0, dateCol: 1, descCol: 0, amountCol: 2 })
    const movs = applyMapping(tables[0].rows, det.mapping)
    expect(movs).toHaveLength(expected.unaLinea.movements)
    expect(movs.reduce((s, m) => s + m.amount, 0)).toBe(cents(expected.unaLinea.sum))
    expect(movs[0]).toMatchObject({ date: '2026-10-31', description: 'ESTANCO EJEMPLO', amount: -1080 })
  })

  it('varias líneas por movimiento: fecha partida, tipo en dos líneas, entradas y salidas separadas', async () => {
    const tables = await tablesOf('extracto-pdf-varias-lineas.pdf')
    expect(tables).toHaveLength(1)
    expect(tables[0].rows[0]).toEqual(['FECHA', 'TIPO', 'DESCRIPCIÓN', 'ENTRADA DE DINERO', 'SALIDA DE DINERO', 'BALANCE'])
    const det = detectColumns(tables[0].rows)!
    expect(det.mapping).toMatchObject({ dateCol: 0, descCol: 2, amountCol: null, creditCol: 3, debitCol: 4 })
    const movs = applyMapping(tables[0].rows, det.mapping)
    expect(movs).toHaveLength(expected.variasLineas.movements)
    expect(movs.reduce((s, m) => s + m.amount, 0)).toBe(cents(expected.variasLineas.sum))
    expect(movs[0]).toMatchObject({ date: '2026-10-01', description: 'Apple Pay Top up', amount: 15000 })
    expect(movs[1]).toMatchObject({ date: '2026-10-02', description: 'Buy trade IE00B4L5Y983 EJEMPLO ETF WORLD, quantity: 0.512345', amount: -5000 })
    expect(movs[2]).toMatchObject({ date: '2026-10-05', description: 'CAFETERIA INVENTADA', amount: -320 })
    // Concepto escrito por encima de la fecha
    expect(movs[5]).toMatchObject({ date: '2026-10-18', description: 'Sell trade IE00B4L5Y983 EJEMPLO ETF WORLD, quantity: 0.100000', amount: 1010 })
    // El pie de página y el resumen final no se cuelan como movimientos
    expect(movs.every((m) => !/Registro|Banco depositario/.test(m.description))).toBe(true)
  })

  it('varias tablas en el mismo PDF: cuenta corriente y ahorro por separado', async () => {
    const tables = await tablesOf('extracto-pdf-varias-tablas.pdf')
    expect(tables.map((t) => t.label)).toEqual(['Cuenta personal (EUR)', 'Ahorros (EUR)'])
    const det = detectColumns(tables[0].rows)!
    expect(det.mapping).toMatchObject({ dateCol: 0, descCol: 1, amountCol: 3 })
    const movs = applyMapping(tables[0].rows, det.mapping)
    expect(movs).toHaveLength(expected.variasTablas.movements)
    expect(movs.reduce((s, m) => s + m.amount, 0)).toBe(cents(expected.variasTablas.sum))
    expect(movs[0].description).toBe('Una recarga de Apple Pay con *0000')
    // El movimiento cuyo concepto quedó en la página siguiente no se pierde
    expect(movs[5]).toMatchObject({ date: '2026-10-09', amount: 5000 })
    expect(applyMapping(tables[1].rows, detectColumns(tables[1].rows)!.mapping)).toHaveLength(expected.variasTablas.savingsRows)
  })

  it('PDF sin tablas de movimientos: no devuelve nada', async () => {
    expect(await tablesOf('trade-republic-extracto-patrimonio.pdf')).toEqual([])
  })

  it('traspasos entre cuentas propias y operaciones del bróker no cuentan como gasto', () => {
    const rules = defaultRules(0)
    expect(categorize('To Cuenta Remunerada', -6000, rules).kind).toBe('transferencia')
    expect(categorize('Una recarga de Apple Pay con *0000', 10000, rules).kind).toBe('transferencia')
    expect(categorize('Apple Pay Top up', 15000, rules).kind).toBe('transferencia')
    expect(categorize('Revolut**0000*', -24300, rules).kind).toBe('transferencia')
    expect(categorize('Buy trade IE00B4L5Y983 EJEMPLO ETF', -5000, rules).kind).toBe('aportacion')
    expect(categorize('Cash Dividend for ISIN US0000000000', 37, rules)).toMatchObject({ kind: 'ingreso', categoryId: 'cat-intereses' })
  })
})
