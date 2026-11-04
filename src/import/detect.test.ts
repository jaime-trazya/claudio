import { describe, expect, it } from 'vitest'
import { readSheet } from './readSheet'
import { applyMapping, detectColumns, findHeaderRow } from './detect'
import { decodeText } from './decode'
import { parseCSV } from './csv'
import { sample } from '../test/helpers'

describe('lector de extractos', () => {
  it('decodifica Latin-1 y UTF-8', () => {
    const latin = new Uint8Array([0x46, 0x65, 0x63, 0x68, 0x61, 0x20, 0x6f, 0x70, 0x65, 0x72, 0x61, 0x63, 0x69, 0xf3, 0x6e])
    expect(decodeText(latin)).toBe('Fecha operación')
    expect(decodeText(new TextEncoder().encode('﻿Descripción'))).toBe('Descripción')
  })

  it('respeta comillas, separador y saltos de línea en CSV', () => {
    const rows = parseCSV('a;b;c\n"x;1";"di ""hola""";3\r\n\n"multi\nlínea";2;3')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x;1', 'di "hola"', '3'],
      ['multi\nlínea', '2', '3'],
    ])
  })

  it('CSV Latin-1 con filas antes de la cabecera e importes con signo', () => {
    const rows = readSheet(sample('extracto-banco-cuenta-nomina.csv'), 'extracto-banco-cuenta-nomina.csv')
    expect(findHeaderRow(rows)).toBe(4) // la fila vacía ";" se descarta
    const det = detectColumns(rows)!
    expect(det.mapping).toMatchObject({ headerRow: 4, dateCol: 0, descCol: 2, amountCol: 3 })
    expect(det.confidence).toBeGreaterThan(0.9)
    const movs = applyMapping(rows, det.mapping)
    expect(movs).toHaveLength(39)
    const nomina = movs.find((m) => m.date === '2026-10-28')!
    expect(nomina).toMatchObject({ description: 'NOMINA EMPRESA FICTICIA SL', amount: 215000 })
    expect(movs.find((m) => m.description.includes('GIMNASIO'))!.description).toBe('RECIBO GIMNASIO BASIC FIT ESPAÑA')
  })

  it('CSV UTF-8 con columnas separadas de cargo y abono', () => {
    const rows = readSheet(sample('extracto-tarjeta-credito.csv'), 'extracto-tarjeta-credito.csv')
    const det = detectColumns(rows)!
    expect(det.mapping).toMatchObject({ headerRow: 0, dateCol: 0, descCol: 1, amountCol: null, debitCol: 2, creditCol: 3 })
    const movs = applyMapping(rows, det.mapping)
    expect(movs).toHaveLength(8)
    expect(movs[0]).toMatchObject({ date: '2026-10-02', description: 'IKEA ALFAFAR', amount: -8999 })
    expect(movs.find((m) => m.description.startsWith('DEVOLUCION'))!.amount).toBe(1500)
    expect(movs.find((m) => m.description.startsWith('MEDIA'))!.amount).toBe(-124900)
  })

  it('XLSX con filas de título, fechas de Excel e importes numéricos', () => {
    const rows = readSheet(sample('extracto-cuenta-ahorro.xlsx'), 'extracto-cuenta-ahorro.xlsx')
    const det = detectColumns(rows)!
    expect(det.mapping).toMatchObject({ dateCol: 0, descCol: 1, amountCol: 2 })
    const movs = applyMapping(rows, det.mapping)
    expect(movs.map((m) => m.date)).toEqual(['2026-10-01', '2026-10-06', '2026-10-13', '2026-10-19', '2026-10-25', '2026-10-31'])
    expect(movs[1]).toMatchObject({ description: 'Pago con tarjeta Carrefour Express', amount: -1562 })
  })

  it('archivo sin cabecera: detecta las columnas por su contenido', () => {
    const rows = readSheet(sample('extracto-sin-cabecera.txt'), 'extracto-sin-cabecera.txt')
    const det = detectColumns(rows)!
    expect(det.mapping).toMatchObject({ headerRow: -1, dateCol: 0, descCol: 1, amountCol: 2 })
    const movs = applyMapping(rows, det.mapping)
    expect(movs).toHaveLength(4)
    expect(movs[0]).toMatchObject({ date: '2026-10-03', amount: -4130 })
    expect(movs[2].amount).toBe(3500)
  })

  it('devuelve null si no encuentra columnas', () => {
    expect(detectColumns([['hola'], ['adiós']])).toBeNull()
    expect(detectColumns([])).toBeNull()
  })
})
